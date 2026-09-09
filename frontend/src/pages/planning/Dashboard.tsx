import { useNavigate } from 'react-router-dom'
import {
  Target, PackageX, Gauge, TrendingUp, AlertTriangle, Play, ClipboardList,
  Clock, Factory, ChevronRight, CalendarRange, Network, ShoppingCart,
} from 'lucide-react'
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { InvKpiTile } from '@/components/inventory/InvKpiTile'
import { InfoStrip } from '@/components/ui/InfoStrip'
import { formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { usePlanningDashboard } from '@/hooks/usePlanningDashboard'
import type { ActionQueueItem } from '@/api/planningDashboard'

/**
 * Planning dashboard.
 *
 * The questions a planner opens the day with: what is late, what is short, what
 * is overloaded, and is the plan being hit.
 *
 * Every figure comes from `GET /planning/dashboard`, which reads the same stored
 * MRP run and capacity service the rest of the portal reads — so a tile can
 * never disagree with the screen it links to. The version this replaces computed
 * its KPIs from the browser MRP engine and took plan attainment from a hardcoded
 * eight-element array.
 */

const compact = (n: number) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(n)

const QUEUE_ICON: Record<string, typeof PackageX> = {
  shortages: PackageX,
  exceptions: AlertTriangle,
  planned: Play,
  capacity: Gauge,
  late: Clock,
  unreserved: ClipboardList,
  overdue_demand: Target,
  running: Factory,
}

const TONE_CLASS: Record<ActionQueueItem['tone'], string> = {
  danger: 'text-danger bg-danger/10',
  warning: 'text-warning bg-warning/10',
  pending: 'text-brand-600 bg-brand-500/10',
  progress: 'text-success bg-success/10',
}

export function PlanningDashboardPage() {
  const navigate = useNavigate()
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error } = usePlanningDashboard({ horizon: 8, attainment_weeks: 8 })

  const k = data?.kpis

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="Production planning"
        description={
          data?.mrp_run_no
            ? `From ${data.mrp_run_no}, run ${formatDate(data.mrp_run_at ?? '')}.`
            : 'Run MRP to populate the plan.'
        }
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in to load the plan.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load the dashboard">
          {error instanceof ProblemError ? error.problem.detail : 'Unable to reach the planning service.'}
        </Alert>
      )}
      {!isLoading && data && !data.mrp_run_no && (
        <Alert tone="info" title="MRP has not been run yet">
          Demand and capacity figures are live, but shortages, exceptions and planned orders
          need a plan. Run MRP to fill them in.
        </Alert>
      )}

      {/* ── KPI tiles ─────────────────────────────────────────────────
          Eight figures, in the order the work actually flows: what is on the
          books, where it has stalled, what MRP wants done about it, and what is
          in the plant. Each one clicks through to the screen that owns it, so
          the dashboard is a way in rather than a wall of numbers.        */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <InvKpiTile
          label="Active demand"
          value={k ? String(k.open_demand_lines) : '—'}
          sub={k ? `${compact(k.open_demand_qty)} units open` : undefined}
          icon={<Target />}
          tone={k && k.overdue_demand_lines > 0 ? 'warning' : 'brand'}
          onClick={() => navigate('/planning/demand')}
        />
        <InvKpiTile
          label="Awaiting a schedule"
          value={k ? String(k.pending_mps) : '—'}
          sub="Demand with no MPS yet"
          icon={<CalendarRange />}
          tone={k && k.pending_mps > 0 ? 'warning' : 'success'}
          onClick={() => navigate('/planning/demand')}
        />
        <InvKpiTile
          label="Awaiting MRP"
          value={k ? String(k.pending_mrp) : '—'}
          sub="Scheduled, nothing planned"
          icon={<Network />}
          tone={k && k.pending_mrp > 0 ? 'warning' : 'success'}
          onClick={() => navigate('/planning/mrp')}
        />
        <InvKpiTile
          label="Material shortages"
          value={k ? String(k.shortages) : '—'}
          sub={k ? `${money(k.unconverted_value)} not yet raised` : undefined}
          icon={<PackageX />}
          tone={k && k.shortages > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/planning/mrp')}
        />
        <InvKpiTile
          label="To buy"
          value={k ? String(k.to_buy) : '—'}
          sub="Purchase proposals to raise"
          icon={<ShoppingCart />}
          tone="brand"
          onClick={() => navigate('/planning/mrp')}
        />
        <InvKpiTile
          label="To make"
          value={k ? String(k.to_make) : '—'}
          sub="Production proposals to raise"
          icon={<Factory />}
          tone="brand"
          onClick={() => navigate('/planning/mrp')}
        />
        <InvKpiTile
          label="Capacity overload"
          value={k ? String(k.overloaded_centres) : '—'}
          sub={k ? `Peak ${k.peak_capacity_pct.toFixed(0)}% of available` : undefined}
          icon={<Gauge />}
          tone={k && k.overloaded_centres > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/planning/capacity')}
        />
        <InvKpiTile
          label="Production orders"
          value={k ? String(k.open_orders) : '—'}
          sub={k ? `${k.orders_in_production} running · ${money(k.wip_value)} WIP` : undefined}
          icon={<ClipboardList />}
          tone="brand"
          onClick={() => navigate('/planning/orders')}
        />
      </div>

      {/* ── Action queue ──────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-fg">Needs attention</h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {(data?.action_queue ?? []).map((a) => {
            const Icon = QUEUE_ICON[a.key] ?? AlertTriangle
            const quiet = a.count === 0
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => navigate(a.to)}
                className={`flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-brand-500/40 hover:bg-surface-2 ${quiet ? 'opacity-60' : ''}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${quiet ? 'bg-surface-3 text-fg-subtle' : TONE_CLASS[a.tone]}`}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[20px] font-semibold tabular-nums text-fg">{a.count}</span>
                  <span className="block truncate text-[13px] text-fg-muted" title={a.label}>{a.label}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
              </button>
            )
          })}
          {isLoading && !data && (
            <p className="col-span-full py-6 text-center text-sm text-fg-muted">Loading…</p>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Plan against actual ────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Plan against actual"
            description="Weekly output against what was scheduled to finish"
          />
          <CardBody>
            {data && data.attainment_series.length === 0 ? (
              <p className="py-12 text-center text-sm text-fg-muted">
                No production orders have finished in the last 8 weeks, so there is nothing to
                measure yet. This chart fills in as orders complete.
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data?.attainment_series ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(v: number, n: string) => [v.toLocaleString('en-IN'), n]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="planned" name="Planned" fill="currentColor" className="text-fg-subtle" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="actual" name="Actual" fill="currentColor" className="text-brand-500" radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="on_time_pct" name="On time %" stroke="currentColor" className="text-success" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        {/* ── Bottlenecks ────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Work centres over capacity"
            description="Peak week load across the planning horizon"
          />
          <CardBody>
            {data && data.bottlenecks.length === 0 ? (
              <p className="py-12 text-center text-sm text-fg-muted">
                No work centre exceeds 100% in any week of the horizon.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {(data?.bottlenecks ?? []).map((b) => (
                  <li key={b.work_centre_code}>
                    <button
                      type="button"
                      onClick={() => navigate('/planning/capacity')}
                      className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-fg">
                          {b.work_centre_name}
                        </span>
                        <span className="block font-mono text-[12px] text-fg-subtle">
                          {b.work_centre_code} · {b.overloaded_buckets} week(s) over
                        </span>
                      </span>
                      <Badge tone="danger" size="sm">{b.peak_load_pct.toFixed(0)}%</Badge>
                      <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {k && (
        <InfoStrip
          items={[
            { label: 'Open orders', value: k.open_orders },
            { label: 'In production', value: k.orders_in_production },
            { label: 'WIP value', value: money(k.wip_value) },
          ]}
          trail={data?.as_of ? `as of ${formatDate(data.as_of)}` : undefined}
        />
      )}
    </div>
  )
}

export default PlanningDashboardPage
