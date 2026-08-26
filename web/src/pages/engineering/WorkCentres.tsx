import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatAmount } from '@/lib/format'
import { machines } from '@/mock/masters'
import type { EngWorkCentre, Routing } from '@/types/engineering'
import { engineeringApi as api } from '@/api/engineering'

const SHIFTS = ['A (8 h)', 'A + B (16 h)', 'A + B + C (24 h)']
const PLANTS = ['Chennai — Unit 1', 'Hosur — Unit 2']

interface FormState {
  code: string
  name: string
  plant: string
  machineRatePerHour: string
  labourRatePerHour: string
  overheadPct: string
  shiftPattern: string
  hoursPerDay: string
  oeeTargetPct: string
  machineCodes: string[]
  isActive: boolean
}

const emptyForm: FormState = {
  code: '',
  name: '',
  plant: PLANTS[0],
  machineRatePerHour: '',
  labourRatePerHour: '',
  overheadPct: '12',
  shiftPattern: SHIFTS[1],
  hoursPerDay: '16',
  oeeTargetPct: '85',
  machineCodes: [],
  isActive: true,
}

export function WorkCentresPage() {
  const toast = useToast()
  
  const [rows, setRows] = useState<EngWorkCentre[]>([])
  const [routings, setRoutings] = useState<Routing[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EngWorkCentre | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<EngWorkCentre | null>(null)

  async function loadData() {
    try {
      const [wcs, rts] = await Promise.all([
        api.getEngWorkCentres(),
        api.getRoutings().catch(() => [])
      ])
      setRows(wcs)
      setRoutings(rts)
    } catch (err) {
      toast.error('Error', 'Failed to load work centres')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  /** How many live routing operations depend on a centre — blocks deletion. */
  const usageOf = (code: string) =>
    routings
      .filter((r) => r.status === 'ACTIVE' || r.status === 'APPROVED')
      .reduce((n, r) => n + r.operations.filter((o) => o.workCentreCode === code).length, 0)

  const machineRate = Number(form.machineRatePerHour) || 0
  const labourRate = Number(form.labourRatePerHour) || 0
  const overhead = Number(form.overheadPct) || 0
  const effectiveRate = (machineRate + labourRate) * (1 + overhead / 100)

  const columns: Column<EngWorkCentre>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '7rem', render: (w) => <span className="font-mono text-xs font-medium text-brand-600">{w.code}</span> },
    { key: 'name', header: 'Work centre', sortable: true },
    { key: 'plant', header: 'Plant', sortable: true, width: '12rem' },
    { key: 'machineRatePerHour', header: 'Machine ₹/h', align: 'right', sortable: true, width: '8rem', accessor: (w) => w.machineRatePerHour, render: (w) => formatAmount(w.machineRatePerHour, 0) },
    { key: 'labourRatePerHour', header: 'Labour ₹/h', align: 'right', sortable: true, width: '8rem', accessor: (w) => w.labourRatePerHour, render: (w) => formatAmount(w.labourRatePerHour, 0) },
    { key: 'overheadPct', header: 'Overhead', align: 'right', width: '6rem', accessor: (w) => w.overheadPct, render: (w) => `${w.overheadPct}%` },
    { key: 'shiftPattern', header: 'Shift', width: '9rem', render: (w) => <span className="text-xs text-fg-muted">{w.shiftPattern}</span> },
    { key: 'capacity', header: 'Capacity', align: 'right', width: '7rem', accessor: (w) => w.hoursPerDay, render: (w) => `${w.hoursPerDay} h/day` },
    { key: 'usage', header: 'Used by', align: 'right', width: '6rem', accessor: (w) => usageOf(w.code), render: (w) => <span className="text-xs text-fg-muted tabular">{usageOf(w.code)} ops</span> },
    { key: 'isActive', header: 'Status', width: '7rem', accessor: (w) => (w.isActive ? 'Active' : 'Inactive'), render: (w) => <Badge tone={w.isActive ? 'success' : 'neutral'} size="sm">{w.isActive ? 'Active' : 'Inactive'}</Badge> },
  ]

  async function openCreate() {
    setEditing(null)
    setErrors({})
    try {
      const res = await api.getEngWorkCentresNextCode()
      setForm({ ...emptyForm, code: res.nextCode })
      setFormOpen(true)
    } catch (err) {
      toast.error('Error', 'Failed to generate code')
    }
  }

  function openEdit(w: EngWorkCentre) {
    setEditing(w)
    setForm({
      code: w.code,
      name: w.name,
      plant: w.plant,
      machineRatePerHour: String(w.machineRatePerHour),
      labourRatePerHour: String(w.labourRatePerHour),
      overheadPct: String(w.overheadPct),
      shiftPattern: w.shiftPattern,
      hoursPerDay: String(w.hoursPerDay),
      oeeTargetPct: String(w.oeeTargetPct),
      machineCodes: w.machineCodes || [],
      isActive: w.isActive,
    })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'A name is required.'
    if (!(Number(form.machineRatePerHour) >= 0)) e.machineRatePerHour = 'Enter a machine hour rate; use zero for a manual bay.'
    if (!(Number(form.labourRatePerHour) > 0)) e.labourRatePerHour = 'A labour rate above zero is required.'
    if (!(Number(form.hoursPerDay) > 0 && Number(form.hoursPerDay) <= 24)) e.hoursPerDay = 'Available hours must be between 1 and 24.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    const patch = {
      code: form.code,
      name: form.name.trim(),
      plant: form.plant,
      machineRatePerHour: Number(form.machineRatePerHour),
      labourRatePerHour: Number(form.labourRatePerHour),
      overheadPct: Number(form.overheadPct) || 0,
      shiftPattern: form.shiftPattern,
      hoursPerDay: Number(form.hoursPerDay),
      oeeTargetPct: Number(form.oeeTargetPct) || 0,
      machineCodes: form.machineCodes,
      isActive: form.isActive,
    }
    
    try {
      if (editing) {
        await api.updateEngWorkCentre(editing.uid, patch)
        toast.success('Work centre updated', `${patch.code} saved.`)
      } else {
        await api.createEngWorkCentre(patch)
        toast.success('Work centre created', `${patch.code} is available to routings.`)
      }
      setFormOpen(false)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to save work centre')
    }
  }

  async function toggleActive(w: EngWorkCentre) {
    try {
      await api.updateEngWorkCentre(w.uid, { ...w, isActive: !w.isActive })
      toast.success(w.isActive ? 'Deactivated' : 'Activated', `${w.code} is now ${w.isActive ? 'inactive' : 'active'}.`)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to update status')
    }
  }

  async function doDelete() {
    if (!confirmDelete) return
    try {
      await api.deleteEngWorkCentre(confirmDelete.uid)
      toast.success('Deleted', `${confirmDelete.code} was soft-deleted; history is retained.`)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to delete work centre')
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Work centres"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Work centres' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New work centre
          </Button>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(w) => w.uid}
        searchPlaceholder="Search code, name or plant…"
        isLoading={isLoading}
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'work-centres', 'Work centres', columnsFromTable(columns), rows)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={openEdit}
        emptyTitle="No work centres"
        emptyDescription="A routing operation cannot be costed until its work centre exists."
        rowActions={(w) => (
          <>
            <MenuItem label="Edit" onClick={() => openEdit(w)} />
            <MenuItem
              label={w.isActive ? 'Deactivate' : 'Activate'}
              onClick={() => toggleActive(w)}
            />
            <MenuItem
              label={usageOf(w.code) ? `Delete — blocked (${usageOf(w.code)} operations)` : 'Delete'}
              icon={<Trash2 />}
              danger
              separatorBefore
              disabled={usageOf(w.code) > 0}
              onClick={() => setConfirmDelete(w)}
            />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'New work centre'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : 'Create work centre'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input maxLength={255} label="Code" required disabled value={form.code} hint="Auto-generated" onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input maxLength={255} label="Name" required value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Plant" value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })} options={PLANTS.map((p) => ({ value: p, label: p }))} />
          <Select label="Shift pattern" value={form.shiftPattern} onChange={(e) => setForm({ ...form, shiftPattern: e.target.value })} options={SHIFTS.map((s) => ({ value: s, label: s }))} />
          <Input maxLength={255}
            label="Machine rate (₹ per hour)"
            type="number"
            required
            value={form.machineRatePerHour}
            error={errors.machineRatePerHour}
            hint="Depreciation, power and machine consumables."
            onChange={(e) => setForm({ ...form, machineRatePerHour: e.target.value })}
          />
          <Input maxLength={255}
            label="Labour rate (₹ per hour, per operator)"
            type="number"
            required
            value={form.labourRatePerHour}
            error={errors.labourRatePerHour}
            hint="Fully loaded — wages, PF, ESI and welfare."
            onChange={(e) => setForm({ ...form, labourRatePerHour: e.target.value })}
          />
          <Input maxLength={255} label="Overhead recovery (%)" type="number" value={form.overheadPct} hint="Applied on labour plus machine cost." onChange={(e) => setForm({ ...form, overheadPct: e.target.value })} />
          <Input maxLength={255} label="Available hours per day" type="number" required value={form.hoursPerDay} error={errors.hoursPerDay} onChange={(e) => setForm({ ...form, hoursPerDay: e.target.value })} />
          <Input maxLength={255} label="OEE target (%)" type="number" value={form.oeeTargetPct} onChange={(e) => setForm({ ...form, oeeTargetPct: e.target.value })} />
          <div className="flex items-end pb-1">
            <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Active" />
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Machines in this centre</p>
          <div className="flex flex-wrap gap-2">
            {machines.map((m) => {
              const on = form.machineCodes.includes(m.code)
              return (
                <button
                  key={m.uid}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      machineCodes: on ? form.machineCodes.filter((c) => c !== m.code) : [...form.machineCodes, m.code],
                    })
                  }
                  className={
                    on
                      ? 'rounded-full border border-brand-500 bg-brand-500/10 px-2.5 py-1 text-2xs font-medium text-brand-600'
                      : 'rounded-full border border-border px-2.5 py-1 text-2xs text-fg-muted hover:border-border-strong hover:text-fg'
                  }
                >
                  {m.code} · {m.name}
                </button>
              )
            })}
          </div>
        </div>

        <Alert tone="info" className="mt-4">
          One hour at this centre costs{' '}
          <span className="font-semibold text-fg">₹{formatAmount(effectiveRate, 2)}</span> with one operator — machine
          ₹{formatAmount(machineRate, 0)} plus labour ₹{formatAmount(labourRate, 0)}, then {overhead}% overhead. Routing
          costing multiplies this by the operation time.
        </Alert>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete work centre"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.code} will be marked deleted, not physically removed. No live routing points at it.
        </p>
      </Modal>
    </div>
  )
}
