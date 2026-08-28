import { useState, useMemo } from 'react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty, formatCurrency } from '@/lib/format'
import { useValuation } from '@/hooks/useAnalysis'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { ValuationRow } from '@/api/analysis'
import { InvFilterBar, InvSearch } from '@/components/inventory/InvFilterBar'
import { InvKpiTile } from '@/components/inventory/InvKpiTile'
import { Select } from '@/components/ui/Input'
import { IndianRupee, Boxes, Hash, LayoutGrid } from 'lucide-react'

export function ValuationPage() {
  const toast = useToast()
  const [warehouse, setWarehouse] = useState('')
  const [search, setSearch] = useState('')
  const warehouses = useWarehouses().data?.data ?? []
  
  const { data, isLoading } = useValuation(warehouse || undefined)
  
  // Filter rows by search client-side since API might not support search directly
  const rows = useMemo(() => {
    const items = data?.items ?? []
    if (!search) return items
    const s = search.toLowerCase()
    return items.filter(i => 
      i.item_code.toLowerCase().includes(s) || 
      i.item_name.toLowerCase().includes(s) || 
      i.item_type.toLowerCase().includes(s)
    )
  }, [data?.items, search])

  const columns: Column<ValuationRow>[] = [
    { key: 'sno', header: 'S.No', width: '60px', render: (_, i) => <span className="text-xs text-fg-muted">{i + 1}</span> },
    { 
      key: 'item', 
      header: 'Item', 
      width: '320px', 
      render: (r) => (
        <div className="flex flex-col py-1 min-w-0">
          <span className="truncate text-sm font-medium text-fg">{r.item_name}</span>
          <span className="truncate font-mono text-xs text-fg-muted">{r.item_code}</span>
        </div>
      ) 
    },
    { key: 'item_type', header: 'Category', width: '150px', render: (r) => <span className="text-xs text-fg-muted capitalize">{r.item_type.replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'quantity', header: 'On Hand', align: 'right', sortable: true, width: '140px', accessor: (r) => r.quantity, render: (r) => <span className="tabular text-sm font-medium text-fg">{formatQty(r.quantity)} <span className="text-xs text-fg-subtle">{r.uom}</span></span> },
    { key: 'avg_rate', header: 'Avg Rate', align: 'right', width: '140px', render: (r) => <span className="tabular text-xs text-fg-muted">{formatCurrency(r.avg_rate)}</span> },
    { key: 'value', header: 'Total Value', align: 'right', sortable: true, width: '160px', accessor: (r) => r.value ?? 0, render: (r) => <span className="tabular text-sm font-semibold text-brand-600">{r.value == null ? '—' : formatCurrency(r.value)}</span> },
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] gap-4 pb-4">
      <PageHeader 
        title="Category Ledger / Valuation"
        description="Monitor stock valuation at moving-average cost across all categories and warehouses."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Valuation' }]} 
      />

      <InvFilterBar
        left={
          <>
            <InvSearch value={search} onChange={setSearch} placeholder="Search item, code, or category..." />
            <Select 
              value={warehouse} 
              onChange={(e) => setWarehouse(e.target.value)}
              options={[{ value: '', label: 'All Warehouses' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} 
              containerClassName="w-56"
            />
          </>
        }
      />

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 shrink-0">
          <InvKpiTile
            label="Total Stock Value"
            value={formatCurrency(data.total_value ?? 0)}
            icon={<IndianRupee />}
          />
          <InvKpiTile
            label="Total Items"
            value={(data.items?.length ?? 0).toLocaleString('en-IN')}
            icon={<Hash />}
          />
          <InvKpiTile
            label="Categories"
            value={(data.by_type?.length ?? 0).toLocaleString('en-IN')}
            icon={<LayoutGrid />}
          />
          <InvKpiTile
            label="Raw Material Value"
            value={formatCurrency(data.by_type?.find(t => t.item_type === 'RAW_MATERIAL')?.value ?? 0)}
            icon={<Boxes />}
          />
        </div>
      )}

      <DataTable
          density="comfortable" 
        className="flex-1 min-h-0 rounded-2xl"
        rows={rows} 
        columns={columns} 
        rowKey={(r) => r.item_code} 
        loading={isLoading}
        searchable={false}
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'valuation', 'Inventory Valuation', columnsFromTable(columns), rows); toast.success('Export ready', `${n} rows written.`) }}
        emptyTitle="No stock to value" 
      />
    </div>
  )
}

