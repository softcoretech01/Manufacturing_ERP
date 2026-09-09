import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Boxes, Eye, Network, Target } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ErrorState } from '@/components/planning/PlanningKit'
import { api } from '@/api/client'
import { useSession } from '@/api/session'
import { engineeringApi } from '@/api/engineering'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency } from '@/lib/format'

/**
 * Products — what the company sells.
 *
 * These are the finished goods demand is raised against, and the products whose
 * bills of material drive MRP. The screen reads the item master, which is the
 * one place their codes are defined: BOMs are keyed on them, stock is keyed on
 * them, and planning nets against them.
 *
 * It replaces a screen that listed `PRD-0001 … PRD-0005` from a fixture file.
 * Those codes existed nowhere else — no BOM, no stock, no demand — so a planner
 * choosing one got a product MRP could not explode, and the Products screen
 * disagreed with every other screen about what the company makes.
 *
 * There is a second product table in the database, `ERP_Product.Product`. No API
 * reads it and it duplicates these same codes. It is left alone rather than
 * wired up: two masters for one concept is the defect this screen is fixing,
 * not one to repeat.
 */

interface ItemRow {
  id?: number
  code: string
  name: string
  itemType: string
  category: string
  baseUom: string
  sellingPrice?: number | null
  standardCost?: number | null
  status?: string
  capacityMl?: number | null
  colour?: string | null
  steelGrade?: string | null
}

export function ProductsMasterPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const companyUid = useSession((s) => s.companyUid)

  const items = useQuery({
    queryKey: ['masters:items', companyUid],
    queryFn: () => api.get<ItemRow[]>('/items'),
    enabled: !!companyUid,
  })

  // A live BOM is what makes a product buildable, so it is shown on the row
  // rather than left for the planner to discover when MRP raises NO_BOM.
  const boms = useQuery({
    queryKey: ['eng:boms', companyUid],
    queryFn: engineeringApi.getBoms,
    enabled: !!companyUid,
  })

  const bomFor = useMemo(() => {
    const map = new Map<string, { status: string; revision: number }>()
    for (const b of boms.data ?? []) {
      const code = (b as { productCode?: string }).productCode
      if (!code) continue
      const status = String((b as { status?: string }).status ?? '')
      const revision = Number((b as { revision?: number }).revision ?? 0)
      // Prefer an approved structure over a draft one when both exist.
      const seen = map.get(code)
      if (!seen || (status === 'ACTIVE' && seen.status !== 'ACTIVE')) {
        map.set(code, { status, revision })
      }
    }
    return map
  }, [boms.data])

  const rows = useMemo(
    () =>
      (items.data ?? [])
        .filter((i) => i.itemType === 'FINISHED' && i.status !== 'INACTIVE')
        .sort((a, b) => a.code.localeCompare(b.code)),
    [items.data],
  )

  const [selected, setSelected] = useState<string[]>([])

  const columns: Column<ItemRow>[] = [
    {
      key: 'sno', header: 'S.No', width: '4.5rem', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-muted">{i + 1}</span>,
    },
    {
      key: 'code', header: 'Product Code', width: '12rem', sortable: true,
      render: (p) => <span className="font-mono text-[12px] font-medium text-brand-600">{p.code}</span>,
    },
    {
      key: 'name', header: 'Product', width: '20rem', sortable: true,
      render: (p) => <span className="truncate text-[13px] text-fg" title={p.name}>{p.name}</span>,
    },
    {
      key: 'category', header: 'Category', width: '11rem', sortable: true,
      render: (p) => <span className="text-[12px] text-fg-muted">{p.category}</span>,
    },
    { key: 'baseUom', header: 'UOM', width: '5rem', align: 'center',
      render: (p) => <span className="text-[12px] text-fg-muted">{p.baseUom}</span> },
    {
      key: 'bom', header: 'Bill of Material', width: '12rem', sortable: true,
      accessor: (p) => bomFor.get(p.code)?.status ?? '',
      // The one fact that decides whether this product can be planned at all.
      render: (p) => {
        const b = bomFor.get(p.code)
        if (!b) {
          return (
            <span title="MRP cannot explode this product without a bill of material">
              <Badge tone="danger" size="sm">No BOM</Badge>
            </span>
          )
        }
        if (b.status === 'ACTIVE') {
          return <Badge tone="success" size="sm">Live · rev {b.revision}</Badge>
        }
        return (
          <span title={`BOM is ${b.status.toLowerCase().replace(/_/g, ' ')}, so MRP will not use it`}>
            <Badge tone="warning" size="sm">{b.status.toLowerCase().replace(/_/g, ' ')}</Badge>
          </span>
        )
      },
    },
    {
      key: 'standardCost', header: 'Standard Cost', align: 'right', width: '10rem', sortable: true,
      accessor: (p) => p.standardCost ?? 0,
      render: (p) =>
        p.standardCost ? formatCurrency(p.standardCost) : <span className="text-[12px] text-fg-subtle">—</span>,
    },
    {
      key: 'sellingPrice', header: 'Selling Price', align: 'right', width: '10rem', sortable: true,
      accessor: (p) => p.sellingPrice ?? 0,
      render: (p) =>
        p.sellingPrice ? formatCurrency(p.sellingPrice) : <span className="text-[12px] text-fg-subtle">—</span>,
    },
  ]

  if (items.error) {
    return (
      <div>
        <PageHeader
          title="Products"
          breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Masters' }, { label: 'Products' }]}
        />
        <ErrorState
          title="Unable to load products"
          detail="The item master could not be reached, so the product list cannot be shown."
          onRetry={() => items.refetch()}
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Finished goods the company sells. Demand is raised against these, and their bills of material drive MRP."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Masters' }, { label: 'Products' }]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.code}
        loading={items.isLoading}
        density="comfortable"
        searchPlaceholder="Product code or name…"
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'products', 'Products', columnsFromTable(columns), rows)
          toast.success('Export ready', `${n} rows written.`)
        }}
        emptyTitle="No products yet"
        emptyDescription="A product is an item in the master typed as finished goods. Add one under Product Items, then give it a bill of material."
        rowActions={(p) => (
          <>
            <MenuItem
              label="View item"
              icon={<Eye />}
              onClick={() => navigate('/masters/product-items')}
            />
            <MenuItem
              label="Create demand for this product"
              icon={<Target />}
              separatorBefore
              onClick={() => navigate(`/planning/demand?product=${encodeURIComponent(p.code)}`)}
            />
            <MenuItem
              label={bomFor.get(p.code) ? 'View bill of material' : 'Create bill of material'}
              icon={<Network />}
              onClick={() => navigate('/engineering/bom')}
            />
            <MenuItem
              label="Components used"
              icon={<Boxes />}
              onClick={() => navigate('/engineering/bom-explorer')}
            />
          </>
        )}
      />
    </div>
  )
}

export default ProductsMasterPage
