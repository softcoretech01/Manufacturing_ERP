import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty, formatDate } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useBatchEnquiry } from '@/hooks/useStock'
import type { BatchRow } from '@/api/stock'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { MoreVertical } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

const ITEM_TYPES = [
  { value: '', label: 'All categories' },
  { value: 'RAW_MATERIAL', label: 'Raw material' },
  { value: 'FINISHED_GOODS', label: 'Finished goods' },
  { value: 'WIP', label: 'WIP' },
  { value: 'CONSUMABLE', label: 'Consumable' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'SPARE', label: 'Spare' },
]

export function BatchesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const companyUid = useSession((s) => s.companyUid)

  const [itemType, setItemType] = useState('')
  const [search, setSearch] = useState('')
  const [hideZero, setHideZero] = useState(true)

  const params = useMemo(
    () => ({ item_type: itemType || undefined, search: search || undefined, hide_zero: hideZero }),
    [itemType, search, hideZero],
  )
  
  const { data, isLoading, error, refetch } = useBatchEnquiry(params)
  const rows = data ?? []

  const columns: Column<BatchRow>[] = [
    { key: 'itemCode', header: 'Item Code', width: '120px', accessor: (r) => r.item_code, render: (r) => <span className="text-sm font-medium">{r.item_code}</span> },
    { key: 'itemName', header: 'Item Name', width: '220px', accessor: (r) => r.item_name, render: (r) => <span className="text-sm">{r.item_name}</span> },
    { key: 'batchNo', header: 'Batch / Lot No', width: '150px', accessor: (r) => r.batch_no, render: (r) => <span className="text-sm font-mono text-brand-600 font-medium">{r.batch_no}</span> },
    { key: 'totalInward', header: 'Total Inward', align: 'right', width: '120px', accessor: (r) => r.total_inward, render: (r) => <span className="tabular text-sm font-medium text-success">{formatQty(r.total_inward)}</span> },
    { key: 'totalOutward', header: 'Total Outward', align: 'right', width: '120px', accessor: (r) => r.total_outward, render: (r) => <span className="tabular text-sm font-medium text-danger">{formatQty(r.total_outward)}</span> },
    { key: 'currentStock', header: 'Current Stock', align: 'right', sortable: true, width: '130px', accessor: (r) => r.current_stock, render: (r) => <span className="tabular text-sm font-bold text-brand-700">{formatQty(r.current_stock)}</span> },
    { key: 'status', header: 'Status', width: '100px', accessor: (r) => r.status, render: (r) => <Badge tone={r.status === 'ACTIVE' ? 'success' : 'muted'} size="sm" dot={false}>{r.status}</Badge> },
    { key: 'lastMovement', header: 'Last Movement', width: '140px', accessor: (r) => r.last_movement_date || '-', render: (r) => <span className="text-xs text-fg-muted">{r.last_movement_date ? formatDate(r.last_movement_date) : '-'}</span> },
    {
      key: 'action', header: 'Action', width: '80px', align: 'center', stickyRight: true,
      render: (r) => (
        <Menu trigger={<IconButton icon={MoreVertical} variant="ghost" size="sm" />}>
          <MenuItem label="View Batch Ledger" onClick={() => navigate(`/inventory/ledger?item=${r.item_uid}&batch_no=${r.batch_no}`)} />
        </Menu>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] gap-4 pb-4">
      <PageHeader
        title="Batch / Lot Tracking"
        description="Comprehensive tracking of item batches across the organization."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Batch Tracking' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load batches">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <Card className="flex-none shrink-0">
        <CardBody className="flex flex-wrap items-end gap-4 p-4">
          <Select label="Category" containerClassName="w-48" value={itemType} onChange={(e) => setItemType(e.target.value)} options={ITEM_TYPES} />
          <Input label="Search" containerClassName="w-64" value={search} placeholder="Search by item code, name, or batch..." onChange={(e) => setSearch(e.target.value)} />
          <div className="pb-2"><Switch checked={hideZero} onChange={setHideZero} label="Hide consumed batches" /></div>
        </CardBody>
      </Card>

      <div className="flex-1 min-h-0 bg-surface border border-border rounded-md shadow-sm">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => `${r.item_uid}-${r.batch_no}`}
          loading={isLoading}
          searchPlaceholder="Search batches..."
          onExport={(f: ExportFormat) => { const n = exportRows(f, 'batch-tracking', 'Batch Tracking', columnsFromTable(columns), rows); toast.success('Export ready', `${n} rows written.`) }}
          emptyTitle="No batches found"
          emptyDescription="Batches will appear here once tracked items are received."
        />
      </div>
    </div>
  )
}
