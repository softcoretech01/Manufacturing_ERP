import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { formatQty } from '@/lib/format'
import { usePermissions } from '@/store/auth'

/**
 * Shared vocabulary and cells for the packing, dispatch and logistics screens.
 * Kept in one file so a status means the same thing on the packing floor, at
 * the loading bay and on the tracking screen.
 */

/**
 * Freight and invoice value are commercial figures. A loader confirming cartons
 * has no business seeing what the consignment is worth, so quantity visibility
 * and value visibility are separate permissions.
 */
export function useCanSeeFreight() {
  const { has } = usePermissions()
  return has('DISPATCH.FREIGHT.VIEW') || has('DISPATCH.REPORT.VIEW_VALUE')
}

/* ─────────────────────────── Status vocabulary ─────────────────────────── */

const DISPATCH_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  // Packing order
  PLANNED: { tone: 'draft', label: 'Planned' },
  MATERIAL_READY: { tone: 'brand', label: 'Material ready' },
  PACKING_STARTED: { tone: 'progress', label: 'Packing' },
  PACKED: { tone: 'progress', label: 'Packed' },
  QC_VERIFIED: { tone: 'success', label: 'QC verified' },
  READY_FOR_DISPATCH: { tone: 'success', label: 'Ready to dispatch' },
  // Packaging material
  ISSUED: { tone: 'brand', label: 'Issued' },
  CONSUMED: { tone: 'success', label: 'Consumed' },
  RETURNED: { tone: 'neutral', label: 'Returned' },
  // Carton
  SEALED: { tone: 'brand', label: 'Sealed' },
  PALLETISED: { tone: 'progress', label: 'On a pallet' },
  LOADED: { tone: 'progress', label: 'Loaded' },
  // Pallet
  BUILDING: { tone: 'warning', label: 'Building' },
  STAGED: { tone: 'brand', label: 'Staged' },
  SHIPPED: { tone: 'success', label: 'Shipped' },
  // Dispatch plan
  PICKING: { tone: 'progress', label: 'Picking' },
  LOADING: { tone: 'progress', label: 'Loading' },
  DISPATCHED: { tone: 'success', label: 'Dispatched' },
  // Pick list
  ASSIGNED: { tone: 'brand', label: 'Assigned' },
  PICKED: { tone: 'success', label: 'Picked' },
  SHORT: { tone: 'danger', label: 'Short' },
  // Loading sheet
  VERIFYING: { tone: 'warning', label: 'Verifying' },
  // Vehicle
  AVAILABLE: { tone: 'success', label: 'Available' },
  IN_TRANSIT: { tone: 'progress', label: 'In transit' },
  RETURNING: { tone: 'brand', label: 'Returning' },
  MAINTENANCE: { tone: 'warning', label: 'Maintenance' },
  // Shipment
  DELIVERED: { tone: 'success', label: 'Delivered' },
  // Export
  STUFFED: { tone: 'brand', label: 'Stuffed' },
  GATED_IN: { tone: 'progress', label: 'Gated in' },
  SAILED: { tone: 'progress', label: 'Sailed' },
  ARRIVED: { tone: 'brand', label: 'Arrived' },
  NOT_FILED: { tone: 'draft', label: 'Not filed' },
  FILED: { tone: 'brand', label: 'Filed' },
  ASSESSED: { tone: 'progress', label: 'Assessed' },
  CLEARED: { tone: 'success', label: 'Cleared' },
  HELD: { tone: 'danger', label: 'Held' },
  // Export documents
  MISSING: { tone: 'danger', label: 'Missing' },
  SUBMITTED: { tone: 'progress', label: 'Submitted' },
  ACCEPTED: { tone: 'success', label: 'Accepted' },
  // POD
  NOT_DUE: { tone: 'neutral', label: 'Not due' },
  RECEIVED: { tone: 'success', label: 'Received' },
  DAMAGED: { tone: 'danger', label: 'Damaged' },
  DISPUTED: { tone: 'danger', label: 'Disputed' },
  // Returns
  REQUESTED: { tone: 'pending', label: 'Requested' },
  PICKUP_SCHEDULED: { tone: 'brand', label: 'Pickup booked' },
  INSPECTED: { tone: 'progress', label: 'Inspected' },
  RESTOCK: { tone: 'success', label: 'Restock' },
  REWORK: { tone: 'warning', label: 'Rework' },
  SCRAP: { tone: 'danger', label: 'Scrap' },
  // Freight
  ESTIMATED: { tone: 'draft', label: 'Estimated' },
  ACTUAL: { tone: 'brand', label: 'Actual' },
  PAID: { tone: 'success', label: 'Paid' },
  // Generic
  DRAFT: { tone: 'draft', label: 'Draft' },
  OPEN: { tone: 'warning', label: 'Open' },
  PENDING: { tone: 'pending', label: 'Pending' },
  APPROVED: { tone: 'success', label: 'Approved' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  CLOSED: { tone: 'neutral', label: 'Closed' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
}

export function DispatchStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const e = DISPATCH_STATUS[status] ?? {
    tone: 'neutral' as StatusTone,
    label: status.replace(/_/g, ' ').toLowerCase(),
  }
  return (
    <Badge tone={e.tone} size={size}>
      {e.label}
    </Badge>
  )
}

