import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ItemCell, LocationCell, QtyCell, useCanSeeValue, withValueColumns } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ledger, stockPositions, warehouseSummaries } from '@/mock/inventory'
import type { LedgerEntry } from '@/types/inventory'

const DIRECTION_META: Record<string, { tone: 'success' | 'danger' | 'neutral' | 'brand'; label: string }> = {
  IN: { tone: 'success', label: 'In' },
  OUT: { tone: 'danger', label: 'Out' },
  STATUS: { tone: 'neutral', label: 'Status / move' },
  VALUE: { tone: 'brand', label: 'Value only' },
}

export function StockLedgerPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()

  const [item, setItem] = useState('RM-SS304-050')
  const [warehouse, setWarehouse] = useState('all')
  const [type, setType] = useState('all')

  const rows = useMemo(
    () =>
      ledger
        .filter((l) => (item === 'all' ? true : l.itemCode === item))
        .filter((l) => (warehouse === 'all' ? true : l.warehouseCode === warehouse))
        .filter((l) => (type === 'all' ? true : l.direction === type))
        .slice()
        .sort((a, b) => a.postedAt.localeCompare(b.postedAt)),
    [item, warehouse, type],
  )

  const summary = useMemo(() => {
    const inQty = rows.filter((r) => r.direction === 'IN').reduce((s, r) => s + r.quantity, 0)
    const outQty = rows.filter((r) => r.direction === 'OUT').reduce((s, r) => s + r.quantity, 0)
    const closing = rows.length ? rows[rows.length - 1].runningQty : 0
    const opening = rows.length ? rows[0].runningQty - (rows[0].direction === 'IN' ? rows[0].quantity : -rows[0].quantity) : 0
    return { inQty, outQty, closing, opening, moves: rows.length }
  }, [rows])

  const columns: Column<LedgerEntry>[] = [
    { key: 'businessDate', header: 'Date', sortable: true, width: '7rem', accessor: (l) => l.businessDate, render: (l) => (
      <div>
        <p className="text-xs text-fg">{formatDate(l.businessDate)}</p>
        <p className="text-2xs text-fg-subtle">{formatDateTime(l.postedAt).slice(-5)}</p>
      </div>
    ) },
    { key: 'docNo', header: 'Document', sortable: true, width: '12rem', render: (l) => (
      <div>
        <p className="font-mono text-2xs font-medium text-brand-600">{l.docNo}</p>
        <p className="text-2xs text-fg-subtle">{l.docType.replace(/_/g, ' ').toLowerCase()}</p>
      </div>
    ) },
    { key: 'movementType', header: 'Movement', sortable: true, width: '13rem', render: (l) => (
      <div>
        <p className="text-xs text-fg">
          <span className="font-mono text-2xs text-fg-muted">{l.movementType}</span> {l.movementName}
        </p>
        {l.reason && <p className="text-2xs italic text-fg-subtle">{l.reason}</p>}
      </div>
    ) },
    { key: 'itemCode', header: 'Item', sortable: true, defaultHidden: item !== 'all', render: (l) => <ItemCell code={l.itemCode} name={l.itemName} /> },
    { key: 'warehouseCode', header: 'Location', width: '10rem', render: (l) => <LocationCell warehouse={l.warehouseCode} bin={l.bin} batch={l.batchNo} /> },
    { key: 'in', header: 'In', align: 'right', accessor: (l) => (l.direction === 'IN' ? l.quantity : 0), render: (l) => (l.direction === 'IN' ? <QtyCell qty={l.quantity} tone="success" /> : <span className="text-fg-subtle">—</span>) },
    { key: 'out', header: 'Out', align: 'right', accessor: (l) => (l.direction === 'OUT' ? l.quantity : 0), render: (l) => (l.direction === 'OUT' ? <QtyCell qty={l.quantity} tone="danger" /> : <span className="text-fg-subtle">—</span>) },
    { key: 'runningQty', header: 'Balance', align: 'right', sortable: true, render: (l) => <span className="font-medium tabular">{formatQty(l.runningQty)}</span> },
    { key: 'postedBy', header: 'Posted by', sortable: true, defaultHidden: true },
  ]

  const valueColumns: Column<LedgerEntry>[] = [
    { key: 'rate', header: 'Rate', align: 'right', render: (l) => (l.rate ? formatCurrency(l.rate) : '—') },
    { key: 'value', header: 'Value', align: 'right', sortable: true, render: (l) => (l.value ? formatCurrency(l.value) : '—') },
  ]

  const cols = withValueColumns(canSeeValue, columns, valueColumns)

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'stock-ledger', 'Stock ledger / bin card', columnsFromTable(cols), rows)
      toast.success('Export ready', `${n} ledger rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const selectedItem = stockPositions.find((p) => p.itemCode === item)

  const filterPanel = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        sizeVariant="sm"
        containerClassName="w-56"
        value={item}
        onChange={(e) => setItem(e.target.value)}
        options={[{ value: 'all', label: 'All items' }, ...stockPositions.map((p) => ({ value: p.itemCode, label: `${p.itemCode} — ${p.itemName}` }))]}
      />
      <Select
        sizeVariant="sm"
        containerClassName="w-40"
        value={warehouse}
        onChange={(e) => setWarehouse(e.target.value)}
        options={[{ value: 'all', label: 'All locations' }, ...warehouseSummaries.map((w) => ({ value: w.code, label: w.code }))]}
      />
      <Select
        sizeVariant="sm"
        containerClassName="w-36"
        value={type}
        onChange={(e) => setType(e.target.value)}
        options={[
          { value: 'all', label: 'All movements' },
          { value: 'IN', label: 'Receipts only' },
          { value: 'OUT', label: 'Issues only' },
          { value: 'STATUS', label: 'Moves & status' },
        ]}
      />
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Stock ledger & bin card"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Stock ledger' }]}
        badge={<Badge tone="neutral" size="sm" dot={false}>Append-only</Badge>}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg">{summary.moves}</span> movement{summary.moves === 1 ? '' : 's'}
        {selectedItem ? <> for <span className="font-medium text-fg">{selectedItem.itemName}</span></> : ' across all items'} · opening{' '}
        <span className="font-medium text-fg tabular">{formatQty(summary.opening)}</span> · received{' '}
        <span className="font-medium text-success tabular">{formatQty(summary.inQty)}</span> · issued{' '}
        <span className="font-medium text-danger tabular">{formatQty(summary.outQty)}</span> · closing{' '}
        <span className="font-medium text-fg tabular">{formatQty(summary.closing)}</span>
        {selectedItem ? ` ${selectedItem.uom}` : ''}
      </p>

      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(l) => l.uid}
        pageSize={50}
        searchPlaceholder="Search document, batch, movement or reason…"
        onExport={doExport}
        filterPanel={filterPanel}
        filterChips={[
          ...(item !== 'all' ? [{ key: 'i', label: 'Item', value: item, onRemove: () => setItem('all') }] : []),
          ...(warehouse !== 'all' ? [{ key: 'w', label: 'Location', value: warehouse, onRemove: () => setWarehouse('all') }] : []),
          ...(type !== 'all' ? [{ key: 't', label: 'Direction', value: DIRECTION_META[type]?.label ?? type, onRemove: () => setType('all') }] : []),
        ]}
        onClearFilters={() => {
          setItem('all')
          setWarehouse('all')
          setType('all')
        }}
        emptyTitle="No movements"
        emptyDescription="Nothing has moved for this item and location in the selected period."
        rowClassName={(l) => cn(l.direction === 'OUT' && 'bg-danger/[0.02]')}
      />

      <Card className="mt-4">
        <CardHeader
          title="Why this screen never has an edit button"
          description="The ledger is the system of record for both quantity and value"
        />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Append-only.</span> No row is ever updated or deleted. A correction is a new,
            opposite entry that references the original, so the history of a mistake survives the correction.
          </p>
          <p>
            <span className="font-medium text-fg">Balance carried on the row.</span> Each entry stores the balance at that exact
            location after the movement, computed under the same lock that wrote it — never recalculated later by a report.
          </p>
          <p>
            <span className="font-medium text-fg">The auditor's screen.</span> Filtered to one item and one location this is the
            bin card: opening, every movement with its document, and closing, reconciling to the stock enquiry.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
