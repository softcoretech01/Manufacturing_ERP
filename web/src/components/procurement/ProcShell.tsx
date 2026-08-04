import type { ReactNode } from 'react'
import { Check, Clock, MinusCircle, X } from 'lucide-react'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import type { ApprovalStep } from '@/types/procurement'

/* ─────────────────────────── Status ─────────────────────────── */

const PROC_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  DRAFT: { tone: 'draft', label: 'Draft' },
  PENDING_APPROVAL: { tone: 'pending', label: 'Pending approval' },
  APPROVED: { tone: 'success', label: 'Approved' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  IN_PROGRESS: { tone: 'progress', label: 'In progress' },
  PARTIALLY_EXECUTED: { tone: 'progress', label: 'Partial' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  SHORT_CLOSED: { tone: 'neutral', label: 'Short closed' },
  CLOSED: { tone: 'neutral', label: 'Closed' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
  ON_HOLD: { tone: 'warning', label: 'On hold' },
  AMENDED: { tone: 'neutral', label: 'Amended' },
  // Receipt, quotation and shipment vocabularies
  NOTIFIED: { tone: 'pending', label: 'Notified' },
  ARRIVED: { tone: 'progress', label: 'Arrived' },
  RECEIVED: { tone: 'success', label: 'Received' },
  RECEIVED_QC: { tone: 'success', label: 'Received' },
  UNDER_REVIEW: { tone: 'progress', label: 'Under review' },
  SHORTLISTED: { tone: 'brand', label: 'Shortlisted' },
  NEGOTIATING: { tone: 'warning', label: 'Negotiating' },
  AWARDED: { tone: 'success', label: 'Awarded' },
  REGRETTED: { tone: 'neutral', label: 'Regretted' },
  EXPIRED: { tone: 'neutral', label: 'Expired' },
  EXPIRING: { tone: 'warning', label: 'Expiring' },
  TERMINATED: { tone: 'danger', label: 'Terminated' },
  RENEWED: { tone: 'success', label: 'Renewed' },
  ACTIVE: { tone: 'success', label: 'Active' },
  PENDING: { tone: 'pending', label: 'Pending' },
  ACCEPTED: { tone: 'success', label: 'Accepted' },
  DEVIATION_ACCEPTED: { tone: 'warning', label: 'Deviation accepted' },
  NOT_REQUIRED: { tone: 'neutral', label: 'Not required' },
  IN_TRANSIT: { tone: 'progress', label: 'In transit' },
  PO_PLACED: { tone: 'draft', label: 'PO placed' },
  SHIPPED: { tone: 'progress', label: 'Shipped' },
  PORT_ARRIVED: { tone: 'progress', label: 'At port' },
  CUSTOMS: { tone: 'warning', label: 'In customs' },
  CLEARED: { tone: 'success', label: 'Cleared' },
  INVITED: { tone: 'draft', label: 'Invited' },
  VIEWED: { tone: 'progress', label: 'Viewed' },
  QUOTED: { tone: 'success', label: 'Quoted' },
  NO_RESPONSE: { tone: 'danger', label: 'No response' },
  RUNNING: { tone: 'progress', label: 'Running' },
  FAILED: { tone: 'danger', label: 'Failed' },
  PASS: { tone: 'success', label: 'Pass' },
  FAIL: { tone: 'danger', label: 'Fail' },
  DEVIATION: { tone: 'warning', label: 'Deviation' },
  SKIPPED: { tone: 'neutral', label: 'Skipped' },
  // Invoice verification and matching
  UNDER_MATCH: { tone: 'progress', label: 'Matching' },
  MATCHED: { tone: 'success', label: 'Matched' },
  BLOCKED: { tone: 'danger', label: 'Blocked' },
  PARTIAL: { tone: 'warning', label: 'Partial' },
  POSTED: { tone: 'success', label: 'Posted' },
  PAID: { tone: 'neutral', label: 'Paid' },
  OPEN: { tone: 'danger', label: 'Open' },
  RESOLVED: { tone: 'success', label: 'Resolved' },
  // Supplier qualification
  PROSPECT: { tone: 'draft', label: 'Prospect' },
  REGISTERED: { tone: 'draft', label: 'Registered' },
  UNDER_QUALIFICATION: { tone: 'progress', label: 'Under qualification' },
  APPROVED_PROVISIONAL: { tone: 'warning', label: 'Provisional' },
  BLACKLISTED: { tone: 'danger', label: 'Blacklisted' },
  INACTIVE: { tone: 'neutral', label: 'Inactive' },
  VERIFIED: { tone: 'success', label: 'Verified' },
}

export function ProcStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const e = PROC_STATUS[status] ?? { tone: 'neutral' as StatusTone, label: status.replace(/_/g, ' ').toLowerCase() }
  return (
    <Badge tone={e.tone} size={size}>
      {e.label}
    </Badge>
  )
}

/* ─────────────────────────── Priority ─────────────────────────── */

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
  SKIPPED: { Icon: MinusCircle, cls: 'bg-surface-3 text-fg-subtle' },
}

export function ApprovalTrail({ steps }: { steps: ApprovalStep[] }) {
  if (!steps.length) return <p className="text-xs text-fg-subtle">No approval steps configured.</p>
  return (
    <ol className="space-y-2.5">
      {steps.map((s) => {
        const { Icon, cls } = STEP_ICON[s.status]
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
            <ProcStatusBadge status={s.status} size="sm" />
          </li>
        )
      })}
    </ol>
  )
}

/* ─────────────────────────── Detail helpers ─────────────────────────── */

export function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{title}</p>
      {children}
    </div>
  )
}

/** Compact fill indicator used for received / billed / consumed percentages. */
export function FillBar({ pct, label }: { pct: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const tone = clamped >= 100 ? 'bg-success' : clamped > 0 ? 'bg-progress' : 'bg-border-strong'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-2xs text-fg-muted tabular">{label ?? `${clamped.toFixed(0)}%`}</span>
    </div>
  )
}

/** Days late/early against a promised date, coloured but never colour-only. */
export function DelayChip({ days }: { days: number }) {
  if (days === 0) return <span className="text-2xs text-success">On time</span>
  if (days < 0) return <span className="text-2xs text-success">{Math.abs(days)}d early</span>
  return <span className={cn('text-2xs', days > 3 ? 'text-danger' : 'text-warning')}>{days}d late</span>
}
