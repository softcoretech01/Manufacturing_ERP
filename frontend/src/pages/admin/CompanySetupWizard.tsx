import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, Factory, GitBranch, Plus, Warehouse as WarehouseIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Misc'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Switch } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { ProblemError } from '@/api/client'
import {
  useCompanies,
  useUpdateCompany,
  useBranches,
  useCreateBranch,
  usePlants,
  useCreatePlant,
  useWarehouses,
  useCreateWarehouse,
} from '@/hooks/useOrganisation'

/**
 * Guided company setup: walk through Company → Branch → Plant → Warehouse, each
 * step saving to the live backend (codes are auto-generated, 4-digit). Every
 * entity is created through the same services the individual master screens use.
 */

const STATES = [
  { code: '33', name: 'Tamil Nadu' },
  { code: '29', name: 'Karnataka' },
  { code: '27', name: 'Maharashtra' },
  { code: '24', name: 'Gujarat' },
  { code: '07', name: 'Delhi' },
  { code: '36', name: 'Telangana' },
]
const BRANCH_TYPES = [
  { value: 'HEAD_OFFICE', label: 'Head office' },
  { value: 'FACTORY', label: 'Factory' },
  { value: 'DEPOT', label: 'Depot' },
  { value: 'SALES_OFFICE', label: 'Sales office' },
  { value: 'WAREHOUSE_ONLY', label: 'Warehouse only' },
]
const WAREHOUSE_TYPES = [
  { value: 'RAW_MATERIAL', label: 'Raw material' },
  { value: 'WIP', label: 'Work in progress' },
  { value: 'FINISHED_GOODS', label: 'Finished goods' },
  { value: 'PACKING_MATERIAL', label: 'Packing material' },
  { value: 'QUARANTINE', label: 'Quarantine' },
  { value: 'SCRAP', label: 'Scrap' },
]
const VALUATION_METHODS = [
  { value: 'WEIGHTED_AVG', label: 'Weighted average' },
  { value: 'FIFO', label: 'FIFO' },
  { value: 'STANDARD', label: 'Standard cost' },
]

const STEPS = [
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'branch', label: 'Branches', icon: GitBranch },
  { key: 'plant', label: 'Plants', icon: Factory },
  { key: 'warehouse', label: 'Warehouses', icon: WarehouseIcon },
  { key: 'done', label: 'Done', icon: Check },
]

function problemMessage(e: unknown, fallback: string): string {
  return e instanceof ProblemError ? e.problem.detail || e.problem.title : fallback
}

interface Built {
  uid: string
  code: string
  name: string
  meta?: string
}

function mergeByUid<T extends { uid: string }>(fetched: T[], added: T[]): T[] {
  const seen = new Set(fetched.map((x) => x.uid))
  return [...fetched, ...added.filter((x) => !seen.has(x.uid))]
}

export function CompanySetupWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  // Locally track what was created this session so the lists update instantly,
  // independent of the list query refetch (which can momentarily miss a
  // just-committed row).
  const [added, setAdded] = useState<{ branches: Built[]; plants: Built[]; warehouses: Built[] }>({
    branches: [],
    plants: [],
    warehouses: [],
  })

  useEffect(() => {
    if (open) {
      setStep(0)
      setAdded({ branches: [], plants: [], warehouses: [] })
    }
  }, [open])

  const fetchedBranches = (useBranches({ page_size: 200 }).data?.data ?? [])
    .filter((b) => b.is_active)
    .map((b) => ({ uid: b.uid, code: b.code, name: b.name, meta: b.branch_type.replace(/_/g, ' ').toLowerCase() }))
  const fetchedPlants = (usePlants({ page_size: 200 }).data?.data ?? [])
    .filter((p) => p.is_active)
    .map((p) => ({ uid: p.uid, code: p.code, name: p.name }))
  const fetchedWarehouses = (useWarehouses({ page_size: 200 }).data?.data ?? []).map((w) => ({
    uid: w.uid,
    code: w.code,
    name: w.name,
    meta: w.warehouse_type.replace(/_/g, ' ').toLowerCase(),
  }))

  const branches = mergeByUid(fetchedBranches, added.branches)
  const plants = mergeByUid(fetchedPlants, added.plants)
  const warehouses = mergeByUid(fetchedWarehouses, added.warehouses)

  const onAdd = (kind: 'branches' | 'plants' | 'warehouses', item: Built) =>
    setAdded((a) => ({ ...a, [kind]: [...a[kind], item] }))

  const canNext =
    (step === 1 && branches.length > 0) || (step === 2 && plants.length > 0) || step === 0 || step === 3

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Company setup wizard"
      description="Stand up your organisation structure step by step — everything is saved to the backend."
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-2xs text-fg-subtle">Step {step + 1} of {STEPS.length}</span>
          <div className="flex gap-2">
            {step > 0 && step < STEPS.length - 1 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>Back</Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                {step === 0 ? 'Continue' : 'Next'}
              </Button>
            ) : (
              <Button variant="primary" onClick={onClose}>Finish</Button>
            )}
          </div>
        </div>
      }
    >
      {/* Stepper */}
      <ol className="mb-5 flex items-center gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const state = i < step ? 'done' : i === step ? 'active' : 'todo'
          return (
            <li key={s.key} className="flex flex-1 items-center gap-1.5">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs',
                  state === 'done' && 'border-brand-600 bg-brand-600 text-white',
                  state === 'active' && 'border-brand-600 text-brand-600',
                  state === 'todo' && 'border-border text-fg-subtle',
                )}
              >
                {state === 'done' ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </div>
              <span className={cn('truncate text-xs', i === step ? 'font-medium text-fg' : 'text-fg-subtle')}>{s.label}</span>
              {i < STEPS.length - 1 && <div className="mx-1 h-px flex-1 bg-border" />}
            </li>
          )
        })}
      </ol>

      {step === 0 && <CompanyStep />}
      {step === 1 && <BranchStep branches={branches} onAdd={(b) => onAdd('branches', b)} />}
      {step === 2 && <PlantStep branches={branches} plants={plants} onAdd={(p) => onAdd('plants', p)} />}
      {step === 3 && (
        <WarehouseStep branches={branches} plants={plants} warehouses={warehouses} onAdd={(w) => onAdd('warehouses', w)} />
      )}
      {step === 4 && (
        <DoneStep counts={{ branches: branches.length, plants: plants.length, warehouses: warehouses.length }} />
      )}
    </Modal>
  )
}

