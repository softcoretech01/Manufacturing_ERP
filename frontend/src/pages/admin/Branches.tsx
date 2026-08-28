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
import { collectErrors } from '@/lib/validate'
import { branches as branchApi, type Branch } from '@/api/organisation'
import {
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  useDeactivateBranch,
  useRestoreBranch,
} from '@/hooks/useOrganisation'
import { useSession } from '@/api/session'

/** This screen is wired to the live FastAPI backend (Organisation module). */

const STATES = [
  { code: '33', name: 'Tamil Nadu' },
  { code: '29', name: 'Karnataka' },
  { code: '07', name: 'Delhi' },
  { code: '27', name: 'Maharashtra' },
  { code: '24', name: 'Gujarat' },
  { code: '36', name: 'Telangana' },
]

const BRANCH_TYPES = [
  { value: 'HEAD_OFFICE', label: 'Head office' },
  { value: 'FACTORY', label: 'Factory' },
  { value: 'DEPOT', label: 'Depot' },
  { value: 'SALES_OFFICE', label: 'Sales office' },
  { value: 'WAREHOUSE_ONLY', label: 'Warehouse only' },
]

interface FormState {
  code: string
  name: string
  branch_type: string
  gst_state_code: string
  has_separate_gstin: boolean
  gstin: string
  address_line1: string
  pincode: string
  contact_person: string
  phone: string
  email: string
}

const BLANK: FormState = {
  code: '',
  name: '',
  branch_type: 'FACTORY',
  gst_state_code: '33',
  has_separate_gstin: false,
  gstin: '',
  address_line1: '',
  pincode: '',
  contact_person: '',
  phone: '',
  email: '',
}

