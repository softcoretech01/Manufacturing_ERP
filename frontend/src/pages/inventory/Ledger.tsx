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
    { key: 'document_no', header: 'Document Ref', width: '180px', render: (r) => <span className="font-mono text-sm font-medium text-brand-600">{r.document_no ?? '—'}</span> },
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

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && <Alert tone="danger" title="Could not load the ledger">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}

      <Card className="flex-none shrink-0 bg-brand-50 border-brand-200">
        <CardBody className="p-4 flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-brand-600 font-semibold uppercase tracking-wider">Item</span>
            <span className="text-lg font-bold text-brand-900">{itemData ? `${itemData.code} - ${itemData.name}` : '—'}</span>
          </div>
          
          <div className="flex gap-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-brand-600 font-semibold uppercase tracking-wider">Store / Warehouse</span>
              <span className="text-sm font-medium text-brand-900">{warehouse ? warehouses.find(w => w.uid === warehouse)?.name || warehouse : 'All Stores'}</span>
            </div>
            
            <div className="flex flex-col gap-1">
              <span className="text-xs text-brand-600 font-semibold uppercase tracking-wider">Batch No</span>
              <span className="text-sm font-medium text-brand-900">{batchNo || 'All Batches'}</span>
            </div>
            
            <div className="flex flex-col gap-1 items-end">
              <span className="text-xs text-brand-600 font-semibold uppercase tracking-wider">Current Balance</span>
              <span className="text-xl font-bold text-brand-700 tabular-nums">{totals ? `${formatQty(totals.closing_qty)} ${itemData?.uom}` : '—'}</span>
            </div>

            <div className="flex flex-col gap-1 items-end border-l border-brand-200 pl-8">
              <span className="text-xs text-brand-600 font-semibold uppercase tracking-wider">Unit Cost</span>
              <span className="text-sm font-medium text-brand-900 tabular-nums">{totals ? formatCurrency(totals.closing_rate) : '—'}</span>
            </div>

            <div className="flex flex-col gap-1 items-end">
              <span className="text-xs text-brand-600 font-semibold uppercase tracking-wider">Total Value</span>
              <span className="text-sm font-bold text-brand-900 tabular-nums">{totals ? formatCurrency(totals.closing_value) : '—'}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="flex-none shrink-0">
        <CardBody className="flex flex-wrap items-end gap-4 p-4">
          <Select label="Change Item" containerClassName="w-80" value={itemUid} onChange={(e) => pickItem(e.target.value)}
            options={allItems.map((i) => ({ value: i.uid, label: `${i.code} — ${i.name}` }))} />
          <Select label="Filter Store" containerClassName="w-56" value={warehouse} onChange={(e) => pickWarehouse(e.target.value)}
            options={[{ value: '', label: 'All stores' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
          <Input label="Filter Batch No" containerClassName="w-48" value={batchNo} placeholder="Batch / Lot..." onChange={(e) => pickBatch(e.target.value)} />
        </CardBody>
      </Card>

      <div className="flex-1 min-h-0 bg-surface border border-border rounded-md shadow-sm">
        <DataTable
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
    </div>
  )
}
