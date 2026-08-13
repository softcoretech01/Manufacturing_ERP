import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, GitBranch, Plus, Send, Star, Trash2, X } from 'lucide-react'
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
import { DetailBlock, EngStatusBadge } from '@/components/engineering/EngShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate } from '@/lib/format'
import { bomProblems, isLiveBom, nextDocNo, wouldCreateCycle } from '@/lib/engFlow'
import { api } from '@/lib/api'
import { items as masterItems } from '@/mock/masters'
import type { Bom, BomLine, BomType, EngProduct } from '@/types/engineering'

/**
 * Bill of materials (Ch 6 to 9).
 *
 * A BOM is never edited once it is live. Changing one raises a new revision and
 * supersedes the old, so the structure a batch was built against can still be
 * read back years later — which is the difference between a BOM and a shopping
 * list. Everything else on this screen exists to make that discipline cheap:
 * copy to a revision, compare against the previous one, approve in place.
 */

const BOM_TYPES: BomType[] = ['MANUFACTURING', 'ENGINEERING', 'PACKING', 'SALES', 'ALTERNATE', 'PHANTOM']
const BOM_TYPE_LABEL: Record<BomType, string> = {
  MANUFACTURING: 'Manufacturing',
  ENGINEERING: 'Engineering',
  PACKING: 'Packing',
  SALES: 'Sales kit',
  ALTERNATE: 'Alternate',
  PHANTOM: 'Phantom',
}

interface LineEntry {
  itemCode: string
  qtyPer: string
  scrapPct: string
  operationSeq: string
  isPhantom: boolean
  notes: string
}

interface FormState {
  code: string
  productCode: string
  bomType: BomType
  baseQty: string
  effectiveFrom: string
  isDefault: boolean
  alternateFor: string
  changeReason: string
  lines: LineEntry[]
}

const emptyForm: FormState = {
  code: '',
  productCode: '',
  bomType: 'MANUFACTURING',
  baseQty: '1',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  isDefault: true,
  alternateFor: '',
  changeReason: '',
  lines: [],
}