export function BranchesPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)

  const { data, isLoading, error, refetch } = useBranches({ page_size: 200 })
  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch()
  const deactivateBranch = useDeactivateBranch()
  const restoreBranch = useRestoreBranch()

  const rows = data?.data ?? []

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  function openCreate() {
    setEditing(null)
    setForm(BLANK)
    setErrors({})
    setFormOpen(true)
    // Preview the next auto-generated code; it is authoritative on the server.
    branchApi
      .nextCode()
      .then((code) => setForm((f) => ({ ...f, code })))
      .catch(() => {})
  }

  function openEdit(b: Branch) {
    setEditing(b)
    // Load *every* editable field from the record — previously contact_person and
    // phone were hard-blanked here, so saving an edit erased them (data loss).
    setForm({
      code: b.code,
      name: b.name,
      branch_type: b.branch_type,
      gst_state_code: b.gst_state_code ?? '33',
      has_separate_gstin: b.has_separate_gstin,
      gstin: b.gstin ?? '',
      address_line1: b.address_line1 ?? '',
      pincode: b.pincode ?? '',
      contact_person: b.contact_person ?? '',
      phone: b.phone ?? '',
      email: b.email ?? '',
    })
    setErrors({})
    setFormOpen(true)
  }

  /** Map a backend problem+json error onto field errors + a toast. */
  function handleError(err: unknown, fallback: string) {
    if (err instanceof ProblemError) {
      const fieldErrors: Record<string, string> = {}
      for (const e of err.problem.errors ?? []) fieldErrors[e.field] = e.message
      setErrors(fieldErrors)
      toast.error(err.problem.title || 'Request failed', err.problem.detail)
    } else {
      toast.error(fallback, err instanceof Error ? err.message : 'Unknown error.')
    }
  }

  function save() {
    // Client-side format checks mirror the server rules (immediate feedback).
    const clientErrors = collectErrors({
      phone: ['phone', form.phone],
      email: ['email', form.email],
      pincode: ['pincode', form.pincode],
      ...(form.has_separate_gstin ? { gstin: ['gstin', form.gstin] as ['gstin', string] } : {}),
    })
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors)
      toast.error('Check the highlighted fields', 'Some values are not in the expected format.')
      return
    }
    setErrors({})
    // `code` is never sent: the server auto-generates it on create and it is
    // immutable on edit (BranchUpdate has no code field).
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      branch_type: form.branch_type,
      has_separate_gstin: form.has_separate_gstin,
      gst_state_code: form.gst_state_code,
      gstin: form.has_separate_gstin ? form.gstin.trim().toUpperCase() : null,
      address_line1: form.address_line1.trim() || null,
      pincode: form.pincode.trim() || null,
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    }
    if (editing) {
      updateBranch.mutate(
        { uid: editing.uid, body: { version: editing.version, ...body } },
        {
          onSuccess: () => {
            toast.success('Branch updated', `${form.code} saved.`)
            setFormOpen(false)
          },
          onError: (e) => handleError(e, 'Update failed'),
        },
      )
    } else {
      createBranch.mutate(body, {
        onSuccess: (created) => {
          toast.success('Branch created', `${created.code} added.`)
          setFormOpen(false)
        },
        onError: (e) => handleError(e, 'Create failed'),
      })
    }
  }

  function toggleActive(b: Branch) {
    if (b.is_active) {
      deactivateBranch.mutate(
        { uid: b.uid, body: { version: b.version } },
        {
          onSuccess: () => toast.success('Branch deactivated', `${b.name} is now inactive.`),
          onError: (e) => handleError(e, 'Deactivate failed'),
        },
      )
    } else {
      restoreBranch.mutate(b.uid, {
        onSuccess: () => toast.success('Branch restored', `${b.name} is active again.`),
        onError: (e) => handleError(e, 'Restore failed'),
      })
    }
  }

  const columns: Column<Branch>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '90px', render: (b) => <span className="font-mono text-xs font-medium">{b.code}</span> },
    { key: 'name', header: 'Branch', sortable: true, render: (b) => <span className="font-medium text-fg">{b.name}</span> },
    { key: 'branch_type', header: 'Type', sortable: true, width: '140px', render: (b) => <Badge tone="neutral" size="sm" dot={false}>{b.branch_type.replace(/_/g, ' ').toLowerCase()}</Badge> },
    {
      key: 'gstin',
      header: 'GSTIN',
      width: '180px',
      render: (b) => (b.gstin ? <span className="font-mono text-[11px]">{b.gstin}</span> : <span className="text-xs text-fg-subtle">Uses head office</span>),
    },
    { key: 'gst_state_code', header: 'State', width: '80px', render: (b) => b.gst_state_code ?? '—' },
    { key: 'version', header: 'Ver', align: 'right', width: '60px', defaultHidden: true },
    {
      key: 'is_active',
      header: 'Status',
      width: '100px',
      accessor: (b) => (b.is_active ? 'Active' : 'Inactive'),
      render: (b) => <Badge tone={b.is_active ? 'success' : 'neutral'} size="sm">{b.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'branches', 'Branches', columnsFromTable(columns), rows)
      toast.success('Export ready', `${n} rows saved as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  const saving = createBranch.isPending || updateBranch.isPending

  return (
    <div>
      <PageHeader
        title="Branches"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Branches' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add branch
          </Button>
        }
      />

      <HowItWorks>
        Live data from the FastAPI backend (Organisation module). Branches are scoped to your signed-in
        company; GSTIN is validated on the server (format, embedded PAN and state code).
      </HowItWorks>

      {!companyUid && (
        <Alert tone="warning" title="Not signed in to the backend">
          Sign in first so the app has an API session, then this list will load.
        </Alert>
      )}

      {error && (
        <Alert tone="danger" title="Could not load branches">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running at the configured API URL?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(b) => b.uid}
        loading={isLoading}
        searchPlaceholder="Branch name, code or GSTIN…"
        onExport={doExport}
        onRowClick={openEdit}
        emptyTitle="No branches yet"
        emptyDescription="Add your first branch to start building the organisation."
        emptyAction={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add branch
          </Button>
        }
        rowActions={(b) => (
          <>
            <MenuItem label="Edit" icon={<Pencil />} onClick={() => openEdit(b)} />
            <MenuItem
              label={b.is_active ? 'Deactivate' : 'Restore'}
              icon={b.is_active ? <Power /> : <RotateCcw />}
              separatorBefore
              onClick={() => toggleActive(b)}
            />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Add branch'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {editing ? 'Save changes' : 'Add branch'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Branch code" value={form.code || 'auto…'} readOnly className="bg-surface-2"
            hint="Auto-generated · not editable" onChange={() => {}} />
          <Input label="Branch name" required value={form.name} error={errors.name} maxLength={150}
            onChange={(e) => set({ name: e.target.value })} placeholder="Mumbai Depot" />
          <Select label="Branch type" value={form.branch_type} error={errors.branch_type}
            onChange={(e) => set({ branch_type: e.target.value })} options={BRANCH_TYPES} />
          <Select label="State (GST code)" value={form.gst_state_code} error={errors.gst_state_code}
            onChange={(e) => set({ gst_state_code: e.target.value })}
            options={STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} />
          <div className="sm:col-span-2">
            <Switch checked={form.has_separate_gstin} onChange={(v) => set({ has_separate_gstin: v })}
              label="This branch has its own GST registration" />
          </div>
          {form.has_separate_gstin && (
            <Input label="GSTIN" required containerClassName="sm:col-span-2" value={form.gstin} error={errors.gstin}
              maxLength={15} placeholder="33AABCS1429B1ZP"
              hint="Validated on the server: format, the PAN inside it, and the state code."
              onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} />
          )}
          <Input label="Address" containerClassName="sm:col-span-2" value={form.address_line1}
            maxLength={200} placeholder="Plot 42, SIDCO Industrial Estate"
            onChange={(e) => set({ address_line1: e.target.value })} />
          <Input label="Pincode" value={form.pincode} error={errors.pincode} maxLength={6}
            inputMode="numeric" placeholder="600001"
            onChange={(e) => set({ pincode: e.target.value.replace(/[^0-9]/g, '') })} />
          <Input label="Contact person" value={form.contact_person} maxLength={150}
            onChange={(e) => set({ contact_person: e.target.value })} />
          <Input label="Phone" type="tel" value={form.phone} error={errors.phone} maxLength={20}
            inputMode="tel" placeholder="+91 98400 12345"
            onChange={(e) => set({ phone: e.target.value })} />
          <Input label="Email" type="email" value={form.email} error={errors.email} maxLength={150}
            placeholder="branch@company.com" onChange={(e) => set({ email: e.target.value })} />
        </div>
      </Modal>
    </div>
  )
}
