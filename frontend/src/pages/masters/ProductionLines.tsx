import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { api, ProblemError } from '@/api/client'
import { useSession } from '@/api/session'

/**
 * Production line master.
 *
 * The line an order is scheduled onto. The table and its three rows have been
 * there since the first migration, reachable only through the read-only lookup
 * that fills the Machine form's dropdown — no business user could see or
 * maintain one until now.
 */

export interface ProductionLine {
  id: number
  code: string
  name: string
  plantId: number
  lineType: string
  ratedOutputPerHour: number
  isActive: boolean
}

const LINE_TYPES = [
  { value: 'FORMING', label: 'Forming' },
  { value: 'ASSEMBLY', label: 'Assembly' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'FINISHING', label: 'Finishing' },
  { value: 'OTHER', label: 'Other' },
]

const typeLabel = (v: string) =>
  LINE_TYPES.find((t) => t.value === v)?.label ?? v.replace(/_/g, ' ').toLowerCase()

const linesApi = {
  list: (includeInactive: boolean) =>
    api.get<ProductionLine[]>('/masters/production-lines', { includeInactive }),
  get: (id: number) => api.get<ProductionLine>(`/masters/production-lines/${id}`),
  create: (body: Omit<ProductionLine, 'id'>) =>
    api.post<ProductionLine>('/masters/production-lines', body),
  update: (id: number, body: Omit<ProductionLine, 'id'>) =>
    api.put<ProductionLine>(`/masters/production-lines/${id}`, body),
  remove: (id: number) => api.del(`/masters/production-lines/${id}`),
  nextCode: () => api.get<{ code: string }>('/masters/production-lines/next-code'),
}

interface PlantLookup { id: number; code: string; name: string }

interface FormState {
  code: string
  name: string
  plantId: string
  lineType: string
  ratedOutputPerHour: string
  isActive: boolean
}

const EMPTY: FormState = {
  code: '', name: '', plantId: '', lineType: 'FORMING',
  ratedOutputPerHour: '0', isActive: true,
}

