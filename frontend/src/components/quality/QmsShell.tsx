import { useMemo, type ReactNode } from 'react'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { DISPOSITION_LABEL, NCR_STATUS_LABEL, STAGE_LABEL, evaluateReading } from '@/lib/qmsFlow'
import {
  audits as seedAudits,
  capas as seedCapas,
  complaints as seedComplaints,
  defectTypes as seedDefects,
  inspectionPlans as seedPlans,
  inspections as seedInspections,
  instruments as seedInstruments,
  ncrs as seedNcrs,
  supplierQuality as seedSupplierQuality,
} from '@/mock/quality'
import type {
  Capa,
  Complaint,
  DefectSeverity,
  DefectType,
  Disposition,
  Inspection,
  InspectionPlan,
  InspectionReading,
  Instrument,
  Ncr,
  QualityAudit,
  SupplierQualityRecord,
} from '@/types/quality'

/**
 * One place where every quality screen binds to its data. Eleven screens
 * reading the same records means the dashboard cannot disagree with the screen
 * you click into.
 */
export function useQualityData() {
  const plans = useCollection<InspectionPlan>('qms:plans', useMemo(() => seedPlans, []))
  const inspections = useCollection<Inspection>('qms:inspections', useMemo(() => seedInspections, []))
  const instruments = useCollection<Instrument>('qms:instruments', useMemo(() => seedInstruments, []))
  const defects = useCollection<DefectType>('qms:defects', useMemo(() => seedDefects, []))
  const ncrs = useCollection<Ncr>('qms:ncrs', useMemo(() => seedNcrs, []))
  const capas = useCollection<Capa>('qms:capas', useMemo(() => seedCapas, []))
  const complaints = useCollection<Complaint>('qms:complaints', useMemo(() => seedComplaints, []))
  const audits = useCollection<QualityAudit>('qms:audits', useMemo(() => seedAudits, []))
  const supplierQuality = useCollection<SupplierQualityRecord>('qms:supplierQuality', useMemo(() => seedSupplierQuality, []))

  return { plans, inspections, instruments, defects, ncrs, capas, complaints, audits, supplierQuality }
}

/* ─────────────────────────── Badges ─────────────────────────── */

const QMS_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  DRAFT: { tone: 'draft', label: 'Draft' },
  ACTIVE: { tone: 'success', label: 'Active' },
  SUPERSEDED: { tone: 'neutral', label: 'Superseded' },
  OBSOLETE: { tone: 'neutral', label: 'Obsolete' },
  PENDING: { tone: 'draft', label: 'Pending' },
  IN_PROGRESS: { tone: 'progress', label: 'In progress' },
  PENDING_APPROVAL: { tone: 'pending', label: 'Pending approval' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
  // Instruments
  VALID: { tone: 'success', label: 'Valid' },
  DUE: { tone: 'warning', label: 'Due soon' },
  OVERDUE: { tone: 'danger', label: 'Overdue' },
  UNDER_CALIBRATION: { tone: 'progress', label: 'At the agency' },
  CONDEMNED: { tone: 'neutral', label: 'Condemned' },
  // CAPA
  OPEN: { tone: 'pending', label: 'Open' },
  VERIFICATION: { tone: 'progress', label: 'Verification' },
  CLOSED: { tone: 'neutral', label: 'Closed' },
  // Complaints
  LOGGED: { tone: 'pending', label: 'Logged' },
  UNDER_INVESTIGATION: { tone: 'progress', label: 'Under investigation' },
  ROOT_CAUSE_IDENTIFIED: { tone: 'warning', label: 'Root cause identified' },
  RESOLVED: { tone: 'success', label: 'Resolved' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  // Audits
  PLANNED: { tone: 'draft', label: 'Planned' },
  REPORTED: { tone: 'progress', label: 'Reported' },
  ACTIONS_OPEN: { tone: 'warning', label: 'Actions open' },
  // NCR
  CONTAINED: { tone: 'progress', label: 'Contained' },
  CORRECTIVE_ACTION: { tone: 'warning', label: 'Corrective action' },
}

export function QmsStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const e = QMS_STATUS[status] ?? { tone: 'neutral' as StatusTone, label: status.replace(/_/g, ' ').toLowerCase() }
  return (
    <Badge tone={e.tone} size={size}>
      {e.label}
    </Badge>
  )
}

