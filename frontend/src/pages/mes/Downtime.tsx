import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { DOWNTIME_REASON_LABEL, Duration, MesChartTip } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { downtimeEvents as seedDowntime, machines } from '@/mock/mes'
import type { DowntimeEvent } from '@/types/mes'

/**
 * Downtime — every minute a machine was not making good parts, with a reason.
 * This is where OEE availability comes from, so an unexplained stop is a hole
 * in the number.
 */
export function DowntimePage() {
  const toast = useToast()
  const seed = useMemo(() => seedDowntime, [])
  const { rows: events, update } = useCollection<DowntimeEvent>('mes:downtime', seed)
  const rowEdit = useRowEdit<DowntimeEvent>({
    key: 'mes:downtime',
    seed: seed,
    entity: 'Downtime event',
    titleOf: (r) => r.docNo,
  })

  const [closeTarget, setCloseTarget] = useState<DowntimeEvent | null>(null)
  const [action, setAction] = useState('')

  const open = events.filter((e) => e.isOpen)
  const totalMinutes = events.reduce((s, e) => s + e.minutes, 0)
  const plannedMinutes = machines.reduce((s, m) => s + m.plannedMinutes, 0)
  const availability = plannedMinutes ? ((plannedMinutes - totalMinutes) / plannedMinutes) * 100 : 0

  const byReason = Object.keys(DOWNTIME_REASON_LABEL)
    .map((r) => ({
      reason: DOWNTIME_REASON_LABEL[r],
      key: r,
      minutes: events.filter((e) => e.reason === r).reduce((s, e) => s + e.minutes, 0),
      count: events.filter((e) => e.reason === r).length,
    }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)

  const columns: Column<DowntimeEvent>[] = [
    { key: 'docNo', header: 'Event', sortable: true, width: '11rem', render: (e) => <span className="font-mono text-xs font-medium text-brand-600">{e.docNo}</span> },
    { key: 'machineCode', header: 'Machine', sortable: true, width: '12rem', render: (e) => (
      <div>
        <p className="font-mono text-2xs text-fg">{e.machineCode}</p>
        <p className="truncate text-2xs text-fg-subtle">{e.machine}</p>
      </div>
    ) },
    { key: 'workCentre', header: 'Work centre', sortable: true },
    { key: 'reason', header: 'Reason', sortable: true, width: '12rem', render: (e) => (
      <Badge tone={e.reason === 'BREAKDOWN' ? 'danger' : e.reason === 'PLANNED_MAINTENANCE' ? 'progress' : 'warning'} size="sm" dot={false}>
        {DOWNTIME_REASON_LABEL[e.reason]}
      </Badge>
    ) },
    { key: 'startedAt', header: 'From', sortable: true, width: '10rem', accessor: (e) => e.startedAt, render: (e) => <span className="text-2xs">{formatDateTime(e.startedAt)}</span> },
    { key: 'endedAt', header: 'To', width: '10rem', render: (e) => (e.endedAt ? <span className="text-2xs">{formatDateTime(e.endedAt)}</span> : <Badge tone="danger" size="sm">Still down</Badge>) },
    { key: 'minutes', header: 'Lost', width: '7rem', sortable: true, render: (e) => (
      <span className={cn(e.minutes > 120 ? 'text-danger' : e.minutes > 45 ? 'text-warning' : '')}><Duration minutes={e.minutes} /></span>
    ) },
    { key: 'shift', header: 'Shift', align: 'center', width: '5.5rem', sortable: true },
    { key: 'reportedBy', header: 'Reported by', sortable: true, defaultHidden: true },
    { key: 'correctiveAction', header: 'What was done', render: (e) => (
      e.correctiveAction ? <span className="text-2xs text-fg-muted">{e.correctiveAction}</span> : <span className="text-2xs text-danger">not recorded</span>
    ) },
    { key: 'maintenanceRequestNo', header: 'Maintenance', width: '10rem', render: (e) => (e.maintenanceRequestNo ? <span className="font-mono text-2xs">{e.maintenanceRequestNo}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'downtime-register', 'Downtime register', columnsFromTable(columns), events)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Machine downtime"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Downtime' }]}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', open.length ? 'text-danger' : 'text-success')}>{open.length}</span> machine
        {open.length === 1 ? '' : 's'} down right now · <span className="font-medium text-fg tabular">{Math.round(totalMinutes)}</span>{' '}
        minutes lost today across {events.length} events · availability{' '}
        <span className={cn('font-medium tabular', availability >= 90 ? 'text-success' : availability >= 80 ? 'text-warning' : 'text-danger')}>
          {availability.toFixed(1)}%
        </span>
        . Every stop needs a reason — that is what turns lost time into something you can fix.
      </p>

      {open.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Down right now" description="Each of these is costing availability by the minute" />
          <CardBody className="space-y-2.5">
            {open.map((e) => (
              <div key={e.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {e.machineCode} — {e.machine}
                  </p>
                  <p className="text-2xs text-fg-muted">
                    {DOWNTIME_REASON_LABEL[e.reason]} · since {formatDateTime(e.startedAt)} · reported by {e.reportedBy}
                    {e.maintenanceRequestNo ? ` · ${e.maintenanceRequestNo}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular text-danger">
                    {Math.round((Date.now() - new Date(e.startedAt).getTime()) / 60_000)} min
                  </span>
                  <Button variant="success" size="sm" onClick={() => { setCloseTarget(e); setAction(e.correctiveAction ?? '') }}>
                    Close event
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader title="Where the time went" description="Minutes lost by reason — the tall bar is where to start" />
        <CardBody className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byReason} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="reason" width={130} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <Tooltip content={<MesChartTip suffix=" min" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
              <Bar dataKey="minutes" name="Minutes lost" radius={[0, 3, 3, 0]} maxBarSize={20}>
                {byReason.map((r, i) => (
                  <Cell key={i} fill={r.key === 'BREAKDOWN' ? '#ef4444' : r.key === 'PLANNED_MAINTENANCE' ? '#3b82f6' : '#f59e0b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <DataTable
        rows={events}
        columns={columns}
        rowKey={(e) => e.uid}
        searchPlaceholder="Search machine, reason, work centre or person…"
        onExport={doExport}
        emptyTitle="No downtime logged"
        emptyDescription="A shift with no stops is rare — if this is empty, check that operators are logging them."
        rowClassName={(e) => cn(e.isOpen && 'bg-danger/[0.04]')}
        rowActions={(e) => (
          <>
            {rowEdit.actions(e)}
            <MenuItem label="Close the event" disabled={!e.isOpen} onClick={() => { setCloseTarget(e); setAction(e.correctiveAction ?? '') }} />
            <MenuItem
              label="Raise a maintenance request"
              disabled={!!e.maintenanceRequestNo}
              onClick={() => {
                update(e.uid, { maintenanceRequestNo: `MWO/26-27/${String(180 + Math.floor(Math.random() * 20))}` })
                toast.success('Maintenance request raised', `${e.machineCode} sent to maintenance with the downtime record attached.`)
              }}
            />
          </>
        )}
      />

      <Modal
        open={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        title={closeTarget ? `Close — ${closeTarget.machineCode}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!closeTarget) return
                if (!action.trim()) {
                  toast.error('Corrective action required', 'Closing a stop without saying what fixed it means the same stop happens again next month.')
                  return
                }
                const minutes = Math.max(1, Math.round((Date.now() - new Date(closeTarget.startedAt).getTime()) / 60_000))
                update(closeTarget.uid, { isOpen: false, endedAt: new Date().toISOString(), minutes, correctiveAction: action.trim() })
                toast.success('Event closed', `${minutes} minutes recorded against ${DOWNTIME_REASON_LABEL[closeTarget.reason].toLowerCase()} on ${closeTarget.machineCode}.`)
                setCloseTarget(null)
              }}
            >
              Close event
            </Button>
          </>
        }
      >
        {closeTarget && (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              {closeTarget.machine} has been down for{' '}
              <span className="font-medium text-fg">{Math.round((Date.now() - new Date(closeTarget.startedAt).getTime()) / 60_000)} minutes</span>{' '}
              since {formatDateTime(closeTarget.startedAt)} — {DOWNTIME_REASON_LABEL[closeTarget.reason].toLowerCase()}.
            </p>
            <Textarea label="What fixed it (required)" rows={3} value={action} onChange={(e) => setAction(e.target.value)} placeholder="Drive belt replaced, tension re-set and test run completed…" />
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Planned is not the same as unplanned" description="Both cost time; only one is a surprise" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p><span className="font-medium text-fg">Planned maintenance and changeovers</span> are scheduled. They still reduce availability, but they are budgeted for.</p>
          <p><span className="font-medium text-fg">Breakdowns and power failures</span> are what the OEE conversation is actually about — unplanned, and usually repeated.</p>
          <p><span className="font-medium text-fg">Waiting</span> — for material, for QC, for an operator — is the quietest and often the largest category. It rarely gets logged unless the system insists.</p>
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
