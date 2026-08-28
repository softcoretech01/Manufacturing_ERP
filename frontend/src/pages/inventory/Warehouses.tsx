import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useWarehouses } from '@/hooks/useOrganisation'
import { InvFilterBar, InvSearch } from '@/components/inventory/InvFilterBar'

interface Warehouse {
  uid: string
  code: string
  name: string
  warehouseType: string
  plant: string
  isBinManaged: boolean
  batchMandatory: boolean
  allowNegative: boolean
  putawayStrategy: string
  pickStrategy: string
  storekeeper: string
  valuationMethod: string
  binCount: number
  binsOccupied: number
  stockValue: number
  openMovements: number
  includeInAtp: boolean
}

const VALUATION_LABEL: Record<string, string> = {
  WEIGHTED_AVG: 'Weighted average',
  FIFO: 'FIFO',
  STANDARD: 'Standard cost',
}

export function WarehousesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeValue()
  const [search, setSearch] = useState('')

  const { data, isLoading, error } = useWarehouses({ page_size: 200 })
  
  const warehouseSummaries: Warehouse[] = useMemo(() => {
    let wlist = (data?.data ?? []).filter((w) => w.is_active).map((w) => ({
      uid: w.uid,
      code: w.code,
      name: w.name,
      warehouseType: w.warehouse_type,
      plant: '—',
      isBinManaged: w.is_bin_managed,
      batchMandatory: w.is_batch_mandatory,
      allowNegative: w.allow_negative_stock,
      putawayStrategy: '—',
      pickStrategy: '—',
      storekeeper: '—',
      valuationMethod: VALUATION_LABEL[w.valuation_method] ?? w.valuation_method,
      binCount: 0,
      binsOccupied: 0,
      stockValue: 0,
      openMovements: 0,
      includeInAtp: false,
    }))
    
    if (search) {
      const s = search.toLowerCase()
      wlist = wlist.filter(w => 
        w.code.toLowerCase().includes(s) || 
        w.name.toLowerCase().includes(s) || 
        w.warehouseType.toLowerCase().includes(s)
      )
    }
    return wlist
  }, [data?.data, search])

  const columns: Column<Warehouse>[] = [
    { key: 'code', header: 'Warehouse', sortable: true, width: '220px', render: (w) => (
      <div className="flex flex-col py-1 min-w-0">
        <span className="truncate text-sm font-medium text-fg">{w.code}</span>
        <span className="truncate text-xs text-fg-muted">{w.name}</span>
      </div>
    ) },
    { key: 'warehouseType', header: 'Type', sortable: true, width: '150px', render: (w) => <span className="text-xs text-fg-muted capitalize">{w.warehouseType.replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'plant', header: 'Location', sortable: true, width: '120px' },
    { key: 'storekeeper', header: 'Storekeeper', sortable: true, width: '150px' },
    { key: 'isBinManaged', header: 'Bins', align: 'center', width: '80px', accessor: (w) => (w.isBinManaged ? 'Yes' : 'No'), render: (w) => (
      <Badge tone={w.isBinManaged ? 'success' : 'neutral'} size="sm" dot={false}>{w.isBinManaged ? 'Yes' : 'No'}</Badge>
    ) },
    { key: 'batchMandatory', header: 'Batch', align: 'center', width: '100px', accessor: (w) => (w.batchMandatory ? 'Mandatory' : 'Optional'), render: (w) => (
      <span className={cn('text-xs', w.batchMandatory ? 'text-fg' : 'text-fg-subtle')}>{w.batchMandatory ? 'Mandatory' : 'Optional'}</span>
    ) },
    { key: 'includeInAtp', header: 'Sellable', align: 'center', width: '100px', accessor: (w) => (w.includeInAtp ? 'Yes' : 'No'), render: (w) => (
      <Badge tone={w.includeInAtp ? 'success' : 'neutral'} size="sm" dot={false}>{w.includeInAtp ? 'Yes' : 'No'}</Badge>
    ) },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'warehouses', 'Warehouse register', columnsFromTable(columns), warehouseSummaries)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] gap-4 pb-4">
      <PageHeader
        title="Warehouse Setup"
        description="Configuration and properties for all physical and virtual storage locations."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Warehouses' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/bin-map')}>Bin map</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/structure')}>Zones, racks & bins</Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-md border border-danger-border bg-danger-surface p-3 text-sm text-danger-fg shrink-0">
          Failed to load warehouses from API.
        </div>
      )}

      <InvFilterBar
        left={<InvSearch value={search} onChange={setSearch} placeholder="Search warehouse, type, or location..." />}
        right={<div className="text-xs font-medium text-fg-muted">{warehouseSummaries.length} Warehouses Found</div>}
      />

      <DataTable
          density="comfortable"
        className="flex-1 min-h-0 rounded-2xl"
        rows={warehouseSummaries}
        columns={columns}
        rowKey={(w) => w.uid}
        loading={isLoading}
        searchable={false}
        onExport={doExport}
        onRowClick={(w) => (w.isBinManaged ? navigate('/inventory/bin-map') : navigate('/inventory/stock'))}
        emptyTitle="No warehouses"
        rowActions={(w) => (
          <>
            <MenuItem label="Open bin map" disabled={!w.isBinManaged} onClick={() => navigate('/inventory/bin-map')} />
            <MenuItem label="See the stock in it" onClick={() => navigate('/inventory/stock')} />
            <MenuItem label="Edit zones, racks & bins" onClick={() => navigate('/inventory/structure')} />
            <MenuItem label="Edit the warehouse record" separatorBefore onClick={() => navigate('/admin/warehouses')} />
          </>
        )}
      />
    </div>
  )
}

