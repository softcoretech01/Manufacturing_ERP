/**
 * InvKpiTile — Clickable KPI card for inventory dashboards.
 * Matches the CareFusions "DetailsPanel trigger" pattern.
 *
 * Usage:
 *   <InvKpiTile label="Items in Stock" value={342} icon={<Boxes />} tone="brand"
 *     active={open === 'stock'} onClick={() => setOpen('stock')} />
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const TONE = {
  brand:   { bg: 'bg-brand-500/10',  text: 'text-brand-600',   border: 'border-l-brand-500' },
  success: { bg: 'bg-success/10',    text: 'text-success',      border: 'border-l-success' },
  danger:  { bg: 'bg-danger/10',     text: 'text-danger',       border: 'border-l-danger' },
  warning: { bg: 'bg-warning/10',    text: 'text-warning',      border: 'border-l-warning' },
  pending: { bg: 'bg-pending/10',    text: 'text-pending',      border: 'border-l-pending' },
  progress:{ bg: 'bg-progress/10',   text: 'text-progress',     border: 'border-l-progress' },
  neutral: { bg: 'bg-surface-3',     text: 'text-fg-muted',     border: 'border-l-border-strong' },
} as const

export type InvKpiTone = keyof typeof TONE

export interface InvKpiTileProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  tone?: InvKpiTone
  active?: boolean
  loading?: boolean
  onClick?: () => void
  className?: string
}

export function InvKpiTile({
  label,
  value,
  sub,
  icon,
  tone = 'brand',
  active = false,
  loading = false,
  onClick,
  className,
}: InvKpiTileProps) {
  const t = TONE[tone]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-3 rounded-2xl border bg-surface p-5 text-left transition-all duration-200',
        active
          ? `border-l-4 ${t.border} shadow-md bg-surface-2`
          : 'border-border hover:border-border-strong hover:shadow-sm',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {/* Icon + label row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted leading-tight">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&>svg]:h-4.5 [&>svg]:w-4.5 transition-transform duration-200',
              t.bg, t.text,
              onClick && 'group-hover:scale-110',
            )}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div className="h-8 w-24 animate-pulse rounded bg-surface-3" />
      ) : (
        <p className={cn('text-2xl font-bold tabular-nums leading-none', t.text)}>{value}</p>
      )}

      {/* Sub-text */}
      {sub && <p className="text-xs text-fg-muted leading-snug">{sub}</p>}

      {/* Active indicator dot */}
      {active && (
        <span
          className={cn(
            'absolute bottom-2 right-2 h-2 w-2 rounded-full',
            t.text.replace('text-', 'bg-'),
          )}
        />
      )}
    </Tag>
  )
}
