import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty, formatCurrency } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useStockBalances } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { StockBalanceRow } from '@/api/stock'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { MoreVertical } from 'lucide-react'

const ITEM_TYPES = [
  { value: '', label: 'All categories' },
  { value: 'RAW_MATERIAL', label: 'Raw material' },
  { value: 'FINISHED_GOODS', label: 'Finished goods' },
  { value: 'WIP', label: 'WIP' },
  { value: 'CONSUMABLE', label: 'Consumable' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'SPARE', label: 'Spare' },
]

export function StockEnquiryPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const companyUid = useSession((s) => s.companyUid)

  const [warehouse, setWarehouse] = useState('')
  const [itemType, setItemType] = useState('')
  const [search, setSearch] = useState('')
  const [hideZero, setHideZero] = useState(true)

  const whQ = useWarehouses()
  const warehouses = whQ.data?.data ?? []
  
  const params = useMemo(
    () => ({ warehouse: warehouse || undefined, item_type: itemType || undefined, search: search || undefined, hide_zero: hideZero }),
    [warehouse, itemType, search, hideZero],
  )
  const { data, isLoading, error, refetch } = useStockBalances(params)
  const rows = data ?? []
  const hasValue = rows.some((r) => r.stock_value != null)

  const totals = useMemo(
    () => ({
      items: rows.length,
      value: rows.reduce((s, r) => s + (r.stock_value ?? 0), 0),
    }),
    [rows],
  )

  const columns: Column<StockBalanceRow>[] = [
    { key: 'sno', header: 'S.No', width: '60px', align: 'center', render: (_, idx) => <span className="text-xs text-fg-subtle">{idx + 1}</span> },
    { key: 'itemCode', header: 'Item Code', width: '120px', accessor: (r) => r.item_code, render: (r) => <span className="text-xs font-medium">{r.item_code}</span> },
    { key: 'itemName', header: 'Item Name', width: '220px', accessor: (r) => r.item_name, render: (r) => <span className="text-xs">{r.item_name}</span> },
    { key: 'category', header: 'Category', width: '130px', accessor: (r) => r.category, render: (r) => <span className="text-xs text-fg-muted">{r.category}</span> },
    { key: 'warehouse', header: 'Store / Warehouse', width: '160px', accessor: (r) => r.warehouse_name || '-', render: (r) => <span className="text-xs">{r.warehouse_name || '-'}</span> },
    { key: 'batchNo', header: 'Batch / Lot', width: '120px', accessor: (r) => r.batch_no, render: (r) => <span className="text-xs font-mono">{r.batch_no}</span> },
    { key: 'uom', header: 'UOM', width: '70px', render: (r) => <span className="text-2xs text-fg-muted">{r.uom}</span> },
    { key: 'available', header: 'Available Qty', align: 'right', sortable: true, width: '120px', accessor: (r) => r.available_qty, render: (r) => <span className="tabular text-xs font-medium text-success">{formatQty(r.available_qty)}</span> },
    { key: 'reserved', header: 'Reserved Qty', align: 'right', width: '110px', accessor: (r) => r.reserved_qty, render: (r) => (r.reserved_qty ? <span className="tabular text-xs text-warning">{formatQty(r.reserved_qty)}</span> : <span className="text-xs text-fg-subtle">—</span>) },
    { key: 'totalQty', header: 'Total Qty', align: 'right', sortable: true, width: '110px', accessor: (r) => r.total_qty, render: (r) => <span className="tabular text-xs font-medium">{formatQty(r.total_qty)}</span> },
    ...(hasValue ? [
      { key: 'unitCost', header: 'Unit Cost', align: 'right' as const, sortable: true, width: '110px', accessor: (r: StockBalanceRow) => r.unit_cost ?? 0, render: (r: StockBalanceRow) => <span className="tabular text-xs">{r.unit_cost == null ? '—' : formatCurrency(r.unit_cost)}</span> },
      { key: 'stockValue', header: 'Stock Value', align: 'right' as const, sortable: true, width: '130px', accessor: (r: StockBalanceRow) => r.stock_value ?? 0, render: (r: StockBalanceRow) => <span className="tabular text-xs font-medium">{r.stock_value == null ? '—' : formatCurrency(r.stock_value)}</span> }
    ] : []),
    { key: 'lastMovement', header: 'Last Movement', width: '140px', accessor: (r) => r.last_movement_date || '-', render: (r) => <span className="text-xs text-fg-muted">{r.last_movement_date ? new Date(r.last_movement_date).toLocaleDateString() : '-'}</span> },
    {
      key: 'action', header: 'Action', width: '80px', align: 'center', stickyRight: true,
      render: (r) => (
        <Menu trigger={<IconButton icon={MoreVertical} variant="ghost" size="sm" />}>
          <MenuItem label="View Ledger" onClick={() => navigate(`/inventory/ledger?item=${r.item_uid}&warehouse=${r.warehouse_uid || ''}&batch_no=${r.batch_no || ''}`)} />
        </Menu>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] gap-4 pb-4">
      <PageHeader
        title="Stock Balance"
        description="Detailed inventory balance including store, batch, and valuation."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Stock Balance' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load stock">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <Card className="flex-none shrink-0">
        <CardBody className="flex flex-wrap items-end gap-4">
          <Select label="Store / Warehouse" containerClassName="w-64" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}
            options={[{ value: '', label: 'All stores' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
          <Select label="Category" containerClassName="w-48" value={itemType} onChange={(e) => setItemType(e.target.value)} options={ITEM_TYPES} />
          <Input label="Search Item" containerClassName="w-64" value={search} placeholder="Search by item code or name..." onChange={(e) => setSearch(e.target.value)} />
          <div className="pb-1"><Switch checked={hideZero} onChange={setHideZero} label="Hide zero balances" /></div>
        </CardBody>
      </Card>

      <div className="flex-1 min-h-0 bg-surface border border-border rounded-md shadow-sm">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => `${r.item_uid}-${r.warehouse_uid}-${r.batch_no}`}
          loading={isLoading}
          onRowClick={(r) => navigate(`/inventory/ledger?item=${r.item_uid}`)}
          onExport={(f: ExportFormat) => { const n = exportRows(f, 'stock-balance', 'Stock Balance', columnsFromTable(columns), rows); toast.success('Export ready', `${n} rows written.`) }}
          emptyTitle="No stock found"
          emptyDescription="Stock will appear here once goods receipts or initial balances are posted."
        />
      </div>

      <div className="flex-none shrink-0 p-4 bg-surface border border-border rounded-md shadow-sm">
        <div className="flex justify-between items-center text-sm">
          <div className="text-fg-muted">
            Total unique balances: <strong className="text-fg">{totals.items}</strong>
          </div>
          {hasValue && (
            <div className="text-fg-muted">
              Total Stock Value: <strong className="text-fg text-lg">{formatCurrency(totals.value)}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
