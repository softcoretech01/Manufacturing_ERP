import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useReorder } from '@/hooks/useAnalysis'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { ReorderRow } from '@/api/analysis'

/** Reorder report (SRS Vol 4 Ch 10) — items whose available stock has dropped
 *  below their reorder level, with the shortfall and a suggested order quantity. */
export function ReorderReportPage() {
  const toast = useToast()
  const [warehouse, setWarehouse] = useState('')
  const warehouses = useWarehouses().data?.data ?? []
  const { data, isLoading, error } = useReorder(warehouse || undefined)
  const rows = data ?? []

  const columns: Column<ReorderRow>[] = [
    { key: 'item', header: 'Item', sortable: true, sticky: true, width: '260px', accessor: (r) => r.item_code,
      render: (r) => <div className="min-w-0"><p className="truncate text-xs font-medium text-fg">{r.item_name}</p><p className="truncate font-mono text-2xs text-fg-subtle">{r.item_code}</p></div> },
    { key: 'available', header: 'Available', align: 'right', sortable: true, width: '120px', accessor: (r) => r.available, render: (r) => <span className="tabular text-xs text-danger">{formatQty(r.available)} <span className="text-2xs text-fg-subtle">{r.uom}</span></span> },
    { key: 'reorder_level', header: 'Reorder at', align: 'right', width: '120px', render: (r) => <span className="tabular text-2xs text-fg-muted">{formatQty(r.reorder_level)}</span> },
    { key: 'shortfall', header: 'Shortfall', align: 'right', sortable: true, width: '120px', accessor: (r) => r.shortfall, render: (r) => <span className="tabular text-xs font-medium text-danger">−{formatQty(r.shortfall)}</span> },
    { key: 'suggested_order', header: 'Suggested order', align: 'right', width: '150px', render: (r) => <span className="tabular text-xs font-medium text-brand-600">{formatQty(r.suggested_order)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Reorder report"
        description="Items whose available stock has fallen below their reorder level — what to raise a purchase requisition for."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Reorder report' }]} />
      {error && <Alert tone="danger" title="Could not load the reorder report">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}

      <Card className="mb-4"><CardBody className="flex flex-wrap items-center gap-3">
        <Select label="Warehouse" containerClassName="w-56" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}
          options={[{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
        {rows.length > 0 && <span className="ml-auto flex items-center gap-1.5 self-end pb-1 text-xs font-medium text-danger"><AlertTriangle className="h-4 w-4" /> {rows.length} item(s) below reorder</span>}
      </CardBody></Card>

      {!isLoading && rows.length === 0 && <Alert tone="tip" title="All items above their reorder level">Nothing needs replenishment right now.</Alert>}

      <DataTable rows={rows} columns={columns} rowKey={(r) => r.item_code} loading={isLoading}
        searchPlaceholder="Item…"
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'reorder', 'Reorder report', columnsFromTable(columns), rows); toast.success('Export ready', `${n} rows written.`) }}
        emptyTitle="Nothing below reorder" />
    </div>
  )
}
