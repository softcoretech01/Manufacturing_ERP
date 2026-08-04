import type { ReactNode } from 'react'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { usePermissions } from '@/store/auth'

/**
 * Shared vocabulary and cells for the HR, payroll and workforce screens.
 *
 * HR data is the most sensitive in the product: a salary, a statutory number and
 * an appraisal rating are all things a colleague must not be able to read
 * casually. The two hooks below are the gate, and they are used on every screen
 * that touches either.
 */

/** Salary, CTC, payslip amounts and payroll totals. */
export function useCanSeePay() {
  const { has } = usePermissions()
  return has('HRMS.PAYROLL.VIEW') || has('HRMS.SALARY.VIEW')
}

/** Appraisal ratings, increments and promotion recommendations. */
export function useCanSeeAppraisal() {
  const { has } = usePermissions()
  return has('HRMS.APPRAISAL.VIEW')
}

/* ─────────────────────────── Status vocabulary ─────────────────────────── */

const HR_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  // Employee
  ACTIVE: { tone: 'success', label: 'Active' },
  PROBATION: { tone: 'warning', label: 'Probation' },
  NOTICE: { tone: 'danger', label: 'On notice' },
  ON_LEAVE: { tone: 'progress', label: 'On leave' },
  SUSPENDED: { tone: 'danger', label: 'Suspended' },
  EXITED: { tone: 'neutral', label: 'Exited' },
  // Attendance
  PRESENT: { tone: 'success', label: 'Present' },
  ABSENT: { tone: 'danger', label: 'Absent' },
  WEEKLY_OFF: { tone: 'neutral', label: 'Weekly off' },
  HOLIDAY: { tone: 'neutral', label: 'Holiday' },
  HALF_DAY: { tone: 'warning', label: 'Half day' },
  LATE: { tone: 'warning', label: 'Late' },
  EARLY_EXIT: { tone: 'warning', label: 'Early exit' },
  MISSED_PUNCH: { tone: 'danger', label: 'Missed punch' },
  // Requisition & candidate
  DRAFT: { tone: 'draft', label: 'Draft' },
  PENDING_APPROVAL: { tone: 'pending', label: 'Pending approval' },
  APPROVED: { tone: 'success', label: 'Approved' },
  POSTED: { tone: 'brand', label: 'Posted' },
  IN_PROGRESS: { tone: 'progress', label: 'In progress' },
  CLOSED: { tone: 'neutral', label: 'Closed' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  APPLIED: { tone: 'draft', label: 'Applied' },
  SCREENING: { tone: 'pending', label: 'Screening' },
  INTERVIEW_1: { tone: 'progress', label: 'Interview 1' },
  INTERVIEW_2: { tone: 'progress', label: 'Interview 2' },
  PRACTICAL_TEST: { tone: 'warning', label: 'Practical test' },
  SELECTED: { tone: 'success', label: 'Selected' },
  OFFERED: { tone: 'brand', label: 'Offered' },
  OFFER_ACCEPTED: { tone: 'success', label: 'Offer accepted' },
  JOINED: { tone: 'success', label: 'Joined' },
  DECLINED: { tone: 'danger', label: 'Declined' },
  // Leave
  PENDING_MANAGER: { tone: 'pending', label: 'With the manager' },
  PENDING_HR: { tone: 'pending', label: 'With HR' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
  WITHDRAWN: { tone: 'neutral', label: 'Withdrawn' },
  // Overtime
  REQUESTED: { tone: 'pending', label: 'Requested' },
  PAID: { tone: 'success', label: 'Paid' },
  // Payroll
  ATTENDANCE_LOCKED: { tone: 'brand', label: 'Attendance locked' },
  CALCULATED: { tone: 'progress', label: 'Calculated' },
  RELEASED: { tone: 'brand', label: 'Released' },
  HELD: { tone: 'danger', label: 'Held' },
  DISQUALIFIED: { tone: 'danger', label: 'Disqualified' },
  // Roster
  PLANNED: { tone: 'draft', label: 'Planned' },
  CONFIRMED: { tone: 'success', label: 'Confirmed' },
  CHANGED: { tone: 'warning', label: 'Changed' },
  NONE: { tone: 'neutral', label: '—' },
  // Appraisal
  GOAL_SETTING: { tone: 'draft', label: 'Goal setting' },
  MID_YEAR: { tone: 'progress', label: 'Mid-year' },
  SELF_APPRAISAL: { tone: 'pending', label: 'Self appraisal' },
  MANAGER_REVIEW: { tone: 'progress', label: 'Manager review' },
  HR_REVIEW: { tone: 'warning', label: 'HR review' },
  FINALISED: { tone: 'success', label: 'Finalised' },
  OUTSTANDING: { tone: 'success', label: 'Outstanding' },
  EXCEEDS: { tone: 'success', label: 'Exceeds' },
  MEETS: { tone: 'brand', label: 'Meets' },
  PARTIALLY_MEETS: { tone: 'warning', label: 'Partially meets' },
  BELOW: { tone: 'danger', label: 'Below' },
  // Training & skill
  OPEN: { tone: 'brand', label: 'Open' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  ENROLLED: { tone: 'brand', label: 'Enrolled' },
  ATTENDED: { tone: 'progress', label: 'Attended' },
  PASSED: { tone: 'success', label: 'Passed' },
  FAILED: { tone: 'danger', label: 'Failed' },
  CERTIFIED: { tone: 'success', label: 'Certified' },
  EXPIRING: { tone: 'warning', label: 'Expiring' },
  EXPIRED: { tone: 'danger', label: 'Expired' },
  IN_TRAINING: { tone: 'progress', label: 'In training' },
  NOT_CERTIFIED: { tone: 'neutral', label: 'Not certified' },
  // Contractor & statutory
  RECORDED: { tone: 'draft', label: 'Recorded' },
  BILLED: { tone: 'progress', label: 'Billed' },
  DISPUTED: { tone: 'danger', label: 'Disputed' },
  SUBMITTED: { tone: 'brand', label: 'Submitted' },
  ON_HOLD: { tone: 'danger', label: 'On hold' },
  NOT_DUE: { tone: 'neutral', label: 'Not due' },
  PENDING: { tone: 'pending', label: 'Pending' },
  PREPARED: { tone: 'brand', label: 'Prepared' },
  FILED: { tone: 'success', label: 'Filed' },
  OVERDUE: { tone: 'danger', label: 'Overdue' },
}

export function HrStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const e = HR_STATUS[status] ?? { tone: 'neutral' as StatusTone, label: status.replace(/_/g, ' ').toLowerCase() }
  return (
    <Badge tone={e.tone} size={size}>
      {e.label}
    </Badge>
  )
}

/* ─────────────────────────────── Cells ─────────────────────────────── */

/** Name over employee code — the two-line cell every HR list starts with. */
export function EmployeeCell({
  name,
  code,
  sub,
}: {
  name: string
  code: string
  sub?: string | null
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-medium text-fg">{name}</p>
      <p className="truncate font-mono text-2xs text-fg-subtle">
        {code}
        {sub ? ` · ${sub}` : ''}
      </p>
    </div>
  )
}

/** Designation over department. */
export function RoleCell({ designation, department }: { designation: string; department: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-fg">{designation}</p>
      <p className="truncate text-2xs text-fg-subtle">{department}</p>
    </div>
  )
}

/** A money amount that disappears entirely without the pay permission. */
export function PayCell({ amount, bold }: { amount: number | null; bold?: boolean }) {
  const canSee = useCanSeePay()
  if (!canSee) return <span className="text-2xs text-fg-subtle">restricted</span>
  if (amount === null) return <span className="text-2xs text-fg-subtle">—</span>
  return (
    <span className={cn('tabular text-xs', bold && 'font-semibold text-fg')}>
      ₹{amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
    </span>
  )
}

/** Clock time with a late or early marker beside it. */
export function PunchCell({
  time,
  lateMinutes,
  source,
}: {
  time: string | null
  lateMinutes?: number
  source?: string | null
}) {
  if (!time) return <span className="text-2xs text-danger">no punch</span>
  return (
    <div className="min-w-0">
      <p className={cn('font-mono text-xs tabular', lateMinutes && lateMinutes > 0 ? 'text-warning' : 'text-fg')}>
        {time}
        {lateMinutes && lateMinutes > 0 ? ` (+${lateMinutes}m)` : ''}
      </p>
      {source && <p className="text-2xs text-fg-subtle">{PUNCH_SOURCE_LABEL[source] ?? source.toLowerCase()}</p>}
    </div>
  )
}

/** Hours and minutes from a minute count. */
export function Hours({ minutes, hours }: { minutes?: number; hours?: number }) {
  const m = minutes ?? Math.round((hours ?? 0) * 60)
  if (!m) return <span className="text-2xs text-fg-subtle">—</span>
  const h = Math.floor(m / 60)
  const rem = m % 60
  return (
    <span className="tabular text-xs text-fg">
      {h ? `${h}h` : ''}
      {rem ? ` ${rem}m` : h ? '' : `${rem}m`}
    </span>
  )
}

/** A gate that either passed or did not, with the reason available on hover. */
export function GateChip({ ok, label, title }: { ok: boolean; label: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0 text-2xs',
        ok ? 'border-success/30 bg-success/5 text-success' : 'border-danger/30 bg-danger/5 text-danger',
      )}
    >
      <span className={cn('h-1 w-1 rounded-full', ok ? 'bg-success' : 'bg-danger')} />
      {label}
    </span>
  )
}