export function ProductionLinesPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const companyUid = useSession((s) => s.companyUid)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [viewRecord, setViewRecord] = useState<ProductionLine | null>(null)
  const [confirm, setConfirm] = useState<ProductionLine | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const linesQ = useQuery({
    queryKey: ['masters:production-lines', companyUid, showInactive],
    queryFn: () => linesApi.list(showInactive),
    enabled: !!companyUid,
  })

  // Plants keyed by integer id — the line's PlantId foreign key needs the id,
  // not the ULID that /plants returns.
  const plantsQ = useQuery({
    queryKey: ['masters:production-plants', companyUid],
    queryFn: () => api.get<PlantLookup[]>('/production-plants'),
    enabled: !!companyUid,
  })
  const plants = plantsQ.data ?? []
  const plantName = (id: number) => {
    const p = plants.find((x) => x.id === id)
    return p ? `${p.code} — ${p.name}` : '—'
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ['masters:production-lines'] })
  const create = useMutation({ mutationFn: linesApi.create, onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Omit<ProductionLine, 'id'> }) =>
      linesApi.update(id, body),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: linesApi.remove, onSuccess: invalidate })

  const rows = useMemo(() => {
    let list = linesQ.data ?? []
    if (typeFilter) list = list.filter((l) => l.lineType === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((l) => l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q))
    }
    return list
  }, [linesQ.data, search, typeFilter])

  function reportError(fallback: string, e: unknown) {
    if (e instanceof ProblemError) toast.error(e.problem.title || fallback, e.problem.detail)
    else toast.error(fallback, e instanceof Error ? e.message : 'Unexpected error.')
  }

  /** Fetch by id, then open — the list row is only a pointer. */
  async function openDetail(id: number, mode: 'view' | 'edit') {
    setBusy(true)
    try {
      const l = await linesApi.get(id)
      if (mode === 'view') {
        setViewRecord(l)
        return
      }
      setEditId(id)
      setForm({
        code: l.code, name: l.name, plantId: String(l.plantId),
        lineType: l.lineType, ratedOutputPerHour: String(l.ratedOutputPerHour ?? 0),
        isActive: l.isActive,
      })
      setErrors({})
    } catch (e) {
      reportError('Could not load this production line', e)
    } finally {
      setBusy(false)
    }
  }

  async function openNew() {
    setEditId(null)
    setErrors({})
    try {
      const { code } = await linesApi.nextCode()
      setForm({ ...EMPTY, code })
    } catch {
      // A missing next-code is not a reason to block the form.
      setForm({ ...EMPTY })
    }
  }

  async function save() {
    if (!form) return
    const fe: Record<string, string> = {}
    if (!form.code.trim()) fe.code = 'A code is required'
    if (!form.name.trim()) fe.name = 'A name is required'
    if (!form.plantId) fe.plantId = 'Pick a plant'
    if (Number(form.ratedOutputPerHour) < 0) fe.ratedOutputPerHour = 'Cannot be negative'
    if (Object.keys(fe).length) { setErrors(fe); return }
    setErrors({})

    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      plantId: Number(form.plantId),
      lineType: form.lineType,
      ratedOutputPerHour: Number(form.ratedOutputPerHour || 0),
      isActive: form.isActive,
    }

    try {
      if (editId != null) {
        await update.mutateAsync({ id: editId, body })
        toast.success('Saved', `${body.code} updated.`)
      } else {
        await create.mutateAsync(body)
        toast.success('Created', `${body.code} added.`)
      }
      setForm(null)
      setEditId(null)
    } catch (e) {
      reportError(editId != null ? 'Could not save this line' : 'Could not create this line', e)
    }
  }

  async function runDelete() {
    if (!confirm) return
    try {
      await remove.mutateAsync(confirm.id)
      toast.success('Deleted', `${confirm.code} removed.`)
      setConfirm(null)
    } catch (e) {
      // The server refuses when production orders reference the line, and says
      // how many — surface that rather than a generic failure.
      reportError('Could not delete this line', e)
      setConfirm(null)
    }
  }

  const columns: Column<ProductionLine>[] = [
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>,
    },
    {
      key: 'code', header: 'Line Code', width: '150px', sortable: true,
      accessor: (l) => l.code,
      render: (l) => <span className="font-mono text-[13px] font-semibold text-fg">{l.code}</span>,
    },
    {
      key: 'name', header: 'Line Name', width: '280px', sortable: true,
      accessor: (l) => l.name,
      render: (l) => <span className="block truncate text-[14px] text-fg" title={l.name}>{l.name}</span>,
    },
    {
      key: 'plant', header: 'Plant', width: '190px',
      accessor: (l) => plantName(l.plantId),
      render: (l) => <span className="text-[14px] text-fg-muted">{plantName(l.plantId)}</span>,
    },
    {
      key: 'lineType', header: 'Line Type', width: '150px', sortable: true,
      accessor: (l) => l.lineType,
      render: (l) => <Badge tone="neutral" size="sm" dot={false}>{typeLabel(l.lineType)}</Badge>,
    },
    {
      key: 'ratedOutputPerHour', header: 'Rated / Hr', width: '135px', align: 'right', sortable: true,
      accessor: (l) => l.ratedOutputPerHour,
      render: (l) => (
        <span className="text-[14px] tabular-nums text-fg">
          {l.ratedOutputPerHour ? l.ratedOutputPerHour.toLocaleString('en-IN') : '—'}
        </span>
      ),
    },
    {
      key: 'isActive', header: 'Status', width: '120px', align: 'center',
      accessor: (l) => (l.isActive ? 'Active' : 'Inactive'),
      render: (l) => (
        <Badge tone={l.isActive ? 'success' : 'neutral'} size="sm">
          {l.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions', header: 'Actions', width: '120px', align: 'center', className: 'col-flex',
      render: (l) => (
        <div className="flex items-center justify-center gap-0.5">
          <IconButton icon={Eye} variant="ghost" size="sm" title="View"
            aria-label={`View ${l.code}`} onClick={() => openDetail(l.id, 'view')} />
          <IconButton icon={Pencil} variant="ghost" size="sm" title="Edit"
            aria-label={`Edit ${l.code}`} onClick={() => openDetail(l.id, 'edit')} />
          <Menu trigger={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" title="More actions" aria-label="More actions" />}>
            <MenuItem label="Delete" danger onClick={() => setConfirm(l)} />
          </Menu>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader
        title="Production Lines"
        description="The lines orders are scheduled onto, and what each is rated to produce."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Masters' }, { label: 'Production Lines' }]}
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
            New Line
          </Button>
        }
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in to load production lines.</Alert>}
      {linesQ.error && (
        <Alert tone="danger" title="Could not load production lines">
          {linesQ.error instanceof ProblemError ? linesQ.error.problem.detail : 'Unable to load line data.'}
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="pl-search" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Search</label>
          <input
            id="pl-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Code or name…"
            className="h-9 w-64 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pl-type" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Line Type</label>
          <select
            id="pl-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          >
            <option value="">All types</option>
            {LINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-fg-muted">
          <input
            type="checkbox" checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500"
          />
          Show inactive
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost"
            onClick={() => { setSearch(''); setTypeFilter(''); setShowInactive(false) }}>
            Clear Filters
          </Button>
          <Button
            size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => {
              const n = exportRows('csv', 'production-lines', 'Production lines', columnsFromTable(columns), rows)
              toast.success('Export ready', `${n} rows written.`)
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <DataTable
        density="comfortable"
        searchable={false}
        rows={rows}
        columns={columns}
        rowKey={(l) => String(l.id)}
        loading={linesQ.isLoading || busy}
        emptyTitle="No production lines"
        emptyDescription="Add a line so production orders can be scheduled onto it."
      />

      {form && (
        <Modal
          open
          onClose={() => { setForm(null); setEditId(null) }}
          title={editId != null ? 'Edit Production Line' : 'New Production Line'}
          size="2xl"
          closeOnBackdrop={false}
          footer={
            <>
              <Button variant="outline" onClick={() => { setForm(null); setEditId(null) }}>Cancel</Button>
              <Button variant="primary" loading={create.isPending || update.isPending} onClick={save}>
                {editId != null ? 'Update' : 'Create'}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Input label="Line Code" required value={form.code} error={errors.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input label="Line Name" required value={form.name} error={errors.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select
              label="Plant" required value={form.plantId} error={errors.plantId}
              onChange={(e) => setForm({ ...form, plantId: e.target.value })}
              options={[
                { value: '', label: 'Select a plant…' },
                ...plants.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` })),
              ]}
            />
            <Select
              label="Line Type" required value={form.lineType}
              onChange={(e) => setForm({ ...form, lineType: e.target.value })}
              options={LINE_TYPES}
            />
            <Input
              label="Rated Output per Hour" type="number" min="0"
              value={form.ratedOutputPerHour} error={errors.ratedOutputPerHour}
              onChange={(e) => setForm({ ...form, ratedOutputPerHour: e.target.value })}
            />
            <label className="flex items-end gap-2 pb-2 text-sm text-fg">
              <input
                type="checkbox" checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500"
              />
              Active
            </label>
          </div>
        </Modal>
      )}

      {viewRecord && (
        <Modal
          open
          onClose={() => setViewRecord(null)}
          title={`${viewRecord.code} — ${viewRecord.name}`}
          size="xl"
          footer={<Button variant="secondary" onClick={() => setViewRecord(null)}>Close</Button>}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {([
              ['Line Code', viewRecord.code],
              ['Line Name', viewRecord.name],
              ['Plant', plantName(viewRecord.plantId)],
              ['Line Type', typeLabel(viewRecord.lineType)],
              ['Rated Output / Hour', viewRecord.ratedOutputPerHour ? viewRecord.ratedOutputPerHour.toLocaleString('en-IN') : '—'],
              ['Status', viewRecord.isActive ? 'Active' : 'Inactive'],
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
        title="Delete this production line?"
        message={`${confirm?.code ?? ''} will be removed from the line list. If any production order references it the delete is refused — deactivate it instead.`}
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={runDelete}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}

export default ProductionLinesPage
