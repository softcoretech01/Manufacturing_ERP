/*
 * Shared building blocks for every Procurement screen.
 *
 * One kit, used by PR, RFQ, Quotation, Comparison, PO, GRN and Approvals, so a
 * buyer sees the same grid, the same modal and the same number formatting on
 * every document. Adding a screen means composing these — never re-implementing
 * a table or a modal shell.
 */
import type { ReactNode } from 'react'
import { Eye, Pencil, MoreHorizontal, Trash2, Inbox } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatQty } from '@/lib/format'

/* ── Modal ────────────────────────────────────────────────────────────────
 * `doc`  ~1024px — headers + a short list of fields
 * `wide` ~1152px — anything carrying an item-lines table
 */
export function ProcModal({
  open, onClose, title, subtitle, footer, width = 'doc', children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  footer?: ReactNode
  width?: 'doc' | 'wide'
  children: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={subtitle}
      size={width === 'wide' ? '4xl' : '3xl'}
      footer={footer}
    >
      <div className="flex flex-col gap-6">{children}</div>
    </Modal>
  )
}

/** Footer actions: secondary on the left of the primary, always right-aligned. */
export function ModalFooter({ onCancel, cancelLabel = 'Cancel', children }: {
  onCancel: () => void
  cancelLabel?: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" onClick={onCancel}>{cancelLabel}</Button>
      {children}
    </div>
  )
}

/* ── Sections & fields ──────────────────────────────────────────────────── */

export function Section({ title, action, children }: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Two-column field grid; stacks on small screens (§27). */
export function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={`grid gap-x-6 gap-y-4 sm:grid-cols-${cols === 3 ? '3' : '2'}`}>{children}</div>
  )
}

/** Read-only label + value. Renders an em-dash when genuinely empty — never
 *  "undefined", "null" or the string "null" the stored procedures can emit. */
export function Field({ label, value, mono = false, span }: {
  label: string
  value: ReactNode
  mono?: boolean
  span?: boolean
}) {
  const empty =
    value === null || value === undefined || value === '' || value === 'null' || value === 'None'
  return (
    <div className={span ? 'sm:col-span-2' : undefined}>
      <dt className="mb-1 text-[13px] text-fg-muted">{label}</dt>
      <dd className={`text-[14px] font-medium text-fg ${mono ? 'font-mono' : ''}`}>
        {empty ? <span className="font-normal text-fg-subtle">—</span> : value}
      </dd>
    </div>
  )
}

/* ── Item lines ─────────────────────────────────────────────────────────── */

export interface LineCol {
  key: string
  header: string
  /** right-align + tabular figures for every numeric column (§21) */
  align?: 'left' | 'right' | 'center'
  width?: string
  render?: (row: any, index: number) => ReactNode
}

export function LineItemsTable({ columns, rows, empty = 'No items added yet.' }: {
  columns: LineCol[]
  rows: any[]
  empty?: string
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-surface-2">
            <th className="w-12 px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-fg-muted">#</th>
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted ${
                  c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-subtle hover:bg-surface-2/60">
              <td className="px-3 py-2.5 text-center text-fg-muted">{i + 1}</td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2.5 ${
                    c.align === 'right'
                      ? 'text-right tabular-nums'
                      : c.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  }`}
                >
                  {c.render ? c.render(r, i) : (r[c.key] ?? <span className="text-fg-subtle">—</span>)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-fg-muted">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ── Totals ─────────────────────────────────────────────────────────────── */

export function TotalsPanel({ subtotal, tax, grandTotal, extra }: {
  subtotal: number
  tax: number
  grandTotal: number
  extra?: { label: string; value: number }[]
}) {
  return (
    <div className="flex justify-end">
      <dl className="w-full max-w-xs space-y-2">
        <Row label="Subtotal" value={subtotal} />
        {extra?.map((e) => <Row key={e.label} label={e.label} value={e.value} />)}
        <Row label="Tax" value={tax} />
        <div className="flex items-center justify-between border-t border-border pt-2">
          <dt className="text-[14px] font-semibold text-fg">Grand Total</dt>
          <dd className="text-[15px] font-semibold tabular-nums text-fg">{formatCurrency(grandTotal)}</dd>
        </div>
      </dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className="text-[13px] tabular-nums text-fg">{formatCurrency(value)}</dd>
    </div>
  )
}

/* ── Grid row actions ───────────────────────────────────────────────────── */

export function RowActions({ onView, onEdit, onDelete, editTitle = 'Edit' }: {
  onView?: () => void
  onEdit?: () => void
  onDelete?: () => void
  editTitle?: string
}) {
  return (
    <div className="flex items-center gap-1">
      {onView && (
        <Button variant="ghost" size="icon-sm" onClick={onView} title="View" aria-label="View">
          <Eye className="h-4 w-4" />
        </Button>
      )}
      {onEdit && (
        <Button variant="ghost" size="icon-sm" onClick={onEdit} title={editTitle} aria-label={editTitle}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          title="Delete"
          aria-label="Delete"
          className="text-danger hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

export { MoreHorizontal }

/* ── Empty state ────────────────────────────────────────────────────────── */

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <Inbox className="h-7 w-7 text-fg-subtle" />
      <p className="text-[14px] text-fg-muted">{message}</p>
    </div>
  )
}

/* ── Shared number helpers so every screen formats identically (§21) ────── */
export const qty = (v: any) => formatQty(Number(v) || 0, 2)
export const money = (v: any) => formatCurrency(Number(v) || 0)
