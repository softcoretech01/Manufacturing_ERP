import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Barcode,
  Boxes,
  ClipboardCheck,
  Droplets,
  Plus,
  Ruler,
  ScanLine,
  Upload,
  Warehouse,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { useCollection } from '@/store/data'
import {
  GovernanceCard,
  LifecycleTrail,
  MasterActions,
  MasterStatusBadge,
  RevisionPanel,
  RulesCard,
  WhereUsedPanel,
} from '@/components/masters/MasterShell'
import { formatCurrency, formatQty } from '@/lib/format'
import { items } from '@/mock/masters'
import type { Item, ItemType } from '@/types/masters'

const TYPE_META: Record<ItemType, { label: string; tone: 'brand' | 'progress' | 'success' | 'warning' | 'neutral' | 'pending' | 'danger' }> = {
  RAW_MATERIAL: { label: 'Raw material', tone: 'warning' },
  SEMI_FINISHED: { label: 'Semi-finished', tone: 'progress' },
  FINISHED: { label: 'Finished goods', tone: 'success' },
  CONSUMABLE: { label: 'Consumable', tone: 'neutral' },
  PACKING: { label: 'Packing', tone: 'pending' },
  SPARE: { label: 'Spare', tone: 'neutral' },
  SERVICE: { label: 'Service', tone: 'brand' },
}

/** The scannable payload this item would carry on a label. */
function barcodePayload(i: Item) {
  if (i.itemType === 'FINISHED') return `v1|FG|${i.code}|{serial_no}|{batch_no}|{mfg_date}`
  if (i.itemType === 'SEMI_FINISHED') return `v1|SF|${i.code}|{batch_no}|{prod_order_no}|{op_seq}`
  return `v1|RM|${i.code}|{lot_no}|{heat_no}|{grade}|{grn_no}`
}

