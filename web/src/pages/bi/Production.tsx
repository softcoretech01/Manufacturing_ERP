import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { BiChartTip, BiFilterBar, HeatCell, KpiCard, SourceNote, StatusBadge } from '@/components/bi/BiShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { downtimePareto, hourlyOutput, oeeByMachine, oeeTrend, readingByCode, scrapPareto } from '@/mock/bi'
import type { MetricStatus } from '@/types/bi'

const TABS = [
  { id: 'OUTPUT', label: 'Output & OEE' },
  { id: 'LOSSES', label: 'Downtime & scrap' },
  { id: 'MACHINES', label: 'By machine' },
]

/**
 * Production analytics — output against plan, the three OEE factors, and the two
 * Pareto charts that say where the losses actually are. The Pareto is the point:
 * a ranked list with a cumulative line tells you the two reasons worth fixing,
 * where a pie chart tells you nothing.
 */
export function BiProductionPage() {
  const toast = useToast()
  const [tab, setTab] = useState('OUTPUT')

  const kpis = ['PRD-OUT', 'PRD-ATT', 'PRD-OEE', 'PRD-DT', 'PRD-SCRAP'].map((c) => readingByCode[c]).filter(Boolean)

  const statusFor = (value: number, target: number, lower = false): MetricStatus => {
    if (lower) return value <= target ? 'ON_TARGET' : value <= target * 1.15 ? 'WATCH' : 'OFF_TARGET'
    return value >= target ? 'ON_TARGET' : value >= target * 0.92 ? 'WATCH' : 'OFF_TARGET'
  }

  const cumulative = useMemo(() => {
    let plan = 0
    let made = 0
    return hourlyOutput.map((h) => {
      plan += h.planned
      made += h.actual
      return { ...h, cumulativeGap: made - plan }
    })
  }, [])

  const worstHour = [...cumulative].sort((a, b) => a.actual - a.planned - (b.actual - b.planned))[0]

  const machineColumns: Column<(typeof oeeByMachine)[number]>[] = [
    { key: 'machine', header: 'Machine', sortable: true, width: '13rem', render: (m) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-fg">{m.machine}</p>
        <p className="truncate text-2xs text-fg-subtle">{m.name}</p>
      </div>
    ) },
    { key: 'line', header: 'Line', sortable: true, width: '8rem' },
    { key: 'availability', header: 'Availability', align: 'right', width: '10rem', sortable: true, render: (m) => (
      <span className={cn('tabular text-xs', m.availability < 85 ? 'text-warning' : 'text-fg')}>{m.availability}%</span>
    ) },
    { key: 'performance', header: 'Performance', align: 'right', width: '10rem', sortable: true, render: (m) => (
      <span className={cn('tabular text-xs', m.performance < 85 ? 'text-warning' : 'text-fg')}>{m.performance}%</span>
    ) },
    { key: 'quality', header: 'Quality', align: 'right', width: '9rem', sortable: true, render: (m) => (
      <span className={cn('tabular text-xs', m.quality < 97 ? 'text-warning' : 'text-fg')}>{m.quality}%</span>
    ) },
    { key: 'oee', header: 'OEE', align: 'right', width: '8rem', sortable: true, render: (m) => (
      <span className={cn('tabular text-xs font-semibold', m.oee >= 85 ? 'text-success' : m.oee >= 70 ? 'text-warning' : 'text-danger')}>
        {m.oee}%
      </span>
    ) },
    { key: 'goodPieces', header: 'Good pieces', align: 'right', width: '10rem', sortable: true, render: (m) => (
      <span className="tabular text-xs">{formatQty(m.goodPieces)}</span>
    ) },
    { key: 'weakest', header: 'Weakest factor', render: (m) => {
      const weakest = m.availability <= m.performance && m.availability <= m.quality ? 'availability' : m.performance <= m.quality ? 'performance' : 'quality'
      return (
        <span className="text-2xs text-fg-muted">
          <span className="font-medium text-fg">{weakest}</span>
          {weakest === 'availability' ? ' — stopped time, not slow running' : weakest === 'performance' ? ' — running below the ideal cycle' : ' — not right first time'}
        </span>
      )
    } },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'production-analytics', 'Production analytics — OEE by machine', columnsFromTable(machineColumns), oeeByMachine)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Production analytics"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Analytics', to: '/bi' }, { label: 'Production' }]}
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS} />}
      />

      <BiFilterBar show={['period', 'plant', 'line', 'shift']} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((r) => (
          <KpiCard key={r.code} reading={r} size="sm" />
        ))}
      </div>

      {tab === 'OUTPUT' && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Output through the day"
              description={
                (cumulative.at(-1)?.cumulativeGap ?? 0) < 0
                  ? `Behind by ${Math.abs(cumulative.at(-1)!.cumulativeGap).toLocaleString('en-IN')} bottles — the gap opened at ${worstHour?.hour}`
                  : 'Ahead of the cumulative plan'
              }
            />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cumulative} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip content={<BiChartTip suffix=" bottles" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar dataKey="actual" name="Made" radius={[3, 3, 0, 0]} maxBarSize={30}>
                    {cumulative.map((h, i) => (
                      <Cell key={i} fill={h.actual >= h.planned ? '#10b981' : h.actual >= h.planned * 0.8 ? '#f59e0b' : '#ef4444'} />
                    ))}
                  </Bar>
                  <Bar dataKey="scrap" name="Scrap" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={30} />
                  <Line type="monotone" dataKey="planned" name="Plan" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="OEE and its three factors" description="Seven days — the factor that moves is the one to work on" />
            <CardBody className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={oeeTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip content={<BiChartTip suffix="%" />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Line type="monotone" dataKey="availability" name="Availability" stroke="#0ea5e9" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="performance" name="Performance" stroke="#14b8a6" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="quality" name="Quality" stroke="#10b981" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="oee" name="OEE" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'LOSSES' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { title: 'Downtime by reason', desc: 'Minutes lost, ranked, with the cumulative share', data: downtimePareto, suffix: ' min', to: '/production/downtime' },
            { title: 'Scrap by defect', desc: 'Pieces rejected, ranked, with the cumulative share', data: scrapPareto, suffix: ' pcs', to: '/production/scrap' },
          ].map((chart) => (
            <Card key={chart.title}>
              <CardHeader
                title={chart.title}
                description={chart.desc}
                actions={<Link to={chart.to} className="text-2xs font-medium text-brand-600 hover:underline">Register →</Link>}
              />
              <CardBody className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={56} />
                    <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={38} />
                    <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                    <Tooltip content={<BiChartTip suffix={chart.suffix} />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Bar dataKey="value" name="Loss" radius={[3, 3, 0, 0]} maxBarSize={26}>
                      {chart.data.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#94a3b8'} />
                      ))}
                    </Bar>
                    <Line yAxisId="pct" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke="#7c3aed" strokeWidth={2} dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardBody>
              <CardBody className="border-t border-border pt-3">
                <p className="text-2xs leading-relaxed text-fg-muted">
                  {chart.data.length > 0 && (
                    <>
                      The top {chart.data.findIndex((p) => p.cumulativePct >= 80) + 1 || chart.data.length} of{' '}
                      {chart.data.length} reasons account for 80% of the loss. Fixing anything below that line is effort spent on
                      the tail.
                    </>
                  )}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'MACHINES' && (
        <>
          <Card className="mb-4">
            <CardHeader title="OEE heat map" description="Each factor by machine — red is where the loss is" />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Machine</th>
                      {['Availability', 'Performance', 'Quality', 'OEE'].map((h) => (
                        <th key={h} className="px-2 py-2 text-center text-2xs font-medium text-fg-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {oeeByMachine.map((m) => (
                      <tr key={m.machine} className="border-b border-border/70 hover:bg-surface-2">
                        <td className="px-2 py-1.5">
                          <p className="font-mono text-xs font-medium text-fg">{m.machine}</p>
                          <p className="truncate text-2xs text-fg-subtle">{m.line}</p>
                        </td>
                        <td className="px-2 py-1.5 text-center"><HeatCell value={m.availability} status={statusFor(m.availability, 90)} label={`${m.machine} availability`} /></td>
                        <td className="px-2 py-1.5 text-center"><HeatCell value={m.performance} status={statusFor(m.performance, 90)} label={`${m.machine} performance`} /></td>
                        <td className="px-2 py-1.5 text-center"><HeatCell value={m.quality} status={statusFor(m.quality, 97)} label={`${m.machine} quality`} /></td>
                        <td className="px-2 py-1.5 text-center"><HeatCell value={m.oee} status={statusFor(m.oee, 85)} label={`${m.machine} OEE`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <DataTable
            rows={oeeByMachine}
            columns={machineColumns}
            rowKey={(m) => m.machine}
            searchPlaceholder="Search machine or line…"
            onExport={doExport}
            emptyTitle="No machine data"
            rowClassName={(m) => cn(m.oee < 70 && 'bg-danger/[0.04]', m.oee >= 85 && 'bg-success/[0.03]')}
          />
        </>
      )}

      <SourceNote modules={['PRODUCTION', 'QUALITY']} note="OEE is computed from machine totals, not by averaging per-machine OEE — averaging would flatter a plant with one idle machine." />
    </div>
  )
}
