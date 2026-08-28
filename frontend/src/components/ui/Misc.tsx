import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Info, Lightbulb, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

/* ─────────────────────────── Page header ─────────────────────────── */

export function PageHeader({
  title,
  breadcrumbs,
  actions,
  tabs,
  badge,
}: {
  title: ReactNode
  /**
   * Accepted but not rendered. Screens carry a title and a breadcrumb; the
   * explanatory paragraph under it was noise on every page, so it is dropped
   * centrally rather than deleted from forty call sites.
   */
  description?: ReactNode
  breadcrumbs?: { label: string; to?: string }[]
  actions?: ReactNode
  tabs?: ReactNode
  badge?: ReactNode
}) {
  return (
    <div className="mb-4">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-1.5 flex items-center gap-1 text-2xs text-fg-subtle" aria-label="Breadcrumb">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              {b.to ? (
                <Link to={b.to} className="hover:text-fg-muted hover:underline">
                  {b.label}
                </Link>
              ) : (
                <span className="text-fg-muted">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-xl font-semibold tracking-tight text-fg">{title}</h1>
            {badge}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-3">{tabs}</div>}
    </div>
  )
}

/* ─────────────────────────── Alerts ─────────────────────────── */

const ALERT_STYLES = {
  info: { cls: 'border-progress/30 bg-progress/5 text-progress', Icon: Info },
  warning: { cls: 'border-warning/30 bg-warning/5 text-warning', Icon: AlertTriangle },
  danger: { cls: 'border-danger/30 bg-danger/5 text-danger', Icon: ShieldAlert },
  tip: { cls: 'border-brand-500/30 bg-brand-500/5 text-brand-600', Icon: Lightbulb },
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof ALERT_STYLES
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const style = ALERT_STYLES[tone] || ALERT_STYLES['info']
  const { cls, Icon } = style
  return (
    <div className={cn('flex items-start gap-2.5 rounded border px-3 py-2.5', cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-medium">{title}</p>}
        {children && <div className={cn('text-xs text-fg-muted', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* ─────────────────────────── Avatar ─────────────────────────── */

const AVATAR_COLOURS = [
  'bg-brand-500/15 text-brand-600',
  'bg-success/15 text-success',
  'bg-pending/15 text-pending',
  'bg-danger/15 text-danger',
  'bg-progress/15 text-progress',
  'bg-warning/15 text-warning',
]

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizes = {
    xs: 'h-5 w-5 text-[9px]',
    sm: 'h-6 w-6 text-2xs',
    md: 'h-8 w-8 text-xs',
    lg: 'h-11 w-11 text-sm',
  }
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase',
        sizes[size],
        AVATAR_COLOURS[hash % AVATAR_COLOURS.length],
        className,
      )}
      title={name}
    >
      {initials(name)}
    </span>
  )
}

/* ─────────────────────────── KPI tile ─────────────────────────── */

export function StatTile({
  label,
  value,
  sub,
  delta,
  icon,
  tone = 'brand',
  onClick,
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  delta?: { value: number; label?: string }
  icon?: ReactNode
  tone?: 'brand' | 'success' | 'danger' | 'warning' | 'pending' | 'progress' | 'neutral'
  onClick?: () => void
  className?: string
}) {
  const tones = {
    brand: 'text-brand-600 bg-brand-500/10',
    success: 'text-success bg-success/10',
    danger: 'text-danger bg-danger/10',
    warning: 'text-warning bg-warning/10',
    pending: 'text-pending bg-pending/10',
    progress: 'text-progress bg-progress/10',
    neutral: 'text-fg-muted bg-surface-3',
  }
  return (
    <div
      onClick={onClick}
      className={cn(
        'card p-3.5 transition-colors',
        onClick && 'cursor-pointer hover:border-border-strong hover:bg-surface-2',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
        {icon && (
          <span className={cn('flex h-7 w-7 items-center justify-center rounded [&>svg]:h-3.5 [&>svg]:w-3.5', tones[tone])}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-fg tabular">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {delta && (
          <span
            className={cn(
              'text-2xs font-medium tabular',
              delta.value >= 0 ? 'text-success' : 'text-danger',
            )}
          >
            {delta.value >= 0 ? '▲' : '▼'} {Math.abs(delta.value).toFixed(1)}%
            {delta.label && <span className="ml-1 font-normal text-fg-subtle">{delta.label}</span>}
          </span>
        )}
        {sub && <span className="text-2xs text-fg-subtle">{sub}</span>}
      </div>
    </div>
  )
}

/* ─────────────────────────── Section ─────────────────────────── */

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-6', className)}>
      {(title || actions) && (
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/* ─────────────────────────── Progress ─────────────────────────── */

export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  showLabel,
  className,
  height = 'h-1.5',
}: {
  value: number
  max?: number
  tone?: 'brand' | 'success' | 'danger' | 'warning'
  showLabel?: boolean
  className?: string
  height?: string
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const tones = {
    brand: 'bg-brand-500',
    success: 'bg-success',
    danger: 'bg-danger',
    warning: 'bg-warning',
  }
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex-1 overflow-hidden rounded-full bg-surface-3', height)}>
        <div className={cn('h-full rounded-full transition-all', tones[tone])} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="w-9 shrink-0 text-right text-2xs text-fg-muted tabular">{pct.toFixed(0)}%</span>}
    </div>
  )
}

/* ─────────────────────────── Tooltip (title-based, lightweight) ────────── */

export function InfoHint({ text, className }: { text: string; className?: string }) {
  return (
    <span title={text} className={cn('inline-flex cursor-help text-fg-subtle', className)}>
      <Info className="h-3.5 w-3.5" />
    </span>
  )
}
