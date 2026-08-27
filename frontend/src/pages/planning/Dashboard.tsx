import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Factory,
  Gauge,
  PackageX,
  Play,
  Target,
  TrendingUp,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { ChartTip, LoadCell, OrderStatusBadge, PriorityBadge } from '@/components/planning/PlanShell'
import { cn } from '@/lib/cn'
import { formatAmount, formatCompact, formatDate, formatQty } from '@/lib/format'
import { bucketIndex, capacityPlan, forecastAccuracy, isPastDue } from '@/lib/planFlow'
import { usePlanningData } from './usePlanningData'
import { planVsActual } from '@/mock/planning'
import type { ProductionOrder } from '@/types/planning'

/**
 * Planning dashboard (Ch 4 and 20).
 *
 * The questions a planner opens the day with: what is late, what is short, what
 * is overloaded, and is the plan being hit. Everything here is live off the same
 * MRP run the rest of the portal uses, so the dashboard cannot disagree with the
 * screen you click into. These are the only KPI cards in the portal.
 */

const OPEN: ProductionOrder['status'][] = ['PLANNED', 'FIRM_PLANNED', 'RELEASED', 'MATERIAL_RESERVED', 'MATERIAL_ISSUED', 'IN_PRODUCTION']

export function PlanningDashboardPage() {
  const navigate = useNavigate()
  const { mrp, demand, forecast, orders, ctx, starts } = usePlanningData()

  const kpis = useMemo(() => {
    const open = orders.rows.filter((o) => !o.deletedAt && OPEN.includes(o.status))
    const late = open.filter((o) => o.plannedFinish < starts[0])
    const running = open.filter((o) => o.status === 'IN_PRODUCTION')
    const openDemand = demand.rows.filter((d) => d.status === 'OPEN')
    const overdueDemand = openDemand.filter((d) => isPastDue(d.requiredOn))
    const unreserved = open
      .filter((o) => ['RELEASED', 'MATERIAL_RESERVED'].includes(o.status))
      .filter((o) => o.components.some((c) => c.reservedQty < c.requiredQty))

    const crp = capacityPlan(
      mrp.plannedOrders.filter((o) => o.orderType === 'PRODUCTION').map((o) => ({ productCode: o.itemCode, qty: o.qty, bucket: Math.max(0, o.releaseBucket) })),
      ctx,
      starts,
    )
    const bottlenecks = crp.filter((r) => r.isBottleneck)

    const attainment = planVsActual.length
      ? (planVsActual.reduce((s, w) => s + w.actual, 0) / planVsActual.reduce((s, w) => s + w.planned, 0)) * 100
      : 0
    const onTime = planVsActual.length ? planVsActual.reduce((s, w) => s + w.onTimePct, 0) / planVsActual.length : 0

    return {
      open,
      late,
      running,
      openDemand,
      overdueDemand,
      unreserved,
      crp,
      bottlenecks,
      attainment,
      onTime,
      openDemandQty: openDemand.reduce((s, d) => s + Math.max(0, d.qty - d.qtyPlanned), 0),
      wipValue: running.reduce((s, o) => s + o.estimatedUnitCost * (o.qty - o.producedQty), 0),
      accuracy: forecastAccuracy(forecast.rows),
    }
  }, [orders.rows, demand.rows, forecast.rows, mrp.plannedOrders, ctx, starts])

  const actionQueue = [
    { label: 'Shortages that cannot be covered in time', count: mrp.shortages.length, to: '/planning/mrp', icon: PackageX, tone: 'danger' as const },
    { label: 'MRP exceptions to review', count: mrp.exceptions.filter((e) => e.severity !== 'INFO').length, to: '/planning/mrp', icon: AlertTriangle, tone: 'warning' as const },
    { label: 'Planned orders waiting to be firmed', count: mrp.plannedOrders.filter((o) => o.orderType === 'PRODUCTION').length, to: '/planning/mrp', icon: Play, tone: 'pending' as const },
    { label: 'Work centres over capacity', count: kpis.bottlenecks.length, to: '/planning/capacity', icon: Gauge, tone: 'danger' as const },
    { label: 'Orders past their finish date', count: kpis.late.length, to: '/planning/orders', icon: CalendarClock, tone: 'danger' as const },
    { label: 'Orders with material not fully reserved', count: kpis.unreserved.length, to: '/planning/reservations', icon: ClipboardList, tone: 'warning' as const },
    { label: 'Demand lines past the required date', count: kpis.overdueDemand.length, to: '/planning/demand', icon: Target, tone: 'warning' as const },
    { label: 'Orders in production now', count: kpis.running.length, to: '/planning/orders', icon: Factory, tone: 'progress' as const },
  ]

  /** Demand against planned supply, week by week. */
  const supplyDemand = useMemo(
    () =>
      starts.map((s, b) => {
        const dem = demand.rows
          .filter((d) => d.status === 'OPEN' && bucketIndex(d.requiredOn, starts) === b)
          .reduce((t, d) => t + Math.max(0, d.qty - d.qtyPlanned), 0)
        const planned = mrp.plannedOrders
          .filter((o) => o.orderType === 'PRODUCTION' && o.bucket === b)
          .reduce((t, o) => t + o.qty, 0)
        const firm = orders.rows
          .filter((o) => !o.deletedAt && OPEN.includes(o.status) && bucketIndex(o.plannedFinish, starts) === b)
          .reduce((t, o) => t + (o.qty - o.producedQty), 0)
        return { week: `W${b + 1}`, Demand: Math.round(dem), Planned: Math.round(planned), Firm: Math.round(firm), _start: s }
      }),
    [starts, demand.rows, mrp.plannedOrders, orders.rows],
  )

  return (
    <div>
      <PageHeader
        title="Production planning"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/planning/mps')}>
              Master schedule
            </Button>
            <Button variant="primary" size="sm" icon={<Play className="h-4 w-4" />} onClick={() => navigate('/planning/mrp')}>
              Open MRP
            </Button>
          </>
        }
      />

      {/* KPI row ------------------------------------------------------------- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Open demand"
          value={formatCompact(kpis.openDemandQty)}
          sub={`${kpis.openDemand.length} lines · ${kpis.overdueDemand.length} overdue`}
          icon={<Target />}
          tone={kpis.overdueDemand.length ? 'warning' : 'brand'}
          onClick={() => navigate('/planning/demand')}
        />
        <StatTile
          label="Material shortages"
          value={mrp.shortages.length}
          sub={mrp.shortages.length ? `₹${formatCompact(mrp.shortages.reduce((s, x) => s + x.value, 0))} at risk` : 'Everything coverable in lead time'}
          icon={<PackageX />}
          tone={mrp.shortages.length ? 'danger' : 'success'}
          onClick={() => navigate('/planning/mrp')}
        />
        <StatTile
          label="Peak capacity load"
          value={`${Math.max(0, ...kpis.crp.map((r) => r.peakLoadPct)).toFixed(0)}%`}
          sub={kpis.bottlenecks.length ? `${kpis.bottlenecks.length} centre${kpis.bottlenecks.length === 1 ? '' : 's'} over 100%` : 'No centre over capacity'}
          icon={<Gauge />}
          tone={kpis.bottlenecks.length ? 'danger' : 'success'}
          onClick={() => navigate('/planning/capacity')}
        />
        <StatTile
          label="Plan attainment"
          value={`${kpis.attainment.toFixed(0)}%`}
          sub={`On-time completion ${kpis.onTime.toFixed(0)}% over eight weeks`}
          icon={<TrendingUp />}
          tone={kpis.attainment >= 95 ? 'success' : kpis.attainment >= 88 ? 'warning' : 'danger'}
          onClick={() => navigate('/planning/reports')}
        />
      </div>

      {/* Action queue --------------------------------------------------------- */}
      <Section title="Needs attention">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {actionQueue.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className={cn(
                'card flex items-center gap-3 p-3 transition-colors hover:border-border-strong hover:bg-surface-2',
                a.count === 0 && 'opacity-55',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded [&>svg]:h-4 [&>svg]:w-4',
                  a.tone === 'danger' && 'bg-danger/10 text-danger',
                  a.tone === 'warning' && 'bg-warning/10 text-warning',
                  a.tone === 'pending' && 'bg-pending/10 text-pending',
                  a.tone === 'progress' && 'bg-progress/10 text-progress',
                )}
              >
                <a.icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold leading-none text-fg tabular">{a.count}</span>
                <span className="mt-1 block truncate text-xs text-fg-muted">{a.label}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
            </Link>
          ))}
        </div>
      </Section>

      {/* Charts ---------------------------------------------------------------- */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Demand against supply" description="Open demand, firm orders and what MRP wants to make, by week" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={supplyDemand} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="Firm" name="Firm orders" stackId="s" fill="#10b981" maxBarSize={28} />
                <Bar dataKey="Planned" name="MRP planned" stackId="s" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Line type="monotone" dataKey="Demand" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Plan against actual" description="Weekly output over the last eight weeks" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={planVsActual} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={7} />
                <Bar dataKey="planned" name="Planned" fill="#94a3b8" maxBarSize={16} radius={[2, 2, 0, 0]} />
                <Bar dataKey="actual" name="Actual" maxBarSize={16} radius={[2, 2, 0, 0]}>
                  {planVsActual.map((w) => (
                    <Cell key={w.week} fill={w.actual >= w.planned ? '#10b981' : '#f59e0b'} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Capacity heat strip ---------------------------------------------------- */}
      <Section title="Capacity by work centre">
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: '13rem' }}>Work centre</th>
                    {starts.map((s, b) => (
                      <th key={s} className="text-center" style={{ minWidth: '3.5rem' }}>W{b + 1}</th>
                    ))}
                    <th className="text-right" style={{ width: '6rem' }}>Peak</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.crp.slice(0, 6).map((r) => (
                    <tr key={r.workCentreCode} className="cursor-pointer" onClick={() => navigate('/planning/capacity')}>
                      <td>
                        <p className="text-xs font-medium text-fg">{r.workCentreName}</p>
                        <p className="font-mono text-2xs text-fg-subtle">{r.workCentreCode}</p>
                      </td>
                      {r.cells.map((c) => (
                        <td key={c.bucket} className="px-1 text-center">
                          <LoadCell pct={c.loadPct} compact />
                        </td>
                      ))}
                      <td className="text-right">
                        {r.isBottleneck ? (
                          <Badge tone="danger" size="sm">{r.peakLoadPct.toFixed(0)}%</Badge>
                        ) : (
                          <span className="text-xs tabular text-fg-muted">{r.peakLoadPct.toFixed(0)}%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </Section>

      {/* Watch lists ------------------------------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Open production orders"
            description="Everything on or heading to the floor"
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate('/planning/orders')}>
                Open
              </Button>
            }
          />
          <CardBody className="p-0">
            {!kpis.open.length ? (
              <p className="p-4 text-xs text-fg-subtle">No open orders. Firm an MRP suggestion to start one.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Product</th>
                      <th className="text-right" style={{ width: '7rem' }}>Quantity</th>
                      <th style={{ width: '9rem' }}>Progress</th>
                      <th style={{ width: '6rem' }}>Priority</th>
                      <th style={{ width: '8rem' }}>Finish</th>
                      <th style={{ width: '10rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.open.map((o) => (
                      <tr key={o.uid} className={o.plannedFinish < starts[0] ? 'bg-danger/5' : undefined}>
                        <td className="font-mono text-2xs font-medium text-brand-600">{o.docNo}</td>
                        <td>
                          <p className="max-w-[14rem] truncate text-xs font-medium text-fg">{o.productName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{o.productCode}</p>
                        </td>
                        <td className="text-right tabular text-xs">{formatQty(o.qty, 0)}</td>
                        <td>
                          <ProgressBar value={o.qty > 0 ? (o.producedQty / o.qty) * 100 : 0} tone={o.producedQty >= o.qty ? 'success' : 'brand'} showLabel />
                        </td>
                        <td><PriorityBadge priority={o.priority} /></td>
                        <td className={cn('text-2xs', o.plannedFinish < starts[0] ? 'text-danger' : 'text-fg-muted')}>{formatDate(o.plannedFinish)}</td>
                        <td><OrderStatusBadge status={o.status} /></td>
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
            <CardHeader title="Worst shortages" description="Value at risk, longest overdue first" />
            <CardBody className="space-y-2.5">
              {!mrp.shortages.length ? (
                <p className="text-xs text-fg-subtle">Nothing short — every requirement fits inside its lead time.</p>
              ) : (
                mrp.shortages.slice(0, 5).map((s, i) => (
                  <Link key={`${s.itemCode}-${i}`} to="/planning/mrp" className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-fg">{s.itemName}</p>
                      <p className="font-mono text-2xs text-fg-subtle">
                        {s.itemCode} · short {formatQty(s.shortQty, 0)} {s.uom}
                      </p>
                    </div>
                    <Badge tone={s.daysLate > 14 ? 'danger' : 'warning'} size="sm">{s.daysLate}d late</Badge>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Forecast accuracy" description="Mean absolute error over closed periods" />
            <CardBody>
              {kpis.accuracy.mapePct === null ? (
                <p className="text-xs text-fg-subtle">No closed period has an actual recorded yet.</p>
              ) : (
                <>
                  <p className="text-2xl font-semibold tabular text-fg">{kpis.accuracy.mapePct.toFixed(1)}%</p>
                  <p className="mt-1 text-2xs text-fg-muted">
                    across {kpis.accuracy.periods} periods · bias{' '}
                    {kpis.accuracy.biasPct !== null && kpis.accuracy.biasPct > 0 ? '+' : ''}
                    {kpis.accuracy.biasPct?.toFixed(1)}%
                  </p>
                  <ProgressBar
                    className="mt-3"
                    value={Math.max(0, 100 - kpis.accuracy.mapePct)}
                    tone={kpis.accuracy.mapePct < 10 ? 'success' : kpis.accuracy.mapePct < 20 ? 'warning' : 'danger'}
                  />
                  <Link to="/planning/forecast" className="mt-2 inline-flex items-center gap-1 text-2xs text-brand-600 hover:underline">
                    Open the forecast <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Work in progress" description="Value on the floor right now" />
            <CardBody>
              <p className="text-2xl font-semibold tabular text-fg">₹{formatCompact(kpis.wipValue)}</p>
              <p className="mt-1 text-2xs text-fg-muted">
                {kpis.running.length} order{kpis.running.length === 1 ? '' : 's'} in production ·{' '}
                {formatQty(kpis.running.reduce((s, o) => s + (o.qty - o.producedQty), 0), 0)} units still to make
              </p>
              <p className="mt-2 text-2xs text-fg-subtle">
                Valued at the estimate carried on each order, which comes from the engineering roll-up at the moment it
                was raised.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {mrp.exceptions.filter((e) => e.severity === 'ERROR').length > 0 && (
        <Section title="MRP errors" className="mt-6">
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '12rem' }}>Item</th>
                      <th style={{ width: '13rem' }}>Type</th>
                      <th>What happened</th>
                      <th style={{ width: '20rem' }}>What to do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mrp.exceptions
                      .filter((e) => e.severity === 'ERROR')
                      .map((e) => (
                        <tr key={e.uid}>
                          <td className="font-mono text-2xs text-fg">{e.itemCode}</td>
                          <td className="text-2xs text-fg-muted">{e.type.replace(/_/g, ' ').toLowerCase()}</td>
                          <td className="text-xs text-fg">{e.message}</td>
                          <td className="text-xs text-fg-muted">{e.action}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </Section>
      )}
    </div>
  )
}
