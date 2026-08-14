import { useMemo, useState } from 'react'
import { ArrowUpRight, Check, Plus, Send, Trash2, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ApprovalTrail, ChangeTypeBadge, DetailBlock, EngStatusBadge, PriorityBadge } from '@/components/engineering/EngShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate } from '@/lib/format'
import {
  CHANGE_CATEGORY_LABEL,
  analyseChange,
  applyChangeLines,
  isLiveBom,
  latestRevisionOf,
  nextDocNo,
} from '@/lib/engFlow'
import { newUid } from '@/store/data'
import { useEffect } from 'react'
import type { Item } from '@/types/master'
import type { Bom, ChangeAction, ChangeLine, EngChange, EngProduct, EngWorkCentre, Routing, Tool } from '@/types/engineering'

/**
 * Engineering change management (Ch 17).
 *
 * The reason a released BOM is never edited: a change is requested, its cost and
 * reach are worked out, it is approved, and only then is it applied. Applying it
 * is a real operation here — the change lines are executed against the BOM and
 * land as a new revision, with the old one superseded. An ECN that cannot be
 * executed is a memo, and memos are how structures and reality drift apart.
 */

const ACTIONS: ChangeAction[] = ['REPLACE', 'QTY_CHANGE', 'ADD', 'REMOVE']
const ACTION_LABEL: Record<ChangeAction, string> = {
  ADD: 'Add a component',
  REMOVE: 'Remove a component',
  REPLACE: 'Replace a component',
  QTY_CHANGE: 'Change quantity or scrap',
}
const CATEGORIES = Object.keys(CHANGE_CATEGORY_LABEL) as EngChange['category'][]
const PRIORITIES: EngChange['priority'][] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

const APPROVAL_CHAIN = [
  { level: 1, role: 'Engineering Head', approver: 'Rahul Iyer' },
  { level: 2, role: 'Quality Head', approver: 'S. Meena' },
  { level: 3, role: 'Works Head', approver: 'S. Balaji' },
]

interface LineEntry {
  bomDocNo: string
  action: ChangeAction
  itemCode: string
  newItemCode: string
  newQtyPer: string
  newScrapPct: string
  note: string
}

interface FormState {
  docNo: string
  changeType: EngChange['changeType']
  title: string
  reason: string
  category: EngChange['category']
  priority: EngChange['priority']
  productCode: string
  effectiveFrom: string
  impactNote: string
  lines: LineEntry[]
}

const emptyForm: FormState = {
  docNo: '',
  changeType: 'ECR',
  title: '',
  reason: '',
  category: 'DESIGN',
  priority: 'NORMAL',
  productCode: '',
  effectiveFrom: '',
  impactNote: '',
  lines: [],
}

const OPEN_STATES: EngChange['status'][] = ['DRAFT', 'UNDER_REVIEW', 'PENDING_APPROVAL']

