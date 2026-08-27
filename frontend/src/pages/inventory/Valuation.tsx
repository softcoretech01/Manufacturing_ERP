import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty, formatCurrency } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useValuation } from '@/hooks/useAnalysis'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { ValuationRow } from '@/api/analysis'

/** Inventory valuation (SRS Vol 4 Ch 9) — stock value at moving average, read
 *  straight from the balance the stock engine maintains. */
export function ValuationPage() {
  const toast = useToast()
  const [warehouse, setWarehouse] = useState('')
  const warehouses = useWarehouses().data?.data ?? []
  const { data, isLoading, error } = useValuation(warehouse || undefined)
  const rows = data?.items ?? []

  const columns: Column<ValuationRow>[] = [
    { key: 'item', header: 'Item', sortable: true, sticky: true, width: '260px', accessor: (r) => r.item_code,
      render: (r) => <div className="min-w-0"><p className="truncate text-xs font-medium text-fg">{r.item_name}</p><p className="truncate font-mono text-2xs text-fg-subtle">{r.item_code}</p></div> },
    { key: 'item_type', header: 'Class', width: '120px', render: (r) => <span className="text-2xs text-fg-muted">{r.item_type.replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'quantity', header: 'On hand', align: 'right', sortable: true, width: '120px', accessor: (r) => r.quantity, render: (r) => <span className="tabular text-xs">{formatQty(r.quantity)} <span className="text-2xs text-fg-subtle">{r.uom}</span></span> },
    { key: 'avg_rate', header: 'Avg rate', align: 'right', width: '120px', render: (r) => <span className="tabular text-2xs text-fg-muted">{formatCurrency(r.avg_rate)}</span> },
    { key: 'value', header: 'Value', align: 'right', sortable: true, width: '150px', accessor: (r) => r.value ?? 0, render: (r) => <span className="tabular text-xs font-medium">{r.value == null ? '—' : formatCurrency(r.value)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Inventory valuation"
        description="What the stock is worth, at moving-average cost, from the balance the engine maintains — the figure that reconciles to Finance at close."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Valuation' }]} />
      {error && <Alert tone="danger" title="Could not load valuation">{error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}</Alert>}

      <Card className="mb-4"><CardBody className="flex flex-wrap items-center gap-3">
        <Select label="Warehouse" containerClassName="w-56" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}
          options={[{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
        <div className="ml-auto flex flex-wrap items-center gap-2 self-end pb-1">
          {data?.total_value != null && <span className="rounded bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600">Total {formatCurrency(data.total_value)}</span>}
          {(data?.by_type ?? []).map((t) => t.value != null && <Badge key={t.item_type} tone="neutral" size="sm">{t.item_type.replace(/_/g, ' ').toLowerCase()}: {formatCurrency(t.value)}</Badge>)}
        </div>
      </CardBody></Card>

      <DataTable rows={rows} columns={columns} rowKey={(r) => r.item_code} loading={isLoading}
        searchPlaceholder="Item…"
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'valuation', 'Inventory valuation', columnsFromTable(columns), rows); toast.success('Export ready', `${n} rows written.`) }}
        emptyTitle="No stock to value" />
    </div>
  )
}