/* ───────────────────────────── Cells ───────────────────────────── */

/** Document number over the customer it belongs to. */
export function DocCell({ docNo, sub, to }: { docNo: string; sub?: string; to?: string }) {
  return (
    <div className="min-w-0">
      {to ? (
        <Link to={to} className="font-mono text-xs font-medium text-brand-600 hover:underline">
          {docNo}
        </Link>
      ) : (
        <p className="font-mono text-xs font-medium text-brand-600">{docNo}</p>
      )}
      {sub && <p className="truncate text-2xs text-fg-subtle">{sub}</p>}
    </div>
  )
}

/** Item name over its code — the two-line cell used across every list. */
export function ItemCell({ name, code, batch }: { name: string; code: string; batch?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-fg">{name}</p>
      <p className="truncate font-mono text-2xs text-fg-subtle">
        {code}
        {batch ? ` · ${batch}` : ''}
      </p>
    </div>
  )
}

/** Customer with the destination beneath it. */
export function PartyCell({ name, place }: { name: string; place?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-medium text-fg">{name}</p>
      {place && <p className="truncate text-2xs text-fg-subtle">{place}</p>}
    </div>
  )
}

/** Done-against-total with a bar, used for cartons packed, picked and loaded. */
export function CountBar({
  done,
  total,
  unit = '',
  tone,
}: {
  done: number
  total: number
  unit?: string
  tone?: 'brand' | 'success' | 'warning'
}) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0
  const colour = pct >= 100 ? 'bg-success' : tone === 'warning' ? 'bg-warning' : tone === 'success' ? 'bg-success' : 'bg-brand-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full', colour)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-2xs tabular text-fg-muted">
        {formatQty(done)}/{formatQty(total)}
        {unit && ` ${unit}`}
      </span>
    </div>
  )
}

/** Weight in kg — the number the loading bay and the transporter argue about. */
export function WeightCell({ kg, planned }: { kg?: number | null; planned?: number | null }) {
  if (kg == null) return <span className="text-xs text-fg-muted">-</span>
  const over = planned != null && planned > 0 && kg > planned * 1.02
  return (
    <span className={cn('tabular text-xs', over ? 'font-medium text-warning' : 'text-fg')}>
      {kg.toLocaleString('en-IN', { minimumFractionDigits: kg % 1 ? 1 : 0, maximumFractionDigits: 2 })} kg
    </span>
  )
}

/** Carton dimensions as L × W × H, kept on one line. */
export function DimensionCell({ l, w, h }: { l?: number | null; w?: number | null; h?: number | null }) {
  if (l == null || w == null || h == null) return <span className="text-xs text-fg-muted">-</span>
  return (
    <span className="font-mono text-2xs text-fg-muted">
      {l} × {w} × {h}
    </span>
  )
}

/** Days late or early against a promised date. */
export function EtaChip({ eta, delivered }: { eta: string | null; delivered: string | null }) {
  if (!eta) return <span className="text-2xs text-fg-subtle">—</span>
  const target = new Date(eta).getTime()
  const actual = delivered ? new Date(delivered).getTime() : Date.now()
  const hours = Math.round((actual - target) / 3_600_000)
  if (delivered) {
    return hours <= 0 ? (
      <Badge tone="success" size="sm" dot={false}>
        on time
      </Badge>
    ) : (
      <Badge tone="danger" size="sm" dot={false}>
        {hours < 48 ? `${hours} h late` : `${Math.round(hours / 24)} d late`}
      </Badge>
    )
  }
  if (hours <= -24) return <span className="text-2xs text-fg-muted">in {Math.round(-hours / 24)} d</span>
  if (hours <= 0) return <span className="text-2xs text-progress">due in {-hours} h</span>
  return (
    <Badge tone="danger" size="sm">
      {hours < 48 ? `${hours} h overdue` : `${Math.round(hours / 24)} d overdue`}
    </Badge>
  )
}

/** A yes/no gate — material ready, QC released, seal verified. */
export function GateChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs',
        ok ? 'border-success/30 bg-success/5 text-success' : 'border-warning/30 bg-warning/5 text-warning',
      )}
    >
      <span className={cn('h-1 w-1 rounded-full', ok ? 'bg-success' : 'bg-warning')} />
      {label}
    </span>
  )
}

