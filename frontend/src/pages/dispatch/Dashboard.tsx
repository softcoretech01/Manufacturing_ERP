import { useMemo } from 'react'
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
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import {
  DispatchChartTip,
  DispatchStatusBadge,
  PctChip,
  regionColour,
  useCanSeeFreight,
} from '@/components/dispatch/DispatchShell'
import { formatCurrency, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useEffect, useState } from 'react'
import { packingOrderApi } from '@/api/packingOrder'
import { cartonApi } from '@/api/cartonApi'
import { palletApi } from '@/api/palletApi'
import { dispatchPlanApi } from '@/api/dispatchPlanApi'
import { loadingSheetApi } from '@/api/loadingSheetApi'
import { shipmentApi } from '@/api/shipmentApi'
import { podApi } from '@/api/podApi'
import { salesReturnApi } from '@/api/salesReturnApi'
import { freightApi } from '@/api/freightApi'
import { exportShipmentApi } from '@/api/exportShipmentApi'
import { vehicleApi } from '@/api/vehicleApi'
import { dispatchDashboardApi } from '@/api/dispatchDashboardApi'
import type {
  Carton,
  DispatchPlan,
  ExportShipment,
  FreightCharge,
  LoadingSheet,
  PackingOrder,
  Pallet,
  Pod,
  SalesReturn,
  Shipment,
  Vehicle,
} from '@/types/dispatch'

/**
 * Packing and dispatch dashboard — the four questions a dispatch manager asks
 * every morning, in order: what is ready to go, what is stuck, what is on the
 * road, and what has come back.
 */
