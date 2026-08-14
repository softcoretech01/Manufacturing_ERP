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

  return (
    <div>
      <PageHeader
        title="Plants"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Plants' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate} disabled={!branches.length}>Add plant</Button>}
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
