import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useCrud } from '@/components/crud/CrudKit'
import { InvStatusBadge, QtyCell } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { binSlots as seedBins, racks as seedRacks, shelves as seedShelves, warehouseSummaries, zones as seedZones } from '@/mock/inventory'
import type { BinSlot, Rack, Shelf, Zone } from '@/types/inventory'

/**
 * The storage hierarchy from Vol 5 Ch 3:
 *   Warehouse → Zone → Rack → Shelf → Bin
 * Each level is a small master with the same add / edit / delete behaviour, and
 * a level cannot be deleted while the level below it still points at it.
 */
export function WarehouseStructurePage() {
  const toast = useToast()
  const [tab, setTab] = useState('zones')

  const zoneSeed = useMemo(() => seedZones, [])
  const rackSeed = useMemo(() => seedRacks, [])
  const shelfSeed = useMemo(() => seedShelves, [])
  const binSeed = useMemo(() => seedBins, [])

  const warehouseOptions = warehouseSummaries.map((w) => ({ value: w.code, label: `${w.code} — ${w.name}` }))

  const zoneCrud = useCrud<Zone>({
    key: 'inv:zone',
    seed: zoneSeed,
    entity: 'Zone',
    defaults: { zoneType: 'Small parts', temperatureControlled: 'false', isActive: 'true', rackCount: '0' },
    fields: [
      { name: 'code', label: 'Zone code', required: true, upper: true, maxLength: 10, hint: 'Short code used in the bin address' },
      { name: 'name', label: 'Zone name', required: true },
      { name: 'warehouseCode', label: 'Warehouse', type: 'select', required: true, options: warehouseOptions },
      { name: 'zoneType', label: 'Zone type', type: 'select', options: ['Bulk / heavy', 'Bulk / light', 'Small parts', 'Chemicals', 'Pallet storage', 'Staging', 'Shop floor'].map((v) => ({ value: v, label: v })) },
      { name: 'rackCount', label: 'Racks', type: 'number' },
      { name: 'temperatureControlled', label: 'Temperature controlled', type: 'switch', hint: 'Chemicals and coating powder need this' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    fromForm: (v) => ({
      code: v.code,
      name: v.name,
      warehouseCode: v.warehouseCode,
      zoneType: v.zoneType,
      rackCount: Number(v.rackCount || 0),
      temperatureControlled: v.temperatureControlled === 'true',
      isActive: v.isActive !== 'false',
    }),
    toForm: (r) => ({
      code: r.code,
      name: r.name,
      warehouseCode: r.warehouseCode,
      zoneType: r.zoneType,
      rackCount: String(r.rackCount),
      temperatureControlled: String(r.temperatureControlled),
      isActive: String(r.isActive),
    }),
    titleOf: (r) => `${r.code} — ${r.name}`,
    blockDelete: (r) => {
      const used = rackCrud.rows.filter((x) => x.zoneCode === r.code).length
      return used ? `${used} rack(s) still sit in this zone. Move or delete them first.` : undefined
    },
  })

  const rackCrud = useCrud<Rack>({
    key: 'inv:rack',
    seed: rackSeed,
    entity: 'Rack',
    defaults: { rackType: 'Shelving', levels: '3', maxWeightKg: '800', shelfCount: '0', isActive: 'true' },
    fields: [
      { name: 'code', label: 'Rack code', required: true, upper: true, maxLength: 12 },
      { name: 'warehouseCode', label: 'Warehouse', type: 'select', required: true, options: warehouseOptions },
      { name: 'zoneCode', label: 'Zone', type: 'select', required: true, options: zoneSeed.map((z) => ({ value: z.code, label: `${z.code} — ${z.name}` })) },
      { name: 'rackType', label: 'Rack type', type: 'select', options: ['Selective pallet', 'Shelving', 'Cantilever', 'Pallet floor', 'Bulk floor'].map((v) => ({ value: v, label: v })) },
      { name: 'levels', label: 'Levels', type: 'number', required: true },
      { name: 'maxWeightKg', label: 'Max weight (kg)', type: 'number' },
      { name: 'shelfCount', label: 'Shelves', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    fromForm: (v) => ({
      code: v.code,
      warehouseCode: v.warehouseCode,
      zoneCode: v.zoneCode,
      rackType: v.rackType,
      levels: Number(v.levels || 1),
      maxWeightKg: Number(v.maxWeightKg || 0),
      shelfCount: Number(v.shelfCount || 0),
      isActive: v.isActive !== 'false',
    }),
    toForm: (r) => ({
      code: r.code,
      warehouseCode: r.warehouseCode,
      zoneCode: r.zoneCode,
      rackType: r.rackType,
      levels: String(r.levels),
      maxWeightKg: String(r.maxWeightKg),
      shelfCount: String(r.shelfCount),
      isActive: String(r.isActive),
    }),
    titleOf: (r) => r.code,
    blockDelete: (r) => {
      const used = shelfCrud.rows.filter((x) => x.rackCode === r.code).length
      return used ? `${used} shelf/shelves belong to this rack.` : undefined
    },
  })

  const shelfCrud = useCrud<Shelf>({
    key: 'inv:shelf',
    seed: shelfSeed,
    entity: 'Shelf',
    defaults: { level: '1', maxWeightKg: '500', binCount: '0', isActive: 'true' },
    fields: [
      { name: 'code', label: 'Shelf code', required: true, upper: true, maxLength: 14, hint: 'Usually rack code + level, e.g. A-01-1' },
      { name: 'warehouseCode', label: 'Warehouse', type: 'select', required: true, options: warehouseOptions },
      { name: 'rackCode', label: 'Rack', type: 'select', required: true, options: rackSeed.map((r) => ({ value: r.code, label: r.code })) },
      { name: 'level', label: 'Level', type: 'number', required: true },
      { name: 'maxWeightKg', label: 'Max weight (kg)', type: 'number' },
      { name: 'binCount', label: 'Bins', type: 'number' },
      { name: 'isActive', label: 'Active', type: 'switch' },
    ],
    fromForm: (v) => ({
      code: v.code,
      warehouseCode: v.warehouseCode,
      rackCode: v.rackCode,
      level: Number(v.level || 1),
      maxWeightKg: Number(v.maxWeightKg || 0),
      binCount: Number(v.binCount || 0),
      isActive: v.isActive !== 'false',
    }),
    toForm: (r) => ({
      code: r.code,
      warehouseCode: r.warehouseCode,
      rackCode: r.rackCode,
      level: String(r.level),
      maxWeightKg: String(r.maxWeightKg),
      binCount: String(r.binCount),
      isActive: String(r.isActive),
    }),
    titleOf: (r) => r.code,
  })

  const binCrud = useCrud<BinSlot>({
    key: 'inv:bin',
    seed: binSeed,
    entity: 'Bin',
    defaults: { binType: 'RACK', status: 'AVAILABLE', utilisationPct: '0', pickSequence: '100', mixingAllowed: 'true', maxWeightKg: '500' },
    fields: [
      { name: 'code', label: 'Bin code', required: true, upper: true, maxLength: 16, hint: 'The printed, scannable address — e.g. A-01-1-1' },
      { name: 'warehouseCode', label: 'Warehouse', type: 'select', required: true, options: warehouseOptions },
      { name: 'zone', label: 'Zone', type: 'select', required: true, options: zoneSeed.map((z) => ({ value: z.name, label: `${z.code} — ${z.name}` })) },
      { name: 'binType', label: 'Bin type', type: 'select', options: ['RACK', 'PALLET', 'BULK', 'COIL_STAND', 'FLOOR', 'SHELF', 'BIN_BOX', 'STAGING'].map((v) => ({ value: v, label: v.replace(/_/g, ' ').toLowerCase() })) },
      { name: 'maxWeightKg', label: 'Max weight (kg)', type: 'number' },
      { name: 'pickSequence', label: 'Pick sequence', type: 'number', hint: 'The order a picker walks the store' },
      { name: 'fixedItem', label: 'Fixed to item', hint: 'Optional — a dedicated bin refuses anything else' },
      { name: 'status', label: 'Status', type: 'select', options: ['AVAILABLE', 'FULL', 'BLOCKED', 'UNDER_COUNT', 'DAMAGED', 'INACTIVE'].map((v) => ({ value: v, label: v.replace(/_/g, ' ').toLowerCase() })) },
      { name: 'mixingAllowed', label: 'Allow mixed items / batches', type: 'switch' },
    ],
    fromForm: (v, existing) => ({
      code: v.code,
      warehouseCode: v.warehouseCode,
      zone: v.zone,
      binType: v.binType,
      maxWeightKg: Number(v.maxWeightKg || 0),
      pickSequence: Number(v.pickSequence || 0),
      fixedItem: v.fixedItem || null,
      status: v.status,
      mixingAllowed: v.mixingAllowed !== 'false',
      utilisationPct: existing?.utilisationPct ?? 0,
      contents: existing?.contents ?? '—',
      itemCode: existing?.itemCode ?? null,
      batchNo: existing?.batchNo ?? null,
      quantity: existing?.quantity ?? 0,
      lastCountedOn: existing?.lastCountedOn ?? null,
    }),
    toForm: (r) => ({
      code: r.code,
      warehouseCode: r.warehouseCode,
      zone: r.zone,
      binType: r.binType,
      maxWeightKg: String(r.maxWeightKg ?? ''),
      pickSequence: String(r.pickSequence),
      fixedItem: r.fixedItem ?? '',
      status: r.status,
      mixingAllowed: String(r.mixingAllowed),
    }),
    titleOf: (r) => `${r.warehouseCode} · ${r.code}`,
    blockDelete: (r) => (r.quantity > 0 ? `This bin holds ${formatQty(r.quantity)} of ${r.itemCode}. Move the stock out first — a bin cannot disappear with stock in it.` : undefined),
  })

  const zoneColumns: Column<Zone>[] = [
    { key: 'code', header: 'Zone', sortable: true, width: '8rem', render: (z) => <span className="font-mono text-xs font-medium text-brand-600">{z.code}</span> },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'warehouseCode', header: 'Warehouse', sortable: true, width: '9rem', render: (z) => <span className="font-mono text-2xs">{z.warehouseCode}</span> },
    { key: 'zoneType', header: 'Type', sortable: true },
    { key: 'rackCount', header: 'Racks', align: 'right', width: '6rem', render: (z) => rackCrud.rows.filter((r) => r.zoneCode === z.code).length },
    { key: 'temperatureControlled', header: 'Temp. controlled', align: 'center', width: '9rem', accessor: (z) => (z.temperatureControlled ? 'Yes' : 'No'), render: (z) => (
      <Badge tone={z.temperatureControlled ? 'brand' : 'neutral'} size="sm" dot={false}>{z.temperatureControlled ? 'Yes' : 'No'}</Badge>
    ) },
    { key: 'isActive', header: 'Status', width: '7rem', accessor: (z) => (z.isActive ? 'Active' : 'Inactive'), render: (z) => <InvStatusBadge status={z.isActive ? 'ACTIVE' : 'INACTIVE'} size="sm" /> },
  ]

  const rackColumns: Column<Rack>[] = [
    { key: 'code', header: 'Rack', sortable: true, width: '8rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.code}</span> },
    { key: 'warehouseCode', header: 'Warehouse', sortable: true, width: '9rem', render: (r) => <span className="font-mono text-2xs">{r.warehouseCode}</span> },
    { key: 'zoneCode', header: 'Zone', sortable: true, width: '8rem', render: (r) => <span className="font-mono text-2xs">{r.zoneCode}</span> },
    { key: 'rackType', header: 'Type', sortable: true },
    { key: 'levels', header: 'Levels', align: 'right', width: '6rem' },
    { key: 'shelfCount', header: 'Shelves', align: 'right', width: '6.5rem', render: (r) => shelfCrud.rows.filter((s) => s.rackCode === r.code).length },
    { key: 'maxWeightKg', header: 'Max weight', align: 'right', width: '8rem', render: (r) => `${formatQty(r.maxWeightKg)} kg` },
    { key: 'isActive', header: 'Status', width: '7rem', accessor: (r) => (r.isActive ? 'Active' : 'Inactive'), render: (r) => <InvStatusBadge status={r.isActive ? 'ACTIVE' : 'INACTIVE'} size="sm" /> },
  ]

  const shelfColumns: Column<Shelf>[] = [
    { key: 'code', header: 'Shelf', sortable: true, width: '9rem', render: (s) => <span className="font-mono text-xs font-medium text-brand-600">{s.code}</span> },
    { key: 'warehouseCode', header: 'Warehouse', sortable: true, width: '9rem', render: (s) => <span className="font-mono text-2xs">{s.warehouseCode}</span> },
    { key: 'rackCode', header: 'Rack', sortable: true, width: '8rem', render: (s) => <span className="font-mono text-2xs">{s.rackCode}</span> },
    { key: 'level', header: 'Level', align: 'right', width: '6rem' },
    { key: 'binCount', header: 'Bins', align: 'right', width: '6rem' },
    { key: 'maxWeightKg', header: 'Max weight', align: 'right', width: '8rem', render: (s) => `${formatQty(s.maxWeightKg)} kg` },
    { key: 'isActive', header: 'Status', width: '7rem', accessor: (s) => (s.isActive ? 'Active' : 'Inactive'), render: (s) => <InvStatusBadge status={s.isActive ? 'ACTIVE' : 'INACTIVE'} size="sm" /> },
  ]

  const binColumns: Column<BinSlot>[] = [
    { key: 'code', header: 'Bin', sortable: true, width: '10rem', render: (b) => (
      <div>
        <p className="font-mono text-xs font-medium text-brand-600">{b.code}</p>
        <p className="text-2xs text-fg-subtle">{b.warehouseCode} · {b.zone}</p>
      </div>
    ) },
    { key: 'binType', header: 'Type', sortable: true, width: '8rem', render: (b) => <span className="text-2xs text-fg-muted">{b.binType.replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'contents', header: 'Contents', render: (b) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{b.contents}</p>
        {b.batchNo && <p className="truncate font-mono text-2xs text-fg-subtle">{b.batchNo}</p>}
      </div>
    ) },
    { key: 'quantity', header: 'Quantity', align: 'right', sortable: true, render: (b) => (b.quantity ? <QtyCell qty={b.quantity} /> : <span className="text-2xs text-fg-subtle">empty</span>) },
    { key: 'utilisationPct', header: 'Full', align: 'right', width: '6rem', sortable: true, render: (b) => <span className={cn('tabular text-2xs', b.utilisationPct >= 90 ? 'text-warning' : 'text-fg-muted')}>{b.utilisationPct}%</span> },
    { key: 'pickSequence', header: 'Pick seq', align: 'right', width: '7rem', sortable: true },
    { key: 'fixedItem', header: 'Fixed to', width: '9rem', render: (b) => (b.fixedItem ? <span className="font-mono text-2xs">{b.fixedItem}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'lastCountedOn', header: 'Last counted', width: '8rem', accessor: (b) => b.lastCountedOn ?? '', render: (b) => (b.lastCountedOn ? formatDate(b.lastCountedOn) : 'Never') },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (b) => <InvStatusBadge status={b.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n =
        tab === 'zones' ? exportRows(format, 'zones', 'Zone master', columnsFromTable(zoneColumns), zoneCrud.rows)
          : tab === 'racks' ? exportRows(format, 'racks', 'Rack master', columnsFromTable(rackColumns), rackCrud.rows)
            : tab === 'shelves' ? exportRows(format, 'shelves', 'Shelf master', columnsFromTable(shelfColumns), shelfCrud.rows)
              : exportRows(format, 'bins', 'Bin master', columnsFromTable(binColumns), binCrud.rows)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const active = tab === 'zones' ? zoneCrud : tab === 'racks' ? rackCrud : tab === 'shelves' ? shelfCrud : binCrud
  const addLabel = tab === 'zones' ? 'Add zone' : tab === 'racks' ? 'Add rack' : tab === 'shelves' ? 'Add shelf' : 'Add bin'

  return (
    <div>
      <PageHeader
        title="Warehouse structure"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Warehouse structure' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => active.openCreate()}>
            {addLabel}
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'zones', label: 'Zones', count: zoneCrud.rows.length },
              { id: 'racks', label: 'Racks', count: rackCrud.rows.length },
              { id: 'shelves', label: 'Shelves', count: shelfCrud.rows.length },
              { id: 'bins', label: 'Bins', count: binCrud.rows.length },
            ]}
          />
        }
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-2 py-3 text-xs text-fg-muted">
          <span className="font-medium text-fg">Company</span>
          {['Branch', 'Plant', 'Warehouse', 'Zone', 'Rack', 'Shelf', 'Bin'].map((level) => (
            <span key={level} className="flex items-center gap-2">
              <span className="text-fg-subtle">→</span>
              <span className={cn(['Zone', 'Rack', 'Shelf', 'Bin'].includes(level) && 'font-medium text-fg')}>{level}</span>
            </span>
          ))}
          <span className="ml-auto text-2xs">
            The four highlighted levels are maintained here. Company, branch, plant and warehouse live in Administration.
          </span>
        </CardBody>
      </Card>

      {tab === 'zones' && (
        <DataTable
          rows={zoneCrud.rows}
          columns={zoneColumns}
          rowKey={(z) => z.uid}
          searchPlaceholder="Search zone code, name or warehouse…"
          onExport={doExport}
          onRowClick={(z) => zoneCrud.openEdit(z)}
          emptyTitle="No zones"
          emptyAction={<Button variant="primary" size="sm" onClick={() => zoneCrud.openCreate()}>Add the first zone</Button>}
          rowActions={(z) => (
            <>
              <MenuItem label="Edit" onClick={() => zoneCrud.openEdit(z)} />
              <MenuItem label="Delete" danger onClick={() => zoneCrud.askDelete(z)} />
            </>
          )}
        />
      )}

      {tab === 'racks' && (
        <DataTable
          rows={rackCrud.rows}
          columns={rackColumns}
          rowKey={(r) => r.uid}
          searchPlaceholder="Search rack, zone or warehouse…"
          onExport={doExport}
          onRowClick={(r) => rackCrud.openEdit(r)}
          emptyTitle="No racks"
          emptyAction={<Button variant="primary" size="sm" onClick={() => rackCrud.openCreate()}>Add the first rack</Button>}
          rowActions={(r) => (
            <>
              <MenuItem label="Edit" onClick={() => rackCrud.openEdit(r)} />
              <MenuItem label="Delete" danger onClick={() => rackCrud.askDelete(r)} />
            </>
          )}
        />
      )}

      {tab === 'shelves' && (
        <DataTable
          rows={shelfCrud.rows}
          columns={shelfColumns}
          rowKey={(s) => s.uid}
          searchPlaceholder="Search shelf, rack or warehouse…"
          onExport={doExport}
          onRowClick={(s) => shelfCrud.openEdit(s)}
          emptyTitle="No shelves"
          emptyAction={<Button variant="primary" size="sm" onClick={() => shelfCrud.openCreate()}>Add the first shelf</Button>}
          rowActions={(s) => (
            <>
              <MenuItem label="Edit" onClick={() => shelfCrud.openEdit(s)} />
              <MenuItem label="Delete" danger onClick={() => shelfCrud.askDelete(s)} />
            </>
          )}
        />
      )}

      {tab === 'bins' && (
        <DataTable
          rows={binCrud.rows}
          columns={binColumns}
          rowKey={(b) => b.uid}
          searchPlaceholder="Search bin, zone, item or batch…"
          onExport={doExport}
          onRowClick={(b) => binCrud.openEdit(b)}
          emptyTitle="No bins"
          emptyAction={<Button variant="primary" size="sm" onClick={() => binCrud.openCreate()}>Add the first bin</Button>}
          rowActions={(b) => (
            <>
              <MenuItem label="Edit" onClick={() => binCrud.openEdit(b)} />
              <MenuItem label="Print bin label" onClick={() => toast.success('Label queued', `v1|LOC|${b.warehouseCode}|${b.zone}|${b.code}`)} />
              <MenuItem label="Delete" danger separatorBefore onClick={() => binCrud.askDelete(b)} />
            </>
          )}
          rowClassName={(b) => cn((b.status === 'BLOCKED' || b.status === 'DAMAGED') && 'bg-danger/[0.03]')}
        />
      )}

      {zoneCrud.dialogs}
      {rackCrud.dialogs}
      {shelfCrud.dialogs}
      {binCrud.dialogs}

      <Card className="mt-4">
        <CardHeader title="Two rules that keep the structure honest" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2">
          <p>
            <span className="font-medium text-fg">Nothing is deleted from under something else.</span> A zone with racks, a rack
            with shelves, or a bin with stock in it cannot be removed — the message names exactly what is blocking it.
          </p>
          <p>
            <span className="font-medium text-fg">Every bin has a printable address.</span> The bin code is what goes on the
            label and what the scanner reads, so it must be unique inside its warehouse.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