export function DispatchDashboardPage() {
  const canSeeValue = useCanSeeFreight()

  const [packing, setPacking] = useState<PackingOrder[]>([])
  const [cartons, setCartons] = useState<Carton[]>([])
  const [pallets, setPallets] = useState<Pallet[]>([])
  const [plans, setPlans] = useState<DispatchPlan[]>([])
  const [sheets, setSheets] = useState<LoadingSheet[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [pods, setPods] = useState<Pod[]>([])
  const [returns, setReturns] = useState<SalesReturn[]>([])
  const [freight, setFreight] = useState<FreightCharge[]>([])
  const [exports, setExports] = useState<ExportShipment[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  
  const [analytics, setAnalytics] = useState<any>({
    dispatchTrend: [],
    regionDispatch: [],
    transporterScores: [],
  })

  useEffect(() => {
    packingOrderApi.getAll().then(setPacking).catch(console.error)
    cartonApi.getAll().then(setCartons).catch(console.error)
    palletApi.getAll().then(setPallets).catch(console.error)
    dispatchPlanApi.getAll().then(setPlans).catch(console.error)
    loadingSheetApi.getAll().then(setSheets).catch(console.error)
    shipmentApi.getAll().then(setShipments).catch(console.error)
    podApi.getAll().then(setPods).catch(console.error)
    salesReturnApi.getAll().then(setReturns).catch(console.error)
    freightApi.getAll().then(setFreight).catch(console.error)
    exportShipmentApi.getAll().then(setExports).catch(console.error)
    vehicleApi.getAll().then(setVehicles).catch(console.error)
    dispatchDashboardApi.getAnalytics().then(setAnalytics).catch(console.error)
  }, [])
  
  const { dispatchTrend, regionDispatch, transporterScores } = analytics


  /* ── The numbers ─────────────────────────────────────────────────────── */
  const readyToPack = packing.filter((p) => p.status === 'MATERIAL_READY' || p.status === 'PLANNED')
  const packed = packing.filter((p) => p.status === 'PACKED' || p.status === 'QC_VERIFIED' || p.status === 'READY_FOR_DISPATCH')
  const readyToDispatch = packing.filter((p) => p.status === 'READY_FOR_DISPATCH')
  const pendingDispatch = plans.filter((p) => p.status !== 'DISPATCHED' && p.status !== 'CANCELLED')
  const loadingNow = sheets.filter((l) => l.status === 'LOADING' || l.status === 'VERIFYING' || l.status === 'STAGED')
  const inTransit = shipments.filter((s) => s.status === 'IN_TRANSIT' || s.status === 'DISPATCHED')
  const delivered = shipments.filter((s) => s.status === 'DELIVERED' || s.status === 'CLOSED')
  const delayed = inTransit.filter((s) => !!s.delayReason || (s.etaAt ? new Date(s.etaAt).getTime() < Date.now() : false))
  const podPending = pods.filter((p) => p.status === 'PENDING')
  const openReturns = returns.filter((r) => r.status !== 'CLOSED' && r.status !== 'REJECTED')
  const liveContainers = exports.filter((e) => e.status !== 'DELIVERED')

  const deliveredOnTime = delivered.filter((s) => !s.etaAt || !s.deliveredAt || new Date(s.deliveredAt) <= new Date(s.etaAt))
  const onTimePct = delivered.length ? (deliveredOnTime.length / delivered.length) * 100 : 0

  const logisticsCost = freight.reduce((s, f) => s + f.amount, 0)
  const dispatchedValue = delivered.reduce((s, x) => s + x.invoiceValue, 0)
  const costPct = dispatchedValue ? (logisticsCost / dispatchedValue) * 100 : 0

  /** Packing accuracy — cartons that passed both the weight check and the label check. */
  const checkedCartons = cartons.filter((c) => c.status !== 'OPEN')
  const accurateCartons = checkedCartons.filter((c) => c.weightChecked && c.labelPrinted)
  const packingAccuracy = checkedCartons.length ? (accurateCartons.length / checkedCartons.length) * 100 : 100

  const availableVehicles = vehicles.filter((v) => v.state === 'AVAILABLE' && v.isActive)
  const palletsBuilding = pallets.filter((p) => p.status === 'BUILDING')

  /* ── Dispatch by customer, top five ──────────────────────────────────── */
  const byCustomer = useMemo(() => {
    const map = new Map<string, { cartons: number; value: number }>()
    for (const s of shipments) {
      const cur = map.get(s.customer) ?? { cartons: 0, value: 0 }
      map.set(s.customer, { cartons: cur.cartons + s.cartons, value: cur.value + s.invoiceValue })
    }
    return [...map.entries()]
      .map(([customer, v]) => ({ customer: customer.length > 22 ? `${customer.slice(0, 20)}…` : customer, ...v }))
      .sort((a, b) => b.cartons - a.cartons)
      .slice(0, 5)
  }, [shipments])

  return (
    <div>
      <PageHeader
        title="Packing & dispatch"
        description="What is ready to go, what is stuck, what is on the road, and what has come back"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch' }]}
      />

      {/* Headline strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/dispatch/packing-orders" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Ready to dispatch</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', readyToDispatch.length ? 'text-success' : 'text-fg')}>
            {readyToDispatch.length}
          </p>
          <p className="mt-1 text-2xs text-fg-muted">
            {packed.length} packed in all, {readyToPack.length} still to pack
          </p>
        </Link>

        <Link to="/dispatch/loading" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">At the loading bays</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', loadingNow.length ? 'text-progress' : 'text-fg')}>
            {loadingNow.length}
          </p>
          <p className="mt-1 text-2xs text-fg-muted">
            {pendingDispatch.length} plan{pendingDispatch.length === 1 ? '' : 's'} awaiting dispatch
          </p>
        </Link>

        <Link to="/dispatch/tracking" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">On the road</p>
          <p className="mt-1 text-2xl font-semibold tabular text-fg">{inTransit.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">
            {delayed.length ? (
              <span className="font-medium text-danger">{delayed.length} running late</span>
            ) : (
              'all on schedule'
            )}
            {' · '}
            {formatQty(inTransit.reduce((s, x) => s + x.cartons, 0))} cartons
          </p>
        </Link>

        <Link to="/dispatch/pod" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">On-time delivery</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular', onTimePct >= 95 ? 'text-success' : onTimePct >= 88 ? 'text-warning' : 'text-danger')}>
            {onTimePct.toFixed(0)}%
          </p>
          <p className="mt-1 text-2xs text-fg-muted">
            {delivered.length} delivered
            {podPending.length > 0 && <span className="text-warning"> · {podPending.length} POD outstanding</span>}
          </p>
        </Link>
      </div>

      {/* Second strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-3.5">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Packing accuracy</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={cn('text-xl font-semibold tabular', packingAccuracy >= 98 ? 'text-success' : 'text-warning')}>
              {packingAccuracy.toFixed(1)}%
            </p>
          </div>
          <ProgressBar value={packingAccuracy} tone={packingAccuracy >= 98 ? 'success' : 'warning'} className="mt-2" />
          <p className="mt-1 text-2xs text-fg-muted">
            cartons weighed and labelled — {checkedCartons.length - accurateCartons.length} still short of both
          </p>
        </div>

        <Link to="/dispatch/pallets" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Pallets & cartons</p>
          <p className="mt-1 text-xl font-semibold tabular text-fg">{pallets.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">
            {palletsBuilding.length} being built · {cartons.length} cartons on record
          </p>
        </Link>

        <Link to="/dispatch/exports" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">Export containers</p>
          <p className="mt-1 text-xl font-semibold tabular text-fg">{liveContainers.length}</p>
          <p className="mt-1 text-2xs text-fg-muted">
            {exports.filter((e) => e.status === 'SAILED').length} at sea ·{' '}
            {exports.filter((e) => e.customsStatus === 'NOT_FILED').length} not yet filed with customs
          </p>
        </Link>

        {canSeeValue ? (
          <Link to="/dispatch/freight" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Logistics cost</p>
            <p className="mt-1 text-xl font-semibold tabular text-fg">{formatCurrency(logisticsCost)}</p>
            <p className="mt-1 text-2xs text-fg-muted">
              {costPct.toFixed(1)}% of delivered value ·{' '}
              {freight.filter((f) => f.status === 'DISPUTED').length} charge
              {freight.filter((f) => f.status === 'DISPUTED').length === 1 ? '' : 's'} disputed
            </p>
          </Link>
        ) : (
          <Link to="/dispatch/returns" className="card p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
            <p className="text-2xs uppercase tracking-wide text-fg-subtle">Open returns</p>
            <p className={cn('mt-1 text-xl font-semibold tabular', openReturns.length ? 'text-warning' : 'text-success')}>
              {openReturns.length}
            </p>
            <p className="mt-1 text-2xs text-fg-muted">
              {returns.filter((r) => r.status === 'RECEIVED').length} back with us awaiting a decision
            </p>
          </Link>
        )}
      </div>

      {/* Needs attention */}
      {(delayed.length > 0 || podPending.length > 0 || readyToDispatch.length > 0) && (
        <Card className="mb-4">
          <CardHeader title="Needs attention today" description="Ordered by how much it costs to leave alone" />
          <CardBody className="space-y-2">
            {delayed.map((s) => (
              <Link
                key={s.uid || (s as any).id}
                to="/dispatch/tracking"
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-danger/30 bg-danger/5 p-2.5 hover:bg-danger/10"
              >
                <span className="text-xs text-fg">
                  <span className="font-mono font-medium">{s.docNo}</span> to {s.customer} is late —{' '}
                  {s.delayReason ?? 'no reason recorded'}
                </span>
                <Badge tone="danger" size="sm">late</Badge>
              </Link>
            ))}
            {podPending.slice(0, 3).map((p) => (
              <Link
                key={p.uid || (p as any).id}
                to="/dispatch/pod"
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-warning/30 bg-warning/5 p-2.5 hover:bg-warning/10"
              >
                <span className="text-xs text-fg">
                  <span className="font-mono font-medium">{p.shipmentNo}</span> delivered to {p.customer} but nothing signed —{' '}
                  the invoice cannot close
                </span>
                <Badge tone="warning" size="sm">POD due</Badge>
              </Link>
            ))}
            {readyToDispatch.map((p) => (
              <Link
                key={p.uid || (p as any).id}
                to="/dispatch/planning"
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-success/30 bg-success/5 p-2.5 hover:bg-success/10"
              >
                <span className="text-xs text-fg">
                  <span className="font-mono font-medium">{p.docNo}</span> — {formatQty(p.cartonsPacked)} cartons for {p.customer}{' '}
                  are ready and waiting for a vehicle
                </span>
                <Badge tone="success" size="sm">ready</Badge>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Trend + region */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Seven-day dispatch trend"
            description="Planned against what actually left, and what actually arrived"
          />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dispatchTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<DispatchChartTip suffix=" cartons" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                <Bar dataKey="dispatched" name="Dispatched" radius={[3, 3, 0, 0]} maxBarSize={28}>
                  {dispatchTrend.map((d, i) => (
                    <Cell key={i} fill={d.dispatched >= d.planned * 0.95 ? '#8b5cf6' : '#f59e0b'} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="planned" name="Planned" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="delivered" name="Delivered" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="By region" description="Volume and how reliably each is served" />
          <CardBody className="space-y-2.5">
            {regionDispatch.map((r) => (
              <div key={r.region}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-fg">
                    <span className="h-2 w-2 rounded-full" style={{ background: regionColour(r.region) }} />
                    {r.region}
                  </span>
                  <PctChip value={r.onTimePct} target={95} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(r.cartons / Math.max(...regionDispatch.map((x) => x.cartons))) * 100}%`,
                        background: regionColour(r.region),
                      }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-2xs tabular text-fg-muted">
                    {r.cartons.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            ))}
            <Link to="/dispatch/transporters" className="mt-1 block text-2xs font-medium text-brand-600 hover:underline">
              Route and transporter performance →
            </Link>
          </CardBody>
        </Card>
      </div>

      {/* Customer + transporter */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Dispatch by customer"
            description="Top five by carton volume"
            actions={<Link to="/dispatch/shipments" className="text-2xs font-medium text-brand-600 hover:underline">All shipments</Link>}
          />
          <CardBody className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCustomer} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="customer" width={130} tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<DispatchChartTip suffix=" cartons" />} cursor={{ fill: 'rgb(var(--surface-3))' }} />
                <Bar dataKey="cartons" name="Cartons" radius={[0, 3, 3, 0]} maxBarSize={18} fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Transporter performance"
            description="On-time against damage — both matter"
            actions={<Link to="/dispatch/transporters" className="text-2xs font-medium text-brand-600 hover:underline">Scorecard</Link>}
          />
          <CardBody className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={transporterScores} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="otFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="transporter" tick={{ fontSize: 9, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={44} />
                <YAxis domain={[70, 100]} tick={{ fontSize: 11, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={34} />
                <Tooltip content={<DispatchChartTip suffix="%" />} />
                <Area type="monotone" dataKey="onTimePct" name="On time" stroke="#10b981" strokeWidth={2} fill="url(#otFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Returns */}
      {openReturns.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="Open returns"
            description="Reverse logistics — goods coming back, and what is happening to them"
            actions={<Link to="/dispatch/returns" className="text-2xs font-medium text-brand-600 hover:underline">All returns</Link>}
          />
          <CardBody className="space-y-2">
            {openReturns.map((r) => (
              <div key={r.uid || (r as any).id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-fg">
                    {r.docNo} — {formatQty(r.quantity)} × {r.itemName}
                  </p>
                  <p className="truncate text-2xs text-fg-muted">
                    {r.customer} · {r.reason}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canSeeValue && <span className="text-2xs tabular text-fg-muted">{formatCurrency(r.value)}</span>}
                  <DispatchStatusBadge status={r.status} size="sm" />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader title="The chain this module manages" description="Each link hands the next one something it cannot get elsewhere" />
        <CardBody>
          <div className="flex flex-wrap items-center gap-1.5 text-2xs">
            {[
              ['Packing order', '/dispatch/packing-orders'],
              ['Cartons', '/dispatch/cartons'],
              ['Pallets', '/dispatch/pallets'],
              ['Dispatch plan', '/dispatch/planning'],
              ['Pick list', '/dispatch/pick-lists'],
              ['Loading', '/dispatch/loading'],
              ['Shipment', '/dispatch/shipments'],
              ['Tracking', '/dispatch/tracking'],
              ['Proof of delivery', '/dispatch/pod'],
            ].map(([label, to], i, arr) => (
              <span key={label} className="flex items-center gap-1.5">
                <Link to={to} className="rounded border border-border bg-surface-2 px-2 py-1 font-medium text-fg hover:border-border-strong hover:bg-surface-3">
                  {label}
                </Link>
                {i < arr.length - 1 && <span className="text-fg-subtle">→</span>}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-fg-muted">
            The carton number created at packing is the same number scanned at loading, printed on the challan and quoted on a
            shortage claim six months later. That is why the chain is a chain and not nine separate registers.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
