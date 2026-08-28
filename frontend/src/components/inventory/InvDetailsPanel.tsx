/**
 * InvDetailsPanel — Drill-down panel that slides open below the KPI tile grid.
 * Matches the CareFusions DetailsPanel component.
 *
 * Usage:
 *   <InvDetailsPanel label="Below Reorder" cols={cols} rows={rows}
 *     note="Items where available stock < reorder level."
 *     onClose={() => setOpen(null)} />
 */
import { useState } from 'react'
import { X, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

export interface InvDetailCol {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  render?: (row: any) => ReactNode
}

export function InvDetailsPanel({
  label,
  cols,
  rows,
  note,
  onClose,
}: {
  label: string
  cols: InvDetailCol[]
  rows: any[]
  note?: string
  onClose: () => void
}) {
  const [q, setQ] = useState('')

  const filtered = q
    ? rows.filter((r) =>
        Object.values(r).some((v) =>
          String(v ?? '').toLowerCase().includes(q.toLowerCase()),
        ),
      )
    : rows

  return (
    <div
      className={cn(
        'col-span-full overflow-hidden rounded-2xl border border-border bg-surface shadow-lg',
        'animate-in slide-in-from-top-2 duration-200',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border bg-surface-2 px-5 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-fg">{label}</h3>
          <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-600">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Search within panel */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter…"
              className="h-8 w-48 rounded-lg border border-border bg-surface pl-8 pr-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
            />
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Table */}
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="py-8 text-center text-fg-muted">
                  No data to display
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr
                  key={i}
                  className="transition-colors hover:bg-surface-2"
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

      {/* Footer note */}
      {note && (
        <div className="border-t border-border bg-surface-2 px-5 py-2.5 text-xs text-fg-muted">
          {note}
        </div>
      )}
    </div>
  )
}
