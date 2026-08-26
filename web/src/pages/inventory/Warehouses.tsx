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

/** Warehouse register — what each store is for and how it behaves. Live data
 *  from the backend warehouse master (Organisation → Warehouses). Operational
 *  metrics (plant, storekeeper, occupancy, stock value, strategies, open moves)
 *  have no backend yet and show as placeholders until the Inventory module. */

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

  const { data, isLoading, error } = useWarehouses({ page_size: 200 })
  // Live warehouse master → the register's shape. Operational fields are
  // placeholders until the Inventory module provides them.
  const warehouseSummaries: Warehouse[] = (data?.data ?? [])
    .filter((w) => w.is_active)
    .map((w) => ({
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

  const totalValue = warehouseSummaries.reduce((s, w) => s + w.stockValue, 0)
  const binManaged = warehouseSummaries.filter((w) => w.isBinManaged)

  const columns: Column<Warehouse>[] = [
    { key: 'code', header: 'Warehouse', sortable: true, width: '14rem', render: (w) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{w.code}</p>
        <p className="truncate text-2xs text-fg-subtle">{w.name}</p>
      </div>
    ) },
    { key: 'warehouseType', header: 'Type', sortable: true, width: '11rem', render: (w) => <span className="text-2xs text-fg-muted">{w.warehouseType.replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'plant', header: 'Plant', sortable: true },
    { key: 'storekeeper', header: 'Storekeeper', sortable: true },
    { key: 'isBinManaged', header: 'Bins', align: 'center', width: '6rem', accessor: (w) => (w.isBinManaged ? 'Yes' : 'No'), render: (w) => (
      <Badge tone={w.isBinManaged ? 'success' : 'neutral'} size="sm" dot={false}>{w.isBinManaged ? 'Yes' : 'No'}</Badge>
    ) },
    { key: 'batchMandatory', header: 'Batch', align: 'center', width: '7.5rem', accessor: (w) => (w.batchMandatory ? 'Mandatory' : 'Optional'), render: (w) => (
      <span className={cn('text-2xs', w.batchMandatory ? 'text-fg' : 'text-fg-subtle')}>{w.batchMandatory ? 'Mandatory' : 'Optional'}</span>
    ) },
    { key: 'putawayStrategy', header: 'Put-away rule', width: '10rem', render: (w) => <span className="font-mono text-2xs text-fg-muted">{w.putawayStrategy}</span> },
    { key: 'pickStrategy', header: 'Pick rule', width: '8rem', render: (w) => <span className="font-mono text-2xs text-fg-muted">{w.pickStrategy}</span> },
    { key: 'valuationMethod', header: 'Valuation', width: '11rem', defaultHidden: true },
    { key: 'occupancy', header: 'Occupancy', width: '10rem', accessor: (w) => (w.binCount ? (w.binsOccupied / w.binCount) * 100 : 0), render: (w) => (
      w.binCount ? (
        <div className="flex items-center gap-2">
          <ProgressBar value={(w.binsOccupied / w.binCount) * 100} tone={w.binsOccupied / w.binCount > 0.85 ? 'warning' : 'brand'} className="w-14" />
          <span className="text-2xs tabular text-fg-muted">{((w.binsOccupied / w.binCount) * 100).toFixed(0)}%</span>
        </div>
      ) : <span className="text-2xs text-fg-subtle">no bins</span>
    ) },
    { key: 'openMovements', header: 'Open moves', align: 'right', width: '7.5rem', sortable: true },
    ...(canSeeValue ? [{ key: 'stockValue', header: 'Stock value', align: 'right' as const, sortable: true, render: (w: Warehouse) => formatCurrency(w.stockValue) }] : []),
    { key: 'includeInAtp', header: 'Sellable', align: 'center', width: '7rem', accessor: (w) => (w.includeInAtp ? 'Yes' : 'No'), render: (w) => (
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
    <div>
      <PageHeader
        title="Warehouses"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Warehouses' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/bin-map')}>Bin map</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/structure')}>Zones, racks & bins</Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-md border border-danger-border bg-danger-surface p-3 text-sm text-danger-fg">
          Failed to load warehouses from API.
        </div>
      )}

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg">{warehouseSummaries.length}</span> stores ·{' '}
        <span className="font-medium text-fg">{binManaged.length}</span> bin-managed ·{' '}
        <span className="font-medium text-fg">{warehouseSummaries.filter((w) => w.includeInAtp).length}</span> counted as sellable
        stock
        {canSeeValue && <> · <span className="font-medium text-fg tabular">₹{formatCompact(totalValue)}</span> held in total</>}.
        Quarantine, reject, transit and job-work stores are system-managed: stock only enters them through another document.
      </p>

      <DataTable
        rows={warehouseSummaries}
        columns={columns}
        rowKey={(w) => w.uid}
        loading={isLoading}
        searchPlaceholder="Search warehouse, type, plant or storekeeper…"
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

      <Card className="mt-4">
        <CardHeader title="What the settings mean" description="Four switches decide how a store behaves every day" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">Bin-managed</span> — stock is addressed down to a bin, so it can be found and counted precisely.</p>
          <p><span className="font-medium text-fg">Batch mandatory</span> — nothing moves in or out without a batch, which is what makes tracing possible.</p>
          <p><span className="font-medium text-fg">Put-away and pick rules</span> — where new stock goes, and which batch leaves first (FIFO, or FEFO for anything with an expiry).</p>
          <p><span className="font-medium text-fg">Sellable</span> — whether the stock counts towards what sales can promise. Quarantine and reject stores never do.</p>
        </CardBody>
      </Card>
    </div>
  )
}
