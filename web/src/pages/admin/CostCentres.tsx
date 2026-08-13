import { useState } from 'react'
import { Pencil, Plus, Power, RotateCcw } from 'lucide-react'
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
import { costCentres as ccApi, type CostCentre } from '@/api/organisation'
import {
  useCostCentres,
  useCreateCostCentre,
  useUpdateCostCentre,
  useDeactivateCostCentre,
  useRestoreCostCentre,
} from '@/hooks/useOrganisation'
import { useSession } from '@/api/session'

/** Wired to the live FastAPI backend (Organisation module). */

const COST_CENTRE_TYPES = [
  { value: 'PRODUCTION', label: 'Production' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SALES', label: 'Sales' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'UTILITY', label: 'Utility' },
]

interface FormState {
  code: string
  name: string
  cost_centre_type: string
  parent_uid: string
  is_postable: boolean
}

const BLANK: FormState = { code: '', name: '', cost_centre_type: 'PRODUCTION', parent_uid: '', is_postable: true }

export function CostCentresPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)

  const { data, isLoading, error, refetch } = useCostCentres({ page_size: 200 })
  const createCc = useCreateCostCentre()
  const updateCc = useUpdateCostCentre()
  const deactivateCc = useDeactivateCostCentre()
  const restoreCc = useRestoreCostCentre()

  const rows = data?.data ?? []

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CostCentre | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  function openCreate() {
    setEditing(null)
    setForm(BLANK)
    setErrors({})
    setFormOpen(true)
    ccApi.nextCode().then((code) => setForm((f) => ({ ...f, code }))).catch(() => {})
  }

  function openEdit(c: CostCentre) {
    setEditing(c)
    setForm({ code: c.code, name: c.name, cost_centre_type: c.cost_centre_type, parent_uid: c.parent_uid ?? '', is_postable: c.is_postable })
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
    if (editing) {
      updateCc.mutate(
        { uid: editing.uid, body: { version: editing.version, name: form.name.trim(), cost_centre_type: form.cost_centre_type, is_postable: form.is_postable, parent_uid: form.parent_uid || null } },
        {
          onSuccess: () => {
            toast.success('Cost centre updated', `${editing.code} saved.`)
            setFormOpen(false)
          },
          onError: (e) => handleError(e, 'Update failed'),
        },
      )
    } else {
      createCc.mutate(
        { name: form.name.trim(), cost_centre_type: form.cost_centre_type, parent_uid: form.parent_uid || null, is_postable: form.is_postable },
        {
          onSuccess: (created) => {
            toast.success('Cost centre created', `${created.code} added.`)
            setFormOpen(false)
          },
          onError: (e) => handleError(e, 'Create failed'),
        },
      )
    }
  }

  function toggleActive(c: CostCentre) {
    if (c.is_active) {
      deactivateCc.mutate(
        { uid: c.uid, body: { version: c.version } },
        {
          onSuccess: () => toast.success('Cost centre deactivated', `${c.name} is now inactive.`),
          onError: (e) => handleError(e, 'Deactivate failed'),
        },
      )
    } else {
      restoreCc.mutate(c.uid, {
        onSuccess: () => toast.success('Cost centre restored', `${c.name} is active again.`),
        onError: (e) => handleError(e, 'Restore failed'),
      })
    }
  }

  const columns: Column<CostCentre>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '90px', render: (c) => <span className="font-mono text-xs font-medium">{c.code}</span> },
    { key: 'name', header: 'Cost centre', sortable: true, render: (c) => <span className="font-medium text-fg">{c.name}</span> },
    { key: 'parent_code', header: 'Parent', sortable: true, width: '160px', accessor: (c) => c.parent_code ?? '', render: (c) => c.parent_code ? <span className="text-xs text-fg-muted"><span className="font-mono">{c.parent_code}</span> · {c.parent_name}</span> : <span className="text-xs text-fg-subtle">top level</span> },
    { key: 'cost_centre_type', header: 'Type', sortable: true, width: '150px', render: (c) => <Badge tone="neutral" size="sm" dot={false}>{c.cost_centre_type.replace(/_/g, ' ').toLowerCase()}</Badge> },
    { key: 'is_postable', header: 'Postable', align: 'center', width: '90px', accessor: (c) => (c.is_postable ? 1 : 0), render: (c) => (c.is_postable ? <Badge tone="brand" size="sm" dot={false}>yes</Badge> : <span className="text-fg-subtle">group</span>) },
    {
      key: 'is_active',
      header: 'Status',
      width: '100px',
      accessor: (c) => (c.is_active ? 'Active' : 'Inactive'),
      render: (c) => <Badge tone={c.is_active ? 'success' : 'neutral'} size="sm">{c.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'cost-centres', 'Cost centres', columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows saved as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const saving = createCc.isPending || updateCc.isPending

  return (
    <div>
      <PageHeader
        title="Cost centres"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Cost centres' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>Add cost centre</Button>}
      />

      <HowItWorks>
        Live data from the Organisation module. Cost centres capture where cost is incurred; the code is
        auto-generated. A non-postable cost centre is a rollup group — postings are only allowed on postable ones.
      </HowItWorks>

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load cost centres">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.uid}
        loading={isLoading}
        searchPlaceholder="Cost centre name or code…"
        onExport={doExport}
        onRowClick={openEdit}
        emptyTitle="No cost centres yet"
        emptyDescription="Add your first cost centre."
        emptyAction={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>Add cost centre</Button>}
        rowActions={(c) => (
          <>
            <MenuItem label="Edit" icon={<Pencil />} onClick={() => openEdit(c)} />
            <MenuItem label={c.is_active ? 'Deactivate' : 'Restore'} icon={c.is_active ? <Power /> : <RotateCcw />} separatorBefore onClick={() => toggleActive(c)} />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Add cost centre'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>{editing ? 'Save changes' : 'Add cost centre'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Cost centre code" value={form.code || 'auto…'} readOnly className="bg-surface-2"
            hint="Auto-generated · not editable" onChange={() => {}} />
          <Select label="Type" value={form.cost_centre_type} error={errors.cost_centre_type}
            onChange={(e) => set({ cost_centre_type: e.target.value })} options={COST_CENTRE_TYPES} />
          <Input label="Cost centre name" required containerClassName="sm:col-span-2" value={form.name} error={errors.name} maxLength={150}
            placeholder="Production Cost Centre" onChange={(e) => set({ name: e.target.value })} />
          <Select label="Parent (optional)" containerClassName="sm:col-span-2" value={form.parent_uid}
            error={errors.parent_uid}
            hint={editing ? 'A cost centre cannot be its own parent or a child of its descendants.' : undefined}
            onChange={(e) => set({ parent_uid: e.target.value })}
            options={[
              { value: '', label: '— none (top level) —' },
              ...rows
                .filter((c) => c.is_active && c.uid !== editing?.uid)
                .map((c) => ({ value: c.uid, label: `${c.code} — ${c.name}` })),
            ]} />
          <div className="sm:col-span-2">
            <Switch checked={form.is_postable} onChange={(v) => set({ is_postable: v })} label="Postable (allow postings directly to this cost centre)" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
