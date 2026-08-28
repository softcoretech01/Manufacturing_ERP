/**
 * InvDateFilter — Draft + apply date range filter.
 * Filters don't fire until the user clicks "Apply".
 * Matches the CareFusions DateFilter component pattern.
 *
 * Usage:
 *   const [range, setRange] = useState({ from: '', to: '' })
 *   <InvDateFilter value={range} onChange={setRange} />
 */
import { useState } from 'react'
import { CalendarDays, RotateCcw, Search } from 'lucide-react'

export interface DateRange {
  from: string
  to: string
}

export function InvDateFilter({
  value,
  onChange,
}: {
  value: DateRange
  onChange: (r: DateRange) => void
}) {
  // Draft state — doesn't propagate until Apply is clicked
  const [draft, setDraft] = useState<DateRange>(value)

  function apply() {
    onChange(draft)
  }

  function reset() {
    const empty = { from: '', to: '' }
    setDraft(empty)
    onChange(empty)
  }

  const hasFilter = !!(value.from || value.to)

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5">
        <CalendarDays className="h-3.5 w-3.5 text-fg-subtle" />
        <input
          type="date"
          value={draft.from}
          onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          className="w-36 bg-transparent text-xs text-fg placeholder:text-fg-subtle focus:outline-none"
          placeholder="From date"
        />
        <span className="text-xs text-fg-subtle">→</span>
        <input
          type="date"
          value={draft.to}
          onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          className="w-36 bg-transparent text-xs text-fg placeholder:text-fg-subtle focus:outline-none"
          placeholder="To date"
        />
      </div>

      <button
        onClick={apply}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white transition-colors hover:bg-brand-600"
      >
        <Search className="h-3.5 w-3.5" />
        Apply
      </button>

      {hasFilter && (
        <button
          onClick={reset}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      )}
    </div>
  )
}
