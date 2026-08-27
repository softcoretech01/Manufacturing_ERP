import { useMemo, type ReactNode } from 'react'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { useCollection } from '@/store/data'
import { cn } from '@/lib/cn'
import {
  ASSET_CATEGORY_LABEL, BREAKDOWN_CATEGORY_LABEL, PARAMETER_LABEL, PERMIT_LABEL,
  TRIGGER_LABEL, WO_STATUS_LABEL, WO_TYPE_LABEL,
} from '@/lib/maintFlow'
import {
  assets as seedAssets, breakdowns as seedBreakdowns, conditionPoints as seedPoints,
  conditionReadings as seedReadings, permits as seedPermits, pmPlans as seedPlans,
  shutdowns as seedShutdowns, spares as seedSpares, spareTxns as seedSpareTxns,
  technicians as seedTechnicians, utilityLogs as seedUtilityLogs, workOrders as seedWorkOrders,
} from '@/mock/maintenance'
import type {
  Breakdown, ConditionPoint, ConditionReading, Criticality, MaintAsset, MaintPermit,
  MaintWorkOrder, PmPlan, Shutdown, SparePart, SpareTxn, Technician, UtilityLog,
  WoPriority, WoStatus,
} from '@/types/maintenance'

/** Every maintenance collection, bound once so the screens agree with each other. */
export function useMaintenanceData() {
  const assets = useCollection<MaintAsset>('mnt:assets', useMemo(() => seedAssets, []))
  const plans = useCollection<PmPlan>('mnt:plans', useMemo(() => seedPlans, []))
  const workOrders = useCollection<MaintWorkOrder>('mnt:workOrders', useMemo(() => seedWorkOrders, []))
  const breakdowns = useCollection<Breakdown>('mnt:breakdowns', useMemo(() => seedBreakdowns, []))
  const spares = useCollection<SparePart>('mnt:spares', useMemo(() => seedSpares, []))
  const spareTxns = useCollection<SpareTxn>('mnt:spareTxns', useMemo(() => seedSpareTxns, []))
  const technicians = useCollection<Technician>('mnt:technicians', useMemo(() => seedTechnicians, []))
  const points = useCollection<ConditionPoint>('mnt:points', useMemo(() => seedPoints, []))
  const readings = useCollection<ConditionReading>('mnt:readings', useMemo(() => seedReadings, []))
  const permits = useCollection<MaintPermit>('mnt:permits', useMemo(() => seedPermits, []))
  const utilityLogs = useCollection<UtilityLog>('mnt:utilityLogs', useMemo(() => seedUtilityLogs, []))
  const shutdowns = useCollection<Shutdown>('mnt:shutdowns', useMemo(() => seedShutdowns, []))

  return { assets, plans, workOrders, breakdowns, spares, spareTxns, technicians, points, readings, permits, utilityLogs, shutdowns }
}

/* ─────────────────────────── Formatting ─────────────────────────── */

export const inr = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`

export function inrCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)} L`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} K`
  return `${sign}${abs.toFixed(0)}`
}

/** Minutes as the plant says them: 95 m, 3 h 20 m, 2 d 4 h. */
export function duration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  if (minutes < 60) return `${Math.round(minutes)} m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h < 24) return m ? `${h} h ${m} m` : `${h} h`
  const days = Math.floor(h / 24)
  return `${days} d ${h % 24} h`
}

export const hours = (h: number | null | undefined) => (h === null || h === undefined ? '—' : `${h.toLocaleString('en-IN')} h`)

/* ─────────────────────────── Badges ─────────────────────────── */

const WO_TONE: Record<WoStatus, StatusTone> = {
  DRAFT: 'draft', PLANNED: 'pending', ASSIGNED: 'brand', IN_PROGRESS: 'progress',
  ON_HOLD: 'warning', COMPLETED: 'success', VERIFIED: 'success', CLOSED: 'neutral', CANCELLED: 'danger',
}

export function WoStatusBadge({ status, size = 'sm' }: { status: WoStatus; size?: 'sm' | 'md' }) {
  return <Badge tone={WO_TONE[status] ?? 'neutral'} size={size}>{WO_STATUS_LABEL[status] ?? status}</Badge>
}

const GENERIC_TONE: Record<string, StatusTone> = {
  // Assets
  INSTALLED: 'draft', COMMISSIONED: 'brand', RUNNING: 'success', IDLE: 'neutral',
  UNDER_MAINTENANCE: 'progress', BREAKDOWN: 'danger', SHUTDOWN: 'warning', DECOMMISSIONED: 'neutral',
  // Breakdowns
  REPORTED: 'danger', ACKNOWLEDGED: 'warning', UNDER_REPAIR: 'progress', REPAIRED: 'brand',
  VERIFIED: 'success', CLOSED: 'neutral', CANCELLED: 'danger',
  // Permits
  PENDING_APPROVAL: 'pending', ACTIVE: 'success', EXPIRED: 'danger', DRAFT: 'draft',
  // Shutdowns
  PLANNED: 'draft', APPROVED: 'brand', IN_PROGRESS: 'progress', COMPLETED: 'success',
  // Tasks
  PENDING: 'draft', DONE: 'success', SKIPPED: 'neutral',
}

export function MaintStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const label = status.replace(/_/g, ' ').toLowerCase()
  return <Badge tone={GENERIC_TONE[status] ?? 'neutral'} size={size}>{label.charAt(0).toUpperCase() + label.slice(1)}</Badge>
}