export function BomPage() {
  const toast = useToast()
  
  const [rows, setRows] = useState<Bom[]>([])
  const [products, setProducts] = useState<EngProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [bomData, productData] = await Promise.all([
          api.getBoms(),
          api.getEngProducts()
        ])
        setRows(bomData)
        setProducts(productData)
      } catch (err) {
        console.error('Failed to load data:', err)
        toast.error('Failed to load', 'Could not load data from the server.')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const [tab, setTab] = useState('live')
  const [detail, setDetail] = useState<Bom | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Bom | null>(null)
  /** Set when the form is building the next revision of an existing BOM. */
  const [revisingFrom, setRevisingFrom] = useState<Bom | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<Bom | null>(null)

  const counts = {
    live: rows.filter(isLiveBom).length,
    draft: rows.filter((b) => b.status === 'DRAFT' || b.status === 'PENDING_APPROVAL').length,
    alternate: rows.filter((b) => isLiveBom(b) && !b.isDefault).length,
    superseded: rows.filter((b) => b.status === 'SUPERSEDED' || b.status === 'OBSOLETE').length,
    all: rows.length,
  }

  const filtered = rows.filter((b) => {
    if (tab === 'live') return isLiveBom(b)
    if (tab === 'draft') return b.status === 'DRAFT' || b.status === 'PENDING_APPROVAL'
    if (tab === 'alternate') return isLiveBom(b) && !b.isDefault
    if (tab === 'superseded') return b.status === 'SUPERSEDED' || b.status === 'OBSOLETE'
    return true
  })

  /* ── The costed form grid ──────────────────────────────────────────── */

  const costedLines = form.lines.map((l) => {
    const item = masterItems.find((i) => i.code === l.itemCode)
    const qtyPer = Number(l.qtyPer) || 0
    const scrap = Number(l.scrapPct) || 0
    const rate = item ? item.standardCost || item.lastPurchaseRate : 0
    const effectiveQty = qtyPer * (1 + scrap / 100)
    return { entry: l, item, qtyPer, scrap, rate, effectiveQty, amount: effectiveQty * rate }
  })
  const baseQty = Math.max(1, Number(form.baseQty) || 1)
  const materialPerUnit = costedLines.reduce((s, l) => s + l.amount, 0) / baseQty

  function addLine() {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { itemCode: '', qtyPer: '', scrapPct: '0', operationSeq: '', isPhantom: false, notes: '' }],
    }))
  }
  function setLine(i: number, patch: Partial<LineEntry>) {
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  }
  function removeLine(i: number) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))
  }

  /* ── Columns ───────────────────────────────────────────────────────── */

  const columns: Column<Bom>[] = [
    { key: 'docNo', header: 'BOM', sortable: true, width: '11rem', render: (b) => <span className="font-mono text-xs font-medium text-brand-600">{b.docNo}</span> },
    { key: 'revision', header: 'Rev', align: 'right', sortable: true, width: '4.5rem', accessor: (b) => b.revision, render: (b) => <span className="font-mono text-2xs">R{b.revision}</span> },
    {
      key: 'productCode',
      header: 'Product',
      sortable: true,
      render: (b) => (
        <>
          <p className="text-xs font-medium text-fg">{b.productName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{b.productCode}</p>
        </>
      ),
    },
    { key: 'bomType', header: 'Type', sortable: true, width: '8rem', accessor: (b) => BOM_TYPE_LABEL[b.bomType], render: (b) => <span className="text-xs text-fg-muted">{BOM_TYPE_LABEL[b.bomType]}</span> },
    { key: 'lineCount', header: 'Lines', align: 'right', width: '5rem', accessor: (b) => b.lines.length },
    { key: 'baseQty', header: 'Per', align: 'right', width: '5rem', accessor: (b) => b.baseQty, render: (b) => `${b.baseQty} ${b.uom}` },
    { key: 'isDefault', header: 'Default', width: '6rem', accessor: (b) => (b.isDefault ? 'Yes' : 'No'), render: (b) => (b.isDefault ? <Badge tone="brand" size="sm">Default</Badge> : <span className="text-2xs text-fg-subtle">alternate</span>) },
    { key: 'effectiveFrom', header: 'Effective', sortable: true, width: '7.5rem', accessor: (b) => b.effectiveFrom, render: (b) => formatDate(b.effectiveFrom) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (b) => <EngStatusBadge status={b.status} size="sm" /> },
  ]

  /* ── Form open helpers ─────────────────────────────────────────────── */

  function toEntries(b: Bom): LineEntry[] {
    return b.lines.map((l) => ({
      itemCode: l.itemCode,
      qtyPer: String(l.qtyPer),
      scrapPct: String(l.scrapPct),
      operationSeq: l.operationSeq === null ? '' : String(l.operationSeq),
      isPhantom: l.isPhantom,
      notes: l.notes,
    }))
  }

  async function openCreate() {
    setEditing(null)
    setRevisingFrom(null)
    setForm({ ...emptyForm, productCode: products[0]?.code ?? '', lines: [] })
    setErrors({})
    setFormOpen(true)
    
    try {
      const { nextCode } = await api.getNextBomCode()
      setForm(prev => ({ ...prev, code: nextCode }))
    } catch (error) {
      console.error('Failed to get next BOM code', error)
    }
  }

  function openEdit(b: Bom) {
    if (isLiveBom(b)) {
      toast.error('This BOM is live', 'Live structures are not edited in place. Use "Create next revision" instead.')
      return
    }
    setEditing(b)
    setRevisingFrom(null)
    setForm({
      code: b.docNo,
      productCode: b.productCode,
      bomType: b.bomType,
      baseQty: String(b.baseQty),
      effectiveFrom: b.effectiveFrom,
      isDefault: b.isDefault,
      alternateFor: b.alternateFor,
      changeReason: b.changeReason,
      lines: toEntries(b),
    })
    setErrors({})
    setFormOpen(true)
  }

  function openRevision(b: Bom) {
    setEditing(null)
    setRevisingFrom(b)
    setForm({
      code: b.docNo,
      productCode: b.productCode,
      bomType: b.bomType,
      baseQty: String(b.baseQty),
      effectiveFrom: new Date().toISOString().slice(0, 10),
      isDefault: b.isDefault,
      alternateFor: b.alternateFor,
      changeReason: '',
      lines: toEntries(b),
    })
    setErrors({})
    setFormOpen(true)
    setDetail(null)
  }

  /* ── Validation & save ─────────────────────────────────────────────── */

  function validate() {
    const e: Record<string, string> = {}
    if (!form.productCode) e.productCode = 'Choose the product this BOM is for.'
    if (!(Number(form.baseQty) > 0)) e.baseQty = 'The base quantity must be greater than zero.'
    if (!form.effectiveFrom) e.effectiveFrom = 'An effective date is required.'
    if (revisingFrom && !form.changeReason.trim()) e.changeReason = 'A revision needs a reason — it is what the audit trail records.'

    if (!form.lines.length) e.lines = 'Add at least one component.'
    else if (form.lines.some((l) => !l.itemCode)) e.lines = 'Every row needs an item.'
    else if (form.lines.some((l) => !(Number(l.qtyPer) > 0))) e.lines = 'Every row needs a quantity greater than zero.'
    else if (new Set(form.lines.map((l) => l.itemCode)).size !== form.lines.length)
      e.lines = 'The same component appears twice — combine the quantities into one row.'
    else if (form.lines.some((l) => l.itemCode === form.productCode))
      e.lines = 'A product cannot be a component of itself.'
    else {
      // Excluding the record being replaced, so revising a BOM does not trip on itself.
      const others = rows.filter((b) => b.uid !== editing?.uid && b.uid !== revisingFrom?.uid)
      const circular = form.lines.find((l) => wouldCreateCycle(form.productCode, l.itemCode, others))
      if (circular) e.lines = `${circular.itemCode} already contains ${form.productCode} — that would make the structure circular.`
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  function buildLines(): BomLine[] {
    return costedLines.map((l, i) => ({
      uid: `boml-${Date.now().toString(36)}-${i}`,
      seq: i + 1,
      itemCode: l.item?.code ?? '',
      itemName: l.item?.name ?? '',
      uom: l.item?.baseUom ?? 'NOS',
      qtyPer: l.qtyPer,
      scrapPct: l.scrap,
      isPhantom: l.entry.isPhantom,
      operationSeq: l.entry.operationSeq ? Number(l.entry.operationSeq) : null,
      notes: l.entry.notes.trim(),
    }))
  }

  async function save(submit: boolean) {
    if (!validate()) return
    const product = products.find((p) => p.code === form.productCode)
    const common = {
      productCode: form.productCode,
      productName: product?.name ?? form.productCode,
      bomType: form.bomType,
      baseQty: Number(form.baseQty),
      uom: product?.baseUom ?? 'NOS',
      effectiveFrom: form.effectiveFrom,
      isDefault: form.isDefault,
      alternateFor: form.alternateFor.trim(),
      changeReason: form.changeReason.trim(),
      lines: buildLines(),
      status: (submit ? 'PENDING_APPROVAL' : 'DRAFT') as Bom['status'],
    }

    try {
      if (editing) {
        const updated = await api.updateBom(editing.uid, { ...common, docNo: form.code, revision: editing.revision })
        setRows(prev => prev.map(r => r.uid === updated.uid ? updated : r))
        toast.success('BOM saved', `${editing.docNo} updated${submit ? ' and sent for approval' : ''}.`)
      } else if (revisingFrom) {
        const created = await api.createBom({
          ...common,
          docNo: revisingFrom.docNo,
          revision: revisingFrom.revision + 1,
          effectiveTo: null,
          sourceEcn: null,
        })
        setRows(prev => [created, ...prev])
        toast.success(
          `Revision ${revisingFrom.revision + 1} created`,
          `${revisingFrom.docNo} R${revisingFrom.revision + 1} is a draft. Approving it supersedes R${revisingFrom.revision}.`,
        )
      } else {
        const created = await api.createBom({
          ...common,
          docNo: form.code,
          revision: 1,
          effectiveTo: null,
          sourceEcn: null,
        })
        setRows(prev => [created, ...prev])
        toast.success('BOM created', `${created.docNo} R1 saved as ${submit ? 'pending approval' : 'a draft'}.`)
      }
      setFormOpen(false)
    } catch (err) {
      console.error(err)
      toast.error('Save failed', 'Failed to save BOM to server')
    }
  }

  /* ── Approve, supersede, default ───────────────────────────────────── */

  async function approve(b: Bom) {
    const problems = bomProblems(b, rows, masterItems)
    if (problems.length) {
      toast.error('Cannot approve', problems[0])
      return
    }
    
    try {
      // The previous live revision of the same BOM number steps aside.
      const previous = rows.find((x) => x.docNo === b.docNo && x.uid !== b.uid && isLiveBom(x))
      if (previous) {
        const updatedPrev = await api.updateBom(previous.uid, { ...previous, status: 'SUPERSEDED', effectiveTo: b.effectiveFrom })
        setRows(prev => prev.map(r => r.uid === updatedPrev.uid ? updatedPrev : r))
      }
      // Only one default per product.
      if (b.isDefault) {
        const defaultPrev = rows.find((x) => x.productCode === b.productCode && x.uid !== b.uid && x.isDefault && isLiveBom(x))
        if (defaultPrev) {
          const defaultUpdated = await api.updateBom(defaultPrev.uid, { ...defaultPrev, isDefault: false })
          setRows(prev => prev.map(r => r.uid === defaultUpdated.uid ? defaultUpdated : r))
        }
      }
      
      const approved = await api.updateBom(b.uid, { ...b, status: 'ACTIVE', approvedBy: 'Meera Rajan' })
      setRows(prev => prev.map(r => r.uid === approved.uid ? approved : r))
      
      toast.success(
        'BOM approved',
        previous
          ? `${b.docNo} R${b.revision} is live; R${previous.revision} is superseded.`
          : `${b.docNo} R${b.revision} is live. Planning and costing pick it up immediately.`,
      )
      setDetail(null)
    } catch (err) {
      console.error(err)
      toast.error('Approval failed', 'Failed to approve BOM on server')
    }
  }

  async function makeDefault(b: Bom) {
    try {
      const defaultPrev = rows.find((x) => x.productCode === b.productCode && x.uid !== b.uid && x.isDefault)
      if (defaultPrev) {
        const defaultUpdated = await api.updateBom(defaultPrev.uid, { ...defaultPrev, isDefault: false })
        setRows(prev => prev.map(r => r.uid === defaultUpdated.uid ? defaultUpdated : r))
      }
      const updated = await api.updateBom(b.uid, { ...b, isDefault: true })
      setRows(prev => prev.map(r => r.uid === updated.uid ? updated : r))
      toast.success('Set as default', `MRP will now explode ${b.docNo} for ${b.productCode}.`)
    } catch (err) {
      console.error(err)
      toast.error('Operation failed', 'Failed to set BOM as default')
    }
  }

  /* ── Revision comparison for the detail pane ───────────────────────── */

  const detailPrevious = detail
    ? rows
        .filter((b) => b.docNo === detail.docNo && b.revision < detail.revision)
        .sort((a, b) => b.revision - a.revision)[0]
    : undefined

  const diff = useMemo(() => {
    if (!detail || !detailPrevious) return null
    const before = new Map(detailPrevious.lines.map((l) => [l.itemCode, l]))
    const after = new Map(detail.lines.map((l) => [l.itemCode, l]))
    const added = detail.lines.filter((l) => !before.has(l.itemCode))
    const removed = detailPrevious.lines.filter((l) => !after.has(l.itemCode))
    const changed = detail.lines
      .filter((l) => {
        const b = before.get(l.itemCode)
        return b && (b.qtyPer !== l.qtyPer || b.scrapPct !== l.scrapPct)
      })
      .map((l) => ({ line: l, was: before.get(l.itemCode)! }))
    return { added, removed, changed }
  }, [detail, detailPrevious])

  const detailProblems = detail ? bomProblems(detail, rows, masterItems) : []

  return (
    <div>
      <PageHeader
        title="Bills of material"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'BOM' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New BOM
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'live', label: 'Live', count: counts.live },
              { id: 'draft', label: 'Draft & pending', count: counts.draft },
              { id: 'alternate', label: 'Alternates', count: counts.alternate },
              { id: 'superseded', label: 'Superseded', count: counts.superseded },
              { id: 'all', label: 'All', count: counts.all },
            ]}
          />
        }
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(b) => b.uid}
        searchPlaceholder="Search BOM number, product or type…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'boms', 'Bills of material', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={setDetail}
        emptyTitle="No bills of material"
        emptyDescription="A product cannot be planned or costed until it has one."
        rowActions={(b) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(b)} />
            <MenuItem label="Edit" disabled={isLiveBom(b)} onClick={() => openEdit(b)} />
            <MenuItem label="Create next revision" icon={<Copy />} disabled={!isLiveBom(b)} onClick={() => openRevision(b)} />
            <MenuItem
              label="Submit for approval"
              icon={<Send />}
              separatorBefore
              disabled={b.status !== 'DRAFT'}
              onClick={async () => {
                try {
                  const updated = await api.updateBom(b.uid, { ...b, status: 'PENDING_APPROVAL' })
                  setRows(prev => prev.map(r => r.uid === updated.uid ? updated : r))
                  toast.success('Submitted', `${b.docNo} R${b.revision} is waiting for engineering approval.`)
                } catch (err) {
                  toast.error('Error', 'Failed to submit BOM')
                }
              }}
            />
            <MenuItem label="Approve" icon={<Check />} disabled={b.status !== 'PENDING_APPROVAL' && b.status !== 'DRAFT'} onClick={() => approve(b)} />
            <MenuItem
              label="Reject"
              icon={<X />}
              danger
              disabled={b.status !== 'PENDING_APPROVAL'}
              onClick={async () => {
                try {
                  const updated = await api.updateBom(b.uid, { ...b, status: 'REJECTED' })
                  setRows(prev => prev.map(r => r.uid === updated.uid ? updated : r))
                  toast.success('Rejected', `${b.docNo} R${b.revision} sent back to the author.`)
                } catch (err) {
                  toast.error('Error', 'Failed to reject BOM')
                }
              }}
            />
            <MenuItem label="Set as default" icon={<Star />} separatorBefore disabled={b.isDefault || !isLiveBom(b)} onClick={() => makeDefault(b)} />
            <MenuItem
              label={isLiveBom(b) ? 'Delete — blocked (live)' : 'Delete'}
              icon={<Trash2 />}
              danger
              separatorBefore
              disabled={isLiveBom(b)}
              onClick={() => setConfirmDelete(b)}
            />
          </>
        )}
      />

      {/* Detail ------------------------------------------------------------ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.docNo} · revision ${detail.revision}` : ''}
        description={detail?.productName}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                {detail.lines.length} components · created by {detail.createdBy}
                {detail.approvedBy && ` · approved by ${detail.approvedBy}`}
              </span>
              <div className="flex gap-2">
                {(detail.status === 'PENDING_APPROVAL' || detail.status === 'DRAFT') && (
                  <Button variant="success" size="sm" onClick={() => approve(detail)}>
                    Approve
                  </Button>
                )}
                {isLiveBom(detail) && (
                  <Button variant="outline" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => openRevision(detail)}>
                    Create next revision
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
              <EngStatusBadge status={detail.status} />
              <Badge tone="neutral" size="sm" dot={false}>{BOM_TYPE_LABEL[detail.bomType]}</Badge>
              {detail.isDefault ? <Badge tone="brand" size="sm">Default</Badge> : <Badge tone="neutral" size="sm">Alternate</Badge>}
            </div>

            {detailProblems.length > 0 && (
              <Alert tone="danger" title="This BOM cannot be approved yet">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {detailProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <DataGrid
              columns={2}
              items={[
                { label: 'Product', value: `${detail.productCode} — ${detail.productName}` },
                { label: 'Quantities are per', value: `${detail.baseQty} ${detail.uom}` },
                { label: 'Effective from', value: formatDate(detail.effectiveFrom) },
                { label: 'Effective to', value: detail.effectiveTo ? formatDate(detail.effectiveTo) : 'Open' },
                { label: 'Raised by', value: detail.createdBy },
                { label: 'Approved by', value: detail.approvedBy ?? 'Not approved' },
                ...(detail.alternateFor ? [{ label: 'Alternate for', value: detail.alternateFor }] : []),
                ...(detail.sourceEcn ? [{ label: 'Raised by change notice', value: detail.sourceEcn, mono: true }] : []),
              ]}
            />

            {detail.changeReason && (
              <DetailBlock title="Reason for this revision">
                <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{detail.changeReason}</p>
              </DetailBlock>
            )}

            <DetailBlock title={`Components (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '3rem' }}>#</th>
                      <th>Component</th>
                      <th className="text-right">Qty per</th>
                      <th>UoM</th>
                      <th className="text-right">Scrap</th>
                      <th className="text-right">Effective qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Value</th>
                      <th className="text-right">Op</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => {
                      const item = masterItems.find((i) => i.code === l.itemCode)
                      const rate = item ? item.standardCost || item.lastPurchaseRate : 0
                      const eff = l.qtyPer * (1 + l.scrapPct / 100)
                      return (
                        <tr key={l.uid}>
                          <td className="text-2xs text-fg-subtle">{l.seq}</td>
                          <td>
                            <p className="text-xs font-medium text-fg">
                              {l.itemName}
                              {l.isPhantom && <span className="ml-1.5 text-2xs text-fg-subtle">(phantom)</span>}
                            </p>
                            <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                            {l.notes && <p className="mt-0.5 text-2xs text-fg-muted">{l.notes}</p>}
                          </td>
                          <td className="text-right tabular">{l.qtyPer}</td>
                          <td className="text-2xs">{l.uom}</td>
                          <td className="text-right tabular text-2xs text-fg-muted">{l.scrapPct}%</td>
                          <td className="text-right tabular text-xs">{eff.toFixed(4)}</td>
                          <td className="text-right tabular text-2xs text-fg-muted">{rate ? formatAmount(rate) : '—'}</td>
                          <td className="text-right tabular text-xs font-medium">{rate ? `₹${formatAmount(eff * rate)}` : '—'}</td>
                          <td className="text-right text-2xs text-fg-muted">{l.operationSeq ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2">
                      <td colSpan={7} className="text-right text-xs font-semibold text-fg">
                        Direct material per {detail.baseQty > 1 ? `${detail.baseQty} ${detail.uom}` : detail.uom.toLowerCase()}
                      </td>
                      <td className="text-right text-sm font-semibold tabular text-fg">
                        ₹{formatAmount(
                          detail.lines.reduce((s, l) => {
                            const item = masterItems.find((i) => i.code === l.itemCode)
                            const rate = item ? item.standardCost || item.lastPurchaseRate : 0
                            return s + l.qtyPer * (1 + l.scrapPct / 100) * rate
                          }, 0),
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-1.5 text-2xs text-fg-subtle">
                Rates come from the item master. Sub-assemblies are shown at their stored standard cost here; the cost
                roll-up screen prices them from their own structures instead.
              </p>
            </DetailBlock>

            {diff && detailPrevious && (
              <DetailBlock title={`Changes against revision ${detailPrevious.revision}`}>
                {!diff.added.length && !diff.removed.length && !diff.changed.length ? (
                  <p className="text-xs text-fg-subtle">No component changes — only header fields differ.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {diff.added.map((l) => (
                      <li key={`a-${l.uid}`} className="flex gap-2">
                        <Badge tone="success" size="sm" dot={false}>Added</Badge>
                        <span className="text-fg-muted">
                          {l.itemCode} — {l.qtyPer} {l.uom} per, {l.scrapPct}% scrap
                        </span>
                      </li>
                    ))}
                    {diff.removed.map((l) => (
                      <li key={`r-${l.uid}`} className="flex gap-2">
                        <Badge tone="danger" size="sm" dot={false}>Removed</Badge>
                        <span className="text-fg-muted">
                          {l.itemCode} — was {l.qtyPer} {l.uom} per
                        </span>
                      </li>
                    ))}
                    {diff.changed.map(({ line, was }) => (
                      <li key={`c-${line.uid}`} className="flex gap-2">
                        <Badge tone="warning" size="sm" dot={false}>Changed</Badge>
                        <span className="text-fg-muted">
                          {line.itemCode} — {was.qtyPer} → {line.qtyPer} {line.uom}
                          {was.scrapPct !== line.scrapPct && `, scrap ${was.scrapPct}% → ${line.scrapPct}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailBlock>
            )}
          </div>
        )}
      </Drawer>

      {/* Create / edit / revise --------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={
          revisingFrom
            ? `${revisingFrom.docNo} — new revision ${revisingFrom.revision + 1}`
            : editing
              ? `Edit ${editing.docNo} R${editing.revision}`
              : 'New bill of material'
        }
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
        {revisingFrom && (
          <Alert tone="info" className="mb-4">
            This starts from revision {revisingFrom.revision}. When the new revision is approved, revision{' '}
            {revisingFrom.revision} is superseded and closed on the effective date below — it is not deleted, so batches
            built against it stay traceable.
          </Alert>
        )}

        <div className="grid gap-3.5 sm:grid-cols-3">
          <Input maxLength={255}
            label="BOM number"
            value={form.code}
            disabled
            placeholder="Auto-generated"
            containerClassName="sm:col-span-1"
          />
          <Select
            label="Product"
            required
            containerClassName="sm:col-span-2"
            value={form.productCode}
            error={errors.productCode}
            disabled={!!revisingFrom}
            onChange={(e) => setForm({ ...form, productCode: e.target.value })}
            options={[{ value: '', label: 'Select a product…' }, ...products.map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))]}
          />
          <Select label="BOM type" value={form.bomType} onChange={(e) => setForm({ ...form, bomType: e.target.value as BomType })} options={BOM_TYPES.map((t) => ({ value: t, label: BOM_TYPE_LABEL[t] }))} />
          <Input maxLength={255} label="Quantities are per" type="number" required value={form.baseQty} error={errors.baseQty} hint="Set 100 to enter per-hundred quantities." onChange={(e) => setForm({ ...form, baseQty: e.target.value })} />
          <Input maxLength={255} label="Effective from" type="date" required value={form.effectiveFrom} error={errors.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          <Select
            label="Use for planning"
            value={form.isDefault ? 'yes' : 'no'}
            onChange={(e) => setForm({ ...form, isDefault: e.target.value === 'yes' })}
            options={[
              { value: 'yes', label: 'Default — MRP explodes this one' },
              { value: 'no', label: 'Alternate — used on request' },
            ]}
          />
          {!form.isDefault && (
            <Input maxLength={255}
              label="Alternate for"
              containerClassName="sm:col-span-3"
              value={form.alternateFor}
              maxLength={150}
              placeholder="Export customer A — SS 316 build"
              hint="Which customer, market or configuration this structure serves."
              onChange={(e) => setForm({ ...form, alternateFor: e.target.value })}
            />
          )}
          {(revisingFrom || editing) && (
            <Textarea maxLength={1000}
              label="Reason for this revision"
              required={!!revisingFrom}
              containerClassName="sm:col-span-3"
              rows={2}
              maxLength={1000}
              value={form.changeReason}
              error={errors.changeReason}
              onChange={(e) => setForm({ ...form, changeReason: e.target.value })}
            />
          )}
        </div>

        {/* Components ------------------------------------------------------ */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Components ({form.lines.length})</p>
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={addLine}>
              Add component
            </Button>
          </div>

          {errors.lines && <Alert tone="danger" className="mb-2">{errors.lines}</Alert>}

          <div className="overflow-x-auto rounded border border-border">
            <table className="grid-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '15rem' }}>Component *</th>
                  <th className="text-right" style={{ width: '7rem' }}>Qty per *</th>
                  <th style={{ width: '4rem' }}>UoM</th>
                  <th className="text-right" style={{ width: '6rem' }}>Scrap %</th>
                  <th className="text-right" style={{ width: '7rem' }}>Effective</th>
                  <th className="text-right" style={{ width: '8rem' }}>Value</th>
                  <th className="text-right" style={{ width: '5rem' }}>Op seq</th>
                  <th style={{ width: '3rem' }} />
                </tr>
              </thead>
              <tbody>
                {costedLines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        value={l.entry.itemCode}
                        aria-label={`Component on row ${i + 1}`}
                        onChange={(e) => setLine(i, { itemCode: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">Select an item…</option>
                        {masterItems
                          .filter((it) => it.code !== form.productCode)
                          .map((it) => (
                            <option key={it.uid} value={it.code}>
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
                        value={l.entry.qtyPer}
                        aria-label={`Quantity on row ${i + 1}`}
                        onChange={(e) => setLine(i, { qtyPer: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td className="text-2xs text-fg-muted">{l.item?.baseUom ?? '—'}</td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={l.entry.scrapPct}
                        aria-label={`Scrap percent on row ${i + 1}`}
                        onChange={(e) => setLine(i, { scrapPct: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td className="text-right tabular text-2xs text-fg-muted">{l.qtyPer ? l.effectiveQty.toFixed(4) : '—'}</td>
                    <td className="text-right tabular text-xs font-medium text-fg">{l.item && l.qtyPer ? `₹${formatAmount(l.amount)}` : '—'}</td>
                    <td>
                      <input
                        type="number"
                        value={l.entry.operationSeq}
                        aria-label={`Operation sequence on row ${i + 1}`}
                        placeholder="—"
                        onChange={(e) => setLine(i, { operationSeq: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td className="text-center">
                      <button type="button" onClick={() => removeLine(i)} aria-label={`Remove row ${i + 1}`} className="text-fg-subtle hover:text-danger">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!form.lines.length && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-2xs text-fg-subtle">
                      No components yet. Use <span className="font-medium text-fg-muted">Add component</span> — the list is
                      the item master, and the rate comes with it.
                    </td>
                  </tr>
                )}
              </tbody>
              {form.lines.length > 0 && (
                <tfoot>
                  <tr className="bg-surface-2">
                    <td colSpan={5} className="text-right text-xs font-semibold text-fg">
                      Direct material per {form.baseQty} unit{Number(form.baseQty) === 1 ? '' : 's'}
                    </td>
                    <td className="text-right text-sm font-semibold tabular text-fg">
                      ₹{formatAmount(costedLines.reduce((s, l) => s + l.amount, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                  {Number(form.baseQty) !== 1 && (
                    <tr className="bg-surface-2">
                      <td colSpan={5} className="text-right text-xs text-fg-muted">Per single unit</td>
                      <td className="text-right text-xs tabular text-fg-muted">₹{formatAmount(materialPerUnit)}</td>
                      <td colSpan={2} />
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-1.5 text-2xs text-fg-subtle">
            Scrap is the process loss allowance. It is added on top of the quantity per unit and compounds through every
            level when the structure is exploded — set it from measured yield, not from a guess.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete bill of material"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmDelete) {
                  try {
                    await api.deleteBom(confirmDelete.uid)
                    setRows(prev => prev.filter(r => r.uid !== confirmDelete.uid))
                    toast.success('Deleted', `${confirmDelete.docNo} R${confirmDelete.revision} was soft-deleted.`)
                  } catch (err) {
                    toast.error('Delete failed', 'Could not delete BOM from server.')
                  }
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.docNo} R{confirmDelete?.revision} will be marked deleted, not physically removed. It is not live.
        </p>
      </Modal>

      <div className="mt-4 grid gap-2 text-xs text-fg-muted sm:grid-cols-3">
        <p className="card p-3">
          <GitBranch className="mb-1.5 h-4 w-4 text-fg-subtle" />
          <span className="font-medium text-fg">Revisions, not edits.</span> A live BOM is copied to the next revision.
          Approving the copy supersedes the old one and closes it on the effective date.
        </p>
        <p className="card p-3">
          <Star className="mb-1.5 h-4 w-4 text-fg-subtle" />
          <span className="font-medium text-fg">One default per product.</span> MRP explodes the default; alternates are
          picked deliberately, per customer or configuration.
        </p>
        <p className="card p-3">
          <Check className="mb-1.5 h-4 w-4 text-fg-subtle" />
          <span className="font-medium text-fg">Approval is checked, not assumed.</span> Duplicate components, zero
          quantities, unknown items and circular structures all block it.
        </p>
      </div>
    </div>
  )
}
