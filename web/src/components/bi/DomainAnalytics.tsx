import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import {
  BI_COLOURS,
  BiChartTip,
  BiFilterBar,
  KpiCard,
  MaskedCard,
  SourceNote,
  formatMetric,
  useCanSeeFinancial,
  useCanSeePeople,
  type BiFilters,
} from '@/components/bi/BiShell'
import { formatCompact } from '@/lib/format'
import { cn } from '@/lib/cn'
import { readingByCode } from '@/mock/bi'
import type { SourceModule } from '@/types/bi'

/**
 * The shape every domain analytics screen shares: a KPI row, one or two charts
 * over a trend, a ranked breakdown, and a note saying which modules the figures
 * came from. Sharing it keeps the eight screens consistent and means a change to
 * how a masked KPI renders happens in one place rather than eight.
 */

export interface ChartSpec {
  title: string
  description: string
  /** Rows to plot. */
  data: Record<string, string | number>[]
  xKey: string
  bars?: { key: string; name: string; colour?: string }[]
  lines?: { key: string; name: string; colour?: string; yAxis?: 'right' }[]
  /** Colour each bar by a rule instead of one flat colour. */
  colourBy?: (row: Record<string, string | number>, index: number) => string
  suffix?: string
  prefix?: string
  height?: string
  rightAxisDomain?: [number, number]
  drillTo?: string
  drillLabel?: string
  /** One sentence under the chart saying what it means. */
  reading?: string
  financialOnly?: boolean
  /** Resolves to named individuals at drill-down, so it needs BI.PEOPLE.VIEW. */
  peopleOnly?: boolean
}

export interface RankedSpec {
  title: string
  description: string
  rows: { label: string; sub?: string; value: number; pct?: number; status?: 'good' | 'watch' | 'bad' }[]
  format?: (n: number) => string
  drillTo?: string
  drillLabel?: string
  financialOnly?: boolean
  peopleOnly?: boolean
}

