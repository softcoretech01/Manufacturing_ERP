import { useState } from 'react'
import { AlertTriangle, ShieldAlert, TrendingDown, BarChart3 } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty } from '@/lib/format'
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
      key: 'item', header: 'Item', sortable: true, sticky: true, width: '260px', accessor: (r) => r.item_code,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-fg">{r.item_name}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{r.item_code}</p>
        </div>
      ),
    },
    {
      key: 'available', header: 'Available', align: 'right', sortable: true, width: '120px',
      accessor: (r) => r.available,
      render: (r) => (
        <span className="tabular text-xs text-danger font-semibold">
          {formatQty(r.available)} <span className="text-2xs text-fg-subtle">{r.uom}</span>
        </span>
      ),
    },
    { key: 'reorder_level', header: 'Reorder At', align: 'right', width: '120px', render: (r) => <span className="tabular text-2xs text-fg-muted">{formatQty(r.reorder_level)}</span> },
    {
      key: 'shortfall', header: 'Shortfall', align: 'right', sortable: true, width: '120px',
      accessor: (r) => r.shortfall,
      render: (r) => <span className="tabular text-xs font-semibold text-danger">−{formatQty(r.shortfall)}</span>,
    },
    { key: 'suggested_order', header: 'Suggested Order', align: 'right', width: '150px', render: (r) => <span className="tabular text-xs font-semibold text-brand-600">{formatQty(r.suggested_order)}</span> },
    { key: 'severity', header: 'Severity', width: '120px', align: 'center', render: (r) => severityBadge(r) },
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
