import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, ArrowRight, CalendarCheck, Gauge, IndianRupee, Timer, Wrench } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { cn } from '@/lib/cn'
import {
  ChartTip, CriticalityBadge, MaintStatusBadge, PriorityBadge, DueChip,
  duration, hours, inr, inrCompact, useMaintenanceData,
} from '@/components/maintenance/MaintShell'
import {
  isoDate, maintenanceAlerts, maintenanceCost, pmCompliance, pmDue, pmVsBreakdown,
  reliabilityOf, spareStatus, woCost,
} from '@/lib/maintFlow'
import { maintenanceTrend } from '@/mock/maintenance'

/**
 * Maintenance dashboard (Ch 4).
 *
 * Ordered by what needs a decision now, not by what is easiest to draw: the
 * things that are down or overdue come first, the reliability trend second,
 * and the cost analysis last. A dashboard where the breakdown count sits below
 * a cost chart is a dashboard for the month-end, not for this morning.
 */

const WINDOW_DAYS = 90

export function MaintenanceDashboardPage() {
  const navigate = useNavigate()
  const m = useMaintenanceData()
  const today = isoDate(new Date())
  const from = isoDate(new Date(Date.now() - (WINDOW_DAYS - 1) * 86_400_000))

  const k = useMemo(() => {
    const assets = m.assets.rows.filter((a) => !a.deletedAt)
    // Only real equipment counts for availability — the plant and the buildings
    // are hierarchy nodes, not machines that can be up or down.
    const machines = assets.filter((a) => a.category !== 'IT' && !['PLANT-01', 'BLD-PROD', 'BLD-UTIL', 'LINE-DD', 'LINE-FIN', 'LINE-ASY'].includes(a.code))

    const reliability = machines
      .map((a) => reliabilityOf(a, m.breakdowns.rows, from, today))
      .sort((a, b) => a.availabilityPct - b.availabilityPct)

    const withFailures = reliability.filter((r) => r.failures > 0)
    const totalUptime = reliability.reduce((s, r) => s + r.uptimeMinutes, 0)
    const totalDowntime = reliability.reduce((s, r) => s + r.downtimeMinutes, 0)
    const totalFailures = reliability.reduce((s, r) => s + r.failures, 0)
    const mttrValues = reliability.filter((r) => r.mttrHours !== null).map((r) => r.mttrHours as number)

    const compliance = pmCompliance(m.workOrders.rows, from, today)
    const cost = maintenanceCost(m.workOrders.rows, from, today)
    const ratio = pmVsBreakdown(m.workOrders.rows, from, today)

    const openBreakdowns = m.breakdowns.rows.filter((b) => !b.deletedAt && !['CLOSED', 'CANCELLED'].includes(b.status))
    const openWos = m.workOrders.rows.filter((w) => !w.deletedAt && ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'].includes(w.status))
    const overdueWos = openWos.filter((w) => w.plannedFinish < today)

    const duePlans = m.plans.rows
      .filter((p) => !p.deletedAt && p.isActive)
      .map((p) => pmDue(p, assets.find((a) => a.code === p.assetCode), today))
      .filter((x) => x.isDue)
      .sort((a, b) => (a.isOverdue === b.isOverdue ? a.elapsedPct - b.elapsedPct : a.isOverdue ? -1 : 1))
      .reverse()

    const lowSpares = m.spares.rows.filter((p) => !p.deletedAt).map((p) => spareStatus(p, m.spareTxns.rows)).filter((s) => s.belowMin)

    const alerts = maintenanceAlerts({
      assets, plans: m.plans.rows, workOrders: m.workOrders.rows, breakdowns: m.breakdowns.rows,
      spares: m.spares.rows, points: m.points.rows, readings: m.readings.rows,
      permits: m.permits.rows, shutdowns: m.shutdowns.rows, spareTxns: m.spareTxns.rows, today,
    })

    // Breakdown minutes by machine — where the downtime actually is.
    const byMachine = reliability
      .filter((r) => r.downtimeMinutes > 0)
      .map((r) => ({ name: r.assetName.length > 20 ? `${r.assetName.slice(0, 19)}…` : r.assetName, minutes: r.downtimeMinutes, failures: r.failures, criticality: r.criticality }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8)

    return {
      machines: machines.length,
      reliability,
      down: assets.filter((a) => a.status === 'BREAKDOWN' || a.status === 'UNDER_MAINTENANCE'),
      // Fleet availability is total uptime over total time, not the mean of the
      // per-machine percentages — averaging percentages of unequal windows lies.
      availabilityPct: totalUptime + totalDowntime > 0 ? (totalUptime / (totalUptime + totalDowntime)) * 100 : 100,
      fleetMtbf: totalFailures > 0 ? totalUptime / 60 / totalFailures : null,
      fleetMttr: mttrValues.length ? mttrValues.reduce((s, v) => s + v, 0) / mttrValues.length : null,
      totalDowntime,
      totalFailures,
      compliance, cost, ratio,
      openBreakdowns, openWos, overdueWos, duePlans, lowSpares, alerts, byMachine,
      criticalAlerts: alerts.filter((a) => a.severity === 'CRITICAL'),
    }
  }, [m.assets.rows, m.plans.rows, m.workOrders.rows, m.breakdowns.rows, m.spares.rows, m.spareTxns.rows, m.points.rows, m.readings.rows, m.permits.rows, m.shutdowns.rows, from, today])

  const costMix = [
    { name: 'Labour', value: k.cost.labour },
    { name: 'Spares', value: k.cost.spares },
    { name: 'External services', value: k.cost.external },
  ].filter((x) => x.value > 0)

  return (
    <div>
      <PageHeader
        title="Maintenance"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/maintenance/breakdowns')}>Log a breakdown</Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/maintenance/work-orders')}>Work orders</Button>
          </>
        }
      />

      {k.criticalAlerts.length > 0 && (
        <Card className="mb-4 border-danger/40">
          <CardBody>
            <p className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-danger">
              <AlertTriangle className="h-4 w-4" /> {k.criticalAlerts.length} thing{k.criticalAlerts.length === 1 ? '' : 's'} need attention now
            </p>
            <ul className="space-y-1">
              {k.criticalAlerts.slice(0, 5).map((a, i) => (
                <li key={i}>
                  <Link to={a.to} className="flex items-baseline gap-2 text-xs hover:underline">
                    <span className="font-medium text-fg">{a.title}</span>
                    <span className="truncate text-2xs text-fg-muted">{a.detail}</span>
                    <ArrowRight className="ml-auto h-3 w-3 shrink-0 text-fg-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
            {k.criticalAlerts.length > 5 && <p className="mt-1.5 text-2xs text-fg-subtle">and {k.criticalAlerts.length - 5} more</p>}
          </CardBody>
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Machine availability"
          value={`${k.availabilityPct.toFixed(1)}%`}
          sub={`${duration(k.totalDowntime)} down across ${k.machines} assets, ${WINDOW_DAYS} days`}
          icon={<Gauge />}
          tone={k.availabilityPct >= 98 ? 'success' : k.availabilityPct >= 95 ? 'warning' : 'danger'}
          onClick={() => navigate('/maintenance/reports')}
        />
        <StatTile
          label="MTBF / MTTR"
          value={k.fleetMtbf === null ? '—' : `${Math.round(k.fleetMtbf)} h`}
          sub={k.fleetMttr === null ? 'No repairs closed in the window' : `Mean repair ${k.fleetMttr.toFixed(1)} h over ${k.totalFailures} failures`}
          icon={<Timer />}
          tone={k.fleetMtbf !== null && k.fleetMtbf > 500 ? 'success' : 'warning'}
          onClick={() => navigate('/maintenance/reports')}
        />
        <StatTile
          label="PM compliance"
          value={`${k.compliance.compliancePct.toFixed(0)}%`}
          sub={`${k.compliance.onTime} of ${k.compliance.due} done by the date due · ${k.compliance.late} late`}
          icon={<CalendarCheck />}
          tone={k.compliance.compliancePct >= 90 ? 'success' : k.compliance.compliancePct >= 75 ? 'warning' : 'danger'}
          onClick={() => navigate('/maintenance/pm')}
        />
        <StatTile
          label="Maintenance spend"
          value={`₹${inrCompact(k.cost.total)}`}
          sub={`${k.ratio.preventiveSharePct.toFixed(0)}% preventive · ${WINDOW_DAYS} days`}
          icon={<IndianRupee />}
          tone={k.ratio.preventiveSharePct >= 60 ? 'success' : 'warning'}
          onClick={() => navigate('/maintenance/reports')}
        />
      </div>

      <Section title="Needs attention">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Assets down or in maintenance', count: k.down.length, to: '/maintenance/breakdowns', icon: AlertTriangle, tone: 'danger' as const },
            { label: 'Preventive jobs due or overdue', count: k.duePlans.length, to: '/maintenance/pm', icon: CalendarCheck, tone: 'warning' as const },
            { label: 'Work orders past their finish date', count: k.overdueWos.length, to: '/maintenance/work-orders', icon: Wrench, tone: 'warning' as const },
            { label: 'Spares below their minimum', count: k.lowSpares.length, to: '/maintenance/spares', icon: Activity, tone: 'danger' as const },
          ].map((c) => (
            <Link key={c.label} to={c.to} className={cn('card flex items-center gap-3 p-3 transition-colors hover:border-border-strong hover:bg-surface-2', c.count === 0 && 'opacity-55')}>
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded [&>svg]:h-4 [&>svg]:w-4', c.tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning')}>
                <c.icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold leading-none text-fg tabular">{c.count}</span>
                <span className="mt-1 block truncate text-xs text-fg-muted">{c.label}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
            </Link>
          ))}
        </div>
      </Section>

      {k.openBreakdowns.length > 0 && (
        <Section title="Down now">
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead><tr><th style={{ width: '11rem' }}>Ticket</th><th>Asset</th><th style={{ width: '9rem' }}>Priority</th><th style={{ width: '11rem' }}>Category</th><th style={{ width: '11rem' }}>Down for</th><th style={{ width: '11rem' }}>Status</th></tr></thead>
                  <tbody>
                    {k.openBreakdowns.map((b) => {
                      const mins = Math.round((Date.now() - new Date(b.downtimeStart).getTime()) / 60_000)
                      return (
                        <tr key={b.uid} className="bg-danger/5">
                          <td className="font-mono text-2xs text-fg">{b.docNo}</td>
                          <td><p className="truncate text-xs text-fg">{b.assetName}</p><p className="font-mono text-3xs text-fg-subtle">{b.assetCode}</p></td>
                          <td><PriorityBadge priority={b.priority} /></td>
                          <td className="text-2xs text-fg-muted">{b.category.toLowerCase()}</td>
                          <td className="text-xs tabular text-danger">{b.downtimeEnd ? duration(0) : duration(mins)}</td>
                          <td><MaintStatusBadge status={b.status} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </Section>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Downtime, reliability and compliance" description="Six months — downtime falling while MTBF rises is the programme working" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={maintenanceTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={44} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar yAxisId="l" dataKey="downtimeHours" name="Downtime (h)" fill="#ef4444" maxBarSize={26} radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="mtbfHours" name="MTBF (h)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="l" type="monotone" dataKey="pmCompliancePct" name="PM compliance (%)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Where the downtime is" description={`Top machines, last ${WINDOW_DAYS} days`} />
          <CardBody className="h-64">
            {k.byMachine.length === 0 ? (
              <p className="grid h-full place-items-center text-2xs text-fg-subtle">No downtime recorded in the window.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={k.byMachine} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip content={<ChartTip suffix=" min" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Bar dataKey="minutes" name="Downtime" maxBarSize={18} radius={[0, 3, 3, 0]}>
                    {k.byMachine.map((r, i) => (<Cell key={i} fill={r.criticality === 'A' ? '#ef4444' : r.criticality === 'B' ? '#f59e0b' : '#94a3b8'} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Preventive work falling due" description="Overdue first" actions={<Button variant="ghost" size="sm" onClick={() => navigate('/maintenance/pm')}>Open</Button>} />
          <CardBody className="p-0">
            {k.duePlans.length === 0 ? (
              <p className="px-3 py-6 text-center text-2xs text-fg-subtle">Nothing due. Every plan is inside its interval.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead><tr><th style={{ width: '13rem' }}>Plan</th><th>Asset</th><th style={{ width: '11rem' }}>Elapsed</th><th style={{ width: '20rem' }}>Basis</th></tr></thead>
                  <tbody>
                    {k.duePlans.slice(0, 7).map((x) => (
                      <tr key={x.plan.uid} className={x.isOverdue ? 'bg-danger/5' : undefined}>
                        <td><p className="truncate text-xs text-fg">{x.plan.name}</p><p className="font-mono text-3xs text-fg-subtle">{x.plan.code}</p></td>
                        <td><p className="truncate text-2xs text-fg-muted">{x.plan.assetName}</p></td>
                        <td>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={Math.min(100, x.elapsedPct)} tone={x.isOverdue ? 'danger' : x.elapsedPct >= 90 ? 'warning' : 'success'} className="w-12" />
                            <span className={cn('text-2xs tabular', x.isOverdue ? 'text-danger' : 'text-fg-muted')}>{x.elapsedPct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td><p className="text-2xs text-fg-muted">{x.basis}</p></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Preventive against reactive" description="Where the money goes" />
            <CardBody>
              <p className={cn('text-2xl font-semibold tabular', k.ratio.preventiveSharePct >= 60 ? 'text-success' : 'text-warning')}>
                {k.ratio.preventiveSharePct.toFixed(0)}%
              </p>
              <p className="mt-1 text-2xs text-fg-muted">of maintenance spend was planned work</p>
              <div className="mt-2 space-y-1 text-2xs">
                <p className="flex justify-between"><span className="text-fg-muted">Preventive & predictive</span><span className="tabular text-fg">{inr(k.ratio.preventiveCost)} · {k.ratio.preventiveJobs} jobs</span></p>
                <p className="flex justify-between"><span className="text-fg-muted">Breakdown & corrective</span><span className="tabular text-fg">{inr(k.ratio.reactiveCost)} · {k.ratio.reactiveJobs} jobs</span></p>
              </div>
              {k.ratio.preventiveSharePct < 50 && (
                <p className="mt-2 text-3xs leading-relaxed text-warning">
                  More is being spent putting things right than keeping them right. One large failure can do this to the ratio — check whether it is a trend or a single event before acting on it.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Cost breakdown" description={`Last ${WINDOW_DAYS} days`} />
            <CardBody className="space-y-1.5">
              {costMix.map((c) => (
                <div key={c.name}>
                  <p className="flex justify-between text-2xs"><span className="text-fg-muted">{c.name}</span><span className="tabular text-fg">{inr(c.value)}</span></p>
                  <ProgressBar value={k.cost.total > 0 ? (c.value / k.cost.total) * 100 : 0} tone="brand" />
                </div>
              ))}
              <p className="!mt-3 flex justify-between border-t border-border pt-2 text-xs"><span className="font-medium text-fg">Total</span><span className="font-semibold tabular text-fg">{inr(k.cost.total)}</span></p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Least available assets" description={`Last ${WINDOW_DAYS} days`} />
            <CardBody className="space-y-2">
              {k.reliability.filter((r) => r.failures > 0).slice(0, 4).map((r) => (
                <div key={r.assetCode} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-2xs text-fg">{r.assetName}</span>
                    <span className="block text-3xs text-fg-subtle">{r.failures} failure{r.failures === 1 ? '' : 's'} · {duration(r.downtimeMinutes)} down</span>
                  </span>
                  <span className={cn('shrink-0 text-xs font-medium tabular', r.availabilityPct >= 98 ? 'text-success' : r.availabilityPct >= 95 ? 'text-warning' : 'text-danger')}>
                    {r.availabilityPct.toFixed(1)}%
                  </span>
                </div>
              ))}
              {k.reliability.every((r) => r.failures === 0) && (
                <p className="text-2xs text-fg-subtle">No asset has failed in the window.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
