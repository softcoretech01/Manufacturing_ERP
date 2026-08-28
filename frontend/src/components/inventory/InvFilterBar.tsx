/**
 * InvFilterBar — Shared white filter card for inventory pages.
 * White rounded-2xl card with left slot (search + selects) and right slot (date filter + export).
 *
 * Usage:
 *   <InvFilterBar
 *     left={<><Input .../> <Select .../></>}
 *     right={<><InvDateFilter .../> <Button .../></>}
 *   />
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function InvFilterBar({
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

/** Small search input styled for InvFilterBar */
export function InvSearch({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <svg
        className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-56 rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand-500/20"
      />
    </div>
  )
}

/** Small select styled for InvFilterBar */
export function InvSelect({
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
      <label className="text-2xs font-medium uppercase tracking-wider text-fg-muted">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
