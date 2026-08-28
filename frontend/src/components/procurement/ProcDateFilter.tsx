/**
 * ProcDateFilter — a From/To date range that is applied on demand.
 *
 *   From: [dd-mm-yyyy]  To: [dd-mm-yyyy]   [Search]  [Cancel]
 *
 * "From:" and "To:" say what the fields are, so there is no caption above them.
 *
 * The dates are held as a draft and do not reach the screen until Search is
 * pressed. That is the whole point of it: filtering live on a `type="date"`
 * input re-queries on every keystroke of a half-typed year, so a buyer picking
 * a range watched the grid thrash through nonsense dates — 0002-01-01 and the
 * rest — on the way to the one they wanted.
 *
 * Sibling of components/inventory/InvDateFilter so both modules behave alike.
 *
 * Usage:
 *   const [range, setRange] = useState<ProcDateRange>({ from: '', to: '' })
 *   <ProcDateFilter label="RFQ date" value={range} onChange={setRange} />
 */
import { useEffect, useState } from 'react'
import { RotateCcw, Search } from 'lucide-react'

export interface ProcDateRange {
  from: string
  to: string
}

export function ProcDateFilter({
  value,
  onChange,
  label,
  onCancel,
  cancelDisabled = false,
}: {
  value: ProcDateRange
  onChange: (r: ProcDateRange) => void
  /**
   * Which business date this filters, e.g. "RFQ date". Not drawn — the visible
   * caption was redundant next to "From:" and "To:" — but still given to each
   * input as its accessible name, so a screen reader announces "RFQ date from"
   * rather than an unlabelled date field.
   */
  label?: string
  /** Cancel handler. Defaults to clearing just this date range. */
  onCancel?: () => void
  cancelDisabled?: boolean
}) {
  // Draft state — deliberately not propagated until Search.
  const [draft, setDraft] = useState<ProcDateRange>(value)

  // Keep the inputs honest when the screen resets the range from outside;
  // otherwise they would still show dates the grid is no longer filtered by.
  useEffect(() => { setDraft(value) }, [value.from, value.to])

  function cancel() {
    setDraft({ from: '', to: '' })
    if (onCancel) onCancel()
    else onChange({ from: '', to: '' })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateField
        caption="From:"
        value={draft.from}
        onChange={(v) => setDraft((d) => ({ ...d, from: v }))}
        ariaLabel={`${label ?? 'Date'} from`}
      />
      <DateField
        caption="To:"
        value={draft.to}
        onChange={(v) => setDraft((d) => ({ ...d, to: v }))}
        ariaLabel={`${label ?? 'Date'} to`}
        // A range that ends before it starts returns nothing and looks broken;
        // the picker simply will not offer those days.
        min={draft.from || undefined}
      />

      <button
        type="button"
        onClick={() => onChange(draft)}
        className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        Search
      </button>

      <button
        type="button"
        onClick={cancel}
        disabled={cancelDisabled}
        className="flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Cancel
      </button>
    </div>
  )
}

function DateField({
  caption, value, onChange, ariaLabel, min,
}: {
  caption: string
  value: string
  onChange: (v: string) => void
  ariaLabel: string
  min?: string
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 transition-colors focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500/20">
      <span className="shrink-0 text-xs font-medium text-fg-muted">{caption}</span>
      <input
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="w-[7.5rem] bg-transparent text-xs text-fg focus:outline-none"
      />
    </label>
  )
}

/** Does a document date fall inside the applied range? Empty bounds are open. */
export function inDateRange(date: unknown, range: ProcDateRange): boolean {
  if (!range.from && !range.to) return true
  if (!date) return false
  const d = String(date).slice(0, 10)
  if (range.from && d < range.from) return false
  if (range.to && d > range.to) return false
  return true
}
