import { useMemo, useState } from 'react'
import { Eye, Pencil, MoreHorizontal, Plus, Download } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/inventory/ConfirmDialog'
import { columnsFromTable, exportRows } from '@/lib/export'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import {
  useWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
  useDeactivateWarehouse,
} from '@/hooks/useOrganisation'
import { usePlants } from '@/hooks/useOrganisation'
import { warehouses as warehouseApi, type Warehouse } from '@/api/organisation'
import { InvFilterBar, InvSearch, InvSelect } from '@/components/inventory/InvFilterBar'

/** Warehouse types the backend accepts — the same vocabulary `sys_warehouse`
 *  stores, not a parallel list invented for the screen. */
const WAREHOUSE_TYPES = [
  { value: 'RAW_MATERIAL', label: 'Raw material store' },
  { value: 'WIP', label: 'WIP store' },
  { value: 'FINISHED_GOODS', label: 'Finished goods store' },
  { value: 'PACKING_MATERIAL', label: 'Packing material store' },
  { value: 'SPARES', label: 'Spares store' },
  { value: 'SCRAP', label: 'Scrap store' },
  { value: 'QUARANTINE', label: 'Quarantine store' },
]

const VALUATION = [
  { value: 'WEIGHTED_AVG', label: 'Weighted average' },
  { value: 'FIFO', label: 'FIFO' },
  { value: 'STANDARD', label: 'Standard cost' },
]

const typeLabel = (t: string) =>
  WAREHOUSE_TYPES.find((x) => x.value === t)?.label ?? t.replace(/_/g, ' ').toLowerCase()

interface FormState {
  code: string
  name: string
  plant_uid: string
  warehouse_type: string
  valuation_method: string
  address_line1: string
  pincode: string
  is_bin_managed: boolean
  is_batch_mandatory: boolean
  allow_negative_stock: boolean
}

const EMPTY: FormState = {
  code: '', name: '', plant_uid: '', warehouse_type: 'RAW_MATERIAL',
  valuation_method: 'WEIGHTED_AVG', address_line1: '', pincode: '',
  is_bin_managed: false, is_batch_mandatory: false, allow_negative_stock: false,
}

/**
 * Warehouse Setup — CRUD over `sys_warehouse`, the existing Store master.
 *
 * Deliberately no new table and no new endpoints: the organisation module
 * already owns warehouses and exposes list / get / create / patch / deactivate.
 * This screen is the inventory-side view of that master, so a store edited here
 * is the same record every other module reads.
 *
 * Edit and View both fetch the record by uid rather than reusing the list row,
 * so the form always shows the record that was clicked.
 */
