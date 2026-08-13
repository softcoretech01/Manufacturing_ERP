import { useState, useEffect } from 'react'
import { Factory, Gauge, Plus, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Factory, Pencil, Plus, Power, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader, Alert } from '@/components/ui/Misc'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { HowItWorks } from '@/components/crud/CrudKit'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { api } from '@/lib/api'
import type { ProductionLine, WorkCentre } from '@/types'
import { ProblemError } from '@/api/client'
import { plants as plantApi, type Plant } from '@/api/organisation'
import {
  usePlants,
  useBranches,
  useCreatePlant,
  useUpdatePlant,
  useDeactivatePlant,
  useRestorePlant,
} from '@/hooks/useOrganisation'
import { useSession } from '@/api/session'

/** Wired to the live FastAPI backend (Organisation module). */

interface FormState {
  code: string
  branch_uid: string
  branch_label: string
  name: string
  factory_licence_no: string
  factory_licence_valid_to: string
  pollution_consent_no: string
  installed_capacity_per_day: string
}

const BLANK: FormState = {
  code: '',
  branch_uid: '',
  branch_label: '',
  name: '',
  factory_licence_no: '',
  factory_licence_valid_to: '',
  pollution_consent_no: '',
  installed_capacity_per_day: '',
}

export function PlantsPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)

  const { data, isLoading, error, refetch } = usePlants({ page_size: 200 })
  const { data: branchData } = useBranches({ page_size: 200 })
  const createPlant = useCreatePlant()
  const updatePlant = useUpdatePlant()
  const deactivatePlant = useDeactivatePlant()
  const restorePlant = useRestorePlant()

  const rows = data?.data ?? []
  const branches = (branchData?.data ?? []).filter((b) => b.is_active)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Plant | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  function openCreate() {
    setEditing(null)
    setForm({ ...BLANK, branch_uid: branches[0]?.uid ?? '' })
    setErrors({})
    setFormOpen(true)
    plantApi.nextCode().then((code) => setForm((f) => ({ ...f, code }))).catch(() => {})
  }

  function openEdit(p: Plant) {
    setEditing(p)
    setForm({
      code: p.code,
      branch_uid: p.branch_uid ?? '',
      branch_label: p.branch_code ? `${p.branch_code} — ${p.branch_name ?? ''}` : '—',
      name: p.name,
      factory_licence_no: p.factory_licence_no ?? '',
      factory_licence_valid_to: p.factory_licence_valid_to ?? '',
      pollution_consent_no: p.pollution_consent_no ?? '',
      installed_capacity_per_day: p.installed_capacity_per_day?.toString() ?? '',
    })
    setErrors({})
    setFormOpen(true)
  }

  function handleError(err: unknown, fallback: string) {
    if (err instanceof ProblemError) {
      const fe: Record<string, string> = {}
      for (const e of err.problem.errors ?? []) fe[e.field] = e.message
      setErrors(fe)
      toast.error(err.problem.title || 'Request failed', err.problem.detail)
    } else {
      toast.error(fallback, err instanceof Error ? err.message : 'Unknown error.')
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

  function save() {
    const capacity = form.installed_capacity_per_day.trim()
    if (capacity && Number(capacity) < 0) {
      setErrors({ installed_capacity_per_day: 'Capacity cannot be negative.' })
      return
    }
    setErrors({})
    const common = {
      name: form.name.trim(),
      factory_licence_no: form.factory_licence_no.trim() || null,
      factory_licence_valid_to: form.factory_licence_valid_to || null,
      pollution_consent_no: form.pollution_consent_no.trim() || null,
      installed_capacity_per_day: capacity ? Number(capacity) : null,
    }
    if (editing) {
      updatePlant.mutate(
        { uid: editing.uid, body: { version: editing.version, ...common } },
        {
          onSuccess: () => {
            toast.success('Plant updated', `${editing.code} saved.`)
            setFormOpen(false)
          },
          onError: (e) => handleError(e, 'Update failed'),
        },
      )
    } else {
      if (!form.branch_uid) {
        setErrors({ branch_uid: 'Select a branch.' })
        return
      }
      createPlant.mutate(
        { branch_uid: form.branch_uid, ...common },
        {
          onSuccess: (created) => {
            toast.success('Plant created', `${created.code} added.`)
            setFormOpen(false)
          },
          onError: (e) => handleError(e, 'Create failed'),
        },
      )
    }
  }

  function toggleActive(p: Plant) {
    if (p.is_active) {
      deactivatePlant.mutate(
        { uid: p.uid, body: { version: p.version } },
        {
          onSuccess: () => toast.success('Plant deactivated', `${p.name} is now inactive.`),
          onError: (e) => handleError(e, 'Deactivate failed'),
        },
      )
    } else {
      restorePlant.mutate(p.uid, {
        onSuccess: () => toast.success('Plant restored', `${p.name} is active again.`),
        onError: (e) => handleError(e, 'Restore failed'),
      })
    }
  }

  const columns: Column<Plant>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '90px', render: (p) => <span className="font-mono text-xs font-medium">{p.code}</span> },
    { key: 'name', header: 'Plant', sortable: true, render: (p) => <span className="font-medium text-fg">{p.name}</span> },
    { key: 'branch_code', header: 'Branch', sortable: true, width: '160px', accessor: (p) => p.branch_code ?? '', render: (p) => p.branch_code ? <span className="text-xs text-fg-muted"><span className="font-mono">{p.branch_code}</span> · {p.branch_name}</span> : <span className="text-xs text-fg-subtle">—</span> },
    { key: 'factory_licence_no', header: 'Factory licence', render: (p) => p.factory_licence_no ? <span className="font-mono text-[11px]">{p.factory_licence_no}</span> : <span className="text-xs text-fg-subtle">—</span> },
    { key: 'installed_capacity_per_day', header: 'Capacity/day', align: 'right', width: '120px', render: (p) => p.installed_capacity_per_day != null ? <span className="tabular">{Number(p.installed_capacity_per_day).toLocaleString('en-IN')}</span> : <span className="text-fg-subtle">—</span> },
    {
      key: 'is_active',
      header: 'Status',
      width: '100px',
      accessor: (p) => (p.is_active ? 'Active' : 'Inactive'),
      render: (p) => <Badge tone={p.is_active ? 'success' : 'neutral'} size="sm">{p.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
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
  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'plants', 'Plants', columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows saved as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const saving = createPlant.isPending || updatePlant.isPending

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
        title="Plants"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Plants' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate} disabled={!branches.length}>
            Add plant
          </Button>
        }
      />

      <HowItWorks>
        Live data from the Organisation module. A plant belongs to a branch; its code is auto-generated
        and cannot be edited. A plant can only be deactivated once it has no active warehouses.
      </HowItWorks>

      {!companyUid && (
        <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>
      )}
      {!branches.length && companyUid && (
        <Alert tone="info" title="Add a branch first">A plant must belong to a branch — create a branch, then add plants under it.</Alert>
      )}
      {error && (
        <Alert tone="danger" title="Could not load plants">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
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
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.uid}
        loading={isLoading}
        searchPlaceholder="Plant name or code…"
        onExport={doExport}
        onRowClick={openEdit}
        emptyTitle="No plants yet"
        emptyDescription="Add your first plant under a branch."
        emptyAction={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate} disabled={!branches.length}>Add plant</Button>}
        rowActions={(p) => (
          <>
            <MenuItem label="Edit" icon={<Pencil />} onClick={() => openEdit(p)} />
            <MenuItem label={p.is_active ? 'Deactivate' : 'Restore'} icon={p.is_active ? <Power /> : <RotateCcw />} separatorBefore onClick={() => toggleActive(p)} />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Add plant'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>{editing ? 'Save changes' : 'Add plant'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Plant code" value={form.code || 'auto…'} readOnly className="bg-surface-2"
            hint="Auto-generated · not editable" onChange={() => {}} />
          {editing ? (
            <Input label="Branch" value={form.branch_label} readOnly disabled
              hint="Branch cannot be changed after creation" onChange={() => {}} />
          ) : (
            <Select label="Branch" required value={form.branch_uid} error={errors.branch_uid}
              onChange={(e) => set({ branch_uid: e.target.value })}
              options={[{ value: '', label: 'Select a branch…' }, ...branches.map((b) => ({ value: b.uid, label: `${b.code} — ${b.name}` }))]} />
          )}
          <Input label="Plant name" required containerClassName="sm:col-span-2" value={form.name} error={errors.name} maxLength={150}
            placeholder="Plant 1 — Sriperumbudur" onChange={(e) => set({ name: e.target.value })} />
          <Input label="Factory licence no." value={form.factory_licence_no} error={errors.factory_licence_no} maxLength={50}
            placeholder="TN/FAC/2021/0421" onChange={(e) => set({ factory_licence_no: e.target.value })} />
          <Input label="Factory licence valid to" type="date" value={form.factory_licence_valid_to}
            hint="Renewal-reminder date" onChange={(e) => set({ factory_licence_valid_to: e.target.value })} />
          <Input label="Pollution consent no." value={form.pollution_consent_no} maxLength={50}
            placeholder="TNPCB/CTO/2021/…" onChange={(e) => set({ pollution_consent_no: e.target.value })} />
          <Input label="Installed capacity / day" type="number" min={0} value={form.installed_capacity_per_day}
            error={errors.installed_capacity_per_day} placeholder="25000"
            hint="Units per day" onChange={(e) => set({ installed_capacity_per_day: e.target.value })} />
        </div>
      </Modal>
    </div>
  )
}
