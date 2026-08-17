import { useState, useEffect } from 'react'
import { ArrowRight, Plus, Shield, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DetailBlock, DueChip, NcrStatusBadge, SeverityBadge, useQualityData } from '@/components/quality/QmsShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate, formatQty } from '@/lib/format'
import { CAUSE_CATEGORIES, CAUSE_LABEL, NCR_FLOW, NCR_STATUS_LABEL, ncrStepBlockers, overdueDays } from '@/lib/qmsFlow'
import { newUid } from '@/store/data'
import { ncrsApi } from '@/api/ncrs'
import type { CauseCategory, DefectSeverity, Ncr, NcrSource, WhyStep } from '@/types/quality'

/**
 * Non-conformance (Ch 13 and 15).
 *
 * The workflow is the point: contain, investigate, find the cause, act, verify,
 * close. Each step is gated on the one before it — you cannot record a root
 * cause before the bad material is stopped, and you cannot close without a
 * CAPA. A five-why that stops after two rungs is usually still describing the
 * symptom, so three answered rungs are required before the cause is accepted.
 */

const SOURCES: NcrSource[] = ['SUPPLIER', 'PRODUCTION', 'CUSTOMER_RETURN', 'PROCESS_DEVIATION', 'AUDIT_FINDING']
const SOURCE_LABEL: Record<NcrSource, string> = {
  SUPPLIER: 'Supplier',
  PRODUCTION: 'Production',
  CUSTOMER_RETURN: 'Customer return',
  PROCESS_DEVIATION: 'Process deviation',
  AUDIT_FINDING: 'Audit finding',
}
const OPEN: Ncr['status'][] = ['OPEN', 'CONTAINED', 'UNDER_INVESTIGATION', 'ROOT_CAUSE_IDENTIFIED', 'CORRECTIVE_ACTION', 'VERIFICATION']

const emptyWhys = (): WhyStep[] => Array.from({ length: 5 }, (_, i) => ({ level: i + 1, question: '', answer: '' }))

interface FormState {
  source: NcrSource
  severity: DefectSeverity
  title: string
  description: string
  itemCode: string
  batchNo: string
  originDocNo: string
  supplierCode: string
  quantityAffected: string
  quantityScrapped: string
  quantityReworked: string
  owner: string
  dueOn: string
}

