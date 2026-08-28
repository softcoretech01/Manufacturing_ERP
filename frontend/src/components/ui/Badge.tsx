import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Status is never conveyed by colour alone (V0-UIR-019) — every badge carries
 * text, and a dot for shape redundancy.
 */
export type StatusTone =
  | 'draft'
  | 'pending'
  | 'success'
  | 'progress'
  | 'danger'
  | 'warning'
  | 'neutral'
  | 'brand'

const TONES: Record<StatusTone, string> = {
  draft: 'bg-draft/10 text-draft ring-draft/25',
  pending: 'bg-pending/10 text-pending ring-pending/25',
  success: 'bg-success/10 text-success ring-success/25',
  progress: 'bg-progress/10 text-progress ring-progress/25',
  danger: 'bg-danger/10 text-danger ring-danger/25',
  warning: 'bg-warning/10 text-warning ring-warning/25',
  neutral: 'bg-neutral/10 text-neutral ring-neutral/25',
  brand: 'bg-brand-500/10 text-brand-600 ring-brand-500/25',
}

const DOTS: Record<StatusTone, string> = {
  draft: 'bg-draft',
  pending: 'bg-pending',
  success: 'bg-success',
  progress: 'bg-progress',
  danger: 'bg-danger',
  warning: 'bg-warning',
  neutral: 'bg-neutral',
  brand: 'bg-brand-500',
}

export function Badge({
  tone = 'neutral',
  children,
  dot = true,
  className,
  size = 'md',
}: {
  tone?: StatusTone
  children: ReactNode
  dot?: boolean
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <span
      // Stable hook for the grid: a chip is a fixed-size object, not text, so
      // the data grid must neither ellipsise it nor let it drive row height.
      // index.css already targets [data-chip] — nothing emitted it until now.
      data-chip=""
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-2xs' : 'px-2 py-0.5 text-xs',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOTS[tone])} />}
      {children}
    </span>
  )
}

/** Maps a document status to its product-wide tone and label. */
const STATUS_MAP: Record<string, { tone: StatusTone; label: string }> = {
  DRAFT: { tone: 'draft', label: 'Draft' },
  PLANNED: { tone: 'draft', label: 'Planned' },
  PENDING_APPROVAL: { tone: 'pending', label: 'Pending approval' },
  APPROVED: { tone: 'success', label: 'Approved' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  ON_HOLD: { tone: 'warning', label: 'On hold' },
  HOLD: { tone: 'warning', label: 'Hold' },
  RELEASED: { tone: 'progress', label: 'Released' },
  IN_PROGRESS: { tone: 'progress', label: 'In progress' },
  PARTIALLY_EXECUTED: { tone: 'progress', label: 'Partial' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  CLOSED: { tone: 'success', label: 'Closed' },
  SHORT_CLOSED: { tone: 'neutral', label: 'Short closed' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
  AMENDED: { tone: 'neutral', label: 'Amended' },
  ACTIVE: { tone: 'success', label: 'Active' },
  INACTIVE: { tone: 'neutral', label: 'Inactive' },
  SUSPENDED: { tone: 'warning', label: 'Suspended' },
  DEACTIVATED: { tone: 'neutral', label: 'Deactivated' },
  PENDING_ACTIVATION: { tone: 'pending', label: 'Pending activation' },
  OPEN: { tone: 'success', label: 'Open' },
  FUTURE: { tone: 'progress', label: 'Future' },
  CLOSING: { tone: 'warning', label: 'Closing' },
  RUNNING: { tone: 'success', label: 'Running' },
  IDLE: { tone: 'neutral', label: 'Idle' },
  MAINTENANCE: { tone: 'warning', label: 'Maintenance' },
  AVAILABLE: { tone: 'success', label: 'Available' },
  BLOCKED: { tone: 'danger', label: 'Blocked' },
  FULL: { tone: 'warning', label: 'Full' },
  QUEUED: { tone: 'pending', label: 'Queued' },
  SENT: { tone: 'progress', label: 'Sent' },
  DELIVERED: { tone: 'success', label: 'Delivered' },
  READ: { tone: 'success', label: 'Read' },
  FAILED: { tone: 'danger', label: 'Failed' },
  SUCCESS: { tone: 'success', label: 'Success' },
  REVOKED: { tone: 'danger', label: 'Revoked' },
  EXPIRED: { tone: 'neutral', label: 'Expired' },
}

export function StatusBadge({
  status,
  size = 'md',
  className,
}: {
  status: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const entry = STATUS_MAP[status] ?? { tone: 'neutral' as StatusTone, label: status }
  return (
    <Badge tone={entry.tone} size={size} className={className}>
      {entry.label}
    </Badge>
  )
}
