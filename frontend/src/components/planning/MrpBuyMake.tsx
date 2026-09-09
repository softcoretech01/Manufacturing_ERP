import { useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatDate } from '@/lib/format'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import type { MrpItemPlan, MrpPlannedOrder } from '@/api/mrp'

/**
 * What to buy, and what to make.
 *
 * MRP's answer used to be one merged "planned orders" grid holding a quantity
 * and a value. A buyer looking at it could see that 10,555 discs were proposed
 * but not *why* — how many were already in the store, how many were on order,
 * or how much of the figure was the lot-size rule rounding up. The stock and
 * open-order columns come from the same run's time-phased plan, so the sum is
 * checkable on the row:
 *
 *     required − available − on order = net,   net → rounded up = suggested
 *
 * Nothing here is recomputed in the browser. Every figure is the server's.
 */

export interface BuyMakeRow {
  key: string
  itemCode: string
  itemName: string
  uom: string
  /** Total gross requirement across the horizon. */
  required: number
  /** Free stock when the run started. */
  available: number
  /** Confirmed receipts already inbound — open purchase orders. */
  onOrder: number
  /** Buffer the plan must leave in stock. Part of the net, so it is shown. */
  safetyStock: number
  /** What is genuinely short, before the lot rule. */
  net: number
  /** What MRP proposes, after the lot rule. */
  suggested: number
  /** The earliest date any of it is needed. */
  requiredOn: string | null
  /** The earliest date it must be released to arrive in time. */
  releaseOn: string | null
  isLate: boolean
  demandDocNo: string
  /** Set once a requisition or production order has been raised. */
  convertedTo: string | null
  orders: MrpPlannedOrder[]
}

/**
 * Fold the run into one row per item.
 *
 * A single item can hold several proposals across the horizon — three separate
 * lots of coil in weeks 2, 5 and 9. A buyer works item by item, so the rows are
 * rolled up per item and the individual lots stay available through the
 * time-phased plan.
 */
export function buildBuyMake(
  plans: MrpItemPlan[],
  orders: MrpPlannedOrder[],
  type: 'PURCHASE' | 'PRODUCTION',
): BuyMakeRow[] {
  const byItem = new Map<string, MrpPlannedOrder[]>()
  for (const o of orders) {
    if (o.order_type !== type) continue
    const list = byItem.get(o.item_code)
    if (list) list.push(o)
    else byItem.set(o.item_code, [o])
  }

  const rows: BuyMakeRow[] = []
  for (const [itemCode, list] of byItem) {
    const plan = plans.find((p) => p.item_code === itemCode)
    const sorted = [...list].sort((a, b) => a.due_date.localeCompare(b.due_date))
    const first = sorted[0]

    // Every proposal for the item must be converted before the row counts as
    // done; showing "PR created" while two lots are still open would hide work.
    const allConverted = sorted.every((o) => o.converted_to_doc_no)

    rows.push({
      key: itemCode,
      itemCode,
      itemName: first.item_name || plan?.item_name || itemCode,
      uom: first.uom || plan?.uom || 'NOS',
      required: plan?.total_gross ?? 0,
      available: plan?.opening_stock ?? 0,
      onOrder: (plan?.buckets ?? []).reduce((t, b) => t + b.scheduled_receipts, 0),
      safetyStock: plan?.safety_stock ?? 0,
      net: sorted.reduce((t, o) => t + o.net_requirement, 0),
      suggested: sorted.reduce((t, o) => t + o.quantity, 0),
      requiredOn: first.due_date,
      releaseOn: first.release_date,
      isLate: sorted.some((o) => o.is_late),
      demandDocNo: first.demand_doc_no ?? '',
      convertedTo: allConverted ? (first.converted_to_doc_no ?? null) : null,
      orders: sorted,
    })
  }
  return rows.sort((a, b) => (a.requiredOn ?? '').localeCompare(b.requiredOn ?? ''))
}

const qty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