/** A percentage against a target, coloured by which side of it we are on. */
export function PctChip({
  value,
  target,
  lowerIsBetter,
  suffix = '%',
}: {
  value: number
  target: number
  lowerIsBetter?: boolean
  suffix?: string
}) {
  const good = lowerIsBetter ? value <= target : value >= target
  const near = lowerIsBetter ? value <= target * 1.15 : value >= target * 0.92
  return (
    <span className={cn('tabular text-xs font-medium', good ? 'text-success' : near ? 'text-warning' : 'text-danger')}>
      {value.toFixed(1)}
      {suffix}
    </span>
  )
}

/** Skill level as a five-step meter — the shape of a skill matrix cell. */
const LEVEL_ORDER = ['BEGINNER', 'INTERMEDIATE', 'SKILLED', 'EXPERT', 'TRAINER']

export function SkillLevelMeter({ level, compact }: { level: string; compact?: boolean }) {
  const idx = LEVEL_ORDER.indexOf(level)
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {LEVEL_ORDER.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-3 w-1 rounded-sm',
              i <= idx
                ? idx >= 3
                  ? 'bg-success'
                  : idx === 2
                    ? 'bg-brand-500'
                    : 'bg-warning'
                : 'bg-surface-3',
            )}
          />
        ))}
      </span>
      {!compact && <span className="text-2xs text-fg-muted">{SKILL_LEVEL_LABEL[level] ?? level.toLowerCase()}</span>}
    </div>
  )
}

