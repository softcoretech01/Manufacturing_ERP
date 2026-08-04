import { useMemo, useState } from 'react'
import { Camera, Check, Plus, ShieldAlert, Trash2 } from 'lucide-react'
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
import {
  DetailBlock,
  DispositionBadge,
  QmsStatusBadge,
  SeverityBadge,
  StageBadge,
  ToleranceBar,
  VerdictCell,
  useQualityData,
} from '@/components/quality/QmsShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime, formatQty } from '@/lib/format'
import {
  DISPOSITION_LABEL,
  STAGE_LABEL,
  approvalBlockers,
  calibrationBlocks,
  evaluateInspection,
  evaluateReading,
  instrumentStatus,
  readingsFromPlan,
  samplingFor,
} from '@/lib/qmsFlow'
import { newUid } from '@/store/data'
import type { DefectEntry, Disposition, Inspection, InspectionStage } from '@/types/quality'

/**
 * Inspections — IQC, first piece, IPQC, FQC and OQA (Ch 6, 8, 9, 10, 11).
 *
 * One record shape for every stage, because the rules are the same: draw a
 * sample from the plan, record readings against limits, count defects against
 * the accept number, then decide. What changes between stages is the source
 * document and the plan, not the discipline.
 *
 * The disposition the rules arrive at is always shown next to the one recorded.
 * An inspector may override it — holding a batch that the rules would reject is
 * a legitimate call — but the override is visible rather than silent.
 */

const STAGES: InspectionStage[] = ['IQC', 'FIRST_PIECE', 'IPQC', 'FQC', 'OQA']
const DISPOSITIONS: Disposition[] = ['ACCEPTED', 'ACCEPTED_WITH_DEVIATION', 'REJECTED', 'HOLD']

interface FormState {
  planDocNo: string
  sourceDocNo: string
  batchNo: string
  lotSize: string
  supplierCode: string
  machineCode: string
  shift: string
}

