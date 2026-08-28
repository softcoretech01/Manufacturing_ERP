import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty, formatCurrency, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItems, useStockLedger } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { LedgerRow } from '@/api/stock'
import { InvKpiTile } from '@/components/inventory/InvKpiTile'
import { InvFilterBar, InvSelect } from '@/components/inventory/InvFilterBar'
import { TrendingUp, TrendingDown, Scale, IndianRupee } from 'lucide-react'

export function StockLedgerPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const [params, setParams] = useSearchParams()

  const itemsQ = useItems({ active_only: false })
  const allItems = itemsQ.data ?? []

  const initialItem = params.get('item') ?? ''
  const initialWarehouse = params.get('warehouse') ?? ''
  const initialBatch = params.get('batch_no') ?? ''

  const [itemUid, setItemUid] = useState(initialItem)
  const [warehouse, setWarehouse] = useState(initialWarehouse)
  const [batchNo, setBatchNo] = useState(initialBatch)

  useEffect(() => {
    if (!itemUid && allItems.length) setItemUid(allItems[0].uid)
  }, [itemUid, allItems])

  const whQ = useWarehouses()
  const warehouses = whQ.data?.data ?? []
  const { data, isLoading, error } = useStockLedger(itemUid || undefined, warehouse || undefined, batchNo || undefined)
  const rows = data?.rows ?? []
  const totals = data?.totals
  const itemData = data?.item

  function updateParams(newParams: Record<string, string>) {
    const currentParams = Object.fromEntries(params)
    const nextParams = { ...currentParams, ...newParams }

    // Remove empty params
    Object.keys(nextParams).forEach(k => {
      if (!nextParams[k]) delete nextParams[k]
    })

    setParams(nextParams)
  }

  function pickItem(uid: string) {
    setItemUid(uid)
    updateParams({ item: uid })
  }

  function pickWarehouse(wh: string) {
    setWarehouse(wh)
    updateParams({ warehouse: wh })
  }

  function pickBatch(batch: string) {
    setBatchNo(batch)
    updateParams({ batch_no: batch })
  }

  const columns: Column<LedgerRow>[] = [
    { key: 'business_date', header: 'Date', sortable: true, width: '130px', sticky: true, accessor: (r) => r.business_date, render: (r) => <span className="text-sm">{formatDate(r.business_date)}</span> },
    { key: 'movement_type', header: 'Type', width: '110px', render: (r) => <Badge tone={r.direction === 'IN' ? 'success' : 'danger'} size="sm" dot={false}>{r.movement_type}</Badge> },
    { key: 'document_no', header: 'Document Ref', render: (r) => <span className="font-mono text-sm font-medium text-brand-600">{r.document_no ?? '—'}</span> },
    { key: 'in', header: 'Qty In', align: 'right', width: '120px', render: (r) => (r.direction === 'IN' ? <span className="tabular text-sm text-success">{formatQty(r.quantity)}</span> : <span className="text-sm text-fg-subtle">—</span>) },
    { key: 'out', header: 'Qty Out', align: 'right', width: '120px', render: (r) => (r.direction === 'OUT' ? <span className="tabular text-sm text-danger">{formatQty(r.quantity)}</span> : <span className="text-sm text-fg-subtle">—</span>) },
    { key: 'balance', header: 'Balance Qty', align: 'right', width: '130px', render: (r) => <span className="tabular text-sm font-bold text-brand-700">{formatQty(r.balance_qty_after)}</span> },
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] gap-4 pb-4">
      <PageHeader
        title="Stock Ledger / Bin Card"
        description="Transaction history for specific item, store, and batch combinations."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Stock Ledger' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in first so the app has an API session.</Alert>}
      {error && <Alert tone="danger" title="Could not load the ledger">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}

      {/* KPI summary strip */}
      {totals && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <InvKpiTile label="Total In" value={formatQty(totals.received ?? 0)} sub={itemData?.uom} icon={<TrendingUp />} tone="success" />
          <InvKpiTile label="Total Out" value={formatQty(totals.issued ?? 0)} sub={itemData?.uom} icon={<TrendingDown />} tone="danger" />
          <InvKpiTile label="Closing Balance" value={formatQty(totals.closing_qty)} sub={itemData?.uom} icon={<Scale />} tone="brand" />
          <InvKpiTile label="Closing Value" value={formatCurrency(totals.closing_value)} sub={`@ ${formatCurrency(totals.closing_rate)} / ${itemData?.uom}`} icon={<IndianRupee />} tone="progress" />
        </div>
      )}

      {/* Filter bar */}
      <InvFilterBar
        left={
          <>
            <InvSelect
              label="Item"
              value={itemUid}
              onChange={pickItem}
              options={allItems.map((i) => ({ value: i.uid, label: `${i.code} — ${i.name}` }))}
              className="w-72"
            />
            <InvSelect
              label="Store"
              value={warehouse}
              onChange={pickWarehouse}
              options={[{ value: '', label: 'All stores' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]}
              className="w-52"
            />
            <div className="flex flex-col gap-1">
              <label className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Batch No</label>
              <input
                value={batchNo}
                onChange={(e) => pickBatch(e.target.value)}
                placeholder="All batches"
                className="h-9 w-40 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
          </>
        }
      />

      <DataTable
          density="comfortable"
          searchable={false}
          rows={rows}
          columns={columns}
          rowKey={(r) => r.uid}
          loading={isLoading}
          searchPlaceholder="Search document..."
          onExport={(f: ExportFormat) => { const n = exportRows(f, 'stock-ledger', 'Stock ledger', columnsFromTable(columns), rows); toast.success('Export ready', `${n} rows written.`) }}
          emptyTitle="No movements found"
          emptyDescription="This combination has no ledger entries."
        />
    </div>
  )
}