/* ─────────────────────────── Step 1: Company ─────────────────────────── */
function CompanyStep() {
  const toast = useToast()
  const { data, isLoading } = useCompanies({ page_size: 5 })
  const company = data?.data?.[0]
  const updateCompany = useUpdateCompany()

  const [form, setForm] = useState({ code: '', legal_name: '', trade_name: '', pan: '', gst_state_code: '33', phone: '', email: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))

  useEffect(() => {
    if (company) {
      setForm((f) => ({
        ...f,
        code: company.code,
        legal_name: company.legal_name,
        trade_name: company.trade_name ?? '',
        pan: company.pan ?? '',
        gst_state_code: company.gst_state_code ?? '33',
      }))
    }
  }, [company])

  function save() {
    if (!company) return
    setErrors({})
    updateCompany.mutate(
      {
        uid: company.uid,
        body: {
          version: company.version,
          code: form.code.trim() || undefined,
          legal_name: form.legal_name.trim(),
          trade_name: form.trade_name.trim() || null,
          pan: form.pan.trim().toUpperCase() || null,
          gst_state_code: form.gst_state_code,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
        },
      },
      {
        onSuccess: () => toast.success('Company saved', `${form.legal_name} updated.`),
        onError: (e) => {
          if (e instanceof ProblemError) {
            const fe: Record<string, string> = {}
            for (const x of e.problem.errors ?? []) fe[x.field] = x.message
            setErrors(fe)
          }
          toast.error('Save failed', problemMessage(e, 'Could not save the company.'))
        },
      },
    )
  }

  if (isLoading) return <p className="py-8 text-center text-sm text-fg-subtle">Loading company…</p>
  if (!company) return <Alert tone="danger" title="No company found">Sign in first, then reopen the wizard.</Alert>

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Your company already exists. Confirm its details here — you'll add branches, plants and warehouses in the next steps.
      </Alert>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Input label="Company code" required value={form.code} error={errors.code} maxLength={20}
          onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
        <Input label="Legal name" required value={form.legal_name} error={errors.legal_name} maxLength={200}
          onChange={(e) => set({ legal_name: e.target.value })} />
        <Input label="Trade name" value={form.trade_name} maxLength={200}
          onChange={(e) => set({ trade_name: e.target.value })} />
        <Input label="PAN" value={form.pan} error={errors.pan} maxLength={10} placeholder="AABCS1429B"
          onChange={(e) => set({ pan: e.target.value.toUpperCase() })} />
        <Select label="State (GST code)" value={form.gst_state_code}
          onChange={(e) => set({ gst_state_code: e.target.value })}
          options={STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} />
        <Input label="Phone" value={form.phone} maxLength={30} onChange={(e) => set({ phone: e.target.value })} />
        <Input label="Email" type="email" value={form.email} error={errors.email} maxLength={150}
          onChange={(e) => set({ email: e.target.value })} />
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={save} loading={updateCompany.isPending}>Save company details</Button>
      </div>
    </div>
  )
}

