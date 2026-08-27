import type { ReactNode } from 'react'
import { Badge, type StatusTone } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { usePermissions } from '@/store/auth'

/**
 * Seeing a quantity must not imply seeing what it cost. A shift supervisor
 * counts pieces; only production management and finance see the money. Same
 * split the inventory module uses (V4-INV-BR-004).
 */
export function useCanSeeCost() {
  const { has } = usePermissions()
  return has('PRODUCTION.REPORT.VIEW_VALUE') || has('PRODUCTION.SCRAP.VIEW_VALUE')
}

/* ─────────────────────────── Status vocabulary ─────────────────────────── */

const MES_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  // Production order
  PLANNED: { tone: 'draft', label: 'Planned' },
  RELEASED: { tone: 'brand', label: 'Released' },
  MATERIAL_ALLOCATED: { tone: 'progress', label: 'Material allocated' },
  IN_PROGRESS: { tone: 'progress', label: 'In progress' },
  ON_HOLD: { tone: 'warning', label: 'On hold' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  CLOSED: { tone: 'neutral', label: 'Closed' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
  // Work order
  QUEUED: { tone: 'neutral', label: 'Queued' },
  READY: { tone: 'brand', label: 'Ready' },
  SETUP: { tone: 'warning', label: 'Setting up' },
  RUNNING: { tone: 'success', label: 'Running' },
  PAUSED: { tone: 'warning', label: 'Paused' },
  QC_HOLD: { tone: 'danger', label: 'QC hold' },
  // Machine
  IDLE: { tone: 'neutral', label: 'Idle' },
  BREAKDOWN: { tone: 'danger', label: 'Breakdown' },
  MAINTENANCE: { tone: 'warning', label: 'Maintenance' },
  OFF: { tone: 'neutral', label: 'Off' },
  // WIP
  IN_PROCESS: { tone: 'progress', label: 'In process' },
  QUALITY_HOLD: { tone: 'danger', label: 'Quality hold' },
  WAITING: { tone: 'warning', label: 'Waiting' },
  TRANSFERRED: { tone: 'success', label: 'Transferred' },
  // Rework & scrap
  RAISED: { tone: 'pending', label: 'Raised' },
  IN_REPAIR: { tone: 'progress', label: 'In repair' },
  INSPECTION: { tone: 'warning', label: 'Inspection' },
  ACCEPTED: { tone: 'success', label: 'Accepted' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  OPEN: { tone: 'warning', label: 'Open' },
  ACTIONED: { tone: 'progress', label: 'Actioned' },
  // QC
  PENDING: { tone: 'pending', label: 'Pending' },
  PASSED: { tone: 'success', label: 'Passed' },
  FAILED: { tone: 'danger', label: 'Failed' },
  NOT_REQUIRED: { tone: 'neutral', label: 'Not required' },
  // Documents
  DRAFT: { tone: 'draft', label: 'Draft' },
  APPROVED: { tone: 'success', label: 'Approved' },
  SUPERSEDED: { tone: 'neutral', label: 'Superseded' },
}

export function MesStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const e = MES_STATUS[status] ?? { tone: 'neutral' as StatusTone, label: status.replace(/_/g, ' ').toLowerCase() }
  return (
    <Badge tone={e.tone} size={size}>
      {e.label}
    </Badge>
  )
}

/* ─────────────────────────── Shop-floor cells ─────────────────────────── */

/** A live machine dot — colour plus text, never colour alone. */
export function MachineDot({ state }: { state: string }) {
  const map: Record<string, string> = {
    RUNNING: 'bg-success',
    IDLE: 'bg-neutral',
    SETUP: 'bg-warning',
    BREAKDOWN: 'bg-danger animate-pulse',
    MAINTENANCE: 'bg-warning',
    OFF: 'bg-border-strong',
  }
  return <span className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', map[state] ?? 'bg-neutral')} />
}

/** Progress of a work order or an order, as a bar plus the two numbers. */
export function ProgressCell({ done, total, tone }: { done: number; total: number; tone?: 'brand' | 'success' | 'warning' }) {
  const pct = total ? Math.min(100, (done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn('h-full rounded-full', pct >= 100 ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-brand-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-2xs tabular text-fg-muted">
        {done.toLocaleString('en-IN')}/{total.toLocaleString('en-IN')}
      </span>
    </div>
  )
}

/** Operation, in the order the shop floor reads it: sequence then name. */
export function OperationCell({ sequence, name, workCentre }: { sequence: number; name: string; workCentre?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-medium text-fg">
        <span className="mr-1.5 font-mono text-2xs text-fg-subtle">{String(sequence).padStart(2, '0')}</span>
        {name}
      </p>
      {workCentre && <p className="truncate text-2xs text-fg-subtle">{workCentre}</p>}
    </div>
  )
}

/** Minutes shown the way a supervisor says them: 3 h 20 m, not 200. */
export function Duration({ minutes }: { minutes: number }) {
  if (!minutes) return <span className="text-2xs text-fg-subtle">—</span>
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return <span className="tabular text-2xs text-fg-muted">{h ? `${h} h ` : ''}{m} m</span>
}

/** Actual against standard time, coloured on overrun. */
export function EfficiencyChip({ standard, actual }: { standard: number; actual: number }) {
  if (!actual || !standard) return <span className="text-2xs text-fg-subtle">—</span>
  const pct = (standard / actual) * 100
  return (
    <span className={cn('tabular text-2xs', pct >= 100 ? 'text-success' : pct >= 90 ? 'text-fg-muted' : 'text-warning')}>
      {pct.toFixed(0)}%
    </span>
  )
}

/** OEE gauge — the three factors and their product, all visible at once. */
export function OeeBar({ availability, performance, quality }: { availability: number; performance: number; quality: number }) {
  const oee = (availability * performance * quality) / 10_000
  const tone = oee >= 85 ? 'text-success' : oee >= 70 ? 'text-warning' : 'text-danger'
  return (
    <div>
      <p className={cn('text-2xl font-semibold tabular', tone)}>{oee.toFixed(1)}%</p>
      <div className="mt-1.5 space-y-1">
        {[
          { label: 'Availability', value: availability, cls: 'bg-brand-500' },
          { label: 'Performance', value: performance, cls: 'bg-progress' },
          { label: 'Quality', value: quality, cls: 'bg-success' },
        ].map((f) => (
          <div key={f.label} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-2xs text-fg-muted">{f.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div className={cn('h-full rounded-full', f.cls)} style={{ width: `${Math.min(100, f.value)}%` }} />
            </div>
            <span className="w-11 shrink-0 text-right text-2xs tabular text-fg">{f.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MesDetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{title}</p>
      {children}
    </div>
  )
}

/** Chart tooltip shared by every shop-floor chart. */
export function MesChartTip({ active, payload, label, suffix = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-border bg-surface px-2.5 py-1.5 shadow-pop">
      <p className="mb-1 text-2xs font-medium text-fg">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-1.5 text-2xs text-fg-muted">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color ?? p.fill }} />
          {p.name}: <span className="font-medium tabular text-fg">{typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}{suffix}</span>
        </p>
      ))}
    </div>
  )
}

export const MES_COLOURS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export const SCRAP_REASON_LABEL: Record<string, string> = {
  WELDING_DEFECT: 'Welding defect',
  LEAK_FAILURE: 'Leak failure',
  DENT: 'Dent',
  SCRATCH: 'Scratch',
  PAINT_DEFECT: 'Paint defect',
  PRINTING_ERROR: 'Printing error',
  DIMENSION_FAILURE: 'Dimension failure',
  MATERIAL_DEFECT: 'Material defect',
}

export const DOWNTIME_REASON_LABEL: Record<string, string> = {
  PLANNED_MAINTENANCE: 'Planned maintenance',
  BREAKDOWN: 'Breakdown',
  POWER_FAILURE: 'Power failure',
  TOOL_CHANGE: 'Tool change',
  MATERIAL_SHORTAGE: 'Material shortage',
  OPERATOR_UNAVAILABLE: 'Operator unavailable',
  WAITING_FOR_QC: 'Waiting for QC',
  CHANGEOVER: 'Changeover',
}
