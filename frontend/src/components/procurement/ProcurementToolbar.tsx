import { Input } from '@/components/ui/Input'
import { ProcDateFilter, type ProcDateRange } from './ProcDateFilter'

export interface ProcurementToolbarProps {
  search: string
  onSearchChange: (v: string) => void
  dateFrom: string
  onDateFromChange: (v: string) => void
  dateTo: string
  onDateToChange: (v: string) => void
  onReset: () => void
  /** What this screen actually searches, e.g. "PR number, item or requester". */
  searchHint?: string
  /** Which business date the range filters, e.g. "Request date". */
  dateLabel?: string
}

/**
 * The one filter bar every Procurement list uses: a live text search plus a
 * From/To business-date range that is applied on demand.
 *
 * The two filters behave differently on purpose. Typing narrows the list as you
 * go, which is what you want from a search box. Dates do not: a `type="date"`
 * input emits a value on every keystroke, so filtering live meant the grid
 * re-ran against half-typed years on the way to the range the buyer wanted.
 * So the range is a draft until Search is pressed, and Cancel clears the whole
 * filter set — text and dates — in one go.
 *
 * The props are unchanged from the live-filtering version, so the screens using
 * this need no edit: the toolbar simply holds the dates back until Search.
 */
export function ProcurementToolbar({
  search,
  onSearchChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onReset,
  searchHint = 'Search…',
  dateLabel = 'Date',
}: ProcurementToolbarProps) {
  const dirty = Boolean(search || dateFrom || dateTo)

  const range: ProcDateRange = { from: dateFrom, to: dateTo }
  const applyRange = (r: ProcDateRange) => {
    // The screens keep the two bounds as separate pieces of state, so an applied
    // range lands as two updates.
    onDateFromChange(r.from)
    onDateToChange(r.to)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-border bg-surface px-4 py-3">
      <div className="min-w-[240px] max-w-sm flex-1">
        <Input
          label="Search"
          placeholder={searchHint}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <ProcDateFilter
        label={dateLabel}
        value={range}
        onChange={applyRange}
        // Cancel is the screen's own reset, so it clears the search text too —
        // one button that undoes every filter, as before.
        onCancel={onReset}
        cancelDisabled={!dirty}
      />
    </div>
  )
}
