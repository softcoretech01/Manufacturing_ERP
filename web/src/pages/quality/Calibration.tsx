import { useMemo, useState, useEffect } from 'react'
import { Plus, Stamp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { QmsStatusBadge, useQualityData } from '@/components/quality/QmsShell'
import { cn } from '@/lib/cn'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import { instrumentStatus } from '@/lib/qmsFlow'
import { newUid } from '@/store/data'
import { instrumentsApi } from '@/api/instruments'
import type { Instrument } from '@/types/quality'

/**
 * Calibration register (Ch 16).
 *
 * Status is computed from the due date rather than typed, so an instrument
 * cannot be "valid" in the register while being three weeks past due. That
 * matters because inspection approval reads this: a reading taken with an
 * overdue instrument is not evidence, and the gate is only as good as the
 * status behind it.
 */

const dayDiff = (from: string) => Math.round((new Date(from).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000)

export function CalibrationPage() {
  const toast = useToast()
  const { inspections } = useQualityData()
  const [rows, setRows] = useState<Instrument[]>([])

  const fetchInstruments = async () => {
    try {
      const data = await instrumentsApi.getAll()
      setRows(data || [])
    } catch (e) {
      toast.error('Error', 'Failed to fetch instruments')
    }
  }

  useEffect(() => {
    fetchInstruments()
  }, [])

  const [tab, setTab] = useState('due')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Instrument | null>(null)
  const [form, setForm] = useState({ code: '', name: '', instrumentType: '', make: '', serialNo: '', range: '', leastCount: '', location: '', custodian: '', calibrationFrequencyDays: '365', lastCalibratedOn: '', agency: '', certificateNo: '', observedErrorPct: '', permittedErrorPct: '1', remarks: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<Instrument | null>(null)
  const [calibrating, setCalibrating] = useState<Instrument | null>(null)
  const [calDraft, setCalDraft] = useState({ date: '', certificateNo: '', agency: '', observedErrorPct: '' })

  /** Status is always computed — the stored field only carries the two states a date cannot express. */
  const withStatus = useMemo(() => rows.map((i) => ({ ...i, status: instrumentStatus(i) })), [rows])

  /** How many open inspections each instrument's readings are propping up. */
  const usageOf = (code: string) =>
    inspections.rows.filter((i) => i.status !== 'COMPLETED' && i.readings.some((r) => r.instrumentCode === code)).length

  const counts = {
    due: withStatus.filter((i) => i.status === 'DUE' || i.status === 'OVERDUE').length,
    overdue: withStatus.filter((i) => i.status === 'OVERDUE').length,
    out: withStatus.filter((i) => i.status === 'UNDER_CALIBRATION').length,
    all: withStatus.length,
  }

  const filtered = withStatus.filter((i) => {
    if (tab === 'due') return i.status === 'DUE' || i.status === 'OVERDUE'
    if (tab === 'overdue') return i.status === 'OVERDUE'
    if (tab === 'out') return i.status === 'UNDER_CALIBRATION'
    return true
  })

  const blocking = withStatus.filter((i) => i.status === 'OVERDUE' && usageOf(i.code) > 0)

  const columns: Column<Instrument>[] = [
    { key: 'code', header: 'Instrument', sortable: true, width: '8rem', render: (i) => <span className="font-mono text-xs font-medium text-brand-600">{i.code}</span> },
    { key: 'name', header: 'Name', sortable: true, render: (i) => (<><p className="text-xs font-medium text-fg">{i.name}</p><p className="text-2xs text-fg-subtle">{i.make} · {i.serialNo}</p></>) },
    { key: 'instrumentType', header: 'Type', sortable: true, width: '10rem', render: (i) => <span className="text-xs text-fg-muted">{i.instrumentType}</span> },
    { key: 'range', header: 'Range', width: '11rem', render: (i) => <span className="text-2xs text-fg-muted">{i.range} · {i.leastCount}</span> },
    { key: 'location', header: 'Location', sortable: true, width: '11rem' },
    { key: 'lastCalibratedOn', header: 'Last calibrated', sortable: true, width: '9rem', accessor: (i) => i.lastCalibratedOn, render: (i) => formatDate(i.lastCalibratedOn) },
    {
      key: 'nextDueOn', header: 'Next due', sortable: true, width: '10rem', accessor: (i) => i.nextDueOn,
      render: (i) => {
        const days = dayDiff(i.nextDueOn)
        return (
          <span className={cn('text-xs', days < 0 ? 'font-medium text-danger' : days <= 15 ? 'text-warning' : '')}>
            {formatDate(i.nextDueOn)}
            <span className="ml-1 text-2xs">{days < 0 ? `${-days}d over` : `${days}d`}</span>
          </span>
        )
      },
    },
    { key: 'error', header: 'Error', align: 'right', width: '7rem', accessor: (i) => i.observedErrorPct, render: (i) => <span className={cn('text-xs tabular', i.observedErrorPct > i.permittedErrorPct ? 'text-danger' : 'text-fg-muted')}>{i.observedErrorPct}% / {i.permittedErrorPct}%</span> },
    { key: 'usage', header: 'Open uses', align: 'right', width: '7rem', accessor: (i) => usageOf(i.code), render: (i) => (usageOf(i.code) ? <span className="text-xs tabular text-warning">{usageOf(i.code)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (i) => <QmsStatusBadge status={i.status} /> },
  ]

  function openCreate() {
    setEditing(null)
    setForm({ code: '', name: '', instrumentType: '', make: '', serialNo: '', range: '', leastCount: '', location: 'Quality Lab', custodian: 'S. Meena', calibrationFrequencyDays: '365', lastCalibratedOn: new Date().toISOString().slice(0, 10), agency: '', certificateNo: '', observedErrorPct: '0', permittedErrorPct: '1', remarks: '' })
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(i: Instrument) {
    setEditing(i)
    setForm({ code: i.code ?? '', name: i.name ?? '', instrumentType: i.instrumentType ?? '', make: i.make ?? '', serialNo: i.serialNo ?? '', range: i.range ?? '', leastCount: i.leastCount ?? '', location: i.location ?? '', custodian: i.custodian ?? '', calibrationFrequencyDays: String(i.calibrationFrequencyDays ?? '365'), lastCalibratedOn: i.lastCalibratedOn ?? '', agency: i.agency ?? '', certificateNo: i.certificateNo ?? '', observedErrorPct: String(i.observedErrorPct ?? 0), permittedErrorPct: String(i.permittedErrorPct ?? 0), remarks: i.remarks ?? '' })
    setErrors({})
    setFormOpen(true)
  }

  const nextDueFrom = (last: string, freq: number) => {
    const d = new Date(last)
    d.setDate(d.getDate() + freq)
    return d.toISOString().slice(0, 10)
  }

  function validate() {
    const e: Record<string, string> = {}
    // Code is auto-generated on backend
    if (!form.name.trim()) e.name = 'A name is required.'
    if (!(Number(form.calibrationFrequencyDays) > 0)) e.calibrationFrequencyDays = 'A calibration interval in days is required.'
    if (!form.lastCalibratedOn) e.lastCalibratedOn = 'The last calibration date sets the next due date.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    const freq = Number(form.calibrationFrequencyDays)
    const patch = {
      name: form.name.trim(), instrumentType: form.instrumentType.trim(),
      make: form.make.trim(), serialNo: form.serialNo.trim(), range: form.range.trim(), leastCount: form.leastCount.trim(),
      location: form.location.trim(), custodian: form.custodian.trim(), calibrationFrequencyDays: freq,
      lastCalibratedOn: form.lastCalibratedOn, nextDueOn: nextDueFrom(form.lastCalibratedOn, freq),
      agency: form.agency.trim(), certificateNo: form.certificateNo.trim(),
      observedErrorPct: Number(form.observedErrorPct) || 0, permittedErrorPct: Number(form.permittedErrorPct) || 0,
      remarks: form.remarks.trim(),
    }
    try {
      if (editing) {
        await instrumentsApi.update((editing as any).id, patch)
        toast.success('Instrument updated', `${editing.code} next due ${formatDate(patch.nextDueOn)}.`)
      } else {
        const res = await instrumentsApi.create(patch as any)
        toast.success('Instrument registered', `${res.code} next due ${formatDate(patch.nextDueOn)}.`)
      }
      fetchInstruments()
      setFormOpen(false)
    } catch (e: any) {
      toast.error('Error', e.message || 'Failed to save')
    }
  }

  function recordCalibration(i: Instrument) {
    if (!calDraft.date) { toast.error('A date is required', 'Record when the calibration was carried out.'); return }
    const observed = Number(calDraft.observedErrorPct) || 0
    if (observed > i.permittedErrorPct) {
      toast.error('Outside the permitted error', `Observed ${observed}% against a permitted ${i.permittedErrorPct}%. The instrument must be adjusted or condemned, not returned to service.`)
      return
    }
    instrumentsApi.update((i as any).id, {
      lastCalibratedOn: calDraft.date,
      nextDueOn: nextDueFrom(calDraft.date, i.calibrationFrequencyDays),
      certificateNo: calDraft.certificateNo.trim() || i.certificateNo,
      agency: calDraft.agency.trim() || i.agency,
      observedErrorPct: observed,
      status: 'VALID',
    }).then(() => {
      fetchInstruments()
      toast.success('Calibration recorded', `${i.code} valid until ${formatDate(nextDueFrom(calDraft.date, i.calibrationFrequencyDays))}. Inspections using it can be approved again.`)
      setCalibrating(null)
    }).catch((e: any) => toast.error('Error', e.message))
  }

  return (
    <div>
      <PageHeader
        title="Calibration"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Quality', to: '/quality' }, { label: 'Calibration' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>Register instrument</Button>}
        tabs={<Tabs active={tab} onChange={setTab} tabs={[
          { id: 'due', label: 'Due & overdue', count: counts.due },
          { id: 'overdue', label: 'Overdue', count: counts.overdue },
          { id: 'out', label: 'At the agency', count: counts.out },
          { id: 'all', label: 'All', count: counts.all },
        ]} />}
      />

      {blocking.length > 0 && (
        <Alert tone="danger" className="mb-4">
          {blocking.length} overdue instrument{blocking.length === 1 ? '' : 's'} {blocking.length === 1 ? 'is' : 'are'} in use on open inspections —{' '}
          {blocking.map((i) => `${i.code} (${usageOf(i.code)})`).join(', ')}. Those inspections cannot be approved until the
          instrument is recalibrated and the readings retaken.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(i) => String((i as any).id ?? i.uid)}
        searchPlaceholder="Search code, name, type or location…"
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'calibration-register', 'Calibration register', columnsFromTable(columns), filtered); toast.success('Export ready', `${n} rows written.`) }}
        onRowClick={openEdit}
        rowClassName={(i) => (instrumentStatus(i) === 'OVERDUE' ? 'bg-danger/5' : instrumentStatus(i) === 'DUE' ? 'bg-warning/5' : undefined)}
        emptyTitle="No instruments"
        emptyDescription="Register the gauges and testers the inspection plans call for."
        rowActions={(i) => (
          <>
            <MenuItem label="Edit" onClick={() => openEdit(i)} />
            <MenuItem label="Record a calibration" icon={<Stamp />} separatorBefore onClick={() => { setCalDraft({ date: new Date().toISOString().slice(0, 10), certificateNo: '', agency: i.agency, observedErrorPct: String(i.observedErrorPct) }); setCalibrating(i) }} />
            <MenuItem label="Send to the agency" disabled={i.status === 'UNDER_CALIBRATION'} onClick={() => { update(i.uid, { status: 'UNDER_CALIBRATION', version: i.version + 1 }); toast.success('Sent out', `${i.code} marked as at the agency and withdrawn from use.`) }} />
            <MenuItem label="Condemn" danger disabled={i.status === 'CONDEMNED'} onClick={() => { update(i.uid, { status: 'CONDEMNED', version: i.version + 1 }); toast.success('Condemned', `${i.code} withdrawn permanently. Any inspection relying on it must be retaken.`) }} />
            <MenuItem label={usageOf(i.code) ? `Delete — blocked (${usageOf(i.code)} open inspections)` : 'Delete'} icon={<Trash2 />} danger separatorBefore disabled={usageOf(i.code) > 0} onClick={() => setConfirmDelete(i)} />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Register an instrument'}
        size="lg"
        footer={<><Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>{editing ? 'Save changes' : 'Register'}</Button></>}
      >
        <div className="grid gap-3.5 sm:grid-cols-3">
          <Input label="Code" required value={form.code} error={errors.code} placeholder="MI-0011" onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input label="Name" required containerClassName="sm:col-span-2" value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Type" value={form.instrumentType} placeholder="Micrometer" onChange={(e) => setForm({ ...form, instrumentType: e.target.value })} />
          <Input label="Make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
          <Input label="Serial number" value={form.serialNo} onChange={(e) => setForm({ ...form, serialNo: e.target.value })} />
          <Input label="Range" value={form.range} placeholder="0–25 mm" onChange={(e) => setForm({ ...form, range: e.target.value })} />
          <Input label="Least count" value={form.leastCount} placeholder="0.001 mm" onChange={(e) => setForm({ ...form, leastCount: e.target.value })} />
          <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Input label="Custodian" value={form.custodian} onChange={(e) => setForm({ ...form, custodian: e.target.value })} />
          <Input label="Calibration interval (days)" type="number" required value={form.calibrationFrequencyDays} error={errors.calibrationFrequencyDays} onChange={(e) => setForm({ ...form, calibrationFrequencyDays: e.target.value })} />
          <Input label="Last calibrated" type="date" required value={form.lastCalibratedOn} error={errors.lastCalibratedOn} onChange={(e) => setForm({ ...form, lastCalibratedOn: e.target.value })} />
          <Input label="Agency" containerClassName="sm:col-span-2" value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} />
          <Input label="Certificate number" value={form.certificateNo} onChange={(e) => setForm({ ...form, certificateNo: e.target.value })} />
          <Input label="Observed error (%)" type="number" step="0.1" value={form.observedErrorPct} onChange={(e) => setForm({ ...form, observedErrorPct: e.target.value })} />
          <Input label="Permitted error (%)" type="number" step="0.1" value={form.permittedErrorPct} onChange={(e) => setForm({ ...form, permittedErrorPct: e.target.value })} />
          <Textarea label="Remarks" containerClassName="sm:col-span-3" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>
        {form.lastCalibratedOn && Number(form.calibrationFrequencyDays) > 0 && (
          <Alert tone="info" className="mt-4">
            Next due <span className="font-semibold text-fg">{formatDate(nextDueFrom(form.lastCalibratedOn, Number(form.calibrationFrequencyDays)))}</span>.
            Status is computed from that date, not typed — an instrument cannot read as valid while it is past due.
          </Alert>
        )}
      </Modal>

      <Modal
        open={!!calibrating}
        onClose={() => setCalibrating(null)}
        title={calibrating ? `Record a calibration — ${calibrating.code}` : ''}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setCalibrating(null)}>Cancel</Button><Button variant="primary" onClick={() => calibrating && recordCalibration(calibrating)}>Record</Button></>}
      >
        {calibrating && (
          <div className="space-y-3.5">
            <Input label="Calibrated on" type="date" required value={calDraft.date} onChange={(e) => setCalDraft({ ...calDraft, date: e.target.value })} />
            <Input label="Certificate number" value={calDraft.certificateNo} onChange={(e) => setCalDraft({ ...calDraft, certificateNo: e.target.value })} />
            <Input label="Agency" value={calDraft.agency} onChange={(e) => setCalDraft({ ...calDraft, agency: e.target.value })} />
            <Input label="Observed error (%)" type="number" step="0.1" value={calDraft.observedErrorPct} hint={`Permitted error is ${calibrating.permittedErrorPct}%. Above it the instrument cannot go back into service.`} onChange={(e) => setCalDraft({ ...calDraft, observedErrorPct: e.target.value })} />
            {calDraft.date && (
              <p className="text-2xs text-fg-subtle">
                Next due {formatDate(nextDueFrom(calDraft.date, calibrating.calibrationFrequencyDays))}, {calibrating.calibrationFrequencyDays} days on.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete instrument"
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => { if (confirmDelete) { remove(confirmDelete.uid); toast.success('Deleted', `${confirmDelete.code} was soft-deleted; the calibration history is retained.`) } setConfirmDelete(null) }}>Delete</Button></>}
      >
        <p className="text-sm text-fg-muted">{confirmDelete?.code} will be marked deleted, not physically removed. No open inspection relies on it.</p>
      </Modal>
    </div>
  )
}
