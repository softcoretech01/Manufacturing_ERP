import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({
  className,
  children,
  padded = false,
}: {
  className?: string
  children: ReactNode
  padded?: boolean
}) {
  return <div className={cn('card', padded && 'p-4', className)}>{children}</div>
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-border px-4 py-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 shrink-0 text-fg-subtle">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-4', className)}>{children}</div>
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-t border-border px-4 py-3', className)}>
      {children}
    </div>
  )
}

/** Label/value pair used throughout detail panels. */
export function DataRow({
  label,
  value,
  className,
  mono,
}: {
  label: ReactNode
  value: ReactNode
  className?: string
  mono?: boolean
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5', className)}>
      <span className="shrink-0 text-xs text-fg-muted">{label}</span>
      <span className={cn('min-w-0 truncate text-right text-sm text-fg', mono && 'font-mono text-xs')}>
        {value ?? '—'}
      </span>
    </div>
  )
}

export function DataGrid({
  items,
  columns = 2,
  className,
}: {
  items: { label: ReactNode; value: ReactNode; mono?: boolean }[]
  columns?: 1 | 2 | 3 | 4
  className?: string
}) {
  const cols = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }
  return (
    <div className={cn('grid grid-cols-1 gap-x-8', cols[columns], className)}>
      {items.map((it, i) => (
        <DataRow key={i} label={it.label} value={it.value} mono={it.mono} />
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-fg-subtle">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} />
}
