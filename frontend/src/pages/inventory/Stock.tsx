import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Eye, MoreHorizontal } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty, formatCurrency } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useStockBalances } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { StockBalanceRow } from '@/api/stock'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { InvFilterBar, InvSearch, InvSelect } from '@/components/inventory/InvFilterBar'

const ITEM_TYPES = [
  { value: '', label: 'All types' },
  { value: 'RAW_MATERIAL', label: 'Raw material' },
  { value: 'FINISHED_GOODS', label: 'Finished goods' },
  { value: 'WIP', label: 'WIP' },
  { value: 'CONSUMABLE', label: 'Consumable' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'SPARE', label: 'Spare' },
]

function stockStatusBadge(r: StockBalanceRow) {
  const qty = r.available_qty ?? 0
  if (qty <= 0) return <Badge tone="danger" size="sm">Out of Stock</Badge>
  // No reorder_level field on StockBalanceRow so use a simple heuristic
  return <Badge tone="success" size="sm">In Stock</Badge>
}

export function StockEnquiryPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const companyUid = useSession((s) => s.companyUid)

  const [warehouse, setWarehouse] = useState('')
  const [itemType, setItemType] = useState('')
  const [search, setSearch] = useState('')
  const [hideZero, setHideZero] = useState(false)

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
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_, idx) => <span className="text-[13px] text-fg-subtle tabular-nums">{idx + 1}</span>,
    },
    {
      key: 'itemCode', header: 'Item', className: 'cell-stack',
      accessor: (r) => `${r.item_name} ${r.item_code}`,
      render: (r) => (
        <div className="min-w-[220px]">
          <p className="truncate text-[14px] font-semibold text-fg" title={r.item_name}>{r.item_name}</p>
          <p className="truncate font-mono text-[12px] text-fg-subtle">{r.item_code}</p>
        </div>
      ),
    },
    {
      key: 'item_type', header: 'Type', width: '130px', accessor: (r) => r.category,
      render: (r) => <Badge tone="neutral" size="sm" dot={false}>{r.category || '—'}</Badge>,
    },
    {
      key: 'warehouse', header: 'STORE', width: '180px',
      accessor: (r) => r.warehouse_name || '',
      render: (r) => {
        const name = r.warehouse_name ? r.warehouse_name.split(' - ').pop() : '—'
        return <span className="block truncate text-[14px] text-fg" title={name}>{name}</span>
      },
    },
    {
      key: 'batchNo', header: 'Batch / Lot', width: '150px', accessor: (r) => r.batch_no,
      render: (r) => r.batch_no && r.batch_no !== '-'
        ? <span className="font-mono text-[13px] text-fg-muted">{r.batch_no}</span>
        : <span className="text-fg-subtle">—</span>,
    },
    {
      key: 'available', header: 'Available', align: 'right', sortable: true, width: '160px',
      accessor: (r) => r.available_qty,
      render: (r) => <span className="text-[15px] font-semibold text-success tabular-nums">{formatQty(r.available_qty)}</span>,
    },
    {
      // UOM stays its own column, beside the figure it qualifies, rather than
      // being glued onto the number.
      key: 'uom', header: 'UOM', width: '80px',
      render: (r) => <span className="text-[13px] text-fg-muted">{r.uom}</span>,
    },
    {
      key: 'status', header: 'Status', width: '120px', align: 'center',
      render: (r) => stockStatusBadge(r),
    },
    {
      key: 'action', header: 'Actions', width: '100px', align: 'center', className: 'col-flex',
      render: (r) => {
        const toLedger = `/inventory/ledger?item=${r.item_uid}&warehouse=${r.warehouse_uid || ''}&batch_no=${r.batch_no || ''}`
        return (
          <div className="flex items-center justify-center gap-0.5">
            <IconButton icon={Eye} variant="ghost" size="sm" title="View stock ledger"
              aria-label="View stock ledger" onClick={() => navigate(toLedger)} />
            <Menu trigger={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" title="More actions" aria-label="More actions" />}>
              <MenuItem label="View Ledger" onClick={() => navigate(toLedger)} />
              <MenuItem label="View Batches" onClick={() => navigate(`/inventory/batches?item=${r.item_uid}`)} />
            </Menu>
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader
        title="Stock Balance"
        description="Detailed inventory balance by store, batch and item."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Stock Balance' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in to load live stock data.</Alert>}
      {error && <Alert tone="danger" title="Could not load stock">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}

      {/* Filter bar */}
      <InvFilterBar
        left={
          <>
            <InvSearch value={search} onChange={setSearch} placeholder="Search item, code…" />
            <InvSelect label="Item Type" value={itemType} onChange={setItemType} options={ITEM_TYPES} />
            <InvSelect
              label="Warehouse"
              value={warehouse}
              onChange={setWarehouse}
              options={[
                { value: '', label: 'All stores' },
                ...warehouses.map((w) => ({ value: w.uid, label: w.name })),
              ]}
            />
          </>
        }
        right={
          <Button
            size="sm"
            variant="outline"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => {
              const n = exportRows('csv', 'stock-balance', 'Stock Balance', columnsFromTable(columns), rows)
              toast.success('Export ready', `${n} rows written.`)
            }}
          >
            Export CSV
          </Button>
        }
      />

      {/* Table */}
      <DataTable
          density="comfortable"
          searchable={false}
          rows={rows}
          columns={columns}
          rowKey={(r) => `${r.item_uid}-${r.warehouse_uid}-${r.batch_no}`}
          loading={isLoading}
          emptyTitle="No stock balances found"
          emptyDescription={hideZero ? 'All items are at zero quantity. Toggle Hide Zero to see them.' : 'No items match your filters.'}
        />
    </div>
  )
}
