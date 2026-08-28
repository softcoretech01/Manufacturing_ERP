/**
 * ProcDetailsPanel — the drill-down that opens beneath the KPI tiles.
 *
 * Answers "which ones?" for whichever tile was clicked: an inline, searchable,
 * scrollable list of the documents behind the number, closed with one button.
 * It is not a grid replacement — it is deliberately small and read-only, and a
 * row click hands the user off to the screen that actually owns the document.
 *
 * Sibling of components/inventory/InvDetailsPanel.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ProcDetailCol {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  render?: (row: any) => ReactNode
}

export function ProcDetailsPanel({
  label,
  cols,
  rows,
  note,
  loading = false,
  emptyMessage = 'Nothing to show for this figure.',
  onRowClick,
  onClose,
}: {
  label: string
  cols: ProcDetailCol[]
  rows: any[]
  note?: ReactNode
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (row: any) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')

  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? rows.filter((r) =>
        Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(needle)),
      )
    : rows

  return (
    <section
      className="col-span-full overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
      aria-label={label}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2 px-5 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-fg">{label}</h3>
          <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-600 tabular-nums">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter…"
              aria-label={`Filter ${label}`}
              className="h-8 w-48 rounded-lg border border-border bg-surface pl-8 pr-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${label}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="max-h-72 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'border-b border-border px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-fg-muted',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c.key} className="px-4 py-2.5">
                      <div className="h-3 animate-pulse rounded bg-surface-3" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="py-8 text-center text-fg-muted">
                  {needle ? 'Nothing matches that filter.' : emptyMessage}
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr
                  key={i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-colors hover:bg-surface-2',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 py-2.5 text-fg',
                        c.align === 'right' && 'text-right tabular-nums',
                        c.align === 'center' && 'text-center',
                      )}
                    >
                      {c.render ? c.render(row) : (row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {note && (
        <footer className="border-t border-border bg-surface-2 px-5 py-2.5 text-xs text-fg-muted">
          {note}
        </footer>
      )}
    </section>
  )
}
