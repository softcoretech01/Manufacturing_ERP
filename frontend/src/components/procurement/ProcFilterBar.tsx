/**
 * ProcFilterBar — the filter card that sits above every procurement list.
 *
 * One card, a left slot for what narrows the list (search, selects, date range)
 * and a right slot for what acts on it (export, new document). Sibling of
 * components/inventory/InvFilterBar, so the two modules filter identically.
 */
import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/cn'

export function ProcFilterBar({
  left,
  right,
  className,
}: {
  left?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm',
        className,
      )}
    >
      {left && <div className="flex flex-wrap items-end gap-3">{left}</div>}
      {right && <div className="flex flex-wrap items-end gap-2">{right}</div>}
    </div>
  )
}

/** Search box styled for ProcFilterBar. */
export function ProcSearch({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="text-2xs font-medium uppercase tracking-wider text-fg-muted">{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="h-9 w-64 rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand-500/20"
        />
      </div>
    </div>
  )
}

/** Select styled for ProcFilterBar. */
export function ProcSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="text-2xs font-medium uppercase tracking-wider text-fg-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
