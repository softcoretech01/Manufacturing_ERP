import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { Duration, MachineDot, MesStatusBadge, OeeBar } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { DOWNTIME_REASON_LABEL } from '@/components/mes/MesShell'
import { downtimeEvents as seedDowntime, machines as seedMachines } from '@/mock/mes'
import type { DowntimeEvent, DowntimeReason, Machine, MachineState } from '@/types/mes'

/** Availability, performance and quality for one machine's current shift. */
export function oeeOf(m: Machine) {
  const availability = m.plannedMinutes ? ((m.plannedMinutes - m.downMinutes) / m.plannedMinutes) * 100 : 0
  const idealMinutes = (m.totalPieces * m.idealCycleSeconds) / 60
  const performance = m.runMinutes ? Math.min(100, (idealMinutes / m.runMinutes) * 100) : 0
  const quality = m.totalPieces ? (m.goodPieces / m.totalPieces) * 100 : 0
  return { availability, performance, quality, oee: (availability * performance * quality) / 10_000 }
}

/** Machine status & assignment — what every machine is doing right now. */
export function MachinesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const mcSeed = useMemo(() => seedMachines, [])
  const dtSeed = useMemo(() => seedDowntime, [])
  const { rows: machines, update } = useCollection<Machine>('mes:machine', mcSeed)
  const rowEdit = useRowEdit<Machine>({
    key: 'mes:machine',
    seed: mcSeed,
    entity: 'Machine',
    titleOf: (r) => r.code,
  })
  const { rows: downtime, create: createDowntime, update: updateDowntime } = useCollection<DowntimeEvent>('mes:downtime', dtSeed)

  const [view, setView] = useState<'board' | 'list'>('board')
  const [detail, setDetail] = useState<Machine | null>(null)
  const [stopTarget, setStopTarget] = useState<Machine | null>(null)
  const [stop, setStop] = useState({ reason: 'BREAKDOWN' as DowntimeReason, note: '' })

  const counts = {
    running: machines.filter((m) => m.state === 'RUNNING').length,
    idle: machines.filter((m) => m.state === 'IDLE').length,
    down: machines.filter((m) => m.state === 'BREAKDOWN').length,
    maintenance: machines.filter((m) => m.state === 'MAINTENANCE').length,
  }
  const dueSoon = machines.filter((m) => new Date(m.nextMaintenanceOn).getTime() - Date.now() < 7 * 86_400_000)
  const calibrationDue = machines.filter((m) => m.calibrationDueOn && new Date(m.calibrationDueOn).getTime() < Date.now())

  function stopMachine() {
    if (!stopTarget) return
    if (!stop.note.trim()) {
      toast.error('Say what happened', 'Downtime without a reason cannot be analysed, and this is where OEE availability comes from.')
      return
    }
    update(stopTarget.uid, { state: stop.reason === 'PLANNED_MAINTENANCE' ? 'MAINTENANCE' : 'BREAKDOWN', currentWorkOrder: null })
    const next = Math.max(...downtime.map((x) => Number(x.docNo.slice(-4)) || 0)) + 1
    createDowntime({
      uid: newUid('dt'),
      docNo: `DT/2607/${String(next).padStart(4, '0')}`,
      machine: stopTarget.name,
      machineCode: stopTarget.code,
      workCentre: stopTarget.workCentre,
      reason: stop.reason,
      startedAt: new Date().toISOString(),
      endedAt: null,
      minutes: 0,
      shift: 'A',
      reportedBy: stopTarget.currentOperator ?? 'Supervisor',
      correctiveAction: stop.note.trim(),
      maintenanceRequestNo: stop.reason === 'BREAKDOWN' ? `MWO/26-27/${String(180 + next)}` : null,
      isOpen: true,
    } as DowntimeEvent)
    toast.success(
      'Machine stopped',
      `${stopTarget.code} logged as ${DOWNTIME_REASON_LABEL[stop.reason].toLowerCase()}${stop.reason === 'BREAKDOWN' ? ' and a maintenance request has been raised' : ''}. The clock is running against availability.`,
    )
    setStopTarget(null)
  }

  function restart(m: Machine) {
    const open = downtime.find((d) => d.machineCode === m.code && d.isOpen)
    if (open) {
      const minutes = Math.max(1, Math.round((Date.now() - new Date(open.startedAt).getTime()) / 60_000))
      updateDowntime(open.uid, { isOpen: false, endedAt: new Date().toISOString(), minutes })
    }
    update(m.uid, { state: 'IDLE' })
    toast.success('Back in service', `${m.code} is available again${open ? ` after ${Math.round((Date.now() - new Date(open.startedAt).getTime()) / 60_000)} minutes down` : ''}.`)
  }

  const columns: Column<Machine>[] = [
    { key: 'code', header: 'Machine', sortable: true, width: '13rem', render: (m) => (
      <div className="flex items-center gap-2">
        <MachineDot state={m.state} />
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium text-brand-600">{m.code}</p>
          <p className="truncate text-2xs text-fg-subtle">{m.name}</p>
        </div>
      </div>
    ) },
    { key: 'workCentre', header: 'Work centre', sortable: true },
    { key: 'line', header: 'Line', sortable: true, width: '6.5rem' },
    { key: 'currentWorkOrder', header: 'Running', width: '11rem', render: (m) => (
      m.currentWorkOrder ? <div><p className="font-mono text-2xs text-fg">{m.currentWorkOrder}</p><p className="text-2xs text-fg-subtle">{m.currentOperator}</p></div> : <span className="text-2xs text-fg-subtle">nothing</span>
    ) },
    { key: 'runMinutes', header: 'Run', width: '7rem', sortable: true, render: (m) => <Duration minutes={m.runMinutes} /> },
    { key: 'downMinutes', header: 'Down', width: '7rem', sortable: true, render: (m) => (m.downMinutes ? <span className="text-danger"><Duration minutes={m.downMinutes} /></span> : <span className="text-2xs text-success">none</span>) },
    { key: 'oee', header: 'OEE (shift)', align: 'right', width: '8rem', sortable: true, accessor: (m) => oeeOf(m).oee, render: (m) => {
      const o = oeeOf(m).oee
      return <span className={cn('tabular font-medium', o >= 85 ? 'text-success' : o >= 70 ? 'text-warning' : 'text-danger')}>{o.toFixed(1)}%</span>
    } },
    { key: 'goodPieces', header: 'Good today', align: 'right', sortable: true, render: (m) => <span className="tabular">{formatQty(m.goodPieces)}</span> },
    { key: 'nextMaintenanceOn', header: 'Next service', width: '9rem', sortable: true, accessor: (m) => m.nextMaintenanceOn, render: (m) => {
      const days = Math.ceil((new Date(m.nextMaintenanceOn).getTime() - Date.now()) / 86_400_000)
      return <span className={cn('text-2xs', days < 0 ? 'font-medium text-danger' : days < 7 ? 'text-warning' : 'text-fg-muted')}>{formatDate(m.nextMaintenanceOn)}{days < 0 ? ' · overdue' : ''}</span>
    } },
    { key: 'state', header: 'State', sortable: true, width: '9rem', render: (m) => <MesStatusBadge status={m.state} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'machine-status', 'Machine status & utilisation', columnsFromTable(columns), machines)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Machine status"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Machines' }]}
        actions={<Button variant="outline" size="sm" onClick={() => navigate('/production/downtime')}>Downtime log</Button>}
        tabs={
          <Tabs
            variant="pill"
            active={view}
            onChange={(v) => setView(v as typeof view)}
            tabs={[{ id: 'board', label: 'Floor board' }, { id: 'list', label: 'List', count: machines.length }]}
          />
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-success">{counts.running}</span> running ·{' '}
        <span className="font-medium text-fg">{counts.idle}</span> idle ·{' '}
        <span className={cn('font-medium', counts.down ? 'text-danger' : 'text-success')}>{counts.down}</span> broken down ·{' '}
        <span className="font-medium text-warning">{counts.maintenance}</span> under maintenance ·{' '}
        <span className={cn('font-medium', dueSoon.length ? 'text-warning' : 'text-success')}>{dueSoon.length}</span> due for
        service within a week
        {calibrationDue.length > 0 && <> · <span className="font-medium text-danger">{calibrationDue.length}</span> past calibration</>}.
      </p>

      {view === 'board' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {machines.map((m) => {
            const o = oeeOf(m)
            return (
              <button
                key={m.uid}
                onClick={() => setDetail(m)}
                className={cn(
                  'card p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-2',
                  m.state === 'BREAKDOWN' && 'border-danger/40 bg-danger/[0.04]',
                  m.state === 'RUNNING' && 'border-success/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-mono text-xs font-medium text-fg">
                      <MachineDot state={m.state} /> {m.code}
                    </p>
                    <p className="mt-0.5 truncate text-2xs text-fg-subtle">{m.name}</p>
                  </div>
                  <MesStatusBadge status={m.state} size="sm" />
                </div>
                <p className="mt-2 truncate text-2xs text-fg-muted">
                  {m.currentWorkOrder ? `${m.currentWorkOrder} · ${m.currentOperator}` : m.workCentre}
                </p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div>
                    <p className={cn('text-lg font-semibold tabular', o.oee >= 85 ? 'text-success' : o.oee >= 70 ? 'text-warning' : 'text-danger')}>
                      {o.oee.toFixed(0)}%
                    </p>
                    <p className="text-2xs text-fg-subtle">OEE this shift</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xs text-fg-muted">run <span className="tabular text-fg">{Math.round(m.runMinutes)}m</span></p>
                    <p className="text-2xs text-fg-muted">down <span className={cn('tabular', m.downMinutes ? 'text-danger' : 'text-fg')}>{Math.round(m.downMinutes)}m</span></p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <DataTable
          rows={machines}
          columns={columns}
          rowKey={(m) => m.uid}
          searchPlaceholder="Search machine, work centre or line…"
          onExport={doExport}
          onRowClick={setDetail}
          emptyTitle="No machines"
          rowClassName={(m) => cn(m.state === 'BREAKDOWN' && 'bg-danger/[0.04]')}
          rowActions={(m) => (
            <>
              {rowEdit.actions(m)}
              <MenuItem label="Open" onClick={() => setDetail(m)} />
              <MenuItem label="Stop the machine" danger disabled={m.state === 'BREAKDOWN' || m.state === 'MAINTENANCE'} onClick={() => { setStopTarget(m); setStop({ reason: 'BREAKDOWN', note: '' }) }} />
              <MenuItem label="Put back in service" disabled={m.state !== 'BREAKDOWN' && m.state !== 'MAINTENANCE'} onClick={() => restart(m)} />
              <MenuItem label="Raise a maintenance request" separatorBefore onClick={() => toast.success('Request raised', `A maintenance work order has been created for ${m.code} and sent to ${'D. Anand'}.`)} />
            </>
          )}
        />
      )}

      {/* Detail --------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.code} — ${detail.name}` : ''}
        description={detail ? `${detail.workCentre} · ${detail.line}` : undefined}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              {detail.state === 'BREAKDOWN' || detail.state === 'MAINTENANCE' ? (
                <Button variant="success" size="sm" onClick={() => { restart(detail); setDetail(null) }}>Back in service</Button>
              ) : (
                <Button variant="danger" size="sm" onClick={() => { setStopTarget(detail); setStop({ reason: 'BREAKDOWN', note: '' }); setDetail(null) }}>Stop machine</Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <MesStatusBadge status={detail.state} />
              {detail.calibrationDueOn && new Date(detail.calibrationDueOn).getTime() < Date.now() && (
                <Badge tone="danger" size="sm">Calibration overdue</Badge>
              )}
            </div>

            <Card>
              <CardHeader title="OEE this shift" description="Availability × performance × quality" />
              <CardBody>
                <OeeBar {...oeeOf(detail)} />
              </CardBody>
            </Card>

            <DataGrid
              columns={2}
              items={[
                { label: 'Currently running', value: detail.currentWorkOrder ?? 'Nothing' },
                { label: 'Operator', value: detail.currentOperator ?? '—' },
                { label: 'Planned minutes', value: `${detail.plannedMinutes} min` },
                { label: 'Run · down', value: `${detail.runMinutes} min · ${detail.downMinutes} min` },
                { label: 'Ideal cycle', value: `${detail.idealCycleSeconds} s per piece` },
                { label: 'Capacity', value: `${formatQty(detail.capacityPerHour)} pieces per hour` },
                { label: 'Pieces today', value: `${formatQty(detail.totalPieces)} (${formatQty(detail.goodPieces)} good)` },
                { label: 'Last service', value: formatDate(detail.lastMaintenanceOn) },
                { label: 'Next service', value: formatDate(detail.nextMaintenanceOn) },
                { label: 'Calibration due', value: detail.calibrationDueOn ? formatDate(detail.calibrationDueOn) : 'Not applicable' },
              ]}
            />

            <div>
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Downtime today</p>
              {downtime.filter((d) => d.machineCode === detail.code).length === 0 ? (
                <p className="text-xs text-success">No downtime logged — a clean shift.</p>
              ) : (
                <div className="space-y-2">
                  {downtime.filter((d) => d.machineCode === detail.code).map((d) => (
                    <div key={d.uid} className="flex items-start justify-between gap-3 rounded border border-border p-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-fg">{DOWNTIME_REASON_LABEL[d.reason]}</p>
                        <p className="truncate text-2xs text-fg-muted">{d.correctiveAction ?? 'No corrective action recorded yet'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Duration minutes={d.minutes} />
                        {d.isOpen && <Badge tone="danger" size="sm">Still down</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Stop ----------------------------------------------------------------- */}
      <Modal
        open={!!stopTarget}
        onClose={() => setStopTarget(null)}
        title={stopTarget ? `Stop ${stopTarget.code}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setStopTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={stopMachine}>Stop and log downtime</Button>
          </>
        }
      >
        {stopTarget && (
          <div className="space-y-3.5">
            <p className="text-sm text-fg-muted">
              {stopTarget.name}
              {stopTarget.currentWorkOrder ? ` is running ${stopTarget.currentWorkOrder}. That work order will be paused.` : ' is idle.'}
            </p>
            <Select
              label="Reason"
              value={stop.reason}
              onChange={(e) => setStop({ ...stop, reason: e.target.value as DowntimeReason })}
              options={Object.entries(DOWNTIME_REASON_LABEL).map(([v, l]) => ({ value: v, label: l }))}
            />
            <Textarea label="What happened (required)" rows={3} value={stop.note} onChange={(e) => setStop({ ...stop, note: e.target.value })} placeholder="Drive belt snapped on the polishing head…" />
            <p className="rounded border border-border bg-surface-2 px-3 py-2 text-2xs text-fg-subtle">
              The clock starts now and runs against availability until the machine is put back in service. A breakdown also
              raises a maintenance request automatically.
            </p>
          </div>
        )}
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
