import { useMemo, useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DataGrid } from '@/components/ui/Card'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { DetailBlock, QmsStatusBadge, SeverityBadge, StageBadge, useQualityData } from '@/components/quality/QmsShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { SUPPORTED_AQL, STAGE_LABEL, aqlPlan, instrumentStatus, samplingFor } from '@/lib/qmsFlow'
import { newUid } from '@/store/data'
import type { CharacteristicType, DefectSeverity, InspectionPlan, InspectionStage, PlanCharacteristic, SamplingMethod } from '@/types/quality'

/**
 * Inspection plans (Ch 5, 7 and 25).
 *
 * A plan is what makes an inspection repeatable: the same characteristics, the
 * same limits, the same sampling, whoever is on shift. The sampling preview is
 * live because the accept number is not obvious — a lot of 500 at AQL 1.0 draws
 * 50 pieces and accepts on one, and a planner should see that before approving
 * the plan rather than after the first argument with a supplier.
 */

const STAGES: InspectionStage[] = ['IQC', 'FIRST_PIECE', 'IPQC', 'FQC', 'OQA']
const METHODS: SamplingMethod[] = ['AQL', 'FULL', 'FIXED', 'RANDOM_PERCENT']
const METHOD_LABEL: Record<SamplingMethod, string> = { AQL: 'AQL sampling', FULL: '100% inspection', FIXED: 'Fixed sample', RANDOM_PERCENT: 'Percentage of the lot' }
const TYPES: CharacteristicType[] = ['MEASURED', 'ATTRIBUTE', 'DOCUMENT']

interface CharEntry extends Omit<PlanCharacteristic, 'target' | 'lowerLimit' | 'upperLimit'> {
  target: string
  lowerLimit: string
  upperLimit: string
}

interface FormState {
  name: string
  stage: InspectionStage
  itemCode: string
  itemName: string
  operationCode: string
  samplingMethod: SamplingMethod
  aql: string
  fixedSampleSize: string
  randomPercent: string
  inspectorRole: string
  frequency: string
  effectiveFrom: string
  remarks: string
  characteristics: CharEntry[]
}

const newChar = (seq: number): CharEntry => ({
  uid: `pch-${Date.now().toString(36)}-${seq}`, seq, name: '', type: 'MEASURED', uom: '',
  target: '', lowerLimit: '', upperLimit: '', instrumentCode: '', severity: 'MAJOR',
  isMandatory: true, requiresPhoto: false, method: '',
})