/** A rating out of five as stars plus the number. */
export function RatingCell({ rating }: { rating: number | null }) {
  const canSee = useCanSeeAppraisal()
  if (!canSee) return <span className="text-2xs text-fg-subtle">restricted</span>
  if (rating === null) return <span className="text-2xs text-fg-subtle">not rated</span>
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={cn('h-1.5 w-1.5 rounded-full', n <= Math.round(rating) ? 'bg-brand-500' : 'bg-surface-3')}
          />
        ))}
      </span>
      <span className={cn('tabular text-xs font-medium', rating >= 4 ? 'text-success' : rating >= 3 ? 'text-fg' : 'text-warning')}>
        {rating.toFixed(1)}
      </span>
    </span>
  )
}

/** A due or expiry date that shouts when it is close or past. */
export function DueCell({ date, label }: { date: string | null; label?: string }) {
  if (!date) return <span className="text-2xs text-fg-subtle">—</span>
  const days = Math.round((new Date(date).getTime() - Date.now()) / 86_400_000)
  return (
    <span
      className={cn(
        'text-2xs tabular',
        days < 0 ? 'font-medium text-danger' : days < 30 ? 'text-warning' : 'text-fg-muted',
      )}
    >
      {label ? `${label} ` : ''}
      {days < 0 ? `${-days} d overdue` : days === 0 ? 'today' : `in ${days} d`}
    </span>
  )
}

export function HrDetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{title}</h3>
      <div className="rounded border border-border bg-surface-2 p-3">{children}</div>
    </section>
  )
}

export function HrChartTip({ active, payload, label, suffix = '' }: any) {
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

export const HR_COLOURS = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

/* ───────────────────────────── Label maps ───────────────────────────── */

export const PUNCH_SOURCE_LABEL: Record<string, string> = {
  FINGERPRINT: 'fingerprint',
  FACE: 'face',
  RFID: 'RFID card',
  MOBILE_GPS: 'mobile GPS',
  QR: 'QR',
  MANUAL: 'entered by hand',
}

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  PERMANENT: 'Permanent',
  PROBATION: 'Probation',
  CONTRACT: 'Contract',
  APPRENTICE: 'Apprentice',
  TRAINEE: 'Trainee',
  CONSULTANT: 'Consultant',
  TEMPORARY: 'Temporary',
}

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  CASUAL: 'Casual',
  SICK: 'Sick',
  EARNED: 'Earned',
  MATERNITY: 'Maternity',
  PATERNITY: 'Paternity',
  COMP_OFF: 'Comp-off',
  LOSS_OF_PAY: 'Loss of pay',
}

export const SKILL_LEVEL_LABEL: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  SKILLED: 'Skilled',
  EXPERT: 'Expert',
  TRAINER: 'Trainer',
}

export const INCENTIVE_MODEL_LABEL: Record<string, string> = {
  PER_UNIT: 'Per unit',
  PER_BATCH: 'Per batch',
  TEAM: 'Team based',
  DEPARTMENT: 'Department',
  MONTHLY_BONUS: 'Monthly bonus',
  PRODUCTIVITY_BONUS: 'Productivity bonus',
}

export const SHIFT_TYPE_LABEL: Record<string, string> = {
  GENERAL: 'General',
  MORNING: 'Morning',
  EVENING: 'Evening',
  NIGHT: 'Night',
  ROTATIONAL: 'Rotational',
  SPLIT: 'Split',
}

export const ORG_LEVEL_LABEL: Record<string, string> = {
  COMPANY: 'Company',
  DIVISION: 'Division',
  PLANT: 'Plant',
  DEPARTMENT: 'Department',
  SECTION: 'Section',
  LINE: 'Line',
}