export function NcrStatusBadge({ status, size = 'sm' }: { status: Ncr['status']; size?: 'sm' | 'md' }) {
  const tone = QMS_STATUS[status]?.tone ?? 'progress'
  return (
    <Badge tone={tone} size={size}>
      {NCR_STATUS_LABEL[status]}
    </Badge>
  )
}

const DISPOSITION_TONE: Record<Disposition, StatusTone> = {
  PENDING: 'draft',
  ACCEPTED: 'success',
  ACCEPTED_WITH_DEVIATION: 'warning',
  REJECTED: 'danger',
  HOLD: 'pending',
}

export function DispositionBadge({ disposition, size = 'sm' }: { disposition: Disposition; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={DISPOSITION_TONE[disposition]} size={size}>
      {DISPOSITION_LABEL[disposition]}
    </Badge>
  )
}

const SEVERITY_TONE: Record<DefectSeverity, StatusTone> = { CRITICAL: 'danger', MAJOR: 'warning', MINOR: 'neutral' }

export function SeverityBadge({ severity }: { severity: DefectSeverity }) {
  return (
    <Badge tone={SEVERITY_TONE[severity]} size="sm" dot={false}>
      {severity.charAt(0) + severity.slice(1).toLowerCase()}
    </Badge>
  )
}

export function StageBadge({ stage }: { stage: Inspection['stage'] }) {
  const tone: Record<Inspection['stage'], StatusTone> = {
    IQC: 'brand',
    FIRST_PIECE: 'progress',
    IPQC: 'warning',
    FQC: 'success',
    OQA: 'neutral',
  }
  return (
    <Badge tone={tone[stage]} size="sm" dot={false}>
      {STAGE_LABEL[stage]}
    </Badge>
  )
}

export function GradeBadge({ grade }: { grade: string }) {
  const tone: Record<string, StatusTone> = { PREFERRED: 'success', APPROVED: 'brand', CONDITIONAL: 'warning', BLOCKED: 'danger' }
  return (
    <Badge tone={tone[grade] ?? 'neutral'} size="sm">
      {grade.charAt(0) + grade.slice(1).toLowerCase()}
    </Badge>
  )
}

/* ─────────────────────────── Reading verdict ─────────────────────────── */

/** A reading's verdict with its limits, so a fail is self-explaining. */
export function VerdictCell({ reading }: { reading: InspectionReading }) {
  const v = evaluateReading(reading)
  if (v === 'PENDING') return <span className="text-2xs text-fg-subtle">Not checked</span>
  return (
    <span className={cn('text-2xs font-medium', v === 'PASS' ? 'text-success' : 'text-danger')}>
      {v === 'PASS' ? 'Pass' : 'Fail'}
    </span>
  )
}

/** Where a reading sits inside its tolerance band. */
export function ToleranceBar({ reading }: { reading: InspectionReading }) {
  if (reading.type !== 'MEASURED' || reading.actual === null || reading.lowerLimit === null || reading.upperLimit === null) {
    return <span className="text-2xs text-fg-subtle">—</span>
  }
  const span = reading.upperLimit - reading.lowerLimit
  if (span <= 0) return <span className="text-2xs text-fg-subtle">—</span>
  const pos = ((reading.actual - reading.lowerLimit) / span) * 100
  const inside = pos >= 0 && pos <= 100
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-20 shrink-0 rounded-full bg-surface-3">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-strong" />
        <div
          className={cn('absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full', inside ? 'bg-success' : 'bg-danger')}
          style={{ left: `${Math.max(0, Math.min(100, pos))}%`, marginLeft: '-4px' }}
        />
      </div>
      <span className={cn('text-2xs tabular', inside ? 'text-fg-muted' : 'text-danger')}>
        {reading.actual}
        {reading.uom && ` ${reading.uom}`}
      </span>
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

/** Days overdue, coloured but never colour-only. */
export function DueChip({ days }: { days: number }) {
  if (days <= 0) return <span className="text-2xs text-success">On time</span>
  return <span className={cn('text-2xs font-medium', days > 14 ? 'text-danger' : 'text-warning')}>{days}d overdue</span>
}

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