export function PlansPage() {
  const toast = useToast()
  const { plans, instruments, inspections } = useQualityData()
  const { rows, create, update, remove } = plans

  const [tab, setTab] = useState('active')
  const [detail, setDetail] = useState<InspectionPlan | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<InspectionPlan | null>(null)
  const [revisingFrom, setRevisingFrom] = useState<InspectionPlan | null>(null)
  const [form, setForm] = useState<FormState>({
    name: '', stage: 'IQC', itemCode: '', itemName: '', operationCode: '', samplingMethod: 'AQL',
    aql: '1.0', fixedSampleSize: '5', randomPercent: '5', inspectorRole: 'QC Inspector',
    frequency: 'Every lot', effectiveFrom: new Date().toISOString().slice(0, 10), remarks: '', characteristics: [],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<InspectionPlan | null>(null)
  const [previewLot, setPreviewLot] = useState('500')

  const usageOf = (docNo: string) => inspections.rows.filter((i) => i.planDocNo === docNo).length

  const counts = {
    active: rows.filter((p) => p.status === 'ACTIVE').length,
    draft: rows.filter((p) => p.status === 'DRAFT').length,
    superseded: rows.filter((p) => p.status === 'SUPERSEDED' || p.status === 'OBSOLETE').length,
    all: rows.length,
  }

  const filtered = rows.filter((p) => {
    if (tab === 'active') return p.status === 'ACTIVE'
    if (tab === 'draft') return p.status === 'DRAFT'
    if (tab === 'superseded') return p.status === 'SUPERSEDED' || p.status === 'OBSOLETE'
    return true
  })

  const columns: Column<InspectionPlan>[] = [
    { key: 'docNo', header: 'Plan', sortable: true, width: '11rem', render: (p) => <span className="font-mono text-xs font-medium text-brand-600">{p.docNo}</span> },
    { key: 'revision', header: 'Rev', align: 'right', width: '4.5rem', accessor: (p) => p.revision, render: (p) => <span className="font-mono text-2xs">R{p.revision}</span> },
    { key: 'stage', header: 'Stage', sortable: true, width: '7.5rem', accessor: (p) => STAGE_LABEL[p.stage], render: (p) => <StageBadge stage={p.stage} /> },
    { key: 'name', header: 'Plan', sortable: true, render: (p) => (<><p className="text-xs font-medium text-fg">{p.name}</p><p className="font-mono text-2xs text-fg-subtle">{p.itemCode}{p.operationCode && ` · ${p.operationCode}`}</p></>) },
    { key: 'characteristics', header: 'Checks', align: 'right', width: '6rem', accessor: (p) => p.characteristics.length },
    { key: 'critical', header: 'Critical', align: 'right', width: '6.5rem', accessor: (p) => p.characteristics.filter((c) => c.severity === 'CRITICAL').length },
    { key: 'samplingMethod', header: 'Sampling', sortable: true, width: '11rem', accessor: (p) => METHOD_LABEL[p.samplingMethod], render: (p) => <span className="text-xs text-fg-muted">{p.samplingMethod === 'AQL' ? `AQL ${p.aql}` : METHOD_LABEL[p.samplingMethod]}</span> },
    { key: 'frequency', header: 'Frequency', width: '12rem', render: (p) => <span className="text-2xs text-fg-muted">{p.frequency}</span> },
    { key: 'usage', header: 'Used', align: 'right', width: '5.5rem', accessor: (p) => usageOf(p.docNo), render: (p) => <span className="text-xs tabular text-fg-muted">{usageOf(p.docNo)}</span> },
    { key: 'effectiveFrom', header: 'Effective', sortable: true, width: '8rem', accessor: (p) => p.effectiveFrom, render: (p) => formatDate(p.effectiveFrom) },
    { key: 'status', header: 'Status', sortable: true, width: '8.5rem', render: (p) => <QmsStatusBadge status={p.status} /> },
  ]

  const toEntries = (p: InspectionPlan): CharEntry[] =>
    p.characteristics.map((c) => ({ ...c, target: c.target === null ? '' : String(c.target), lowerLimit: c.lowerLimit === null ? '' : String(c.lowerLimit), upperLimit: c.upperLimit === null ? '' : String(c.upperLimit) }))

  function openCreate() {
    setEditing(null); setRevisingFrom(null)
    setForm({ name: '', stage: 'IQC', itemCode: '', itemName: '', operationCode: '', samplingMethod: 'AQL', aql: '1.0', fixedSampleSize: '5', randomPercent: '5', inspectorRole: 'QC Inspector', frequency: 'Every lot', effectiveFrom: new Date().toISOString().slice(0, 10), remarks: '', characteristics: [newChar(1)] })
    setErrors({}); setFormOpen(true)
  }

  function loadForm(p: InspectionPlan) {
    setForm({ name: p.name, stage: p.stage, itemCode: p.itemCode, itemName: p.itemName, operationCode: p.operationCode ?? '', samplingMethod: p.samplingMethod, aql: String(p.aql), fixedSampleSize: String(p.fixedSampleSize), randomPercent: String(p.randomPercent), inspectorRole: p.inspectorRole, frequency: p.frequency, effectiveFrom: p.effectiveFrom, remarks: p.remarks, characteristics: toEntries(p) })
    setErrors({}); setFormOpen(true)
  }

  function openEdit(p: InspectionPlan) {
    if (p.status === 'ACTIVE') { toast.error('This plan is live', 'Inspections have been raised against it. Use "Create next revision" so past results keep the plan they were taken to.'); return }
    setEditing(p); setRevisingFrom(null); loadForm(p)
  }

  function openRevision(p: InspectionPlan) {
    setEditing(null); setRevisingFrom(p); loadForm({ ...p, effectiveFrom: new Date().toISOString().slice(0, 10) }); setDetail(null)
  }

  const setChar = (i: number, patch: Partial<CharEntry>) => setForm((f) => ({ ...f, characteristics: f.characteristics.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }))
  const addChar = () => setForm((f) => ({ ...f, characteristics: [...f.characteristics, newChar(f.characteristics.length + 1)] }))
  const removeChar = (i: number) => setForm((f) => ({ ...f, characteristics: f.characteristics.filter((_, idx) => idx !== i) }))

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'A name is required.'
    if (!form.itemCode.trim()) e.itemCode = 'Name the item or product this plan governs.'
    if (form.samplingMethod === 'FIXED' && !(Number(form.fixedSampleSize) > 0)) e.fixedSampleSize = 'A fixed sample size above zero is required.'
    if (form.samplingMethod === 'RANDOM_PERCENT' && !(Number(form.randomPercent) > 0)) e.randomPercent = 'A percentage above zero is required.'
    if (!form.characteristics.length) e.characteristics = 'A plan with no characteristics inspects nothing.'
    else {
      for (const [i, c] of form.characteristics.entries()) {
        if (!c.name.trim()) { e.characteristics = `Row ${i + 1} has no name.`; break }
        if (c.type === 'MEASURED') {
          const lo = c.lowerLimit === '' ? null : Number(c.lowerLimit)
          const hi = c.upperLimit === '' ? null : Number(c.upperLimit)
          if (lo === null && hi === null) { e.characteristics = `Row ${i + 1} is measured but has no limit — it can never fail.`; break }
          if (lo !== null && hi !== null && lo > hi) { e.characteristics = `Row ${i + 1} has a lower limit above its upper limit.`; break }
          const t = c.target === '' ? null : Number(c.target)
          if (t !== null && ((lo !== null && t < lo) || (hi !== null && t > hi))) { e.characteristics = `Row ${i + 1} has a target outside its own limits.`; break }
        }
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function buildChars(): PlanCharacteristic[] {
    return form.characteristics.map((c, i) => ({
      ...c, seq: i + 1, name: c.name.trim(), uom: c.uom.trim(), instrumentCode: c.instrumentCode.trim(), method: c.method.trim(),
      target: c.target === '' ? null : Number(c.target),
      lowerLimit: c.lowerLimit === '' ? null : Number(c.lowerLimit),
      upperLimit: c.upperLimit === '' ? null : Number(c.upperLimit),
    }))
  }

  function save(activate: boolean) {
    if (!validate()) return
    const common = {
      name: form.name.trim(), stage: form.stage, itemCode: form.itemCode.trim(), itemName: form.itemName.trim() || form.itemCode.trim(),
      operationCode: form.operationCode.trim() || null, samplingMethod: form.samplingMethod, aql: Number(form.aql) || 1,
      fixedSampleSize: Number(form.fixedSampleSize) || 0, randomPercent: Number(form.randomPercent) || 0,
      inspectorRole: form.inspectorRole.trim(), frequency: form.frequency.trim(), effectiveFrom: form.effectiveFrom,
      remarks: form.remarks.trim(), characteristics: buildChars(),
      status: (activate ? 'ACTIVE' : 'DRAFT') as InspectionPlan['status'],
      approvedBy: activate ? 'Meera Rajan' : null,
    }
    if (editing) {
      update(editing.uid, { ...common, version: editing.version + 1 })
      toast.success('Plan saved', `${editing.docNo} updated.`)
    } else if (revisingFrom) {
      // Superseding rather than overwriting: results already taken keep their plan.
      update(revisingFrom.uid, { status: 'SUPERSEDED', version: revisingFrom.version + 1 })
      create({ ...common, uid: newUid('qip'), docNo: revisingFrom.docNo, revision: revisingFrom.revision + 1, createdBy: 'S. Meena', createdAt: new Date().toISOString(), version: 1 } as InspectionPlan)
      toast.success(`Revision ${revisingFrom.revision + 1} created`, `${revisingFrom.docNo} R${revisingFrom.revision} is superseded. Inspections already taken keep the revision they were taken to.`)
    } else {
      const docNo = `QIP/26-27/${String(rows.length + 1).padStart(4, '0')}`
      create({ ...common, uid: newUid('qip'), docNo, revision: 1, createdBy: 'S. Meena', createdAt: new Date().toISOString(), version: 1 } as InspectionPlan)
      toast.success('Plan created', `${docNo} R1 saved as ${activate ? 'active' : 'a draft'}.`)
    }
    setFormOpen(false)
  }

  /** Live sampling preview for whatever the form currently says. */
  const preview = useMemo(() => {
    const lot = Number(previewLot) || 0
    if (lot <= 0) return null
    return samplingFor({ samplingMethod: form.samplingMethod, aql: Number(form.aql) || 1, fixedSampleSize: Number(form.fixedSampleSize) || 0, randomPercent: Number(form.randomPercent) || 0 }, lot)
  }, [previewLot, form.samplingMethod, form.aql, form.fixedSampleSize, form.randomPercent])

  return (
    <div>
      <PageHeader
        title="Inspection plans"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality', to: '/quality' }, { label: 'Plans' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>New plan</Button>}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[
          { id: 'active', label: 'Active', count: counts.active },
          { id: 'draft', label: 'Draft', count: counts.draft },
          { id: 'superseded', label: 'Superseded', count: counts.superseded },
          { id: 'all', label: 'All', count: counts.all },
        ]} />}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(p) => p.uid}
        searchPlaceholder="Search plan, item, stage or operation…"
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'inspection-plans', 'Inspection plans', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        onRowClick={setDetail}
        emptyTitle="No inspection plans"
        emptyDescription="A plan decides what is checked, against what limits, on how big a sample."
        rowActions={(p) => (
          <>
            <MenuItem label="Edit" disabled={p.status === 'ACTIVE'} onClick={() => openEdit(p)} />
            <MenuItem label="Create next revision" icon={<Copy />} disabled={p.status !== 'ACTIVE'} onClick={() => openRevision(p)} />
            <MenuItem label="Activate" separatorBefore disabled={p.status !== 'DRAFT'} onClick={() => { update(p.uid, { status: 'ACTIVE', approvedBy: 'Meera Rajan', version: p.version + 1 }); toast.success('Activated', `${p.docNo} R${p.revision} can now be inspected against.`) }} />
            <MenuItem label="Make obsolete" disabled={p.status !== 'ACTIVE'} onClick={() => { update(p.uid, { status: 'OBSOLETE', version: p.version + 1 }); toast.success('Obsolete', `${p.docNo} withdrawn. Existing inspections are unaffected.`) }} />
            <MenuItem label={usageOf(p.docNo) ? `Delete — blocked (${usageOf(p.docNo)} inspections)` : 'Delete'} icon={<Trash2 />} danger separatorBefore disabled={usageOf(p.docNo) > 0} onClick={() => setConfirmDelete(p)} />
          </>
        )}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.docNo} · revision ${detail.revision}` : ''} description={detail?.name} width="max-w-4xl"
        footer={detail && (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-2xs text-fg-subtle">{detail.characteristics.length} characteristics · {usageOf(detail.docNo)} inspections raised · {detail.inspectorRole}</span>
            {detail.status === 'ACTIVE' && <Button variant="outline" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => openRevision(detail)}>Create next revision</Button>}
          </div>
        )}
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2"><StageBadge stage={detail.stage} /><QmsStatusBadge status={detail.status} size="md" /></div>
            <DataGrid columns={2} items={[
              { label: 'Item', value: `${detail.itemCode} — ${detail.itemName}` },
              { label: 'Operation', value: detail.operationCode ?? '—', mono: !!detail.operationCode },
              { label: 'Sampling', value: detail.samplingMethod === 'AQL' ? `AQL ${detail.aql}, ISO 2859-1 general II` : METHOD_LABEL[detail.samplingMethod] },
              { label: 'Frequency', value: detail.frequency },
              { label: 'Inspector', value: detail.inspectorRole },
              { label: 'Effective from', value: formatDate(detail.effectiveFrom) },
            ]} />

            {detail.samplingMethod === 'AQL' && (
              <DetailBlock title="What this plan draws">
                <div className="overflow-x-auto rounded border border-border">
                  <table className="grid-table">
                    <thead><tr><th>Lot size</th><th>Code letter</th><th className="text-right">Sample</th><th className="text-right">Accept on</th><th className="text-right">Reject on</th></tr></thead>
                    <tbody>
                      {[50, 150, 500, 1200, 3200, 10000].map((lot) => {
                        const s = aqlPlan(lot, detail.aql)
                        return (<tr key={lot}><td className="text-xs tabular">{lot.toLocaleString('en-IN')}</td><td className="font-mono text-2xs">{s.codeLetter}</td><td className="text-right tabular text-xs">{s.sampleSize}</td><td className="text-right tabular text-xs">{s.acceptNumber}</td><td className="text-right tabular text-xs">{s.rejectNumber}</td></tr>)
                      })}
                    </tbody>
                  </table>
                </div>
              </DetailBlock>
            )}

            <DetailBlock title={`Characteristics (${detail.characteristics.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead><tr><th style={{ width: '3rem' }}>#</th><th>Characteristic</th><th style={{ width: '6.5rem' }}>Type</th><th style={{ width: '11rem' }}>Specification</th><th style={{ width: '7rem' }}>Instrument</th><th style={{ width: '6.5rem' }}>Severity</th><th style={{ width: '9rem' }}>Rules</th></tr></thead>
                  <tbody>
                    {detail.characteristics.map((c) => {
                      const inst = c.instrumentCode ? instruments.rows.find((x) => x.code === c.instrumentCode) : undefined
                      const bad = c.instrumentCode && (!inst || ['OVERDUE', 'CONDEMNED'].includes(instrumentStatus(inst)))
                      return (
                        <tr key={c.uid}>
                          <td className="text-2xs text-fg-subtle">{c.seq}</td>
                          <td><p className="text-xs font-medium text-fg">{c.name}</p>{c.method && <p className="text-2xs text-fg-subtle">{c.method}</p>}</td>
                          <td className="text-2xs text-fg-muted">{c.type.toLowerCase()}</td>
                          <td className="text-2xs tabular text-fg-muted">{c.type === 'MEASURED' ? `${c.target ?? '—'}${c.uom ? ` ${c.uom}` : ''} [${c.lowerLimit ?? '—'} … ${c.upperLimit ?? '—'}]` : 'Pass / fail'}</td>
                          <td className={bad ? 'font-mono text-2xs text-danger' : 'font-mono text-2xs text-fg-muted'}>{c.instrumentCode || '—'}{bad && ' ⚠'}</td>
                          <td><SeverityBadge severity={c.severity} /></td>
                          <td className="text-2xs text-fg-muted">{[c.isMandatory && 'Mandatory', c.requiresPhoto && 'Photo'].filter(Boolean).join(' · ') || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            {detail.remarks && <DetailBlock title="Remarks"><p className="rounded border border-border bg-surface-2 p-3 text-xs text-fg-muted">{detail.remarks}</p></DetailBlock>}
          </div>
        )}
      </Drawer>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={revisingFrom ? `${revisingFrom.docNo} — revision ${revisingFrom.revision + 1}` : editing ? `Edit ${editing.docNo}` : 'New inspection plan'} size="full"
        footer={<><Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button><Button variant="outline" onClick={() => save(false)}>Save draft</Button><Button variant="primary" onClick={() => save(true)}>Save and activate</Button></>}
      >
        <div className="grid gap-3.5 sm:grid-cols-4">
          <Input label="Plan name" required containerClassName="sm:col-span-2" value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Stage" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as InspectionStage })} options={STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} />
          <Input label="Effective from" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          <Input label="Item code" required value={form.itemCode} error={errors.itemCode} placeholder="RM-SS304-050" onChange={(e) => setForm({ ...form, itemCode: e.target.value })} />
          <Input label="Item name" containerClassName="sm:col-span-2" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
          <Input label="Operation" value={form.operationCode} placeholder="OP-050" hint="For in-process plans." onChange={(e) => setForm({ ...form, operationCode: e.target.value })} />
          <Select label="Sampling method" value={form.samplingMethod} onChange={(e) => setForm({ ...form, samplingMethod: e.target.value as SamplingMethod })} options={METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
          {form.samplingMethod === 'AQL' && <Select label="AQL" value={form.aql} onChange={(e) => setForm({ ...form, aql: e.target.value })} options={SUPPORTED_AQL.map((a) => ({ value: String(a), label: String(a) }))} />}
          {form.samplingMethod === 'FIXED' && <Input label="Sample size" type="number" value={form.fixedSampleSize} error={errors.fixedSampleSize} onChange={(e) => setForm({ ...form, fixedSampleSize: e.target.value })} />}
          {form.samplingMethod === 'RANDOM_PERCENT' && <Input label="Percentage" type="number" value={form.randomPercent} error={errors.randomPercent} onChange={(e) => setForm({ ...form, randomPercent: e.target.value })} />}
          <Input label="Inspector role" value={form.inspectorRole} onChange={(e) => setForm({ ...form, inspectorRole: e.target.value })} />
          <Input label="Frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} />
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 rounded border border-border bg-surface-2 px-3 py-2.5">
          <Input label="Preview on a lot of" type="number" sizeVariant="sm" containerClassName="w-40" value={previewLot} onChange={(e) => setPreviewLot(e.target.value)} />
          {preview && (
            <p className="pb-1 text-xs text-fg-muted">
              Draws <span className="font-semibold text-fg">{preview.sampleSize}</span> pieces, accepts on{' '}
              <span className="font-semibold text-fg">{preview.acceptNumber}</span> defect{preview.acceptNumber === 1 ? '' : 's'} and rejects on{' '}
              <span className="font-semibold text-fg">{preview.rejectNumber}</span>. {preview.note}
            </p>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Characteristics ({form.characteristics.length})</p>
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={addChar}>Add characteristic</Button>
          </div>
          {errors.characteristics && <Alert tone="danger" className="mb-2">{errors.characteristics}</Alert>}
          <div className="overflow-x-auto rounded border border-border">
            <table className="grid-table">
              <thead><tr>
                <th style={{ minWidth: '13rem' }}>Name *</th><th style={{ width: '8rem' }}>Type</th><th style={{ width: '5rem' }}>UoM</th>
                <th className="text-right" style={{ width: '6rem' }}>Target</th><th className="text-right" style={{ width: '6rem' }}>Lower</th><th className="text-right" style={{ width: '6rem' }}>Upper</th>
                <th style={{ width: '8rem' }}>Instrument</th><th style={{ width: '7rem' }}>Severity</th>
                <th className="text-center" style={{ width: '4.5rem' }}>Mand.</th><th className="text-center" style={{ width: '4.5rem' }}>Photo</th><th style={{ width: '3rem' }} />
              </tr></thead>
              <tbody>
                {form.characteristics.map((c, i) => (
                  <tr key={c.uid}>
                    <td><input value={c.name} aria-label={`Name on row ${i + 1}`} onChange={(e) => setChar(i, { name: e.target.value })} className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none" /></td>
                    <td><select value={c.type} aria-label={`Type on row ${i + 1}`} onChange={(e) => setChar(i, { type: e.target.value as CharacteristicType })} className="h-7 w-full rounded border border-border bg-surface px-1 text-xs text-fg focus:border-brand-500 focus:outline-none">{TYPES.map((t) => (<option key={t} value={t}>{t.toLowerCase()}</option>))}</select></td>
                    <td><input value={c.uom} disabled={c.type !== 'MEASURED'} aria-label={`Unit on row ${i + 1}`} onChange={(e) => setChar(i, { uom: e.target.value })} className="h-7 w-full rounded border border-border bg-surface px-1.5 text-xs text-fg focus:border-brand-500 focus:outline-none disabled:bg-surface-3" /></td>
                    {(['target', 'lowerLimit', 'upperLimit'] as const).map((k) => (
                      <td key={k}><input type="number" step="any" value={c[k]} disabled={c.type !== 'MEASURED'} aria-label={`${k} on row ${i + 1}`} onChange={(e) => setChar(i, { [k]: e.target.value } as Partial<CharEntry>)} className="h-7 w-full rounded border border-border bg-surface px-1.5 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none disabled:bg-surface-3" /></td>
                    ))}
                    <td><select value={c.instrumentCode} aria-label={`Instrument on row ${i + 1}`} onChange={(e) => setChar(i, { instrumentCode: e.target.value })} className="h-7 w-full rounded border border-border bg-surface px-1 text-xs text-fg focus:border-brand-500 focus:outline-none"><option value="">None</option>{instruments.rows.map((x) => (<option key={x.uid} value={x.code}>{x.code}</option>))}</select></td>
                    <td><select value={c.severity} aria-label={`Severity on row ${i + 1}`} onChange={(e) => setChar(i, { severity: e.target.value as DefectSeverity })} className="h-7 w-full rounded border border-border bg-surface px-1 text-xs text-fg focus:border-brand-500 focus:outline-none">{(['CRITICAL', 'MAJOR', 'MINOR'] as const).map((s) => (<option key={s} value={s}>{s.toLowerCase()}</option>))}</select></td>
                    <td className="text-center"><input type="checkbox" checked={c.isMandatory} aria-label={`Mandatory on row ${i + 1}`} onChange={(e) => setChar(i, { isMandatory: e.target.checked })} className="h-3.5 w-3.5 accent-brand-600" /></td>
                    <td className="text-center"><input type="checkbox" checked={c.requiresPhoto} aria-label={`Photo on row ${i + 1}`} onChange={(e) => setChar(i, { requiresPhoto: e.target.checked })} className="h-3.5 w-3.5 accent-brand-600" /></td>
                    <td className="text-center"><button type="button" onClick={() => removeChar(i)} aria-label={`Remove row ${i + 1}`} className="text-fg-subtle hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-2xs text-fg-subtle">
            A measured characteristic needs at least one limit, or it can never fail. Mandatory means one failure fails
            the whole lot regardless of the accept number; photo means the inspector must attach evidence.
          </p>
        </div>

        <Textarea label="Remarks" containerClassName="mt-3.5" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />

        {revisingFrom && (
          <Alert tone="info" className="mt-4">
            Approving this supersedes revision {revisingFrom.revision}. Inspections already taken keep the revision they
            were taken to, so an old result can still be read against the plan it was judged by.
          </Alert>
        )}
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete inspection plan" size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (confirmDelete) { remove(confirmDelete.uid); toast.success('Deleted', `${confirmDelete.docNo} was soft-deleted.`) } setConfirmDelete(null) }}>Delete</Button></>}
      >
        <p className="text-sm text-fg-muted">{confirmDelete?.docNo} will be marked deleted, not physically removed. No inspection has been raised against it.</p>
      </Modal>
    </div>
  )
}
