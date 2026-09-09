import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * A row of summary facts above a grid — run number, totals, as-of date.
 *
 * Exists because the hand-rolled versions of this clipped. The pattern that
 * failed was `flex flex-wrap` with `ml-auto` on a trailing group: `ml-auto`
 * consumes the free space that wrapping needs, so instead of moving to a second
 * line the group ran past the right edge and the last facts were cut off
 * ("Buy 47, Ma…").
 *
 * Here every item is `shrink-0` and there is no auto margin, so the strip
 * always wraps rather than overflowing — at any width, on any screen.
 */

export interface InfoStripItem {
  /** Short label. Kept separate from the value so the value can be emphasised. */
  label: ReactNode
  value: ReactNode
  icon?: ReactNode
  /** Draws the value in the danger colour — for counts that mean trouble. */
  alert?: boolean
}

export function InfoStrip({
  items,
  lead,
  trail,
  className,
}: {
  items: InfoStripItem[]
  /** Rendered first, before the facts — a document number, usually. */
  lead?: ReactNode
  /** Rendered last, de-emphasised — an as-of date, usually. */
  trail?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border',
        'bg-surface px-4 py-3 text-[13px]',
        className,
      )}
    >
      {lead && <span className="shrink-0">{lead}</span>}
      {items.map((it, i) => (
        <span
          key={i}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-fg-muted"
        >
          {it.icon}
          {it.label}{' '}
          <b className={cn('tabular-nums', it.alert ? 'text-danger' : 'text-fg')}>{it.value}</b>
        </span>
      ))}
      {trail && <span className="shrink-0 text-fg-subtle">{trail}</span>}
    </div>
  )
}

export default InfoStrip