/** A percentage that reads green above target and amber below. */
export function PctChip({ value, target = 95, suffix = '%' }: { value: number; target?: number; suffix?: string }) {
  return (
    <span
      className={cn(
        'tabular text-xs font-medium',
        value >= target ? 'text-success' : value >= target - 8 ? 'text-warning' : 'text-danger',
      )}
    >
      {value.toFixed(1)}
      {suffix}
    </span>
  )
}

/** An expiry date that shouts when it is close. */
export function ExpiryCell({ date, label }: { date: string; label?: string }) {
  const days = Math.round((new Date(date).getTime() - Date.now()) / 86_400_000)
  return (
    <span
      className={cn(
        'text-2xs tabular',
        days < 0 ? 'font-medium text-danger' : days < 30 ? 'text-warning' : 'text-fg-muted',
      )}
    >
      {label ? `${label} ` : ''}
      {days < 0 ? `expired ${-days} d ago` : days < 60 ? `${days} d left` : new Date(date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
    </span>
  )
}

export function DispatchDetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{title}</h3>
      <div className="rounded border border-border bg-surface-2 p-3">{children}</div>
    </section>
  )
}

export function DispatchChartTip({ active, payload, label, suffix = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-border bg-surface px-2.5 py-1.5 shadow-pop">
      {label && <p className="mb-0.5 text-2xs font-medium text-fg">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} className="text-2xs text-fg-muted">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.color ?? p.fill }} />
          {p.name}: <span className="font-medium tabular text-fg">{Number(p.value).toLocaleString('en-IN')}{suffix}</span>
        </p>
      ))}
    </div>
  )
}

export const DISPATCH_COLOURS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6']

/** One colour per region, stable across every chart and table in the module. */
const REGION_COLOUR: Record<string, string> = {
  South: '#8b5cf6',
  West: '#06b6d4',
  North: '#10b981',
  East: '#f59e0b',
  Export: '#3b82f6',
}

export function regionColour(region: string) {
  return REGION_COLOUR[region] ?? '#94a3b8'
}

export const MATERIAL_CATEGORY_LABEL: Record<string, string> = {
  CARTON: 'Master carton',
  INNER_BOX: 'Inner box',
  PROTECTIVE: 'Protective',
  LABEL: 'Label',
  INSERT: 'Insert',
  PALLET: 'Pallet',
  WRAP: 'Wrap & strap',
}

export const SHIPMENT_TYPE_LABEL: Record<string, string> = {
  DOMESTIC: 'Domestic',
  EXPORT: 'Export',
  SAMPLE: 'Sample',
  REPLACEMENT: 'Replacement',
  DISTRIBUTOR: 'Distributor',
  ECOMMERCE: 'E-commerce',
}

export const VEHICLE_TYPE_LABEL: Record<string, string> = {
  COMPANY: 'Company vehicle',
  THIRD_PARTY: 'Third-party transport',
  COURIER: 'Courier',
  CONTAINER: 'Container',
  AIR_CARGO: 'Air cargo',
}

export const RETURN_TYPE_LABEL: Record<string, string> = {
  CUSTOMER_RETURN: 'Customer return',
  TRANSIT_DAMAGE: 'Transit damage',
  WRONG_SHIPMENT: 'Wrong shipment',
  REPLACEMENT: 'Replacement',
  WARRANTY: 'Warranty',
}

export const CHARGE_TYPE_LABEL: Record<string, string> = {
  FREIGHT: 'Freight',
  LOADING: 'Loading',
  INSURANCE: 'Insurance',
  TOLL: 'Toll',
  FUEL_SURCHARGE: 'Fuel surcharge',
  HANDLING: 'Handling',
  DEMURRAGE: 'Demurrage',
  EXPORT_CHARGES: 'Export charges',
}

export const EXPORT_DOC_LABEL: Record<string, string> = {
  COMMERCIAL_INVOICE: 'Commercial invoice',
  PACKING_LIST: 'Packing list',
  CERTIFICATE_OF_ORIGIN: 'Certificate of origin',
  BILL_OF_LADING: 'Bill of lading',
  SHIPPING_BILL: 'Shipping bill',
  INSPECTION_CERTIFICATE: 'Export inspection certificate',
  INSURANCE_POLICY: 'Marine insurance policy',
}

export const PICK_METHOD_LABEL: Record<string, string> = {
  FIFO: 'FIFO — oldest stock first',
  FEFO: 'FEFO — earliest expiry first',
  BATCH: 'Batch-wise',
  ZONE: 'Zone-wise',
  WAVE: 'Wave picking',
}
