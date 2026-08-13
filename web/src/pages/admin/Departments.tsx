import { useState } from 'react'
import { Pencil, Plus, Power, RotateCcw } from 'lucide-react'
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
import { ProblemError } from '@/api/client'
import { departments as deptApi, type Department } from '@/api/organisation'
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeactivateDepartment,
  useRestoreDepartment,
} from '@/hooks/useOrganisation'
import { useSession } from '@/api/session'

/** Wired to the live FastAPI backend (Organisation module). */

const DEPARTMENT_TYPES = [
  { value: 'PRODUCTION', label: 'Production' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'STORES', label: 'Stores' },
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'SALES', label: 'Sales' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'HR', label: 'HR' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'ENGINEERING', label: 'Engineering' },
  { value: 'ADMIN', label: 'Admin' },
]

interface FormState {
  code: string
  name: string
  department_type: string
  parent_uid: string
}

const BLANK: FormState = { code: '', name: '', department_type: 'PRODUCTION', parent_uid: '' }

export function DepartmentsPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)

  const { data, isLoading, error, refetch } = useDepartments({ page_size: 200 })
  const createDept = useCreateDepartment()
  const updateDept = useUpdateDepartment()
  const deactivateDept = useDeactivateDepartment()
  const restoreDept = useRestoreDepartment()

  const rows = data?.data ?? []

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  function openCreate() {
    setEditing(null)
    setForm(BLANK)
    setErrors({})
    setFormOpen(true)
    deptApi.nextCode().then((code) => setForm((f) => ({ ...f, code }))).catch(() => {})
  }

  function openEdit(d: Department) {
    setEditing(d)
    setForm({ code: d.code, name: d.name, department_type: d.department_type, parent_uid: d.parent_uid ?? '' })
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
      updateDept.mutate(
        { uid: editing.uid, body: { version: editing.version, name: form.name.trim(), department_type: form.department_type, parent_uid: form.parent_uid || null } },
        {
          onSuccess: () => {
            toast.success('Department updated', `${editing.code} saved.`)
            setFormOpen(false)
          },
          onError: (e) => handleError(e, 'Update failed'),
        },
      )
    } else {
      createDept.mutate(
        { name: form.name.trim(), department_type: form.department_type, parent_uid: form.parent_uid || null },
        {
          onSuccess: (created) => {
            toast.success('Department created', `${created.code} added.`)
            setFormOpen(false)
          },
          onError: (e) => handleError(e, 'Create failed'),
        },
      )
    }
  }

  function toggleActive(d: Department) {
    if (d.is_active) {
      deactivateDept.mutate(
        { uid: d.uid, body: { version: d.version } },
        {
          onSuccess: () => toast.success('Department deactivated', `${d.name} is now inactive.`),
          onError: (e) => handleError(e, 'Deactivate failed'),
        },
      )
    } else {
      restoreDept.mutate(d.uid, {
        onSuccess: () => toast.success('Department restored', `${d.name} is active again.`),
        onError: (e) => handleError(e, 'Restore failed'),
      })
    }
  }

  const columns: Column<Department>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '90px', render: (d) => <span className="font-mono text-xs font-medium">{d.code}</span> },
    { key: 'name', header: 'Department', sortable: true, render: (d) => <span className="font-medium text-fg">{d.name}</span> },
    { key: 'parent_code', header: 'Parent', sortable: true, width: '160px', accessor: (d) => d.parent_code ?? '', render: (d) => d.parent_code ? <span className="text-xs text-fg-muted"><span className="font-mono">{d.parent_code}</span> · {d.parent_name}</span> : <span className="text-xs text-fg-subtle">top level</span> },
    { key: 'department_type', header: 'Type', sortable: true, width: '150px', render: (d) => <Badge tone="neutral" size="sm" dot={false}>{d.department_type.replace(/_/g, ' ').toLowerCase()}</Badge> },
    {
      key: 'is_active',
      header: 'Status',
      width: '100px',
      accessor: (d) => (d.is_active ? 'Active' : 'Inactive'),
      render: (d) => <Badge tone={d.is_active ? 'success' : 'neutral'} size="sm">{d.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'departments', 'Departments', columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows saved as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const saving = createDept.isPending || updateDept.isPending

  return (
    <div>
      <PageHeader
        title="Departments"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Departments' }]}
        actions={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>Add department</Button>}
      />

      <HowItWorks>
        Live data from the Organisation module. Departments organise people and cost ownership; the code is
        auto-generated. A department can optionally sit under a parent department.
      </HowItWorks>

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load departments">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(d) => d.uid}
        loading={isLoading}
        searchPlaceholder="Department name or code…"
        onExport={doExport}
        onRowClick={openEdit}
        emptyTitle="No departments yet"
        emptyDescription="Add your first department."
        emptyAction={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>Add department</Button>}
        rowActions={(d) => (
          <>
            <MenuItem label="Edit" icon={<Pencil />} onClick={() => openEdit(d)} />
            <MenuItem label={d.is_active ? 'Deactivate' : 'Restore'} icon={d.is_active ? <Power /> : <RotateCcw />} separatorBefore onClick={() => toggleActive(d)} />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Add department'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>{editing ? 'Save changes' : 'Add department'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Department code" value={form.code || 'auto…'} readOnly className="bg-surface-2"
            hint="Auto-generated · not editable" onChange={() => {}} />
          <Select label="Type" value={form.department_type} error={errors.department_type}
            onChange={(e) => set({ department_type: e.target.value })} options={DEPARTMENT_TYPES} />
          <Input label="Department name" required containerClassName="sm:col-span-2" value={form.name} error={errors.name} maxLength={150}
            placeholder="Production" onChange={(e) => set({ name: e.target.value })} />
          <Select label="Parent department (optional)" containerClassName="sm:col-span-2" value={form.parent_uid}
            error={errors.parent_uid}
            hint={editing ? 'A department cannot be its own parent or a child of its descendants.' : undefined}
            onChange={(e) => set({ parent_uid: e.target.value })}
            options={[
              { value: '', label: '— none (top level) —' },
              ...rows
                .filter((d) => d.is_active && d.uid !== editing?.uid)
                .map((d) => ({ value: d.uid, label: `${d.code} — ${d.name}` })),
            ]} />
        </div>
      </Modal>
    </div>
  )
}
