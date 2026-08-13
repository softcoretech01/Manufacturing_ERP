import { useState, useEffect } from 'react'
import { Factory, Gauge, Plus, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataRow } from '@/components/ui/Card'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Tabs } from '@/components/ui/Tabs'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { api } from '@/lib/api'
import type { ProductionLine, WorkCentre } from '@/types'

export function PlantsPage() {
  const toast = useToast()

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'plants-lines-work-centres', 'Plants, lines & work centres', columnsFromTable(lineColumns), lines)
      toast.success('Export ready', n + ' rows written as ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + '.')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }
  const [plants, setPlants] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [productionLines, setProductionLines] = useState<any[]>([])
  const [workCentres, setWorkCentres] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [activeUid, setActiveUid] = useState('')
  const [tab, setTab] = useState('lines')
  const [open, setOpen] = useState(false)
  
  const [form, setForm] = useState<any>({ branchUid: '' })

  const loadData = async () => {
    try {
      setLoading(true)
      const [p, b, l, wc, wh] = await Promise.all([
        api.getPlants(),
        api.getBranches(),
        api.getProductionLines(),
        api.getWorkCentres(),
        api.getWarehouses()
      ])
      setPlants(p)
      setBranches(b)
      setProductionLines(l)
      setWorkCentres(wc)
      setWarehouses(wh)
      
      if (p.length > 0 && !activeUid) {
        setActiveUid(p[0].uid)
      }
    } catch (e: any) {
      toast.error('Failed to load data', e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const plant = plants.find((p) => p.uid === activeUid)
  const branch = plant ? branches.find((b) => b.uid === plant.branchUid) : null
  const lines = plant ? productionLines.filter((l) => l.plantUid === plant.uid) : []
  const wcs = plant ? workCentres.filter((w) => w.plantUid === plant.uid) : []
  const stores = plant ? warehouses.filter((w) => w.plantUid === plant.uid) : []

  const lineColumns: Column<ProductionLine>[] = [
    { key: 'code', header: 'Code', width: '70px', render: (l) => <span className="font-mono text-xs">{l.code}</span> },
    { key: 'name', header: 'Line', sortable: true, render: (l) => <span className="font-medium text-fg">{l.name}</span> },
    { key: 'lineType', header: 'Type', width: '110px', sortable: true },
    { key: 'range', header: 'Capacity range', width: '130px', accessor: (l) => l.minCapacityMl, render: (l) => <span className="tabular">{l.minCapacityMl}–{l.maxCapacityMl} ml</span> },
    { key: 'cycleTimeSec', header: 'Cycle (s)', align: 'right', width: '90px', sortable: true },
    { key: 'ratedOutputPerHour', header: 'Rated/hr', align: 'right', width: '90px', sortable: true },
    { key: 'status', header: 'Status', width: '120px', render: (l) => <StatusBadge status={l.status} size="sm" /> },
  ]

  const wcColumns: Column<WorkCentre>[] = [
    { key: 'code', header: 'Code', width: '90px', render: (w) => <span className="font-mono text-xs">{w.code}</span> },
    { key: 'name', header: 'Work centre', sortable: true, render: (w) => <span className="font-medium text-fg">{w.name}</span> },
    { key: 'type', header: 'Type', width: '110px', sortable: true },
    {
      key: 'line',
      header: 'Line',
      width: '150px',
      accessor: (w) => productionLines.find((l) => l.uid === w.lineUid)?.code ?? 'shared',
      render: (w) => {
        const l = productionLines.find((x) => x.uid === w.lineUid)
        return l ? <span className="text-xs">{l.code}</span> : <Badge tone="neutral" size="sm">Shared</Badge>
      },
    },
    { key: 'capacityPerHour', header: 'Cap/hr', align: 'right', width: '80px', sortable: true },
    { key: 'efficiencyPct', header: 'Efficiency', align: 'right', width: '90px', sortable: true, render: (w) => `${w.efficiencyPct}%` },
    {
      key: 'effective',
      header: 'Effective/hr',
      align: 'right',
      width: '100px',
      accessor: (w) => Math.round(w.capacityPerHour * (w.efficiencyPct / 100)),
      render: (w) => <span className="font-medium tabular">{Math.round(w.capacityPerHour * (w.efficiencyPct / 100))}</span>,
    },
    { key: 'machineHourRate', header: 'M/c hr rate', align: 'right', width: '110px', sortable: true, render: (w) => formatCurrency(w.machineHourRate) },
    { key: 'isBottleneck', header: '', width: '100px', accessor: (w) => (w.isBottleneck ? 1 : 0), render: (w) => (w.isBottleneck ? <Badge tone="danger" size="sm">Bottleneck</Badge> : null) },
  ]

  const licenceDays = plant && plant.factoryLicenceValidTo ? Math.ceil((new Date(plant.factoryLicenceValidTo).getTime() - Date.now()) / 86_400_000) : 0
  
  const handleCreate = async () => {
    try {
      await api.createPlant(form)
      toast.success('Plant created')
      setOpen(false)
      loadData()
    } catch (e) {
      toast.error('Failed to create plant')
    }
  }

  const handleOpenNewPlant = async () => {
    setOpen(true)
    try {
      const code = await api.getNextPlantCode()
      setForm({ branchUid: '', code })
    } catch (e) {
      toast.error('Failed to fetch next plant code')
    }
  }

  if (loading) return <div className="p-8 text-center text-fg-subtle">Loading...</div>

  return (
    <div>
      <PageHeader
        title="Plants, lines & work centres"
        description="Manufacturing sites and the resources that routing and capacity planning schedule against."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Plants & lines' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={handleOpenNewPlant}>New plant</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {plants.map((p) => (
          <button
            key={p.uid}
            onClick={() => setActiveUid(p.uid)}
            className={
              p.uid === activeUid
                ? 'rounded-card border border-brand-500 bg-brand-500/5 px-3.5 py-2 text-left'
                : 'rounded-card border border-border bg-surface px-3.5 py-2 text-left transition-colors hover:bg-surface-2'
            }
          >
            <span className="flex items-center gap-2">
              <Factory className={p.uid === activeUid ? 'h-4 w-4 text-brand-600' : 'h-4 w-4 text-fg-subtle'} />
              <span className="text-sm font-medium text-fg">{p.name}</span>
            </span>
            <span className="mt-0.5 block text-2xs text-fg-subtle">
              {p.linesCount} lines · {p.installedCapacityPerDay.toLocaleString('en-IN')} bottles/day
            </span>
          </button>
        ))}
      </div>

      {plant && (
        <>
          <Card className="mb-4">
        <CardHeader title={plant.name} description={`${branch?.name} · Plant head ${plant.plantHead}`}
          actions={<Button size="sm" variant="outline" onClick={() => toast.info('Edit plant', `${plant.name} (${plant.code}) — edit the plant master.`)}>Edit plant</Button>} />
        <CardBody className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          <DataRow label="Code" value={plant.code} mono />
          <DataRow label="Branch" value={branch?.name} />
          <DataRow label="Shift pattern" value={plant.shiftPattern} />
          <DataRow label="Factory licence" value={plant.factoryLicence} mono />
          <DataRow label="Licence valid to" value={
            <span className={licenceDays <= 90 ? 'text-warning' : undefined}>
              {formatDate(plant.factoryLicenceValidTo)}
            </span>
          } />
          <DataRow label="Location" value={`${plant.city}, ${plant.state}`} />
        </CardBody>
      </Card>

      {lines.some((l) => l.status === 'MAINTENANCE') && (
        <Alert tone="warning" className="mb-4" title="A production line is under maintenance">
          {lines.filter((l) => l.status === 'MAINTENANCE').map((l) => l.name).join(', ')} is excluded
          from capacity planning until it returns to RUNNING. Production orders scheduled on it are
          flagged for rescheduling.
        </Alert>
      )}

      <Tabs className="mb-4" active={tab} onChange={setTab} tabs={[
        { id: 'lines', label: 'Production lines', count: lines.length },
        { id: 'workcentres', label: 'Work centres', count: wcs.length },
        { id: 'capacity', label: 'Capacity view' },
        { id: 'stores', label: 'Default stores', count: stores.length },
      ]} />

      {tab === 'lines' && (
        <DataTable rows={lines} columns={lineColumns} rowKey={(l) => l.uid} searchable={false}
          onExport={doExport} pageSize={20} />
      )}

      {tab === 'workcentres' && (
        <DataTable rows={wcs} columns={wcColumns} rowKey={(w) => w.uid} searchPlaceholder="Work centre…"
          onExport={doExport} pageSize={20} />
      )}

      {tab === 'capacity' && (
        <Card>
          <CardHeader title="Effective capacity by work centre" description="Rated capacity × efficiency. The lowest effective capacity in a routing sets the line rate." />
          <CardBody className="space-y-3">
            {[...wcs].sort((a, b) => a.capacityPerHour * a.efficiencyPct - b.capacityPerHour * b.efficiencyPct).map((w) => {
              const eff = Math.round(w.capacityPerHour * (w.efficiencyPct / 100))
              const max = Math.max(...wcs.map((x) => Math.round(x.capacityPerHour * (x.efficiencyPct / 100))))
              return (
                <div key={w.uid}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-[10px] text-fg-subtle">{w.code}</span>
                      <span className="text-fg">{w.name}</span>
                      {w.isBottleneck && <Badge tone="danger" size="sm">Bottleneck</Badge>}
                    </span>
                    <span className="shrink-0 text-xs text-fg-muted tabular">
                      {eff}/hr <span className="text-fg-subtle">({w.capacityPerHour} × {w.efficiencyPct}%)</span>
                    </span>
                  </div>
                  <ProgressBar value={eff} max={max} tone={w.isBottleneck ? 'danger' : 'brand'} />
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}

      {tab === 'stores' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => (
            <Card key={s.uid}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium text-fg">{s.code}</span>
                  <Badge tone="neutral" size="sm" dot={false}>{s.warehouseType.replace(/_/g, ' ').toLowerCase()}</Badge>
                </div>
                <p className="mt-1 text-xs text-fg-muted">{s.name}</p>
                <div className="mt-2 flex justify-between text-2xs text-fg-subtle">
                  <span>{s.isBinManaged ? `${s.binCount} bins` : 'No bin management'}</span>
                  <span className="tabular">{formatCurrency(s.stockValue)}</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  )}

      {!plant && (
        <div className="flex h-48 flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface-2 p-8 text-center">
          <Factory className="mb-4 h-8 w-8 text-fg-muted" />
          <h3 className="text-sm font-medium text-fg">No plants created yet</h3>
          <p className="mt-1 text-xs text-fg-subtle">Create a plant to get started.</p>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New plant" size="lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={handleCreate}>Create plant</Button></>}>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Plant code" required disabled value={form.code || ''} />
          <Input label="Plant name" required placeholder="Plant 3 — Pune" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Branch" required options={branches.map((b) => ({ value: b.uid, label: b.name }))} value={form.branchUid || ''} onChange={(e) => setForm({ ...form, branchUid: e.target.value })} />
          <Input label="Plant head" placeholder="🔍 Search users" value={form.plantHead || ''} onChange={(e) => setForm({ ...form, plantHead: e.target.value })} />
          <Input label="Factory licence number" value={form.factoryLicence || ''} onChange={(e) => setForm({ ...form, factoryLicence: e.target.value })} />
          <Input label="Licence valid to" type="date" value={form.factoryLicenceValidTo || ''} onChange={(e) => setForm({ ...form, factoryLicenceValidTo: e.target.value })} />
          <Input label="City" required value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input label="State" required value={form.state || ''} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          <Input label="Installed capacity / day" type="number" value={form.installedCapacityPerDay || ''} onChange={(e) => setForm({ ...form, installedCapacityPerDay: parseInt(e.target.value) })} />
          <Select label="Shift pattern" value={form.shiftPattern || ''} onChange={(e) => setForm({ ...form, shiftPattern: e.target.value })} options={[{ value: '3', label: '3-shift (A/B/C)' }, { value: '2', label: '2-shift (A/B)' }, { value: '1', label: 'General shift' }]} />
        </div>
        <Alert tone="info" className="mt-4">
          Default warehouses (RM issue-from, WIP, FG receive-to, scrap) can be assigned after the
          plant's stores are created.
        </Alert>
      </Modal>
    </div>
  )
}