function ItemDetail({ i, onClose }: { i: Item; onClose: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState('general')
  const isBottle = i.capacityMl != null

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-4xl"
      title={`${i.code} — ${i.name}`}
      description={`${TYPE_META[i.itemType].label} · ${i.category}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MasterStatusBadge status={i.status} />
            <Badge tone={TYPE_META[i.itemType].tone} size="sm" dot={false}>{TYPE_META[i.itemType].label}</Badge>
          </div>
          <MasterActions
            status={i.status}
            usageCount={i.whereUsed.filter((w) => w.isOpen).length}
            onEdit={() => toast.info('Edit', 'An approved item is versioned, not edited in place.')}
            onSubmit={() => toast.success('Submitted for approval')}
          />
        </div>
      }
    >
      <div className="space-y-4">
        <LifecycleTrail status={i.status} />

        {i.isSold && i.sellingPrice === 0 && (
          <Alert tone="warning" title="Sellable item with no selling price">
            This item is flagged as sold but carries no price. It can be created, but a sales order
            line will be blocked until a price list entry exists.
          </Alert>
        )}

        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'general', label: 'General' },
            ...(isBottle ? [{ id: 'product', label: 'Product attributes' }] : []),
            { id: 'uom', label: 'UOM & packing' },
            { id: 'inventory', label: 'Inventory' },
            { id: 'costing', label: 'Costing & tax' },
            { id: 'quality', label: 'Quality' },
            { id: 'barcode', label: 'Barcode' },
            { id: 'whereused', label: 'Where used', count: i.whereUsed.length },
            { id: 'revisions', label: 'Revisions', count: i.revisions.length },
          ]}
        />

        {tab === 'general' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Identification" />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Item code', value: i.code, mono: true },
                    { label: 'Description', value: i.name },
                    { label: 'Short name', value: i.shortName },
                    { label: 'Item type', value: TYPE_META[i.itemType].label },
                    { label: 'Category', value: i.category },
                    { label: 'Family', value: i.family },
                    { label: 'Series', value: i.series || '—' },
                    { label: 'Drawing no', value: i.drawingNo ?? '—', mono: true },
                  ]}
                />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {i.isPurchased && <Badge tone="warning" size="sm" dot={false}>purchased</Badge>}
                  {i.isManufactured && <Badge tone="progress" size="sm" dot={false}>manufactured</Badge>}
                  {i.isSold && <Badge tone="success" size="sm" dot={false}>sold</Badge>}
                  {i.isBatchTracked && <Badge tone="neutral" size="sm" dot={false}>batch tracked</Badge>}
                  {i.isSerialTracked && <Badge tone="neutral" size="sm" dot={false}>serial tracked</Badge>}
                </div>
              </CardBody>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Specification" />
                <CardBody>
                  <p className="text-xs leading-relaxed text-fg-muted">{i.specification}</p>
                </CardBody>
              </Card>
              <GovernanceCard
                createdBy={i.createdBy}
                createdAt={i.createdAt}
                modifiedBy={i.modifiedBy}
                modifiedAt={i.modifiedAt}
                approvedBy={i.approvedBy}
                approvedAt={i.approvedAt}
                revision={i.revision}
                effectiveFrom={i.effectiveFrom}
                effectiveTo={i.effectiveTo}
              />
            </div>
          </div>
        )}

        {tab === 'product' && isBottle && (
          <Card>
            <CardHeader title="Bottle attributes" icon={<Droplets className="h-4 w-4" />} description="These drive routing, tooling selection and the finished-goods label" />
            <CardBody>
              <DataGrid
                columns={2}
                items={[
                  { label: 'Capacity', value: `${i.capacityMl} ml` },
                  { label: 'Bottle model', value: i.bottleModel ?? '—' },
                  { label: 'Colour', value: i.colour ?? '—' },
                  { label: 'Finish', value: i.finishType ?? '—' },
                  { label: 'Lid type', value: i.lidType ?? '—' },
                  { label: 'Steel grade', value: i.steelGrade ?? '—' },
                  { label: 'Thickness', value: i.thicknessMm ? `${i.thicknessMm} mm` : '—' },
                  { label: 'Vacuum insulated', value: i.isVacuumInsulated ? 'Yes' : 'No' },
                  { label: 'Net weight', value: i.netWeightG ? `${i.netWeightG} g` : '—' },
                ]}
              />
            </CardBody>
          </Card>
        )}

        {tab === 'uom' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Units of measure" icon={<Ruler className="h-4 w-4" />} />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Base (stock) UOM', value: i.baseUom },
                    { label: 'Purchase UOM', value: i.purchaseUom },
                    { label: 'Sales UOM', value: i.salesUom },
                  ]}
                />
                <p className="mt-3 text-2xs text-fg-subtle">
                  The base UOM is what stock is held in and cannot be changed after the first
                  movement. Purchase and sales units convert to it on every transaction.
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Conversions" description="Defined per item, never globally" />
              <CardBody className="p-0">
                {i.uomConversions.length === 0 && (
                  <p className="p-4 text-xs text-fg-muted">No alternate units — everything is transacted in {i.baseUom}.</p>
                )}
                {i.uomConversions.length > 0 && (
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th className="w-24">Unit</th>
                        <th className="w-32">Factor</th>
                        <th>Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {i.uomConversions.map((u, idx) => (
                        <tr key={idx}>
                          <td className="font-medium text-fg">{u.uom}</td>
                          <td className="tabular">1 {u.uom} = {u.factor} {i.baseUom}</td>
                          <td className="text-fg-muted">{u.purpose.toLowerCase()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {tab === 'inventory' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Stock control" icon={<Warehouse className="h-4 w-4" />} />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Batch tracked', value: i.isBatchTracked ? 'Yes' : 'No' },
                    { label: 'Serial tracked', value: i.isSerialTracked ? 'Yes' : 'No' },
                    { label: 'Shelf life', value: i.shelfLifeDays ? `${i.shelfLifeDays} days` : 'Not applicable' },
                    { label: 'Valuation method', value: i.valuationMethod.replace(/_/g, ' ') },
                    { label: 'Lead time', value: `${i.leadTimeDays} days` },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Replenishment" description="Feeds MRP and the reorder report" />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Reorder level', value: `${formatQty(i.reorderLevel, 0)} ${i.baseUom}` },
                    { label: 'Reorder quantity', value: `${formatQty(i.reorderQty, 0)} ${i.baseUom}` },
                    { label: 'Minimum stock', value: `${formatQty(i.minStock, 0)} ${i.baseUom}` },
                    { label: 'Maximum stock', value: `${formatQty(i.maxStock, 0)} ${i.baseUom}` },
                    { label: 'Preferred supplier', value: i.preferredSupplier ?? '—' },
                  ]}
                />
                {i.reorderLevel === 0 && i.isPurchased && (
                  <Alert tone="warning" className="mt-3">
                    No reorder level set — MRP will never raise a replenishment suggestion for this
                    item. It will only be bought when someone notices.
                  </Alert>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {tab === 'costing' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Costing" />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'Valuation method', value: i.valuationMethod.replace(/_/g, ' ') },
                    { label: 'Standard cost', value: formatCurrency(i.standardCost) },
                    { label: 'Last purchase rate', value: i.lastPurchaseRate ? formatCurrency(i.lastPurchaseRate) : '—' },
                    { label: 'Selling price', value: i.sellingPrice ? formatCurrency(i.sellingPrice) : '—' },
                    ...(i.sellingPrice && i.standardCost
                      ? [{ label: 'Gross margin', value: `${(((i.sellingPrice - i.standardCost) / i.sellingPrice) * 100).toFixed(1)}%` }]
                      : []),
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Tax" />
              <CardBody>
                <DataGrid
                  columns={1}
                  items={[
                    { label: 'HSN / SAC code', value: i.hsnCode, mono: true },
                    { label: 'GST rate', value: `${i.gstRate}%` },
                  ]}
                />
                <Alert tone="info" className="mt-3">
                  The HSN carries a default rate, but a rate notification with an effective date
                  overrides it. The invoice always uses the rate that applied on the document date.
                </Alert>
              </CardBody>
            </Card>
          </div>
        )}

        {tab === 'quality' && (
          <Card>
            <CardHeader title="Quality control" icon={<ClipboardCheck className="h-4 w-4" />} />
            <CardBody>
              <DataGrid
                columns={2}
                items={[
                  { label: 'Incoming inspection', value: i.requiresIncomingInspection ? 'Required' : 'Not required' },
                  { label: 'Inspection plan', value: i.inspectionPlanCode ?? '—', mono: true },
                  { label: 'Drawing', value: i.drawingNo ?? '—', mono: true },
                  { label: 'Batch traceability', value: i.isBatchTracked ? 'Full batch genealogy' : 'Not tracked' },
                ]}
              />
              {i.requiresIncomingInspection && (
                <Alert tone="info" className="mt-3" title="Goods receipt goes to quarantine">
                  Material for this item is received into a quarantine bin and is not available to
                  production until the inspection is recorded and passed.
                </Alert>
              )}
            </CardBody>
          </Card>
        )}

        {tab === 'barcode' && (
          <Card>
            <CardHeader title="Barcode payload" icon={<Barcode className="h-4 w-4" />} description="What a scanner reads and how the system routes it" />
            <CardBody className="space-y-3">
              <div>
                <p className="field-label">Payload format</p>
                <p className="break-all rounded border border-border bg-surface-2 p-2.5 font-mono text-2xs text-fg-muted">
                  {barcodePayload(i)}
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded border border-border p-3">
                <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
                <p className="text-xs text-fg-muted">
                  The <span className="font-mono">{i.itemType === 'FINISHED' ? 'FG' : i.itemType === 'SEMI_FINISHED' ? 'SF' : 'RM'}</span>{' '}
                  prefix tells the scan box this is a{' '}
                  {i.itemType === 'FINISHED' ? 'finished bottle' : i.itemType === 'SEMI_FINISHED' ? 'semi-finished component' : 'raw material lot'},
                  so the same scanner works on the goods-in dock, the line and the packing bench
                  without the operator choosing a mode.
                </p>
              </div>
              {i.isSerialTracked && (
                <Alert tone="info" title="Serialised">
                  Every unit carries a unique serial. That is what makes a warranty claim resolvable
                  back to the production order, the operator and the coil heat number.
                </Alert>
              )}
            </CardBody>
          </Card>
        )}

        {tab === 'whereused' && <WhereUsedPanel entries={i.whereUsed} />}
        {tab === 'revisions' && <RevisionPanel revisions={i.revisions} />}
      </div>
    </Drawer>
  )
}

function ItemForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [itemType, setItemType] = useState<ItemType>('FINISHED')
  const [hsn, setHsn] = useState('')
  const [batch, setBatch] = useState(true)
  const [serial, setSerial] = useState(false)

  const hsnError =
    hsn && !/^\d{4}$|^\d{6}$|^\d{8}$/.test(hsn)
      ? 'HSN must be 4, 6 or 8 digits.'
      : hsn.length === 4
        ? 'A 4-digit HSN is rejected by the e-invoice portal above ₹5 crore turnover. Use 6 or 8.'
        : undefined

  const isBottle = itemType === 'FINISHED' || itemType === 'SEMI_FINISHED'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New item"
      description="Items are approval-controlled because a wrong HSN, UOM or valuation method is expensive to unpick after transactions exist."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => { toast.success('Saved as draft'); onClose() }}>Save draft</Button>
          <Button variant="primary" disabled={!!hsnError} onClick={() => { toast.success('Submitted for approval'); onClose() }}>
            Submit for approval
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3.5">
          <Select
            label="Item type"
            required
            value={itemType}
            onChange={(e) => setItemType(e.target.value as ItemType)}
            options={Object.entries(TYPE_META).map(([v, m]) => ({ value: v, label: m.label }))}
          />
          <Input label="Item code" required placeholder="FG-SS-750-BLK" className="font-mono" hint="Manual for items; the code is the language the shop floor speaks." />
          <Input label="Description" required placeholder="Vacuum Flask 750 ml — Matte Black" />
          <Input label="Short name" placeholder="VF750 Black" hint="Used where space is tight — labels, pick lists, mobile." />
          <Input label="Category" required placeholder="Vacuum Flask" />
          <Select
            label="Base (stock) UOM"
            required
            options={[
              { value: 'NOS', label: 'NOS — Numbers' },
              { value: 'KG', label: 'KG — Kilogram' },
              { value: 'MTR', label: 'MTR — Metre' },
              { value: 'LTR', label: 'LTR — Litre' },
            ]}
            hint="Cannot be changed after the first stock movement."
          />
          <Input
            label="HSN / SAC code"
            required
            value={hsn}
            onChange={(e) => setHsn(e.target.value.replace(/\D/g, ''))}
            maxLength={8}
            placeholder="96170011"
            className="font-mono"
            error={hsnError}
          />
        </div>

        <div className="space-y-3.5">
          {isBottle && (
            <>
              <Select
                label="Bottle model"
                options={[
                  { value: '', label: '— not a bottle —' },
                  { value: 'CLASSIC-500', label: 'Classic 500 ml' },
                  { value: 'CLASSIC-750', label: 'Classic 750 ml' },
                  { value: 'TREK-1000', label: 'Trek 1000 ml' },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Colour" options={[{ value: 'COL-BLK-M', label: 'Matte Black' }, { value: 'COL-STL-B', label: 'Brushed Steel' }, { value: 'COL-BLU-O', label: 'Ocean Blue' }]} />
                <Select label="Lid type" options={[{ value: 'LID-SCR-SS', label: 'Screw Cap — Stainless' }, { value: 'LID-SIP-01', label: 'Sipper Cap' }]} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Steel grade" options={[{ value: 'SS304', label: 'SS 304' }, { value: 'SS316', label: 'SS 316' }]} />
                <Select label="Thickness" options={[{ value: '0.5', label: '0.50 mm' }, { value: '0.6', label: '0.60 mm' }]} />
              </div>
            </>
          )}
          <Select
            label="Valuation method"
            required
            defaultValue={itemType === 'FINISHED' ? 'STANDARD' : 'WEIGHTED_AVG'}
            options={[
              { value: 'WEIGHTED_AVG', label: 'Weighted average' },
              { value: 'FIFO', label: 'FIFO' },
              { value: 'STANDARD', label: 'Standard cost' },
            ]}
            hint="Cannot be changed once stock exists — it would restate the ledger."
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Standard cost (₹)" type="number" step="0.0001" />
            <Input label="Selling price (₹)" type="number" step="0.01" />
          </div>
          <div className="space-y-2.5 rounded border border-border p-3">
            <Switch checked={batch} onChange={setBatch} label="Batch tracked" />
            <Switch checked={serial} onChange={setSerial} label="Serial tracked" disabled={!batch} />
            {serial && (
              <p className="text-2xs text-fg-subtle">
                Serialisation is what makes a warranty claim traceable to the production order,
                the operator and the coil heat number. It also means every unit gets a label.
              </p>
            )}
          </div>
          <Textarea label="Specification" rows={3} placeholder="What the item is, in the terms a supplier or an inspector would use." />
        </div>
      </div>
    </Modal>
  )
}

export function ItemMasterPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { rows: list, update, remove } = useCollection('master:ITEM', items)

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'items', 'Items', columnsFromTable(columns), rows)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('list')
  const [detail, setDetail] = useState<Item | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')

  const rows = useMemo(
    () => (typeFilter ? items.filter((i) => i.itemType === typeFilter) : items),
    [typeFilter],
  )

  const noPrice = items.filter((i) => i.isSold && i.sellingPrice === 0)
  const pending = items.filter((i) => i.status === 'PENDING_APPROVAL' || i.status === 'DRAFT')

  const columns: Column<Item>[] = [
    {
      key: 'code',
      header: 'Item',
      sortable: true,
      sticky: true,
      width: '270px',
      accessor: (i) => i.code,
      render: (i) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-2xs font-medium text-fg">{i.code}</p>
          <p className="truncate text-2xs text-fg-muted">{i.name}</p>
        </div>
      ),
    },
    {
      key: 'itemType',
      header: 'Type',
      sortable: true,
      width: '150px',
      render: (i) => <Badge tone={TYPE_META[i.itemType].tone} size="sm" dot={false}>{TYPE_META[i.itemType].label}</Badge>,
    },
    { key: 'category', header: 'Category', width: '150px', sortable: true, render: (i) => <span className="truncate text-xs text-fg-muted">{i.category}</span> },
    { key: 'baseUom', header: 'UOM', width: '80px', render: (i) => <span className="font-mono text-2xs">{i.baseUom}</span> },
    { key: 'hsnCode', header: 'HSN', width: '110px', render: (i) => <span className="font-mono text-2xs">{i.hsnCode}</span> },
    { key: 'gstRate', header: 'GST', align: 'right', width: '80px', render: (i) => <span className="tabular">{i.gstRate}%</span> },
    { key: 'standardCost', header: 'Std cost', align: 'right', sortable: true, width: '120px', render: (i) => formatCurrency(i.standardCost) },
    {
      key: 'sellingPrice',
      header: 'Selling price',
      align: 'right',
      sortable: true,
      width: '130px',
      render: (i) =>
        i.isSold ? (
          i.sellingPrice ? (
            formatCurrency(i.sellingPrice)
          ) : (
            <Badge tone="warning" size="sm">Not priced</Badge>
          )
        ) : (
          <span className="text-2xs text-fg-subtle">—</span>
        ),
    },
    {
      key: 'tracking',
      header: 'Tracking',
      width: '140px',
      accessor: (i) => (i.isSerialTracked ? 2 : i.isBatchTracked ? 1 : 0),
      render: (i) => (
        <div className="flex flex-wrap gap-1">
          {i.isBatchTracked && <Badge tone="neutral" size="sm" dot={false}>batch</Badge>}
          {i.isSerialTracked && <Badge tone="progress" size="sm" dot={false}>serial</Badge>}
          {!i.isBatchTracked && !i.isSerialTracked && <span className="text-2xs text-fg-subtle">none</span>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', width: '140px', sortable: true, render: (i) => <MasterStatusBadge status={i.status} size="sm" /> },
  ]

  return (
    <div>
      <PageHeader
        title="Items & products"
        description="The single most referenced master in the system — BOM, routing, purchase, stock, production, quality, packing, dispatch, costing and tax all resolve through it."
        breadcrumbs={[{ label: 'Home', to: '/masters' }, { label: 'Masters' }, { label: 'Product' }, { label: 'Items' }]}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => toast.info('Import items')}>
              Import
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
              New item
            </Button>
          </>
        }
      />

      {noPrice.length > 0 && (
        <Alert tone="warning" className="mb-4" title={`${noPrice.length} sellable item has no selling price`}>
          {noPrice.map((i) => i.code).join(', ')}. A sales order line for these will be blocked
          until a price exists — better to find it here than at order entry.
        </Alert>
      )}

      {tab === 'list' && (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(i) => i.uid}
          searchPlaceholder="Code, description, HSN or category…"
          pageSize={20}
          onRowClick={setDetail}
          onExport={doExport}
          filterChips={typeFilter ? [{ key: 't', label: 'Type', value: TYPE_META[typeFilter as ItemType].label, onRemove: () => setTypeFilter('') }] : []}
          onClearFilters={() => setTypeFilter('')}
          toolbar={
            <Select
              sizeVariant="sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[{ value: '', label: 'All item types' }, ...Object.entries(TYPE_META).map(([v, m]) => ({ value: v, label: m.label }))]}
            />
          }
          rowActions={(i) => (
            <>
              <MenuItem label="Open" onClick={() => setDetail(i)} />
              <MenuItem label="Edit" onClick={() => setDetail(i)} />
              <MenuItem label="Bill of material" disabled={!i.isManufactured} onClick={() => navigate('/engineering/bom')} />
              <MenuItem label="Stock enquiry" onClick={() => navigate('/inventory/stock')} />
              <MenuItem label="Print label" onClick={() => toast.info('Print label', `Queues a label for ${i.code}.`)} />
              <MenuItem label={`Where used (${i.whereUsed.length})`} onClick={() => setDetail(i)} />
              <MenuItem
                label={i.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                danger={i.status === 'ACTIVE'}
                separatorBefore
                disabled={i.whereUsed.some((w) => w.isOpen)}
                onClick={() => {
                  update(i.uid, { status: i.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
                  toast.success(i.status === 'ACTIVE' ? 'Deactivated' : 'Activated', i.name)
                }}
              />
              <MenuItem
                label={i.whereUsed.length ? `Delete — blocked (${i.whereUsed.length} refs)` : 'Delete'}
                danger
                disabled={i.whereUsed.length > 0}
                onClick={() => { remove(i.uid); toast.success('Deleted', `${i.code} — ${i.name}`) }}
              />
            </>
          )}
        />
      )}

      

      {detail && <ItemDetail i={detail} onClose={() => setDetail(null)} />}
      <ItemForm open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
