import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import {
  BI_COLOURS,
  BiChartTip,
  BiFilterBar,
  ConfidenceMeter,
  KpiCard,
  MaskedCard,
  ModuleChip,
  SeverityBadge,
  SourceNote,
  StatusBadge,
  formatMetric,
  useCanSeeFinancial,
  useCanSeePeople,
} from '@/components/bi/BiShell'
import { formatCompact } from '@/lib/format'
import { cn } from '@/lib/cn'
import {
  dashboards,
  downtimePareto,
  financeTrend,
  insights,
  kpiDefinitions,
  oeeByMachine,
  readingByCode,
  regionSales,
  dataSources,
  alertEvents,
  hourlyOutput,
} from '@/mock/bi'
import type { DashboardRole } from '@/types/bi'

const ROLE_TABS: { id: DashboardRole; label: string }[] = [
  { id: 'CEO', label: 'CEO' },
  { id: 'MANAGING_DIRECTOR', label: 'Managing Director' },
  { id: 'CFO', label: 'CFO' },
  { id: 'COO', label: 'COO' },
  { id: 'PLANT_HEAD', label: 'Plant head' },
]

/**
 * Executive dashboard — the whole business on one screen, in the order somebody
 * running it actually asks: is the money right, is the plant making what it
 * promised, is the quality holding, is the customer being served, are the people
 * there. Every card drills through to the module that produced it.
 */
