import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, MoreHorizontal, Download } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows } from '@/lib/export'
import { formatQty, formatCurrency, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useBatchEnquiry } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { BatchRow } from '@/api/stock'
import { InvFilterBar, InvSearch, InvSelect } from '@/components/inventory/InvFilterBar'

const EXPIRY_STATUS = [
  { value: '', label: 'All batches' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'EXPIRING_SOON', label: 'Expiring soon' },
  { value: 'VALID', label: 'Valid' },
  { value: 'UNKNOWN', label: 'No expiry recorded' },
]

/** Expiry state is encoded in text as well as colour — colour alone is not an
 *  accessible status signal (CLAUDE.md §7). */
function expiryBadge(r: BatchRow) {
  switch (r.status) {
    case 'EXPIRED':
      return <Badge tone="danger" size="sm">Expired</Badge>
    case 'EXPIRING_SOON':
      return <Badge tone="warning" size="sm">Expiring soon</Badge>
    case 'VALID':
      return <Badge tone="success" size="sm">Valid</Badge>
    default:
      return <Badge tone="neutral" size="sm">No expiry</Badge>
  }
}

export function BatchesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const companyUid = useSession((s) => s.companyUid)

  const [search, setSearch] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [expiryStatus, setExpiryStatus] = useState('')
  const [expiryFrom, setExpiryFrom] = useState('')
  const [expiryTo, setExpiryTo] = useState('')

  const warehouses = useWarehouses().data?.data ?? []

  const params = useMemo(
    () => ({
      search: search || undefined,
      warehouse: warehouse || undefined,
      batch_no: batchNo || undefined,
      expiry_status: expiryStatus || undefined,
      expiry_from: expiryFrom || undefined,
      expiry_to: expiryTo || undefined,
      hide_zero: true,
    }),
    [search, warehouse, batchNo, expiryStatus, expiryFrom, expiryTo],
  )

  const { data, isLoading, error } = useBatchEnquiry(params)
  const rows = data ?? []
  const hasValue = rows.some((r) => r.stock_value != null)

  function clearFilters() {
    setSearch('')
    setWarehouse('')
    setBatchNo('')
    setExpiryStatus('')
    setExpiryFrom('')
    setExpiryTo('')
  }

  const columns: Column<BatchRow>[] = [
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>,
    },
    {
      key: 'item', header: 'Item', width: '200px', sortable: true, className: 'cell-stack',
      accessor: (r) => `${r.item_name} ${r.item_code}`,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-fg" title={r.item_name}>{r.item_name}</p>
          <p className="truncate font-mono text-[12px] text-fg-subtle" title={String(r.item_code ?? "")}>{r.item_code}</p>
        </div>
      ),
    },
    {
      key: 'batch_no', header: 'Batch / Lot', width: '140px', sortable: true,
      accessor: (r) => r.batch_no,
      render: (r) => <span className="font-mono text-[13px] font-medium text-fg">{r.batch_no}</span>,
    },
    {
      key: 'warehouse', header: 'Store', width: '150px',
      accessor: (r) => r.warehouse_name ?? '',
      render: (r) => (
        <span className="block truncate text-[14px] text-fg" title={r.warehouse_name ?? ''}>
          {r.warehouse_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'available_qty', header: 'Available', width: '125px', align: 'right', sortable: true,
      accessor: (r) => r.available_qty,
      render: (r) => (
        <span className="text-[15px] font-semibold tabular-nums text-success">
          {formatQty(r.available_qty)}
        </span>
      ),
    },
    {
      key: 'uom', header: 'UOM', width: '70px', align: 'center',
      render: (r) => <span className="text-[13px] text-fg-muted">{r.uom}</span>,
    },
    {
      key: 'mfg_date', header: 'Mfg Date', width: '125px', defaultHidden: true,
      accessor: (r) => r.mfg_date ?? '',
      render: (r) => r.mfg_date
        ? <span className="text-[13px] tabular-nums">{formatDate(r.mfg_date)}</span>
        : <span className="text-fg-subtle">—</span>,
    },
    {
      key: 'expiry_date', header: 'Expiry', width: '120px', sortable: true,
      accessor: (r) => r.expiry_date ?? '',
      render: (r) => r.expiry_date
        ? <span className="text-[13px] tabular-nums">{formatDate(r.expiry_date)}</span>
        : <span className="text-fg-subtle">—</span>,
    },
    {
      key: 'days_to_expiry', header: 'Days Left', width: '110px', align: 'right', sortable: true,
      accessor: (r) => r.days_to_expiry ?? Number.MAX_SAFE_INTEGER,
      render: (r) => {
        if (r.days_to_expiry == null) return <span className="text-fg-subtle">—</span>
        const overdue = r.days_to_expiry < 0
        return (
          <span className={`text-[14px] font-medium tabular-nums ${overdue ? 'text-danger' : r.status === 'EXPIRING_SOON' ? 'text-warning' : 'text-fg'}`}>
            {overdue ? `${Math.abs(r.days_to_expiry)} overdue` : r.days_to_expiry}
          </span>
        )
      },
    },
    {
      key: 'unit_cost', header: 'Unit Cost', width: '120px', align: 'right', defaultHidden: true,
      accessor: (r) => r.unit_cost ?? 0,
      render: (r) => r.unit_cost == null
        ? <span className="text-fg-subtle">—</span>
        : <span className="text-[14px] tabular-nums text-fg-muted">{formatCurrency(r.unit_cost)}</span>,
    },
    {
      key: 'stock_value', header: 'Stock Value', width: '130px', align: 'right', sortable: true, defaultHidden: true,
      accessor: (r) => r.stock_value ?? 0,
      render: (r) => r.stock_value == null
        ? <span className="text-fg-subtle">—</span>
        : <span className="text-[14px] font-semibold tabular-nums text-fg">{formatCurrency(r.stock_value)}</span>,
    },
    {
      key: 'status', header: 'Status', width: '125px', align: 'center',
      accessor: (r) => r.status,
      render: (r) => expiryBadge(r),
    },
    {
      key: 'actions', header: 'Actions', width: '110px', align: 'center', className: 'col-flex',
      render: (r) => {
        const toLedger = `/inventory/ledger?item=${r.item_uid}&warehouse=${r.warehouse_uid ?? ''}&batch_no=${encodeURIComponent(r.batch_no)}`
        return (
          <div className="flex items-center justify-center gap-0.5">
            <IconButton
              icon={Eye} variant="ghost" size="sm"
              title="View batch movements" aria-label={`View movements for batch ${r.batch_no}`}
              onClick={() => navigate(toLedger)}
            />
            <Menu trigger={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" title="More actions" aria-label="More actions" />}>
              <MenuItem label="View batch ledger" onClick={() => navigate(toLedger)} />
              <MenuItem label="View item stock" onClick={() => navigate(`/inventory/stock?search=${r.item_code}`)} />
            </Menu>
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader
        title="Batch & Expiry"
        description="Every batch holding stock, with its store, valuation and expiry position."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Batch & Expiry' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in to load batch data.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load batches">
          {error instanceof ProblemError ? error.problem.detail : 'Unable to load batch data. Is the backend running?'}
        </Alert>
      )}

      <InvFilterBar
        left={
          <>
            <InvSearch value={search} onChange={setSearch} placeholder="Search item, code, batch…" />
            <InvSelect
              label="Store"
              value={warehouse}
              onChange={setWarehouse}
              options={[
                { value: '', label: 'All stores' },
                ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` })),
              ]}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="batch-filter" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Batch / Lot</label>
              <input
                id="batch-filter"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="All batches"
                className="h-9 w-40 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
            <InvSelect label="Expiry Status" value={expiryStatus} onChange={setExpiryStatus} options={EXPIRY_STATUS} />
            <div className="flex flex-col gap-1">
              <label htmlFor="expiry-from" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Expiry From</label>
              <input
                id="expiry-from" type="date" value={expiryFrom}
                onChange={(e) => setExpiryFrom(e.target.value)}
                className="h-9 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="expiry-to" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Expiry To</label>
              <input
                id="expiry-to" type="date" value={expiryTo}
                onChange={(e) => setExpiryTo(e.target.value)}
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
                const n = exportRows('csv', 'batch-expiry', 'Batch & Expiry', columnsFromTable(columns), rows)
                toast.success('Export ready', `${n} rows written.`)
              }}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      <DataTable
        density="comfortable"
        searchable={false}
        rows={rows}
        columns={hasValue ? columns : columns.filter((c) => c.key !== 'unit_cost' && c.key !== 'stock_value')}
        rowKey={(r) => `${r.item_uid}-${r.warehouse_uid ?? 'na'}-${r.batch_no}`}
        loading={isLoading}
        emptyTitle="No batches found"
        emptyDescription="No batch is holding stock under these filters. Try clearing them."
      />
    </div>
  )
}

export default BatchesPage
