import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, Pencil, Plus, Power, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { MenuItem } from '@/components/ui/Menu'
import { PageHeader, Alert } from '@/components/ui/Misc'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { HowItWorks } from '@/components/crud/CrudKit'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { ProblemError } from '@/api/client'
import { warehouses as whApi, type Warehouse } from '@/api/organisation'
import {
  useWarehouses,
  useBranches,
  usePlants,
  useCreateWarehouse,
  useUpdateWarehouse,
  useDeactivateWarehouse,
  useRestoreWarehouse,
} from '@/hooks/useOrganisation'
import { useSession } from '@/api/session'

/** Wired to the live FastAPI backend (Organisation module). */

const WAREHOUSE_TYPES = [
  { value: 'RAW_MATERIAL', label: 'Raw material' },
  { value: 'WIP', label: 'Work in progress' },
  { value: 'FINISHED_GOODS', label: 'Finished goods' },
  { value: 'PACKING_MATERIAL', label: 'Packing material' },
  { value: 'CONSUMABLE_SPARES', label: 'Consumable / spares' },
  { value: 'QUARANTINE', label: 'Quarantine' },
  { value: 'REJECT', label: 'Reject' },
  { value: 'SCRAP', label: 'Scrap' },
]

const VALUATION_METHODS = [
  { value: 'WEIGHTED_AVG', label: 'Weighted average' },
  { value: 'FIFO', label: 'FIFO' },
  { value: 'STANDARD', label: 'Standard cost' },
]

interface FormState {
  code: string
  name: string
  branch_uid: string
  plant_uid: string
  branch_label: string
  plant_label: string
  warehouse_type: string
  valuation_method: string
  is_bin_managed: boolean
  is_batch_mandatory: boolean
  allow_negative_stock: boolean
}

const BLANK: FormState = {
  code: '',
  name: '',
  branch_uid: '',
  plant_uid: '',
  branch_label: '',
  plant_label: '',
  warehouse_type: 'RAW_MATERIAL',
  valuation_method: 'WEIGHTED_AVG',
  is_bin_managed: false,
  is_batch_mandatory: false,
  allow_negative_stock: false,
}