export function BiExecutivePage() {
  const toast = useToast()
  const canSeeFinancial = useCanSeeFinancial()
  const canSeePeople = useCanSeePeople()

  const [role, setRole] = useState<DashboardRole>('CEO')
  const dashboard = dashboards.find((d) => d.role === role) ?? dashboards[0]

  /** The KPIs this role's dashboard is configured to show, in its order. */
  const cards = useMemo(
    () =>
      dashboard.kpiCodes
        .map((code) => ({ code, reading: readingByCode[code], def: kpiDefinitions.find((k) => k.code === code) }))
        .filter((c) => c.reading && c.def),
    [dashboard],
  )

  const offTarget = cards.filter((c) => c.reading.status === 'OFF_TARGET')
  const watch = cards.filter((c) => c.reading.status === 'WATCH')

  const openInsights = insights.filter((i) => i.status === 'NEW' || i.status === 'ACKNOWLEDGED')
  const topInsights = [...openInsights]
    .sort((a, b) => {
      const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, POSITIVE: 4 }
      return rank[a.severity] - rank[b.severity] || (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0)
    })
    .slice(0, 4)

  const openAlerts = alertEvents.filter((a) => a.status === 'OPEN')
  const unhealthySources = dataSources.filter((s) => s.status !== 'HEALTHY')

  /** Cumulative output against cumulative plan, which is what a gap really is. */
  const cumulative = useMemo(() => {
    let plan = 0
    let made = 0
    return hourlyOutput.map((h) => {
      plan += h.planned
      made += h.actual
      return { hour: h.hour, planned: h.planned, actual: h.actual, gap: made - plan }
    })
  }, [])

  const worstMachines = [...oeeByMachine].sort((a, b) => a.oee - b.oee).slice(0, 5)

  return (
    <div>
      <PageHeader
        title="Executive dashboard"
        description={dashboard.description}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => toast.success('Snapshot taken', 'A PDF snapshot of this dashboard as it stands has been saved and can be attached to the board pack.')}>
              Snapshot
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.success('Refreshed', `All ${dashboard.modules.length} feeds re-read. This dashboard refreshes itself every ${dashboard.refreshMinutes} minutes.`)}>
              Refresh
            </Button>
          </>
        }
        tabs={<Tabs variant="pill" active={role} onChange={(v) => setRole(v as DashboardRole)} tabs={ROLE_TABS} />}
      />

      <BiFilterBar show={['period', 'plant', 'line', 'productFamily']} />

      {/* Data health — a dashboard on a stale feed looks fine, which is the danger. */}
      {unhealthySources.length > 0 && (
        <Link
          to="/bi/data-sources"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 p-2.5 hover:bg-warning/10"
        >
          <span className="text-xs text-fg">
            <span className="font-medium text-warning">{unhealthySources.length} data feed{unhealthySources.length === 1 ? '' : 's'} not healthy</span>{' '}
            — {unhealthySources.map((s) => s.name).join(', ')}. Figures drawn from {unhealthySources.length === 1 ? 'it' : 'them'} may be out of date.
          </span>
          <Badge tone="warning" size="sm">check the feeds</Badge>
        </Link>
      )}

      {/* Off-target summary — the line an executive reads first. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg">{cards.length}</span> KPIs on this dashboard ·{' '}
          <span className={cn('font-medium', offTarget.length ? 'text-danger' : 'text-success')}>{offTarget.length}</span> off
          target
          {watch.length > 0 && <>, <span className="font-medium text-warning">{watch.length}</span> to watch</>}
          {' '}· last refreshed {new Date(dashboard.lastRefreshedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })},
          every {dashboard.refreshMinutes} min
        </p>
      </div>

      {/* KPI grid */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(({ code, reading, def }) => {
          const hidden =
            (reading.sensitivity === 'FINANCIAL' && !canSeeFinancial) || (reading.sensitivity === 'PEOPLE' && !canSeePeople)
          return hidden ? (
            <MaskedCard
              key={code}
              name={reading.name}
              reason={
                reading.sensitivity === 'FINANCIAL'
                  ? 'Financial metrics need BI.FINANCIAL.VIEW. The operational KPIs on this dashboard are unaffected.'
                  : 'People metrics need BI.PEOPLE.VIEW, because they resolve to individuals at drill-down.'
              }
            />
          ) : (
            <KpiCard key={code} reading={reading} />
          )
        })}
      </div>

      {/* What is off target, spelled out */}
      {offTarget.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Off target"
            description="Each of these names its owner and the screen where the underlying detail sits"
          />
          <CardBody className="space-y-2">
            {offTarget.map(({ code, reading, def }) => (
              <div key={code} className="flex flex-wrap items-center justify-between gap-3 rounded border border-danger/30 bg-danger/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {reading.name} — {formatMetric(reading.value, reading.format, reading.unit)} against a target of{' '}
                    {formatMetric(reading.target, reading.format, reading.unit)}
                  </p>
                  <p className="mt-0.5 text-2xs text-fg-muted">
                    {def?.ownerRole} ({def?.ownerName}) · reviewed {def?.reviewCycle.toLowerCase()} · {reading.source}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ModuleChip module={reading.module} />
                  {reading.drillTo && (
                    <Link to={reading.drillTo} className="text-2xs font-medium text-brand-600 hover:underline">
                      Open →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Insights */}
      {topInsights.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="What the data is saying"
            description="Generated observations, each with the window it was measured over and a link to the evidence"
            actions={<Link to="/bi/insights" className="text-2xs font-medium text-brand-600 hover:underline">All insights →</Link>}
          />
          <CardBody className="space-y-2">
            {topInsights.map((i) => (
              <div
                key={i.uid}
                className={cn(
                  'rounded border p-3',
                  i.severity === 'CRITICAL' ? 'border-danger/30 bg-danger/5' : i.severity === 'HIGH' ? 'border-warning/30 bg-warning/5' : 'border-border bg-surface-2',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium text-fg">{i.title}</p>
                      <SeverityBadge severity={i.severity} />
                      <ModuleChip module={i.module} />
                    </div>
                    <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{i.detail}</p>
                    <p className="mt-1 text-[10px] text-fg-subtle">Basis: {i.basis}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <ConfidenceMeter pct={i.confidencePct} />
                    {i.estimatedImpact !== null && canSeeFinancial && (
                      <span className="text-2xs tabular text-fg-muted">≈ {formatCompact(i.estimatedImpact)} impact</span>
                    )}
                    {i.evidenceTo && (
                      <Link to={i.evidenceTo} className="text-2xs font-medium text-brand-600 hover:underline">
                        {i.evidenceLabel} →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Charts */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Output through the day"
            description={
              (cumulative.at(-1)?.gap ?? 0) < 0
                ? `Running ${Math.abs(cumulative.at(-1)!.gap).toLocaleString('en-IN')} bottles behind the cumulative plan`
                : 'Running ahead of the cumulative plan'
            }
          />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cumulative} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<BiChartTip suffix=" bottles" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="actual" name="Made" radius={[3, 3, 0, 0]} maxBarSize={28}>
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
          <CardHeader title="Where the time went" description="Downtime by reason — the tall bar is the one worth fixing" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={downtimePareto} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<BiChartTip suffix=" min" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="value" name="Minutes lost" radius={[0, 3, 3, 0]} maxBarSize={16}>
                  {downtimePareto.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {canSeeFinancial ? (
          <Card>
            <CardHeader title="Revenue, cost and profit" description="Six months from the finance ledger" />
            <CardBody className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={financeTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatCompact(Number(v))} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<BiChartTip prefix="₹" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar dataKey="revenue" name="Revenue" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="expense" name="Expense" fill="#94a3b8" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Financial trend" description="Restricted for your role" />
            <CardBody className="flex h-64 items-center justify-center">
              <p className="max-w-sm text-center text-xs leading-relaxed text-fg-muted">
                Revenue, cost and margin need <span className="font-mono text-fg">BI.FINANCIAL.VIEW</span>. The operational
                picture on this dashboard — output, OEE, quality and delivery — is unaffected and complete.
              </p>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Weakest machines by OEE" description="Where the availability loss is concentrated" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={worstMachines} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="machine" width={72} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<BiChartTip suffix="%" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="oee" name="OEE" radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {worstMachines.map((mc, i) => (
                    <Cell key={i} fill={mc.oee >= 85 ? '#10b981' : mc.oee >= 70 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {canSeeFinancial && (
        <Card className="mb-4">
          <CardHeader
            title="Dispatch by region"
            description="Volume, growth and service level — from dispatched value, which stands in for revenue until CRM is live"
            actions={<Link to="/bi/sales" className="text-2xs font-medium text-brand-600 hover:underline">Sales analytics →</Link>}
          />
          <CardBody className="space-y-2">
            {regionSales.map((r, i) => (
              <div key={r.region} className="flex flex-wrap items-center gap-3 rounded border border-border px-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: BI_COLOURS[i % BI_COLOURS.length] }} />
                <span className="w-20 shrink-0 text-xs font-medium text-fg">{r.region}</span>
                <ProgressBar
                  value={(r.revenue / Math.max(...regionSales.map((x) => x.revenue))) * 100}
                  tone="brand"
                  className="min-w-[6rem] flex-1"
                />
                <span className="w-24 shrink-0 text-right text-2xs tabular text-fg">{formatCompact(r.revenue)}</span>
                <span className={cn('w-16 shrink-0 text-right text-2xs tabular', r.growthPct >= 0 ? 'text-success' : 'text-danger')}>
                  {r.growthPct >= 0 ? '+' : ''}{r.growthPct}%
                </span>
                <span className={cn('w-20 shrink-0 text-right text-2xs tabular', r.onTimePct >= 95 ? 'text-success' : 'text-warning')}>
                  {r.onTimePct}% OTD
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Open alerts */}
      {openAlerts.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Unacknowledged alerts"
            description="Thresholds that have fired and nobody has picked up"
            actions={<Link to="/bi/alerts" className="text-2xs font-medium text-brand-600 hover:underline">All alerts →</Link>}
          />
          <CardBody className="space-y-2">
            {openAlerts.map((a) => (
              <Link
                key={a.uid}
                to={a.drillTo ?? '/bi/alerts'}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-danger/30 bg-danger/5 p-2.5 hover:bg-danger/10"
              >
                <span className="text-xs text-fg">
                  <span className="font-medium">{a.ruleName}</span> — {a.message}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <ModuleChip module={a.module} />
                  <SeverityBadge severity={a.severity} />
                </div>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}

      <SourceNote
        modules={dashboard.modules}
        note={`This dashboard is version ${dashboard.version}, last changed by ${dashboard.updatedBy}.`}
      />
    </div>
  )
}
