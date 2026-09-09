import type { ReactNode } from 'react'
import { AlertTriangle, RotateCw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { cn } from '@/lib/cn'

/**
 * The pieces every planning list screen needs, in one place.
 *
 * Each screen used to roll its own filter row and its own "nothing here"
 * message, which is why one screen said "No data" for a failed request and the
 * next said it for an empty filter. Those are three different situations and a
 * planner has to be able to tell them apart:
 *
 *   nothing exists yet   → the screen explains how to create the first record
 *   filters match none   → the screen offers to clear the filters
 *   the request failed   → the screen says so, and offers to retry
 *
 * Showing "no records" for a failed request is the worst of the three: it reads
 * as a business fact when it is a network problem.
 */

// ── Error ───────────────────────────────────────────────────────────────────

export function ErrorState({
  title = 'Unable to load this screen',
  detail,
  onRetry,
  className,
}: {
  title?: string
  detail?: ReactNode
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-6 py-10 text-center',
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <div className="max-w-md">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {detail && <p className="mt-1 text-[13px] text-fg-muted">{detail}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" icon={<RotateCw className="h-3.5 w-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

// ── Loading ─────────────────────────────────────────────────────────────────

/**
 * Skeleton rows, sized to the grid they stand in for.
 *
 * A spinner over an empty page reads as "frozen"; rows of the right shape read
 * as "arriving", and the layout does not jump when the data lands.
 */
export function TableSkeleton({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border" aria-busy="true" aria-live="polite">
      <div className="flex gap-4 border-b border-border bg-surface-2 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-3 flex-1 animate-pulse rounded bg-surface-3" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-border/50 px-4 py-4">
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="h-3.5 flex-1 animate-pulse rounded bg-surface-3"
              style={{ animationDelay: `${(r * columns + c) * 25}ms` }}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}

// ── Filters ─────────────────────────────────────────────────────────────────

export interface FilterState {
  search: string
  from: string
  to: string
  status: string
}

export const EMPTY_FILTERS: FilterState = { search: '', from: '', to: '', status: '' }

/** True when the user has narrowed the list — drives the "no matches" wording. */
export function hasFilters(f: FilterState) {
  return !!(f.search.trim() || f.from || f.to || f.status)
}

/**
 * One horizontal filter row, identical on every planning list.
 *
 * Wraps rather than scrolls on a narrow viewport, so nothing is ever cut off or
 * pushed out of reach on a tablet.
 */
export function FilterBar({
  value,
  onChange,
  statuses,
  searchPlaceholder = 'Search…',
  dateLabel = 'Required date',
  extra,
}: {
  value: FilterState
  onChange: (next: FilterState) => void
  /** Status options. Omit to hide the status field entirely. */
  statuses?: { value: string; label: string }[]
  searchPlaceholder?: string
  /** What the date range filters on — named so the planner is not guessing. */
  dateLabel?: string
  extra?: ReactNode
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch })
  const dirty = hasFilters(value)

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <Input
        containerClassName="min-w-[16rem] flex-1"
        label="Search"
        leftIcon={<Search className="h-4 w-4" />}
        placeholder={searchPlaceholder}
        value={value.search}
        onChange={(e) => set({ search: e.target.value })}
      />
      <Input
        containerClassName="w-[10.5rem]"
        label={`${dateLabel} from`}
        type="date"
        value={value.from}
        onChange={(e) => set({ from: e.target.value })}
      />
      <Input
        containerClassName="w-[10.5rem]"
        label={`${dateLabel} to`}
        type="date"
        value={value.to}
        onChange={(e) => set({ to: e.target.value })}
      />
      {statuses && (
        <Select
          containerClassName="w-[11rem]"
          label="Status"
          value={value.status}
          onChange={(e) => set({ status: e.target.value })}
          options={[{ value: '', label: 'All statuses' }, ...statuses]}
        />
      )}
      {extra}
      <Button
        variant="ghost"
        size="sm"
        icon={<X className="h-3.5 w-3.5" />}
        disabled={!dirty}
        onClick={() => onChange(EMPTY_FILTERS)}
        className="mb-0.5"
      >
        Clear
      </Button>
    </div>
  )
}

/**
 * Apply the filter row to a list.
 *
 * Kept here rather than in each screen so "from" and "to" mean the same thing
 * everywhere: both bounds inclusive, compared on the date only.
 */
export function applyFilters<T>(
  rows: T[],
  f: FilterState,
  get: (row: T) => { text: string[]; date?: string | null; status?: string },
): T[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((row) => {
    const { text, date, status } = get(row)
    if (q && !text.some((v) => (v ?? '').toLowerCase().includes(q))) return false
    if (f.status && status !== f.status) return false
    if (f.from && (!date || date < f.from)) return false
    if (f.to && (!date || date > f.to)) return false
    return true
  })
}
