import { useState } from 'react'
import { Clock, IndianRupee, PiggyBank, Users } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency } from '@/lib/format'
import {
  cycleTimes,
  priceTrend,
  spendByCategory,
  spendTrend,
  supplierSpend,
} from '@/mock/procurement'
import type { SpendByCategory } from '@/types/procurement'
import { cn } from '@/lib/cn'

const CHART_COLOURS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

function ChartTooltip({ active, payload, label, prefix = '', suffix = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-border bg-surface px-2.5 py-1.5 shadow-pop">
      <p className="mb-1 text-2xs font-medium text-fg">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-1.5 text-2xs text-fg-muted">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color ?? p.fill }} />
          {p.name}:{' '}
          <span className="font-medium text-fg tabular">
            {prefix}
            {typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}
            {suffix}
          </span>
        </p>
      ))}
    </div>
  )
}

export function AnalyticsPage() {
  const toast = useToast()
  const [view, setView] = useState('spend')

  const totalSpend = spendByCategory.reduce((s, c) => s + c.value, 0)
  const totalPo = spendByCategory.reduce((s, c) => s + c.poCount, 0)
  const weightedSavings = spendByCategory.reduce((s, c) => s + (c.value * c.savingsPct) / 100, 0)
  const avgCycle = cycleTimes.reduce((s, c) => s + c.avgDays, 0)

  const categoryColumns: Column<SpendByCategory>[] = [
    { key: 'category', header: 'Category', sortable: true },
    { key: 'value', header: 'Spend', align: 'right', sortable: true, accessor: (c) => c.value, render: (c) => formatCurrency(c.value) },
    { key: 'share', header: 'Share', align: 'right', accessor: (c) => (c.value / totalSpend) * 100, render: (c) => `${((c.value / totalSpend) * 100).toFixed(1)}%` },
    { key: 'poCount', header: 'Orders', align: 'right', sortable: true },
    { key: 'suppliers', header: 'Suppliers', align: 'right', sortable: true },
    { key: 'avgOrder', header: 'Avg order', align: 'right', accessor: (c) => c.value / c.poCount, render: (c) => formatCurrency(c.value / c.poCount) },
    {
      key: 'savingsPct',
      header: 'Savings',
      align: 'right',
      sortable: true,
      accessor: (c) => c.savingsPct,
      render: (c) => <span className={cn(c.savingsPct >= 3 ? 'text-success' : c.savingsPct >= 1 ? 'text-fg' : 'text-warning')}>{c.savingsPct.toFixed(1)}%</span>,
    },
    {
      key: 'concentration',
      header: 'Risk',
      width: '9rem',
      accessor: (c) => (c.suppliers <= 2 ? 'Concentrated' : 'Diversified'),
      render: (c) =>
        c.suppliers <= 2 ? (
          <Badge tone="warning" size="sm">Single/dual source</Badge>
        ) : (
          <Badge tone="success" size="sm" dot={false}>Diversified</Badge>
        ),
    },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'procurement-analytics', 'Spend by category', columnsFromTable(categoryColumns), spendByCategory)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Procurement analytics"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Analytics' }]}
        tabs={
          <Tabs
            active={view}
            onChange={setView}
            tabs={[
              { id: 'spend', label: 'Spend' },
              { id: 'price', label: 'Price movement' },
              { id: 'supplier', label: 'Supplier performance' },
              { id: 'cycle', label: 'Cycle time' },
            ]}
          />
        }
      />

      {view === 'spend' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Monthly spend against budget" description="₹ lakh" />
              <CardBody className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={spendTrend.map((s) => ({ month: s.month, Spend: Math.round(s.spend / 100_000), Budget: Math.round(s.budget / 100_000), Orders: s.poCount }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={38} />
                    <Tooltip content={<ChartTooltip prefix="₹" suffix=" L" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                    <Bar dataKey="Spend" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="Budget" fill="#94a3b8" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Category concentration" description="Spend share, ₹ lakh" />
              <CardBody className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={spendByCategory.map((c) => ({ name: c.category.split(' — ')[0], value: Math.round(c.value / 100_000) }))} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip prefix="₹" suffix=" L" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Bar dataKey="value" name="Spend" radius={[0, 3, 3, 0]} maxBarSize={16}>
                      {spendByCategory.map((_, i) => (
                        <Cell key={i} fill={CHART_COLOURS[i % CHART_COLOURS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          </div>

          <DataTable
            rows={spendByCategory}
            columns={categoryColumns}
            rowKey={(c) => c.category}
            searchPlaceholder="Search category…"
            onExport={doExport}
            pageSize={20}
          />
        </div>
      )}

      {view === 'price' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Purchase price trend" description="Weighted average landed rate per unit, ₹" />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={40} domain={[180, 340]} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={40} domain={[10, 16]} />
                  <Tooltip content={<ChartTooltip prefix="₹" />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Line yAxisId="l" type="monotone" dataKey="ss304" name="SS 304 (₹/kg)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                  <Line yAxisId="l" type="monotone" dataKey="ss316" name="SS 316 (₹/kg)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                  <Line yAxisId="r" type="monotone" dataKey="lid" name="Sports lid (₹/nos)" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'SS 304 coil', first: priceTrend[0].ss304, last: priceTrend[priceTrend.length - 1].ss304, unit: '₹/kg' },
              { label: 'SS 316 coil', first: priceTrend[0].ss316, last: priceTrend[priceTrend.length - 1].ss316, unit: '₹/kg' },
              { label: 'Sports lid', first: priceTrend[0].lid, last: priceTrend[priceTrend.length - 1].lid, unit: '₹/nos' },
            ].map((p) => {
              const delta = ((p.last - p.first) / p.first) * 100
              const peak = p.label === 'SS 304 coil' ? Math.max(...priceTrend.map((t) => t.ss304)) : p.label === 'SS 316 coil' ? Math.max(...priceTrend.map((t) => t.ss316)) : Math.max(...priceTrend.map((t) => t.lid))
              return (
                <Card key={p.label} padded>
                  <p className="text-xs font-medium text-fg">{p.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-fg tabular">
                    ₹{p.last} <span className="text-xs font-normal text-fg-subtle">{p.unit}</span>
                  </p>
                  <p className={cn('mt-1 text-2xs tabular', delta > 0 ? 'text-danger' : 'text-success')}>
                    {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% since April · peaked at ₹{peak}
                  </p>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {view === 'supplier' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Spend concentration vs performance" description="A large share held by a weak performer is the risk worth acting on" />
            <CardBody className="p-0">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th className="text-right">Spend</th>
                    <th className="text-right">Share</th>
                    <th>Concentration</th>
                    <th className="text-right">On time</th>
                    <th className="text-right">Rejection</th>
                    <th className="text-center">Grade</th>
                    <th>Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierSpend.map((s) => {
                    const risky = s.sharePct > 25 && (s.onTimePct < 90 || s.rejectionPct > 2)
                    const weak = s.grade === 'C' || s.grade === 'D'
                    return (
                      <tr key={s.supplierName} className={risky ? 'bg-danger/5' : undefined}>
                        <td className="text-xs font-medium text-fg">{s.supplierName}</td>
                        <td className="text-right tabular">{formatCurrency(s.value)}</td>
                        <td className="text-right tabular">{s.sharePct.toFixed(1)}%</td>
                        <td>
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
                            <div className={cn('h-full rounded-full', s.sharePct > 40 ? 'bg-danger' : s.sharePct > 15 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, s.sharePct * 2)}%` }} />
                          </div>
                        </td>
                        <td className={cn('text-right tabular', s.onTimePct < 80 ? 'text-danger' : s.onTimePct < 90 ? 'text-warning' : 'text-fg')}>{s.onTimePct.toFixed(1)}%</td>
                        <td className={cn('text-right tabular', s.rejectionPct > 3 ? 'text-danger' : 'text-fg')}>{s.rejectionPct.toFixed(1)}%</td>
                        <td className="text-center">
                          <Badge size="sm" dot={false} tone={s.grade === 'A' ? 'success' : s.grade === 'B' ? 'brand' : s.grade === 'C' ? 'warning' : 'danger'}>
                            {s.grade}
                          </Badge>
                        </td>
                        <td className="text-2xs text-fg-muted">
                          {risky
                            ? 'High share, weak delivery — qualify a second source'
                            : weak
                              ? 'Low share but poor quality — development or exit'
                              : s.sharePct > 40
                                ? 'Dependence risk despite good performance'
                                : 'Healthy'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="On-time delivery vs rejection rate" />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierSpend.map((s) => ({ name: s.supplierName.split(' ').slice(0, 2).join(' '), 'On time %': s.onTimePct, 'Rejection %': s.rejectionPct }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<ChartTooltip suffix="%" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar yAxisId="l" dataKey="On time %" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={20} />
                  <Bar yAxisId="r" dataKey="Rejection %" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </div>
      )}

      {view === 'cycle' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Procurement cycle time" description="Average elapsed days per stage against the internal target" />
            <CardBody className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cycleTimes.map((c) => ({ stage: c.stage, Actual: c.avgDays, Target: c.targetDays }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="stage" width={180} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip suffix=" days" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar dataKey="Actual" fill="#3b82f6" radius={[0, 3, 3, 0]} maxBarSize={14} />
                  <Bar dataKey="Target" fill="#94a3b8" radius={[0, 3, 3, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Where the time goes" />
            <CardBody className="p-0">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th className="text-right">Actual</th>
                    <th className="text-right">Target</th>
                    <th className="text-right">Variance</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {cycleTimes.map((c) => {
                    const v = c.avgDays - c.targetDays
                    return (
                      <tr key={c.stage}>
                        <td className="text-xs font-medium text-fg">{c.stage}</td>
                        <td className="text-right tabular">{c.avgDays.toFixed(1)}d</td>
                        <td className="text-right tabular text-fg-muted">{c.targetDays.toFixed(1)}d</td>
                        <td className={cn('text-right tabular', v > 0 ? 'text-danger' : 'text-success')}>
                          {v > 0 ? '+' : ''}
                          {v.toFixed(1)}d
                        </td>
                        <td>
                          <Badge tone={v > 0.5 ? 'danger' : v > 0 ? 'warning' : 'success'} size="sm">
                            {v > 0.5 ? 'Behind target' : v > 0 ? 'Slightly over' : 'Within target'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td className="text-xs font-semibold text-fg">Total, requisition to first receipt</td>
                    <td className="text-right tabular font-semibold">{avgCycle.toFixed(1)}d</td>
                    <td className="text-right tabular font-semibold text-fg-muted">{cycleTimes.reduce((s, c) => s + c.targetDays, 0).toFixed(1)}d</td>
                    <td className={cn('text-right tabular font-semibold', avgCycle > cycleTimes.reduce((s, c) => s + c.targetDays, 0) ? 'text-danger' : 'text-success')}>
                      {(avgCycle - cycleTimes.reduce((s, c) => s + c.targetDays, 0)).toFixed(1)}d
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