export function NcrPage() {
  const toast = useToast()
  const { capas, defects, inspections } = useQualityData()
  const [rows, setRows] = useState<Ncr[]>([])

  
  const updateWrapper = async (id: number | undefined, patch: any) => {
    if (!id) return;
    try {
      await ncrsApi.update(id, patch);
      fetchNcrs();
    } catch (e: any) {
      toast.error('Error', e.message || 'Update failed');
    }
  }

  const fetchNcrs = async () => {
    try {
      const data = await ncrsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch NCRs')
    }
  }

  useEffect(() => {
    fetchNcrs()
  }, [])

  const [tab, setTab] = useState('open')
  const [detail, setDetail] = useState<Ncr | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Ncr | null>(null)
  const [form, setForm] = useState<FormState>({
    source: 'PRODUCTION', severity: 'MAJOR', title: '', description: '', itemCode: '', batchNo: '',
    originDocNo: '', supplierCode: '', quantityAffected: '', quantityScrapped: '0', quantityReworked: '0',
    owner: '', dueOn: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<Ncr | null>(null)
  const [moving, setMoving] = useState<{ ncr: Ncr; to: Ncr['status'] } | null>(null)

  const live = detail ? rows.find((r) => r.uid === detail.uid) ?? detail : null

  const counts = {
    open: rows.filter((n) => OPEN.includes(n.status)).length,
    overdue: rows.filter((n) => OPEN.includes(n.status) && overdueDays(n.dueOn, n.closedOn) > 0).length,
    critical: rows.filter((n) => OPEN.includes(n.status) && n.severity === 'CRITICAL').length,
    closed: rows.filter((n) => n.status === 'CLOSED' || n.status === 'CANCELLED').length,
    all: rows.length,
  }

  const filtered = rows.filter((n) => {
    if (tab === 'open') return OPEN.includes(n.status)
    if (tab === 'overdue') return OPEN.includes(n.status) && overdueDays(n.dueOn, n.closedOn) > 0
    if (tab === 'critical') return OPEN.includes(n.status) && n.severity === 'CRITICAL'
    if (tab === 'closed') return n.status === 'CLOSED' || n.status === 'CANCELLED'
    return true
  })

  const columns: Column<Ncr>[] = [
    { key: 'docNo', header: 'NCR', sortable: true, width: '11rem', render: (n) => <span className="font-mono text-xs font-medium text-brand-600">{n.docNo}</span> },
    { key: 'source', header: 'Source', sortable: true, width: '9rem', accessor: (n) => SOURCE_LABEL[n.source], render: (n) => <span className="text-xs text-fg-muted">{SOURCE_LABEL[n.source]}</span> },
    {
      key: 'title',
      header: 'Issue',
      sortable: true,
      render: (n) => (
        <>
          <p className="text-xs font-medium text-fg">{n.title}</p>
          <p className="font-mono text-2xs text-fg-subtle">{n.itemCode}{n.batchNo && ` · ${n.batchNo}`}</p>
        </>
      ),
    },
    { key: 'severity', header: 'Severity', sortable: true, width: '6.5rem', render: (n) => <SeverityBadge severity={n.severity} /> },
    { key: 'quantityAffected', header: 'Affected', align: 'right', sortable: true, width: '7.5rem', accessor: (n) => n.quantityAffected, render: (n) => `${formatQty(n.quantityAffected, 0)} ${n.uom}` },
    { key: 'costImpact', header: 'Cost', align: 'right', sortable: true, width: '8.5rem', accessor: (n) => n.costImpact, render: (n) => (n.costImpact ? `₹${formatAmount(n.costImpact)}` : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'owner', header: 'Owner', sortable: true, width: '9rem' },
    { key: 'dueOn', header: 'Due', sortable: true, width: '8rem', accessor: (n) => n.dueOn, render: (n) => <span className={overdueDays(n.dueOn, n.closedOn) > 0 ? 'text-danger' : ''}>{formatDate(n.dueOn)}</span> },
    { key: 'overdue', header: 'Timing', width: '8rem', accessor: (n) => overdueDays(n.dueOn, n.closedOn), render: (n) => <DueChip days={overdueDays(n.dueOn, n.closedOn)} /> },
    { key: 'capaDocNo', header: 'CAPA', width: '10rem', render: (n) => <span className="font-mono text-2xs text-fg-muted">{n.capaDocNo ?? '—'}</span> },
    { key: 'status', header: 'Status', sortable: true, width: '11rem', accessor: (n) => NCR_STATUS_LABEL[n.status], render: (n) => <NcrStatusBadge status={n.status} /> },
  ]

  function openCreate() {
    setEditing(null)
    setForm({ source: 'PRODUCTION', severity: 'MAJOR', title: '', description: '', itemCode: '', batchNo: '', originDocNo: '', supplierCode: '', quantityAffected: '', quantityScrapped: '0', quantityReworked: '0', owner: '', dueOn: '' })
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(n: Ncr) {
    setEditing(n)
    setForm({
      source: n.source, severity: n.severity, title: n.title ?? '', description: n.description ?? '', itemCode: n.itemCode ?? '',
      batchNo: n.batchNo ?? '', originDocNo: n.originDocNo ?? '', supplierCode: n.supplierCode ?? '',
      quantityAffected: String(n.quantityAffected ?? 0), quantityScrapped: String(n.quantityScrapped ?? 0),
      quantityReworked: String(n.quantityReworked ?? 0), owner: n.owner ?? '', dueOn: n.dueOn ?? '',
    })
    setErrors({})
    setFormOpen(true)
  }

  /** Scrap and rework value, from the defect catalogue's per-unit costs. */
  function estimateCost(itemCode: string, scrapped: number, reworked: number) {
    const related = inspections.rows.filter((i) => i.itemCode === itemCode).flatMap((i) => i.defects)
    const codes = [...new Set(related.map((d) => d.defectCode))]
    const catalogue = defects.rows.filter((d) => codes.includes(d.code))
    const avgScrap = catalogue.length ? catalogue.reduce((s, d) => s + d.scrapCostPerUnit, 0) / catalogue.length : 0
    const avgRework = catalogue.length ? catalogue.reduce((s, d) => s + d.reworkCostPerUnit, 0) / catalogue.length : 0
    return scrapped * avgScrap + reworked * avgRework
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'A title is required.'
    if (form.description.trim().length < 20) e.description = 'Describe what was found in at least 20 characters — this is read by whoever investigates.'
    if (!form.itemCode.trim()) e.itemCode = 'Name the item affected.'
    if (!(Number(form.quantityAffected) > 0)) e.quantityAffected = 'Quantity affected must be greater than zero.'
    if (Number(form.quantityScrapped) + Number(form.quantityReworked) > Number(form.quantityAffected))
      e.quantityScrapped = 'Scrapped plus reworked cannot exceed the quantity affected.'
    if (!form.owner.trim()) e.owner = 'An owner is required — an NCR with no owner does not move.'
    if (!form.dueOn) e.dueOn = 'A due date is required.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    const scrapped = Number(form.quantityScrapped) || 0
    const reworked = Number(form.quantityReworked) || 0
    const patch = {
      source: form.source,
      severity: form.severity,
      title: form.title.trim(),
      description: form.description.trim(),
      itemCode: form.itemCode.trim(),
      itemName: inspections.rows.find((i) => i.itemCode === form.itemCode.trim())?.itemName ?? form.itemCode.trim(),
      batchNo: form.batchNo.trim(),
      originDocNo: form.originDocNo.trim(),
      supplierCode: form.supplierCode.trim(),
      quantityAffected: Number(form.quantityAffected),
      quantityScrapped: scrapped,
      quantityReworked: reworked,
      owner: form.owner.trim(),
      dueOn: form.dueOn,
      costImpact: estimateCost(form.itemCode.trim(), scrapped, reworked),
    }
    if (editing) {
      updateWrapper((editing as any)?.id, { ...patch, version: editing.version + 1 })
      toast.success('NCR updated', `${editing.docNo} saved.`)
    } else {
      try {
        const nextCode = await ncrsApi.getNextCode()
        const docNo = nextCode.code
        await ncrsApi.create({
          ...patch,
          docNo,
          uom: 'NOS',
          containment: '',
          containedAt: null,
          rootCause: '',
          causeCategory: null,
          fiveWhys: emptyWhys(),
          status: 'OPEN',
          raisedBy: 'S. Meena',
          raisedOn: new Date().toISOString().slice(0, 10),
          closedOn: null,
          capaDocNo: null,
          remarks: '',
          version: 1,
        } as any)
        fetchNcrs()
        toast.success('NCR raised', `${docNo} — record the containment action next; nothing else can start until the material is stopped.`)
      } catch (e: any) {
        toast.error('Error', e.message || 'Failed to create NCR')
      }
    }
    setFormOpen(false)
  }

  function moveStatus(n: Ncr, to: Ncr['status']) {
    const blockers = ncrStepBlockers(n, to)
    if (blockers.length) {
      toast.error('Cannot move to this step', blockers[0])
      setMoving(null)
      return
    }
    const patch: Partial<Ncr> = { status: to, version: n.version + 1 }
    if (to === 'CONTAINED') patch.containedAt = new Date().toISOString().slice(0, 10)
    if (to === 'CLOSED') patch.closedOn = new Date().toISOString().slice(0, 10)
    updateWrapper((n as any)?.id, patch)
    toast.success(NCR_STATUS_LABEL[to], `${n.docNo} moved to ${NCR_STATUS_LABEL[to].toLowerCase()}.`)
    setMoving(null)
    setDetail(null)
  }

  function setWhy(n: Ncr, level: number, patch: Partial<WhyStep>) {
    updateWrapper((n as any)?.id, { fiveWhys: n.fiveWhys.map((w) => (w.level === level ? { ...w, ...patch } : w)), version: n.version + 1 })
  }

  function raiseCapa(n: Ncr) {
    if (!(n.rootCause ?? '').trim() || !n.causeCategory) {
      toast.error('Not ready for a CAPA', 'A CAPA starts from a root cause. Complete the investigation first.')
      return
    }
    const seq = capas.rows.length + 11
    const docNo = `CAPA/26-27/${String(seq).padStart(4, '0')}`
    capas.create({
      uid: newUid('cap'),
      docNo,
      title: `Action on ${n.title}`,
      ncrDocNo: n.docNo,
      itemCode: n.itemCode,
      rootCause: n.rootCause,
      causeCategory: n.causeCategory,
      correctiveAction: '',
      preventiveAction: '',
      owner: n.owner,
      raisedOn: new Date().toISOString().slice(0, 10),
      dueOn: n.dueOn,
      status: 'DRAFT',
      verificationMethod: '',
      verificationResult: '',
      verifiedBy: null,
      verifiedOn: null,
      closedOn: null,
      recurrenceChecked: false,
      effectivenessPct: null,
      version: 1,
    })
    updateWrapper((n as any)?.id, { capaDocNo: docNo, version: n.version + 1 })
    toast.success('CAPA raised', `${docNo} created from ${n.docNo}, carrying the root cause across.`)
  }

  const nextSteps = live ? NCR_FLOW[live.status].filter((s) => s !== 'CANCELLED') : []
  const answeredWhys = live ? live.fiveWhys.filter((w) => (w.answer ?? '').trim()).length : 0

  return (
    <div>
      <PageHeader
        title="Non-conformance"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality', to: '/quality' }, { label: 'NCR' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Raise NCR
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: counts.open },
              { id: 'critical', label: 'Critical', count: counts.critical },
              { id: 'overdue', label: 'Overdue', count: counts.overdue },
              { id: 'closed', label: 'Closed', count: counts.closed },
              { id: 'all', label: 'All', count: counts.all },
            ]}
          />
        }
      />

      {counts.overdue > 0 && tab === 'open' && (
        <Alert tone="warning" className="mb-4">
          {counts.overdue} open non-conformance{counts.overdue === 1 ? '' : 's'} past the due date. An NCR that sits open
          means the containment is the only thing protecting the customer.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(n) => String((n as any).id ?? n.uid)}
        searchPlaceholder="Search NCR, title, item or owner…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'ncr-register', 'NCR register', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={setDetail}
        rowClassName={(n) => (OPEN.includes(n.status) && overdueDays(n.dueOn, n.closedOn) > 0 ? 'bg-danger/5' : undefined)}
        emptyTitle="No non-conformances"
        emptyDescription="Raise one from a failed inspection, a customer return or an audit finding."
        rowActions={(n) => (
          <>
            <MenuItem label="Edit" disabled={n.status === 'CLOSED'} onClick={() => openEdit(n)} />
            {NCR_FLOW[n.status].filter((s) => s !== 'CANCELLED').map((to) => (
              <MenuItem key={to} label={`Move to ${NCR_STATUS_LABEL[to].toLowerCase()}`} separatorBefore={to === NCR_FLOW[n.status][0]} onClick={() => setMoving({ ncr: n, to })} />
            ))}
            <MenuItem label="Raise a CAPA" icon={<ArrowRight />} separatorBefore disabled={!!n.capaDocNo || !(n.rootCause ?? '').trim()} onClick={() => raiseCapa(n)} />
            <MenuItem label={n.status === 'CLOSED' ? 'Delete — blocked (closed)' : 'Delete'} icon={<Trash2 />} danger separatorBefore disabled={n.status === 'CLOSED'} onClick={() => setConfirmDelete(n)} />
          </>
        )}
      />

      {/* Detail ------------------------------------------------------------ */}
      <Drawer
        open={!!live}
        onClose={() => setDetail(null)}
        title={live?.docNo}
        description={live?.title}
        width="max-w-4xl"
        footer={
          live && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                Raised by {live.raisedBy} on {formatDate(live.raisedOn)} · owner {live.owner}
              </span>
              <div className="flex gap-2">
                {!live.capaDocNo && (live.rootCause ?? '').trim() && (
                  <Button variant="outline" size="sm" onClick={() => raiseCapa(live)}>
                    Raise a CAPA
                  </Button>
                )}
                {nextSteps.slice(0, 1).map((to) => (
                  <Button key={to} variant="primary" size="sm" onClick={() => setMoving({ ncr: live, to })}>
                    {NCR_STATUS_LABEL[to]}
                  </Button>
                ))}
              </div>
            </div>
          )
        }
      >
        {live && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <NcrStatusBadge status={live.status} size="md" />
              <SeverityBadge severity={live.severity} />
              <span className="text-2xs text-fg-muted">{SOURCE_LABEL[live.source]}</span>
              <DueChip days={overdueDays(live.dueOn, live.closedOn)} />
            </div>

            {/* Workflow rail */}
            <ol className="flex flex-wrap items-center gap-1">
              {(['OPEN', 'CONTAINED', 'UNDER_INVESTIGATION', 'ROOT_CAUSE_IDENTIFIED', 'CORRECTIVE_ACTION', 'VERIFICATION', 'CLOSED'] as Ncr['status'][]).map((s, i, arr) => {
                const order = arr.indexOf(live.status)
                return (
                  <li key={s} className="flex items-center gap-1">
                    <span className={cn('rounded px-2 py-0.5 text-2xs font-medium', i < order && 'bg-success/10 text-success', i === order && 'bg-brand-600 text-white', i > order && 'bg-surface-3 text-fg-subtle')}>
                      {NCR_STATUS_LABEL[s]}
                    </span>
                    {i < arr.length - 1 && <span className="text-2xs text-fg-subtle">›</span>}
                  </li>
                )
              })}
            </ol>

            <DataGrid
              columns={2}
              items={[
                { label: 'Item', value: `${live.itemCode} — ${live.itemName}` },
                { label: 'Batch', value: live.batchNo || '—', mono: true },
                { label: 'Raised from', value: live.originDocNo || '—', mono: true },
                { label: 'Supplier', value: live.supplierCode || '—', mono: true },
                { label: 'Quantity affected', value: `${formatQty(live.quantityAffected, 0)} ${live.uom}` },
                { label: 'Scrapped / reworked', value: `${formatQty(live.quantityScrapped, 0)} / ${formatQty(live.quantityReworked, 0)}` },
                { label: 'Cost impact', value: live.costImpact ? `₹${formatAmount(live.costImpact)}` : '—' },
                { label: 'CAPA', value: live.capaDocNo ?? 'Not raised', mono: !!live.capaDocNo },
              ]}
            />

            <DetailBlock title="What was found">
              <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{live.description}</p>
            </DetailBlock>

            <DetailBlock title="Containment">
              <Textarea
                rows={3}
                value={live.containment}
                disabled={live.status === 'CLOSED'}
                placeholder="What was done immediately to stop the non-conforming material moving. Required before the investigation can start."
                onChange={(e) => updateWrapper((live as any)?.id, { containment: e.target.value, version: live.version + 1 })}
              />
              {live.containedAt && <p className="mt-1 text-2xs text-fg-subtle">Contained on {formatDate(live.containedAt)}.</p>}
            </DetailBlock>

            <DetailBlock title={`Five whys (${answeredWhys} of 5 answered)`}>
              <div className="space-y-2">
                {live.fiveWhys.map((w) => (
                  <div key={w.level} className="grid gap-2 sm:grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)]">
                    <span className="pt-2 text-2xs font-medium text-fg-subtle">{w.level}.</span>
                    <Input
                      sizeVariant="sm"
                      placeholder={w.level === 1 ? 'Why did this happen?' : 'Why was that?'}
                      value={w.question}
                      disabled={live.status === 'CLOSED'}
                      onChange={(e) => setWhy(live, w.level, { question: e.target.value })}
                    />
                    <Input
                      sizeVariant="sm"
                      placeholder="Because…"
                      value={w.answer}
                      disabled={live.status === 'CLOSED'}
                      onChange={(e) => setWhy(live, w.level, { answer: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              {answeredWhys < 3 && (
                <p className="mt-2 text-2xs text-warning">
                  At least three rungs must be answered before a corrective action can start — a cause reached in two
                  steps is usually still a symptom.
                </p>
              )}
            </DetailBlock>

            <DetailBlock title="Root cause">
              <div className="space-y-2.5">
                <Textarea
                  rows={3}
                  value={live.rootCause}
                  disabled={live.status === 'CLOSED'}
                  placeholder="The cause that, if removed, would have prevented this."
                  onChange={(e) => updateWrapper((live as any)?.id, { rootCause: e.target.value, version: live.version + 1 })}
                />
                <Select
                  label="Cause category"
                  value={live.causeCategory ?? ''}
                  disabled={live.status === 'CLOSED'}
                  onChange={(e) => updateWrapper((live as any)?.id, { causeCategory: (e.target.value || null) as CauseCategory | null, version: live.version + 1 })}
                  options={[{ value: '', label: 'Not classified' }, ...CAUSE_CATEGORIES.map((c) => ({ value: c, label: CAUSE_LABEL[c] }))]}
                />
              </div>
            </DetailBlock>

            {nextSteps.length > 0 && (
              <Alert tone="info">
                Next step: <span className="font-medium text-fg">{NCR_STATUS_LABEL[nextSteps[0]]}</span>.
                {ncrStepBlockers(live, nextSteps[0]).length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {ncrStepBlockers(live, nextSteps[0]).map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}
          </div>
        )}
      </Drawer>

      {/* Create / edit ------------------------------------------------------ */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.docNo}` : 'Raise a non-conformance'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>{editing ? 'Save changes' : 'Raise NCR'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as NcrSource })} options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} />
          <Select label="Severity" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as DefectSeverity })} options={(['CRITICAL', 'MAJOR', 'MINOR'] as const).map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />
          <Input label="Title" required containerClassName="sm:col-span-2" value={form.title} error={errors.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea label="What was found" required containerClassName="sm:col-span-2" rows={3} value={form.description} error={errors.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Item code" required value={form.itemCode} error={errors.itemCode} placeholder="FG-SS-750-BLK" onChange={(e) => setForm({ ...form, itemCode: e.target.value })} />
          <Input label="Batch" value={form.batchNo} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} />
          <Input label="Raised from" value={form.originDocNo} placeholder="QC/FQC/26-27/0389" hint="The inspection, complaint or audit finding." onChange={(e) => setForm({ ...form, originDocNo: e.target.value })} />
          <Input label="Supplier code" value={form.supplierCode} onChange={(e) => setForm({ ...form, supplierCode: e.target.value })} />
          <Input label="Quantity affected" type="number" required value={form.quantityAffected} error={errors.quantityAffected} onChange={(e) => setForm({ ...form, quantityAffected: e.target.value })} />
          <Input label="Scrapped" type="number" value={form.quantityScrapped} error={errors.quantityScrapped} onChange={(e) => setForm({ ...form, quantityScrapped: e.target.value })} />
          <Input label="Reworked" type="number" value={form.quantityReworked} onChange={(e) => setForm({ ...form, quantityReworked: e.target.value })} />
          <Input label="Owner" required value={form.owner} error={errors.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          <Input label="Due by" type="date" required value={form.dueOn} error={errors.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
        </div>
        <Alert tone="info" className="mt-4">
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Cost impact is estimated from the defect catalogue's scrap and rework rates for this item — ₹
            {formatAmount(estimateCost(form.itemCode.trim(), Number(form.quantityScrapped) || 0, Number(form.quantityReworked) || 0))}.
          </span>
        </Alert>
      </Modal>

      <Modal
        open={!!moving}
        onClose={() => setMoving(null)}
        title={moving ? `Move to ${NCR_STATUS_LABEL[moving.to].toLowerCase()}?` : ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => moving && moveStatus(moving.ncr, moving.to)}>Move</Button>
          </>
        }
      >
        {moving && (
          <div className="space-y-2 text-sm text-fg-muted">
            <p><span className="font-medium text-fg">{moving.ncr.docNo}</span> — {moving.ncr.title}</p>
            {ncrStepBlockers(moving.ncr, moving.to).length > 0 ? (
              <Alert tone="danger" title="This step is blocked">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {ncrStepBlockers(moving.ncr, moving.to).map((b) => (<li key={b}>{b}</li>))}
                </ul>
              </Alert>
            ) : (
              <p className="text-xs">Nothing blocks this step.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete NCR"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (confirmDelete) { ncrsApi.remove((confirmDelete as any).id).then(() => { fetchNcrs(); toast.success('Deleted', `${confirmDelete.docNo} was soft-deleted.`) }).catch((e: any) => toast.error('Error', e.message)) } setConfirmDelete(null) }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">{confirmDelete?.docNo} will be marked deleted, not physically removed.</p>
      </Modal>
    </div>
  )
}
