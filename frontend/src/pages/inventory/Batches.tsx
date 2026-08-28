import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty, formatDate } from '@/lib/format'
import { useSession } from '@/api/session'
import { useBatchEnquiry } from '@/hooks/useStock'
import type { BatchRow } from '@/api/stock'
import { Eye, MoreHorizontal } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { InvFilterBar, InvSearch } from '@/components/inventory/InvFilterBar'
import { InvStatusBadge } from '@/components/inventory/InvShell'

export function BatchesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const companyUid = useSession((s) => s.companyUid)

  const [search, setSearch] = useState('')

  const params = useMemo(
    () => ({ search: search || undefined, hide_zero: true }),
    [search],
  )
  
  const { data, isLoading } = useBatchEnquiry(params)
  const rows = data ?? []

  const columns: Column<BatchRow>[] = [
    { key: 'sno', header: 'S.No', width: '60px', render: (_, i) => <span className="text-xs text-fg-muted">{i + 1}</span> },
    { 
      key: 'item', 
      header: 'Item', 
      width: '280px', 
      render: (r) => (
        <div className="flex flex-col py-1">
          <span className="text-sm font-medium text-fg">{r.item_name}</span>
          <span className="text-xs text-fg-muted font-mono">{r.item_code}</span>
        </div>
      ) 
    },
    { key: 'batchNo', header: 'Batch / Lot No', width: '150px', accessor: (r) => r.batch_no, render: (r) => <span className="text-sm font-medium">{r.batch_no}</span> },
    { key: 'totalInward', header: 'Total Inward', align: 'right', width: '120px', accessor: (r) => r.total_inward, render: (r) => <span className="tabular text-sm text-fg-muted">{formatQty(r.total_inward)}</span> },
    { key: 'totalOutward', header: 'Total Outward', align: 'right', width: '120px', accessor: (r) => r.total_outward, render: (r) => <span className="tabular text-sm text-fg-muted">{formatQty(r.total_outward)}</span> },
    { key: 'currentStock', header: 'Available Qty', align: 'right', sortable: true, width: '130px', accessor: (r) => r.current_stock, render: (r) => <span className="tabular text-sm font-semibold text-brand-600">{formatQty(r.current_stock)}</span> },
    { key: 'status', header: 'Status', width: '100px', accessor: (r) => r.status, render: (r) => <InvStatusBadge status={r.status} /> },
    {
      key: 'action', header: 'Actions', width: '100px', align: 'center',
      className: 'col-sticky-right col-flex',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={Eye} variant="ghost" size="sm" title="View Batch Details" onClick={() => navigate(`/inventory/ledger?item=${r.item_uid}&batch_no=${r.batch_no}`)} />
          <Menu trigger={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" />}>
            <MenuItem label="View Batch Ledger" onClick={() => navigate(`/inventory/ledger?item=${r.item_uid}&batch_no=${r.batch_no}`)} />
          </Menu>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] gap-4 pb-4">
      <PageHeader
        title="Batch & Expiry"
        description="Monitor batches, lots, and expiry dates across all locations."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Batch Tracking' }]}
      />

      <InvFilterBar
        left={<InvSearch value={search} onChange={setSearch} placeholder="Search item, code, or batch..." />}
        right={
          <div className="text-xs font-medium text-fg-muted">
            {rows.length} Batches Found
          </div>
        }
      />

      <DataTable
          density="comfortable"
        className="flex-1 min-h-0 rounded-2xl"
        rows={rows}
        columns={columns}
        rowKey={(r) => `${r.item_uid}-${r.batch_no}`}
        loading={isLoading}
        searchable={false}
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'batch-tracking', 'Batch Tracking', columnsFromTable(columns), rows); toast.success('Export ready', `${n} rows written.`) }}
        emptyTitle="No batches found"
        emptyDescription="Batches will appear here once tracked items are received."
      />
    </div>
  )
}

