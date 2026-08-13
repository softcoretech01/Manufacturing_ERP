import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, Grid3x3, Pencil, Plus, Power, RotateCcw, Wand2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useWarehouses } from '@/hooks/useOrganisation'
import { BIN_TYPES, zones as zoneApi, type Bin, type Zone } from '@/api/inventory'
import {
  useZones,
  useBins,
  useCreateZone,
  useUpdateZone,
  useDeactivateZone,
  useRestoreZone,
  useCreateBin,
  useUpdateBin,
  useBlockBin,
  useUnblockBin,
  useDeactivateBin,
  useRestoreBin,
  useBulkGenerateBins,
} from '@/hooks/useInventory'

/** Live-wired storage structure (SRS Vol 4 Ch 1): Warehouse → Zone → Bin.
 * Bins carry the full scannable address (aisle-rack-level-position); a whole rack
 * is created in one shot with bulk-generate (server-side stored procedure). */

const binStatusTone = (s: string): 'success' | 'warning' | 'danger' | 'neutral' =>
  s === 'AVAILABLE' ? 'success' : s === 'FULL' ? 'warning' : s === 'BLOCKED' || s === 'DAMAGED' ? 'danger' : 'neutral'

export function WarehouseStructurePage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data: whPage, isLoading: whLoading } = useWarehouses({ page_size: 200 })
  const warehouses = whPage?.data ?? []

  const [searchParams] = useSearchParams()
  const [warehouseUid, setWarehouseUid] = useState<string>('')
  const [tab, setTab] = useState('zones')

  // Preselect the warehouse from ?warehouse=<uid> (deep-link from the Warehouses
  // admin page), else fall back to the first warehouse.
  useEffect(() => {
    if (warehouseUid || !warehouses.length) return
    const wanted = searchParams.get('warehouse')
    const match = wanted && warehouses.some((w) => w.uid === wanted)
    setWarehouseUid(match ? (wanted as string) : warehouses[0].uid)
  }, [warehouseUid, warehouses, searchParams])

  const zonesQ = useZones(warehouseUid || undefined)
  const binsQ = useBins(warehouseUid || undefined, { page_size: 200 })
  const zones = zonesQ.data ?? []
  const bins = binsQ.data?.data ?? []

  const [zoneModal, setZoneModal] = useState<Zone | 'new' | null>(null)
  const [binModal, setBinModal] = useState<Bin | 'new' | null>(null)
  const [bulkModal, setBulkModal] = useState(false)

  const deactivateZone = useDeactivateZone()
  const restoreZone = useRestoreZone()
  const blockBin = useBlockBin()
  const unblockBin = useUnblockBin()
  const deactivateBin = useDeactivateBin()
  const restoreBin = useRestoreBin()

  const err = (e: unknown, fallback: string) =>
    toast.error(fallback, e instanceof ProblemError ? e.problem.detail : 'Unknown error.')

  function toggleZone(z: Zone) {
    if (z.is_active) {
      deactivateZone.mutate(
        { uid: z.uid, version: z.version },
        { onSuccess: () => toast.success('Zone deactivated', `${z.code} is now inactive.`), onError: (e) => err(e, 'Failed') },
      )
    } else {
      restoreZone.mutate(z.uid, {
        onSuccess: () => toast.success('Zone restored', `${z.code} is active again.`),
        onError: (e) => err(e, 'Failed'),
      })
    }
  }

  function blockOrUnblock(b: Bin) {
    if (b.status === 'BLOCKED') {
      unblockBin.mutate(
        { uid: b.uid, version: b.version },
        { onSuccess: () => toast.success('Bin unblocked', `${b.code} is available.`), onError: (e) => err(e, 'Failed') },
      )
    } else {
      const reason = window.prompt(`Block bin ${b.code} — reason?`)
      if (!reason) return
      blockBin.mutate(
        { uid: b.uid, version: b.version, reason },
        { onSuccess: () => toast.success('Bin blocked', `${b.code} — ${reason}`), onError: (e) => err(e, 'Failed') },
      )
    }
  }

  function toggleBin(b: Bin) {
    if (b.is_active) {
      deactivateBin.mutate(
        { uid: b.uid, version: b.version },
        { onSuccess: () => toast.success('Bin deactivated', `${b.code} is now inactive.`), onError: (e) => err(e, 'Failed') },
      )
    } else {
      restoreBin.mutate(b.uid, {
        onSuccess: () => toast.success('Bin restored', `${b.code} is active again.`),
        onError: (e) => err(e, 'Failed'),
      })
    }
  }

  const zoneColumns: Column<Zone>[] = [
    { key: 'code', header: 'Zone', sortable: true, width: '8rem', render: (z) => <span className="font-mono text-xs font-medium text-brand-600">{z.code}</span> },
    { key: 'name', header: 'Name', sortable: true, render: (z) => <span className="font-medium text-fg">{z.name}</span> },
    { key: 'zone_type', header: 'Type', width: '10rem', render: (z) => z.zone_type ?? <span className="text-fg-subtle">—</span> },
    { key: 'pick_sequence', header: 'Pick seq', align: 'right', width: '7rem' },
    { key: 'is_active', header: 'Status', width: '7rem', accessor: (z) => (z.is_active ? 'Active' : 'Inactive'), render: (z) => <Badge tone={z.is_active ? 'success' : 'neutral'} size="sm">{z.is_active ? 'Active' : 'Inactive'}</Badge> },
  ]

  const binColumns: Column<Bin>[] = [
    { key: 'code', header: 'Bin address', sortable: true, width: '11rem', render: (b) => <span className="font-mono text-xs font-medium text-brand-600">{b.code}</span> },
    { key: 'bin_type', header: 'Type', width: '8rem', render: (b) => <span className="text-2xs text-fg-muted">{b.bin_type.replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'pick_sequence', header: 'Pick seq', align: 'right', width: '7rem', sortable: true },
    { key: 'max_weight_kg', header: 'Max wt (kg)', align: 'right', width: '8rem', render: (b) => (b.max_weight_kg ? Number(b.max_weight_kg).toLocaleString() : <span className="text-fg-subtle">—</span>) },
    { key: 'mixing_allowed', header: 'Mixing', align: 'center', width: '6rem', render: (b) => (b.mixing_allowed ? 'Yes' : 'No') },
    { key: 'block_reason', header: 'Note', render: (b) => (b.block_reason ? <span className="text-2xs text-danger">{b.block_reason}</span> : <span className="text-fg-subtle">—</span>) },
    { key: 'status', header: 'Status', sortable: true, width: '8rem', accessor: (b) => b.status, render: (b) => <Badge tone={binStatusTone(b.status)} size="sm">{b.status.replace(/_/g, ' ').toLowerCase()}</Badge> },
  ]

  const hasWarehouse = !!warehouseUid

  return (
    <div>
      <PageHeader
        title="Warehouse structure"
        description="Zones and bins under a warehouse. A bin is the scannable address that holds stock; generate a whole rack at once."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Warehouse structure' }]}
        actions={
          tab === 'zones' ? (
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} disabled={!hasWarehouse} onClick={() => setZoneModal('new')}>Add zone</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" icon={<Wand2 className="h-4 w-4" />} disabled={!hasWarehouse} onClick={() => setBulkModal(true)}>Bulk generate</Button>
              <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} disabled={!hasWarehouse} onClick={() => setBinModal('new')}>Add bin</Button>
            </>
          )
        }
        tabs={
          <Tabs active={tab} onChange={setTab} tabs={[{ id: 'zones', label: 'Zones', count: zones.length }, { id: 'bins', label: 'Bins', count: binsQ.data?.meta.total ?? bins.length }]} />
        }
      />

      {!companyUid && (
        <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>
      )}

      {/* Warehouse selector — zones and bins are scoped to one warehouse. */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-fg">Warehouse</span>
          <Select
            sizeVariant="sm"
            containerClassName="w-72"
            value={warehouseUid}
            onChange={(e) => setWarehouseUid(e.target.value)}
            options={
              whLoading
                ? [{ value: '', label: 'Loading…' }]
                : warehouses.length
                  ? warehouses.map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))
                  : [{ value: '', label: 'No warehouses — create one in Administration' }]
            }
          />
          {hasWarehouse && (
            <span className="ml-auto text-2xs text-fg-subtle">
              Company → Branch → Plant → Warehouse → <span className="font-medium text-fg">Zone → Bin</span>
            </span>
          )}
        </div>
      </Card>

      {!hasWarehouse && !whLoading && (
        <Alert tone="info" title="No warehouse selected">
          Create a warehouse under Administration → Organisation, then its zones and bins are maintained here.
        </Alert>
      )}

      {tab === 'zones' && hasWarehouse && (
        <DataTable
          rows={zones}
          columns={zoneColumns}
          rowKey={(z) => z.uid}
          loading={zonesQ.isLoading}
          searchPlaceholder="Search zone code or name…"
          onRowClick={(z) => setZoneModal(z)}
          emptyTitle="No zones yet"
          emptyDescription="Add a zone (e.g. Rack Area A), then generate its bins."
          emptyAction={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setZoneModal('new')}>Add zone</Button>}
          rowActions={(z) => (
            <>
              <MenuItem label="Edit" icon={<Pencil />} onClick={() => setZoneModal(z)} />
              <MenuItem label={z.is_active ? 'Deactivate' : 'Restore'} icon={z.is_active ? <Power /> : <RotateCcw />} danger={z.is_active} separatorBefore onClick={() => toggleZone(z)} />
            </>
          )}
        />
      )}

      {tab === 'bins' && hasWarehouse && (
        <DataTable
          rows={bins}
          columns={binColumns}
          rowKey={(b) => b.uid}
          loading={binsQ.isLoading}
          searchPlaceholder="Search bin address…"
          emptyTitle="No bins yet"
          emptyDescription="Add a bin, or bulk-generate a whole rack from an aisle × rack × level × position pattern."
          emptyAction={<Button variant="outline" size="sm" icon={<Wand2 className="h-4 w-4" />} onClick={() => setBulkModal(true)}>Bulk generate</Button>}
          rowActions={(b) => (
            <>
              <MenuItem label="Edit" icon={<Pencil />} onClick={() => setBinModal(b)} />
              <MenuItem label={b.status === 'BLOCKED' ? 'Unblock' : 'Block'} icon={<Ban />} onClick={() => blockOrUnblock(b)} />
              <MenuItem label={b.is_active ? 'Deactivate' : 'Restore'} icon={b.is_active ? <Power /> : <RotateCcw />} danger={b.is_active} separatorBefore onClick={() => toggleBin(b)} />
            </>
          )}
          rowClassName={(b) => ((b.status === 'BLOCKED' || b.status === 'DAMAGED') ? 'bg-danger/[0.03]' : undefined)}
        />
      )}

      {zoneModal && <ZoneModal target={zoneModal} warehouseUid={warehouseUid} onClose={() => setZoneModal(null)} />}
      {binModal && <BinModal target={binModal} warehouseUid={warehouseUid} zones={zones} onClose={() => setBinModal(null)} />}
      {bulkModal && <BulkModal warehouseUid={warehouseUid} zones={zones} onClose={() => setBulkModal(false)} />}
    </div>
  )
}