export function DomainAnalytics({
  title,
  breadcrumbLabel,
  kpiCodes,
  filters = ['period', 'plant'],
  charts = [],
  ranked = [],
  modules,
  sourceNote,
  children,
}: {
  title: string
  breadcrumbLabel: string
  kpiCodes: string[]
  filters?: (keyof BiFilters)[]
  charts?: ChartSpec[]
  ranked?: RankedSpec[]
  modules: SourceModule[]
  sourceNote?: string
  children?: ReactNode
}) {
  const canSeeFinancial = useCanSeeFinancial()
  const canSeePeople = useCanSeePeople()

  const readings = kpiCodes.map((c) => readingByCode[c]).filter(Boolean)

  return (
    <div>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: breadcrumbLabel }]}
      />

      <BiFilterBar show={filters} />

      <div className={cn('mb-4 grid gap-3 sm:grid-cols-2', readings.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        {readings.map((r) => {
          const hidden =
            (r.sensitivity === 'FINANCIAL' && !canSeeFinancial) || (r.sensitivity === 'PEOPLE' && !canSeePeople)
          return hidden ? (
            <MaskedCard
              key={r.code}
              name={r.name}
              reason={
                r.sensitivity === 'FINANCIAL'
                  ? 'Needs BI.FINANCIAL.VIEW. The operational metrics beside it are complete.'
                  : 'Needs BI.PEOPLE.VIEW, because it resolves to individuals at drill-down.'
              }
            />
          ) : (
            <KpiCard key={r.code} reading={r} size="sm" />
          )
        })}
      </div>

      <div className={cn('mb-4 grid gap-4', charts.length > 1 ? 'lg:grid-cols-2' : '')}>
        {charts.map((chart) => {
          const blockedBy =
            chart.financialOnly && !canSeeFinancial
              ? ('FINANCIAL' as const)
              : chart.peopleOnly && !canSeePeople
                ? ('PEOPLE' as const)
                : null
          if (blockedBy) {
            return (
              <Card key={chart.title}>
                <CardHeader title={chart.title} description="Restricted for your role" />
                <CardBody className="flex h-56 items-center justify-center">
                  <p className="max-w-xs text-center text-xs leading-relaxed text-fg-muted">
                    {blockedBy === 'FINANCIAL' ? (
                      <>
                        This chart carries money, so it needs <span className="font-mono text-fg">BI.FINANCIAL.VIEW</span>.
                        The quantity-based charts on this screen are unaffected.
                      </>
                    ) : (
                      <>
                        This chart resolves to named people one drill-down down, so it needs{' '}
                        <span className="font-mono text-fg">BI.PEOPLE.VIEW</span>. The other charts on this screen are
                        unaffected.
                      </>
                    )}
                  </p>
                </CardBody>
              </Card>
            )
          }
          return (
            <Card key={chart.title}>
              <CardHeader
                title={chart.title}
                description={chart.description}
                actions={
                  chart.drillTo ? (
                    <Link to={chart.drillTo} className="text-2xs font-medium text-brand-600 hover:underline">
                      {chart.drillLabel ?? 'Open'} →
                    </Link>
                  ) : undefined
                }
              />
              <CardBody className={chart.height ?? 'h-64'}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis
                      dataKey={chart.xKey}
                      tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      angle={chart.data.length > 7 ? -20 : 0}
                      textAnchor={chart.data.length > 7 ? 'end' : 'middle'}
                      height={chart.data.length > 7 ? 50 : 28}
                    />
                    <YAxis
                      tickFormatter={(v) => (chart.prefix === '₹' ? formatCompact(Number(v)) : String(v))}
                      tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }}
                      axisLine={false}
                      tickLine={false}
                      width={chart.prefix === '₹' ? 52 : 40}
                    />
                    {chart.lines?.some((l) => l.yAxis === 'right') && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={chart.rightAxisDomain ?? ['auto', 'auto']}
                        tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                    )}
                    <Tooltip content={<BiChartTip suffix={chart.suffix} prefix={chart.prefix} />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    {(chart.bars?.length ?? 0) + (chart.lines?.length ?? 0) > 1 && (
                      <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                    )}
                    {chart.bars?.map((b, bi) => (
                      <Bar
                        key={b.key}
                        dataKey={b.key}
                        name={b.name}
                        fill={b.colour ?? BI_COLOURS[bi % BI_COLOURS.length]}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={26}
                      >
                        {chart.colourBy
                          ? chart.data.map((row, i) => <Cell key={i} fill={chart.colourBy!(row, i)} />)
                          : null}
                      </Bar>
                    ))}
                    {chart.lines?.map((l, li) => (
                      <Line
                        key={l.key}
                        {...(l.yAxis === 'right' ? { yAxisId: 'right' } : {})}
                        type="monotone"
                        dataKey={l.key}
                        name={l.name}
                        stroke={l.colour ?? BI_COLOURS[(li + 3) % BI_COLOURS.length]}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </CardBody>
              {chart.reading && (
                <CardBody className="border-t border-border pt-3">
                  <p className="text-2xs leading-relaxed text-fg-muted">{chart.reading}</p>
                </CardBody>
              )}
            </Card>
          )
        })}
      </div>

      {ranked.map((r) => {
        if (r.financialOnly && !canSeeFinancial) return null
        if (r.peopleOnly && !canSeePeople) return null
        const max = Math.max(...r.rows.map((x) => x.value), 1)
        return (
          <Card key={r.title} className="mb-4">
            <CardHeader
              title={r.title}
              description={r.description}
              actions={
                r.drillTo ? (
                  <Link to={r.drillTo} className="text-2xs font-medium text-brand-600 hover:underline">
                    {r.drillLabel ?? 'Open'} →
                  </Link>
                ) : undefined
              }
            />
            <CardBody className="space-y-1.5">
              {r.rows.map((row, i) => (
                <div key={row.label} className="flex flex-wrap items-center gap-3 rounded border border-border px-3 py-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: BI_COLOURS[i % BI_COLOURS.length] }} />
                  <div className="min-w-[8rem] flex-1">
                    <p className="truncate text-xs font-medium text-fg">{row.label}</p>
                    {row.sub && <p className="truncate text-2xs text-fg-subtle">{row.sub}</p>}
                  </div>
                  <ProgressBar
                    value={(row.value / max) * 100}
                    tone={row.status === 'bad' ? 'danger' : row.status === 'watch' ? 'warning' : 'brand'}
                    className="min-w-[5rem] flex-1"
                  />
                  <span className="w-24 shrink-0 text-right text-2xs tabular text-fg">
                    {r.format ? r.format(row.value) : row.value.toLocaleString('en-IN')}
                  </span>
                  {row.pct !== undefined && (
                    <span
                      className={cn(
                        'w-14 shrink-0 text-right text-2xs tabular',
                        row.status === 'bad' ? 'text-danger' : row.status === 'watch' ? 'text-warning' : 'text-success',
                      )}
                    >
                      {row.pct >= 0 ? '+' : ''}
                      {row.pct.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
              {r.rows.length === 0 && <p className="py-4 text-center text-xs text-fg-muted">Nothing to rank.</p>}
            </CardBody>
          </Card>
        )
      })}

      {children}

      <SourceNote modules={modules} note={sourceNote} />
    </div>
  )
}

export { formatMetric }
