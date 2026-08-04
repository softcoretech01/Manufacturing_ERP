import type { ReactNode } from 'react'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { ORDER_STATUS_LABEL } from '@/lib/planFlow'
import type { DemandSource, ProductionOrder } from '@/types/planning'

/* ─────────────────────────── Status ─────────────────────────── */

const PLAN_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  DRAFT: { tone: 'draft', label: 'Draft' },
  APPROVED: { tone: 'success', label: 'Approved' },
  RELEASED: { tone: 'progress', label: 'Released' },
  SUPERSEDED: { tone: 'neutral', label: 'Superseded' },
  OPEN: { tone: 'progress', label: 'Open' },
  PLANNED: { tone: 'draft', label: 'Planned' },
  FIRM_PLANNED: { tone: 'brand', label: 'Firm planned' },
  MATERIAL_RESERVED: { tone: 'progress', label: 'Material reserved' },
  MATERIAL_ISSUED: { tone: 'progress', label: 'Material issued' },
  IN_PRODUCTION: { tone: 'warning', label: 'In production' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  CLOSED: { tone: 'neutral', label: 'Closed' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
  WORKING: { tone: 'success', label: 'Working' },
  WEEKLY_OFF: { tone: 'neutral', label: 'Weekly off' },
  HOLIDAY: { tone: 'brand', label: 'Holiday' },
  SHUTDOWN: { tone: 'danger', label: 'Shutdown' },
  OVERTIME: { tone: 'warning', label: 'Overtime' },
}

export function PlanStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const e = PLAN_STATUS[status] ?? { tone: 'neutral' as StatusTone, label: status.replace(/_/g, ' ').toLowerCase() }
  return (
    <Badge tone={e.tone} size={size}>
      {e.label}
    </Badge>
  )
}

export function OrderStatusBadge({ status, size = 'sm' }: { status: ProductionOrder['status']; size?: 'sm' | 'md' }) {
  const tone = PLAN_STATUS[status]?.tone ?? 'neutral'
  return (
    <Badge tone={tone} size={size}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  )
}

/* ─────────────────────────── Demand source ─────────────────────────── */

export const DEMAND_SOURCE_LABEL: Record<DemandSource, string> = {
  SALES_ORDER: 'Sales order',
  EXPORT_CONTRACT: 'Export contract',
  CUSTOMER_SCHEDULE: 'Customer schedule',
  BLANKET: 'Blanket order',
  SAFETY_STOCK: 'Safety stock',
  FORECAST: 'Forecast',
}

const SOURCE_TONE: Record<DemandSource, StatusTone> = {
  SALES_ORDER: 'success',
  EXPORT_CONTRACT: 'brand',
  CUSTOMER_SCHEDULE: 'progress',
  BLANKET: 'warning',
  SAFETY_STOCK: 'neutral',
  FORECAST: 'draft',
}

export function DemandSourceBadge({ source }: { source: DemandSource }) {
  return (
    <Badge tone={SOURCE_TONE[source]} size="sm" dot={false}>
      {DEMAND_SOURCE_LABEL[source]}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, StatusTone> = { LOW: 'neutral', NORMAL: 'brand', HIGH: 'warning', URGENT: 'danger' }
  return (
    <Badge tone={map[priority] ?? 'neutral'} size="sm" dot={false}>
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </Badge>
  )
}

/* ─────────────────────────── Load ─────────────────────────── */

/** Capacity load, coloured but always carrying the number. */
export function LoadCell({ pct, compact }: { pct: number; compact?: boolean }) {
  const tone = pct > 100 ? 'bg-danger' : pct > 85 ? 'bg-warning' : pct > 0 ? 'bg-success' : 'bg-border-strong'
  const text = pct > 100 ? 'text-danger' : pct > 85 ? 'text-warning' : 'text-fg-muted'
  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex h-6 w-full min-w-[2.5rem] items-center justify-center rounded text-2xs font-medium tabular',
          pct > 100 ? 'bg-danger/15 text-danger' : pct > 85 ? 'bg-warning/15 text-warning' : pct > 0 ? 'bg-success/10 text-success' : 'bg-surface-3 text-fg-subtle',
        )}
        title={`${pct.toFixed(0)}% loaded`}
      >
        {pct > 0 ? `${pct.toFixed(0)}%` : '—'}
      </span>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={cn('text-2xs tabular', text)}>{pct.toFixed(0)}%</span>
    </div>
  )
}

/* ─────────────────────────── Layout helpers ─────────────────────────── */

export function DetailBlock({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{title}</p>
        {actions}
      </div>
      {children}
    </div>
  )
}

/** Coverage of a requirement by free stock. */
export function CoverBar({ required, available }: { required: number; available: number }) {
  const pct = required > 0 ? Math.min(100, (available / required) * 100) : 100
  const tone = pct >= 100 ? 'bg-success' : pct >= 60 ? 'bg-warning' : 'bg-danger'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('text-2xs tabular', pct >= 100 ? 'text-success' : pct >= 60 ? 'text-warning' : 'text-danger')}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

/** Days late, coloured but never colour-only. */
export function LateChip({ days }: { days: number }) {
  if (days <= 0) return <span className="text-2xs text-success">On time</span>
  return <span className={cn('text-2xs font-medium', days > 7 ? 'text-danger' : 'text-warning')}>{days}d late</span>
}

/* ─────────────────────────── Chart tooltip ─────────────────────────── */

export function ChartTip({
  active,
  payload,
  label,
  prefix = '',
  suffix = '',
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string }[]
  label?: string | number
  prefix?: string
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-border bg-surface px-2.5 py-1.5 shadow-pop">
      {label !== undefined && <p className="mb-1 text-2xs font-medium text-fg">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-2xs text-fg-muted">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium tabular text-fg">{prefix}{p.value}{suffix}</span>
        </p>
      ))}
    </div>
  )
}