/* ─────────────────────────── Zone modal ─────────────────────────── */
function ZoneModal({ target, warehouseUid, onClose }: { target: Zone | 'new'; warehouseUid: string; onClose: () => void }) {
  const toast = useToast()
  const isNew = target === 'new'
  const zone = isNew ? null : target
  const createZone = useCreateZone()
  const updateZone = useUpdateZone()

  const [code, setCode] = useState(zone?.code ?? 'auto…')
  const [name, setName] = useState(zone?.name ?? '')
  const [zoneType, setZoneType] = useState(zone?.zone_type ?? '')
  const [pickSeq, setPickSeq] = useState(String(zone?.pick_sequence ?? 0))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isNew) zoneApi.nextCode(warehouseUid).then((c) => setCode(c)).catch(() => {})
  }, [isNew, warehouseUid])

  const handleErr = (e: unknown) => {
    if (e instanceof ProblemError) {
      const fe: Record<string, string> = {}
      for (const x of e.problem.errors ?? []) fe[x.field] = x.message
      setErrors(fe)
      toast.error(e.problem.title || 'Failed', e.problem.detail)
    } else toast.error('Failed', 'Unknown error.')
  }

  function save() {
    setErrors({})
    const base = { name: name.trim(), zone_type: zoneType.trim() || null, pick_sequence: Number(pickSeq || 0) }
    if (isNew) {
      createZone.mutate(
        { warehouse_uid: warehouseUid, ...base },
        { onSuccess: (z) => { toast.success('Zone created', `${z.code} added.`); onClose() }, onError: handleErr },
      )
    } else {
      updateZone.mutate(
        { uid: zone!.uid, body: { version: zone!.version, ...base } },
        { onSuccess: () => { toast.success('Zone updated', `${zone!.code} saved.`); onClose() }, onError: handleErr },
      )
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isNew ? 'Add zone' : `Edit ${zone?.code}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={createZone.isPending || updateZone.isPending} disabled={!name.trim()}>
            {isNew ? 'Add zone' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Zone code" value={code} readOnly className="bg-surface-2" hint="Auto-generated · not editable" onChange={() => {}} />
        <Input label="Zone name" required value={name} error={errors.name} maxLength={150} placeholder="Rack Area A" onChange={(e) => setName(e.target.value)} />
        <Input label="Zone type" value={zoneType} maxLength={40} placeholder="RACK / BULK / STAGING" onChange={(e) => setZoneType(e.target.value)} />
        <Input label="Pick sequence" type="number" value={pickSeq} onChange={(e) => setPickSeq(e.target.value)} hint="Order a picker walks the store" />
      </div>
    </Modal>
  )
}

/* ─────────────────────────── Bin modal (single) ─────────────────────────── */
function BinModal({ target, warehouseUid, zones, onClose }: { target: Bin | 'new'; warehouseUid: string; zones: Zone[]; onClose: () => void }) {
  const toast = useToast()
  const isNew = target === 'new'
  const bin = isNew ? null : target
  const createBin = useCreateBin()
  const updateBin = useUpdateBin()
  const [code, setCode] = useState(bin?.code ?? '')
  const [zoneUid, setZoneUid] = useState(bin?.zone_uid ?? '')
  const [binType, setBinType] = useState(bin?.bin_type ?? 'RACK')
  const [maxWeight, setMaxWeight] = useState(bin?.max_weight_kg ? String(bin.max_weight_kg) : '')
  const [pickSeq, setPickSeq] = useState(String(bin?.pick_sequence ?? 0))
  const [mixing, setMixing] = useState(bin?.mixing_allowed ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function save() {
    setErrors({})
    const base = {
      zone_uid: zoneUid || null,
      bin_type: binType,
      max_weight_kg: maxWeight ? Number(maxWeight) : null,
      pick_sequence: Number(pickSeq || 0),
      mixing_allowed: mixing,
    }

    if (isNew) {
      createBin.mutate(
        {
          warehouse_uid: warehouseUid,
          code: code.trim().toUpperCase(),
          ...base,
        },
        {
          onSuccess: (b) => { toast.success('Bin created', `${b.code} added.`); onClose() },
          onError: handleErr,
        },
      )
    } else {
      updateBin.mutate(
        {
          uid: bin!.uid,
          body: {
            version: bin!.version,
            ...base,
            // Allow code update if backend permits, though usually scannable codes shouldn't change
            code: code.trim().toUpperCase(),
          },
        },
        {
          onSuccess: () => { toast.success('Bin updated', `${bin!.code} saved.`); onClose() },
          onError: handleErr,
        },
      )
    }
  }

  const handleErr = (e: unknown) => {
    if (e instanceof ProblemError) {
      const fe: Record<string, string> = {}
      for (const x of e.problem.errors ?? []) fe[x.field] = x.message
      setErrors(fe)
      toast.error(e.problem.title || 'Failed', e.problem.detail)
    } else toast.error('Failed', 'Unknown error.')
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isNew ? 'Add bin' : `Edit ${bin?.code}`}
      description="A single bin address, e.g. A-01-1-1. Unique within the warehouse."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={createBin.isPending || updateBin.isPending} disabled={!code.trim()}>
            {isNew ? 'Add bin' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Bin address" required value={code} error={errors.code} maxLength={30} placeholder="A-01-1-1" onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <Select label="Zone" value={zoneUid} onChange={(e) => setZoneUid(e.target.value)} options={[{ value: '', label: '— none —' }, ...zones.map((z) => ({ value: z.uid, label: `${z.code} — ${z.name}` }))]} />
        <Select label="Bin type" value={binType} onChange={(e) => setBinType(e.target.value)} options={BIN_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ').toLowerCase() }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Max weight (kg)" type="number" value={maxWeight} onChange={(e) => setMaxWeight(e.target.value)} />
          <Input label="Pick sequence" type="number" value={pickSeq} onChange={(e) => setPickSeq(e.target.value)} />
        </div>
        <Switch checked={mixing} onChange={setMixing} label="Allow mixed items / batches in this bin" />
      </div>
    </Modal>
  )
}

/* ─────────────────────────── Bulk generate modal ─────────────────────────── */
function BulkModal({ warehouseUid, zones, onClose }: { warehouseUid: string; zones: Zone[]; onClose: () => void }) {
  const toast = useToast()
  const bulk = useBulkGenerateBins()
  const [zoneUid, setZoneUid] = useState('')
  const [binType, setBinType] = useState('RACK')
  const [aisles, setAisles] = useState('4')
  const [racks, setRacks] = useState('10')
  const [levels, setLevels] = useState('3')
  const [positions, setPositions] = useState('2')

  const total = (Number(aisles) || 0) * (Number(racks) || 0) * (Number(levels) || 0) * (Number(positions) || 0)
  const firstCode = `A-01-1-1`
  const lastCode = `${String.fromCharCode(64 + Math.min(26, Math.max(1, Number(aisles) || 1)))}-${String(Math.max(1, Number(racks) || 1)).padStart(2, '0')}-${Math.max(1, Number(levels) || 1)}-${Math.max(1, Number(positions) || 1)}`

  function generate() {
    bulk.mutate(
      {
        warehouse_uid: warehouseUid,
        zone_uid: zoneUid || null,
        aisles: Number(aisles),
        racks: Number(racks),
        levels: Number(levels),
        positions: Number(positions),
        bin_type: binType,
      },
      {
        onSuccess: (r) => { toast.success('Bins generated', `${r.created} created, ${r.skipped} already existed.`); onClose() },
        onError: (e) => toast.error('Generation failed', e instanceof ProblemError ? e.problem.detail : 'Unknown error.'),
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Bulk-generate bins"
      description="Creates every A-01-1-1 … address from the pattern in one go. Existing addresses are skipped."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={generate} loading={bulk.isPending} disabled={total < 1 || total > 5000}>Generate {total > 0 ? `${total} bins` : ''}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select label="Zone (optional)" value={zoneUid} onChange={(e) => setZoneUid(e.target.value)} options={[{ value: '', label: '— none —' }, ...zones.map((z) => ({ value: z.uid, label: `${z.code} — ${z.name}` }))]} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Aisles (A–Z)" type="number" value={aisles} onChange={(e) => setAisles(e.target.value)} hint="1–26" />
          <Input label="Racks" type="number" value={racks} onChange={(e) => setRacks(e.target.value)} />
          <Input label="Levels" type="number" value={levels} onChange={(e) => setLevels(e.target.value)} />
          <Input label="Positions" type="number" value={positions} onChange={(e) => setPositions(e.target.value)} />
        </div>
        <Select label="Bin type" value={binType} onChange={(e) => setBinType(e.target.value)} options={BIN_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ').toLowerCase() }))} />
        <Alert tone={total > 5000 ? 'danger' : 'info'}>
          {total > 5000
            ? `${total.toLocaleString()} bins exceeds the 5,000 limit — reduce the ranges or split across zones.`
            : <>Will generate <strong className="text-fg">{total.toLocaleString()}</strong> bins, <span className="font-mono">{firstCode}</span> … <span className="font-mono">{lastCode}</span>.</>}
        </Alert>
      </div>
    </Modal>
  )
}
