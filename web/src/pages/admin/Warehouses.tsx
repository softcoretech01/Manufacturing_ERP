import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, Grid3x3, Plus, Printer, Warehouse as WarehouseIcon, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency } from '@/lib/format'
import { bins, branches, plants, warehouses } from '@/mock/data'
import type { Bin, Warehouse } from '@/types'

export function WarehousesPage() {
  const toast = useToast()
  const navigate = useNavigate()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'warehouses-bins', 'Warehouses & bins', columnsFromTable(whColumns), warehouses)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [tab, setTab] = useState('warehouses')
  const [activeWh, setActiveWh] = useState('wh-01')
  const [newOpen, setNewOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [binManaged, setBinManaged] = useState(true)
  const [batchMandatory, setBatchMandatory] = useState(true)
  const [allowNegative, setAllowNegative] = useState(false)

  const wh = warehouses.find((w) => w.uid === activeWh)!
  const whBins = bins.filter((b) => b.warehouseUid === activeWh)

  const whColumns: Column<Warehouse>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '90px', render: (w) => <span className="font-mono text-xs font-medium">{w.code}</span> },
    { key: 'name', header: 'Warehouse', sortable: true, render: (w) => <span className="font-medium text-fg">{w.name}</span> },
    { key: 'warehouseType', header: 'Type', sortable: true, width: '150px', render: (w) => <Badge tone={typeTone(w.warehouseType)} size="sm" dot={false}>{w.warehouseType.replace(/_/g, ' ').toLowerCase()}</Badge> },
    {
      key: 'branch',
      header: 'Branch',
      width: '150px',
      accessor: (w) => branches.find((b) => b.uid === w.branchUid)?.name ?? '',
      render: (w) => <span className="text-xs">{branches.find((b) => b.uid === w.branchUid)?.code}</span>,
    },
    {
      key: 'plant',
      header: 'Plant',
      width: '90px',
      accessor: (w) => plants.find((p) => p.uid === w.plantUid)?.code ?? '',
      render: (w) => <span className="text-xs">{plants.find((p) => p.uid === w.plantUid)?.code ?? '—'}</span>,
    },
    {
      key: 'isBinManaged',
      header: 'Bins',
      align: 'right',
      width: '80px',
      accessor: (w) => w.binCount,
      render: (w) => (w.isBinManaged ? <span className="tabular">{w.binCount}</span> : <span className="text-fg-subtle">—</span>),
    },
    {
      key: 'flags',
      header: 'Controls',
      width: '180px',
      render: (w) => (
        <div className="flex flex-wrap gap-1">
          {w.isBatchMandatory && <span className="rounded bg-surface-3 px-1 py-0.5 text-[9px] text-fg-muted">batch</span>}
          {w.allowNegativeStock && <span className="rounded bg-danger/10 px-1 py-0.5 text-[9px] text-danger">−ve ok</span>}
          {w.isSystemManaged && <span className="rounded bg-progress/10 px-1 py-0.5 text-[9px] text-progress">system</span>}
        </div>
      ),
    },
    { key: 'valuationMethod', header: 'Valuation', width: '120px', render: (w) => <span className="text-xs">{w.valuationMethod.replace('_', ' ').toLowerCase()}</span> },
    { key: 'storekeeper', header: 'Storekeeper', width: '120px' },
    { key: 'stockValue', header: 'Stock value', align: 'right', sortable: true, width: '120px', render: (w) => formatCurrency(w.stockValue) },
  ]

  const binColumns: Column<Bin>[] = [
    { key: 'code', header: 'Bin', sortable: true, width: '110px', render: (b) => <span className="font-mono text-xs font-medium">{b.code}</span> },
    { key: 'zone', header: 'Zone', sortable: true, width: '130px' },
    { key: 'binType', header: 'Type', sortable: true, width: '110px', render: (b) => <span className="text-xs">{b.binType.replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'maxWeightKg', header: 'Max (kg)', align: 'right', width: '90px', sortable: true, render: (b) => b.maxWeightKg.toLocaleString('en-IN') },
    { key: 'pickSequence', header: 'Pick #', align: 'right', width: '80px', sortable: true },
    { key: 'currentStock', header: 'Current stock', render: (b) => <span className="text-xs text-fg-muted">{b.currentStock}</span> },
    {
      key: 'utilisationPct',
      header: 'Utilisation',
      width: '130px',
      sortable: true,
      render: (b) => <ProgressBar value={b.utilisationPct} showLabel tone={b.utilisationPct > 90 ? 'danger' : b.utilisationPct > 70 ? 'warning' : 'success'} />,
    },
    { key: 'status', header: 'Status', width: '110px', render: (b) => <StatusBadge status={b.status} size="sm" /> },
  ]

  return (
    <div>
      <PageHeader
        title="Warehouses & bins"
        description="Physical and logical stores, with bin-level location management where enabled. Quarantine, transit and job-work stores are system-managed."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Warehouses & bins' }]}
        actions={
          tab === 'bins' ? (
            <>
              <Button variant="outline" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => toast.success('Labels queued', 'ZPL sent to the RM Store printer.')}>Print labels</Button>
              <Button variant="outline" size="sm" icon={<Zap className="h-4 w-4" />} onClick={() => setBulkOpen(true)}>Bulk generate</Button>
              <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => toast.info('Add bin', 'Add a single bin, or use Bulk generate to create bins from a pattern.')}>Add bin</Button>
            </>
          ) : (
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>New warehouse</Button>
          )
        }
        tabs={
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: 'warehouses', label: 'Warehouses', count: warehouses.length },
            { id: 'bins', label: 'Bin locations', count: bins.length },
          ]} />
        }
      />

      {tab === 'warehouses' && (
        <>
          <Alert tone="info" className="mb-4" title="Warehouse controls carry real consequences">
            Quarantine stock cannot be issued, allocated, reserved or sold — it moves only via a QC
            decision. Transit and job-work stores accept postings only from transfer or subcontract
            documents, never manual entry. A warehouse holding stock cannot be deactivated.
          </Alert>
          <DataTable
            rows={warehouses}
            columns={whColumns}
            rowKey={(w) => w.uid}
            searchPlaceholder="Warehouse code, name or type…"
            onExport={doExport}
            onRowClick={(w) => { setActiveWh(w.uid); if (w.isBinManaged) setTab('bins') }}
            rowActions={(w) => (
              <>
                <MenuItem label="Edit warehouse" onClick={() => toast.info('Edit warehouse', `${w.code} — ${w.name}.`)} />
                <MenuItem label="View bins" disabled={!w.isBinManaged} onClick={() => { setActiveWh(w.uid); setTab('bins') }} />
                <MenuItem label="Stock enquiry" onClick={() => navigate('/inventory/stock')} />
                <MenuItem label="Deactivate" danger disabled={w.stockValue > 0} onClick={() => toast.success('Warehouse deactivated', `${w.code} is no longer selectable on new documents.`)} />
              </>
            )}
          />
        </>
      )}

      {tab === 'bins' && (
        <>
          <Card className="mb-4">
            <CardBody className="flex flex-wrap items-end gap-3">
              <Select label="Warehouse" containerClassName="w-72" value={activeWh} onChange={(e) => setActiveWh(e.target.value)}
                options={warehouses.filter((w) => w.isBinManaged).map((w) => ({ value: w.uid, label: `${w.code} — ${w.name}` }))} />
              <div className="flex gap-6 pb-1 text-xs">
                <span className="text-fg-muted">Bins <strong className="text-fg tabular">{wh.binCount}</strong></span>
                <span className="text-fg-muted">Zones <strong className="text-fg tabular">{new Set(whBins.map((b) => b.zone)).size}</strong></span>
                <span className="text-fg-muted">Blocked <strong className="text-danger tabular">{whBins.filter((b) => b.status === 'BLOCKED').length}</strong></span>
                <span className="text-fg-muted">Value <strong className="text-fg tabular">{formatCurrency(wh.stockValue)}</strong></span>
              </div>
            </CardBody>
          </Card>

          <DataTable
            rows={whBins}
            columns={binColumns}
            rowKey={(b) => b.uid}
            searchPlaceholder="Bin code, zone or stock…"
            onExport={doExport}
            selectable
            bulkActions={
              <>
                <Button size="xs" variant="outline" icon={<Printer className="h-3 w-3" />} onClick={() => toast.success('Labels queued')}>Print labels</Button>
                <Button size="xs" variant="outline" onClick={() => toast.success('Bins blocked', 'The selected bins can no longer receive putaway.')}>Block</Button>
              </>
            }
            rowActions={(b) => (
              <>
                <MenuItem label="Edit bin" onClick={() => toast.info('Edit bin', `${b.code} — ${b.zone}.`)} />
                <MenuItem label="Print label" icon={<Printer />} onClick={() => toast.success('Label queued', 'ZPL sent to the RM Store printer.')} />
                <MenuItem label="View stock" onClick={() => navigate('/inventory/stock')} />
                <MenuItem label="Block bin" danger onClick={() => toast.success('Bin blocked', `${b.code} can no longer receive putaway.`)} />
              </>
            )}
          />
          <p className="mt-2 text-2xs text-fg-subtle">
            Showing {whBins.length} sample bins of {wh.binCount} in this warehouse. The prototype seeds
            a representative subset.
          </p>
        </>
      )}

      {/* ── Bulk bin generator ─────────────────────────────────────────── */}
      <BulkBinModal open={bulkOpen} onClose={() => setBulkOpen(false)} />

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New warehouse" size="lg"
        footer={<><Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { toast.success('Warehouse created'); setNewOpen(false) }}>Create</Button></>}>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Warehouse code" required placeholder="RM-02" />
          <Input label="Warehouse name" required placeholder="Raw Material Store 2" />
          <Select label="Warehouse type" required
            options={['RAW_MATERIAL', 'WIP', 'FINISHED_GOODS', 'PACKING_MATERIAL', 'CONSUMABLE_SPARES', 'QUARANTINE', 'REJECT', 'SCRAP', 'SUBCONTRACTOR', 'TRANSIT', 'RETURN'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))} />
          <Select label="Branch" required options={branches.map((b) => ({ value: b.uid, label: b.name }))} />
          <Select label="Plant" options={[{ value: '', label: '— not plant-linked —' }, ...plants.map((p) => ({ value: p.uid, label: p.name }))]} />
          <Select label="Valuation method" defaultValue="WEIGHTED_AVG"
            options={[{ value: 'WEIGHTED_AVG', label: 'Weighted average' }, { value: 'FIFO', label: 'FIFO' }, { value: 'STANDARD', label: 'Standard cost' }]} />
          <Input label="Storekeeper" placeholder="🔍 Search users" containerClassName="sm:col-span-2" />
          <div className="space-y-2.5 sm:col-span-2">
            <Switch checked={binManaged} onChange={setBinManaged} label="Enable bin location management" />
            <Switch checked={batchMandatory} onChange={setBatchMandatory} label="Batch / lot tracking is mandatory" />
            <Switch checked={allowNegative} onChange={setAllowNegative} label="Allow negative stock (raises an exception report entry every time)" />
          </div>
        </div>
      </Modal>
    </div>
  )
}

function BulkBinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [aisleFrom, setAisleFrom] = useState('A')
  const [aisleTo, setAisleTo] = useState('F')
  const [rackFrom, setRackFrom] = useState(1)
  const [rackTo, setRackTo] = useState(10)
  const [levelFrom, setLevelFrom] = useState(1)
  const [levelTo, setLevelTo] = useState(4)
  const [posFrom, setPosFrom] = useState(1)
  const [posTo, setPosTo] = useState(3)

  const preview = useMemo(() => {
    const aisles = range(aisleFrom.charCodeAt(0), aisleTo.charCodeAt(0)).map((c) => String.fromCharCode(c))
    const racks = range(rackFrom, rackTo).map((n) => String(n).padStart(2, '0'))
    const levels = range(levelFrom, levelTo)
    const positions = range(posFrom, posTo)
    const total = aisles.length * racks.length * levels.length * positions.length
    const samples: string[] = []
    outer: for (const a of aisles)
      for (const r of racks)
        for (const l of levels)
          for (const p of positions) {
            samples.push(`${a}-${r}-${l}-${p}`)
            if (samples.length >= 4) break outer
          }
    const last = `${aisles.at(-1)}-${racks.at(-1)}-${levels.at(-1)}-${positions.at(-1)}`
    return { total, samples, last }
  }, [aisleFrom, aisleTo, rackFrom, rackTo, levelFrom, levelTo, posFrom, posTo])

  const existing = 12
  const toCreate = Math.max(0, preview.total - existing)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Bulk generate bins"
      description="Creating 700 bins by hand is not acceptable. Generate them from a pattern with a preview before commit."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { toast.success(`${toCreate} bins created`, `${existing} existing codes were skipped.`); onClose() }}>
            Generate {toCreate.toLocaleString('en-IN')} bins
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select label="Zone" required options={[{ value: 'A', label: 'Rack Area A' }, { value: 'B', label: 'Rack Area B' }, { value: 'C', label: 'Coil Yard' }, { value: 'D', label: 'Bulk Zone' }]} />
          <Select label="Bin type" required options={[{ value: 'RACK', label: 'Rack' }, { value: 'PALLET', label: 'Pallet' }, { value: 'SHELF', label: 'Shelf' }, { value: 'FLOOR', label: 'Floor' }, { value: 'COIL_STAND', label: 'Coil stand' }, { value: 'BULK', label: 'Bulk' }]} />
        </div>

        <Input label="Code pattern" defaultValue="{AISLE}-{RACK}-{LEVEL}-{POS}" hint="Available tokens: {AISLE} {RACK} {LEVEL} {POS}" />

        <div className="rounded border border-border bg-surface-2 p-3">
          <p className="mb-2.5 text-xs font-medium text-fg">Ranges</p>
          <div className="space-y-2.5">
            <RangeRow label="Aisle (letters)" from={aisleFrom} to={aisleTo} onFrom={setAisleFrom} onTo={setAisleTo} />
            <RangeRow label="Rack (2 digits)" from={rackFrom} to={rackTo} onFrom={(v) => setRackFrom(+v)} onTo={(v) => setRackTo(+v)} numeric />
            <RangeRow label="Level" from={levelFrom} to={levelTo} onFrom={(v) => setLevelFrom(+v)} onTo={(v) => setLevelTo(+v)} numeric />
            <RangeRow label="Position" from={posFrom} to={posTo} onFrom={(v) => setPosFrom(+v)} onTo={(v) => setPosTo(+v)} numeric />
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-3">
          <Input label="Max weight per bin (kg)" type="number" defaultValue={500} />
          <Input label="Pick sequence start" type="number" defaultValue={1000} />
          <Input label="Pick sequence step" type="number" defaultValue={10} />
        </div>

        <Alert tone="info" title={`Preview — ${preview.total.toLocaleString('en-IN')} bins`}>
          <p className="mt-1 font-mono text-[11px] text-fg-muted">
            {preview.samples.join(', ')} … {preview.last}
          </p>
        </Alert>

        {existing > 0 && (
          <Alert tone="warning">
            {existing} of these codes already exist and will be skipped.{' '}
            <strong>{toCreate.toLocaleString('en-IN')} bins will be created.</strong>
          </Alert>
        )}
      </div>
    </Modal>
  )
}

