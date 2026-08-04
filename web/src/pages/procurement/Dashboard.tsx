import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  FileCheck2,
  IndianRupee,
  PackageCheck,
  ShieldAlert,
  Timer,
  TrendingDown,
  Truck,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader, Section, StatTile } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { ProcStatusBadge } from '@/components/procurement/ProcShell'
import { formatCompact, formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import {
  asns,
  contracts,
  evaluations,
  grns,
  inspections,
  purchaseOrders,
  quotations,
  requisitions,
  rfqs,
  spendByCategory,
  spendTrend,
  supplierSpend,
} from '@/mock/procurement'

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

export function ProcurementDashboardPage() {
  const navigate = useNavigate()

  const kpis = useMemo(() => {
    const openPo = purchaseOrders.filter((p) =>
      ['APPROVED', 'PARTIALLY_EXECUTED', 'IN_PROGRESS', 'ON_HOLD'].includes(p.status),
    )
    const openValue = openPo.reduce((s, p) => s + p.totalValue * (1 - p.receivedPct / 100), 0)
    const ytdSpend = spendTrend.reduce((s, m) => s + m.spend, 0)
    const budget = spendTrend.reduce((s, m) => s + m.budget, 0)
    const receipts = grns.filter((g) => g.status !== 'CANCELLED')
    const onTime = receipts.filter((g) => g.delayDays <= 0).length
    const received = receipts.reduce((s, g) => s + g.totalReceived, 0)
    const rejected = receipts.reduce((s, g) => s + g.totalRejected, 0)
    return {
      openPoCount: openPo.length,
      openValue,
      ytdSpend,
      budgetVariance: ((ytdSpend - budget) / budget) * 100,
      prPending: requisitions.filter((r) => r.status === 'PENDING_APPROVAL').length,
      poPending: purchaseOrders.filter((p) => p.status === 'PENDING_APPROVAL').length,
      rfqOpen: rfqs.filter((r) => r.status === 'IN_PROGRESS' || r.status === 'PENDING_APPROVAL').length,
      quotesAwaiting: rfqs.flatMap((r) => r.suppliers).filter((s) => s.responseStatus === 'INVITED' || s.responseStatus === 'VIEWED').length,
      inTransit: asns.filter((a) => a.status === 'IN_TRANSIT' || a.status === 'NOTIFIED').length,
      qcPending: inspections.filter((i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS').length,
      onTimePct: (onTime / receipts.length) * 100,
      rejectionPct: (rejected / received) * 100,
      savings: quotations.reduce((s, q) => s + (q.status === 'AWARDED' ? 1_008_000 : 0), 0),
    }
  }, [])

  const expiringContracts = contracts
    .filter((c) => c.status === 'ACTIVE' || c.status === 'EXPIRING')
    .map((c) => ({ ...c, days: Math.ceil((new Date(c.validTo).getTime() - Date.now()) / 86_400_000) }))
    .filter((c) => c.days <= 90)
    .sort((a, b) => a.days - b.days)

  const riskSuppliers = evaluations.filter((e) => e.grade === 'C' || e.grade === 'D').sort((a, b) => a.overallScore - b.overallScore)

  const overduePo = purchaseOrders
    .filter((p) => ['APPROVED', 'PARTIALLY_EXECUTED', 'ON_HOLD'].includes(p.status))
    .map((p) => ({ ...p, days: Math.ceil((Date.now() - new Date(p.promisedDate).getTime()) / 86_400_000) }))
    .filter((p) => p.days > 0)

  const actionQueue = [
    { label: 'Requisitions awaiting my approval', count: kpis.prPending, to: '/procurement/requisitions', icon: ClipboardList, tone: 'pending' as const },
    { label: 'Purchase orders awaiting approval', count: kpis.poPending, to: '/procurement/orders', icon: FileCheck2, tone: 'pending' as const },
    { label: 'RFQs open for response', count: kpis.rfqOpen, to: '/procurement/rfq', icon: Timer, tone: 'progress' as const },
    { label: 'Shipments in transit', count: kpis.inTransit, to: '/procurement/asn', icon: Truck, tone: 'progress' as const },
    { label: 'Receipts awaiting inspection', count: kpis.qcPending, to: '/procurement/grn', icon: PackageCheck, tone: 'warning' as const },
    { label: 'Overdue purchase orders', count: overduePo.length, to: '/procurement/orders', icon: AlertTriangle, tone: 'danger' as const },
  ]

  const categoryPie = spendByCategory.slice(0, 6).map((c) => ({ name: c.category, value: Math.round(c.value / 100_000) }))

  return (
    <div>
      <PageHeader
        title="Procurement"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/procurement/mrp')}>
              Run MRP
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/procurement/requisitions')}>
              New requisition
            </Button>
          </>
        }
      />

      {/* KPI row ------------------------------------------------------------ */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Open PO value"
          value={`₹${formatCompact(kpis.openValue)}`}
          sub={`${kpis.openPoCount} orders yet to be fully received`}
          icon={<IndianRupee />}
          tone="brand"
        />
        <StatTile
          label="Spend YTD"
          value={`₹${formatCompact(kpis.ytdSpend)}`}
          delta={{ value: kpis.budgetVariance, label: 'vs budget' }}
          icon={<TrendingDown />}
          tone={kpis.budgetVariance > 0 ? 'warning' : 'success'}
        />
        <StatTile
          label="On-time delivery"
          value={`${kpis.onTimePct.toFixed(1)}%`}
          sub="Receipts on or before the promised date"
          icon={<Truck />}
          tone={kpis.onTimePct >= 90 ? 'success' : 'warning'}
        />
        <StatTile
          label="Incoming rejection"
          value={`${kpis.rejectionPct.toFixed(2)}%`}
          sub="Rejected against total received quantity"
          icon={<ShieldAlert />}
          tone={kpis.rejectionPct <= 1 ? 'success' : 'danger'}
        />
      </div>

      {/* Action queue ------------------------------------------------------- */}
      <Section title="Needs attention">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* Charts ------------------------------------------------------------- */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Spend vs budget" description="Monthly committed spend against the approved procurement budget" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendTrend.map((s) => ({ ...s, spendL: Math.round(s.spend / 100_000), budgetL: Math.round(s.budget / 100_000) }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={38} />
                <Tooltip content={<ChartTooltip prefix="₹" suffix=" L" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="spendL" name="Spend" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Bar dataKey="budgetL" name="Budget" fill="#94a3b8" radius={[3, 3, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Spend by category" description="Share of committed value, ₹ lakh" />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryPie} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                  {categoryPie.map((_, i) => (
                    <Cell key={i} fill={CHART_COLOURS[i % CHART_COLOURS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip prefix="₹" suffix=" L" />} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={7} />
              </PieChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Supplier performance + risk ---------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Top suppliers"
            description="Spend share against delivery and quality performance"
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate('/procurement/evaluation')}>
                Scorecards
              </Button>
            }
          />
          <CardBody className="p-0">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="text-right">Spend</th>
                  <th className="text-right">Share</th>
                  <th className="text-right">On time</th>
                  <th className="text-right">Rejection</th>
                  <th className="text-center">Grade</th>
                </tr>
              </thead>
              <tbody>
                {supplierSpend.map((s) => (
                  <tr key={s.supplierName}>
                    <td className="font-medium text-fg">{s.supplierName}</td>
                    <td className="text-right tabular">{formatCurrency(s.value)}</td>
                    <td className="text-right tabular">{s.sharePct.toFixed(1)}%</td>
                    <td className={cn('text-right tabular', s.onTimePct < 80 ? 'text-danger' : s.onTimePct < 90 ? 'text-warning' : 'text-fg')}>
                      {s.onTimePct.toFixed(1)}%
                    </td>
                    <td className={cn('text-right tabular', s.rejectionPct > 3 ? 'text-danger' : 'text-fg')}>
                      {s.rejectionPct.toFixed(1)}%
                    </td>
                    <td className="text-center">
                      <Badge
                        size="sm"
                        dot={false}
                        tone={s.grade === 'A' ? 'success' : s.grade === 'B' ? 'brand' : s.grade === 'C' ? 'warning' : 'danger'}
                      >
                        {s.grade}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Contracts expiring" description="Within 90 days" />
            <CardBody className="space-y-2.5">
              {expiringContracts.length === 0 ? (
                <p className="text-xs text-fg-subtle">Nothing expiring in the next 90 days.</p>
              ) : (
                expiringContracts.map((c) => (
                  <div key={c.uid} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-fg">{c.title}</p>
                      <p className="truncate text-2xs text-fg-muted">
                        {c.supplierName} · {formatDate(c.validTo)}
                      </p>
                    </div>
                    <Badge size="sm" tone={c.days <= 30 ? 'danger' : 'warning'}>
                      {c.days}d
                    </Badge>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Supplier risk" description="Grade C and below" />
            <CardBody className="space-y-2.5">
              {riskSuppliers.map((e) => (
                <div key={e.uid} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-fg">{e.supplierName}</p>
                    <p className="truncate text-2xs text-fg-muted">
                      {e.rejectionPct.toFixed(1)}% rejection · {e.onTimePct.toFixed(0)}% on time · {e.action.replace('_', ' ').toLowerCase()}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-danger tabular">{e.overallScore.toFixed(1)}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Recent documents ---------------------------------------------------- */}
      <Section title="Latest activity" className="mt-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Recent purchase orders" />
            <CardBody className="p-0">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>PO</th>
                    <th>Supplier</th>
                    <th className="text-right">Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.slice(0, 6).map((p) => (
                    <tr key={p.uid}>
                      <td className="font-mono text-2xs">{p.docNo}</td>
                      <td className="max-w-[10rem] truncate">{p.supplierName}</td>
                      <td className="text-right tabular">{formatCurrency(p.totalValue)}</td>
                      <td>
                        <ProcStatusBadge status={p.status} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent receipts" />
            <CardBody className="p-0">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>GRN</th>
                    <th>Supplier</th>
                    <th className="text-right">Value</th>
                    <th>QC</th>
                  </tr>
                </thead>
                <tbody>
                  {grns.slice(0, 6).map((g) => (
                    <tr key={g.uid}>
                      <td className="font-mono text-2xs">{g.docNo}</td>
                      <td className="max-w-[10rem] truncate">{g.supplierName}</td>
                      <td className="text-right tabular">{formatCurrency(g.grnValue)}</td>
                      <td>
                        <ProcStatusBadge status={g.qcStatus} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      </Section>

      <Card className="mt-4">
        <CardHeader title="Price movement" description="Weighted average purchase rate, ₹ per unit" />
        <CardBody className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spendTrend.map((s, i) => ({ month: s.month, ss304: [212, 215, 224, 229, 226, 221, 218][i], ss316: [298, 302, 314, 321, 318, 315, 312][i] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={38} domain={['dataMin - 20', 'dataMax + 20']} />
              <Tooltip content={<ChartTooltip prefix="₹" />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
              <Line type="monotone" dataKey="ss304" name="SS 304 coil" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ss316" name="SS 316 coil" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
    </div>
  )
}
