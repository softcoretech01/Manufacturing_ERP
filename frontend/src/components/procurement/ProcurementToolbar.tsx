import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { X } from 'lucide-react'

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
 * The one filter bar every Procurement list uses: search + a business-date range
 * + a clear action. Filtering is live as you type, so there is no "Search" button
 * to press — the only action offered is the one that does something.
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
      <div className="w-44">
        <Input
          type="date"
          label={`${dateLabel} from`}
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
        />
      </div>
      <div className="w-44">
        <Input
          type="date"
          label={`${dateLabel} to`}
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
        />
      </div>
      <Button
        variant="outline"
        onClick={onReset}
        disabled={!dirty}
        className="gap-2"
        title="Clear all filters"
      >
        <X className="h-4 w-4" /> Clear filters
      </Button>
    </div>
  )
}