export function WarehousesPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const companyUid = useSession((s) => s.companyUid)

  const { data, isLoading, error, refetch } = useWarehouses({ page_size: 200 })
  const { data: branchData } = useBranches({ page_size: 200 })
  const { data: plantData } = usePlants({ page_size: 200 })
  const createWh = useCreateWarehouse()
  const updateWh = useUpdateWarehouse()
  const deactivateWh = useDeactivateWarehouse()
  const restoreWh = useRestoreWarehouse()

  const rows = data?.data ?? []
  const branches = (branchData?.data ?? []).filter((b) => b.is_active)
  const plants = (plantData?.data ?? []).filter((p) => p.is_active)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  function openCreate() {
    setEditing(null)
    setForm({ ...BLANK, branch_uid: '' })
    setErrors({})
    setFormOpen(true)
    whApi.nextCode().then((code) => setForm((f) => ({ ...f, code }))).catch(() => {})
  }

  function openEdit(w: Warehouse) {
    setEditing(w)
    setForm({
      code: w.code,
      name: w.name,
      branch_uid: w.branch_uid ?? '',
      plant_uid: w.plant_uid ?? '',
      branch_label: w.branch_code ? `${w.branch_code} — ${w.branch_name ?? ''}` : '—',
      plant_label: w.plant_code ? `${w.plant_code} — ${w.plant_name ?? ''}` : '— none —',
      warehouse_type: w.warehouse_type,
      valuation_method: w.valuation_method,
      is_bin_managed: w.is_bin_managed,
      is_batch_mandatory: w.is_batch_mandatory,
      allow_negative_stock: w.allow_negative_stock,
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

  function save() {
    setErrors({})
    const common = {
      name: form.name.trim(),
      warehouse_type: form.warehouse_type,
      valuation_method: form.valuation_method,
      is_bin_managed: form.is_bin_managed,
      is_batch_mandatory: form.is_batch_mandatory,
      allow_negative_stock: form.allow_negative_stock,
    }
    if (editing) {
      updateWh.mutate(
        { uid: editing.uid, body: { version: editing.version, ...common } },
        {
          onSuccess: () => {
            toast.success('Warehouse updated', `${editing.code} saved.`)
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
      createWh.mutate(
        { branch_uid: form.branch_uid, plant_uid: form.plant_uid || null, ...common },
        {
          onSuccess: (created) => {
            toast.success('Warehouse created', `${created.code} added.`)
            setFormOpen(false)
          },
          onError: (e) => handleError(e, 'Create failed'),
        },
      )
    }
  }

  function toggleActive(w: Warehouse) {
    if (w.is_active) {
      deactivateWh.mutate(
        { uid: w.uid, body: { version: w.version } },
        {
          onSuccess: () => toast.success('Warehouse deactivated', `${w.name} is now inactive.`),
          onError: (e) => handleError(e, 'Deactivate failed'),
        },
      )
    } else {
      restoreWh.mutate(w.uid, {
        onSuccess: () => toast.success('Warehouse restored', `${w.name} is active again.`),
        onError: (e) => handleError(e, 'Restore failed'),
      })
    }
  }

  const columns: Column<Warehouse>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '90px', render: (w) => <span className="font-mono text-xs font-medium">{w.code}</span> },
    { key: 'name', header: 'Warehouse', sortable: true, render: (w) => <span className="font-medium text-fg">{w.name}</span> },
    { key: 'branch_code', header: 'Branch', sortable: true, width: '160px', accessor: (w) => w.branch_code ?? '', render: (w) => w.branch_code ? <span className="text-xs text-fg-muted"><span className="font-mono">{w.branch_code}</span> · {w.branch_name}</span> : <span className="text-xs text-fg-subtle">—</span> },
    { key: 'warehouse_type', header: 'Type', sortable: true, width: '150px', render: (w) => <Badge tone="neutral" size="sm" dot={false}>{w.warehouse_type.replace(/_/g, ' ').toLowerCase()}</Badge> },
    { key: 'valuation_method', header: 'Valuation', width: '130px', render: (w) => <span className="text-xs text-fg-muted">{w.valuation_method.replace(/_/g, ' ').toLowerCase()}</span> },
    { key: 'is_batch_mandatory', header: 'Batch', align: 'center', width: '70px', accessor: (w) => (w.is_batch_mandatory ? 1 : 0), render: (w) => (w.is_batch_mandatory ? <Badge tone="brand" size="sm" dot={false}>yes</Badge> : <span className="text-fg-subtle">—</span>) },
    {
      key: 'is_active',
      header: 'Status',
      width: '100px',
      accessor: (w) => (w.is_active ? 'Active' : 'Inactive'),
      render: (w) => <Badge tone={w.is_active ? 'success' : 'neutral'} size="sm">{w.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'warehouses', 'Warehouses', columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows saved as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const saving = createWh.isPending || updateWh.isPending
  // Only offer plants that belong to the branch being chosen (PlantOut.branch_uid).
  const plantOptions = form.branch_uid ? plants.filter((p) => p.branch_uid === form.branch_uid) : plants

  return (
    <div>
      <PageHeader
        title="Warehouses"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Warehouses' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate} disabled={!branches.length}>
            Add warehouse
          </Button>
        }
      />

      <HowItWorks>
        Live data from the Organisation module. A warehouse belongs to a branch (and optionally a plant);
        its code is auto-generated. Valuation method and batch/bin policies drive inventory behaviour later.
      </HowItWorks>

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {!branches.length && companyUid && <Alert tone="info" title="Add a branch first">A warehouse must belong to a branch.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load warehouses">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(w) => w.uid}
        loading={isLoading}
        searchPlaceholder="Warehouse name or code…"
        onExport={doExport}
        onRowClick={openEdit}
        emptyTitle="No warehouses yet"
        emptyDescription="Add your first warehouse under a branch."
        emptyAction={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate} disabled={!branches.length}>Add warehouse</Button>}
        rowActions={(w) => (
          <>
            <MenuItem label="Edit" icon={<Pencil />} onClick={() => openEdit(w)} />
            <MenuItem
              label="Zones & bins"
              icon={<Boxes />}
              onClick={() => navigate(`/inventory/structure?warehouse=${w.uid}`)}
            />
            <MenuItem label={w.is_active ? 'Deactivate' : 'Restore'} icon={w.is_active ? <Power /> : <RotateCcw />} separatorBefore onClick={() => toggleActive(w)} />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Add warehouse'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>{editing ? 'Save changes' : 'Add warehouse'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Warehouse code" value={form.code || 'auto…'} readOnly className="bg-surface-2"
            hint="Auto-generated · not editable" onChange={() => {}} />
          <Input label="Warehouse name" required value={form.name} error={errors.name} maxLength={150}
            placeholder="Raw Material Store" onChange={(e) => set({ name: e.target.value })} />
          {editing ? (
            <>
              <Input label="Branch" value={form.branch_label} readOnly disabled
                hint="Branch cannot be changed after creation" onChange={() => {}} />
              <Input label="Plant" value={form.plant_label} readOnly disabled onChange={() => {}} />
            </>
          ) : (
            <>
              <Select label="Branch" required value={form.branch_uid} error={errors.branch_uid}
                onChange={(e) => set({ branch_uid: e.target.value, plant_uid: '' })}
                options={[{ value: '', label: 'Select a branch…', disabled: true }, ...branches.map((b) => ({ value: b.uid, label: `${b.code} — ${b.name}` }))]} />
              <Select label="Plant (optional)" value={form.plant_uid}
                onChange={(e) => set({ plant_uid: e.target.value })}
                options={[{ value: '', label: '— none —' }, ...plantOptions.map((p) => ({ value: p.uid, label: `${p.code} — ${p.name}` }))]} />
            </>
          )}
          <Select label="Warehouse type" value={form.warehouse_type} error={errors.warehouse_type}
            onChange={(e) => set({ warehouse_type: e.target.value })} options={WAREHOUSE_TYPES} />
          <Select label="Valuation method" value={form.valuation_method}
            onChange={(e) => set({ valuation_method: e.target.value })} options={VALUATION_METHODS} />
          <div className="space-y-2.5 sm:col-span-2">
            <Switch checked={form.is_bin_managed} onChange={(v) => set({ is_bin_managed: v })} label="Bin managed (track storage locations within the warehouse)" />
            <Switch checked={form.is_batch_mandatory} onChange={(v) => set({ is_batch_mandatory: v })} label="Batch mandatory (every stock movement must carry a batch)" />
            <Switch checked={form.allow_negative_stock} onChange={(v) => set({ allow_negative_stock: v })} label="Allow negative stock" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