export function ChangesPage() {
  const toast = useToast()
  
  const [rows, setRows] = useState<EngChange[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [products, setProducts] = useState<EngProduct[]>([])
  const [routings, setRoutings] = useState<Routing[]>([])
  const [workCentres, setWorkCentres] = useState<EngWorkCentre[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [masterItems, setMasterItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)

  async function loadData() {
    try {
      const [chgs, bs, ps, rs, wcs, ts, is] = await Promise.all([
        api.getEngChanges().catch(() => []),
        api.getBoms().catch(() => []),
        api.getEngProducts().catch(() => []),
        api.getRoutings().catch(() => []),
        api.getEngWorkCentres().catch(() => []),
        api.getEngTools().catch(() => []),
        api.getItems().catch(() => [])
      ])
      setRows(chgs)
      setBoms(bs)
      setProducts(ps)
      setRoutings(rs)
      setWorkCentres(wcs)
      setTools(ts)
      setMasterItems(is)
    } catch (err) {
      toast.error('Error', 'Failed to load live engineering data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const ctx = { boms, routings, workCentres, tools, items: masterItems, products }

  const [tab, setTab] = useState('open')
  const [detail, setDetail] = useState<EngChange | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EngChange | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<EngChange | null>(null)
  const [implementing, setImplementing] = useState<EngChange | null>(null)
  const [rejecting, setRejecting] = useState<EngChange | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const counts = {
    open: rows.filter((c) => OPEN_STATES.includes(c.status)).length,
    approved: rows.filter((c) => c.status === 'APPROVED').length,
    implemented: rows.filter((c) => c.status === 'IMPLEMENTED').length,
    closed: rows.filter((c) => c.status === 'REJECTED' || c.status === 'CANCELLED').length,
    all: rows.length,
  }

  const filtered = rows.filter((c) => {
    if (tab === 'open') return OPEN_STATES.includes(c.status)
    if (tab === 'approved') return c.status === 'APPROVED'
    if (tab === 'implemented') return c.status === 'IMPLEMENTED'
    if (tab === 'closed') return c.status === 'REJECTED' || c.status === 'CANCELLED'
    return true
  })

  const columns: Column<EngChange>[] = [
    { key: 'docNo', header: 'Change', sortable: true, width: '11rem', render: (c) => <span className="font-mono text-xs font-medium text-brand-600">{c.docNo}</span> },
    { key: 'changeType', header: 'Type', width: '5rem', render: (c) => <ChangeTypeBadge type={c.changeType} /> },
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      render: (c) => (
        <>
          <p className="text-xs font-medium text-fg">{c.title}</p>
          <p className="font-mono text-2xs text-fg-subtle">{c.productCode}</p>
        </>
      ),
    },
    { key: 'category', header: 'Category', sortable: true, width: '10rem', accessor: (c) => CHANGE_CATEGORY_LABEL[c.category], render: (c) => <span className="text-xs text-fg-muted">{CHANGE_CATEGORY_LABEL[c.category]}</span> },
    { key: 'priority', header: 'Priority', width: '6rem', render: (c) => <PriorityBadge priority={c.priority} /> },
    { key: 'requestedBy', header: 'Raised by', sortable: true, width: '9rem' },
    { key: 'requestedOn', header: 'Raised', sortable: true, width: '7.5rem', accessor: (c) => c.requestedOn, render: (c) => formatDate(c.requestedOn) },
    { key: 'lineCount', header: 'Changes', align: 'right', width: '6rem', accessor: (c) => c.changeLines.length },
    { key: 'effectiveFrom', header: 'Effective', sortable: true, width: '7.5rem', accessor: (c) => c.effectiveFrom, render: (c) => formatDate(c.effectiveFrom) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (c) => <EngStatusBadge status={c.status} size="sm" /> },
  ]

  /* ── Form ──────────────────────────────────────────────────────────── */

  const liveBoms = boms.filter(isLiveBom)

  function addLine() {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { bomDocNo: '', action: 'QTY_CHANGE', itemCode: '', newItemCode: '', newQtyPer: '', newScrapPct: '0', note: '' }],
    }))
  }
  function setLine(i: number, patch: Partial<LineEntry>) {
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  }
  function removeLine(i: number) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))
  }

  /** Components currently on the BOM chosen for a change line. */
  function componentsOf(docNo: string) {
    const bom = latestRevisionOf(docNo, boms)
    return bom?.lines ?? []
  }

  async function openCreate() {
    setEditing(null)
    try {
      const docNo = await api.getNextEngChangeCode('ECR')
      setForm({ ...emptyForm, docNo, productCode: products[0]?.code ?? '', effectiveFrom: new Date().toISOString().slice(0, 10) })
    } catch (e) {
      setForm({ ...emptyForm, productCode: products[0]?.code ?? '', effectiveFrom: new Date().toISOString().slice(0, 10) })
    }
    setErrors({})
    setFormOpen(true)
  }
  
  async function handleChangeType(val: string) {
    const type = val as EngChange['changeType']
    try {
      const docNo = await api.getNextEngChangeCode(type)
      setForm({ ...form, changeType: type, docNo })
    } catch (e) {
      setForm({ ...form, changeType: type })
    }
  }

  function openEdit(c: EngChange) {
    if (!OPEN_STATES.includes(c.status)) {
      toast.error('Cannot edit', 'Only a change that is still open can be edited.')
      return
    }
    setEditing(c)
    setForm({
      docNo: c.docNo,
      changeType: c.changeType,
      title: c.title,
      reason: c.reason,
      category: c.category,
      priority: c.priority,
      productCode: c.productCode,
      effectiveFrom: c.effectiveFrom,
      impactNote: c.impactNote,
      lines: c.changeLines.map((l) => ({
        bomDocNo: l.bomDocNo,
        action: l.action,
        itemCode: l.itemCode,
        newItemCode: l.newItemCode,
        newQtyPer: String(l.newQtyPer || ''),
        newScrapPct: String(l.newScrapPct ?? 0),
        note: l.note,
      })),
    })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'A title is required.'
    if (form.reason.trim().length < 15) e.reason = 'Give a reason of at least 15 characters — approvers read it.'
    if (!form.productCode) e.productCode = 'Choose the product affected.'
    if (!form.effectiveFrom) e.effectiveFrom = 'An effective date is required.'

    if (!form.lines.length) e.lines = 'Add at least one change instruction — an ECN with none cannot be applied.'
    else {
      for (const [i, l] of form.lines.entries()) {
        const n = i + 1
        if (!l.bomDocNo) { e.lines = `Row ${n}: choose the BOM to change.`; break }
        if (!l.itemCode) { e.lines = `Row ${n}: choose the component.`; break }
        if (l.action === 'REPLACE' && !l.newItemCode) { e.lines = `Row ${n}: choose the replacement component.`; break }
        if (l.action === 'REPLACE' && l.newItemCode === l.itemCode) { e.lines = `Row ${n}: the replacement is the same component.`; break }
        if ((l.action === 'ADD' || l.action === 'QTY_CHANGE') && !(Number(l.newQtyPer) > 0)) {
          e.lines = `Row ${n}: enter a new quantity greater than zero.`
          break
        }
        const onBom = componentsOf(l.bomDocNo).some((c) => c.itemCode === l.itemCode)
        if (l.action !== 'ADD' && !onBom) { e.lines = `Row ${n}: ${l.itemCode} is not on ${l.bomDocNo}.`; break }
        if (l.action === 'ADD' && onBom) { e.lines = `Row ${n}: ${l.itemCode} is already on ${l.bomDocNo}.`; break }
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function buildLines(): ChangeLine[] {
    return form.lines.map((l, i) => {
      const item = masterItems.find((it) => it.code === l.itemCode)
      const newItem = masterItems.find((it) => it.code === l.newItemCode)
      return {
        uid: `chl-${Date.now().toString(36)}-${i}`,
        bomDocNo: l.bomDocNo,
        action: l.action,
        itemCode: l.itemCode,
        itemName: item?.name ?? l.itemCode,
        newItemCode: l.newItemCode,
        newItemName: newItem?.name ?? '',
        newQtyPer: Number(l.newQtyPer) || 0,
        newScrapPct: Number(l.newScrapPct) || 0,
        note: l.note.trim(),
      }
    })
  }

  async function save(submit: boolean) {
    if (!validate()) return
    const product = products.find((p) => p.code === form.productCode)
    const common = {
      changeType: form.changeType,
      title: form.title.trim(),
      reason: form.reason.trim(),
      category: form.category,
      priority: form.priority,
      productCode: form.productCode,
      productName: product?.name ?? form.productCode,
      changeLines: buildLines(),
      impactNote: form.impactNote.trim(),
      effectiveFrom: form.effectiveFrom,
      status: (submit ? (form.changeType === 'ECN' ? 'PENDING_APPROVAL' : 'UNDER_REVIEW') : 'DRAFT') as EngChange['status'],
      approvals: submit && form.changeType === 'ECN' ? APPROVAL_CHAIN.map((a) => ({ ...a, status: 'PENDING' as const })) : [],
    }

    try {
      if (editing) {
        await api.updateEngChange(editing.uid, { ...editing, ...common, version: editing.version + 1 })
        toast.success('Change saved', `${editing.docNo} updated.`)
      } else {
        const payload: Omit<EngChange, 'uid'> = {
          ...common,
          docNo: form.docNo,
          requestedBy: 'Rahul Iyer',
          requestedOn: new Date().toISOString().slice(0, 10),
          sourceEcr: null,
          resultingBom: null,
          createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          version: 1,
        }
        await api.createEngChange(payload)
        toast.success(`${form.changeType} raised`, `${form.docNo} created${submit ? ' and sent for review' : ' as a draft'}.`)
      }
      setFormOpen(false)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to save engineering change')
    }
  }

  /* ── Promote, approve, implement ───────────────────────────────────── */

  /** An ECR becomes an ECN once the technical review is done. */
  async function promote(c: EngChange) {
    try {
      const docNo = await api.getNextEngChangeCode('ECN')
      await api.createEngChange({
        ...c,
        docNo,
        changeType: 'ECN',
        status: 'PENDING_APPROVAL',
        sourceEcr: c.docNo,
        approvals: APPROVAL_CHAIN.map((a) => ({ ...a, status: 'PENDING' as const })),
        createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        version: 1,
      } as any)
      await api.updateEngChange(c.uid, { ...c, status: 'CANCELLED' })
      toast.success('Promoted to a change notice', `${docNo} raised from ${c.docNo} and sent for approval.`)
      setDetail(null)
      loadData()
    } catch (e) {
      toast.error('Error', 'Failed to promote to ECN')
    }
  }

  function approveLevel(c: EngChange) {
    const next = c.approvals.find((a) => a.status === 'PENDING')
    if (!next) return
    const approvals = c.approvals.map((a) =>
      a.level === next.level ? { ...a, status: 'APPROVED' as const, actedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') } : a,
    )
    const allDone = approvals.every((a) => a.status === 'APPROVED')
    api.updateEngChange(c.uid, { ...c, approvals, status: allDone ? 'APPROVED' : 'PENDING_APPROVAL' }).then(() => {
      toast.success(
        allDone ? 'Fully approved' : `Level ${next.level} approved`,
        allDone ? `${c.docNo} can now be implemented against the BOM.` : `${c.docNo} moves to level ${next.level + 1}.`,
      )
      setDetail(allDone ? null : { ...c, approvals, status: allDone ? 'APPROVED' : 'PENDING_APPROVAL' })
      loadData()
    }).catch(() => toast.error('Error', 'Failed to approve'))
  }

  function reject(c: EngChange) {
    if (!rejectNote.trim()) {
      toast.error('A reason is required', 'Say what has to change before this can be approved.')
      return
    }
    const next = c.approvals.find((a) => a.status === 'PENDING')
    const approvals = next
      ? c.approvals.map((a) => (a.level === next.level ? { ...a, status: 'REJECTED' as const, actedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), remarks: rejectNote.trim() } : a))
      : c.approvals
    api.updateEngChange(c.uid, { ...c, approvals, status: 'REJECTED' }).then(() => {
      toast.success('Rejected', `${c.docNo} sent back to ${c.requestedBy}.`)
      setRejecting(null)
      setRejectNote('')
      setDetail(null)
      loadData()
    }).catch(() => toast.error('Error', 'Failed to reject'))
  }

  /**
   * Executes the change. Each affected BOM gets a new revision built from the
   * change lines; the revision it came from is superseded and closed on the
   * effective date, so nothing that was already built loses its structure.
   */
  async function implement(c: EngChange) {
    const byDoc = new Map<string, ChangeLine[]>()
    for (const l of c.changeLines) byDoc.set(l.bomDocNo, [...(byDoc.get(l.bomDocNo) ?? []), l])

    const produced: string[] = []
    const warnings: string[] = []

    for (const [docNo, lines] of byDoc) {
      const baseBom = latestRevisionOf(docNo, boms)
      if (!baseBom) {
        warnings.push(`${docNo} no longer exists.`)
        continue
      }
      const revised = applyChangeLines(baseBom, lines, warnings)
      await api.createBom({
        ...revised,
        status: 'ACTIVE',
        effectiveFrom: c.effectiveFrom,
        effectiveTo: null,
        createdBy: c.requestedBy,
        createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        approvedBy: 'Meera Rajan',
        approvedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        sourceEcn: c.docNo,
        changeReason: c.title,
      } as any)
      await api.updateBom(baseBom.uid, { status: 'SUPERSEDED', effectiveTo: c.effectiveFrom })
      produced.push(`${docNo} R${revised.revision}`)
    }

    await api.updateEngChange(c.uid, { ...c, status: 'IMPLEMENTED', resultingBom: produced.join(', ') || null })
    if (warnings.length) {
      toast.error('Implemented with warnings', warnings[0])
    } else {
      toast.success('Change implemented', `${produced.join(', ')} is live. Costing and planning pick it up immediately.`)
    }
    setImplementing(null)
    setDetail(null)
    loadData()
  }

  /* ── Impact analysis for the open change ───────────────────────────── */

  const impact = useMemo(
    () => (detail && detail.changeLines.length ? analyseChange(detail, ctx) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail, boms, routings, workCentres, tools, products],
  )

  const implementImpact = useMemo(
    () => (implementing ? analyseChange(implementing, ctx) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [implementing, boms, routings, workCentres, tools, products],
  )

  return (
    <div>
      <PageHeader
        title="Engineering changes"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Changes' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Raise a change
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: counts.open },
              { id: 'approved', label: 'Approved, not applied', count: counts.approved },
              { id: 'implemented', label: 'Implemented', count: counts.implemented },
              { id: 'closed', label: 'Rejected & cancelled', count: counts.closed },
              { id: 'all', label: 'All', count: counts.all },
            ]}
          />
        }
      />

      {counts.approved > 0 && tab === 'open' && (
        <Alert tone="warning" className="mb-4">
          {counts.approved} approved {counts.approved === 1 ? 'change is' : 'changes are'} waiting to be applied to a BOM.
          Until they are, production is still building to the old structure.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(c) => c.uid}
        searchPlaceholder="Search number, title, product or requester…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'engineering-changes', 'Engineering changes', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={setDetail}
        emptyTitle="No engineering changes"
        emptyDescription="Raise a request to alter a released structure."
        rowActions={(c) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(c)} />
            <MenuItem label="Edit" disabled={!OPEN_STATES.includes(c.status)} onClick={() => openEdit(c)} />
            <MenuItem
              label="Submit for review"
              icon={<Send />}
              separatorBefore
              disabled={c.status !== 'DRAFT'}
              onClick={() => {
                api.updateEngChange(c.uid, {
                  ...c,
                  status: c.changeType === 'ECN' ? 'PENDING_APPROVAL' : 'UNDER_REVIEW',
                  approvals: c.changeType === 'ECN' ? APPROVAL_CHAIN.map((a) => ({ ...a, status: 'PENDING' as const })) : [],
                }).then(() => {
                  toast.success('Submitted', `${c.docNo} sent for review.`)
                  loadData()
                })
              }}
            />
            <MenuItem label="Promote to change notice" icon={<ArrowUpRight />} disabled={c.changeType !== 'ECR' || c.status !== 'UNDER_REVIEW'} onClick={() => promote(c)} />
            <MenuItem label="Approve this level" icon={<Check />} disabled={c.status !== 'PENDING_APPROVAL'} onClick={() => approveLevel(c)} />
            <MenuItem label="Reject" icon={<X />} danger disabled={c.status !== 'PENDING_APPROVAL' && c.status !== 'UNDER_REVIEW'} onClick={() => { setRejectNote(''); setRejecting(c) }} />
            <MenuItem label="Apply to the BOM" icon={<Zap />} separatorBefore disabled={c.status !== 'APPROVED'} onClick={() => setImplementing(c)} />
            <MenuItem
              label={c.status === 'IMPLEMENTED' ? 'Delete — blocked (implemented)' : 'Delete'}
              icon={<Trash2 />}
              danger
              separatorBefore
              disabled={c.status === 'IMPLEMENTED'}
              onClick={async () => {
                if(confirm('Are you sure you want to delete this change?')) {
                  await api.deleteEngChange(c.uid)
                  toast.success('Deleted', `${c.docNo} has been deleted.`)
                  loadData()
                }
              }}
            />
          </>
        )}
      />

      {/* Detail ------------------------------------------------------------ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail?.title}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                Raised by {detail.requestedBy} on {formatDate(detail.requestedOn)}
              </span>
              <div className="flex gap-2">
                {detail.status === 'UNDER_REVIEW' && detail.changeType === 'ECR' && (
                  <Button variant="primary" size="sm" icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => promote(detail)}>
                    Promote to ECN
                  </Button>
                )}
                {detail.status === 'PENDING_APPROVAL' && (
                  <>
                    <Button variant="danger" size="sm" onClick={() => { setRejectNote(''); setRejecting(detail) }}>
                      Reject
                    </Button>
                    <Button variant="success" size="sm" onClick={() => approveLevel(detail)}>
                      Approve level {detail.approvals.find((a) => a.status === 'PENDING')?.level ?? ''}
                    </Button>
                  </>
                )}
                {detail.status === 'APPROVED' && (
                  <Button variant="primary" size="sm" icon={<Zap className="h-3.5 w-3.5" />} onClick={() => setImplementing(detail)}>
                    Apply to the BOM
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ChangeTypeBadge type={detail.changeType} />
              <EngStatusBadge status={detail.status} />
              <PriorityBadge priority={detail.priority} />
              <span className="text-2xs text-fg-muted">{CHANGE_CATEGORY_LABEL[detail.category]}</span>
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Product', value: `${detail.productCode} — ${detail.productName}` },
                { label: 'Effective from', value: formatDate(detail.effectiveFrom) },
                { label: 'Raised by', value: detail.requestedBy },
                { label: 'Raised on', value: formatDate(detail.requestedOn) },
                ...(detail.sourceEcr ? [{ label: 'Raised from', value: detail.sourceEcr, mono: true }] : []),
                ...(detail.resultingBom ? [{ label: 'Produced', value: detail.resultingBom, mono: true }] : []),
              ]}
            />

            <DetailBlock title="Reason for the change">
              <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{detail.reason}</p>
            </DetailBlock>

            <DetailBlock title={`Change instructions (${detail.changeLines.length})`}>
              {!detail.changeLines.length ? (
                <Alert tone="warning">
                  This change carries no instructions, so it cannot be applied. It records a decision only.
                </Alert>
              ) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th style={{ width: '10rem' }}>BOM</th>
                        <th style={{ width: '9rem' }}>Action</th>
                        <th>Component</th>
                        <th className="text-right" style={{ width: '8rem' }}>New qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.changeLines.map((l) => (
                        <tr key={l.uid}>
                          <td className="font-mono text-2xs text-fg-muted">{l.bomDocNo}</td>
                          <td>
                            <Badge tone={l.action === 'REMOVE' ? 'danger' : l.action === 'ADD' ? 'success' : 'warning'} size="sm" dot={false}>
                              {ACTION_LABEL[l.action]}
                            </Badge>
                          </td>
                          <td>
                            <p className="text-xs font-medium text-fg">{l.itemName}</p>
                            <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                            {l.action === 'REPLACE' && (
                              <p className="mt-1 text-2xs text-fg-muted">
                                → <span className="font-mono">{l.newItemCode}</span> {l.newItemName}
                              </p>
                            )}
                            {l.note && <p className="mt-0.5 text-2xs italic text-fg-subtle">{l.note}</p>}
                          </td>
                          <td className="text-right tabular text-xs">
                            {l.action === 'REMOVE' ? '—' : l.newQtyPer || '—'}
                            {l.action !== 'REMOVE' && l.newScrapPct > 0 && (
                              <span className="block text-2xs text-fg-subtle">{l.newScrapPct}% scrap</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DetailBlock>

            {impact && detail.status !== 'IMPLEMENTED' && (
              <DetailBlock title="Impact analysis">
                <div className="rounded border border-border">
                  <div className="grid gap-x-8 gap-y-1 border-b border-border p-3 sm:grid-cols-2">
                    <div className="flex items-baseline justify-between gap-4 py-1">
                      <span className="text-xs text-fg-muted">Cost today</span>
                      <span className="text-sm tabular text-fg">₹{formatAmount(impact.costBefore)}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 py-1">
                      <span className="text-xs text-fg-muted">Cost after the change</span>
                      <span className="text-sm tabular text-fg">₹{formatAmount(impact.costAfter)}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 py-1 sm:col-span-2">
                      <span className="text-xs font-medium text-fg">Difference per unit</span>
                      <span className={`text-sm font-semibold tabular ${impact.costDelta > 0 ? 'text-danger' : impact.costDelta < 0 ? 'text-success' : 'text-fg'}`}>
                        {impact.costDelta > 0 ? '+' : ''}₹{formatAmount(impact.costDelta)}
                        {impact.costBefore > 0 && ` (${impact.costDelta > 0 ? '+' : ''}${impact.costDeltaPct.toFixed(1)}%)`}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 text-xs text-fg-muted">
                    <p>
                      <span className="font-medium text-fg">Bills of material touched:</span>{' '}
                      {impact.affectedBoms.join(', ') || 'none'}
                    </p>
                    <p className="mt-1">
                      <span className="font-medium text-fg">Products affected:</span>{' '}
                      {impact.affectedProducts.length ? impact.affectedProducts.map((p) => p.code).join(', ') : 'none'}
                    </p>
                  </div>
                </div>
                {impact.warnings.length > 0 && (
                  <Alert tone="warning" className="mt-2">
                    {impact.warnings[0]}
                  </Alert>
                )}
              </DetailBlock>
            )}

            {detail.impactNote && (
              <DetailBlock title="Engineering assessment">
                <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{detail.impactNote}</p>
              </DetailBlock>
            )}

            <DetailBlock title="Approval trail">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>
          </div>
        )}
      </Drawer>

      {/* Create / edit ------------------------------------------------------ */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.docNo}` : 'Raise an engineering change'}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => save(false)}>
              Save draft
            </Button>
            <Button variant="primary" onClick={() => save(true)}>
              Save and submit
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-4">
          <Input maxLength={255} 
            label="Change Code" 
            value={form.docNo} 
            disabled 
            hint="Auto-generated" 
          />
          <Select
            label="Raise as"
            value={form.changeType}
            disabled={!!editing}
            onChange={(e) => handleChangeType(e.target.value)}
            options={[
              { value: 'ECR', label: 'ECR — request, to be reviewed' },
              { value: 'ECN', label: 'ECN — notice, straight to approval' },
            ]}
          />
          <Input label="Title" required containerClassName="sm:col-span-3" value={form.title} error={errors.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Select
            label="Product"
            required
            containerClassName="sm:col-span-2"
            value={form.productCode}
            error={errors.productCode}
            onChange={(e) => setForm({ ...form, productCode: e.target.value })}
            options={[{ value: '', label: 'Select a product…' }, ...products.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))]}
          />
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as EngChange['category'] })} options={CATEGORIES.map((c) => ({ value: c, label: CHANGE_CATEGORY_LABEL[c] }))} />
          <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as EngChange['priority'] })} options={PRIORITIES.map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }))} />
          <Textarea
            label="Reason for the change"
            required
            containerClassName="sm:col-span-3"
            rows={3}
            value={form.reason}
            error={errors.reason}
            maxLength={2000}
            hint="Why the current structure is wrong. Every approver reads this."
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
          <Input maxLength={255} label="Effective from" type="date" required value={form.effectiveFrom} error={errors.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          <Textarea
            label="Engineering assessment"
            containerClassName="sm:col-span-4"
            rows={2}
            value={form.impactNote}
            maxLength={2000}
            hint="Tooling, drawing, quality and stock consequences that the cost figure does not capture."
            onChange={(e) => setForm({ ...form, impactNote: e.target.value })}
          />
        </div>

        {/* Change instructions --------------------------------------------- */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Change instructions ({form.lines.length})</p>
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={addLine}>
              Add instruction
            </Button>
          </div>

          {errors.lines && <Alert tone="danger" className="mb-2">{errors.lines}</Alert>}

          <div className="overflow-x-auto rounded border border-border">
            <table className="grid-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '11rem' }}>BOM *</th>
                  <th style={{ minWidth: '10rem' }}>Action *</th>
                  <th style={{ minWidth: '13rem' }}>Component *</th>
                  <th style={{ minWidth: '13rem' }}>Replacement</th>
                  <th className="text-right" style={{ width: '7rem' }}>New qty</th>
                  <th className="text-right" style={{ width: '6rem' }}>Scrap %</th>
                  <th style={{ width: '3rem' }} />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((l, i) => {
                  const components = componentsOf(l.bomDocNo)
                  return (
                    <tr key={i}>
                      <td>
                        <select
                          value={l.bomDocNo}
                          aria-label={`BOM on row ${i + 1}`}
                          onChange={(e) => setLine(i, { bomDocNo: e.target.value, itemCode: '' })}
                          className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none"
                        >
                          <option value="">Select…</option>
                          {liveBoms.map((b) => (
                            <option key={b.uid} value={b.docNo}>
                              {b.docNo} — {b.productCode}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={l.action}
                          aria-label={`Action on row ${i + 1}`}
                          onChange={(e) => setLine(i, { action: e.target.value as ChangeAction, itemCode: '' })}
                          className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none"
                        >
                          {ACTIONS.map((a) => (
                            <option key={a} value={a}>
                              {ACTION_LABEL[a]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={l.itemCode}
                          aria-label={`Component on row ${i + 1}`}
                          disabled={!l.bomDocNo}
                          onChange={(e) => setLine(i, { itemCode: e.target.value })}
                          className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none disabled:bg-surface-3"
                        >
                          <option value="">Select…</option>
                          {/* Adding picks from the item master; the rest pick from what is on the BOM. */}
                          {(l.action === 'ADD'
                            ? masterItems.filter((it) => !components.some((c) => c.itemCode === it.code)).map((it) => ({ code: it.code, name: it.name }))
                            : components.map((c) => ({ code: c.itemCode, name: c.itemName }))
                          ).map((o) => (
                            <option key={o.code} value={o.code}>
                              {o.code} — {o.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={l.newItemCode}
                          aria-label={`Replacement on row ${i + 1}`}
                          disabled={l.action !== 'REPLACE'}
                          onChange={(e) => setLine(i, { newItemCode: e.target.value })}
                          className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none disabled:bg-surface-3"
                        >
                          <option value="">{l.action === 'REPLACE' ? 'Select…' : 'n/a'}</option>
                          {masterItems.map((it) => (
                            <option key={it.code} value={it.code}>
                              {it.code} — {it.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          value={l.newQtyPer}
                          aria-label={`New quantity on row ${i + 1}`}
                          disabled={l.action === 'REMOVE'}
                          onChange={(e) => setLine(i, { newQtyPer: e.target.value })}
                          className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none disabled:bg-surface-3"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          value={l.newScrapPct}
                          aria-label={`New scrap percent on row ${i + 1}`}
                          disabled={l.action === 'REMOVE'}
                          onChange={(e) => setLine(i, { newScrapPct: e.target.value })}
                          className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none disabled:bg-surface-3"
                        />
                      </td>
                      <td className="text-center">
                        <button type="button" onClick={() => removeLine(i)} aria-label={`Remove row ${i + 1}`} className="text-fg-subtle hover:text-danger">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {!form.lines.length && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-2xs text-fg-subtle">
                      No instructions yet. These are executed against the BOM when the change is approved — write them
                      precisely enough that no one has to interpret them later.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Implement confirmation --------------------------------------------- */}
      <Modal
        open={!!implementing}
        onClose={() => setImplementing(null)}
        title="Apply this change to the bill of material?"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setImplementing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => implementing && implement(implementing)}>
              Apply and create the new revision
            </Button>
          </>
        }
      >
        {implementing && (
          <div className="space-y-3 text-sm text-fg-muted">
            <p>
              <span className="font-medium text-fg">{implementing.docNo}</span> — {implementing.title}
            </p>
            <p className="text-xs">
              A new revision of {[...new Set(implementing.changeLines.map((l) => l.bomDocNo))].join(', ')} will be created
              and made live from {formatDate(implementing.effectiveFrom)}. The revision it replaces is superseded, not
              deleted, so batches already built keep their structure.
            </p>
            {implementImpact && (
              <div className="rounded border border-border bg-surface-2 p-3 text-xs">
                <p className="flex justify-between gap-4">
                  <span>Cost per unit today</span>
                  <span className="tabular text-fg">₹{formatAmount(implementImpact.costBefore)}</span>
                </p>
                <p className="mt-1 flex justify-between gap-4">
                  <span>After this change</span>
                  <span className="tabular text-fg">₹{formatAmount(implementImpact.costAfter)}</span>
                </p>
                <p className={`mt-1 flex justify-between gap-4 font-medium ${implementImpact.costDelta > 0 ? 'text-danger' : 'text-success'}`}>
                  <span>Difference</span>
                  <span className="tabular">
                    {implementImpact.costDelta > 0 ? '+' : ''}₹{formatAmount(implementImpact.costDelta)}
                    {implementImpact.costBefore > 0 && ` (${implementImpact.costDeltaPct.toFixed(1)}%)`}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Reject -------------------------------------------------------------- */}
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject this change?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => rejecting && reject(rejecting)}>
              Reject and send back
            </Button>
          </>
        }
      >
        {rejecting && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">{rejecting.docNo}</span> goes back to {rejecting.requestedBy} with your
              reason.
            </p>
            <Textarea maxLength={1000}
              label="Reason"
              required
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="What has to change before this can be approved."
            />
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete change"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  toast.success('Deleted', `${confirmDelete.docNo} was soft-deleted.`)
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">{confirmDelete?.docNo} will be marked deleted, not physically removed.</p>
      </Modal>
    </div>
  )
}