export function WarehousesPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [editUid, setEditUid] = useState<string | null>(null)
  // Held from the fetched record so the PATCH can send If-Match style
  // optimistic locking; a stale version is rejected with 409.
  const [editVersion, setEditVersion] = useState<number>(0)
  const [viewRecord, setViewRecord] = useState<Warehouse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirm, setConfirm] = useState<Warehouse | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data, isLoading, error, refetch } = useWarehouses({ page_size: 200 })
  const plants = usePlants({ page_size: 200 }).data?.data ?? []

  const create = useCreateWarehouse()
  const update = useUpdateWarehouse()
  const deactivate = useDeactivateWarehouse()

  const rows = useMemo(() => {
    let list = data?.data ?? []
    if (typeFilter) list = list.filter((w) => w.warehouse_type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (w) =>
          w.code.toLowerCase().includes(q) ||
          w.name.toLowerCase().includes(q) ||
          typeLabel(w.warehouse_type).toLowerCase().includes(q),
      )
    }
    return list
  }, [data?.data, search, typeFilter])

  function reportError(fallback: string, e: unknown) {
    if (e instanceof ProblemError) toast.error(e.problem.title || fallback, e.problem.detail)
    else toast.error(fallback, e instanceof Error ? e.message : 'Unexpected error.')
  }

  /** Fetch the full record by uid, then open. Never populate from the list row. */
  async function openDetail(uid: string, mode: 'view' | 'edit') {
    setDetailLoading(true)
    try {
      const w = await warehouseApi.get(uid)
      if (mode === 'view') {
        setViewRecord(w)
      } else {
        setEditUid(uid)
        setEditVersion(w.version)
        setForm({
          code: w.code,
          name: w.name,
          plant_uid: w.plant_uid ?? '',
          warehouse_type: w.warehouse_type,
          valuation_method: w.valuation_method,
          address_line1: (w as unknown as { address_line1?: string }).address_line1 ?? '',
          pincode: (w as unknown as { pincode?: string }).pincode ?? '',
          is_bin_managed: w.is_bin_managed,
          is_batch_mandatory: w.is_batch_mandatory,
          allow_negative_stock: w.allow_negative_stock,
        })
      }
    } catch (e) {
      reportError('Could not load this warehouse', e)
    } finally {
      setDetailLoading(false)
    }
  }

  async function save() {
    if (!form) return
    const fe: Record<string, string> = {}
    if (!form.code.trim()) fe.code = 'A code is required'
    if (!form.name.trim()) fe.name = 'A name is required'
    if (Object.keys(fe).length) { setErrors(fe); return }
    setErrors({})

    const body: Record<string, unknown> = {
      code: form.code.trim(),
      name: form.name.trim(),
      plant_uid: form.plant_uid || null,
      warehouse_type: form.warehouse_type,
      valuation_method: form.valuation_method,
      address_line1: form.address_line1 || null,
      pincode: form.pincode || null,
      is_bin_managed: form.is_bin_managed,
      is_batch_mandatory: form.is_batch_mandatory,
      allow_negative_stock: form.allow_negative_stock,
    }

    try {
      if (editUid) {
        await update.mutateAsync({ uid: editUid, body: { ...body, version: editVersion } })
        toast.success('Saved', `${form.code} updated.`)
      } else {
        await create.mutateAsync(body)
        toast.success('Created', `${form.code} added.`)
      }
      setForm(null)
      setEditUid(null)
      refetch()
    } catch (e) {
      reportError(editUid ? 'Could not save this warehouse' : 'Could not create this warehouse', e)
    }
  }

  async function runDeactivate() {
    if (!confirm) return
    try {
      await deactivate.mutateAsync({
        uid: confirm.uid,
        body: { version: confirm.version, reason: 'Deactivated from Warehouse Setup' },
      })
      toast.success('Deactivated', `${confirm.code} is no longer available for new movements.`)
      setConfirm(null)
      refetch()
    } catch (e) {
      // The server refuses to deactivate a store that still holds stock or is
      // referenced by an open document; surface that reason verbatim.
      reportError('Could not deactivate this warehouse', e)
      setConfirm(null)
    }
  }

  const columns: Column<Warehouse>[] = [
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>,
    },
    {
      key: 'code', header: 'Store Code', width: '150px', sortable: true,
      accessor: (w) => w.code,
      render: (w) => <span className="font-mono text-[13px] font-semibold text-fg">{w.code}</span>,
    },
    {
      key: 'name', header: 'Store Name', width: '260px', sortable: true,
      accessor: (w) => w.name,
      render: (w) => <span className="block truncate text-[14px] text-fg" title={w.name}>{w.name}</span>,
    },
    {
      key: 'plant', header: 'Plant', width: '180px',
      accessor: (w) => w.plant_name ?? '',
      render: (w) => (
        <span className="text-[14px] text-fg-muted">
          {w.plant_name ? `${w.plant_code} — ${w.plant_name}` : '—'}
        </span>
      ),
    },
    {
      key: 'warehouse_type', header: 'Type', width: '190px', sortable: true,
      accessor: (w) => w.warehouse_type,
      render: (w) => <Badge tone="neutral" size="sm" dot={false}>{typeLabel(w.warehouse_type)}</Badge>,
    },
    {
      key: 'valuation_method', header: 'Valuation', width: '140px', defaultHidden: true,
      accessor: (w) => w.valuation_method,
      render: (w) => (
        <span className="text-[13px] text-fg-muted">
          {VALUATION.find((v) => v.value === w.valuation_method)?.label ?? w.valuation_method}
        </span>
      ),
    },
    {
      key: 'is_active', header: 'Status', width: '120px', align: 'center',
      accessor: (w) => (w.is_active ? 'Active' : 'Inactive'),
      render: (w) => (
        <Badge tone={w.is_active ? 'success' : 'neutral'} size="sm">
          {w.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions', header: 'Actions', width: '120px', align: 'center', className: 'col-flex',
      render: (w) => (
        <div className="flex items-center justify-center gap-0.5">
          <IconButton
            icon={Eye} variant="ghost" size="sm" title="View" aria-label={`View ${w.code}`}
            onClick={() => openDetail(w.uid, 'view')}
          />
          <IconButton
            icon={Pencil} variant="ghost" size="sm" title="Edit" aria-label={`Edit ${w.code}`}
            onClick={() => openDetail(w.uid, 'edit')}
          />
          <Menu trigger={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" title="More actions" aria-label="More actions" />}>
            <MenuItem label="View stock in this store" onClick={() => window.location.assign(`/inventory/stock?warehouse=${w.uid}`)} />
            {w.is_active && (
              <MenuItem label="Deactivate" danger onClick={() => setConfirm(w)} />
            )}
          </Menu>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader
        title="Warehouse Setup"
        description="Stores that hold stock. This is the same Store master every other module reads — editing here changes it everywhere."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory' }, { label: 'Warehouse Setup' }]}
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => { setEditUid(null); setForm({ ...EMPTY }); setErrors({}) }}
          >
            New Warehouse
          </Button>
        }
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in to load warehouses.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load warehouses">
          {error instanceof ProblemError ? error.problem.detail : 'Unable to load warehouse data.'}
        </Alert>
      )}

      <InvFilterBar
        left={
          <>
            <InvSearch value={search} onChange={setSearch} placeholder="Search code, name or type…" />
            <InvSelect
              label="Type" value={typeFilter} onChange={setTypeFilter}
              options={[{ value: '', label: 'All types' }, ...WAREHOUSE_TYPES]}
            />
          </>
        }
        right={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setSearch(''); setTypeFilter('') }}>
              Clear Filters
            </Button>
            <Button
              size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => {
                const n = exportRows('csv', 'warehouses', 'Warehouse setup', columnsFromTable(columns), rows)
                toast.success('Export ready', `${n} rows written.`)
              }}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      <DataTable
        density="comfortable"
        searchable={false}
        rows={rows}
        columns={columns}
        rowKey={(w) => w.uid}
        loading={isLoading || detailLoading}
        emptyTitle="No warehouses found"
        emptyDescription="No store matches these filters. Try clearing them, or add a new warehouse."
      />

      {/* ── New / Edit ─────────────────────────────────────────────────── */}
      {form && (
        <Modal
          open
          onClose={() => { setForm(null); setEditUid(null) }}
          title={editUid ? 'Edit Warehouse' : 'New Warehouse'}
          description="Stores are shared master data — every module sees this record."
          size="2xl"
          closeOnBackdrop={false}
          footer={
            <>
              <Button variant="outline" onClick={() => { setForm(null); setEditUid(null) }}>Cancel</Button>
              <Button variant="primary" loading={create.isPending || update.isPending} onClick={save}>
                {editUid ? 'Update' : 'Create'}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Warehouse Code" required value={form.code} error={errors.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="Warehouse Name" required value={form.name} error={errors.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Select
              label="Plant" value={form.plant_uid}
              onChange={(e) => setForm({ ...form, plant_uid: e.target.value })}
              options={[
                { value: '', label: 'Not assigned' },
                ...plants.map((p) => ({ value: p.uid, label: `${p.code} — ${p.name}` })),
              ]}
            />
            <Select
              label="Warehouse Type" required value={form.warehouse_type}
              onChange={(e) => setForm({ ...form, warehouse_type: e.target.value })}
              options={WAREHOUSE_TYPES}
            />
            <Input
              label="Location" value={form.address_line1}
              onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
            />
            <Input
              label="Pincode" value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value })}
            />
            <Select
              label="Valuation Method" value={form.valuation_method}
              onChange={(e) => setForm({ ...form, valuation_method: e.target.value })}
              options={VALUATION}
            />
            <div className="col-span-2 flex flex-wrap gap-5 rounded-lg bg-surface-2 p-4">
              {([
                ['is_bin_managed', 'Bin managed'],
                ['is_batch_mandatory', 'Batch mandatory'],
                ['allow_negative_stock', 'Allow negative stock'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* ── View (read only) ───────────────────────────────────────────── */}
      {viewRecord && (
        <Modal
          open
          onClose={() => setViewRecord(null)}
          title={`${viewRecord.code} — ${viewRecord.name}`}
          size="2xl"
          footer={<Button variant="secondary" onClick={() => setViewRecord(null)}>Close</Button>}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {([
              ['Warehouse Code', viewRecord.code],
              ['Warehouse Name', viewRecord.name],
              ['Plant', viewRecord.plant_name ? `${viewRecord.plant_code} — ${viewRecord.plant_name}` : '—'],
              ['Type', typeLabel(viewRecord.warehouse_type)],
              ['Valuation Method', VALUATION.find((v) => v.value === viewRecord.valuation_method)?.label ?? viewRecord.valuation_method],
              ['Bin Managed', viewRecord.is_bin_managed ? 'Yes' : 'No'],
              ['Batch Mandatory', viewRecord.is_batch_mandatory ? 'Yes' : 'No'],
              ['Allow Negative Stock', viewRecord.allow_negative_stock ? 'Yes' : 'No'],
              ['Status', viewRecord.is_active ? 'Active' : 'Inactive'],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <p className="text-2xs font-medium uppercase tracking-wider text-fg-muted">{label}</p>
                <p className="mt-0.5 text-sm font-medium text-fg">{value}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirm}
        tone="danger"
        title="Deactivate this warehouse?"
        message={`${confirm?.code ?? ''} will stop accepting new movements. Its stock and history are kept — a store that has ever held stock is never deleted.`}
        confirmLabel="Deactivate"
        busy={deactivate.isPending}
        onConfirm={runDeactivate}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}

export default WarehousesPage
