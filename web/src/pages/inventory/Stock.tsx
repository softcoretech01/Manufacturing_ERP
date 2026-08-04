import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import {
  AgeChip,
  BucketBar,
  BucketTile,
  ClassChip,
  CoverChip,
  InvStatusBadge,
  ItemCell,
  LocationCell,
  QtyCell,
  useCanSeeValue,
  withValueColumns,
} from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency, formatDate, formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { ledger, reservations, stockBalances, stockPositions, warehouseSummaries } from '@/mock/inventory'
import type { StockBalance, StockPosition } from '@/types/inventory'

export function StockEnquiryPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeValue()
  const posSeed = useMemo(() => stockPositions, [])
  const balSeed = useMemo(() => stockBalances, [])
  const { rows: positions } = useCollection<StockPosition>('inv:position', posSeed)
  const { rows: balances } = useCollection<StockBalance>('inv:balance', balSeed)

  const [view, setView] = useState<'items' | 'locations'>('items')
  const [warehouse, setWarehouse] = useState('all')
  const [klass, setKlass] = useState('all')
  const [hideZero, setHideZero] = useState(true)
  const [detail, setDetail] = useState<StockPosition | null>(null)
  const [detailTab, setDetailTab] = useState('locations')

  const filteredPositions = positions.filter((p) => {
    if (klass !== 'all' && p.itemClass !== klass) return false
    if (hideZero && p.onHand === 0) return false
    if (warehouse !== 'all') return balances.some((b) => b.itemCode === p.itemCode && b.warehouseCode === warehouse)
    return true
  })

  const filteredBalances = balances.filter((b) => {
    if (warehouse !== 'all' && b.warehouseCode !== warehouse) return false
    if (klass !== 'all' && b.itemClass !== klass) return false
    if (hideZero && b.quantity === 0) return false
    return true
  })

  const totals = {
    value: filteredBalances.reduce((s, b) => s + b.quantity * b.rate, 0),
    belowReorder: filteredPositions.filter((p) => p.reorderLevel > 0 && p.available - p.reserved < p.reorderLevel).length,
    quarantine: filteredBalances.filter((b) => b.status === 'QUARANTINE').reduce((s, b) => s + b.quantity, 0),
    blocked: filteredBalances.filter((b) => b.status === 'BLOCKED' || b.status === 'REJECTED' || b.status === 'EXPIRED').length,
  }

  /* Free = available − reserved. Sales and planning must never see raw on-hand
     (V4-STK-BR-003), so `free` is the column that leads. */
  const free = (p: StockPosition) => p.available - p.reserved

  const itemColumns: Column<StockPosition>[] = [
    { key: 'itemCode', header: 'Item', sortable: true, render: (p) => <ItemCell code={p.itemCode} name={p.itemName} /> },
    { key: 'abcClass', header: 'Class', width: '6rem', accessor: (p) => `${p.abcClass}/${p.xyzClass}`, render: (p) => <ClassChip abc={p.abcClass} xyz={p.xyzClass} /> },
    { key: 'uom', header: 'UOM', width: '4.5rem' },
    { key: 'onHand', header: 'On hand', align: 'right', sortable: true, render: (p) => <QtyCell qty={p.onHand} /> },
    { key: 'free', header: 'Free', align: 'right', sortable: true, accessor: free, render: (p) => <QtyCell qty={free(p)} tone={free(p) <= 0 ? 'danger' : 'success'} /> },
    { key: 'reserved', header: 'Reserved', align: 'right', sortable: true, render: (p) => <QtyCell qty={p.reserved} tone="muted" /> },
    { key: 'quarantine', header: 'Quarantine', align: 'right', defaultHidden: true, render: (p) => <QtyCell qty={p.quarantine} tone="muted" /> },
    { key: 'inTransit', header: 'In transit', align: 'right', defaultHidden: true, render: (p) => <QtyCell qty={p.inTransit} tone="muted" /> },
    { key: 'atSubcontractor', header: 'At vendor', align: 'right', defaultHidden: true, render: (p) => <QtyCell qty={p.atSubcontractor} tone="muted" /> },
    { key: 'onOrder', header: 'On order', align: 'right', sortable: true, render: (p) => <QtyCell qty={p.onOrder} tone="muted" /> },
    { key: 'reorderLevel', header: 'Reorder', align: 'right', defaultHidden: true, render: (p) => <QtyCell qty={p.reorderLevel} tone="muted" /> },
    {
      key: 'cover',
      header: 'Cover',
      width: '6rem',
      accessor: (p) => (p.avgDailyDemand ? Math.floor(free(p) / p.avgDailyDemand) : 999),
      render: (p) => (p.avgDailyDemand ? <CoverChip days={Math.floor(free(p) / p.avgDailyDemand)} /> : <span className="text-2xs text-fg-subtle">—</span>),
    },
  ]

  const itemValueColumns: Column<StockPosition>[] = [
    { key: 'value', header: 'Value', align: 'right', sortable: true, accessor: (p) => p.onHand * p.rate, render: (p) => formatCurrency(p.onHand * p.rate) },
  ]

  const locationColumns: Column<StockBalance>[] = [
    { key: 'itemCode', header: 'Item', sortable: true, render: (b) => <ItemCell code={b.itemCode} name={b.itemName} /> },
    { key: 'warehouseCode', header: 'Location', sortable: true, width: '11rem', render: (b) => <LocationCell warehouse={b.warehouseCode} bin={b.bin} batch={b.batchNo} /> },
    { key: 'supplierBatchNo', header: 'Supplier lot / heat', defaultHidden: true, render: (b) => <span className="font-mono text-2xs">{b.supplierBatchNo ?? '—'}</span> },
    { key: 'quantity', header: 'Quantity', align: 'right', sortable: true, render: (b) => <QtyCell qty={b.quantity} uom={b.uom} /> },
    { key: 'reserved', header: 'Reserved', align: 'right', render: (b) => <QtyCell qty={b.reserved} tone="muted" /> },
    {
      key: 'expiresOn',
      header: 'Expiry',
      width: '8rem',
      accessor: (b) => b.expiresOn ?? '',
      render: (b) => {
        if (!b.expiresOn) return <span className="text-2xs text-fg-subtle">—</span>
        const days = Math.ceil((new Date(b.expiresOn).getTime() - Date.now()) / 86_400_000)
        return (
          <span className={cn('text-2xs tabular', days <= 0 ? 'text-danger' : days <= 30 ? 'text-warning' : 'text-fg-muted')}>
            {formatDate(b.expiresOn)}
            {days <= 30 && days > 0 ? ` · ${days} d` : ''}
          </span>
        )
      },
    },
    { key: 'ageDays', header: 'Age', width: '5.5rem', sortable: true, render: (b) => <AgeChip days={b.ageDays} /> },
    { key: 'status', header: 'Stock status', sortable: true, width: '10rem', render: (b) => <InvStatusBadge status={b.status} size="sm" /> },
    { key: 'lastMovementAt', header: 'Last movement', defaultHidden: true, render: (b) => formatDateTime(b.lastMovementAt) },
  ]

  const locationValueColumns: Column<StockBalance>[] = [
    { key: 'rate', header: 'Rate', align: 'right', render: (b) => formatCurrency(b.rate) },
    { key: 'value', header: 'Value', align: 'right', sortable: true, accessor: (b) => b.quantity * b.rate, render: (b) => formatCurrency(b.quantity * b.rate) },
  ]

  const itemCols = withValueColumns(canSeeValue, itemColumns, itemValueColumns)
  const locCols = withValueColumns(canSeeValue, locationColumns, locationValueColumns)

  function doExport(format: ExportFormat) {
    try {
      const n =
        view === 'items'
          ? exportRows(format, 'stock-summary', 'Stock summary', columnsFromTable(itemCols), filteredPositions)
          : exportRows(format, 'stock-detail', 'Stock detail by location', columnsFromTable(locCols), filteredBalances)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const detailBalances = detail ? balances.filter((b) => b.itemCode === detail.itemCode) : []
  const detailLedger = detail ? ledger.filter((l) => l.itemCode === detail.itemCode) : []
  const detailReservations = detail ? reservations.filter((r) => r.itemCode === detail.itemCode && r.state !== 'RELEASED') : []

  const filterPanel = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        sizeVariant="sm"
        containerClassName="w-44"
        value={warehouse}
        onChange={(e) => setWarehouse(e.target.value)}
        options={[{ value: 'all', label: 'All warehouses' }, ...warehouseSummaries.map((w) => ({ value: w.code, label: `${w.code} — ${w.name}` }))]}
      />
      <Select
        sizeVariant="sm"
        containerClassName="w-40"
        value={klass}
        onChange={(e) => setKlass(e.target.value)}
        options={[
          { value: 'all', label: 'All classes' },
          { value: 'RAW_MATERIAL', label: 'Raw material' },
          { value: 'COMPONENT', label: 'Components' },
          { value: 'CONSUMABLE', label: 'Consumables' },
          { value: 'PACKING', label: 'Packing' },
          { value: 'SEMI_FINISHED', label: 'Semi-finished' },
          { value: 'FINISHED', label: 'Finished goods' },
        ]}
      />
      <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-fg-muted">
        <input type="checkbox" className="h-3.5 w-3.5 accent-brand-600" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
        Hide zero balances
      </label>
    </div>
  )

  const chips = [
    ...(warehouse !== 'all' ? [{ key: 'wh', label: 'Warehouse', value: warehouse, onRemove: () => setWarehouse('all') }] : []),
    ...(klass !== 'all' ? [{ key: 'cl', label: 'Class', value: klass.replace(/_/g, ' ').toLowerCase(), onRemove: () => setKlass('all') }] : []),
    ...(hideZero ? [{ key: 'z', label: 'Zero balances', value: 'hidden', onRemove: () => setHideZero(false) }] : []),
  ]

  return (
    <div>
      <PageHeader
        title="Stock enquiry"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Stock enquiry' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/inventory/ledger')}>
            Stock ledger
          </Button>
        }
        tabs={
          <Tabs
            variant="pill"
            active={view}
            onChange={(v) => setView(v as 'items' | 'locations')}
            tabs={[
              { id: 'items', label: 'By item', count: filteredPositions.length },
              { id: 'locations', label: 'By location & batch', count: filteredBalances.length },
            ]}
          />
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg">{filteredPositions.length}</span> item{filteredPositions.length === 1 ? '' : 's'} across{' '}
        <span className="font-medium text-fg">{filteredBalances.length}</span> balance rows (item × warehouse × bin × batch)
        {canSeeValue ? <> · on-hand value <span className="font-medium text-fg tabular">{formatCurrency(totals.value)}</span></> : null} ·{' '}
        <span className={cn('font-medium', totals.belowReorder ? 'text-warning' : 'text-success')}>{totals.belowReorder}</span> below
        reorder · <span className="font-medium text-fg tabular">{formatQty(totals.quarantine)}</span> quarantined ·{' '}
        <span className="font-medium text-fg">{totals.blocked}</span> blocked, rejected or expired
      </p>

      {view === 'items' ? (
        <DataTable
          rows={filteredPositions}
          columns={itemCols}
          rowKey={(p) => p.uid}
          searchPlaceholder="Search item code or description…"
          onExport={doExport}
          filterPanel={filterPanel}
          filterChips={chips}
          onClearFilters={() => {
            setWarehouse('all')
            setKlass('all')
            setHideZero(false)
          }}
          onRowClick={(p) => {
            setDetail(p)
            setDetailTab('locations')
          }}
          emptyTitle="No stock matches these filters"
          rowActions={(p) => (
            <>
              <MenuItem label="Open item stock 360" onClick={() => { setDetail(p); setDetailTab('locations') }} />
              <MenuItem label="Bin card" onClick={() => navigate('/inventory/ledger')} />
              <MenuItem label="Reserve stock" separatorBefore onClick={() => navigate('/inventory/reservations')} />
              <MenuItem label="Raise a count for this item" onClick={() => navigate('/inventory/counting')} />
            </>
          )}
        />
      ) : (
        <DataTable
          rows={filteredBalances}
          columns={locCols}
          rowKey={(b) => b.uid}
          searchPlaceholder="Search item, bin, batch or heat number…"
          onExport={doExport}
          filterPanel={filterPanel}
          filterChips={chips}
          onClearFilters={() => {
            setWarehouse('all')
            setKlass('all')
            setHideZero(false)
          }}
          emptyTitle="No balances match these filters"
          rowActions={(b) => (
            <>
              <MenuItem label="Bin card" onClick={() => navigate('/inventory/ledger')} />
              <MenuItem label="Transfer from this bin" onClick={() => navigate('/inventory/transfers')} />
              <MenuItem label="Count this location" onClick={() => navigate('/inventory/counting')} />
              <MenuItem
                label="Block this batch"
                danger
                separatorBefore
                disabled={!b.batchNo}
                onClick={() => navigate('/inventory/batches')}
              />
            </>
          )}
        />
      )}

      {/* Item stock 360 ------------------------------------------------------ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.itemName}
        description={detail ? `${detail.itemCode} · ${detail.itemClass.replace(/_/g, ' ').toLowerCase()} · ${detail.uom}` : undefined}
        width="max-w-4xl"
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ClassChip abc={detail.abcClass} xyz={detail.xyzClass} />
              {detail.isBatchTracked && <Badge tone="brand" size="sm" dot={false}>Batch tracked</Badge>}
              {detail.isSerialTracked && <Badge tone="progress" size="sm" dot={false}>Serial tracked</Badge>}
              {free(detail) <= 0 && <Badge tone="danger" size="sm">No free stock</Badge>}
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <BucketTile label="On hand" value={detail.onHand} uom={detail.uom} />
              <BucketTile label="Free" value={free(detail)} uom={detail.uom} tone={free(detail) > 0 ? 'success' : 'danger'} hint="Available − reserved" />
              <BucketTile label="Reserved" value={detail.reserved} uom={detail.uom} tone="brand" />
              <BucketTile label="On order" value={detail.onOrder} uom={detail.uom} hint="Open purchase orders" />
              <BucketTile label="Quarantine" value={detail.quarantine} uom={detail.uom} tone="warning" />
              <BucketTile label="At subcontractor" value={detail.atSubcontractor} uom={detail.uom} />
              <BucketTile label="In transit" value={detail.inTransit} uom={detail.uom} />
              <BucketTile
                label="Coverage"
                value={detail.avgDailyDemand ? `${Math.floor(free(detail) / detail.avgDailyDemand)} d` : '—'}
                tone={detail.avgDailyDemand && free(detail) / detail.avgDailyDemand <= 7 ? 'danger' : 'neutral'}
                hint={`ADD ${formatQty(detail.avgDailyDemand)} ${detail.uom}`}
              />
            </div>

            <BucketBar
              segments={[
                { label: 'Free', value: Math.max(0, free(detail)), className: 'bg-success' },
                { label: 'Reserved', value: detail.reserved, className: 'bg-brand-500' },
                { label: 'Quarantine', value: detail.quarantine, className: 'bg-warning' },
                { label: 'At vendor', value: detail.atSubcontractor, className: 'bg-progress' },
                { label: 'In transit', value: detail.inTransit, className: 'bg-neutral' },
                { label: 'Blocked', value: detail.blocked, className: 'bg-danger' },
              ]}
            />

            <Tabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'locations', label: 'Locations', count: detailBalances.length },
                { id: 'movements', label: 'Movements', count: detailLedger.length },
                { id: 'reservations', label: 'Reservations', count: detailReservations.length },
                { id: 'planning', label: 'Planning' },
              ]}
            />

            {detailTab === 'locations' && (
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Warehouse · bin</th>
                      <th>Batch</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Reserved</th>
                      <th>Expiry</th>
                      <th>Age</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailBalances.map((b) => (
                      <tr key={b.uid}>
                        <td className="font-mono text-2xs">{b.warehouseCode}{b.bin ? ` · ${b.bin}` : ''}</td>
                        <td className="font-mono text-2xs">{b.batchNo ?? '—'}</td>
                        <td className="text-right tabular">{formatQty(b.quantity)}</td>
                        <td className="text-right tabular text-fg-muted">{formatQty(b.reserved)}</td>
                        <td className="text-2xs">{b.expiresOn ? formatDate(b.expiresOn) : '—'}</td>
                        <td><AgeChip days={b.ageDays} /></td>
                        <td><InvStatusBadge status={b.status} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'movements' && (
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Document</th>
                      <th>Type</th>
                      <th>Location · batch</th>
                      <th className="text-right">In</th>
                      <th className="text-right">Out</th>
                      <th className="text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailLedger.map((l) => (
                      <tr key={l.uid}>
                        <td className="text-2xs">{formatDate(l.businessDate)}</td>
                        <td className="font-mono text-2xs text-brand-600">{l.docNo}</td>
                        <td className="text-2xs">
                          <span className="font-mono">{l.movementType}</span> <span className="text-fg-muted">{l.movementName}</span>
                        </td>
                        <td className="font-mono text-2xs">{l.warehouseCode}{l.bin ? ` · ${l.bin}` : ''}{l.batchNo ? ` · ${l.batchNo}` : ''}</td>
                        <td className="text-right tabular text-success">{l.direction === 'IN' ? formatQty(l.quantity) : '—'}</td>
                        <td className="text-right tabular text-danger">{l.direction === 'OUT' ? formatQty(l.quantity) : '—'}</td>
                        <td className="text-right tabular font-medium">{formatQty(l.runningQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'reservations' && (
              <div className="space-y-2">
                {detailReservations.length === 0 ? (
                  <p className="text-xs text-fg-subtle">Nothing is committed against this item.</p>
                ) : (
                  detailReservations.map((r) => (
                    <div key={r.uid} className="flex items-start justify-between gap-3 rounded border border-border p-3">
                      <div className="min-w-0">
                        <p className="font-mono text-2xs font-medium text-brand-600">{r.demandDocNo}</p>
                        <p className="text-2xs text-fg-muted">
                          {r.party} · required {formatDate(r.requiredOn)} · expires {formatDate(r.expiresOn)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-medium tabular text-fg">{formatQty(r.quantity)} {r.uom}</p>
                        <InvStatusBadge status={r.state} size="sm" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === 'planning' && (
              <DataGrid
                columns={2}
                items={[
                  { label: 'Reorder level', value: `${formatQty(detail.reorderLevel)} ${detail.uom}` },
                  { label: 'Minimum level', value: `${formatQty(detail.minLevel)} ${detail.uom}` },
                  { label: 'Maximum level', value: `${formatQty(detail.maxLevel)} ${detail.uom}` },
                  { label: 'Safety stock', value: `${formatQty(detail.safetyStock)} ${detail.uom}` },
                  { label: 'Average daily demand', value: `${formatQty(detail.avgDailyDemand)} ${detail.uom}` },
                  { label: 'Lead time', value: `${detail.leadTimeDays} days` },
                  { label: 'ABC / XYZ', value: `${detail.abcClass} / ${detail.xyzClass}` },
                  { label: 'Last issued', value: detail.lastIssueOn ? formatDate(detail.lastIssueOn) : 'Never' },
                  { label: 'Valuation rate', value: canSeeValue ? formatCurrency(detail.rate) : 'Hidden for your role' },
                  { label: 'WIP quantity', value: `${formatQty(detail.wip)} ${detail.uom}` },
                ]}
              />
            )}
          </div>
        )}
      </Drawer>

      <Card className="mt-4">
        <CardHeader
          title="What the buckets mean"
          description="Every quantity on this screen names its bucket — a bare 'stock' figure means something different to each department"
        />
        <CardBody className="grid gap-3 text-xs text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">On hand</span> — everything physically held, whatever its status. Valuation uses this.</p>
          <p><span className="font-medium text-fg">Free</span> — available minus reserved. This is what production and sales may commit.</p>
          <p><span className="font-medium text-fg">Quarantine</span> — received but not released by QC. Valued, not usable.</p>
          <p><span className="font-medium text-fg">At subcontractor</span> — our material at a job worker. Ours, elsewhere, and ageing against the statutory window.</p>
        </CardBody>
      </Card>

      <p className="mt-3 text-2xs text-fg-subtle">
        Value columns are hidden for roles without <span className="font-mono">INVENTORY.STOCK.VIEW_VALUE</span>. In the API the
        field is absent, not blanked — <Link to="/admin/permissions" className="text-brand-600 hover:underline">see the permission explorer</Link>.
      </p>
    </div>
  )
}
