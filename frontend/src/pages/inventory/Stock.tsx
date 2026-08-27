import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatQty, formatCurrency } from '@/lib/format'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useStockEnquiry } from '@/hooks/useStock'
import { useWarehouses } from '@/hooks/useOrganisation'
import type { StockRow } from '@/api/stock'

/**
 * Stock enquiry (SRS S-STK-01). Live from the stock engine — on-hand / available
 * by status, moving-average value. Value is masked server-side unless the caller
 * holds INVENTORY.STOCK.VALUE (V4-STK §2.11).
 */

const ITEM_TYPES = [
  { value: '', label: 'All classes' },
  { value: 'RAW_MATERIAL', label: 'Raw material' },
  { value: 'FINISHED_GOODS', label: 'Finished goods' },
  { value: 'WIP', label: 'WIP' },
  { value: 'CONSUMABLE', label: 'Consumable' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'SPARE', label: 'Spare' },
]

export function StockEnquiryPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const companyUid = useSession((s) => s.companyUid)

  const [warehouse, setWarehouse] = useState('')
  const [itemType, setItemType] = useState('')
  const [search, setSearch] = useState('')
  const [hideZero, setHideZero] = useState(true)

  const whQ = useWarehouses()
  const warehouses = whQ.data?.data ?? []
  const params = useMemo(
    () => ({ warehouse: warehouse || undefined, item_type: itemType || undefined, search: search || undefined, hide_zero: hideZero }),
    [warehouse, itemType, search, hideZero],
  )
  const { data, isLoading, error, refetch } = useStockEnquiry(params)
  const rows = data ?? []
  const hasValue = rows.some((r) => r.value != null)

  const totals = useMemo(
    () => ({
      items: rows.length,
      value: rows.reduce((s, r) => s + (r.value ?? 0), 0),
      belowReorder: rows.filter((r) => r.below_reorder).length,
    }),
    [rows],
  )

  const columns: Column<StockRow>[] = [
    {
      key: 'item', header: 'Item', sortable: true, sticky: true, width: '260px', accessor: (r) => r.item_code,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{r.item_name}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{r.item_code} · {r.item_type.replace(/_/g, ' ').toLowerCase()}</p>
        </div>
      ),
    },
    { key: 'uom', header: 'UOM', width: '70px', render: (r) => <span className="text-2xs text-fg-muted">{r.uom}</span> },
    { key: 'on_hand', header: 'On hand', align: 'right', sortable: true, width: '110px', accessor: (r) => r.on_hand, render: (r) => <span className="tabular text-xs">{formatQty(r.on_hand)}</span> },
    { key: 'available', header: 'Available', align: 'right', sortable: true, width: '110px', accessor: (r) => r.available, render: (r) => <span className="tabular text-xs font-medium">{formatQty(r.available)}</span> },
    { key: 'quarantine', header: 'Quaran.', align: 'right', width: '90px', accessor: (r) => r.quarantine, render: (r) => (r.quarantine ? <span className="tabular text-2xs text-warning">{formatQty(r.quarantine)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'blocked', header: 'Blocked', align: 'right', width: '90px', defaultHidden: true, accessor: (r) => r.blocked, render: (r) => (r.blocked ? <span className="tabular text-2xs text-danger">{formatQty(r.blocked)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    {
      key: 'reorder', header: 'Reorder', align: 'right', width: '110px', accessor: (r) => r.reorder_level ?? 0,
      render: (r) => (
        r.reorder_level == null ? <span className="text-2xs text-fg-subtle">—</span> :
        <span className={r.below_reorder ? 'tabular text-2xs font-medium text-danger' : 'tabular text-2xs text-fg-muted'}>
          {formatQty(r.reorder_level)}{r.below_reorder && ' ⚠'}
        </span>
      ),
    },
    ...(hasValue ? [{
      key: 'value', header: 'Value', align: 'right' as const, sortable: true, width: '130px',
      accessor: (r: StockRow) => r.value ?? 0, render: (r: StockRow) => <span className="tabular text-xs">{r.value == null ? '—' : formatCurrency(r.value)}</span>,
    }] : []),
  ]

  return (
    <div>
      <PageHeader
        title="Stock enquiry"
        description="On-hand and available stock by item and status, valued at moving average. The single source of truth every other inventory screen reads from."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Stock enquiry' }]}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load stock">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select label="Warehouse" containerClassName="w-56" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}
            options={[{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))]} />
          <Select label="Class" containerClassName="w-48" value={itemType} onChange={(e) => setItemType(e.target.value)} options={ITEM_TYPES} />
          <Input label="Search" containerClassName="w-56" value={search} placeholder="Item code or name…" onChange={(e) => setSearch(e.target.value)} />
          <div className="pb-1"><Switch checked={hideZero} onChange={setHideZero} label="Hide zero balances" /></div>
        </CardBody>
      </Card>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.item_uid}
        loading={isLoading}
        searchPlaceholder="Item…"
        onRowClick={(r) => navigate(`/inventory/ledger?item=${r.item_uid}`)}
        onExport={(f: ExportFormat) => { const n = exportRows(f, 'stock-enquiry', 'Stock enquiry', columnsFromTable(columns), rows); toast.success('Export ready', `${n} rows written.`) }}
        emptyTitle="No stock"
        emptyDescription="Post a goods receipt to bring stock in, then it appears here."
      />

      <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-2xs text-fg-subtle">
        <span>{totals.items} items</span>
        {hasValue && <span>on-hand value <strong className="text-fg-muted">{formatCurrency(totals.value)}</strong></span>}
        {totals.belowReorder > 0 && <span className="text-danger">below reorder: {totals.belowReorder}</span>}
      </p>
    </div>
  )
}