function RangeRow({
  label, from, to, onFrom, onTo, numeric,
}: {
  label: string
  from: string | number
  to: string | number
  onFrom: (v: string) => void
  onTo: (v: string) => void
  numeric?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs text-fg-muted">{label}</span>
      <span className="text-2xs text-fg-subtle">from</span>
      <input
        value={from}
        onChange={(e) => onFrom(e.target.value)}
        type={numeric ? 'number' : 'text'}
        className="h-7 w-16 rounded border border-border bg-surface px-2 text-center text-xs text-fg focus:border-brand-500 focus:outline-none"
      />
      <span className="text-2xs text-fg-subtle">to</span>
      <input
        value={to}
        onChange={(e) => onTo(e.target.value)}
        type={numeric ? 'number' : 'text'}
        className="h-7 w-16 rounded border border-border bg-surface px-2 text-center text-xs text-fg focus:border-brand-500 focus:outline-none"
      />
    </div>
  )
}

function range(a: number, b: number) {
  const out: number[] = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}

function typeTone(t: string) {
  if (t === 'QUARANTINE' || t === 'REJECT') return 'warning' as const
  if (t === 'SCRAP') return 'danger' as const
  if (t === 'TRANSIT' || t === 'SUBCONTRACTOR') return 'progress' as const
  if (t === 'FINISHED_GOODS') return 'success' as const
  return 'neutral' as const
}
