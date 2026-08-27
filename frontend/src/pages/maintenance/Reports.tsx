import { useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar, Section, StatTile } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDate } from '@/lib/format'
import {
  ChartTip, CriticalityBadge, WoTypeBadge, duration, hours, inr, inrCompact, useMaintenanceData,
} from '@/components/maintenance/MaintShell'
import {
  ASSET_CATEGORY_LABEL, BREAKDOWN_CATEGORY_LABEL, WO_TYPE_LABEL, daysBetween, isoDate,
  maintenanceCost, minutesBetween, pmCompliance, pmVsBreakdown, reliabilityOf,
  spareStatus, technicianLoad, woCost,
} from '@/lib/maintFlow'
import { maintenanceTrend } from '@/mock/maintenance'

/**
 * Maintenance reports (Ch 19).
 *
 * Every figure comes from the same records the operational screens write, so a
 * number here can never disagree with the screen it came from. The reports
 * answer the questions a maintenance review actually asks — which machine is
 * costing us, is the programme working, where does the downtime sit.
 */

type Tab = 'reliability' | 'downtime' | 'cost' | 'compliance' | 'lifecycle' | 'spares'

const WINDOWS = [30, 90, 180, 365]

export function MaintenanceReportsPage() {
  const toast = useToast()
  const m = useMaintenanceData()
  const today = isoDate(new Date())

  const [tab, setTab] = useState<Tab>('reliability')
  const [windowDays, setWindowDays] = useState(90)

  const from = useMemo(() => isoDate(new Date(Date.now() - (windowDays - 1) * 86_400_000)), [windowDays])

  const assets = useMemo(() => m.assets.rows.filter((a) => !a.deletedAt), [m.assets.rows])
  const workOrders = useMemo(() => m.workOrders.rows.filter((w) => !w.deletedAt), [m.workOrders.rows])
  const breakdowns = useMemo(() => m.breakdowns.rows.filter((b) => !b.deletedAt), [m.breakdowns.rows])

  /** Hierarchy nodes are not machines and must not dilute the fleet figures. */
  const machines = useMemo(
    () => assets.filter((a) => !['PLANT-01', 'BLD-PROD', 'BLD-UTIL', 'LINE-DD', 'LINE-FIN', 'LINE-ASY'].includes(a.code)),
    [assets],
  )

  const reliability = useMemo(
    () => machines.map((a) => reliabilityOf(a, breakdowns, from, today)).sort((a, b) => a.availabilityPct - b.availabilityPct),
    [machines, breakdowns, from, today],
  )

  const cost = useMemo(() => maintenanceCost(workOrders, from, today), [workOrders, from, today])
  const ratio = useMemo(() => pmVsBreakdown(workOrders, from, today), [workOrders, from, today])
  const compliance = useMemo(() => pmCompliance(workOrders, from, today), [workOrders, from, today])

  const fleet = useMemo(() => {
    const uptime = reliability.reduce((s, r) => s + r.uptimeMinutes, 0)
    const down = reliability.reduce((s, r) => s + r.downtimeMinutes, 0)
    const failures = reliability.reduce((s, r) => s + r.failures, 0)
    const mttrs = reliability.filter((r) => r.mttrHours !== null).map((r) => r.mttrHours as number)
    return {
      availabilityPct: uptime + down > 0 ? (uptime / (uptime + down)) * 100 : 100,
      mtbf: failures > 0 ? uptime / 60 / failures : null,
      mttr: mttrs.length ? mttrs.reduce((s, v) => s + v, 0) / mttrs.length : null,
      failures, downtime: down, uptime,
    }
  }, [reliability])

  /** Downtime by category of failure, and by asset. */
  const downtime = useMemo(() => {
    const inWindow = breakdowns.filter((b) => b.status !== 'CANCELLED' && b.downtimeStart.slice(0, 10) >= from && b.downtimeStart.slice(0, 10) <= today)
    const minutesOf = (b: (typeof inWindow)[number]) =>
      minutesBetween(b.downtimeStart, b.downtimeEnd ?? new Date().toISOString())

    const byCategory = Object.keys(BREAKDOWN_CATEGORY_LABEL)
      .map((c) => {
        const of = inWindow.filter((b) => (b.causeCategory ?? b.category) === c)
        return { name: BREAKDOWN_CATEGORY_LABEL[c], count: of.length, minutes: of.reduce((s, b) => s + minutesOf(b), 0) }
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.minutes - a.minutes)

    const byAsset = reliability
      .filter((r) => r.downtimeMinutes > 0)
      .map((r) => ({ ...r, name: r.assetName.length > 22 ? `${r.assetName.slice(0, 21)}…` : r.assetName }))
      .sort((a, b) => b.downtimeMinutes - a.downtimeMinutes)

    const total = inWindow.reduce((s, b) => s + minutesOf(b), 0)
    // Pareto: how few assets carry most of the loss.
    let running = 0
    const pareto = byAsset.map((r) => {
      running += r.downtimeMinutes
      return { ...r, cumulativePct: total > 0 ? (running / total) * 100 : 0 }
    })

    return { byCategory, byAsset, pareto, total, count: inWindow.length }
  }, [breakdowns, reliability, from, today])

  /** Whole-life cost per asset: what it cost to buy against what it has cost to keep. */
  const lifecycle = useMemo(
    () =>
      machines
        .map((a) => {
          const mine = workOrders.filter((w) => w.assetCode === a.code && w.status !== 'CANCELLED')
          const spend = mine.reduce((s, w) => s + woCost(w).total, 0)
          const ageYears = daysBetween(a.installedOn, today) / 365.25
          const rel = reliability.find((r) => r.assetCode === a.code)
          return {
            asset: a,
            jobs: mine.length,
            spend,
            ageYears,
            annualised: ageYears > 0 ? spend / ageYears : 0,
            spendPctOfCost: a.purchaseCost > 0 ? (spend / a.purchaseCost) * 100 : 0,
            lifeUsedPct: a.expectedLifeYears > 0 ? (ageYears / a.expectedLifeYears) * 100 : 0,
            availability: rel?.availabilityPct ?? 100,
            failures: rel?.failures ?? 0,
          }
        })
        .filter((r) => r.asset.purchaseCost > 0)
        .sort((a, b) => b.spend - a.spend),
    [machines, workOrders, reliability, today],
  )

  const spares = useMemo(
    () => m.spares.rows.filter((p) => !p.deletedAt).map((p) => spareStatus(p, m.spareTxns.rows)),
    [m.spares.rows, m.spareTxns.rows],
  )

  const technicians = useMemo(
    () => m.technicians.rows.filter((t) => !t.deletedAt).map((t) => technicianLoad(t, workOrders)),
    [m.technicians.rows, workOrders],
  )

  /* ── export ─────────────────────────────────────────────────── */

  function exportCurrent(format: ExportFormat) {
    let n = 0
    if (tab === 'reliability') {
      const cols: ExportColumn<(typeof reliability)[number]>[] = [
        { header: 'Asset code', value: (r) => r.assetCode },
        { header: 'Asset', value: (r) => r.assetName },
        { header: 'Criticality', value: (r) => r.criticality },
        { header: 'Failures', value: (r) => r.failures },
        { header: 'Downtime minutes', value: (r) => r.downtimeMinutes },
        { header: 'MTBF hours', value: (r) => r.mtbfHours ?? '' },
        { header: 'MTTR hours', value: (r) => r.mttrHours ?? '' },
        { header: 'Availability %', value: (r) => r.availabilityPct.toFixed(2) },
      ]
      n = exportRows(format, 'reliability', `Reliability — last ${windowDays} days`, cols, reliability)
    } else if (tab === 'downtime') {
      const cols: ExportColumn<(typeof downtime.pareto)[number]>[] = [
        { header: 'Asset code', value: (r) => r.assetCode },
        { header: 'Asset', value: (r) => r.assetName },
        { header: 'Failures', value: (r) => r.failures },
        { header: 'Downtime minutes', value: (r) => r.downtimeMinutes },
        { header: 'Cumulative %', value: (r) => r.cumulativePct.toFixed(2) },
      ]
      n = exportRows(format, 'downtime-analysis', `Downtime analysis — last ${windowDays} days`, cols, downtime.pareto)
    } else if (tab === 'cost') {
      const cols: ExportColumn<(typeof cost.byAsset)[number]>[] = [
        { header: 'Asset code', value: (r) => r.assetCode },
        { header: 'Asset', value: (r) => r.assetName },
        { header: 'Work orders', value: (r) => r.count },
        { header: 'Cost', value: (r) => Math.round(r.value) },
      ]
      n = exportRows(format, 'maintenance-cost', `Maintenance cost — last ${windowDays} days`, cols, cost.byAsset)
    } else if (tab === 'lifecycle') {
      const cols: ExportColumn<(typeof lifecycle)[number]>[] = [
        { header: 'Asset code', value: (r) => r.asset.code },
        { header: 'Asset', value: (r) => r.asset.name },
        { header: 'Purchase cost', value: (r) => r.asset.purchaseCost },
        { header: 'Age years', value: (r) => r.ageYears.toFixed(1) },
        { header: 'Life used %', value: (r) => r.lifeUsedPct.toFixed(1) },
        { header: 'Maintenance spend', value: (r) => Math.round(r.spend) },
        { header: 'Annualised spend', value: (r) => Math.round(r.annualised) },
        { header: 'Spend as % of cost', value: (r) => r.spendPctOfCost.toFixed(2) },
        { header: 'Availability %', value: (r) => r.availability.toFixed(2) },
      ]
      n = exportRows(format, 'asset-lifecycle-cost', 'Asset life-cycle cost', cols, lifecycle)
    } else if (tab === 'spares') {
      const cols: ExportColumn<(typeof spares)[number]>[] = [
        { header: 'Part code', value: (r) => r.part.itemCode },
        { header: 'Part', value: (r) => r.part.itemName },
        { header: 'Critical', value: (r) => (r.part.isCritical ? 'Yes' : 'No') },
        { header: 'On hand', value: (r) => r.part.onHand },
        { header: 'Reserved', value: (r) => r.part.reserved },
        { header: 'Available', value: (r) => r.available },
        { header: 'Minimum', value: (r) => r.part.minStock },
        { header: 'Suggested order', value: (r) => r.suggestedOrder },
        { header: 'Risk', value: (r) => r.stockoutRisk },
      ]
      n = exportRows(format, 'spare-parts', 'Spare parts position', cols, spares)
    } else {
      const cols: ExportColumn<(typeof workOrders)[number]>[] = [
        { header: 'Work order', value: (w) => w.docNo },
        { header: 'Type', value: (w) => WO_TYPE_LABEL[w.woType] },
        { header: 'Asset', value: (w) => w.assetName },
        { header: 'Planned finish', value: (w) => w.plannedFinish },
        { header: 'Actual finish', value: (w) => w.actualFinish?.slice(0, 10) ?? '' },
        { header: 'On time', value: (w) => (w.actualFinish && w.actualFinish.slice(0, 10) <= w.plannedFinish ? 'Yes' : w.actualFinish ? 'No' : '') },
        { header: 'Status', value: (w) => w.status },
      ]
      const pms = workOrders.filter((w) => w.woType === 'PREVENTIVE' && w.plannedFinish >= from && w.plannedFinish <= today)
      n = exportRows(format, 'pm-compliance', `PM compliance — last ${windowDays} days`, cols, pms)
    }
    toast.success('Export ready', `${n} rows written.`)
  }

  const costMix = [
    { name: 'Labour', value: cost.labour },
    { name: 'Spares', value: cost.spares },
    { name: 'External services', value: cost.external },
  ].filter((x) => x.value > 0)

  return (
    <div>
      <PageHeader
        title="Maintenance reports"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Maintenance', to: '/maintenance' }, { label: 'Reports' }]}
        actions={
          <>
            <Select value={String(windowDays)} onChange={(e) => setWindowDays(Number(e.target.value))} className="w-36" aria-label="Reporting window">
              {WINDOWS.map((d) => (<option key={d} value={d}>Last {d} days</option>))}
            </Select>
            <Button variant="outline" size="sm" icon={<Download />} onClick={() => exportCurrent('xlsx')}>Excel</Button>
            <Button variant="outline" size="sm" icon={<FileText />} onClick={() => exportCurrent('pdf')}>PDF</Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={(v) => setTab(v as Tab)}
            tabs={[
              { id: 'reliability', label: 'MTBF & MTTR' },
              { id: 'downtime', label: 'Downtime' },
              { id: 'cost', label: 'Cost' },
              { id: 'compliance', label: 'PM compliance' },
              { id: 'lifecycle', label: 'Life-cycle cost' },
              { id: 'spares', label: 'Spares' },
            ]}
          />
        }
      />

      {/* ─────────────────── Reliability ─────────────────── */}
      {tab === 'reliability' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Fleet availability" value={`${fleet.availabilityPct.toFixed(2)}%`} sub={`${duration(fleet.downtime)} down of ${duration(fleet.uptime + fleet.downtime)}`} tone={fleet.availabilityPct >= 98 ? 'success' : 'warning'} />
            <StatTile label="MTBF" value={fleet.mtbf === null ? '—' : `${Math.round(fleet.mtbf)} h`} sub={`Uptime ÷ ${fleet.failures} failures`} tone={fleet.mtbf !== null && fleet.mtbf > 500 ? 'success' : 'warning'} />
            <StatTile label="MTTR" value={fleet.mttr === null ? '—' : `${fleet.mttr.toFixed(1)} h`} sub="Mean over repairs that finished" tone={fleet.mttr !== null && fleet.mttr < 4 ? 'success' : 'warning'} />
            <StatTile label="Failures" value={fleet.failures} sub={`Across ${machines.length} assets in ${windowDays} days`} tone={fleet.failures > 8 ? 'warning' : 'brand'} />
          </div>

          <Alert tone="info" title="How these are calculated" className="mb-4">
            MTBF is <strong>uptime</strong> divided by the number of failures, not calendar time divided by failures — an asset that ran 400 hours and was down 100 has a mean time
            <em> between</em> failures of 400/n. Availability then falls out as uptime over total time, which is the same as MTBF ÷ (MTBF + MTTR), so the two can never disagree.
            MTTR counts only repairs that finished; an open breakdown accrues downtime but has no repair time yet.
          </Alert>

          <Card className="mb-4">
            <CardHeader title="Reliability trend" description="Six months — downtime falling while MTBF rises is the programme working" />
            <CardBody className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={maintenanceTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={46} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  <Bar yAxisId="l" dataKey="downtimeHours" name="Downtime (h)" fill="#ef4444" maxBarSize={26} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="r" type="monotone" dataKey="mtbfHours" name="MTBF (h)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="l" type="monotone" dataKey="mttrHours" name="MTTR (h)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '20rem' }}>Asset</th>
                      <th style={{ width: '8rem' }}>Class</th>
                      <th className="text-right" style={{ width: '9rem' }}>Failures</th>
                      <th className="text-right" style={{ width: '11rem' }}>Downtime</th>
                      <th className="text-right" style={{ width: '11rem' }}>MTBF</th>
                      <th className="text-right" style={{ width: '11rem' }}>MTTR</th>
                      <th style={{ width: '14rem' }}>Availability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reliability.map((r) => (
                      <tr key={r.assetCode} className={r.availabilityPct < 97 ? 'bg-danger/5' : undefined}>
                        <td><p className="truncate text-xs text-fg">{r.assetName}</p><p className="font-mono text-2xs text-fg-subtle">{r.assetCode}</p></td>
                        <td><CriticalityBadge criticality={r.criticality as 'A' | 'B' | 'C'} /></td>
                        <td className="text-right text-xs tabular text-fg">{r.failures || '—'}</td>
                        <td className="text-right text-xs tabular text-fg">{r.downtimeMinutes ? duration(r.downtimeMinutes) : '—'}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{r.mtbfHours === null ? 'No failures' : hours(r.mtbfHours)}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{r.mttrHours === null ? '—' : hours(r.mttrHours)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={r.availabilityPct} tone={r.availabilityPct >= 98 ? 'success' : r.availabilityPct >= 95 ? 'warning' : 'danger'} className="w-16" />
                            <span className={cn('text-2xs tabular', r.availabilityPct >= 98 ? 'text-success' : r.availabilityPct >= 95 ? 'text-warning' : 'text-danger')}>{r.availabilityPct.toFixed(2)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-surface-2">
                      <td className="text-xs font-semibold text-fg">Fleet</td>
                      <td />
                      <td className="text-right text-xs font-semibold tabular text-fg">{fleet.failures}</td>
                      <td className="text-right text-xs font-semibold tabular text-fg">{duration(fleet.downtime)}</td>
                      <td className="text-right text-xs font-semibold tabular text-fg">{fleet.mtbf === null ? '—' : hours(Math.round(fleet.mtbf))}</td>
                      <td className="text-right text-xs font-semibold tabular text-fg">{fleet.mttr === null ? '—' : hours(Math.round(fleet.mttr * 10) / 10)}</td>
                      <td className="text-xs font-semibold tabular text-fg">{fleet.availabilityPct.toFixed(2)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {/* ─────────────────── Downtime ─────────────────── */}
      {tab === 'downtime' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total downtime" value={duration(downtime.total)} sub={`${downtime.count} failures in ${windowDays} days`} tone={downtime.total > 2000 ? 'danger' : 'warning'} />
            <StatTile label="Worst asset" value={downtime.byAsset[0]?.assetName.slice(0, 18) ?? '—'} sub={downtime.byAsset[0] ? `${duration(downtime.byAsset[0].downtimeMinutes)} across ${downtime.byAsset[0].failures} failures` : 'No downtime'} tone="danger" />
            <StatTile label="Worst cause" value={downtime.byCategory[0]?.name ?? '—'} sub={downtime.byCategory[0] ? `${duration(downtime.byCategory[0].minutes)} · ${downtime.byCategory[0].count} failures` : 'None'} tone="warning" />
            <StatTile
              label="Vital few"
              value={downtime.pareto.filter((r) => r.cumulativePct <= 80).length || (downtime.pareto.length ? 1 : 0)}
              sub={`assets carry the first 80% of the loss, of ${downtime.byAsset.length} that failed`}
              tone="brand"
            />
          </div>

          {downtime.byAsset.length === 0 ? (
            <Alert tone="tip" title="No downtime in the window">Nothing has stopped in the last {windowDays} days.</Alert>
          ) : (
            <>
              <div className="mb-4 grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader title="Downtime by asset" description="Bars are minutes lost, the line is the running cumulative — the few assets left of 80% are where the effort belongs" />
                  <CardBody className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={downtime.pareto} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={56} />
                        <YAxis yAxisId="l" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={46} />
                        <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={42} />
                        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                        <Bar yAxisId="l" dataKey="downtimeMinutes" name="Minutes" maxBarSize={28} radius={[3, 3, 0, 0]}>
                          {downtime.pareto.map((r, i) => (<Cell key={i} fill={r.cumulativePct <= 80 ? '#ef4444' : '#cbd5e1'} />))}
                        </Bar>
                        <Line yAxisId="r" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="By cause" description="Where failures come from" />
                  <CardBody className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={downtime.byCategory} dataKey="minutes" nameKey="name" innerRadius={40} outerRadius={68} paddingAngle={2}>
                          {downtime.byCategory.map((_, i) => (<Cell key={i} fill={['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#64748b', '#0ea5e9', '#a855f7'][i % 8]} />))}
                        </Pie>
                        <Tooltip content={<ChartTip suffix=" min" />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} iconSize={7} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardBody className="p-0">
                  <div className="overflow-x-auto">
                    <table className="grid-table">
                      <thead><tr><th style={{ width: '22rem' }}>Asset</th><th style={{ width: '8rem' }}>Class</th><th className="text-right" style={{ width: '9rem' }}>Failures</th><th className="text-right" style={{ width: '11rem' }}>Downtime</th><th className="text-right" style={{ width: '11rem' }}>Share</th><th style={{ width: '14rem' }}>Cumulative</th></tr></thead>
                      <tbody>
                        {downtime.pareto.map((r) => (
                          <tr key={r.assetCode} className={r.cumulativePct <= 80 ? 'bg-danger/5' : undefined}>
                            <td>
                              <p className="truncate text-xs text-fg">{r.assetName}</p>
                              {r.cumulativePct <= 80 && <p className="text-3xs text-danger">Vital few — worth a plan change</p>}
                            </td>
                            <td><CriticalityBadge criticality={r.criticality as 'A' | 'B' | 'C'} /></td>
                            <td className="text-right text-xs tabular text-fg">{r.failures}</td>
                            <td className="text-right text-xs tabular text-fg">{duration(r.downtimeMinutes)}</td>
                            <td className="text-right text-xs tabular text-fg-muted">{downtime.total > 0 ? `${((r.downtimeMinutes / downtime.total) * 100).toFixed(1)}%` : '—'}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <ProgressBar value={r.cumulativePct} tone={r.cumulativePct <= 80 ? 'danger' : 'brand'} className="w-16" />
                                <span className="text-2xs tabular text-fg-muted">{r.cumulativePct.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            </>
          )}
        </>
      )}

      {/* ─────────────────── Cost ─────────────────── */}
      {tab === 'cost' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total spend" value={`₹${inrCompact(cost.total)}`} sub={`${cost.byAsset.reduce((s, a) => s + a.count, 0)} work orders in ${windowDays} days`} tone="brand" />
            <StatTile label="Labour" value={`₹${inrCompact(cost.labour)}`} sub={`${cost.total > 0 ? ((cost.labour / cost.total) * 100).toFixed(0) : 0}% of the total`} tone="progress" />
            <StatTile label="Spares" value={`₹${inrCompact(cost.spares)}`} sub={`${cost.total > 0 ? ((cost.spares / cost.total) * 100).toFixed(0) : 0}% of the total`} tone="warning" />
            <StatTile label="Preventive share" value={`${ratio.preventiveSharePct.toFixed(0)}%`} sub={`${inr(ratio.preventiveCost)} planned against ${inr(ratio.reactiveCost)} reactive`} tone={ratio.preventiveSharePct >= 60 ? 'success' : 'danger'} />
          </div>

          <Alert tone={ratio.preventiveSharePct >= 60 ? 'tip' : 'warning'} title="Preventive against reactive" className="mb-4">
            {ratio.preventiveSharePct.toFixed(0)}% of spend was planned work ({ratio.preventiveJobs} jobs) against {(100 - ratio.preventiveSharePct).toFixed(0)}% reactive ({ratio.reactiveJobs} jobs).
            {ratio.preventiveSharePct < 50
              ? ' More is being spent putting things right than keeping them right. One large failure can do this to the ratio in a single month — check whether it is a trend before reorganising the department around it.'
              : ' Money moving from breakdown to preventive is the programme working.'}
          </Alert>

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Spend by asset" description="Ten highest" />
              <CardBody className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cost.byAsset.slice(0, 10).map((a) => ({ name: a.assetName.length > 20 ? `${a.assetName.slice(0, 19)}…` : a.assetName, value: a.value }))} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => inrCompact(v as number)} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={130} />
                    <Tooltip content={<ChartTip prefix="₹" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                    <Bar dataKey="value" name="Spend" fill="#3b82f6" maxBarSize={18} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Cost mix" />
              <CardBody className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={costMix} dataKey="value" nameKey="name" innerRadius={40} outerRadius={68} paddingAngle={2}>
                      {costMix.map((_, i) => (<Cell key={i} fill={['#3b82f6', '#f59e0b', '#8b5cf6'][i % 3]} />))}
                    </Pie>
                    <Tooltip content={<ChartTip prefix="₹" />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} iconSize={7} />
                  </PieChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          </div>

          <Section title="By work order type">
            <Card>
              <CardBody className="p-0">
                <table className="grid-table">
                  <thead><tr><th>Type</th><th className="text-right" style={{ width: '9rem' }}>Jobs</th><th className="text-right" style={{ width: '13rem' }}>Cost</th><th className="text-right" style={{ width: '11rem' }}>Average</th><th style={{ width: '14rem' }}>Share</th></tr></thead>
                  <tbody>
                    {cost.byType.map((t) => (
                      <tr key={t.woType}>
                        <td><WoTypeBadge woType={t.woType} /></td>
                        <td className="text-right text-xs tabular text-fg">{t.count}</td>
                        <td className="text-right text-xs tabular text-fg">{inr(t.value)}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{inr(t.value / Math.max(1, t.count))}</td>
                        <td><ProgressBar value={cost.total > 0 ? (t.value / cost.total) * 100 : 0} tone={t.woType === 'BREAKDOWN' ? 'danger' : t.woType === 'PREVENTIVE' ? 'success' : 'brand'} className="w-24" /></td>
                      </tr>
                    ))}
                    <tr className="bg-surface-2">
                      <td className="text-xs font-semibold text-fg">Total</td>
                      <td className="text-right text-xs font-semibold tabular text-fg">{cost.byType.reduce((s, t) => s + t.count, 0)}</td>
                      <td className="text-right text-xs font-semibold tabular text-fg">{inr(cost.total)}</td>
                      <td /><td />
                    </tr>
                  </tbody>
                </table>
              </CardBody>
            </Card>
          </Section>
        </>
      )}

      {/* ─────────────────── Compliance ─────────────────── */}
      {tab === 'compliance' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Compliance" value={`${compliance.compliancePct.toFixed(1)}%`} sub={`${compliance.onTime} done by the date due, of ${compliance.due}`} tone={compliance.compliancePct >= 90 ? 'success' : compliance.compliancePct >= 75 ? 'warning' : 'danger'} />
            <StatTile label="Completion" value={`${compliance.completionPct.toFixed(1)}%`} sub={`${compliance.completed} done at all`} tone={compliance.completionPct >= 90 ? 'success' : 'warning'} />
            <StatTile label="Done late" value={compliance.late} sub={compliance.late ? 'The machines were unprotected in between' : 'Nothing ran past its date'} tone={compliance.late ? 'warning' : 'success'} />
            <StatTile label="Not done at all" value={compliance.due - compliance.completed} sub="Fell due in the window and never happened" tone={compliance.due - compliance.completed ? 'danger' : 'success'} />
          </div>

          <Alert tone="info" title="Compliance is not completion" className="mb-4">
            Compliance counts work finished <strong>by the date it was due</strong>. A plant that does every job a month late scores 100% completion and 0% compliance —
            and only the second number tells you the machines were running unprotected in between. Both are shown so the gap is visible.
          </Alert>

          <Card className="mb-4">
            <CardHeader title="Compliance trend" description="Six months" />
            <CardBody className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={maintenanceTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[60, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTip suffix="%" />} />
                  <Line type="monotone" dataKey="pmCompliancePct" name="PM compliance" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead><tr><th style={{ width: '13rem' }}>Work order</th><th>Plan / asset</th><th style={{ width: '10rem' }}>Planned finish</th><th style={{ width: '10rem' }}>Actual finish</th><th style={{ width: '9rem' }}>Days late</th><th style={{ width: '10rem' }}>Verdict</th></tr></thead>
                  <tbody>
                    {workOrders
                      .filter((w) => w.woType === 'PREVENTIVE' && w.status !== 'CANCELLED' && w.plannedFinish >= from && w.plannedFinish <= today)
                      .sort((a, b) => a.plannedFinish.localeCompare(b.plannedFinish))
                      .map((w) => {
                        const finished = w.actualFinish?.slice(0, 10) ?? null
                        const late = finished ? daysBetween(w.plannedFinish, finished) : daysBetween(w.plannedFinish, today)
                        const onTime = finished && finished <= w.plannedFinish
                        return (
                          <tr key={w.uid} className={!finished ? 'bg-danger/5' : onTime ? undefined : 'bg-warning/5'}>
                            <td className="font-mono text-2xs text-fg">{w.docNo}</td>
                            <td><p className="truncate text-xs text-fg">{w.title}</p><p className="font-mono text-3xs text-fg-subtle">{w.sourceDocNo} · {w.assetCode}</p></td>
                            <td className="text-2xs tabular text-fg-muted">{formatDate(w.plannedFinish)}</td>
                            <td className="text-2xs tabular text-fg-muted">{finished ? formatDate(finished) : '—'}</td>
                            <td className={cn('text-2xs tabular', late > 0 ? 'text-danger' : 'text-success')}>{late > 0 ? `${late}` : '—'}</td>
                            <td>
                              {!finished ? <Badge tone="danger" size="sm">Not done</Badge>
                                : onTime ? <Badge tone="success" size="sm">On time</Badge>
                                : <Badge tone="warning" size="sm">Late</Badge>}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Section title="Technician productivity" className="mt-4">
            <Card>
              <CardBody className="p-0">
                <table className="grid-table">
                  <thead><tr><th style={{ width: '18rem' }}>Technician</th><th className="text-right" style={{ width: '9rem' }}>Jobs done</th><th className="text-right" style={{ width: '11rem' }}>Hours</th><th className="text-right" style={{ width: '11rem' }}>Avg per job</th><th style={{ width: '14rem' }}>First-time fix</th></tr></thead>
                  <tbody>
                    {technicians.map((t) => (
                      <tr key={t.technician.uid}>
                        <td><p className="text-xs text-fg">{t.technician.name}</p><p className="font-mono text-2xs text-fg-subtle">{t.technician.code} · {t.technician.trade.toLowerCase()}</p></td>
                        <td className="text-right text-xs tabular text-fg">{t.jobsCompleted || '—'}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{t.completedHours || '—'}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{t.avgRepairHours === null ? '—' : hours(t.avgRepairHours)}</td>
                        <td>
                          {t.firstTimeFixPct === null ? <span className="text-2xs text-fg-subtle">No closed jobs</span> : (
                            <div className="flex items-center gap-2">
                              <ProgressBar value={t.firstTimeFixPct} tone={t.firstTimeFixPct >= 90 ? 'success' : 'warning'} className="w-14" />
                              <span className="text-2xs tabular text-fg-muted">{t.firstTimeFixPct}%</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          </Section>
        </>
      )}

      {/* ─────────────────── Life-cycle cost ─────────────────── */}
      {tab === 'lifecycle' && (
        <>
          <Alert tone="info" title="When to stop repairing and start replacing" className="mb-4">
            Maintenance spend as a share of purchase cost, set against how much of the expected life has been used. An asset that has consumed 30% of its purchase price in repairs
            and is only halfway through its life is telling you something the availability figure will not.
          </Alert>

          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '20rem' }}>Asset</th>
                      <th className="text-right" style={{ width: '12rem' }}>Purchase cost</th>
                      <th style={{ width: '13rem' }}>Life used</th>
                      <th className="text-right" style={{ width: '9rem' }}>Jobs</th>
                      <th className="text-right" style={{ width: '12rem' }}>Spend</th>
                      <th className="text-right" style={{ width: '12rem' }}>Per year</th>
                      <th style={{ width: '13rem' }}>Spend vs cost</th>
                      <th className="text-right" style={{ width: '11rem' }}>Availability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lifecycle.map((r) => (
                      <tr key={r.asset.uid} className={r.spendPctOfCost > 25 ? 'bg-warning/5' : undefined}>
                        <td>
                          <p className="truncate text-xs text-fg">{r.asset.name}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{r.asset.code} · {ASSET_CATEGORY_LABEL[r.asset.category]}</p>
                        </td>
                        <td className="text-right text-xs tabular text-fg">{inr(r.asset.purchaseCost)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={Math.min(100, r.lifeUsedPct)} tone={r.lifeUsedPct > 85 ? 'danger' : r.lifeUsedPct > 60 ? 'warning' : 'success'} className="w-14" />
                            <span className="text-2xs tabular text-fg-muted">{r.ageYears.toFixed(1)}/{r.asset.expectedLifeYears} y</span>
                          </div>
                        </td>
                        <td className="text-right text-xs tabular text-fg-muted">{r.jobs || '—'}</td>
                        <td className="text-right text-xs tabular text-fg">{r.spend ? inr(r.spend) : '—'}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{r.annualised ? inr(r.annualised) : '—'}</td>
                        <td>
                          {r.spendPctOfCost > 0 ? (
                            <div className="flex items-center gap-2">
                              <ProgressBar value={Math.min(100, r.spendPctOfCost)} tone={r.spendPctOfCost > 25 ? 'danger' : r.spendPctOfCost > 10 ? 'warning' : 'success'} className="w-14" />
                              <span className={cn('text-2xs tabular', r.spendPctOfCost > 25 ? 'text-danger' : 'text-fg-muted')}>{r.spendPctOfCost.toFixed(1)}%</span>
                            </div>
                          ) : <span className="text-2xs text-fg-subtle">—</span>}
                        </td>
                        <td className={cn('text-right text-xs tabular', r.availability >= 98 ? 'text-success' : 'text-warning')}>{r.availability.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {lifecycle.some((r) => r.spendPctOfCost > 25) && (
            <Alert tone="warning" title="Worth a replace-or-repair decision" className="mt-4">
              {lifecycle.filter((r) => r.spendPctOfCost > 25).map((r) => `${r.asset.name} — ${r.spendPctOfCost.toFixed(0)}% of its purchase cost spent on repairs, ${r.lifeUsedPct.toFixed(0)}% of life used`).join(' · ')}.
            </Alert>
          )}
        </>
      )}

      {/* ─────────────────── Spares ─────────────────── */}
      {tab === 'spares' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Stock value" value={`₹${inrCompact(spares.reduce((s, x) => s + x.part.onHand * x.part.rate, 0))}`} sub={`${spares.length} parts on the register`} tone="brand" />
            <StatTile label="Below minimum" value={spares.filter((s) => s.belowMin).length} sub={`${spares.filter((s) => s.stockoutRisk === 'URGENT').length} urgent`} tone={spares.filter((s) => s.belowMin).length ? 'warning' : 'success'} />
            <StatTile label="Critical spares" value={spares.filter((s) => s.part.isCritical).length} sub={`${spares.filter((s) => s.part.isCritical && s.belowMin).length} of them short`} tone={spares.filter((s) => s.part.isCritical && s.belowMin).length ? 'danger' : 'success'} />
            <StatTile label="Consumed in window" value={`₹${inrCompact(cost.spares)}`} sub="Spares issued to work orders" tone="progress" />
          </div>

          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th style={{ width: '20rem' }}>Part</th>
                      <th className="text-right" style={{ width: '9rem' }}>On hand</th>
                      <th className="text-right" style={{ width: '9rem' }}>Reserved</th>
                      <th className="text-right" style={{ width: '9rem' }}>Available</th>
                      <th className="text-right" style={{ width: '9rem' }}>Minimum</th>
                      <th className="text-right" style={{ width: '11rem' }}>Days of cover</th>
                      <th className="text-right" style={{ width: '10rem' }}>Lead time</th>
                      <th className="text-right" style={{ width: '10rem' }}>To order</th>
                      <th style={{ width: '9rem' }}>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spares.sort((a, b) => (a.stockoutRisk === b.stockoutRisk ? a.available - b.available : a.stockoutRisk === 'URGENT' ? -1 : 1)).map((s) => (
                      <tr key={s.part.uid} className={s.stockoutRisk === 'URGENT' ? 'bg-danger/5' : s.belowMin ? 'bg-warning/5' : undefined}>
                        <td>
                          <p className="truncate text-xs text-fg">{s.part.itemName}{s.part.isCritical && <span className="ml-1.5 text-danger">•</span>}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{s.part.itemCode}</p>
                        </td>
                        <td className="text-right text-xs tabular text-fg">{s.part.onHand}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{s.part.reserved || '—'}</td>
                        <td className={cn('text-right text-xs font-medium tabular', s.available <= 0 ? 'text-danger' : s.belowMin ? 'text-warning' : 'text-fg')}>{s.available}</td>
                        <td className="text-right text-xs tabular text-fg-muted">{s.part.minStock}</td>
                        <td className={cn('text-right text-xs tabular', s.daysOfCover !== null && s.daysOfCover < s.part.leadTimeDays ? 'text-danger' : 'text-fg-muted')}>
                          {s.daysOfCover === null ? 'No usage' : `${s.daysOfCover} d`}
                        </td>
                        <td className="text-right text-xs tabular text-fg-muted">{s.part.leadTimeDays} d</td>
                        <td className="text-right text-xs tabular text-fg">{s.suggestedOrder || '—'}</td>
                        <td>
                          {s.stockoutRisk === 'URGENT' ? <Badge tone="danger" size="sm">Urgent</Badge>
                            : s.stockoutRisk === 'WATCH' ? <Badge tone="warning" size="sm">Watch</Badge>
                            : <Badge tone="success" size="sm">Fine</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <p className="mt-2 text-2xs text-fg-subtle">
            Days of cover is available stock divided by the observed consumption rate. Where it is shorter than the lead time, the part will run out before a replacement can land —
            which is the definition of urgent regardless of what the minimum says.
          </p>
        </>
      )}
    </div>
  )
}
