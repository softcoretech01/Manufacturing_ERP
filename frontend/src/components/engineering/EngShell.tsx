import type { ReactNode } from 'react'
import { Check, Clock, MinusCircle, X } from 'lucide-react'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { LIFECYCLE_LABEL, toolLifePct } from '@/lib/engFlow'
import type { EngChange, Lifecycle, Tool } from '@/types/engineering'

/* ─────────────────────────── Status ─────────────────────────── */

const ENG_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  DRAFT: { tone: 'draft', label: 'Draft' },
  PENDING_APPROVAL: { tone: 'pending', label: 'Pending approval' },
  UNDER_REVIEW: { tone: 'progress', label: 'Under review' },
  APPROVED: { tone: 'success', label: 'Approved' },
  ACTIVE: { tone: 'success', label: 'Active' },
  IMPLEMENTED: { tone: 'success', label: 'Implemented' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
  SUPERSEDED: { tone: 'neutral', label: 'Superseded' },
  OBSOLETE: { tone: 'neutral', label: 'Obsolete' },
  // Tool register
  AVAILABLE: { tone: 'success', label: 'Available' },
  IN_USE: { tone: 'progress', label: 'In use' },
  MAINTENANCE: { tone: 'warning', label: 'Maintenance' },
  CALIBRATION: { tone: 'warning', label: 'Calibration' },
  RETIRED: { tone: 'neutral', label: 'Retired' },
}

export function EngStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const e = ENG_STATUS[status] ?? { tone: 'neutral' as StatusTone, label: status.replace(/_/g, ' ').toLowerCase() }
  return (
    <Badge tone={e.tone} size={size}>
      {e.label}
    </Badge>
  )
}

/* ─────────────────────────── Lifecycle ─────────────────────────── */

const LIFECYCLE_TONE: Record<Lifecycle, StatusTone> = {
  CONCEPT: 'draft',
  DESIGN: 'draft',
  PROTOTYPE: 'progress',
  TESTING: 'warning',
  APPROVED: 'brand',
  PRODUCTION: 'success',
  OBSOLETE: 'neutral',
  ARCHIVED: 'neutral',
}

export function LifecycleBadge({ state, size = 'md' }: { state: Lifecycle; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={LIFECYCLE_TONE[state]} size={size}>
      {LIFECYCLE_LABEL[state]}
    </Badge>
  )
}

/** The eight lifecycle states as a rail, with the current one marked. */
export function LifecycleRail({ state }: { state: Lifecycle }) {
  const order: Lifecycle[] = ['CONCEPT', 'DESIGN', 'PROTOTYPE', 'TESTING', 'APPROVED', 'PRODUCTION', 'OBSOLETE']
  const current = order.indexOf(state)
  return (
    <ol className="flex flex-wrap items-center gap-1">
      {order.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span
            className={cn(
              'rounded px-2 py-0.5 text-2xs font-medium',
              i < current && 'bg-success/10 text-success',
              i === current && 'bg-brand-600 text-white',
              i > current && 'bg-surface-3 text-fg-subtle',
            )}
          >
            {LIFECYCLE_LABEL[s]}
          </span>
          {i < order.length - 1 && <span className="text-2xs text-fg-subtle">›</span>}
        </li>
      ))}
    </ol>
  )
}

/* ─────────────────────────── Change priority & type ─────────────────────── */

export function ChangeTypeBadge({ type }: { type: EngChange['changeType'] }) {
  return (
    <Badge tone={type === 'ECN' ? 'brand' : 'neutral'} size="sm" dot={false}>
      {type}
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

/* ─────────────────────────── Approval trail ─────────────────────────── */

const STEP_ICON = {
  APPROVED: { Icon: Check, cls: 'bg-success/15 text-success' },
  REJECTED: { Icon: X, cls: 'bg-danger/15 text-danger' },
  PENDING: { Icon: Clock, cls: 'bg-pending/15 text-pending' },
}

export function ApprovalTrail({ steps }: { steps: EngChange['approvals'] }) {
  if (!steps.length) return <p className="text-xs text-fg-subtle">Not submitted for approval yet.</p>
  return (
    <ol className="space-y-2.5">
      {steps.map((s) => {
        const { Icon, cls } = STEP_ICON[s.status] ?? { Icon: MinusCircle, cls: 'bg-surface-3 text-fg-subtle' }
        return (
          <li key={s.level} className="flex gap-2.5">
            <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', cls)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-fg">
                L{s.level} · {s.role}
              </p>
              <p className="text-2xs text-fg-muted">
                {s.approver}
                {s.actedAt && ` · ${formatDateTime(s.actedAt)}`}
              </p>
              {s.remarks && <p className="mt-0.5 text-2xs italic text-fg-subtle">“{s.remarks}”</p>}
            </div>
            <EngStatusBadge status={s.status} size="sm" />
          </li>
        )
      })}
    </ol>
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

/**
 * Indentation for a BOM level. Levels are also numbered in their own column —
 * indentation alone stops being readable past level three.
 */
export function LevelIndent({ level, children }: { level: number; children: ReactNode }) {
  return (
    <span className="flex items-center" style={{ paddingLeft: `${(level - 1) * 1.15}rem` }}>
      {level > 1 && <span className="mr-1.5 shrink-0 text-2xs text-fg-subtle">└</span>}
      {children}
    </span>
  )
}

/** Tool life consumed, coloured but always paired with the number. */
export function ToolLifeBar({ tool }: { tool: Tool }) {
  if (tool.lifeStrokes <= 0) return <span className="text-2xs text-fg-subtle">Not life-tracked</span>
  const pct = toolLifePct(tool)
  const tone = pct >= 90 ? 'bg-danger' : pct >= 75 ? 'bg-warning' : 'bg-success'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-2xs tabular text-fg-muted">{pct.toFixed(0)}%</span>
    </div>
  )
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
