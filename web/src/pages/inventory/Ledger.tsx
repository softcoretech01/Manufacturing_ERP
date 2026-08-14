import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty, formatCurrency, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useItems, useStockLedger } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { LedgerRow } from '@/api/stock'

/** Stock ledger / bin card (SRS S-STK-03). One item, chronological, with the
 *  running balance stored on each row (never recomputed) — what an auditor asks for. */
export function StockLedgerPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const [params, setParams] = useSearchParams()

  const itemsQ = useItems({ active_only: false })
  const allItems = itemsQ.data ?? []
  const [itemUid, setItemUid] = useState(params.get('item') ?? '')
  const [warehouse, setWarehouse] = useState('')

  // Default to the first item once the list loads.
  useEffect(() => {
    if (!itemUid && allItems.length) setItemUid(allItems[0].uid)
  }, [itemUid, allItems])

  const whQ = useWarehouses()
  const warehouses = whQ.data?.data ?? []
  const { data, isLoading, error } = useStockLedger(itemUid || undefined, warehouse || undefined)
  const rows = data?.rows ?? []
  const totals = data?.totals

  function pickItem(uid: string) {
    setItemUid(uid)
    setParams(uid ? { item: uid } : {})
  }

  const columns: Column<LedgerRow>[] = [
    { key: 'business_date', header: 'Date', sortable: true, width: '110px', sticky: true, accessor: (r) => r.business_date, render: (r) => formatDate(r.business_date) },
    { key: 'document_no', header: 'Document', width: '180px', render: (r) => <span className="font-mono text-2xs text-brand-600">{r.document_no ?? '—'}</span> },
    { key: 'movement_type', header: 'Type', width: '90px', render: (r) => <Badge tone={r.direction === 'IN' ? 'success' : 'danger'} size="sm" dot={false}>{r.movement_type}</Badge> },
    { key: 'in', header: 'In', align: 'right', width: '110px', render: (r) => (r.direction === 'IN' ? <span className="tabular text-xs text-success">{formatQty(r.quantity)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'out', header: 'Out', align: 'right', width: '110px', render: (r) => (r.direction === 'OUT' ? <span className="tabular text-xs text-danger">{formatQty(r.quantity)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'balance', header: 'Balance', align: 'right', width: '120px', render: (r) => <span className="tabular text-xs font-medium">{formatQty(r.balance_qty_after)}</span> },
    { key: 'rate', header: 'Rate', align: 'right', width: '110px', render: (r) => <span className="tabular text-2xs text-fg-muted">{formatCurrency(r.balance_rate_after)}</span> },
    { key: 'batch', header: 'Batch / status', width: '160px', render: (r) => <span className="text-2xs text-fg-muted">{r.batch_no || r.stock_status.toLowerCase()}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Stock ledger / bin card"
        description="Every movement for one item, chronological, with the running balance that was computed under the lock that produced it."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Stock ledger' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && <Alert tone="danger" title="Could not load the ledger">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select label="Item" containerClassName="w-80" value={itemUid} onChange={(e) => pickItem(e.target.value)}
            options={allItems.map((i) => ({ value: i.uid, label: `${i.code} — ${i.name}` }))} />
          <Select label="Warehouse" containerClassName="w-56" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}
            options={[{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
        </CardBody>
      </Card>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.uid}
        loading={isLoading}
        searchPlaceholder="Document, batch…"
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'stock-ledger', 'Stock ledger', columnsFromTable(columns), rows); toast.success('Export ready', `${n} rows written.`) }}
        emptyTitle="No movements"
        emptyDescription="This item has no ledger entries yet."
      />

      {totals && data && (
        <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-2xs text-fg-subtle">
          <span>received <strong className="text-fg-muted">{formatQty(totals.received)}</strong></span>
          <span>issued <strong className="text-fg-muted">{formatQty(totals.issued)}</strong></span>
          <span>closing <strong className="text-fg-muted">{formatQty(totals.closing_qty)} {data.item.uom}</strong></span>
          <span>moving avg <strong className="text-fg-muted">{formatCurrency(totals.closing_rate)}</strong></span>
          <span>closing value <strong className="text-fg-muted">{formatCurrency(totals.closing_value)}</strong></span>
        </p>
      )}
    </div>
  )
}
