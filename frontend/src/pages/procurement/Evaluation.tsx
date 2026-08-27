import { useMemo, useState } from 'react'
import { Award, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { DetailBlock, ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { useCollection } from '@/store/data'
import { evaluations as seedEvaluations } from '@/mock/procurement'
import type { SupplierEvaluation } from '@/types/procurement'
import { cn } from '@/lib/cn'

const GRADE_TONE = { A: 'success', B: 'brand', C: 'warning', D: 'danger' } as const

export function EvaluationPage() {
  const toast = useToast()
  const seed = useMemo(() => seedEvaluations, [])
  const { rows, update } = useCollection<SupplierEvaluation>('proc:sev', seed)
  const rowEdit = useRowEdit<SupplierEvaluation>({
    key: 'proc:sev',
    seed: seed,
    entity: 'Supplier evaluation',
    titleOf: (r) => r.docNo,
  })

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<SupplierEvaluation | null>(null)

  const counts = {
    all: rows.length,
    a: rows.filter((r) => r.grade === 'A').length,
    b: rows.filter((r) => r.grade === 'B').length,
    risk: rows.filter((r) => r.grade === 'C' || r.grade === 'D').length,
    draft: rows.filter((r) => r.status !== 'APPROVED').length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'a') return r.grade === 'A'
    if (tab === 'b') return r.grade === 'B'
    if (tab === 'risk') return r.grade === 'C' || r.grade === 'D'
    if (tab === 'draft') return r.status !== 'APPROVED'
    return true
  })

  const columns: Column<SupplierEvaluation>[] = [
    { key: 'supplierName', header: 'Supplier', sortable: true, render: (r) => (
      <div>
        <p className="text-xs font-medium text-fg">{r.supplierName}</p>
        <p className="text-2xs text-fg-subtle">{r.category}</p>
      </div>
    ) },
    { key: 'period', header: 'Period', sortable: true, width: '9rem' },
    { key: 'poCount', header: 'Orders', align: 'right', sortable: true, width: '5.5rem' },
    { key: 'poValue', header: 'Spend', align: 'right', sortable: true, accessor: (r) => r.poValue, render: (r) => formatCurrency(r.poValue) },
    { key: 'onTimePct', header: 'On time', align: 'right', sortable: true, accessor: (r) => r.onTimePct, render: (r) => <span className={cn(r.onTimePct < 80 ? 'text-danger' : r.onTimePct < 90 ? 'text-warning' : 'text-fg')}>{r.onTimePct.toFixed(1)}%</span> },
    { key: 'rejectionPct', header: 'Rejection', align: 'right', sortable: true, accessor: (r) => r.rejectionPct, render: (r) => <span className={cn(r.rejectionPct > 3 ? 'text-danger' : 'text-fg')}>{r.rejectionPct.toFixed(1)}%</span> },
    { key: 'avgDelayDays', header: 'Avg delay', align: 'right', defaultHidden: true, render: (r) => `${r.avgDelayDays.toFixed(1)}d` },
    { key: 'openNcrs', header: 'NCRs', align: 'right', width: '4.5rem', render: (r) => <span className={cn(r.openNcrs > 0 && 'font-medium text-danger')}>{r.openNcrs}</span> },
    {
      key: 'overallScore',
      header: 'Score',
      align: 'right',
      sortable: true,
      width: '8rem',
      accessor: (r) => r.overallScore,
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <span className="font-semibold text-fg tabular">{r.overallScore.toFixed(1)}</span>
          {r.overallScore > r.previousScore ? (
            <TrendingUp className="h-3 w-3 text-success" />
          ) : r.overallScore < r.previousScore ? (
            <TrendingDown className="h-3 w-3 text-danger" />
          ) : null}
        </div>
      ),
    },
    { key: 'grade', header: 'Grade', align: 'center', sortable: true, width: '5rem', render: (r) => <Badge tone={GRADE_TONE[r.grade]} size="sm" dot={false}>{r.grade}</Badge> },
    { key: 'action', header: 'Outcome', sortable: true, width: '8rem', render: (r) => <span className="text-2xs text-fg-muted">{r.action.replace('_', ' ').toLowerCase()}</span> },
    { key: 'status', header: 'Status', width: '9rem', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'supplier-evaluations', 'Supplier evaluations', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const chartData = rows
    .slice()
    .sort((a, b) => b.overallScore - a.overallScore)
    .map((r) => ({ name: r.supplierName.split(' ').slice(0, 2).join(' '), score: r.overallScore, grade: r.grade }))

  return (
    <div>
      <PageHeader
        title="Supplier evaluation"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Evaluation' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => toast.success('Evaluation cycle started', 'Q3 scorecards drafted from delivery, quality and compliance data for the period.')}
          >
            Start Q3 cycle
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'a', label: 'Grade A', count: counts.a },
              { id: 'b', label: 'Grade B', count: counts.b },
              { id: 'risk', label: 'At risk', count: counts.risk },
              { id: 'draft', label: 'Unapproved', count: counts.draft },
            ]}
          />
        }
      />

      <Card className="mb-4">
        <CardHeader title="Score distribution" description="Weighted score out of 100 — quality 30, delivery 25, price 20, service 15, compliance 10" />
        <CardBody className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgb(var(--surface-3))' }}
                content={({ active, payload }: any) =>
                  active && payload?.length ? (
                    <div className="rounded border border-border bg-surface px-2.5 py-1.5 shadow-pop">
                      <p className="text-2xs font-medium text-fg">{payload[0].payload.name}</p>
                      <p className="text-2xs text-fg-muted">
                        Score <span className="font-medium text-fg tabular">{payload[0].value}</span> · grade {payload[0].payload.grade}
                      </p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="score" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.grade === 'A' ? '#10b981' : d.grade === 'B' ? '#3b82f6' : d.grade === 'C' ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search supplier, category, period…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No evaluations"
        rowActions={(r) => (
          <>
            {rowEdit.actions(r)}
            <MenuItem label="Open scorecard" onClick={() => setDetail(r)} />
            <MenuItem
              label="Approve evaluation"
              disabled={r.status === 'APPROVED'}
              onClick={() => {
                update(r.uid, { status: 'APPROVED' })
                toast.success('Approved', `${r.supplierName} scorecard published to the supplier portal.`)
              }}
            />
            <MenuItem
              label="Issue improvement notice"
              separatorBefore
              disabled={r.grade === 'A'}
              onClick={() => toast.success('Notice issued', `${r.supplierName} asked for a corrective action plan within 14 days.`)}
            />
            <MenuItem
              label="Blacklist supplier"
              danger
              disabled={r.grade !== 'D'}
              onClick={() => {
                update(r.uid, { action: 'BLACKLIST', actionNote: 'Blacklisted following sustained quality failure.' })
                toast.warning('Blacklisted', `${r.supplierName} blocked from new orders. Open orders continue until closed.`)
              }}
            />
          </>
        )}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.supplierName}
        description={detail ? `${detail.docNo} · ${detail.period}` : undefined}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              {detail.status !== 'APPROVED' && (
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => {
                    update(detail.uid, { status: 'APPROVED' })
                    toast.success('Approved', 'Scorecard published.')
                    setDetail(null)
                  }}
                >
                  Approve
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={GRADE_TONE[detail.grade]} size="md" dot={false}>
                Grade {detail.grade}
              </Badge>
              <span className="text-lg font-semibold text-fg tabular">{detail.overallScore.toFixed(1)}</span>
              <span className={cn('text-2xs', detail.overallScore >= detail.previousScore ? 'text-success' : 'text-danger')}>
                {detail.overallScore >= detail.previousScore ? '▲' : '▼'} {Math.abs(detail.overallScore - detail.previousScore).toFixed(1)} vs previous
              </span>
              <ProcStatusBadge status={detail.status} size="sm" />
            </div>

            <div className="h-56 rounded border border-border p-2">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={[
                    { axis: 'Quality', value: detail.qualityScore },
                    { axis: 'Delivery', value: detail.deliveryScore },
                    { axis: 'Price', value: detail.priceScore },
                    { axis: 'Service', value: detail.serviceScore },
                    { axis: 'Compliance', value: detail.complianceScore },
                  ]}
                >
                  <PolarGrid stroke="rgb(var(--border))" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'rgb(var(--fg-subtle))' }} />
                  <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Category', value: detail.category },
                { label: 'Evaluated by', value: `${detail.evaluatedBy} · ${formatDate(detail.evaluatedAt)}` },
                { label: 'Orders in period', value: detail.poCount },
                { label: 'Spend in period', value: formatCurrency(detail.poValue) },
                { label: 'On-time delivery', value: `${detail.onTimePct.toFixed(1)}%` },
                { label: 'Average delay', value: `${detail.avgDelayDays.toFixed(1)} days` },
                { label: 'Rejection rate', value: `${detail.rejectionPct.toFixed(1)}%` },
                { label: 'Open NCRs', value: detail.openNcrs },
              ]}
            />

            <DetailBlock title="Weighted criteria">
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Criterion</th>
                      <th className="text-right">Weight</th>
                      <th className="text-right">Score</th>
                      <th className="text-right">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.criteria.map((c) => (
                      <tr key={c.code}>
                        <td>
                          <p className="text-xs font-medium text-fg">{c.name}</p>
                          {c.note && <p className="mt-0.5 text-2xs text-fg-muted">{c.note}</p>}
                        </td>
                        <td className="text-right tabular">{c.weightPct}%</td>
                        <td className={cn('text-right tabular font-medium', c.score >= 85 ? 'text-success' : c.score >= 70 ? 'text-warning' : 'text-danger')}>
                          {c.score}
                        </td>
                        <td className="text-right tabular">{((c.score * c.weightPct) / 100).toFixed(1)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="text-xs font-semibold text-fg">Total</td>
                      <td className="text-right tabular font-semibold">100%</td>
                      <td />
                      <td className="text-right tabular font-semibold text-fg">{detail.overallScore.toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title={`Action — ${detail.action.replace('_', ' ').toLowerCase()}`}>
              <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">
                {detail.actionNote}
              </p>
            </DetailBlock>
          </div>
        )}
      </Drawer>

      {rowEdit.dialogs}
    </div>
  )
}
