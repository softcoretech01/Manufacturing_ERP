import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrendingUp, TrendingDown, Scale, IndianRupee, Download } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows } from '@/lib/export'
import { formatQty, formatCurrency, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItems, useStockLedger } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { LedgerRow } from '@/api/stock'
import { InvKpiTile } from '@/components/inventory/InvKpiTile'
import { InvFilterBar, InvSelect } from '@/components/inventory/InvFilterBar'

/** Movement types the engine actually writes. Not invented — these are the
 *  values `StockService.post_movement` stores in `inv_stock_ledger`. */
const MOVEMENT_TYPES = [
  { value: '', label: 'All movements' },
  { value: 'GRN', label: 'Goods receipt' },
  { value: 'ISSUE', label: 'Issue' },
  { value: 'RETURN', label: 'Return' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'ADJUST', label: 'Adjustment' },
  { value: 'SCRAP', label: 'Scrap' },
  { value: 'REVERSAL', label: 'Reversal' },
]

function typeTone(direction: string) {
  return direction === 'IN' ? ('success' as const) : ('danger' as const)
}

export function StockLedgerPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const [params, setParams] = useSearchParams()

  const itemsQ = useItems({ active_only: false })
  const allItems = itemsQ.data ?? []

  const [itemUid, setItemUid] = useState(params.get('item') ?? '')
  const [warehouse, setWarehouse] = useState(params.get('warehouse') ?? '')
  const [batchNo, setBatchNo] = useState(params.get('batch_no') ?? '')
  const [dateFrom, setDateFrom] = useState(params.get('date_from') ?? '')
  const [dateTo, setDateTo] = useState(params.get('date_to') ?? '')
  const [movementType, setMovementType] = useState(params.get('movement_type') ?? '')
  const [documentNo, setDocumentNo] = useState(params.get('document_no') ?? '')

  useEffect(() => {
    if (!itemUid && allItems.length) setItemUid(allItems[0].uid)
  }, [itemUid, allItems])

  const warehouses = useWarehouses().data?.data ?? []

  const query = useMemo(
    () => ({
      warehouse: warehouse || undefined,
      batch_no: batchNo || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      movement_type: movementType || undefined,
      document_no: documentNo || undefined,
    }),
    [warehouse, batchNo, dateFrom, dateTo, movementType, documentNo],
  )

  const { data, isLoading, error } = useStockLedger(itemUid || undefined, query)
  const rows = data?.rows ?? []
  const totals = data?.totals
  const itemData = data?.item
  const hasValue = rows.some((r) => r.value != null)

  // Keep the URL in step so a ledger view can be linked to and reloaded.
  useEffect(() => {
    const next: Record<string, string> = {}
    const all = {
      item: itemUid, warehouse, batch_no: batchNo, date_from: dateFrom,
      date_to: dateTo, movement_type: movementType, document_no: documentNo,
    }
    for (const [k, v] of Object.entries(all)) if (v) next[k] = v
    setParams(next, { replace: true })
    // setParams is stable; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemUid, warehouse, batchNo, dateFrom, dateTo, movementType, documentNo])

  function clearFilters() {
    setWarehouse('')
    setBatchNo('')
    setDateFrom('')
    setDateTo('')
    setMovementType('')
    setDocumentNo('')
  }

  // The running balance stored on each ledger row is the balance for that exact
  // location key — item + store + batch. With several keys in view it steps up
  // and down and reads as wrong, so it is only shown once the view is narrowed
  // to a single key.
  const balanceIsMeaningful = !!warehouse && !!batchNo

  const columns: Column<LedgerRow>[] = [
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>,
    },
    {
      key: 'business_date', header: 'Date', width: '110px', sortable: true,
      accessor: (r) => r.business_date,
      render: (r) => <span className="text-[13px] tabular-nums">{formatDate(r.business_date)}</span>,
    },
    {
      key: 'document_no', header: 'Document No', width: '150px',
      accessor: (r) => r.document_no ?? '',
      render: (r) => (
        <span className="font-mono text-[12px] font-semibold text-brand-600">{r.document_no ?? '—'}</span>
      ),
    },
    {
      key: 'movement_type', header: 'Type', width: '115px',
      accessor: (r) => r.movement_type,
      render: (r) => <Badge tone={typeTone(r.direction)} size="sm" dot={false}>{r.movement_type}</Badge>,
    },
    {
      key: 'item', header: 'Item', width: '195px', className: 'cell-stack',
      accessor: (r) => `${r.item_name} ${r.item_code}`,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] text-fg" title={r.item_name}>{r.item_name}</p>
          <p className="truncate font-mono text-[12px] text-fg-subtle" title={String(r.item_code ?? "")}>{r.item_code}</p>
        </div>
      ),
    },
    {
      key: 'warehouse', header: 'Store', width: '135px',
      accessor: (r) => r.warehouse_name ?? '',
      render: (r) => (
        <span className="block truncate text-[14px] text-fg-muted" title={r.warehouse_name ?? ''}>
          {r.warehouse_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'batch_no', header: 'Batch / Lot', width: '120px',
      accessor: (r) => r.batch_no,
      render: (r) => r.batch_no
        ? <span className="font-mono text-[13px] text-fg-muted">{r.batch_no}</span>
        : <span className="text-fg-subtle">—</span>,
    },
    {
      key: 'in', header: 'In', align: 'right', width: '105px',
      accessor: (r) => (r.direction === 'IN' ? r.quantity : 0),
      render: (r) => r.direction === 'IN'
        ? <span className="text-[14px] font-semibold tabular-nums text-success">{formatQty(r.quantity)}</span>
        : <span className="text-fg-subtle">—</span>,
    },
    {
      key: 'out', header: 'Out', align: 'right', width: '105px',
      accessor: (r) => (r.direction === 'OUT' ? r.quantity : 0),
      render: (r) => r.direction === 'OUT'
        ? <span className="text-[14px] font-semibold tabular-nums text-danger">{formatQty(r.quantity)}</span>
        : <span className="text-fg-subtle">—</span>,
    },
    {
      key: 'uom', header: 'UOM', width: '70px', align: 'center', defaultHidden: true,
      render: (r) => <span className="text-[13px] text-fg-muted">{r.uom}</span>,
    },
    {
      key: 'rate', header: 'Unit Cost', align: 'right', width: '115px', defaultHidden: true,
      accessor: (r) => r.rate,
      render: (r) => <span className="text-[14px] tabular-nums text-fg-muted">{formatCurrency(r.rate)}</span>,
    },
    {
      key: 'value', header: 'Value', align: 'right', width: '125px', defaultHidden: true,
      accessor: (r) => r.value,
      render: (r) => <span className="text-[14px] font-medium tabular-nums text-fg">{formatCurrency(r.value)}</span>,
    },
    {
      key: 'balance', header: 'Balance', align: 'right', width: '120px',
      accessor: (r) => r.balance_qty_after,
      render: (r) => (
        <span className="text-[14px] font-bold tabular-nums text-brand-700">{formatQty(r.balance_qty_after)}</span>
      ),
    },
    {
      key: 'reference', header: 'Reference', width: '140px', defaultHidden: true,
      accessor: (r) => r.document_type ?? '',
      render: (r) => (
        <span className="text-[13px] text-fg-muted">
          {r.document_type ? r.document_type.replace(/_/g, ' ') : '—'}
        </span>
      ),
    },
  ]

  const visibleColumns = useMemo(() => {
    let c = columns
    if (!balanceIsMeaningful) c = c.filter((x) => x.key !== 'balance')
    if (!hasValue) c = c.filter((x) => x.key !== 'rate' && x.key !== 'value')
    return c
  }, [columns, balanceIsMeaningful, hasValue])

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader
        title="Stock Ledger"
        description="Every posted movement for an item, with the cost and value of each."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Stock Ledger' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load the ledger">
          {error instanceof ProblemError ? error.problem.detail : 'Unable to load ledger data. Is the backend running?'}
        </Alert>
      )}

      {totals && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <InvKpiTile label="Total In" value={formatQty(totals.received)} sub={itemData?.uom} icon={<TrendingUp />} tone="success" />
          <InvKpiTile label="Total Out" value={formatQty(totals.issued)} sub={itemData?.uom} icon={<TrendingDown />} tone="danger" />
          <InvKpiTile label="Movements" value={String(totals.movements ?? rows.length)} sub="in this view" icon={<Scale />} tone="brand" />
          <InvKpiTile
            label="Closing Value"
            value={formatCurrency(totals.closing_value)}
            sub={`${formatQty(totals.closing_qty)} ${itemData?.uom ?? ''} @ ${formatCurrency(totals.closing_rate)}`}
            icon={<IndianRupee />}
            tone="progress"
          />
        </div>
      )}

      <InvFilterBar
        left={
          <>
            <InvSelect
              label="Item" value={itemUid} onChange={setItemUid} className="w-72"
              options={allItems.map((i) => ({ value: i.uid, label: `${i.code} — ${i.name}` }))}
            />
            <InvSelect
              label="Store" value={warehouse} onChange={setWarehouse} className="w-52"
              options={[
                { value: '', label: 'All stores' },
                ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` })),
              ]}
            />
            <InvSelect label="Movement Type" value={movementType} onChange={setMovementType} options={MOVEMENT_TYPES} />
            <div className="flex flex-col gap-1">
              <label htmlFor="ledger-batch" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Batch / Lot</label>
              <input
                id="ledger-batch" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="All batches"
                className="h-9 w-36 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ledger-doc" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Document No</label>
              <input
                id="ledger-doc" value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} placeholder="Any document"
                className="h-9 w-40 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ledger-from" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Date From</label>
              <input
                id="ledger-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ledger-to" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Date To</label>
              <input
                id="ledger-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="h-9 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
          </>
        }
        right={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={clearFilters}>Clear Filters</Button>
            <Button
              size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => {
                const n = exportRows('csv', 'stock-ledger', 'Stock ledger', columnsFromTable(visibleColumns), rows)
                toast.success('Export ready', `${n} rows written.`)
              }}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {!balanceIsMeaningful && rows.length > 0 && (
        <Alert tone="info" title="Running balance hidden">
          The balance on each row is the balance for one exact location — item, store and batch.
          Pick a store and a batch to see it as a true bin card.
        </Alert>
      )}

      <DataTable
        density="comfortable"
        searchable={false}
        rows={rows}
        columns={visibleColumns}
        rowKey={(r) => r.uid}
        loading={isLoading}
        emptyTitle="No movements found"
        emptyDescription="This item has no ledger entries under these filters. Try clearing them."
      />
    </div>
  )
}

export default StockLedgerPage
