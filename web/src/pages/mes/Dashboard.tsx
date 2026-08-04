import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { DOWNTIME_REASON_LABEL, Duration, MachineDot, MesChartTip, MesStatusBadge, OeeBar, SCRAP_REASON_LABEL } from '@/components/mes/MesShell'
import { formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import {
  downtimeEvents as seedDowntime,
  hourlyOutput,
  machines as seedMachines,
  oeeTrend,
  productionOrders as seedOrders,
  scrapRecords as seedScrap,
  shiftLogs as seedShifts,
  workOrders as seedWorkOrders,
} from '@/mock/mes'
import type { DowntimeEvent, Machine, ProductionOrder, ScrapRecord, ShiftLog, WorkOrder } from '@/types/mes'

/**
 * Shop-floor dashboard — the screen on the wall. It answers four questions in
 * order: are we making the number, is anything stopped, is anything being
 * rejected, and what is coming next.
 */
export function MesDashboardPage() {
  const orderSeed = useMemo(() => seedOrders, [])
  const woSeed = useMemo(() => seedWorkOrders, [])
  const machineSeed = useMemo(() => seedMachines, [])
  const downSeed = useMemo(() => seedDowntime, [])
  const scrapSeed = useMemo(() => seedScrap, [])
  const shiftSeed = useMemo(() => seedShifts, [])

  const { rows: orders } = useCollection<ProductionOrder>('mes:order', orderSeed)
  const { rows: workOrders } = useCollection<WorkOrder>('mes:workorder', woSeed)
  const { rows: machines } = useCollection<Machine>('mes:machine', machineSeed)
  const { rows: downtime } = useCollection<DowntimeEvent>('mes:downtime', downSeed)
  const { rows: scrap } = useCollection<ScrapRecord>('mes:scrap', scrapSeed)
  const { rows: shifts } = useCollection<ShiftLog>('mes:shift', shiftSeed)

  /* ── Today's numbers ─────────────────────────────────────────────────── */
  const planned = hourlyOutput.reduce((s, h) => s + h.planned, 0)
  const actual = hourlyOutput.reduce((s, h) => s + h.actual, 0)
  const hourScrap = hourlyOutput.reduce((s, h) => s + h.scrap, 0)
  const attainment = planned ? (actual / planned) * 100 : 0

  const running = machines.filter((m) => m.state === 'RUNNING')
  const stopped = machines.filter((m) => m.state === 'BREAKDOWN' || m.state === 'MAINTENANCE')
  const openDowntime = downtime.filter((d) => d.isOpen)
  const lostMinutes = downtime.reduce((s, d) => s + d.minutes, 0)

  const activeOrders = orders.filter((o) => o.status === 'IN_PROGRESS' || o.status === 'RELEASED' || o.status === 'MATERIAL_ALLOCATED')
  const blocked = orders.filter((o) => o.status === 'PLANNED' && !(o.materialReady && o.machineReady && o.toolingReady && o.manpowerReady))
  const qcHold = workOrders.filter((w) => w.status === 'QC_HOLD')
  const runningWo = workOrders.filter((w) => w.status === 'RUNNING' || w.status === 'SETUP')

  const openShift = shifts.find((s) => s.status === 'OPEN')

  /* ── Plant OEE from the totals ───────────────────────────────────────── */
  const plant = useMemo(() => {
    const withTime = machines.filter((m) => m.plannedMinutes > 0)
    const p = withTime.reduce((s, m) => s + m.plannedMinutes, 0)
    const d = withTime.reduce((s, m) => s + m.downMinutes, 0)
    const r = withTime.reduce((s, m) => s + m.runMinutes, 0)
    const ideal = withTime.reduce((s, m) => s + (m.totalPieces * m.idealCycleSeconds) / 60, 0)
    const total = withTime.reduce((s, m) => s + m.totalPieces, 0)
    const good = withTime.reduce((s, m) => s + m.goodPieces, 0)
    const availability = p ? ((p - d) / p) * 100 : 0
    const performance = r ? Math.min(100, (ideal / r) * 100) : 0
    const quality = total ? (good / total) * 100 : 0
    return { availability, performance, quality, oee: (availability * performance * quality) / 10_000 }
  }, [machines])

  /* ── Top losses ──────────────────────────────────────────────────────── */
  const downByReason = Object.keys(DOWNTIME_REASON_LABEL)
    .map((r) => ({ reason: DOWNTIME_REASON_LABEL[r], key: r, minutes: downtime.filter((d) => d.reason === r).reduce((s, d) => s + d.minutes, 0) }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5)

  const scrapByReason = Object.keys(SCRAP_REASON_LABEL)
    .map((r) => ({ reason: SCRAP_REASON_LABEL[r], qty: scrap.filter((x) => x.reason === r).reduce((s, x) => s + x.quantity, 0) }))
    .filter((r) => r.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  /* ── Cumulative gap through the day ──────────────────────────────────── */
  let cumPlanned = 0
  let cumActual = 0
  const cumulative = hourlyOutput.map((h) => {
    cumPlanned += h.planned
    cumActual += h.actual
    return { hour: h.hour, planned: h.planned, actual: h.actual, gap: cumActual - cumPlanned }
  })

  return (
    <div>
      <PageHeader
        title="Shop floor"
        description="Live picture of the plant — output against plan, what is stopped, and what is being rejected"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor' }]}
      />

      {/* Headline strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/production/entry" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Made today</p>
          <p className="mt-1 text-2xl font-semibold tabular text-fg">{formatQty(actual)}</p>
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar value={Math.min(100, attainment)} tone={attainment >= 95 ? 'success' : attainment >= 85 ? 'warning' : 'danger'} className="flex-1" />
            <span className={cn('text-2xs font-medium tabular', attainment >= 95 ? 'text-success' : attainment >= 85 ? 'text-warning' : 'text-danger')}>
              {attainment.toFixed(0)}%
            </span>
          </div>
          <p className="mt-1 text-2xs text-fg-muted">against a plan of {formatQty(planned)}</p>
        </Link>

        <Link to="/production/oee" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Plant OEE</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', plant.oee >= 85 ? 'text-success' : plant.oee >= 70 ? 'text-warning' : 'text-danger')}>
            {plant.oee.toFixed(1)}%
          </p>
          <p className="mt-2 text-2xs text-fg-muted">
            A {plant.availability.toFixed(0)}% · P {plant.performance.toFixed(0)}% · Q {plant.quality.toFixed(0)}%
          </p>
          <p className="mt-1 text-2xs text-fg-subtle">availability is the weakest factor today</p>
        </Link>

        <Link to="/production/downtime" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Machines stopped</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', stopped.length ? 'text-danger' : 'text-success')}>{stopped.length}</p>
          <p className="mt-2 text-2xs text-fg-muted">
            {running.length} running of {machines.length} · <span className="tabular">{Math.round(lostMinutes)}</span> minutes lost today
          </p>
          {openDowntime.length > 0 && <p className="mt-1 text-2xs text-danger">{openDowntime.length} event{openDowntime.length === 1 ? '' : 's'} still open</p>}
        </Link>

        <Link to="/production/scrap" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Rejected today</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', hourScrap > planned * 0.02 ? 'text-danger' : 'text-fg')}>{formatQty(hourScrap)}</p>
          <p className="mt-2 text-2xs text-fg-muted">
            {actual ? ((hourScrap / actual) * 100).toFixed(1) : '0.0'}% of what was made
          </p>
          <p className="mt-1 text-2xs text-fg-subtle">{scrapByReason[0]?.reason ?? 'no defects'} is the biggest cause</p>
        </Link>
      </div>

      {/* Anything that needs a decision right now */}
      {(openDowntime.length > 0 || qcHold.length > 0 || blocked.length > 0) && (
        <Card className="mb-4">
          <CardHeader title="Needs a decision now" description="Each of these is holding something up on the floor" />
          <CardBody className="space-y-2">
            {openDowntime.map((d) => (
              <Link key={d.uid} to="/production/downtime" className="flex flex-wrap items-center justify-between gap-2 rounded border border-danger/30 bg-danger/5 p-2.5 hover:bg-danger/10">
                <span className="text-xs text-fg">
                  <span className="font-medium">{d.machineCode}</span> down — {DOWNTIME_REASON_LABEL[d.reason].toLowerCase()}, reported by {d.reportedBy}
                </span>
                <Badge tone="danger" size="sm">Still down</Badge>
              </Link>
            ))}
            {qcHold.map((w) => (
              <Link key={w.uid} to="/production/work-orders" className="flex flex-wrap items-center justify-between gap-2 rounded border border-warning/30 bg-warning/5 p-2.5 hover:bg-warning/10">
                <span className="text-xs text-fg">
                  <span className="font-mono font-medium">{w.docNo}</span> — {w.operationName} waiting for a quality decision on{' '}
                  <span className="tabular">{formatQty(w.producedQty)}</span> pieces
                </span>
                <Badge tone="warning" size="sm">QC hold</Badge>
              </Link>
            ))}
            {blocked.map((o) => {
              const missing = [
                !o.materialReady && 'material',
                !o.machineReady && 'machine',
                !o.toolingReady && 'tooling',
                !o.manpowerReady && 'manpower',
              ].filter(Boolean)
              return (
                <Link key={o.uid} to="/production/orders" className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2.5 hover:bg-surface-2">
                  <span className="text-xs text-fg">
                    <span className="font-mono font-medium">{o.docNo}</span> cannot be released — waiting on {missing.join(', ')}
                  </span>
                  <Badge tone="neutral" size="sm" dot={false}>Blocked</Badge>
                </Link>
              )
            })}
          </CardBody>
        </Card>
      )}

      {/* Output through the day */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Output hour by hour"
            description={cumulative.at(-1)?.gap !== undefined && cumulative.at(-1)!.gap < 0
              ? `Running ${formatQty(Math.abs(cumulative.at(-1)!.gap))} pieces behind plan — the gap opened at 09:00`
              : 'Running ahead of plan'}
          />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cumulative} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<MesChartTip suffix=" pcs" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="actual" name="Made" radius={[3, 3, 0, 0]} maxBarSize={30}>
                  {cumulative.map((h, i) => (
                    <Cell key={i} fill={h.actual >= h.planned ? '#10b981' : h.actual >= h.planned * 0.8 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="planned" name="Plan" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="OEE this shift" description="The three factors behind the headline" />
          <CardBody>
            <OeeBar availability={plant.availability} performance={plant.performance} quality={plant.quality} />
            <div className="mt-4 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={oeeTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="oeeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[50, 100]} hide />
                  <Tooltip content={<MesChartTip suffix="%" />} />
                  <Area type="monotone" dataKey="oee" name="OEE" stroke="#f59e0b" strokeWidth={2} fill="url(#oeeFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-2xs text-fg-muted">Seven-day trend — today is the lowest of the week.</p>
          </CardBody>
        </Card>
      </div>

      {/* Losses */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Where the time went" description="Minutes lost by reason" actions={<Link to="/production/downtime" className="text-2xs font-medium text-brand-600 hover:underline">All downtime</Link>} />
          <CardBody className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={downByReason} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="reason" width={125} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<MesChartTip suffix=" min" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="minutes" name="Minutes lost" radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {downByReason.map((r, i) => (
                    <Cell key={i} fill={r.key === 'BREAKDOWN' ? '#ef4444' : r.key === 'PLANNED_MAINTENANCE' ? '#3b82f6' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Why pieces are being rejected" description="Pieces by defect" actions={<Link to="/production/scrap" className="text-2xs font-medium text-brand-600 hover:underline">All scrap</Link>} />
          <CardBody className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scrapByReason} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="reason" width={125} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<MesChartTip suffix=" pcs" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="qty" name="Pieces" radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {scrapByReason.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Floor state */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Machines" description="What every machine is doing right now" actions={<Link to="/production/machines" className="text-2xs font-medium text-brand-600 hover:underline">Machine status</Link>} />
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {machines.map((m) => (
              <div key={m.uid} className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <MachineDot state={m.state} />
                  <div className="min-w-0">
                    <p className="font-mono text-2xs font-medium text-fg">{m.code}</p>
                    <p className="truncate text-2xs text-fg-subtle">{m.currentOperator ?? 'no operator'}</p>
                  </div>
                </div>
                <span className={cn(
                  'shrink-0 text-2xs',
                  m.state === 'RUNNING' ? 'text-success' : m.state === 'BREAKDOWN' ? 'text-danger' : m.state === 'MAINTENANCE' ? 'text-progress' : 'text-fg-subtle',
                )}>
                  {m.state.toLowerCase()}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Running now" description={`${runningWo.length} operation${runningWo.length === 1 ? '' : 's'} in progress`} actions={<Link to="/production/queue" className="text-2xs font-medium text-brand-600 hover:underline">Queue</Link>} />
            <CardBody className="space-y-2">
              {runningWo.slice(0, 5).map((w) => (
                <div key={w.uid} className="rounded border border-border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-fg">{w.operationName}</p>
                    <MesStatusBadge status={w.status} size="sm" />
                  </div>
                  <p className="mt-0.5 text-2xs text-fg-muted">
                    {w.machine ?? 'no machine'} · {w.operator ?? 'not assigned'} ·{' '}
                    <span className="tabular">{formatQty(w.producedQty)}/{formatQty(w.plannedQty)}</span>
                  </p>
                  <ProgressBar value={w.plannedQty ? (w.producedQty / w.plannedQty) * 100 : 0} tone="brand" className="mt-1.5" />
                </div>
              ))}
              {runningWo.length === 0 && <p className="py-4 text-center text-xs text-fg-muted">Nothing is running — the floor is idle.</p>}
            </CardBody>
          </Card>

          {openShift && (
            <Card>
              <CardHeader title={`Shift ${openShift.shift} — ${openShift.line}`} description={openShift.supervisor} actions={<Link to="/production/shifts" className="text-2xs font-medium text-brand-600 hover:underline">Shifts</Link>} />
              <CardBody className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <ProgressBar value={openShift.targetQty ? Math.min(100, (openShift.actualQty / openShift.targetQty) * 100) : 0} tone="brand" className="flex-1" />
                  <span className="tabular text-fg">{formatQty(openShift.actualQty)}/{formatQty(openShift.targetQty)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-2xs text-fg-muted">
                  <p>Manpower <span className={cn('block font-medium tabular', openShift.manpowerPresent < openShift.manpowerPlanned ? 'text-warning' : 'text-fg')}>{openShift.manpowerPresent}/{openShift.manpowerPlanned}</span></p>
                  <p>Run <span className="block font-medium text-fg"><Duration minutes={openShift.runMinutes} /></span></p>
                  <p>Down <span className="block font-medium text-danger"><Duration minutes={openShift.downMinutes} /></span></p>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Orders on the floor" description={`${activeOrders.length} active · ${blocked.length} blocked`} actions={<Link to="/production/orders" className="text-2xs font-medium text-brand-600 hover:underline">All orders</Link>} />
            <CardBody className="space-y-2">
              {activeOrders.slice(0, 4).map((o) => (
                <div key={o.uid} className="rounded border border-border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-2xs font-medium text-brand-600">{o.docNo}</p>
                    <MesStatusBadge status={o.status} size="sm" />
                  </div>
                  <p className="mt-0.5 truncate text-2xs text-fg-muted">{o.itemName}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ProgressBar value={o.plannedQty ? (o.producedQty / o.plannedQty) * 100 : 0} tone="brand" className="flex-1" />
                    <span className="text-2xs tabular text-fg-muted">{formatQty(o.producedQty)}/{formatQty(o.plannedQty)}</span>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
