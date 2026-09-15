import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { MachineDot, MesDetailBlock, MesStatusBadge } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { getMachines } from '@/api/masters'
import { productionApi, type WorkOrderRow } from '@/api/production'

/**
 * Machines — the master, with what each one is actually doing right now.
 *
 * Two sources, kept apart on purpose. The machine master owns the asset facts:
 * code, work centre, capacity, criticality, preventive-maintenance dates. What
 * a machine is doing this minute is not stored anywhere — it is read off the
 * work orders, because a machine is busy exactly when an operation assigned to
 * it is running.
 *
 * The master also carries a `currentState` and an `oeePct` column. Nothing
 * writes to either, so they are shown as the master's own stale values and
 * labelled as such rather than presented as live readings.
 */

interface MachineRow {
  id: number
  code: string
  name: string
  machineGroup?: string | null
  machineGroupCode?: string | null
  plantName?: string | null
  lineCode?: string | null
  lineName?: string | null
  workCentreCode?: string | null
  workCentreName?: string | null
  manufacturer?: string | null
  modelNumber?: string | null
  serialNumber?: string | null
  assetCode?: string | null
  capacityPerHour?: number | null
  capacityUom?: string | null
  powerKw?: number | null
  operatorsRequired?: number | null
  pmFrequencyDays?: number | null
  lastPmOn?: string | null
  nextPmOn?: string | null
  criticality?: string | null
  currentState?: string | null
  oeePct?: number | null
  status?: string | null
}

/** What the work orders say a machine is doing, which is the only live truth. */
type LiveState = 'RUNNING' | 'ASSIGNED' | 'FREE'

