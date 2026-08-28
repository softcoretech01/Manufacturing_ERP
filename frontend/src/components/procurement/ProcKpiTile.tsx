/**
 * ProcKpiTile — clickable KPI card that opens a drill-down panel.
 *
 * A count on its own tells a buyer there is a problem but not which documents
 * are the problem, so every tile here is a way into the list behind it. Pair it
 * with ProcDetailsPanel: the tile owns `active`, the panel owns the rows.
 *
 * Sibling of components/inventory/InvKpiTile.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const TONE = {
  brand: { bg: 'bg-brand-500/10', text: 'text-brand-600', border: 'border-l-brand-500', dot: 'bg-brand-500' },
  success: { bg: 'bg-success/10', text: 'text-success', border: 'border-l-success', dot: 'bg-success' },
  danger: { bg: 'bg-danger/10', text: 'text-danger', border: 'border-l-danger', dot: 'bg-danger' },
  warning: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-l-warning', dot: 'bg-warning' },
  pending: { bg: 'bg-pending/10', text: 'text-pending', border: 'border-l-pending', dot: 'bg-pending' },
  progress: { bg: 'bg-progress/10', text: 'text-progress', border: 'border-l-progress', dot: 'bg-progress' },
  neutral: { bg: 'bg-surface-3', text: 'text-fg-muted', border: 'border-l-border-strong', dot: 'bg-border-strong' },
} as const

export type ProcKpiTone = keyof typeof TONE

export function ProcKpiTile({
  label,
  value,
  sub,
  icon,
  tone = 'brand',
  active = false,
  loading = false,
  onClick,
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  tone?: ProcKpiTone
  active?: boolean
  loading?: boolean
  onClick?: () => void
  className?: string
}) {
  const t = TONE[tone]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      // The pressed state is what tells the user which tile the panel below
      // belongs to, so it is announced as well as drawn.
      aria-pressed={onClick ? active : undefined}
      className={cn(
        'group relative flex flex-col gap-3 rounded-2xl border bg-surface p-5 text-left transition-all duration-200',
        active
          ? `border-l-4 ${t.border} bg-surface-2 shadow-md`
          : 'border-border hover:border-border-strong hover:shadow-sm',
        onClick && 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/40',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase leading-tight tracking-wider text-fg-muted">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 [&>svg]:h-4 [&>svg]:w-4',
              t.bg, t.text,
              onClick && 'group-hover:scale-110',
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-8 w-24 animate-pulse rounded bg-surface-3" />
      ) : (
        <p className={cn('text-2xl font-bold leading-none tabular-nums', t.text)}>{value}</p>
      )}

      {sub && <p className="text-xs leading-snug text-fg-muted">{sub}</p>}

      {active && <span className={cn('absolute bottom-2 right-2 h-2 w-2 rounded-full', t.dot)} aria-hidden />}
    </Tag>
  )
}
