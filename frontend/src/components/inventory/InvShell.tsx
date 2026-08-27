import type { ReactNode } from 'react'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { formatCurrency, formatQty } from '@/lib/format'
import { usePermissions } from '@/store/auth'
import type { Column } from '@/components/ui/DataTable'

export { ApprovalTrail, DetailBlock, FillBar } from '@/components/procurement/ProcShell'

/* ─────────────────────────── Document status ─────────────────────────── */

const INV_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  DRAFT: { tone: 'draft', label: 'Draft' },
  PENDING_APPROVAL: { tone: 'pending', label: 'Pending approval' },
  APPROVED: { tone: 'success', label: 'Approved' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  IN_PROGRESS: { tone: 'progress', label: 'In progress' },
  PARTIALLY_ISSUED: { tone: 'progress', label: 'Partly issued' },
  ISSUED: { tone: 'success', label: 'Issued' },
  IN_TRANSIT: { tone: 'progress', label: 'In transit' },
  PARTIALLY_RECEIVED: { tone: 'warning', label: 'Partly received' },
  RECEIVED: { tone: 'success', label: 'Received' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  POSTED: { tone: 'success', label: 'Posted' },
  SHORT_CLOSED: { tone: 'neutral', label: 'Short closed' },
  CLOSED: { tone: 'neutral', label: 'Closed' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
  ON_HOLD: { tone: 'warning', label: 'On hold' },
  // Counting
  PLANNED: { tone: 'draft', label: 'Planned' },
  ASSIGNED: { tone: 'pending', label: 'Assigned' },
  COUNTED: { tone: 'progress', label: 'Counted' },
  RECOUNT_REQUIRED: { tone: 'warning', label: 'Recount required' },
  // Stock status (V4-STK §2.2.1)
  AVAILABLE: { tone: 'success', label: 'Available' },
  QUARANTINE: { tone: 'warning', label: 'Quarantine' },
  BLOCKED: { tone: 'danger', label: 'Blocked' },
  AT_SUBCONTRACTOR: { tone: 'brand', label: 'At subcontractor' },
  EXPIRED: { tone: 'danger', label: 'Expired' },
  SAMPLE: { tone: 'neutral', label: 'Sample' },
  // QC decision
  PENDING: { tone: 'pending', label: 'Pending' },
  ACCEPTED: { tone: 'success', label: 'Accepted' },
  DEVIATION_ACCEPTED: { tone: 'warning', label: 'Deviation' },
  NOT_REQUIRED: { tone: 'neutral', label: 'Not required' },
  // Batch / serial
  ACTIVE: { tone: 'success', label: 'Active' },
  CONSUMED: { tone: 'neutral', label: 'Consumed' },
  RECALLED: { tone: 'danger', label: 'Recalled' },
  IN_STOCK: { tone: 'success', label: 'In stock' },
  ALLOCATED: { tone: 'brand', label: 'Allocated' },
  DISPATCHED: { tone: 'progress', label: 'Dispatched' },
  SOLD: { tone: 'neutral', label: 'Sold' },
  RETURNED: { tone: 'warning', label: 'Returned' },
  SCRAPPED: { tone: 'danger', label: 'Scrapped' },
  IN_SERVICE: { tone: 'progress', label: 'In service' },
  // Reservation
  RESERVED: { tone: 'brand', label: 'Reserved' },
  RELEASED: { tone: 'neutral', label: 'Released' },
  // Bin
  UNDER_COUNT: { tone: 'progress', label: 'Under count' },
  DAMAGED: { tone: 'danger', label: 'Damaged' },
  FULL: { tone: 'warning', label: 'Full' },
  INACTIVE: { tone: 'neutral', label: 'Inactive' },
}

export function InvStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const e = INV_STATUS[status] ?? { tone: 'neutral' as StatusTone, label: status.replace(/_/g, ' ').toLowerCase() }
  return (
    <Badge tone={e.tone} size={size}>
      {e.label}
    </Badge>
  )
}

/* ─────────────────────────── Value visibility ─────────────────────────── */

/**
 * `INVENTORY.STOCK.VIEW` and `INVENTORY.STOCK.VIEW_VALUE` are deliberately
 * separate (V4-INV-BR-004). A storekeeper works the bins without seeing what
 * the material cost. In the real system the field never leaves the server; here
 * the column is dropped rather than blanked, which is the same visible
 * behaviour and the same habit.
 */
export function useCanSeeValue() {
  const { has } = usePermissions()
  return has('INVENTORY.STOCK.VIEW_VALUE')
}

/** Drops value columns for users without the permission. */
export function withValueColumns<T>(canSee: boolean, base: Column<T>[], valueCols: Column<T>[]): Column<T>[] {
  return canSee ? [...base, ...valueCols] : base
}

export function Money({ value, compact }: { value: number | null | undefined; compact?: boolean }) {
  const canSee = useCanSeeValue()
  if (!canSee) return <span className="text-2xs text-fg-subtle">—</span>
  if (value === null || value === undefined) return <span>—</span>
  return <span className={cn(value < 0 && 'text-danger')}>{compact ? formatCurrency(value) : formatCurrency(value)}</span>
}

/* ─────────────────────────── Stock cells ─────────────────────────── */

/**
 * Every quantity on screen states its bucket (V4-INV-UIR-016) — a bare number
 * labelled "stock" tells four departments four different things.
 */
export function QtyCell({ qty, uom, tone }: { qty: number; uom?: string; tone?: 'default' | 'muted' | 'danger' | 'success' }) {
  return (
    <span
      className={cn(
        'tabular',
        tone === 'muted' && 'text-fg-muted',
        tone === 'danger' && 'font-medium text-danger',
        tone === 'success' && 'text-success',
      )}
    >
      {formatQty(qty)}
      {uom && <span className="ml-1 text-2xs text-fg-subtle">{uom}</span>}
    </span>
  )
}

/** Days of cover against average daily demand, coloured but never colour-only. */
export function CoverChip({ days }: { days: number }) {
  const tone = days <= 5 ? 'text-danger' : days <= 12 ? 'text-warning' : 'text-fg-muted'
  const mark = days <= 5 ? '⛔' : days <= 12 ? '⚠' : ''
  return (
    <span className={cn('text-2xs tabular', tone)}>
      {days} d {mark}
    </span>
  )
}

/** Age in days with the ageing-bucket colouring used across valuation screens. */
export function AgeChip({ days, label }: { days: number; label?: string }) {
  const tone = days > 365 ? 'text-danger' : days > 180 ? 'text-warning' : 'text-fg-muted'
  return <span className={cn('text-2xs tabular', tone)}>{label ?? `${days} d`}</span>
}

/** Hours against an SLA — used by the put-away board (4 h target). */
export function SlaChip({ hours, target }: { hours: number; target: number }) {
  const breached = hours >= target
  const near = !breached && hours >= target * 0.75
  const text = hours < 1 ? `${Math.round(hours * 60)} m` : `${hours.toFixed(1)} h`
  return (
    <span className={cn('text-2xs tabular', breached ? 'font-medium text-danger' : near ? 'text-warning' : 'text-fg-muted')}>
      {text}
      {breached ? ' ⛔' : near ? ' ⚠' : ''}
    </span>
  )
}

/** ABC × XYZ pair, the classification that drives count frequency and service level. */
export function ClassChip({ abc, xyz }: { abc: string; xyz?: string }) {
  const tone: StatusTone = abc === 'A' ? 'brand' : abc === 'B' ? 'progress' : 'neutral'
  return (
    <Badge tone={tone} size="sm" dot={false}>
      {abc}
      {xyz ? ` / ${xyz}` : ''}
    </Badge>
  )
}

/* ─────────────────────────── Layout helpers ─────────────────────────── */

/** Stacked item code + name, the most repeated cell in the module. */
export function ItemCell({ code, name, sub }: { code: string; name: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-medium text-fg">{name}</p>
      <p className="truncate font-mono text-2xs text-fg-subtle">
        {code}
        {sub ? <span className="ml-1 font-sans">· {sub}</span> : null}
      </p>
    </div>
  )
}

/** Warehouse · bin · batch, in the order a storekeeper reads them. */
export function LocationCell({ warehouse, bin, batch }: { warehouse: string; bin?: string | null; batch?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-mono text-2xs text-fg">
        {warehouse}
        {bin ? ` · ${bin}` : ''}
      </p>
      {batch && <p className="truncate font-mono text-2xs text-fg-subtle">{batch}</p>}
    </div>
  )
}

/** A labelled bucket figure — the shape every stock number must be shown in. */
export function BucketTile({
  label,
  value,
  uom,
  tone = 'neutral',
  hint,
}: {
  label: string
  value: number | string
  uom?: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand'
  hint?: string
}) {
  const tones = {
    neutral: 'text-fg',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    brand: 'text-brand-600',
  }
  return (
    <div className="rounded border border-border px-3 py-2">
      <p className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={cn('mt-0.5 text-base font-semibold tabular', tones[tone])}>
        {typeof value === 'number' ? formatQty(value) : value}
        {uom && <span className="ml-1 text-2xs font-normal text-fg-subtle">{uom}</span>}
      </p>
      {hint && <p className="mt-0.5 text-2xs text-fg-subtle">{hint}</p>}
    </div>
  )
}

/** Segmented bar showing how on-hand splits across buckets. */
export function BucketBar({
  segments,
}: {
  segments: { label: string; value: number; className: string }[]
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3">
        {segments.map((s) =>
          s.value > 0 ? (
            <div key={s.label} className={cn('h-full', s.className)} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${formatQty(s.value)}`} />
          ) : null,
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1 text-2xs text-fg-muted">
              <span className={cn('h-2 w-2 rounded-sm', s.className)} />
              {s.label} <span className="tabular text-fg">{formatQty(s.value)}</span>
            </span>
          ))}
      </div>
    </div>
  )
}

/** Chart tooltip shared by every inventory chart. */
export function ChartTip({ active, payload, label, prefix = '', suffix = '' }: any) {
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

export const INV_CHART_COLOURS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']
