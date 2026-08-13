import { useState, useEffect } from 'react'
import { Coins, Plus, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
import { formatCompact, formatCurrency, formatPercent } from '@/lib/format'
import { users } from '@/mock/data'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function CostCentresPage() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState('list')
  const [open, setOpen] = useState(false)
  
  // Form state
  const [name, setName] = useState('')
  const [type, setType] = useState('PRODUCTION')
  const [parentId, setParentId] = useState<string>('')
  const [owner, setOwner] = useState('')
  const [budget, setBudget] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [postable, setPostable] = useState(true)

  const { data: costCentres = [] } = useQuery({
    queryKey: ['costCentres'],
    queryFn: api.getCostCentres,
  })

  const createMutation = useMutation({
    mutationFn: api.createCostCentre,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costCentres'] })
      toast.success('Cost centre created')
      setOpen(false)
    },
    onError: (err: any) => {
      toast.error('Failed to create cost centre', err.message)
    },
  })

  const { data: nextCodeData } = useQuery({
    queryKey: ['costCentresNextCode'],
    queryFn: api.getNextCostCentreCode,
    enabled: open
  })
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

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName('')
      setType('PRODUCTION')
      setParentId('')
      setOwner('')
      setBudget('')
      setValidFrom('')
      setValidTo('')
      setPostable(true)
    }
  }, [open])

  const totalBudget = costCentres.reduce((s: number, c: any) => s + (c.isPostable ? c.budget : 0), 0)
  const totalActual = costCentres.reduce((s: number, c: any) => s + (c.isPostable ? c.actual : 0), 0)

  const columns: Column<any>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      width: '120px',
      render: (c) => (
        <span className={c.parentId ? 'pl-4 font-mono text-xs' : 'font-mono text-xs font-medium'}>{c.code}</span>
      ),
    },
    { key: 'name', header: 'Cost centre', sortable: true, render: (c) => <span className={c.parentId ? 'text-fg-muted' : 'font-medium text-fg'}>{c.name}</span> },
    { key: 'type', header: 'Type', sortable: true, width: '120px', render: (c) => <Badge tone="neutral" size="sm" dot={false}>{c.type.toLowerCase()}</Badge> },
    { key: 'owner', header: 'Owner', width: '140px' },
    { key: 'budget', header: 'Budget', align: 'right', sortable: true, width: '120px', render: (c) => formatCurrency(c.budget) },
    { key: 'actual', header: 'Actual', align: 'right', sortable: true, width: '120px', render: (c) => formatCurrency(c.actual) },
    {
      key: 'variance',
      header: 'Variance',
      align: 'right',
      width: '110px',
      accessor: (c) => c.budget - c.actual,
      render: (c) => {
        const v = c.budget - c.actual
        return <span className={v < 0 ? 'font-medium text-danger tabular' : 'text-success tabular'}>{formatCurrency(v)}</span>
      },
    },
    {
      key: 'utilisation',
      header: 'Utilisation',
      width: '150px',
      accessor: (c) => (c.budget ? (c.actual / c.budget) * 100 : 0),
      render: (c) => {
        const pct = c.budget ? (c.actual / c.budget) * 100 : 0
        return <ProgressBar value={pct} showLabel tone={pct > 95 ? 'danger' : pct > 85 ? 'warning' : 'success'} />
      },
    },
    {
      key: 'isPostable',
      header: 'Postable',
      align: 'center',
      width: '90px',
      accessor: (c) => (c.isPostable ? 1 : 0),
      render: (c) => (c.isPostable ? <Badge tone="success" size="sm">Yes</Badge> : <Badge tone="neutral" size="sm">Roll-up</Badge>),
    },
  ]

  const chartData = costCentres
    .filter((c: any) => c.isPostable)
    .map((c: any) => ({ name: c.code.replace('CC-', ''), budget: Math.round(c.budget / 100000), actual: Math.round(c.actual / 100000), pct: (c.actual / c.budget) * 100 }))

  const handleCreate = () => {
    if (!name || !type) {
      toast.error('Validation error', 'Name and type are required')
      return
    }
    createMutation.mutate({
      code: nextCodeData?.nextCode || 'CC-0001',
      name,
      type,
      parentId: parentId ? parseInt(parentId) : null,
      owner,
      budget: budget ? parseFloat(budget) : 0,
      actual: 0,
      validFrom: validFrom || null,
      validTo: validTo || null,
      isPostable: postable
    })
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

      {costCentres.some((c: any) => c.isPostable && c.actual / c.budget > 0.9) && (
        <Alert tone="warning" className="mb-4" title="Cost centres approaching budget">
          {costCentres.filter((c: any) => c.isPostable && c.actual / c.budget > 0.9).map((c: any) => `${c.code} (${Math.round((c.actual / c.budget) * 100)}%)`).join(', ')} —
          approvers see this consumption in their decision context before authorising further spend.
        </Alert>
      )}

      {tab === 'list' && (
        <DataTable
          rows={costCentres}
          columns={columns}
          rowKey={(c) => c.id}
          searchPlaceholder="Code, name or owner…"
          onExport={doExport}
          pageSize={20}
          rowActions={(c) => (
            <>
              <MenuItem label="Edit" onClick={() => toast.info('Edit cost centre', `${c.code} — ${c.name}.`)} />
              <MenuItem label="View postings" onClick={() => toast.info('View postings', `Ledger postings booked against ${c.code}.`)} />
              <MenuItem label="Budget history" onClick={() => toast.info('Budget history', `Budget revisions for ${c.code} across financial years.`)} />
              <MenuItem label="Deactivate" danger disabled={c.actual > 0} onClick={() => toast.success('Cost centre deactivated', `${c.code} can no longer receive postings.`)} />
            </>
          )}
        />
      )}

      {tab === 'budget' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Budget vs actual by cost centre" description="₹ lakh, FY26-27 to date" />
            <CardBody className="h-80 pl-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--fg-muted))' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip
                    contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 6, fontSize: 11 }}
                    formatter={(v: number) => [`₹${v} L`, '']}
                  />
                  <Bar dataKey="budget" name="Budget" fill="rgb(var(--border-strong))" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]} maxBarSize={26}>
                    {chartData.map((d: any, i: number) => (
                      <Cell key={i} fill={d.pct > 95 ? '#ef4444' : d.pct > 85 ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Utilisation ranking" />
            <CardBody className="space-y-3">
              {[...costCentres].filter((c: any) => c.isPostable).sort((a: any, b: any) => b.actual / b.budget - a.actual / a.budget).map((c: any) => {
                const pct = (c.actual / c.budget) * 100
                return (
                  <div key={c.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-fg-subtle">{c.code}</span>
                        <span className="text-fg">{c.name}</span>
                        <span className="text-fg-subtle">· {c.owner}</span>
                      </span>
                      <span className="shrink-0 text-fg-muted tabular">
                        {formatCurrency(c.actual)} / {formatCurrency(c.budget)}
                      </span>
                    </div>
                    <ProgressBar value={pct} showLabel tone={pct > 95 ? 'danger' : pct > 85 ? 'warning' : 'success'} />
                  </div>
                )
              })}
            </CardBody>
          </Card>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New cost centre"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={createMutation.isPending} onClick={handleCreate}>Create</Button></>}>
        <div className="grid grid-cols-2 gap-3.5">
          <Input label="Code" required value={nextCodeData?.nextCode || 'Loading...'} disabled />
          <Input label="Name" required placeholder="Tool Room" value={name} onChange={e => setName(e.target.value)} />
          <Select label="Type" required value={type} onChange={e => setType(e.target.value)} options={['PRODUCTION', 'SERVICE', 'ADMIN', 'SALES', 'QUALITY', 'MAINTENANCE', 'UTILITY'].map((v) => ({ value: v, label: v }))} />
          <Select label="Parent cost centre" value={parentId} onChange={e => setParentId(e.target.value)} options={[{ value: '', label: '— top level —' }, ...costCentres.filter((c: any) => !c.isPostable).map((c: any) => ({ value: c.id.toString(), label: `${c.code} — ${c.name}` }))]}
            hint="Hierarchies must not contain cycles — this is validated on save." />
          <Select label="Owner" value={owner} onChange={e => setOwner(e.target.value)} options={users.filter((u) => u.status === 'ACTIVE').map((u) => ({ value: u.uid, label: u.fullName }))} />
          <Input label="Annual budget (₹)" type="number" value={budget} onChange={e => setBudget(e.target.value)} />
          <Input label="Valid from" type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
          <Input label="Valid to" type="date" hint="Blank = perpetual" value={validTo} onChange={e => setValidTo(e.target.value)} />
          <div className="col-span-2">
            <Switch checked={postable} onChange={setPostable} label="Postable — transactions may be booked directly here" />
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