/* ─────────────────────────── Step 2: Branch ─────────────────────────── */
function BranchStep({ branches, onAdd }: { branches: Built[]; onAdd: (b: Built) => void }) {
  const toast = useToast()
  const createBranch = useCreateBranch()
  const [form, setForm] = useState({ code: '', name: '', branch_type: 'FACTORY', gst_state_code: '33' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function add() {
    setErrors({})
    if (!form.name.trim()) {
      setErrors({ name: 'Enter a branch name.' })
      return
    }
    createBranch.mutate(
      { code: form.code.trim() || undefined, name: form.name.trim(), branch_type: form.branch_type, gst_state_code: form.gst_state_code, has_separate_gstin: false },
      {
        onSuccess: (created) => {
          toast.success('Branch added', `${created.code} — ${created.name}`)
          onAdd({ uid: created.uid, code: created.code, name: created.name, meta: created.branch_type.replace(/_/g, ' ').toLowerCase() })
          setForm({ code: '', name: '', branch_type: form.branch_type, gst_state_code: form.gst_state_code })
        },
        onError: (e) => toast.error('Could not add branch', problemMessage(e, 'Failed.')),
      },
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">Add one or more branches. A factory branch holds plants; a head office is your registered address.</p>
      <div className="grid items-end gap-3 sm:grid-cols-[100px_1fr_150px_150px_auto]">
        <Input label="Code" value={form.code} maxLength={20}
          placeholder="auto…" onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
        <Input label="Branch name" value={form.name} error={errors.name} maxLength={150}
          placeholder="Sriperumbudur Factory" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Select label="Type" value={form.branch_type} onChange={(e) => setForm((f) => ({ ...f, branch_type: e.target.value }))} options={BRANCH_TYPES} />
        <Select label="State" value={form.gst_state_code} onChange={(e) => setForm((f) => ({ ...f, gst_state_code: e.target.value }))}
          options={STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} />
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={add} loading={createBranch.isPending}>Add</Button>
      </div>
      <BuiltList title="Branches" empty="No branches yet — add your first above." items={branches} />
    </div>
  )
}

/* ─────────────────────────── Step 3: Plant ─────────────────────────── */
function PlantStep({ branches, plants, onAdd }: { branches: Built[]; plants: Built[]; onAdd: (p: Built) => void }) {
  const toast = useToast()
  const createPlant = useCreatePlant()
  const [form, setForm] = useState({ branch_uid: '', name: '', capacity: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!form.branch_uid && branches[0]) setForm((f) => ({ ...f, branch_uid: branches[0].uid }))
  }, [branches, form.branch_uid])

  function add() {
    setErrors({})
    if (!form.branch_uid) return setErrors({ branch_uid: 'Select a branch.' })
    if (!form.name.trim()) return setErrors({ name: 'Enter a plant name.' })
    createPlant.mutate(
      {
        branch_uid: form.branch_uid,
        name: form.name.trim(),
        installed_capacity_per_day: form.capacity.trim() ? Number(form.capacity) : null,
      },
      {
        onSuccess: (created) => {
          toast.success('Plant added', `${created.code} — ${created.name}`)
          onAdd({ uid: created.uid, code: created.code, name: created.name })
          setForm((f) => ({ ...f, name: '', capacity: '' }))
        },
        onError: (e) => toast.error('Could not add plant', problemMessage(e, 'Failed.')),
      },
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">Add plants under a branch. Each plant gets an auto-generated code.</p>
      <div className="grid items-end gap-3 sm:grid-cols-[200px_1fr_150px_auto]">
        <Select label="Branch" value={form.branch_uid} error={errors.branch_uid}
          onChange={(e) => setForm((f) => ({ ...f, branch_uid: e.target.value }))}
          options={[{ value: '', label: 'Select…', disabled: true }, ...branches.map((b) => ({ value: b.uid, label: `${b.code} — ${b.name}` }))]} />
        <Input label="Plant name" value={form.name} error={errors.name} maxLength={150}
          placeholder="Plant 1 — Sriperumbudur" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input label="Capacity/day" type="number" min={0} value={form.capacity} placeholder="25000"
          onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={add} loading={createPlant.isPending}>Add</Button>
      </div>
      <BuiltList title="Plants" empty="No plants yet." items={plants} />
    </div>
  )
}

/* ─────────────────────────── Step 4: Warehouse ─────────────────────────── */
function WarehouseStep({
  branches,
  plants,
  warehouses,
  onAdd,
}: {
  branches: Built[]
  plants: Built[]
  warehouses: Built[]
  onAdd: (w: Built) => void
}) {
  const toast = useToast()
  const createWh = useCreateWarehouse()
  const [form, setForm] = useState({ branch_uid: '', plant_uid: '', name: '', warehouse_type: 'RAW_MATERIAL', valuation_method: 'WEIGHTED_AVG', is_batch_mandatory: false })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))

  useEffect(() => {
    if (!form.branch_uid && branches[0]) setForm((f) => ({ ...f, branch_uid: branches[0].uid }))
  }, [branches, form.branch_uid])

  function add() {
    setErrors({})
    if (!form.branch_uid) return setErrors({ branch_uid: 'Select a branch.' })
    if (!form.name.trim()) return setErrors({ name: 'Enter a warehouse name.' })
    createWh.mutate(
      {
        branch_uid: form.branch_uid,
        plant_uid: form.plant_uid || null,
        name: form.name.trim(),
        warehouse_type: form.warehouse_type,
        valuation_method: form.valuation_method,
        is_batch_mandatory: form.is_batch_mandatory,
      },
      {
        onSuccess: (created) => {
          toast.success('Warehouse added', `${created.code} — ${created.name}`)
          onAdd({ uid: created.uid, code: created.code, name: created.name, meta: created.warehouse_type.replace(/_/g, ' ').toLowerCase() })
          set({ name: '' })
        },
        onError: (e) => toast.error('Could not add warehouse', problemMessage(e, 'Failed.')),
      },
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">Add warehouses under a branch (optionally a plant). Set the type and stock policy.</p>
      <div className="grid items-end gap-3 sm:grid-cols-2">
        <Select label="Branch" value={form.branch_uid} error={errors.branch_uid}
          onChange={(e) => set({ branch_uid: e.target.value })}
          options={[{ value: '', label: 'Select…', disabled: true }, ...branches.map((b) => ({ value: b.uid, label: `${b.code} — ${b.name}` }))]} />
        <Select label="Plant (optional)" value={form.plant_uid} onChange={(e) => set({ plant_uid: e.target.value })}
          options={[{ value: '', label: '— none —' }, ...plants.map((p) => ({ value: p.uid, label: `${p.code} — ${p.name}` }))]} />
        <Input label="Warehouse name" value={form.name} error={errors.name} maxLength={150}
          placeholder="Raw Material Store" onChange={(e) => set({ name: e.target.value })} />
        <Select label="Type" value={form.warehouse_type} onChange={(e) => set({ warehouse_type: e.target.value })} options={WAREHOUSE_TYPES} />
        <Select label="Valuation" value={form.valuation_method} onChange={(e) => set({ valuation_method: e.target.value })} options={VALUATION_METHODS} />
        <div className="flex items-end pb-2">
          <Switch checked={form.is_batch_mandatory} onChange={(v) => set({ is_batch_mandatory: v })} label="Batch mandatory" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={add} loading={createWh.isPending}>Add warehouse</Button>
      </div>
      <BuiltList title="Warehouses" empty="No warehouses yet." items={warehouses} />
    </div>
  )
}

/* ─────────────────────────── Step 5: Done ─────────────────────────── */
function DoneStep({ counts }: { counts: { branches: number; plants: number; warehouses: number } }) {
  const cards = useMemo(
    () => [
      { label: 'Branches', value: counts.branches, icon: GitBranch },
      { label: 'Plants', value: counts.plants, icon: Factory },
      { label: 'Warehouses', value: counts.warehouses, icon: WarehouseIcon },
    ],
    [counts],
  )
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-fg">Structure ready</h3>
          <p className="text-sm text-fg-muted">Your organisation skeleton is set up and saved.</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className="rounded-xl border border-border bg-surface-2 p-4 text-center">
              <Icon className="mx-auto mb-1.5 h-5 w-5 text-brand-600" />
              <p className="text-2xl font-semibold tabular text-fg">{c.value}</p>
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">{c.label}</p>
            </div>
          )
        })}
      </div>
      <Alert tone="info">You can refine any of these from the Branches, Plants, Warehouses, Departments and Cost centres screens.</Alert>
    </div>
  )
}

/* ─────────────────────────── shared: built list ─────────────────────────── */
function BuiltList({ title, empty, items }: { title: string; empty: string; items: { code: string; name: string; meta?: string }[] }) {
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-fg">{title}</span>
        <Badge tone="neutral" size="sm" dot={false}>{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-fg-subtle">{empty}</p>
      ) : (
        <ul className="max-h-52 divide-y divide-border overflow-y-auto">
          {items.map((it) => (
            <li key={it.code} className="flex items-center gap-2 px-3 py-2">
              <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{it.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{it.name}</span>
              {it.meta && <span className="text-2xs text-fg-subtle">{it.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