export function MrpBuyMakeGrid({
  rows,
  type,
  selected,
  onSelectedChange,
  onExported,
  bulkActions,
  loading,
}: {
  rows: BuyMakeRow[]
  type: 'PURCHASE' | 'PRODUCTION'
  selected: string[]
  onSelectedChange: (next: string[]) => void
  onExported: (n: number) => void
  /** Raise-requisition / raise-order buttons, shown once rows are ticked. */
  bulkActions?: React.ReactNode
  loading?: boolean
}) {
  const buy = type === 'PURCHASE'

  const columns: Column<BuyMakeRow>[] = useMemo(
    () => [
      {
        key: 'sno', header: 'S.No', width: '4.5rem', align: 'center',
        render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-muted">{i + 1}</span>,
      },
      {
        key: 'itemCode', header: buy ? 'Item' : 'Product', width: '17rem', sortable: true,
        render: (r) => (
          <>
            <p className="truncate text-xs font-medium text-fg" title={r.itemName}>{r.itemName}</p>
            <p className="font-mono text-2xs text-fg-subtle">{r.itemCode}</p>
          </>
        ),
      },
      {
        key: 'required', header: 'Required Qty', align: 'right', width: '9rem', sortable: true,
        accessor: (r) => r.required,
        render: (r) => <span className="tabular-nums">{qty(r.required)}</span>,
      },
      {
        key: 'available', header: 'Available Stock', align: 'right', width: '9.5rem', sortable: true,
        accessor: (r) => r.available,
        render: (r) => (
          <span className={r.available > 0 ? 'tabular-nums text-success' : 'tabular-nums text-fg-subtle'}>
            {qty(r.available)}
          </span>
        ),
      },
      {
        key: 'onOrder',
        header: buy ? 'Open PO' : 'Existing Production',
        align: 'right', width: buy ? '8.5rem' : '11rem', sortable: true,
        accessor: (r) => r.onOrder,
        render: (r) =>
          r.onOrder > 0 ? (
            <span className="tabular-nums text-fg">{qty(r.onOrder)}</span>
          ) : (
            <span className="text-[12px] text-fg-subtle">—</span>
          ),
      },
      {
        key: 'safetyStock', header: 'Safety Stock', align: 'right', width: '9rem', sortable: true,
        accessor: (r) => r.safetyStock,
        render: (r) =>
          r.safetyStock > 0 ? (
            <span className="tabular-nums text-fg-muted" title="Buffer the plan keeps in stock. It is added to the requirement, which is why the net can exceed the gross.">
              {qty(r.safetyStock)}
            </span>
          ) : (
            <span className="text-[12px] text-fg-subtle">—</span>
          ),
      },
      {
        key: 'net', header: 'Net Requirement', align: 'right', width: '10rem', sortable: true,
        accessor: (r) => r.net,
        render: (r) => (
          <span
            className="tabular-nums font-medium text-fg"
            title={
              `Required ${qty(r.required)} + safety ${qty(r.safetyStock)} ` +
              `− available ${qty(r.available)} − on order ${qty(r.onOrder)}, ` +
              'week by week. A lot ordered early can cover a later week, so this ' +
              'is not always the simple difference.'
            }
          >
            {qty(r.net)}
          </span>
        ),
      },
      {
        key: 'suggested',
        header: buy ? 'Suggested Purchase Qty' : 'Suggested Production Qty',
        align: 'right', width: '12rem', sortable: true,
        accessor: (r) => r.suggested,
        render: (r) => (
          <span className="tabular-nums font-semibold text-brand-700">{qty(r.suggested)}</span>
        ),
      },
      { key: 'uom', header: 'UOM', width: '5rem', align: 'center',
        render: (r) => <span className="text-[12px] text-fg-muted">{r.uom}</span> },
      {
        key: 'requiredOn', header: 'Required Date', width: '9.5rem', sortable: true,
        accessor: (r) => r.requiredOn ?? '',
        render: (r) => (
          <span className={r.isLate ? 'text-danger' : undefined}>
            {r.requiredOn ? formatDate(r.requiredOn) : '—'}
            {r.isLate && <span className="ml-1 text-2xs">late</span>}
          </span>
        ),
      },
      {
        key: 'releaseOn', header: 'Release By', width: '9.5rem', defaultHidden: true,
        accessor: (r) => r.releaseOn ?? '',
        render: (r) => (r.releaseOn ? formatDate(r.releaseOn) : '—'),
      },
      {
        key: 'demandDocNo', header: 'For Demand', width: '14rem', sortable: true,
        accessor: (r) => r.demandDocNo,
        render: (r) =>
          r.demandDocNo ? (
            <span className="block truncate font-mono text-[12px] text-fg" title={r.demandDocNo}>
              {r.demandDocNo}
            </span>
          ) : (
            <span className="text-[12px] text-fg-subtle" title="Safety-stock top-up — no single demand behind it">—</span>
          ),
      },
      {
        key: 'status', header: 'Status', width: '11rem', className: 'col-flex',
        accessor: (r) => (r.convertedTo ? 'Raised' : 'Pending'),
        // The action itself lives in the bulk bar; the row states plainly
        // whether it has already been acted on, so nothing is raised twice.
        render: (r) =>
          r.convertedTo ? (
            <Badge tone="success" size="sm">
              {buy ? 'PR created' : 'Order created'}
            </Badge>
          ) : (
            <Badge tone="neutral" size="sm">Not raised</Badge>
          ),
      },
    ],
    [buy],
  )

  const pending = rows.filter((r) => !r.convertedTo)

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.key}
      density="comfortable"
      searchPlaceholder={buy ? 'Search item…' : 'Search product…'}
      selectable
      selected={selected}
      onSelectedChange={onSelectedChange}
      bulkActions={bulkActions}
      loading={loading}
      // Rows already converted cannot be selected, so a second requisition for
      // the same shortage is not possible from this screen.
      isRowSelectable={(r) => !r.convertedTo}
      rowNotSelectableReason={(r) =>
        `Already raised as ${r.convertedTo}. Raising it again would duplicate the order.`
      }
      onExport={(f: ExportFormat) =>
        onExported(
          exportRows(
            f,
            buy ? 'what-to-buy' : 'what-to-make',
            buy ? 'What to buy' : 'What to make',
            columnsFromTable(columns),
            rows,
          ),
        )
      }
      emptyTitle={buy ? 'Nothing to buy' : 'Nothing to make'}
      emptyDescription={
        rows.length === 0 && pending.length === 0
          ? buy
            ? 'Stock and open purchase orders already cover every material requirement in this horizon.'
            : 'Stock and open production orders already cover every product requirement in this horizon.'
          : 'Every proposal has been raised.'
      }
    />
  )
}

export default MrpBuyMakeGrid