const PRIORITY_TONE: Record<WoPriority, StatusTone> = { CRITICAL: 'danger', HIGH: 'warning', MEDIUM: 'brand', LOW: 'neutral' }

export function PriorityBadge({ priority }: { priority: WoPriority }) {
  return <Badge tone={PRIORITY_TONE[priority]} size="sm" dot={false}>{priority.charAt(0) + priority.slice(1).toLowerCase()}</Badge>
}

/** A, B or C — with what it means, because the letter alone tells nobody anything. */
export function CriticalityBadge({ criticality, showMeaning }: { criticality: Criticality; showMeaning?: boolean }) {
  const tone: Record<Criticality, StatusTone> = { A: 'danger', B: 'warning', C: 'neutral' }
  const meaning: Record<Criticality, string> = { A: 'stops the line', B: 'slows the line', C: 'no line impact' }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={tone[criticality]} size="sm" dot={false}>Class {criticality}</Badge>
      {showMeaning && <span className="text-3xs text-fg-subtle">{meaning[criticality]}</span>}
    </span>
  )
}

export function WoTypeBadge({ woType }: { woType: string }) {
  const tone: Record<string, StatusTone> = {
    PREVENTIVE: 'success', PREDICTIVE: 'brand', BREAKDOWN: 'danger',
    CORRECTIVE: 'warning', CALIBRATION: 'progress', UTILITY: 'neutral', FACILITY: 'neutral',
  }
  return <Badge tone={tone[woType] ?? 'neutral'} size="sm" dot={false}>{WO_TYPE_LABEL[woType] ?? woType}</Badge>
}

export function TriggerBadge({ trigger }: { trigger: string }) {
  return <Badge tone={trigger === 'CALENDAR' ? 'brand' : trigger === 'CONDITION' ? 'progress' : 'warning'} size="sm" dot={false}>{TRIGGER_LABEL[trigger] ?? trigger}</Badge>
}

export function CategoryBadge({ category }: { category: string }) {
  return <Badge tone="neutral" size="sm" dot={false}>{ASSET_CATEGORY_LABEL[category] ?? BREAKDOWN_CATEGORY_LABEL[category] ?? category}</Badge>
}

export function ParameterBadge({ parameter }: { parameter: string }) {
  return <Badge tone="neutral" size="sm" dot={false}>{PARAMETER_LABEL[parameter] ?? parameter}</Badge>
}

export function PermitTypeBadge({ permitType }: { permitType: string }) {
  const tone: Record<string, StatusTone> = { LOTO: 'danger', ELECTRICAL: 'danger', HOT_WORK: 'warning', CONFINED_SPACE: 'danger', HEIGHT: 'warning' }
  return <Badge tone={tone[permitType] ?? 'neutral'} size="sm" dot={false}>{PERMIT_LABEL[permitType as keyof typeof PERMIT_LABEL] ?? permitType}</Badge>
}

/** A condition reading's verdict. */
export function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, { tone: StatusTone; label: string }> = {
    NORMAL: { tone: 'success', label: 'Normal' },
    WARNING: { tone: 'warning', label: 'Warning' },
    TRIP: { tone: 'danger', label: 'Past trip' },
    NO_LIMITS: { tone: 'neutral', label: 'No limits set' },
  }
  const e = map[verdict] ?? map.NO_LIMITS
  return <Badge tone={e.tone} size="sm">{e.label}</Badge>
}

/**
 * How late something is, or how long is left.
 *
 * Overdue is always shown in days rather than a date, because "22 days late"
 * is read instantly and "12 July" has to be worked out.
 */
export function DueChip({ days, unitLabel = 'd' }: { days: number | null; unitLabel?: string }) {
  if (days === null) return <span className="text-2xs text-fg-subtle">—</span>
  if (days < 0) return <Badge tone="danger" size="sm">{Math.abs(days)}{unitLabel} late</Badge>
  if (days === 0) return <Badge tone="warning" size="sm">Today</Badge>
  if (days <= 7) return <Badge tone="warning" size="sm">{days}{unitLabel}</Badge>
  return <span className="text-2xs tabular text-fg-muted">{days}{unitLabel}</span>
}

/* ─────────────────────────── Layout ─────────────────────────── */

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

export function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-3xs uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className={cn('mt-0.5 text-xs text-fg', mono && 'font-mono')}>{value}</p>
    </div>
  )
}

/** A gauge showing how far through an interval something is, past 100% in red. */
export function ElapsedBar({ pct, className }: { pct: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const tone = pct > 100 ? 'bg-danger' : pct >= 90 ? 'bg-warning' : 'bg-success'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded bg-surface-3">
        <div className={cn('h-full transition-all', tone)} style={{ width: `${clamped}%` }} />
      </div>
      <span className={cn('text-2xs tabular', pct > 100 ? 'text-danger' : pct >= 90 ? 'text-warning' : 'text-fg-muted')}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

export function ChartTip({
  active, payload, label, prefix = '', suffix = '',
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string }[]
  label?: string | number
  prefix?: string
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-border bg-surface px-2.5 py-1.5 shadow-md">
      {label !== undefined && <p className="mb-0.5 text-2xs font-medium text-fg">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-2xs text-fg-muted">
          {p.color && <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />}
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular text-fg">
            {prefix}
            {typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}
            {suffix}
          </span>
        </p>
      ))}
    </div>
  )
}