export function InspectionsPage() {
  const toast = useToast()
  const { inspections, plans, instruments, defects } = useQualityData()
  const { rows, create, update, remove } = inspections

  const [tab, setTab] = useState<'ALL' | InspectionStage>('ALL')
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [detail, setDetail] = useState<Inspection | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>({ planDocNo: '', sourceDocNo: '', batchNo: '', lotSize: '', supplierCode: '', machineCode: '', shift: 'A' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<Inspection | null>(null)
  const [deciding, setDeciding] = useState<Inspection | null>(null)
  const [decision, setDecision] = useState<Disposition>('ACCEPTED')
  const [reason, setReason] = useState('')
  const [defectOpen, setDefectOpen] = useState(false)
  const [defectDraft, setDefectDraft] = useState({ defectCode: '', qty: '', source: '', remarks: '' })

  /** The live record, so edits made in the drawer are reflected immediately. */
  const live = detail ? rows.find((r) => r.uid === detail.uid) ?? detail : null

  const counts = useMemo(
    () => ({
      ALL: rows.length,
      IQC: rows.filter((r) => r.stage === 'IQC').length,
      FIRST_PIECE: rows.filter((r) => r.stage === 'FIRST_PIECE').length,
      IPQC: rows.filter((r) => r.stage === 'IPQC').length,
      FQC: rows.filter((r) => r.stage === 'FQC').length,
      OQA: rows.filter((r) => r.stage === 'OQA').length,
    }),
    [rows],
  )

  const filtered = rows.filter((r) => {
    if (tab !== 'ALL' && r.stage !== tab) return false
    if (statusFilter === 'OPEN') return r.status !== 'COMPLETED' && r.status !== 'CANCELLED'
    if (statusFilter === 'COMPLETED') return r.status === 'COMPLETED'
    if (statusFilter === 'REJECTED') return r.disposition === 'REJECTED' || r.disposition === 'HOLD'
    return true
  })

  const openCount = rows.filter((r) => r.status !== 'COMPLETED' && r.status !== 'CANCELLED').length
  const blockedCount = rows.filter((r) => r.status !== 'COMPLETED' && calibrationBlocks(r, instruments.rows).length > 0).length

  const columns: Column<Inspection>[] = [
    { key: 'docNo', header: 'Inspection', sortable: true, width: '12rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'stage', header: 'Stage', sortable: true, width: '7.5rem', accessor: (r) => STAGE_LABEL[r.stage], render: (r) => <StageBadge stage={r.stage} /> },
    {
      key: 'itemCode',
      header: 'Item',
      sortable: true,
      render: (r) => (
        <>
          <p className="text-xs font-medium text-fg">{r.itemName}</p>
          <p className="font-mono text-2xs text-fg-subtle">{r.itemCode}{r.batchNo && ` · ${r.batchNo}`}</p>
        </>
      ),
    },
    { key: 'sourceDocNo', header: 'Source', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-2xs text-fg-muted">{r.sourceDocNo || '—'}</span> },
    { key: 'lotSize', header: 'Lot', align: 'right', sortable: true, width: '6.5rem', accessor: (r) => r.lotSize, render: (r) => formatQty(r.lotSize, 0) },
    {
      key: 'sampleSize',
      header: 'Sample',
      align: 'right',
      width: '7.5rem',
      accessor: (r) => r.sampleSize,
      render: (r) => (
        <span className="text-xs tabular">
          {formatQty(r.sampleSize, 0)}
          <span className="ml-1 text-2xs text-fg-subtle">Ac {r.acceptNumber}</span>
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Checks',
      width: '7rem',
      accessor: (r) => evaluateInspection(r).completed,
      render: (r) => {
        const e = evaluateInspection(r)
        return (
          <span className="text-xs tabular">
            {e.completed}/{e.totalChecks}
            {e.failed > 0 && <span className="ml-1 text-2xs text-danger">{e.failed} fail</span>}
          </span>
        )
      },
    },
    {
      key: 'defects',
      header: 'Defects',
      align: 'right',
      width: '6rem',
      accessor: (r) => evaluateInspection(r).defectCount,
      render: (r) => {
        const e = evaluateInspection(r)
        if (!e.defectCount) return <span className="text-2xs text-fg-subtle">—</span>
        return <span className={cn('text-xs tabular', e.withinAcceptNumber ? 'text-fg-muted' : 'text-danger')}>{e.defectCount}</span>
      },
    },
    { key: 'disposition', header: 'Disposition', sortable: true, width: '11rem', accessor: (r) => DISPOSITION_LABEL[r.disposition], render: (r) => <DispositionBadge disposition={r.disposition} /> },
    { key: 'inspector', header: 'Inspector', sortable: true, width: '9rem' },
    { key: 'inspectedAt', header: 'Inspected', sortable: true, width: '8rem', accessor: (r) => r.inspectedAt ?? '', render: (r) => (r.inspectedAt ? formatDate(r.inspectedAt) : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (r) => <QmsStatusBadge status={r.status} /> },
  ]

  /* ── Create ────────────────────────────────────────────────────────── */

  const activePlans = plans.rows.filter((p) => p.status === 'ACTIVE')
  const selectedPlan = activePlans.find((p) => p.docNo === form.planDocNo)
  const previewSampling = selectedPlan && Number(form.lotSize) > 0 ? samplingFor(selectedPlan, Number(form.lotSize)) : null

  function openCreate() {
    setForm({ planDocNo: activePlans[0]?.docNo ?? '', sourceDocNo: '', batchNo: '', lotSize: '', supplierCode: '', machineCode: '', shift: 'A' })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.planDocNo) e.planDocNo = 'Choose the inspection plan — it decides the characteristics and the sampling.'
    if (!(Number(form.lotSize) > 0)) e.lotSize = 'A lot size is required; the sample is derived from it.'
    if (!form.sourceDocNo.trim()) e.sourceDocNo = 'Name the GRN, order or shipment being inspected.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function save() {
    if (!validate() || !selectedPlan) return
    const lotSize = Number(form.lotSize)
    const sampling = samplingFor(selectedPlan, lotSize)
    const uid = newUid('qin')
    const prefix = selectedPlan.stage === 'IQC' ? 'IQC' : selectedPlan.stage === 'FIRST_PIECE' ? 'FAI' : selectedPlan.stage
    const seq = rows.filter((r) => r.docNo.includes(`/${prefix}/`)).length + 1

    create({
      uid,
      docNo: `QC/${prefix}/26-27/${String(seq).padStart(4, '0')}`,
      stage: selectedPlan.stage,
      sourceType: selectedPlan.stage === 'IQC' ? 'GRN' : selectedPlan.stage === 'OQA' ? 'SHIPMENT' : 'PRODUCTION_ORDER',
      sourceDocNo: form.sourceDocNo.trim(),
      itemCode: selectedPlan.itemCode,
      itemName: selectedPlan.itemName,
      uom: 'NOS',
      batchNo: form.batchNo.trim(),
      supplierCode: form.supplierCode.trim(),
      supplierName: '',
      operationCode: selectedPlan.operationCode,
      workCentreCode: null,
      machineCode: form.machineCode.trim() || null,
      shift: form.shift,
      planDocNo: selectedPlan.docNo,
      planRevision: selectedPlan.revision,
      lotSize,
      sampleSize: sampling.sampleSize,
      acceptNumber: sampling.acceptNumber,
      rejectNumber: sampling.rejectNumber,
      samplingMethod: selectedPlan.samplingMethod,
      aql: selectedPlan.aql,
      acceptedQty: 0,
      rejectedQty: 0,
      reworkQty: 0,
      readings: readingsFromPlan(selectedPlan.characteristics, uid),
      defects: [],
      status: 'IN_PROGRESS',
      disposition: 'PENDING',
      dispositionReason: '',
      inspector: 'S. Meena',
      inspectedAt: null,
      approvedBy: null,
      approvedAt: null,
      ncrDocNo: null,
      remarks: '',
      createdAt: new Date().toISOString(),
      version: 1,
    } as Inspection)

    toast.success(
      'Inspection raised',
      `${sampling.sampleSize} of ${formatQty(lotSize, 0)} to be checked against ${selectedPlan.characteristics.length} characteristics. Accept on ${sampling.acceptNumber}, reject on ${sampling.rejectNumber}.`,
    )
    setFormOpen(false)
  }

  /* ── Recording readings ────────────────────────────────────────────── */

  function setReading(insp: Inspection, readingUid: string, patch: Partial<Inspection['readings'][number]>) {
    update(insp.uid, {
      readings: insp.readings.map((r) => (r.uid === readingUid ? { ...r, ...patch } : r)),
      status: insp.status === 'PENDING' ? 'IN_PROGRESS' : insp.status,
      version: insp.version + 1,
    })
  }

  function addDefect(insp: Inspection) {
    const t = defects.rows.find((d) => d.code === defectDraft.defectCode)
    if (!t || !(Number(defectDraft.qty) > 0)) {
      toast.error('Cannot add', 'Choose a defect and a quantity greater than zero.')
      return
    }
    const entry: DefectEntry = {
      uid: `dfe-${Date.now().toString(36)}`,
      defectCode: t.code,
      defectName: t.name,
      severity: t.severity,
      qty: Number(defectDraft.qty),
      source: defectDraft.source.trim() || insp.machineCode || insp.supplierCode || '—',
      remarks: defectDraft.remarks.trim(),
    }
    update(insp.uid, { defects: [...insp.defects, entry], version: insp.version + 1 })
    setDefectDraft({ defectCode: '', qty: '', source: '', remarks: '' })
    setDefectOpen(false)
    toast.success('Defect recorded', `${entry.qty} × ${t.name} counted in the sample of ${insp.sampleSize}.`)
  }

  /* ── Disposition & approval ────────────────────────────────────────── */

  function openDecision(i: Inspection) {
    const e = evaluateInspection(i)
    setDecision(e.suggestedDisposition === 'PENDING' ? 'ACCEPTED' : e.suggestedDisposition)
    setReason(i.dispositionReason)
    setDeciding(i)
  }

  function recordDecision(i: Inspection) {
    if ((decision === 'REJECTED' || decision === 'ACCEPTED_WITH_DEVIATION' || decision === 'HOLD') && !reason.trim()) {
      toast.error('A reason is required', 'A rejection, a deviation or a hold has to be explained.')
      return
    }
    const e = evaluateInspection(i)
    // The quantity split follows the decision, so the totals always reconcile.
    const accepted = decision === 'ACCEPTED' || decision === 'ACCEPTED_WITH_DEVIATION' ? i.lotSize : 0
    const rejected = decision === 'REJECTED' ? i.lotSize : 0
    const rework = decision === 'HOLD' ? i.lotSize : 0

    update(i.uid, {
      disposition: decision,
      dispositionReason: reason.trim(),
      acceptedQty: accepted,
      rejectedQty: rejected,
      reworkQty: rework,
      inspectedAt: i.inspectedAt ?? new Date().toISOString(),
      status: 'PENDING_APPROVAL',
      version: i.version + 1,
    })

    toast.success(
      'Disposition recorded',
      decision === e.suggestedDisposition
        ? `${DISPOSITION_LABEL[decision]} — matches what the rules arrived at.`
        : `${DISPOSITION_LABEL[decision]} — the rules suggested ${DISPOSITION_LABEL[e.suggestedDisposition].toLowerCase()}. The override is recorded with your reason.`,
    )
    setDeciding(null)
  }

  function approve(i: Inspection) {
    const blockers = approvalBlockers(i, instruments.rows)
    if (blockers.length) {
      toast.error('Cannot approve', blockers[0])
      return
    }
    update(i.uid, { status: 'COMPLETED', approvedBy: 'Meera Rajan', approvedAt: new Date().toISOString(), version: i.version + 1 })
    toast.success('Inspection approved', `${i.docNo} is closed. The result cannot be edited — a correction needs a new inspection.`)
    setDetail(null)
  }

  const liveEval = live ? evaluateInspection(live) : null
  const liveBlockers = live ? approvalBlockers(live, instruments.rows) : []
  const liveCalibration = live ? calibrationBlocks(live, instruments.rows) : []
  const isLocked = live?.status === 'COMPLETED'

  return (
    <div>
      <PageHeader
        title="Inspections"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality', to: '/quality' }, { label: 'Inspections' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Raise inspection
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={(t) => setTab(t as 'ALL' | InspectionStage)}
            tabs={[
              { id: 'ALL', label: 'All stages', count: counts.ALL },
              ...STAGES.map((s) => ({ id: s, label: STAGE_LABEL[s], count: counts[s] })),
            ]}
          />
        }
      />

      {blockedCount > 0 && (
        <Alert tone="danger" className="mb-4">
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            {blockedCount} open inspection{blockedCount === 1 ? '' : 's'} used an instrument that is out of calibration.
            Those readings are not valid evidence and the inspection cannot be approved until the instrument is recalled
            and the checks retaken.
          </span>
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search inspection, item, batch or source…"
        filterPanel={
          <Select
            sizeVariant="sm"
            containerClassName="w-44"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'OPEN', label: `Open (${openCount})` },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'REJECTED', label: 'Rejected & held' },
              { value: 'ALL', label: 'Everything' },
            ]}
          />
        }
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'inspections', 'Inspection register', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={setDetail}
        rowClassName={(r) => (r.disposition === 'REJECTED' ? 'bg-danger/5' : r.disposition === 'HOLD' ? 'bg-warning/5' : undefined)}
        emptyTitle="No inspections"
        emptyDescription="Raise one against an active inspection plan."
        rowActions={(r) => (
          <>
            <MenuItem label="Edit readings" disabled={r.status === 'COMPLETED'} onClick={() => setDetail(r)} />
            <MenuItem label="Record disposition" icon={<Check />} separatorBefore disabled={r.status === 'COMPLETED'} onClick={() => openDecision(r)} />
            <MenuItem label="Approve" disabled={r.status !== 'PENDING_APPROVAL'} onClick={() => approve(r)} />
            <MenuItem
              label={r.status === 'COMPLETED' ? 'Delete — blocked (approved)' : 'Delete'}
              icon={<Trash2 />}
              danger
              separatorBefore
              disabled={r.status === 'COMPLETED'}
              onClick={() => setConfirmDelete(r)}
            />
          </>
        )}
      />

      {/* Detail — the inspection sheet ------------------------------------- */}
      <Drawer
        open={!!live}
        onClose={() => setDetail(null)}
        title={live?.docNo}
        description={live ? `${live.itemCode} — ${live.itemName}` : ''}
        width="max-w-5xl"
        footer={
          live && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                {live.planDocNo} R{live.planRevision} · inspector {live.inspector}
                {live.approvedBy && ` · approved by ${live.approvedBy}`}
              </span>
              <div className="flex gap-2">
                {!isLocked && (
                  <Button variant="outline" size="sm" onClick={() => openDecision(live)}>
                    Record disposition
                  </Button>
                )}
                {live.status === 'PENDING_APPROVAL' && (
                  <Button variant="success" size="sm" disabled={liveBlockers.length > 0} onClick={() => approve(live)}>
                    Approve
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        {live && liveEval && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StageBadge stage={live.stage} />
              <QmsStatusBadge status={live.status} size="md" />
              <DispositionBadge disposition={live.disposition} size="md" />
              {isLocked && <span className="text-2xs text-fg-subtle">Approved — locked. A correction needs a new inspection.</span>}
            </div>

            {liveCalibration.length > 0 && (
              <Alert tone="danger" title="Calibration blocks this inspection">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {liveCalibration.map((b) => (
                    <li key={b.instrumentCode}>
                      <span className="font-mono">{b.instrumentCode}</span> ({b.instrumentName}) is {b.status.toLowerCase()},
                      due {b.nextDueOn}. Readings for {b.characteristics.join(', ')} are not valid evidence.
                    </li>
                  ))}
                </ul>
              </Alert>
            )}

            <DataGrid
              columns={3}
              items={[
                { label: 'Source', value: live.sourceDocNo || '—', mono: true },
                { label: 'Batch', value: live.batchNo || '—', mono: true },
                { label: 'Lot size', value: `${formatQty(live.lotSize, 0)} ${live.uom}` },
                { label: 'Sample', value: `${formatQty(live.sampleSize, 0)} — ${live.samplingMethod === 'AQL' ? `AQL ${live.aql}` : live.samplingMethod.replace('_', ' ').toLowerCase()}` },
                { label: 'Accept / reject on', value: `${live.acceptNumber} / ${live.rejectNumber} defects` },
                { label: 'Defects found', value: `${liveEval.defectCount} (${liveEval.criticalDefects} critical)` },
                ...(live.supplierCode ? [{ label: 'Supplier', value: live.supplierCode, mono: true }] : []),
                ...(live.machineCode ? [{ label: 'Machine', value: `${live.machineCode} · shift ${live.shift}`, mono: true }] : []),
                ...(live.ncrDocNo ? [{ label: 'NCR raised', value: live.ncrDocNo, mono: true }] : []),
              ]}
            />

            {/* What the rules say ------------------------------------------- */}
            <Alert
              tone={
                liveEval.suggestedDisposition === 'REJECTED'
                  ? 'danger'
                  : liveEval.suggestedDisposition === 'ACCEPTED_WITH_DEVIATION'
                    ? 'warning'
                    : liveEval.suggestedDisposition === 'ACCEPTED'
                      ? 'info'
                      : 'tip'
              }
              title={`The rules arrive at: ${DISPOSITION_LABEL[liveEval.suggestedDisposition].toLowerCase()}`}
            >
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {liveEval.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {live.disposition !== 'PENDING' && live.disposition !== liveEval.suggestedDisposition && (
                <p className="mt-1.5 font-medium text-fg">
                  Recorded as {DISPOSITION_LABEL[live.disposition].toLowerCase()} — an override, kept with its reason.
                </p>
              )}
            </Alert>

            {/* Readings ------------------------------------------------------ */}
            <DetailBlock title={`Characteristics (${liveEval.completed} of ${liveEval.totalChecks} checked)`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '3rem' }}>#</th>
                      <th style={{ minWidth: '15rem' }}>Characteristic</th>
                      <th style={{ width: '6.5rem' }}>Severity</th>
                      <th style={{ width: '10rem' }}>Specification</th>
                      <th style={{ width: '9rem' }}>Reading</th>
                      <th style={{ width: '10rem' }}>Position</th>
                      <th style={{ width: '5rem' }}>Photo</th>
                      <th style={{ width: '5rem' }}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live.readings.map((r, i) => {
                      const v = evaluateReading(r)
                      const inst = r.instrumentCode ? instruments.rows.find((x) => x.code === r.instrumentCode) : undefined
                      const instBad = inst ? ['OVERDUE', 'CONDEMNED'].includes(instrumentStatus(inst)) : !!r.instrumentCode
                      return (
                        <tr key={r.uid} className={v === 'FAIL' ? 'bg-danger/5' : undefined}>
                          <td className="text-2xs text-fg-subtle">{i + 1}</td>
                          <td>
                            <p className="text-xs font-medium text-fg">
                              {r.name}
                              {r.isMandatory && <span className="ml-1 text-danger">*</span>}
                            </p>
                            <p className="text-2xs text-fg-subtle">
                              {r.type.toLowerCase()}
                              {r.instrumentCode && (
                                <span className={cn('ml-1 font-mono', instBad && 'text-danger')}>· {r.instrumentCode}{instBad && ' (not calibrated)'}</span>
                              )}
                            </p>
                          </td>
                          <td><SeverityBadge severity={r.severity} /></td>
                          <td className="text-2xs text-fg-muted tabular">
                            {r.type === 'MEASURED' ? (
                              <>
                                {r.target}
                                {r.uom && ` ${r.uom}`}
                                <span className="block">
                                  {r.lowerLimit ?? '—'} … {r.upperLimit ?? '—'}
                                </span>
                              </>
                            ) : (
                              'Pass / fail'
                            )}
                          </td>
                          <td>
                            {r.type === 'MEASURED' ? (
                              <input
                                type="number"
                                step="any"
                                disabled={isLocked}
                                aria-label={`Reading for ${r.name}`}
                                value={r.actual ?? ''}
                                onChange={(e) => setReading(live, r.uid, { actual: e.target.value === '' ? null : Number(e.target.value) })}
                                className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none disabled:bg-surface-3"
                              />
                            ) : (
                              <select
                                disabled={isLocked}
                                aria-label={`Verdict for ${r.name}`}
                                value={r.verdict}
                                onChange={(e) => setReading(live, r.uid, { verdict: e.target.value as 'PENDING' | 'PASS' | 'FAIL' })}
                                className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none disabled:bg-surface-3"
                              >
                                <option value="PENDING">Not checked</option>
                                <option value="PASS">Pass</option>
                                <option value="FAIL">Fail</option>
                              </select>
                            )}
                          </td>
                          <td><ToleranceBar reading={r} /></td>
                          <td className="text-center">
                            {r.requiresPhoto ? (
                              <button
                                type="button"
                                disabled={isLocked}
                                aria-label={`Photograph for ${r.name}`}
                                title={r.photoAttached ? 'Photograph attached' : 'Photograph required'}
                                onClick={() => setReading(live, r.uid, { photoAttached: !r.photoAttached })}
                                className={cn(
                                  'inline-flex h-6 w-6 items-center justify-center rounded disabled:opacity-40',
                                  r.photoAttached ? 'bg-success/15 text-success' : 'bg-danger/10 text-danger',
                                )}
                              >
                                <Camera className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <span className="text-2xs text-fg-subtle">—</span>
                            )}
                          </td>
                          <td><VerdictCell reading={r} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-2xs text-fg-subtle">
                An asterisk marks a mandatory characteristic — one failing fails the lot regardless of the accept number.
                A characteristic that demands a photograph fails until one is attached.
              </p>
            </DetailBlock>

            {/* Defects ------------------------------------------------------- */}
            <DetailBlock
              title={`Defects found in the sample (${liveEval.defectCount} against an accept number of ${live.acceptNumber})`}
              actions={
                !isLocked && (
                  <Button size="xs" variant="outline" icon={<Plus className="h-3 w-3" />} onClick={() => setDefectOpen(true)}>
                    Record defect
                  </Button>
                )
              }
            >
              {!live.defects.length ? (
                <p className="text-xs text-fg-subtle">No defects recorded in the sample.</p>
              ) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th style={{ width: '7rem' }}>Code</th>
                        <th>Defect</th>
                        <th style={{ width: '6.5rem' }}>Severity</th>
                        <th className="text-right" style={{ width: '6rem' }}>Quantity</th>
                        <th style={{ width: '11rem' }}>Found at</th>
                        <th style={{ width: '3rem' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {live.defects.map((dft) => (
                        <tr key={dft.uid}>
                          <td className="font-mono text-2xs text-brand-600">{dft.defectCode}</td>
                          <td>
                            <p className="text-xs text-fg">{dft.defectName}</p>
                            {dft.remarks && <p className="text-2xs text-fg-subtle">{dft.remarks}</p>}
                          </td>
                          <td><SeverityBadge severity={dft.severity} /></td>
                          <td className="text-right tabular text-xs">{dft.qty}</td>
                          <td className="text-2xs text-fg-muted">{dft.source}</td>
                          <td className="text-center">
                            {!isLocked && (
                              <button
                                type="button"
                                aria-label={`Remove ${dft.defectName}`}
                                onClick={() => update(live.uid, { defects: live.defects.filter((x) => x.uid !== dft.uid), version: live.version + 1 })}
                                className="text-fg-subtle hover:text-danger"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DetailBlock>

            {live.dispositionReason && (
              <DetailBlock title="Disposition reason">
                <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">{live.dispositionReason}</p>
              </DetailBlock>
            )}

            {liveBlockers.length > 0 && live.status !== 'COMPLETED' && (
              <Alert tone="warning" title="Before this can be approved">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {liveBlockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </div>
        )}
      </Drawer>

      {/* Raise ---------------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Raise an inspection"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Raise inspection
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Inspection plan"
            required
            containerClassName="sm:col-span-2"
            value={form.planDocNo}
            error={errors.planDocNo}
            onChange={(e) => setForm({ ...form, planDocNo: e.target.value })}
            options={[
              { value: '', label: 'Select a plan…' },
              ...activePlans.map((p) => ({ value: p.docNo, label: `${STAGE_LABEL[p.stage]} — ${p.name} (${p.itemCode})` })),
            ]}
          />
          <Input label="Source document" required value={form.sourceDocNo} error={errors.sourceDocNo} placeholder="GRN/P1/2627/00330" onChange={(e) => setForm({ ...form, sourceDocNo: e.target.value })} />
          <Input label="Batch or lot number" value={form.batchNo} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} />
          <Input label="Lot size" type="number" required value={form.lotSize} error={errors.lotSize} onChange={(e) => setForm({ ...form, lotSize: e.target.value })} />
          <Input label="Supplier code" value={form.supplierCode} placeholder="SUP-00001" onChange={(e) => setForm({ ...form, supplierCode: e.target.value })} />
          <Input label="Machine" value={form.machineCode} placeholder="MC-0004" onChange={(e) => setForm({ ...form, machineCode: e.target.value })} />
          <Select label="Shift" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} options={['A', 'B', 'C'].map((s) => ({ value: s, label: `Shift ${s}` }))} />
        </div>

        {previewSampling && selectedPlan && (
          <Alert tone="info" className="mt-4">
            <span className="font-semibold text-fg">{previewSampling.sampleSize}</span> pieces will be drawn from a lot of{' '}
            {Number(form.lotSize).toLocaleString('en-IN')} and checked against{' '}
            <span className="font-semibold text-fg">{selectedPlan.characteristics.length}</span> characteristics. The lot
            is accepted on {previewSampling.acceptNumber} defect{previewSampling.acceptNumber === 1 ? '' : 's'} and
            rejected on {previewSampling.rejectNumber}. {previewSampling.note}
          </Alert>
        )}
      </Modal>

      {/* Disposition ---------------------------------------------------------- */}
      <Modal
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title="Record the disposition"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => deciding && recordDecision(deciding)}>
              Record
            </Button>
          </>
        }
      >
        {deciding && (
          <div className="space-y-3.5">
            {(() => {
              const e = evaluateInspection(deciding)
              return (
                <Alert tone={e.suggestedDisposition === 'REJECTED' ? 'danger' : e.suggestedDisposition === 'ACCEPTED' ? 'info' : 'warning'}>
                  The rules arrive at <span className="font-semibold text-fg">{DISPOSITION_LABEL[e.suggestedDisposition].toLowerCase()}</span>. {e.reasons[0]}
                </Alert>
              )
            })()}
            <Select
              label="Disposition"
              required
              value={decision}
              onChange={(e) => setDecision(e.target.value as Disposition)}
              options={DISPOSITIONS.map((dp) => ({ value: dp, label: DISPOSITION_LABEL[dp] }))}
            />
            <Textarea
              label="Reason"
              required={decision !== 'ACCEPTED'}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What was found, and why this decision. Read by the supplier, the customer and the auditor."
            />
            <p className="text-2xs text-fg-subtle">
              The whole lot of {formatQty(deciding.lotSize, 0)} {deciding.uom} moves to{' '}
              {decision === 'REJECTED' ? 'rejected' : decision === 'HOLD' ? 'held for rework or review' : 'accepted'}.
            </p>
          </div>
        )}
      </Modal>

      {/* Add defect ----------------------------------------------------------- */}
      <Modal
        open={defectOpen}
        onClose={() => setDefectOpen(false)}
        title="Record a defect"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDefectOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => live && addDefect(live)}>
              Record
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select
            label="Defect"
            required
            value={defectDraft.defectCode}
            onChange={(e) => setDefectDraft({ ...defectDraft, defectCode: e.target.value })}
            options={[
              { value: '', label: 'Select a defect…' },
              ...defects.rows.filter((d) => d.isActive).map((d) => ({ value: d.code, label: `${d.code} — ${d.name} (${d.severity.toLowerCase()})` })),
            ]}
          />
          <Input label="Quantity found in the sample" type="number" required value={defectDraft.qty} onChange={(e) => setDefectDraft({ ...defectDraft, qty: e.target.value })} />
          <Input label="Found at" value={defectDraft.source} placeholder="Machine, operation or supplier batch" onChange={(e) => setDefectDraft({ ...defectDraft, source: e.target.value })} />
          <Textarea label="Remarks" rows={2} value={defectDraft.remarks} onChange={(e) => setDefectDraft({ ...defectDraft, remarks: e.target.value })} />
          {live && (
            <p className="text-2xs text-fg-subtle">
              Count what was found in the sample of {live.sampleSize}, not across the whole lot — the accept number of{' '}
              {live.acceptNumber} is a sample number.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete inspection"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
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
        <p className="text-sm text-fg-muted">
          {confirmDelete?.docNo} will be marked deleted, not physically removed. It has not been approved.
        </p>
      </Modal>

      {live && (
        <p className="mt-4 text-2xs text-fg-subtle">
          Raised {formatDateTime(live.createdAt)}
          {live.approvedAt && ` · approved ${formatDateTime(live.approvedAt)}`}
        </p>
      )}
      {!live && (
        <div className="mt-4 grid gap-2 text-xs text-fg-muted sm:grid-cols-3">
          <p className="card p-3">
            <Badge tone="brand" size="sm" dot={false}>Sampling</Badge>
            <span className="mt-1.5 block">
              AQL plans follow ISO 2859-1 general level II. The sample and the accept number come from the lot size, so
              a bigger lot does not mean a proportionally bigger sample.
            </span>
          </p>
          <p className="card p-3">
            <Badge tone="warning" size="sm" dot={false}>Override</Badge>
            <span className="mt-1.5 block">
              The disposition the rules reach is always shown. An inspector can decide otherwise, with a reason, and both
              are kept.
            </span>
          </p>
          <p className="card p-3">
            <Badge tone="danger" size="sm" dot={false}>Calibration</Badge>
            <span className="mt-1.5 block">
              An inspection cannot be approved on readings taken with an instrument that is out of calibration. The
              reading is not evidence.
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
