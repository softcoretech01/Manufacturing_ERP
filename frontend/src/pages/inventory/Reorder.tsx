import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ShieldAlert, TrendingDown, Eye, MoreHorizontal } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useReorder } from '@/hooks/useAnalysis'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { ReorderRow } from '@/api/analysis'
import { InvKpiTile } from '@/components/inventory/InvKpiTile'
import { InvFilterBar, InvSearch, InvSelect } from '@/components/inventory/InvFilterBar'

function severityBadge(r: ReorderRow) {
  if (r.available <= 0) return <Badge tone="danger" size="sm">Out of Stock</Badge>
  if (r.available < r.reorder_level * 0.5) return <Badge tone="danger" size="sm">Critical</Badge>
  return <Badge tone="warning" size="sm">Low Stock</Badge>
}

/** Reorder report (SRS Vol 4 Ch 10) — items whose available stock has dropped
 *  below their reorder level, with the shortfall and a suggested order quantity. */
export function ReorderReportPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [warehouse, setWarehouse] = useState('')
  const [search, setSearch] = useState('')
  const warehouses = useWarehouses().data?.data ?? []
  const { data, isLoading, error } = useReorder(warehouse || undefined)
  const rows = data ?? []

  const filtered = search
    ? rows.filter((r) =>
        r.item_name.toLowerCase().includes(search.toLowerCase()) ||
        r.item_code.toLowerCase().includes(search.toLowerCase()),
      )
    : rows

  const outOfStock = filtered.filter((r) => r.available <= 0).length
  const critical = filtered.filter((r) => r.available > 0 && r.available < r.reorder_level * 0.5).length
  const belowReorder = filtered.length

  const columns: Column<ReorderRow>[] = [
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>,
    },
    {
      key: 'item', header: 'Item', sortable: true, width: '230px', className: 'cell-stack', accessor: (r) => `${r.item_name} ${r.item_code}`,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-fg" title={r.item_name}>{r.item_name}</p>
          <p className="truncate font-mono text-[12px] text-fg-subtle" title={String(r.item_code ?? "")}>{r.item_code}</p>
        </div>
      ),
    },
    {
      key: 'category', header: 'Category', width: '125px', accessor: (r) => r.category,
      render: (r) => <Badge tone="neutral" size="sm" dot={false}>{r.category || '—'}</Badge>,
    },
    {
      key: 'warehouse', header: 'Store', width: '160px', defaultHidden: true,
      render: () => (
        <span className="text-[14px] text-fg-muted">
          {warehouse ? warehouses.find((w) => w.uid === warehouse)?.name ?? '—' : 'All stores'}
        </span>
      ),
    },
    {
      key: 'available', header: 'Available', align: 'right', sortable: true, width: '125px',
      accessor: (r) => r.available,
      render: (r) => (
        <span className={`text-[15px] font-semibold tabular-nums ${r.available <= 0 ? 'text-danger' : 'text-warning'}`}>
          {formatQty(r.available)}
        </span>
      ),
    },
    {
      key: 'uom', header: 'UOM', width: '70px', align: 'center', defaultHidden: true,
      render: (r) => <span className="text-[13px] text-fg-muted">{r.uom}</span>,
    },
    {
      key: 'min_level', header: 'Min Stock', align: 'right', width: '120px', defaultHidden: true,
      accessor: (r) => r.min_level ?? 0,
      render: (r) => r.min_level == null
        ? <span className="text-fg-subtle" title="No minimum stock set on the Item master">—</span>
        : <span className="text-[14px] tabular-nums text-fg-muted">{formatQty(r.min_level)}</span>,
    },
    {
      key: 'reorder_level', header: 'Reorder At', align: 'right', width: '120px',
      accessor: (r) => r.reorder_level,
      render: (r) => <span className="text-[14px] tabular-nums text-fg-muted">{formatQty(r.reorder_level)}</span>,
    },
    {
      key: 'shortfall', header: 'Shortage', align: 'right', sortable: true, width: '125px',
      accessor: (r) => r.shortfall,
      // Shortage is how much is missing. The backend already returns it as a
      // positive number, so it is rendered as-is — it used to be prefixed with a
      // hardcoded minus, which showed a 20,000 shortage as "-20,000".
      render: (r) => (
        <span className="text-[15px] font-semibold tabular-nums text-danger">{formatQty(r.shortfall)}</span>
      ),
    },
    {
      key: 'suggested_order', header: 'Suggest Order', align: 'right', width: '140px',
      accessor: (r) => r.suggested_order,
      render: (r) => <span className="text-[14px] font-semibold tabular-nums text-brand-600">{formatQty(r.suggested_order)}</span>,
    },
    {
      key: 'last_stock_in', header: 'Last Stock In', width: '125px', defaultHidden: true,
      accessor: (r) => r.last_stock_in ?? '',
      render: (r) => r.last_stock_in
        ? <span className="text-[13px] tabular-nums text-fg-muted">{formatDate(r.last_stock_in)}</span>
        : <span className="text-fg-subtle" title="This item has never been received">Never</span>,
    },
    {
      key: 'severity', header: 'Severity', width: '130px', align: 'center',
      accessor: (r) => r.available <= 0 ? 0 : r.available,
      render: (r) => severityBadge(r),
    },
    {
      key: 'actions', header: 'Actions', width: '110px', align: 'center', className: 'col-flex',
      render: (r) => {
        const toLedger = `/inventory/ledger?item=${r.item_uid}${warehouse ? `&warehouse=${warehouse}` : ''}`
        return (
          <div className="flex items-center justify-center gap-0.5">
            <IconButton
              icon={Eye} variant="ghost" size="sm"
              title="View stock ledger" aria-label={`View ledger for ${r.item_code}`}
              onClick={() => navigate(toLedger)}
            />
            <Menu trigger={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" title="More actions" aria-label="More actions" />}>
              <MenuItem label="View stock ledger" onClick={() => navigate(toLedger)} />
              <MenuItem label="View current stock" onClick={() => navigate(`/inventory/stock?search=${r.item_code}`)} />
            </Menu>
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reorder / Low Stock"
        description="Items whose available stock has fallen below their reorder level."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Reorder Report' }]}
      />

      {error && <Alert tone="danger" title="Could not load the reorder report">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}

      {/* KPI tiles */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <InvKpiTile
          label="Out of Stock"
          value={outOfStock}
          sub="Available qty = 0"
          icon={<TrendingDown />}
          tone={outOfStock > 0 ? 'danger' : 'success'}
        />
        <InvKpiTile
          label="Critical Low"
          value={critical}
          sub="Below 50% of reorder level"
          icon={<ShieldAlert />}
          tone={critical > 0 ? 'danger' : 'success'}
        />
        <InvKpiTile
          label="Below Reorder"
          value={belowReorder}
          sub="Total items needing replenishment"
          icon={<AlertTriangle />}
          tone={belowReorder > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* Filter bar */}
      <InvFilterBar
        left={
          <>
            <InvSearch value={search} onChange={setSearch} placeholder="Item name or code…" />
            <InvSelect
              label="Warehouse"
              value={warehouse}
              onChange={setWarehouse}
              options={[
                { value: '', label: 'All warehouses' },
                ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` })),
              ]}
            />
          </>
        }
      />

      {!isLoading && filtered.length === 0 && (
        <Alert tone="tip" title="All items above their reorder level">Nothing needs replenishment right now.</Alert>
      )}

      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        <DataTable
          density="comfortable"
          searchable={false}
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.item_code}
          loading={isLoading}
          onExport={(f: ExportFormat) => {
            const n = exportRows(f, 'reorder', 'Reorder report', columnsFromTable(columns), filtered)
            toast.success('Export ready', `${n} rows written.`)
          }}
          emptyTitle="Nothing below reorder"
        />
      </div>
    </div>
  )
}
