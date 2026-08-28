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

function MachineDetail({ m, onClose }: { m: Machine; onClose: () => void }) {
  const toast = useToast()
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
            onEdit={() => toast.info('Edit')}
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
                      { label: 'Plant', value: m.plantUid },
                      { label: 'Line', value: m.lineCode },
                      { label: 'Work centre', value: m.workCentreCode },
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
                approvedBy={undefined}
                approvedAt={undefined}
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

export function MachineMasterPage() {
  const toast = useToast()
  
  const [machines, setMachines] = useState<any[]>([])
  
  const loadMachines = async () => {
    try {
      const data = await api.getMachines()
      setMachines(data.map(m => ({
        ...m,
        uid: String(m.id),
        whereUsed: [],
        revisions: []
      })))
    } catch (e: any) {
      toast.error('Failed to load machines', e.message)
    }
  }

  useEffect(() => {
    loadMachines()
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
  const [form, setForm] = useState<any>({ operations: [], criticality: 'C', currentState: 'IDLE' })
  const [filter, setFilter] = useState('')

  const handleOpenNew = async () => {
    try {
      const res = await api.getNextMachineCode()
      setForm({ code: res.nextCode, operations: [], criticality: 'C', currentState: 'IDLE', operatorsRequired: 1, pmFrequencyDays: 90 })
      setFormOpen(true)
    } catch (e) {
      toast.error('Failed to fetch next code')
    }
  }
  
  const handleCreate = async () => {
    try {
      await api.createMachine(form)
      toast.success('Machine created')
      setFormOpen(false)
      loadMachines()
    } catch (e) {
      toast.error('Failed to create machine')
    }
  }

  const groups = useMemo(() => [...new Set(machines.map((m) => m.machineGroup))].sort(), [])

  const rows = useMemo(() => {
    if (filter === 'breakdown') return machines.filter((m) => m.currentState === 'BREAKDOWN')
    if (filter === 'pm') return machines.filter(pmOverdue)
    if (filter === 'critical') return machines.filter((m) => m.criticality === 'A')
    if (filter) return machines.filter((m) => m.machineGroup === filter)
    return machines
  }, [filter])

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
                ...groups.map((g) => ({ value: g, label: `Group — ${g}` })),
              ]}
            />
          }
          rowClassName={(m) => (m.currentState === 'BREAKDOWN' ? 'bg-danger/[0.03]' : undefined)}
          rowActions={(m) => (
            <>
              <MenuItem label="Open" onClick={() => setDetail(m)} />
              <MenuItem label="Edit" onClick={() => setDetail(m)} />
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
                    await api.updateMachine(m.id, { currentState: off ? 'IDLE' : 'DECOMMISSIONED', status: off ? 'ACTIVE' : 'INACTIVE' })
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
                    await api.deleteMachine(m.id)
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

      

      {detail && <MachineDetail m={detail} onClose={() => setDetail(null)} />}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title="New machine"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate}>Create</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3.5">
            <Input label="Machine code" required disabled value={form.code || ''} className="font-mono" />
            <Input label="Name" required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Machine group" required value={form.machineGroup || ''} onChange={(e) => setForm({ ...form, machineGroup: e.target.value })} options={groups.map((g) => ({ value: g, label: g }))} />
            <Input label="Manufacturer" required value={form.manufacturer || ''} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
            <Input label="Model number" value={form.modelNumber || ''} onChange={(e) => setForm({ ...form, modelNumber: e.target.value })} className="font-mono" />
            <Input label="Serial number" value={form.serialNumber || ''} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="font-mono" />
            <Input label="Asset code" required value={form.assetCode || ''} onChange={(e) => setForm({ ...form, assetCode: e.target.value })} className="font-mono" hint="Must match an existing fixed-asset record." />
          </div>
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Plant" required value={form.plantUid || ''} onChange={(e) => setForm({ ...form, plantUid: e.target.value })} options={[{ value: 'P1', label: 'P1' }]} />
              <Select label="Line" required value={form.lineCode || ''} onChange={(e) => setForm({ ...form, lineCode: e.target.value })} options={[{ value: 'LN-A', label: 'Line A' }, { value: 'LN-B', label: 'Line B' }, { value: 'LN-C', label: 'Line C' }]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Work centre" required value={form.workCentreCode || ''} onChange={(e) => setForm({ ...form, workCentreCode: e.target.value })} options={[{ value: 'WC-01', label: 'WC-01' }, { value: 'WC-02', label: 'WC-02' }, { value: 'WC-03', label: 'WC-03' }]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Capacity / hour" type="number" required value={form.capacityPerHour || ''} onChange={(e) => setForm({ ...form, capacityPerHour: parseFloat(e.target.value) })} />
              <Select label="Capacity UOM" value={form.capacityUom || ''} onChange={(e) => setForm({ ...form, capacityUom: e.target.value })} options={[{ value: 'NOS', label: 'NOS' }, { value: 'KG', label: 'KG' }, { value: 'CTN', label: 'CTN' }]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Power (kW)" type="number" value={form.powerKw || ''} onChange={(e) => setForm({ ...form, powerKw: parseFloat(e.target.value) })} />
              <Input label="Operators required" type="number" value={form.operatorsRequired || ''} onChange={(e) => setForm({ ...form, operatorsRequired: parseInt(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Criticality"
                required
                value={form.criticality || ''}
                onChange={(e) => setForm({ ...form, criticality: e.target.value })}
                options={[
                  { value: 'A', label: 'A — line stops' },
                  { value: 'B', label: 'B — recoverable' },
                  { value: 'C', label: 'C — low impact' },
                ]}
              />
              <Input label="PM frequency (days)" type="number" required value={form.pmFrequencyDays || ''} onChange={(e) => setForm({ ...form, pmFrequencyDays: parseInt(e.target.value) })} />
            </div>
            <Textarea label="Operations performed" rows={2} value={form.operations?.join(', ')} onChange={(e) => setForm({ ...form, operations: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Deep Drawing, Bottle Forming" hint="Comma separated." />
          </div>
        </div>
      </Modal>
    </div>
  )
}
