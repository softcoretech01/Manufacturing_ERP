import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatAmount } from '@/lib/format'
import { api } from '@/lib/api'
import type { EngWorkCentre, Operation, Routing } from '@/types/engineering'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

const SKILLS = [
  'Machine Operator',
  'Press Operator',
  'Certified Welder',
  'Coating Operator',
  'Assembly Operator',
  'Packing Operator',
  'Skilled Operator',
  'QC Inspector',
]

interface FormState {
  code: string
  name: string
  defaultWorkCentre: string
  setupMinutes: string
  cycleSeconds: string
  operators: string
  skill: string
  qcCheckpoint: boolean
  instructions: string
  isActive: boolean
}

const emptyForm: FormState = {
  code: '',
  name: '',
  defaultWorkCentre: '',
  setupMinutes: '',
  cycleSeconds: '',
  operators: '1',
  skill: SKILLS[0],
  qcCheckpoint: false,
  instructions: '',
  isActive: true,
}

export function OperationsPage() {
  const toast = useToast()
  
  const [rows, setRows] = useState<Operation[]>([])
  const [workCentres, setWorkCentres] = useState<EngWorkCentre[]>([])
  const [routings, setRoutings] = useState<Routing[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Operation | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<Operation | null>(null)

  async function loadData() {
    try {
      const [ops, wcs, rts] = await Promise.all([
        api.getEngOperations(),
        fetch(`${API_URL}/engineering/routings/workcentres`).then(res => res.json()).catch(() => []),
        api.getRoutings().catch(() => [])
      ])
      setRows(ops)
      setWorkCentres(wcs)
      setRoutings(rts)
    } catch (err) {
      toast.error('Error', 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const usageOf = (code: string) => routings.reduce((n, r) => n + r.operations.filter((o) => o.operationCode === code).length, 0)

  const previewCost = (o: { defaultWorkCentre: string; setupMinutes: number; cycleSeconds: number; operators: number }, lot = 500) => {
    const wc = workCentres.find((w) => w.code === o.defaultWorkCentre)
    if (!wc) return null
    const setupHours = o.setupMinutes / 60
    const runHours = o.cycleSeconds / 3600
    const labour = (setupHours * wc.labourRatePerHour * o.operators) / lot + runHours * wc.labourRatePerHour * o.operators
    const machine = (setupHours * wc.machineRatePerHour) / lot + runHours * wc.machineRatePerHour
    return (labour + machine) * (1 + wc.overheadPct / 100)
  }

  const columns: Column<Operation>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '6.5rem', render: (o) => <span className="font-mono text-xs font-medium text-brand-600">{o.code}</span> },
    { key: 'name', header: 'Operation', sortable: true },
    { key: 'defaultWorkCentre', header: 'Work centre', sortable: true, width: '7rem', render: (o) => <span className="font-mono text-2xs text-fg-muted">{o.defaultWorkCentre}</span> },
    { key: 'setupMinutes', header: 'Setup', align: 'right', sortable: true, width: '6rem', accessor: (o) => o.setupMinutes, render: (o) => `${o.setupMinutes} min` },
    { key: 'cycleSeconds', header: 'Cycle', align: 'right', sortable: true, width: '6rem', accessor: (o) => o.cycleSeconds, render: (o) => `${o.cycleSeconds} s` },
    { key: 'operators', header: 'Operators', align: 'right', width: '6rem', accessor: (o) => o.operators },
    { key: 'skill', header: 'Skill', sortable: true, width: '10rem', render: (o) => <span className="text-xs text-fg-muted">{o.skill}</span> },
    {
      key: 'cost',
      header: 'Cost / piece',
      align: 'right',
      width: '7rem',
      accessor: (o) => previewCost(o) ?? 0,
      render: (o) => {
        const c = previewCost(o)
        return c === null ? <span className="text-2xs text-danger">no centre</span> : <span className="tabular">₹{formatAmount(c, 2)}</span>
      },
    },
    { key: 'qcCheckpoint', header: 'QC', width: '5rem', accessor: (o) => (o.qcCheckpoint ? 'Yes' : 'No'), render: (o) => (o.qcCheckpoint ? <Badge tone="progress" size="sm">Check</Badge> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'usage', header: 'Used by', align: 'right', width: '6rem', accessor: (o) => usageOf(o.code), render: (o) => <span className="text-xs text-fg-muted tabular">{usageOf(o.code)}</span> },
    { key: 'isActive', header: 'Status', width: '6.5rem', accessor: (o) => (o.isActive ? 'Active' : 'Inactive'), render: (o) => <Badge tone={o.isActive ? 'success' : 'neutral'} size="sm">{o.isActive ? 'Active' : 'Inactive'}</Badge> },
  ]

  async function openCreate() {
    setEditing(null)
    setErrors({})
    try {
      const res = await api.getEngOperationsNextCode()
      setForm({ ...emptyForm, code: res.nextCode, defaultWorkCentre: workCentres[0]?.code ?? '' })
      setFormOpen(true)
    } catch (err) {
      toast.error('Error', 'Failed to generate code')
    }
  }

  function openEdit(o: Operation) {
    setEditing(o)
    setForm({
      code: o.code,
      name: o.name,
      defaultWorkCentre: o.defaultWorkCentre,
      setupMinutes: String(o.setupMinutes),
      cycleSeconds: String(o.cycleSeconds),
      operators: String(o.operators),
      skill: o.skill,
      qcCheckpoint: o.qcCheckpoint,
      instructions: o.instructions,
      isActive: o.isActive,
    })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'A name is required.'
    if (!form.defaultWorkCentre) e.defaultWorkCentre = 'Choose the work centre this operation runs at.'
    if (!(Number(form.cycleSeconds) > 0)) e.cycleSeconds = 'Cycle time must be greater than zero.'
    if (!(Number(form.operators) > 0)) e.operators = 'At least one operator is required.'
    if (Number(form.setupMinutes) < 0) e.setupMinutes = 'Setup time cannot be negative.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    const patch = {
      code: form.code,
      name: form.name.trim(),
      defaultWorkCentre: form.defaultWorkCentre,
      setupMinutes: Number(form.setupMinutes) || 0,
      cycleSeconds: Number(form.cycleSeconds),
      operators: Number(form.operators),
      skill: form.skill,
      qcCheckpoint: form.qcCheckpoint,
      instructions: form.instructions.trim(),
      isActive: form.isActive,
    }
    try {
      if (editing) {
        await api.updateEngOperation(editing.uid, patch)
        toast.success('Operation updated', `${patch.code} saved.`)
      } else {
        await api.createEngOperation(patch)
        toast.success('Operation created', `${patch.code} can now be added to a routing.`)
      }
      setFormOpen(false)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to save operation')
    }
  }
  
  async function toggleActive(o: Operation) {
    try {
      await api.updateEngOperation(o.uid, { ...o, isActive: !o.isActive })
      toast.success(o.isActive ? 'Deactivated' : 'Activated', `${o.code} is now ${o.isActive ? 'inactive' : 'active'}.`)
      loadData()
    } catch (err) {
      toast.error('Error', 'Failed to update status')
    }
  }

  const draftCost = previewCost({
    defaultWorkCentre: form.defaultWorkCentre,
    setupMinutes: Number(form.setupMinutes) || 0,
    cycleSeconds: Number(form.cycleSeconds) || 0,
    operators: Number(form.operators) || 1,
  })

  return (
    <div>
      <PageHeader
        title="Standard operations"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Engineering', to: '/engineering' }, { label: 'Operations' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New operation
          </Button>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(o) => o.uid}
        searchPlaceholder="Search code, name, work centre or skill…"
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'operations', 'Standard operations', columnsFromTable(columns), rows)
          toast.success('Export ready', `${n} rows written.`)
        }}
        onRowClick={openEdit}
        emptyTitle="No operations"
        emptyDescription="Routings are assembled from this library."
        isLoading={isLoading}
        rowActions={(o) => (
          <>
            <MenuItem label="Edit" onClick={() => openEdit(o)} />
            <MenuItem
              label={o.isActive ? 'Deactivate' : 'Activate'}
              onClick={() => toggleActive(o)}
            />
            <MenuItem
              label={usageOf(o.code) ? `Delete — blocked (${usageOf(o.code)} routings)` : 'Delete'}
              icon={<Trash2 />}
              danger
              separatorBefore
              disabled={usageOf(o.code) > 0}
              onClick={() => setConfirmDelete(o)}
            />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'New standard operation'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : 'Create operation'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input maxLength={255} label="Code" required disabled value={form.code} hint="Auto-generated" onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input maxLength={255} label="Name" required value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select
            label="Work centre"
            required
            value={form.defaultWorkCentre}
            error={errors.defaultWorkCentre}
            onChange={(e) => setForm({ ...form, defaultWorkCentre: e.target.value })}
            options={[{ value: '', label: 'Select a work centre…' }, ...workCentres.filter((w) => w.isActive || w.isActive === undefined).map((w) => ({ value: w.code, label: `${w.code} — ${w.name}` }))]}
          />
          <Select label="Skill required" value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} options={SKILLS.map((s) => ({ value: s, label: s }))} />
          <Input maxLength={255} label="Setup time (minutes per lot)" type="number" value={form.setupMinutes} error={errors.setupMinutes} onChange={(e) => setForm({ ...form, setupMinutes: e.target.value })} />
          <Input maxLength={255} label="Cycle time (seconds per piece)" type="number" required value={form.cycleSeconds} error={errors.cycleSeconds} onChange={(e) => setForm({ ...form, cycleSeconds: e.target.value })} />
          <Input maxLength={255} label="Operators" type="number" required value={form.operators} error={errors.operators} onChange={(e) => setForm({ ...form, operators: e.target.value })} />
          <div className="flex items-end gap-4 pb-1">
            <Switch checked={form.qcCheckpoint} onChange={(v) => setForm({ ...form, qcCheckpoint: v })} label="QC checkpoint" />
            <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Active" />
          </div>
          <Textarea maxLength={1000}
            label="Work instruction"
            containerClassName="sm:col-span-2"
            rows={3}
            value={form.instructions}
            hint="Printed on the shop-floor traveller for this operation."
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </div>

        {draftCost !== null && (
          <Alert tone="info" className="mt-4">
            At a lot of 500 this operation adds{' '}
            <span className="font-semibold text-fg">₹{formatAmount(draftCost, 2)}</span> to a piece — setup amortised over
            the lot, plus run time, plus the centre's overhead.
            {form.qcCheckpoint && ' An in-process inspection is raised automatically at this step.'}
          </Alert>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete operation"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmDelete) {
                  try {
                    await api.deleteEngOperation(confirmDelete.uid)
                    toast.success('Deleted', `${confirmDelete.code} was soft-deleted.`)
                    loadData()
                  } catch (err) {
                    toast.error('Error', 'Failed to delete')
                  }
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">{confirmDelete?.code} will be marked deleted, not physically removed.</p>
      </Modal>
    </div>
  )
}
