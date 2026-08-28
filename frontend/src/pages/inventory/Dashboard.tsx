import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardCheck,
  Hourglass,
  IndianRupee,
  PackageCheck,
  ShieldAlert,
  Timer,
  Truck,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
// defs / linearGradient / stop are plain SVG elements — they are written as
// lowercase JSX and must not be imported from recharts.
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart, Legend } from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PageHeader, ProgressBar, Section } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { ChartTip, CoverChip, InvStatusBadge, SlaChip, useCanSeeValue } from '@/components/inventory/InvShell'
import { formatCompact, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { InvKpiTile } from '@/components/inventory/InvKpiTile'
import { InvDetailsPanel, type InvDetailCol } from '@/components/inventory/InvDetailsPanel'
import { InvDateFilter, type DateRange } from '@/components/inventory/InvDateFilter'
import {
  accuracyTrend,
  batches,
  counts,
  jobworkChallans,
  movementDays,
  nonMoving,
  putaways,
  quarantineLots,
  reorderRows,
  stockPositions,
  transfers,
  valuationRows,
  valueTrend,
  warehouseSummaries,
} from '@/mock/inventory'

export function InventoryDashboardPage() {
  const navigate = useNavigate()
  const canSeeValue = useCanSeeValue()
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })

  function togglePanel(key: string) {
    setOpenPanel((p) => (p === key ? null : key))
  }

  const kpis = useMemo(() => {
    const closingValue = valuationRows.reduce((s, r) => s + r.closing, 0)
    const belowReorder = reorderRows.filter((r) => r.action === 'RAISE_PR' || r.action === 'TRANSFER' || r.action === 'URGENT')
    const pendingPutaway = putaways.filter((p) => p.totalBinned < p.totalReceived)
    const openQuarantine = quarantineLots.filter((q) => q.decision === 'PENDING')
    const git = transfers.filter((t) => t.status === 'IN_TRANSIT' || t.status === 'PARTIALLY_RECEIVED')
    const jobwork = jobworkChallans.filter((j) => j.balanceQty > 0)
    const expiring = batches.filter((b) => b.expiresOn && new Date(b.expiresOn).getTime() - Date.now() < 30 * 86_400_000 && b.status !== 'CONSUMED')
    return {
      closingValue,
      turns: 7.4,
      accuracy: accuracyTrend[accuracyTrend.length - 1].accuracyPct,
      belowReorder,
      belowReorderValue: belowReorder.reduce((s, r) => s + r.suggestedQty * r.lastRate, 0),
      pendingPutaway,
      oldestPutaway: Math.max(0, ...pendingPutaway.map((p) => p.ageHours)),
      openQuarantine,
      quarantineValue: openQuarantine.reduce((s, q) => s + q.value, 0),
      gitValue: git.reduce((s, t) => s + t.totalValue, 0),
      gitOldest: Math.max(0, ...git.map((t) => t.transitDays)),
      jobworkValue: jobwork.reduce((s, j) => s + j.value, 0),
      jobworkAtRisk: jobwork.filter((j) => new Date(j.statutoryDueOn).getTime() - Date.now() < 60 * 86_400_000).length,
      expiring,
      nonMovingValue: nonMoving.reduce((s, n) => s + n.value, 0),
      countsDue: counts.filter((c) => c.status === 'ASSIGNED' || c.status === 'RECOUNT_REQUIRED').length,
      stockouts: stockPositions.filter((p) => p.available === 0 && p.reorderLevel > 0).length,
    }
  }, [])

  const actionQueue = [
    { label: 'Lines awaiting put-away', count: kpis.pendingPutaway.reduce((s, p) => s + p.lines.length, 0), to: '/inventory/putaway', icon: PackageCheck, tone: 'warning' as const },
    { label: 'Lots awaiting QC decision', count: kpis.openQuarantine.length, to: '/inventory/putaway', icon: ClipboardCheck, tone: 'pending' as const },
    { label: 'Items below reorder level', count: kpis.belowReorder.length, to: '/inventory/replenishment', icon: AlertTriangle, tone: 'danger' as const },
    { label: 'Counts assigned or in recount', count: kpis.countsDue, to: '/inventory/counting', icon: ClipboardCheck, tone: 'progress' as const },
    { label: 'Consignments in transit', count: transfers.filter((t) => t.status === 'IN_TRANSIT').length, to: '/inventory/transfers', icon: Truck, tone: 'progress' as const },
    { label: 'Batches expiring in 30 days', count: kpis.expiring.length, to: '/inventory/batches', icon: Hourglass, tone: 'warning' as const },
  ]

  return (
    <div>
      <PageHeader
        title="Inventory & stores"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <InvDateFilter value={dateRange} onChange={setDateRange} />
            <Button variant="primary" size="sm" onClick={() => navigate('/inventory/receipts')}>Stock Inward</Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/inventory/issues')}>Stock Outward</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/transfers')}>Transfer</Button>
          </div>
        }
      />

      {/* KPI tiles ----------------------------------------------------------- */}
      <div className="mb-3 grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <InvKpiTile
          label="Stock Value"
          value={canSeeValue ? `₹${formatCompact(kpis.closingValue)}` : `${stockPositions.length} lines`}
          sub={canSeeValue ? `${valuationRows.length} groups` : 'Value hidden'}
          icon={<IndianRupee />}
          tone="brand"
          active={openPanel === 'value'}
          onClick={() => togglePanel('value')}
        />
        <InvKpiTile
          label="Accuracy"
          value={`${kpis.accuracy.toFixed(1)}%`}
          sub="Bins at zero variance"
          icon={<ClipboardCheck />}
          tone={kpis.accuracy >= 98 ? 'success' : 'warning'}
          active={openPanel === 'accuracy'}
          onClick={() => togglePanel('accuracy')}
        />
        <InvKpiTile
          label="Put-away Backlog"
          value={kpis.pendingPutaway.length}
          sub={`Oldest ${kpis.oldestPutaway.toFixed(1)} h`}
          icon={<PackageCheck />}
          tone={kpis.oldestPutaway >= 4 ? 'danger' : kpis.oldestPutaway >= 3 ? 'warning' : 'success'}
          active={openPanel === 'putaway'}
          onClick={() => togglePanel('putaway')}
        />
        <InvKpiTile
          label="Below Reorder"
          value={kpis.belowReorder.length}
          sub={`${kpis.stockouts} at zero stock`}
          icon={<ShieldAlert />}
          tone={kpis.belowReorder.length > 0 ? 'warning' : 'success'}
          active={openPanel === 'reorder'}
          onClick={() => togglePanel('reorder')}
        />
        <InvKpiTile
          label="In Transit"
          value={transfers.filter(t => t.status === 'IN_TRANSIT').length}
          sub={canSeeValue ? `₹${formatCompact(kpis.gitValue)}` : 'Value hidden'}
          icon={<Truck />}
          tone="progress"
          active={openPanel === 'transit'}
          onClick={() => togglePanel('transit')}
        />
        <InvKpiTile
          label="Expiring (30d)"
          value={kpis.expiring.length}
          sub="Batches nearing expiry"
          icon={<Hourglass />}
          tone={kpis.expiring.length > 0 ? 'danger' : 'success'}
          active={openPanel === 'expiring'}
          onClick={() => togglePanel('expiring')}
        />
      </div>

      {/* Details panel -------------------------------------------------------- */}
      <div className="mb-4 grid grid-cols-1">
        {openPanel === 'reorder' && (
          <InvDetailsPanel
            label="Items Below Reorder Level"
            cols={[
              { key: 'itemCode', header: 'Code' },
              { key: 'itemName', header: 'Item' },
              { key: 'available', header: 'Available', align: 'right', render: (r) => <span className="text-danger font-medium">{formatQty(r.available)}</span> },
              { key: 'reorderLevel', header: 'Reorder At', align: 'right', render: (r) => formatQty(r.reorderLevel) },
              { key: 'suggestedQty', header: 'Suggested Order', align: 'right', render: (r) => <span className="text-brand-600 font-medium">{formatQty(r.suggestedQty)}</span> },
            ]}
            rows={kpis.belowReorder}
            note="Items whose available stock has fallen below their reorder level."
            onClose={() => setOpenPanel(null)}
          />
        )}
        {openPanel === 'putaway' && (
          <InvDetailsPanel
            label="Pending Put-away"
            cols={[
              { key: 'grnNo', header: 'GRN' },
              { key: 'supplierName', header: 'Supplier' },
              { key: 'lines', header: 'Lines', align: 'right', render: (r) => r.lines?.length ?? 0 },
              { key: 'ageHours', header: 'Age (h)', align: 'right', render: (r) => <span className={r.ageHours >= 4 ? 'text-danger font-medium' : ''}>{r.ageHours?.toFixed(1)}</span> },
            ]}
            rows={kpis.pendingPutaway}
            note="GRNs received but not yet binned. SLA: 4 h from receipt."
            onClose={() => setOpenPanel(null)}
          />
        )}
        {openPanel === 'expiring' && (
          <InvDetailsPanel
            label="Batches Expiring in 30 Days"
            cols={[
              { key: 'itemCode', header: 'Code' },
              { key: 'itemName', header: 'Item' },
              { key: 'batchNo', header: 'Batch' },
              { key: 'expiresOn', header: 'Expiry Date', render: (r) => formatDate(r.expiresOn) },
              { key: 'currentStock', header: 'Qty', align: 'right', render: (r) => formatQty(r.currentStock) },
            ]}
            rows={kpis.expiring}
            note="Batches where expiry is within 30 days and stock is not yet consumed."
            onClose={() => setOpenPanel(null)}
          />
        )}
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
          <CardHeader title="Movement trend" description="Inward vs Outward quantity — smooth area chart" />
          <CardBody className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={movementDays} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="receipts" name="Inward" stroke="#10b981" strokeWidth={2} fill="url(#gradIn)" dot={false} />
                <Area type="monotone" dataKey="issues" name="Outward" stroke="#3b82f6" strokeWidth={2} fill="url(#gradOut)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Warehouse occupancy" description="Bins occupied against capacity" />
          <CardBody className="space-y-3">
            {warehouseSummaries
              .filter((w) => w.isBinManaged)
              .map((w) => {
                const pct = w.binCount ? (w.binsOccupied / w.binCount) * 100 : 0
                return (
                  <div key={w.uid}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-mono text-2xs text-fg">{w.code}</span>
                      <span className={cn('tabular text-2xs', pct > 85 ? 'text-warning' : 'text-fg-muted')}>
                        {w.binsOccupied}/{w.binCount} · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <ProgressBar value={pct} tone={pct > 85 ? 'warning' : 'brand'} />
                  </div>
                )
              })}
            <Link to="/inventory/warehouses" className="mt-1 inline-flex items-center gap-1 text-2xs text-brand-600 hover:underline">
              Open warehouse map <ArrowRight className="h-3 w-3" />
            </Link>
          </CardBody>
        </Card>
      </div>

      {/* Value + accuracy --------------------------------------------------- */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {canSeeValue && (
          <Card>
            <CardHeader title="Stock value trend" description="Closing value by class, ₹ lakh" />
            <CardBody className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={valueTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip content={<ChartTip prefix="₹" suffix=" L" />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Area type="monotone" dataKey="rawMaterial" name="Raw material" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.55} />
                  <Area type="monotone" dataKey="wip" name="WIP" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.55} />
                  <Area type="monotone" dataKey="finishedGoods" name="Finished goods" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.55} />
                  <Area type="monotone" dataKey="other" name="Other" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.55} />
                </AreaChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        )}

        <Card className={canSeeValue ? undefined : 'lg:col-span-2'}>
          <CardHeader title="Inventory accuracy" description="Bins with zero variance, and absolute value variance" />
          <CardBody className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accuracyTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" domain={[94, 100]} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 1.2]} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                <Tooltip content={<ChartTip suffix="%" />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Line yAxisId="l" type="monotone" dataKey="accuracyPct" name="Accuracy %" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="variancePct" name="Value variance %" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Watch lists -------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Reorder watch"
            description="Free stock against reorder level, with coverage in days"
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate('/inventory/replenishment')}>
                Workbench
              </Button>
            }
          />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Free</th>
                    <th className="text-right">Reorder</th>
                    <th className="text-right">On order</th>
                    <th>Cover</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderRows.slice(0, 7).map((r) => (
                    <tr key={r.uid}>
                      <td className="max-w-[16rem]">
                        <p className="truncate text-xs font-medium text-fg">{r.itemName}</p>
                        <p className="font-mono text-2xs text-fg-subtle">{r.itemCode}</p>
                      </td>
                      <td className="text-right tabular">{formatQty(r.free)}</td>
                      <td className="text-right tabular text-fg-muted">{formatQty(r.reorderLevel)}</td>
                      <td className="text-right tabular text-fg-muted">{formatQty(r.onOrder)}</td>
                      <td><CoverChip days={r.coverageDays} /></td>
                      <td>
                        <Badge
                          size="sm"
                          dot={false}
                          tone={r.action === 'URGENT' ? 'danger' : r.action === 'RAISE_PR' ? 'warning' : r.action === 'TRANSFER' ? 'brand' : r.action === 'COVERED' ? 'progress' : 'success'}
                        >
                          {r.action === 'RAISE_PR' ? 'Raise PR' : r.action === 'TRANSFER' ? 'Transfer' : r.action.charAt(0) + r.action.slice(1).toLowerCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Put-away queue" description="Received, not yet binned" />
            <CardBody className="space-y-2.5">
              {kpis.pendingPutaway.length === 0 ? (
                <p className="text-xs text-fg-subtle">Everything received today has been binned.</p>
              ) : (
                kpis.pendingPutaway.map((p) => (
                  <Link key={p.uid} to="/inventory/putaway" className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-2xs font-medium text-brand-600">{p.docNo}</p>
                      <p className="truncate text-2xs text-fg-muted">
                        {p.sourceParty} · {p.lines.length} lines
                      </p>
                    </div>
                    <SlaChip hours={p.ageHours} target={4} />
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Expiry watch" description="Batches expiring within 30 days" />
            <CardBody className="space-y-2.5">
              {kpis.expiring.length === 0 ? (
                <p className="text-xs text-fg-subtle">Nothing expiring in the next 30 days.</p>
              ) : (
                kpis.expiring.map((b) => {
                  const days = Math.ceil((new Date(b.expiresOn!).getTime() - Date.now()) / 86_400_000)
                  return (
                    <Link key={b.uid} to="/inventory/batches" className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-fg">{b.itemName}</p>
                        <p className="truncate font-mono text-2xs text-fg-subtle">
                          {b.batchNo} · {formatQty(b.quantityRemaining)} {b.uom}
                        </p>
                      </div>
                      <Badge size="sm" tone={days <= 0 ? 'danger' : days <= 14 ? 'warning' : 'pending'}>
                        {days <= 0 ? 'Expired' : `${days} d`}
                      </Badge>
                    </Link>
                  )
                })
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Stock away from the plant" description="In transit and at job workers" />
            <CardBody className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">Goods in transit</p>
                  <p className="text-2xs text-fg-muted">Oldest {kpis.gitOldest} days</p>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular text-fg">
                  {canSeeValue ? `₹${formatCompact(kpis.gitValue)}` : `${transfers.filter((t) => t.status === 'IN_TRANSIT').length} docs`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">At subcontractor</p>
                  <p className="text-2xs text-fg-muted">{kpis.jobworkAtRisk} challan(s) near the statutory window</p>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular text-fg">
                  {canSeeValue ? `₹${formatCompact(kpis.jobworkValue)}` : `${jobworkChallans.filter((j) => j.balanceQty > 0).length} open`}
                </span>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Latest counts ------------------------------------------------------ */}
      <Section title="Recent counts" className="mt-6">
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Count</th>
                    <th>Scope</th>
                    <th>Counter</th>
                    <th className="text-right">Bins</th>
                    <th className="text-right">Variance lines</th>
                    <th className="text-right">Accuracy</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map((c) => (
                    <tr key={c.uid}>
                      <td className="font-mono text-2xs font-medium text-brand-600">{c.docNo}</td>
                      <td className="max-w-[16rem] truncate text-xs">{c.warehouse} · {c.scope}</td>
                      <td className="text-xs">{c.counter}</td>
                      <td className="text-right tabular">{c.binsCounted}/{c.binsPlanned}</td>
                      <td className="text-right tabular">{c.linesWithVariance}</td>
                      <td className={cn('text-right tabular', c.accuracyPct && c.accuracyPct < 95 ? 'text-warning' : '')}>
                        {c.binsCounted ? `${c.accuracyPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="text-2xs text-fg-muted">{formatDate(c.dueOn)}</td>
                      <td><InvStatusBadge status={c.status} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </Section>
    </div>
  )
}