export function MachinesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [work, setWork] = useState<WorkOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<MachineRow | null>(null)

  useEffect(() => {
    Promise.all([getMachines(), productionApi.getWorkOrders()])
      .then(([list, orders]) => {
        setMachines(Array.isArray(list) ? list : [])
        setWork(orders)
        setError(null)
      })
      .catch((err) =>
        setError(err instanceof ProblemError ? err.problem.detail : 'Could not reach the backend.'),
      )
      .finally(() => setLoading(false))
  }, [])

  /** Work orders sitting on each machine, live. */
  const onMachine = useMemo(() => {
    const map = new Map<string, WorkOrderRow[]>()
    for (const w of work) {
      if (!w.machineCode) continue
      if (['COMPLETED', 'CANCELLED'].includes(w.status)) continue
      const list = map.get(w.machineCode) ?? []
      list.push(w)
      map.set(w.machineCode, list)
    }
    return map
  }, [work])

  function liveState(code: string): LiveState {
    const jobs = onMachine.get(code) ?? []
    if (jobs.some((j) => j.status === 'RUNNING')) return 'RUNNING'
    return jobs.length ? 'ASSIGNED' : 'FREE'
  }

  const columns: Column<MachineRow>[] = [
    { key: 'code', header: 'Machine', sortable: true, width: '10rem', render: (m) => (
      <div className="flex items-center gap-2">
        <MachineDot state={liveState(m.code) === 'RUNNING' ? 'RUNNING' : liveState(m.code) === 'ASSIGNED' ? 'SETUP' : 'IDLE'} />
        <div>
          <p className="font-mono text-2xs font-medium text-brand-600">{m.code}</p>
          <p className="truncate text-2xs text-fg-subtle" title={m.name}>{m.name?.trim()}</p>
        </div>
      </div>
    ) },
    { key: 'workCentreCode', header: 'Work centre', sortable: true, width: '9rem', render: (m) => (
      <div>
        <p className="font-mono text-2xs">{m.workCentreCode || '—'}</p>
        <p className="truncate text-2xs text-fg-subtle">{m.workCentreName ?? ''}</p>
      </div>
    ) },
    { key: 'live', header: 'Doing now', width: '13rem', accessor: (m) => liveState(m.code), render: (m) => {
      const jobs = onMachine.get(m.code) ?? []
      const running = jobs.find((j) => j.status === 'RUNNING')
      if (running) {
        return (
          <div>
            <Badge tone="success" size="sm">Running</Badge>
            <p className="mt-0.5 font-mono text-2xs text-fg-subtle">{running.docNo} · {running.operationName}</p>
          </div>
        )
      }
      if (jobs.length) {
        return (
          <div>
            <Badge tone="neutral" size="sm">Assigned</Badge>
            <p className="mt-0.5 text-2xs text-fg-subtle">{jobs.length} operation{jobs.length === 1 ? '' : 's'} waiting</p>
          </div>
        )
      }
      return <span className="text-2xs text-fg-subtle">nothing assigned</span>
    } },
    { key: 'capacityPerHour', header: 'Capacity', align: 'right', width: '8rem', sortable: true, render: (m) => (
      m.capacityPerHour ? <span className="tabular text-2xs">{formatQty(m.capacityPerHour)} {m.capacityUom ?? ''}/h</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'criticality', header: 'Criticality', align: 'center', width: '7rem', sortable: true, render: (m) => (
      m.criticality ? <Badge tone={m.criticality === 'A' ? 'danger' : m.criticality === 'B' ? 'warning' : 'neutral'} size="sm" dot={false}>{m.criticality}</Badge> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'nextPmOn', header: 'Next service', sortable: true, width: '9rem', accessor: (m) => m.nextPmOn ?? '', render: (m) => (
      m.nextPmOn ? formatDate(m.nextPmOn) : <span className="text-2xs text-fg-subtle">not scheduled</span>
    ) },
    { key: 'status', header: 'Master status', width: '8rem', sortable: true, render: (m) => (
      <Badge tone={m.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">{m.status ?? '—'}</Badge>
    ) },
    { key: 'machineGroup', header: 'Group', defaultHidden: true },
    { key: 'plantName', header: 'Plant', defaultHidden: true },
    { key: 'assetCode', header: 'Asset code', defaultHidden: true },
    { key: 'serialNumber', header: 'Serial', defaultHidden: true },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'machines', 'Machines', columnsFromTable(columns), machines)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const running = machines.filter((m) => liveState(m.code) === 'RUNNING').length
  const assigned = machines.filter((m) => liveState(m.code) === 'ASSIGNED').length

  return (
    <div>
      <PageHeader
        title="Machines"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Machines' }]}
        actions={<Button variant="outline" size="sm" onClick={() => navigate('/masters/machines')}>Machine master</Button>}
      />

      {error && (
        <Alert tone="danger" title="Machines could not be loaded" className="mb-4">
          {error}
        </Alert>
      )}

      <p className="mb-4 text-xs text-fg-muted">
        <span className="font-medium text-fg">{machines.length}</span> machine{machines.length === 1 ? '' : 's'} in the master ·{' '}
        <span className="font-medium text-success">{running}</span> running ·{' '}
        <span className="font-medium text-fg">{assigned}</span> with work assigned. What a machine is doing is read from the work
        orders, not from a status column — nothing writes a live state anywhere.
      </p>

      <DataTable
        rows={machines}
        columns={columns}
        rowKey={(m) => m.code}
        loading={loading}
        searchPlaceholder="Search machine, work centre or group…"
        onExport={doExport}
        onRowClick={(m) => setDetail(m)}
        emptyTitle="No machine in the master"
        emptyDescription="Add machines in the machine master before they can be assigned to operations."
        rowActions={(m) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(m)} />
            <MenuItem label="Queue for this work centre" onClick={() => navigate('/production/queue')} />
          </>
        )}
      />

      <Alert tone="info" title="Availability and OEE are not shown here" className="mt-4">
        The machine master holds a <span className="font-mono">currentState</span> and an{' '}
        <span className="font-mono">oeePct</span> column, but nothing in the system writes to either, so they would be a stale
        number rather than a reading. Real availability needs reason-coded downtime with start and end times, and a planned-time
        calendar. Neither exists yet.
      </Alert>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.code} — ${detail.name?.trim()}` : ''} width="md">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={liveState(detail.code) === 'RUNNING' ? 'success' : 'neutral'} size="sm">
                {liveState(detail.code) === 'RUNNING' ? 'Running' : liveState(detail.code) === 'ASSIGNED' ? 'Work assigned' : 'Nothing assigned'}
              </Badge>
              <Badge tone={detail.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">{detail.status ?? '—'}</Badge>
            </div>

            <MesDetailBlock title="Where it sits">
              <DataGrid
                items={[
                  { label: 'Plant', value: detail.plantName ?? '—' },
                  { label: 'Line', value: detail.lineName ?? detail.lineCode ?? '—' },
                  { label: 'Work centre', value: `${detail.workCentreCode ?? '—'} ${detail.workCentreName ?? ''}`.trim() },
                  { label: 'Group', value: detail.machineGroup ?? '—' },
                ]}
              />
            </MesDetailBlock>

            <MesDetailBlock title="The asset">
              <DataGrid
                items={[
                  { label: 'Manufacturer', value: detail.manufacturer ?? '—' },
                  { label: 'Model', value: detail.modelNumber ?? '—' },
                  { label: 'Serial', value: detail.serialNumber ?? '—' },
                  { label: 'Asset code', value: detail.assetCode ?? '—' },
                  { label: 'Capacity', value: detail.capacityPerHour ? `${formatQty(detail.capacityPerHour)} ${detail.capacityUom ?? ''}/h` : '—' },
                  { label: 'Operators needed', value: detail.operatorsRequired != null ? String(detail.operatorsRequired) : '—' },
                  { label: 'Power', value: detail.powerKw ? `${detail.powerKw} kW` : '—' },
                  { label: 'Criticality', value: detail.criticality ?? '—' },
                ]}
              />
            </MesDetailBlock>

            <MesDetailBlock title="Service">
              <DataGrid
                items={[
                  { label: 'Every', value: detail.pmFrequencyDays ? `${detail.pmFrequencyDays} days` : '—' },
                  { label: 'Last done', value: detail.lastPmOn ? formatDate(detail.lastPmOn) : 'not recorded' },
                  { label: 'Next due', value: detail.nextPmOn ? formatDate(detail.nextPmOn) : 'not scheduled' },
                ]}
              />
            </MesDetailBlock>

            <Card>
              <CardHeader title="On this machine now" description="Open operations assigned to it" />
              <CardBody className="space-y-2">
                {(onMachine.get(detail.code) ?? []).length ? (
                  (onMachine.get(detail.code) ?? []).map((w) => (
                    <div key={w.uid} className="flex items-center justify-between gap-2 rounded border border-border bg-surface-2 px-3 py-2">
                      <div>
                        <p className="font-mono text-2xs text-brand-600">{w.docNo}</p>
                        <p className="text-2xs text-fg-subtle">{w.seq} · {w.operationName}</p>
                      </div>
                      <div className="text-right">
                        <MesStatusBadge status={w.status} size="sm" />
                        <p className={cn('mt-0.5 text-2xs tabular text-fg-subtle')}>{formatQty(w.inputQty)} in</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-fg-muted">No open operation is assigned to this machine.</p>
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  )
}
