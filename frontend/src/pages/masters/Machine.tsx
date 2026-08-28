import { useMemo, useState, useEffect } from 'react'
import { Activity, AlertTriangle, Cog, Gauge, Plus, Upload, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import {
  GovernanceCard,
  LifecycleTrail,
  MasterActions,
  MasterStatusBadge,
  RevisionPanel,
  RulesCard,
  WhereUsedPanel,
} from '@/components/masters/MasterShell'
import { formatDate } from '@/lib/format'
// mock import removed
import type { Machine } from '@/types/masters'
import * as api from '@/api/masters'

const STATE_TONE = {
  RUNNING: 'success',
  IDLE: 'neutral',
  MAINTENANCE: 'warning',
  BREAKDOWN: 'danger',
  DECOMMISSIONED: 'neutral',
} as const

const CRITICALITY_HINT: Record<Machine['criticality'], string> = {
  A: 'Single point of failure — a stoppage halts the line. Spares held, PM never deferred.',
  B: 'Important but recoverable — an alternate route exists at reduced throughput.',
  C: 'Low impact — work can be redistributed while it is down.',
}

function pmOverdue(m: Machine) {
  return !!m.nextPmOn && new Date(m.nextPmOn) < new Date()
}

function MachineDetail({ m, onClose, onEdit }: { m: Machine; onClose: () => void; onEdit: () => void }) {
  const [tab, setTab] = useState('general')
  const overdue = pmOverdue(m)

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-3xl"
      title={`${m.code} — ${m.name}`}
      description={`${m.machineGroup} · ${m.lineCode} · ${m.workCentreCode}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MasterStatusBadge status={m.status} />
            <Badge tone={STATE_TONE[m.currentState]} size="sm">{m.currentState.toLowerCase()}</Badge>
            <Badge tone={m.criticality === 'A' ? 'danger' : m.criticality === 'B' ? 'warning' : 'neutral'} size="sm" dot={false}>
              Criticality {m.criticality}
            </Badge>
          </div>
          <MasterActions
            status={m.status}
            usageCount={m.whereUsed.filter((w) => w.isOpen).length}
            onEdit={onEdit}
          />
        </div>
      }
    >
      <div className="space-y-4">
        <LifecycleTrail status={m.status} />

        {m.currentState === 'BREAKDOWN' && (
          <Alert tone="danger" title="Machine is down">
            Production scheduled on this work centre needs rerouting or the plan slips. A breakdown
            call is open against it.
          </Alert>
        )}
        {overdue && m.currentState !== 'DECOMMISSIONED' && (
          <Alert tone="warning" title="Preventive maintenance overdue">
            Due {formatDate(m.nextPmOn!)}. On a criticality-{m.criticality} machine, deferring PM is
            a decision someone should make deliberately rather than by omission.
          </Alert>
        )}

        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'general', label: 'General' },
            { id: 'capacity', label: 'Capacity & operations' },
            { id: 'maintenance', label: 'Maintenance' },
            { id: 'whereused', label: 'Where used', count: m.whereUsed.length },
            { id: 'revisions', label: 'Revisions', count: m.revisions.length },
          ]}
        />

        {tab === 'general' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Identification" icon={<Cog className="h-4 w-4" />} />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Machine code', value: m.code, mono: true },
                    { label: 'Name', value: m.name },
                    { label: 'Group', value: m.machineGroup },
                    { label: 'Manufacturer', value: m.manufacturer },
                    { label: 'Model', value: m.modelNumber, mono: true },
                    { label: 'Serial number', value: m.serialNumber, mono: true },
                    { label: 'Year of manufacture', value: m.yearOfManufacture },
                    { label: 'Asset code', value: m.assetCode, mono: true },
                  ]}
                />
              </CardBody>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader title="Placement" />
                <CardBody>
                  <DataGrid
                    columns={1}
                    items={[
                      { label: 'Plant', value: m.plantName ?? m.plantCode },
                      { label: 'Line', value: m.lineName ?? m.lineCode },
                      { label: 'Work centre', value: m.workCentreName ?? m.workCentreCode },
                      { label: 'Installed on', value: formatDate(m.installedOn) },
                      { label: 'Warranty until', value: m.warrantyUntil ? formatDate(m.warrantyUntil) : 'Expired / none' },
                    ]}
                  />
                </CardBody>
              </Card>
              <GovernanceCard
                createdBy={m.createdBy}
                createdAt={m.createdDate as any}
                modifiedBy={m.modifiedBy}
                modifiedAt={m.modifiedDate as any}
                approvedBy={null}
                approvedAt={null}
                revision={1}
                effectiveFrom={null as any}
                effectiveTo={null}
              />
            </div>
          </div>
        )}

        {tab === 'capacity' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Capacity" icon={<Gauge className="h-4 w-4" />} description="Feeds finite capacity planning" />
              <CardBody className="space-y-3">
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Rated capacity', value: `${m.capacityPerHour} ${m.capacityUom}/hour` },
                    { label: 'Power', value: `${m.powerKw} kW` },
                    { label: 'Operators required', value: m.operatorsRequired },
                  ]}
                />
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-fg-muted">OEE</span>
                    <span className="text-fg tabular">{m.oeePct}%</span>
                  </div>
                  <ProgressBar value={m.oeePct} tone={m.oeePct >= 80 ? 'success' : m.oeePct >= 60 ? 'warning' : 'danger'} />
                  <p className="mt-1.5 text-2xs text-fg-subtle">
                    Overall equipment effectiveness = availability × performance × quality. Planning
                    uses rated capacity discounted by OEE, not the nameplate figure — that is why
                    the plan and reality usually agree.
                  </p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Operations" description="What this machine is certified to do" />
              <CardBody>
                {m.operations.length === 0 ? (
                  <p className="text-xs text-fg-muted">No operations mapped — this machine cannot appear on a routing.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {m.operations.map((o) => (
                      <Badge key={o} tone="progress" size="sm" dot={false}>{o}</Badge>
                    ))}
                  </div>
                )}
                <Alert tone="info" className="mt-3">
                  A routing step can only be assigned to a machine that lists the operation. That
                  check is what stops a production order being scheduled onto equipment that
                  physically cannot perform the step.
                </Alert>
              </CardBody>
            </Card>
          </div>
        )}

        {tab === 'maintenance' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Preventive maintenance" icon={<Wrench className="h-4 w-4" />} />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'PM frequency', value: `Every ${m.pmFrequencyDays} days` },
                    { label: 'Last PM', value: m.lastPmOn ? formatDate(m.lastPmOn) : 'Never' },
                    {
                      label: 'Next PM due',
                      value: m.nextPmOn ? (
                        <span className={overdue ? 'font-medium text-danger' : 'text-fg'}>
                          {formatDate(m.nextPmOn)}{overdue && ' — overdue'}
                        </span>
                      ) : '—',
                    },
                    { label: 'Current state', value: m.currentState.toLowerCase() },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Criticality" />
              <CardBody>
                <div className="flex items-start gap-3">
                  <Badge tone={m.criticality === 'A' ? 'danger' : m.criticality === 'B' ? 'warning' : 'neutral'}>
                    Class {m.criticality}
                  </Badge>
                  <p className="text-xs text-fg-muted">{CRITICALITY_HINT[m.criticality]}</p>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {tab === 'whereused' && <WhereUsedPanel entries={m.whereUsed} />}
        {tab === 'revisions' && <RevisionPanel revisions={m.revisions} />}
      </div>
    </Drawer>
  )
}

/* ── Client-side mirror of the server's machine rules ──────────────────────
   The API is the authority; this exists so the user sees the problem next to
   the field instead of as a toast after a round trip. Keep the two in step. */
const CURRENT_YEAR = new Date().getFullYear()

function validateMachine(f: any, wcsForLine: any[]): Record<string, string> {
  const e: Record<string, string> = {}
  const text = (v: any) => (typeof v === 'string' ? v.trim() : v ?? '')

  if (!text(f.name)) e.name = 'Name is required.'
  else if (text(f.name).length < 2) e.name = 'Name must be at least 2 characters.'
  else if (text(f.name).length > 150) e.name = 'Name cannot exceed 150 characters.'

  if (!text(f.manufacturer)) e.manufacturer = 'Manufacturer is required.'
  else if (text(f.manufacturer).length > 150) e.manufacturer = 'Manufacturer cannot exceed 150 characters.'

  if (!f.machineGroupId) e.machineGroupId = 'Machine group is required.'
  if (!f.plantId) e.plantId = 'Plant is required.'
  if (!f.lineId) e.lineId = 'Line is required.'
  if (!f.workCentreId) e.workCentreId = 'Work centre is required.'
  else if (f.lineId && !wcsForLine.some((w) => w.id === Number(f.workCentreId))) {
    e.workCentreId = 'This work centre is not on the selected line.'
  }

  if (text(f.modelNumber).length > 100) e.modelNumber = 'Model number cannot exceed 100 characters.'
  if (text(f.serialNumber).length > 100) e.serialNumber = 'Serial number cannot exceed 100 characters.'
  if (text(f.assetCode).length > 100) e.assetCode = 'Asset code cannot exceed 100 characters.'

  const cap = Number(f.capacityPerHour)
  if (f.capacityPerHour === '' || f.capacityPerHour === undefined || f.capacityPerHour === null || Number.isNaN(cap)) {
    e.capacityPerHour = 'Capacity per hour is required.'
  } else if (cap <= 0) e.capacityPerHour = 'Capacity must be greater than zero.'
  else if (cap > 99999999.99) e.capacityPerHour = 'Capacity is unrealistically large.'

  if (!text(f.capacityUom)) e.capacityUom = 'Capacity UOM is required.'

  if (f.powerKw !== '' && f.powerKw !== undefined && f.powerKw !== null) {
    const kw = Number(f.powerKw)
    if (Number.isNaN(kw) || kw < 0) e.powerKw = 'Power cannot be negative.'
    else if (kw > 99999999.99) e.powerKw = 'Power is unrealistically large.'
  }

  if (f.operatorsRequired !== '' && f.operatorsRequired !== undefined && f.operatorsRequired !== null) {
    const ops = Number(f.operatorsRequired)
    if (Number.isNaN(ops) || ops < 0) e.operatorsRequired = 'Operators cannot be negative.'
    else if (ops > 100) e.operatorsRequired = 'At most 100 operators.'
  }

  const pm = Number(f.pmFrequencyDays)
  if (f.pmFrequencyDays === '' || f.pmFrequencyDays === undefined || f.pmFrequencyDays === null || Number.isNaN(pm)) {
    e.pmFrequencyDays = 'PM frequency is required.'
  } else if (pm < 1) e.pmFrequencyDays = 'PM frequency must be at least 1 day.'
  else if (pm > 3650) e.pmFrequencyDays = 'PM frequency cannot exceed 3650 days (10 years).'

  if (f.yearOfManufacture !== '' && f.yearOfManufacture !== undefined && f.yearOfManufacture !== null) {
    const y = Number(f.yearOfManufacture)
    if (Number.isNaN(y) || y < 1900 || y > CURRENT_YEAR + 1) {
      e.yearOfManufacture = `Year must be between 1900 and ${CURRENT_YEAR + 1}.`
    }
  }

  if (f.oeePct !== '' && f.oeePct !== undefined && f.oeePct !== null) {
    const oee = Number(f.oeePct)
    if (Number.isNaN(oee) || oee < 0 || oee > 100) e.oeePct = 'OEE must be between 0 and 100.'
  }

  if (f.installedOn && f.warrantyUntil && f.warrantyUntil < f.installedOn) {
    e.warrantyUntil = 'Warranty cannot end before the machine was installed.'
  }
  if (f.lastPmOn && f.nextPmOn && f.nextPmOn < f.lastPmOn) {
    e.nextPmOn = 'Next PM cannot be before the last PM.'
  }
  return e
}

export function MachineMasterPage() {
  const toast = useToast()

  const [machines, setMachines] = useState<any[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [plants, setPlants] = useState<any[]>([])
  const [lines, setLines] = useState<any[]>([])
  const [workCentres, setWorkCentres] = useState<any[]>([])

  const loadMachines = async () => {
    try {
      const data = await api.getMachines()
      setMachines(data.map((m: any) => ({ ...m, uid: String(m.id), whereUsed: [], revisions: [] })))
      setLoadError(null)
    } catch (e: any) {
      setLoadError(e?.message ?? 'Unknown error')
      toast.error('Failed to load machines', e?.message)
    }
  }

  const loadLookups = async () => {
    try {
      const [g, p, l, w] = await Promise.all([
        api.getMachineGroups(),
        api.getProductionPlants(),
        api.getProductionLines(),
        api.getWorkCentres(),
      ])
      setGroups(g)
      setPlants(p)
      setLines(l)
      setWorkCentres(w)
    } catch (e: any) {
      toast.error('Failed to load machine lookups', e?.message)
    }
  }

  useEffect(() => {
    loadMachines()
    loadLookups()
  }, [])

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'machines', 'Machines', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('list')
  const [detail, setDetail] = useState<Machine | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState<any>({ operations: [], criticality: 'C', currentState: 'IDLE' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')

  // Work centres belong to a line, and lines to a plant — so each dropdown is
  // narrowed by the one above it rather than offering impossible combinations.
  const linesForPlant = useMemo(
    () => (form.plantId ? lines.filter((l) => l.plantId === Number(form.plantId)) : lines),
    [lines, form.plantId],
  )
  const wcsForLine = useMemo(
    () => (form.lineId ? workCentres.filter((w) => w.lineId === Number(form.lineId)) : []),
    [workCentres, form.lineId],
  )

  const handleOpenNew = async () => {
    try {
      const res = await api.getNextMachineCode()
      setEditing(null)
      setErrors({})
      setForm({
        code: res.nextCode,
        operations: [],
        criticality: 'C',
        currentState: 'IDLE',
        operatorsRequired: 1,
        pmFrequencyDays: 90,
        capacityUom: 'NOS',
        oeePct: 0,
      })
      setFormOpen(true)
    } catch (e) {
      toast.error('Failed to fetch next code')
    }
  }

  const handleOpenEdit = (m: any) => {
    setEditing(m)
    setErrors({})
    setForm({
      code: m.code,
      name: m.name,
      machineGroupId: m.machineGroupId,
      plantId: m.plantId,
      lineId: m.lineId,
      workCentreId: m.workCentreId,
      manufacturer: m.manufacturer,
      modelNumber: m.modelNumber ?? '',
      serialNumber: m.serialNumber ?? '',
      yearOfManufacture: m.yearOfManufacture ?? '',
      assetCode: m.assetCode ?? '',
      capacityPerHour: m.capacityPerHour,
      capacityUom: m.capacityUom,
      powerKw: m.powerKw ?? '',
      operatorsRequired: m.operatorsRequired,
      installedOn: m.installedOn ?? '',
      warrantyUntil: m.warrantyUntil ?? '',
      pmFrequencyDays: m.pmFrequencyDays,
      lastPmOn: m.lastPmOn ?? '',
      nextPmOn: m.nextPmOn ?? '',
      criticality: m.criticality,
      currentState: m.currentState,
      oeePct: m.oeePct,
      operations: m.operations ?? [],
      status: m.status,
    })
    setDetail(null)
    setFormOpen(true)
  }

  /** Blank optional strings must go as null, and numerics as numbers. */
  const toPayload = (f: any) => {
    const num = (v: any) => (v === '' || v === null || v === undefined ? null : Number(v))
    const str = (v: any) => {
      const s = typeof v === 'string' ? v.trim() : v
      return s === '' || s === undefined ? null : s
    }
    return {
      code: str(f.code),
      name: str(f.name),
      machineGroupId: num(f.machineGroupId),
      plantId: num(f.plantId),
      lineId: num(f.lineId),
      workCentreId: num(f.workCentreId),
      manufacturer: str(f.manufacturer),
      modelNumber: str(f.modelNumber),
      serialNumber: str(f.serialNumber),
      yearOfManufacture: num(f.yearOfManufacture),
      assetCode: str(f.assetCode),
      capacityPerHour: num(f.capacityPerHour),
      capacityUom: str(f.capacityUom),
      powerKw: num(f.powerKw),
      operatorsRequired: num(f.operatorsRequired) ?? 1,
      installedOn: str(f.installedOn),
      warrantyUntil: str(f.warrantyUntil),
      pmFrequencyDays: num(f.pmFrequencyDays),
      lastPmOn: str(f.lastPmOn),
      nextPmOn: str(f.nextPmOn),
      criticality: f.criticality || 'C',
      currentState: f.currentState || 'IDLE',
      oeePct: num(f.oeePct) ?? 0,
      operations: f.operations ?? [],
      status: f.status || 'ACTIVE',
    }
  }

  /** Turn the API's RFC 9457 `errors[]` into per-field messages. */
  const applyServerErrors = (e: any): boolean => {
    const list = e?.problem?.errors
    if (!Array.isArray(list) || !list.length) return false
    const mapped: Record<string, string> = {}
    for (const item of list) {
      // Pydantic reports a path ("body.capacityPerHour"); our services report a field.
      const field = String(item.field ?? '').split('.').pop() ?? ''
      if (field) mapped[field] = item.message ?? 'Invalid value.'
    }
    if (!Object.keys(mapped).length) return false
    setErrors(mapped)
    return true
  }

  const handleSave = async () => {
    const e = validateMachine(form, wcsForLine)
    setErrors(e)
    if (Object.keys(e).length) {
      toast.error('Cannot save', `${Object.keys(e).length} field(s) need attention.`)
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.updateMachine(editing.id, toPayload(form))
        toast.success('Machine updated', `${form.code} — ${form.name}`)
      } else {
        await api.createMachine(toPayload(form))
        toast.success('Machine created', `${form.code} — ${form.name}`)
      }
      setFormOpen(false)
      setEditing(null)
      loadMachines()
    } catch (err: any) {
      if (applyServerErrors(err)) {
        toast.error('Cannot save', 'The server rejected some values — see the highlighted fields.')
      } else {
        toast.error(editing ? 'Failed to update machine' : 'Failed to create machine', err?.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const groupNames = useMemo(
    () => [...new Set(machines.map((m) => m.machineGroup).filter(Boolean))].sort(),
    [machines],
  )

  const rows = useMemo(() => {
    if (filter === 'breakdown') return machines.filter((m) => m.currentState === 'BREAKDOWN')
    if (filter === 'pm') return machines.filter(pmOverdue)
    if (filter === 'critical') return machines.filter((m) => m.criticality === 'A')
    if (filter) return machines.filter((m) => m.machineGroup === filter)
    return machines
  }, [filter, machines])

  const down = machines.filter((m) => m.currentState === 'BREAKDOWN')
  const overduePm = machines.filter((m) => pmOverdue(m) && m.currentState !== 'DECOMMISSIONED')
  const avgOee = Math.round(
    machines.filter((m) => m.currentState !== 'DECOMMISSIONED').reduce((s, m) => s + m.oeePct, 0) /
      (machines.filter((m) => m.currentState !== 'DECOMMISSIONED').length || 1),
  )

  const columns: Column<Machine>[] = [
    {
      key: 'code',
      header: 'Machine',
      sortable: true,
      sticky: true,
      width: '270px',
      accessor: (m) => m.name,
      render: (m) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{m.name}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{m.code} · {m.assetCode}</p>
        </div>
      ),
    },
    { key: 'machineGroup', header: 'Group', sortable: true, width: '120px', render: (m) => <Badge tone="neutral" size="sm" dot={false}>{m.machineGroup}</Badge> },
    { key: 'workCentreCode', header: 'Line / WC', width: '130px', render: (m) => <span className="font-mono text-2xs">{m.lineCode} / {m.workCentreCode}</span> },
    { key: 'manufacturer', header: 'Manufacturer', width: '170px', defaultHidden: true },
    {
      key: 'capacityPerHour',
      header: 'Capacity',
      align: 'right',
      sortable: true,
      width: '130px',
      render: (m) => <span className="tabular">{m.capacityPerHour} {m.capacityUom}/h</span>,
    },
    {
      key: 'oeePct',
      header: 'OEE',
      width: '140px',
      sortable: true,
      render: (m) => <ProgressBar value={m.oeePct} showLabel tone={m.oeePct >= 80 ? 'success' : m.oeePct >= 60 ? 'warning' : 'danger'} />,
    },
    {
      key: 'criticality',
      header: 'Crit',
      width: '80px',
      align: 'center',
      sortable: true,
      render: (m) => (
        <Badge tone={m.criticality === 'A' ? 'danger' : m.criticality === 'B' ? 'warning' : 'neutral'} size="sm" dot={false}>
          {m.criticality}
        </Badge>
      ),
    },
    {
      key: 'nextPmOn',
      header: 'Next PM',
      width: '130px',
      sortable: true,
      accessor: (m) => (m.nextPmOn ? new Date(m.nextPmOn).getTime() : 0),
      render: (m) =>
        !m.nextPmOn ? (
          <span className="text-2xs text-fg-subtle">—</span>
        ) : pmOverdue(m) ? (
          <span className="font-medium text-danger">{formatDate(m.nextPmOn)}</span>
        ) : (
          formatDate(m.nextPmOn)
        ),
    },
    {
      key: 'currentState',
      header: 'State',
      width: '140px',
      sortable: true,
      render: (m) => <Badge tone={STATE_TONE[m.currentState]} size="sm">{m.currentState.toLowerCase()}</Badge>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Machines"
        description="Equipment on the shop floor. The same record is a capacity resource to planning, a maintainable asset to maintenance and a fixed asset to finance."
        breadcrumbs={[{ label: 'Home', to: '/masters' }, { label: 'Masters' }, { label: 'Production' }, { label: 'Machines' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => toast.info('Import machines')}>
              Import
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={handleOpenNew}>
              New machine
            </Button>
          </>
        }
      />

      {down.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`${down.length} machine down`}>
          {down.map((m) => `${m.code} ${m.name} (criticality ${m.criticality})`).join(', ')}. Any
          production order routed through these work centres needs rescheduling — planning shows the
          affected orders.
        </Alert>
      )}

      {tab === 'list' && (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(m) => m.uid}
          searchPlaceholder="Name, code, asset, manufacturer or work centre…"
          pageSize={20}
          onRowClick={setDetail}
          onExport={doExport}
          filterChips={filter ? [{ key: 'f', label: 'Filter', value: filter, onRemove: () => setFilter('') }] : []}
          onClearFilters={() => setFilter('')}
          toolbar={
            <Select
              sizeVariant="sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              options={[
                { value: '', label: 'All machines' },
                { value: 'breakdown', label: 'Down now' },
                { value: 'pm', label: 'PM overdue' },
                { value: 'critical', label: 'Criticality A' },
                ...groupNames.map((g) => ({ value: g, label: `Group — ${g}` })),
              ]}
            />
          }
          rowClassName={(m) => (m.currentState === 'BREAKDOWN' ? 'bg-danger/[0.03]' : undefined)}
          rowActions={(m) => (
            <>
              <MenuItem label="Open" onClick={() => setDetail(m)} />
              <MenuItem label="Edit" onClick={() => handleOpenEdit(m)} />
              <MenuItem
                label="Raise breakdown call"
                danger={m.currentState !== 'BREAKDOWN'}
                onClick={() => toast.info('Raise breakdown call', `A maintenance request would be raised for ${m.code} — ${m.name}.`)}
              />
              <MenuItem label="PM schedule" onClick={() => toast.info('PM schedule', `Preventive-maintenance plan for ${m.name}.`)} />
              <MenuItem label="Machine history card" onClick={() => toast.info('Machine history card', `Breakdown and service history for ${m.name}.`)} />
              <MenuItem label="Print asset label" onClick={() => toast.info('Print asset label', `Asset label for ${m.code}.`)} />
              <MenuItem
                label={m.currentState === 'DECOMMISSIONED' ? 'Recommission' : 'Decommission'}
                danger={m.currentState !== 'DECOMMISSIONED'}
                separatorBefore
                disabled={m.whereUsed?.some((w: any) => w.isOpen)}
                onClick={async () => {
                  const off = m.currentState === 'DECOMMISSIONED'
                  try {
                    await api.updateMachine(m.uid, { currentState: off ? 'IDLE' : 'DECOMMISSIONED', status: off ? 'ACTIVE' : 'INACTIVE' })
                    toast.success(off ? 'Recommissioned' : 'Decommissioned', m.name)
                    loadMachines()
                  } catch (e) {
                    toast.error('Failed to update status')
                  }
                }}
              />
              <MenuItem
                label={m.whereUsed?.length ? `Delete — blocked (${m.whereUsed.length} refs)` : 'Delete'}
                danger
                disabled={m.whereUsed?.length > 0}
                onClick={async () => { 
                  try {
                    await api.deleteMachine(m.uid)
                    toast.success('Deleted', `${m.code} — ${m.name}`)
                    loadMachines()
                  } catch (e) {
                    toast.error('Failed to delete machine')
                  }
                }}
              />
            </>
          )}
        />
      )}

      

      {detail && <MachineDetail m={detail} onClose={() => setDetail(null)} onEdit={() => handleOpenEdit(detail)} />}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title={editing ? `Edit machine — ${editing.code}` : 'New machine'}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3.5">
            <Input label="Machine code" required disabled value={form.code || ''} className="font-mono" />
            <Input
              label="Name" required maxLength={150}
              value={form.name || ''} error={errors.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Select
              label="Machine group" required
              value={form.machineGroupId ?? ''} error={errors.machineGroupId}
              onChange={(e) => setForm({ ...form, machineGroupId: e.target.value })}
              options={[
                { value: '', label: 'Select a group…' },
                ...groups.map((g) => ({ value: String(g.id), label: `${g.code} — ${g.name}` })),
              ]}
            />
            <Input
              label="Manufacturer" required maxLength={150}
              value={form.manufacturer || ''} error={errors.manufacturer}
              onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
            />
            <Input
              label="Model number" maxLength={100} className="font-mono"
              value={form.modelNumber || ''} error={errors.modelNumber}
              onChange={(e) => setForm({ ...form, modelNumber: e.target.value })}
            />
            <Input
              label="Serial number" maxLength={100} className="font-mono"
              value={form.serialNumber || ''} error={errors.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Year of manufacture" type="number" min={1900} max={CURRENT_YEAR + 1}
                value={form.yearOfManufacture ?? ''} error={errors.yearOfManufacture}
                onChange={(e) => setForm({ ...form, yearOfManufacture: e.target.value })}
              />
              <Input
                label="Asset code" maxLength={100} className="font-mono"
                value={form.assetCode || ''} error={errors.assetCode}
                onChange={(e) => setForm({ ...form, assetCode: e.target.value })}
                hint="Fixed-asset register reference."
              />
            </div>
          </div>
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Plant" required
                value={form.plantId ?? ''} error={errors.plantId}
                // Changing the plant invalidates the line and work centre below it.
                onChange={(e) => setForm({ ...form, plantId: e.target.value, lineId: '', workCentreId: '' })}
                options={[
                  { value: '', label: 'Select a plant…' },
                  ...plants.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` })),
                ]}
              />
              <Select
                label="Line" required disabled={!form.plantId}
                value={form.lineId ?? ''} error={errors.lineId}
                onChange={(e) => setForm({ ...form, lineId: e.target.value, workCentreId: '' })}
                options={[
                  { value: '', label: form.plantId ? 'Select a line…' : 'Choose a plant first' },
                  ...linesForPlant.map((l) => ({ value: String(l.id), label: `${l.code} — ${l.name}` })),
                ]}
              />
            </div>
            <Select
              label="Work centre" required disabled={!form.lineId}
              value={form.workCentreId ?? ''} error={errors.workCentreId}
              onChange={(e) => setForm({ ...form, workCentreId: e.target.value })}
              options={[
                { value: '', label: form.lineId ? 'Select a work centre…' : 'Choose a line first' },
                ...wcsForLine.map((w) => ({ value: String(w.id), label: `${w.code} — ${w.name}` })),
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Capacity / hour" type="number" required min={0} step="0.01"
                value={form.capacityPerHour ?? ''} error={errors.capacityPerHour}
                onChange={(e) => setForm({ ...form, capacityPerHour: e.target.value })}
              />
              <Select
                label="Capacity UOM" required
                value={form.capacityUom || ''} error={errors.capacityUom}
                onChange={(e) => setForm({ ...form, capacityUom: e.target.value })}
                options={[
                  { value: 'NOS', label: 'NOS' },
                  { value: 'KG', label: 'KG' },
                  { value: 'CTN', label: 'CTN' },
                  { value: 'LTR', label: 'LTR' },
                  { value: 'MTR', label: 'MTR' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Power (kW)" type="number" min={0} step="0.01"
                value={form.powerKw ?? ''} error={errors.powerKw}
                onChange={(e) => setForm({ ...form, powerKw: e.target.value })}
              />
              <Input
                label="Operators required" type="number" min={0} max={100}
                value={form.operatorsRequired ?? ''} error={errors.operatorsRequired}
                onChange={(e) => setForm({ ...form, operatorsRequired: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Installed on" type="date"
                value={form.installedOn || ''} error={errors.installedOn}
                onChange={(e) => setForm({ ...form, installedOn: e.target.value })}
              />
              <Input
                label="Warranty until" type="date"
                value={form.warrantyUntil || ''} error={errors.warrantyUntil}
                onChange={(e) => setForm({ ...form, warrantyUntil: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Criticality" required
                value={form.criticality || ''} error={errors.criticality}
                onChange={(e) => setForm({ ...form, criticality: e.target.value })}
                options={[
                  { value: 'A', label: 'A — line stops' },
                  { value: 'B', label: 'B — recoverable' },
                  { value: 'C', label: 'C — low impact' },
                ]}
              />
              <Input
                label="PM frequency (days)" type="number" required min={1} max={3650}
                value={form.pmFrequencyDays ?? ''} error={errors.pmFrequencyDays}
                onChange={(e) => setForm({ ...form, pmFrequencyDays: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Last PM on" type="date"
                value={form.lastPmOn || ''} error={errors.lastPmOn}
                onChange={(e) => setForm({ ...form, lastPmOn: e.target.value })}
              />
              <Input
                label="Next PM on" type="date"
                value={form.nextPmOn || ''} error={errors.nextPmOn}
                onChange={(e) => setForm({ ...form, nextPmOn: e.target.value })}
              />
            </div>
            <Textarea
              label="Operations performed" rows={2}
              value={form.operations?.join(', ') ?? ''}
              onChange={(e) => setForm({ ...form, operations: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="Deep Drawing, Bottle Forming"
              hint="Comma separated, up to 30 operations."
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
