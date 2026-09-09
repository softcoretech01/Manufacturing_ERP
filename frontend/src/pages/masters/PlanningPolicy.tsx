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
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { planningApi } from '@/api/planning'
import { useItems } from '@/hooks/useStock'
import type { PlanningPolicy } from '@/types/planning'

/**
 * The lot-sizing rules MRP plans against.
 *
 * These values are not decoration: `applyLotSize` in the MRP engine reads them
 * on every net requirement, so a wrong order multiple here shows up as a wrong
 * purchase order six screens away. The rows already existed and the API already
 * existed — until now there was simply no way for a planner to see or change
 * them.
 */

const LOT_SIZE_RULES = [
  {
    value: 'LOT_FOR_LOT',
    label: 'Lot for lot',
    hint: 'Order exactly what is short. No rounding.',
  },
  {
    value: 'MIN_ORDER_QTY',
    label: 'Minimum order quantity',
    hint: 'Order at least the minimum, otherwise exactly what is short.',
  },
  {
    value: 'FIXED_ORDER_QTY',
    label: 'Fixed order quantity',
    hint: 'Order in whole multiples of the minimum — two batches, three batches.',
  },
]

const ruleLabel = (v: string) => LOT_SIZE_RULES.find((r) => r.value === v)?.label ?? v

interface FormState {
  itemCode: string
  itemName: string
  lotSizeRule: string
  minOrderQty: string
  orderMultiple: string
  safetyStockOverride: string
  leadTimeOverride: string
  frozenDays: string
  isActive: boolean
}

const EMPTY: FormState = {
  itemCode: '', itemName: '', lotSizeRule: 'LOT_FOR_LOT', minOrderQty: '0',
  orderMultiple: '0', safetyStockOverride: '', leadTimeOverride: '',
  frozenDays: '0', isActive: true,
}

const num = (s: string) => (s.trim() === '' ? 0 : Number(s))
const optNum = (s: string) => (s.trim() === '' ? null : Number(s))

export function PlanningPolicyPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const companyUid = useSession((s) => s.companyUid)

  const [search, setSearch] = useState('')
  const [ruleFilter, setRuleFilter] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [editUid, setEditUid] = useState<string | null>(null)
  const [editVersion, setEditVersion] = useState(0)
  const [viewRecord, setViewRecord] = useState<PlanningPolicy | null>(null)
  const [confirm, setConfirm] = useState<PlanningPolicy | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loadingDetail, setLoadingDetail] = useState(false)

  const policiesQ = useQuery({
    queryKey: ['masters:planning-policies', companyUid],
    queryFn: planningApi.getPolicies,
    enabled: !!companyUid,
  })

  // Item picker comes from the item master, never a typed-in code.
  const items = useItems({ active_only: true }).data ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: ['masters:planning-policies'] })

  const create = useMutation({ mutationFn: planningApi.createPolicy, onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ uid, data }: { uid: string; data: Partial<PlanningPolicy> }) =>
      planningApi.updatePolicy(uid, data),
    onSuccess: invalidate,
  })

  const rows = useMemo(() => {
    let list = (policiesQ.data ?? []).filter((p) => !p.deletedAt)
    if (ruleFilter) list = list.filter((p) => p.lotSizeRule === ruleFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) => p.itemCode.toLowerCase().includes(q) || (p.itemName ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [policiesQ.data, search, ruleFilter])

  function reportError(fallback: string, e: unknown) {
    if (e instanceof ProblemError) toast.error(e.problem.title || fallback, e.problem.detail)
    else toast.error(fallback, e instanceof Error ? e.message : 'Unexpected error.')
  }

  /** Edit and View both read the record by uid from the freshly fetched list —
   *  never a stale row captured when the table first rendered. */
  function openDetail(uid: string, mode: 'view' | 'edit') {
    setLoadingDetail(true)
    try {
      const p = (policiesQ.data ?? []).find((x) => x.uid === uid)
      if (!p) {
        toast.error('Could not open this policy', 'The record is no longer in the list. Refresh and try again.')
        return
      }
      if (mode === 'view') {
        setViewRecord(p)
        return
      }
      setEditUid(uid)
      setEditVersion(p.version)
      setForm({
        itemCode: p.itemCode,
        itemName: p.itemName ?? '',
        lotSizeRule: p.lotSizeRule,
        minOrderQty: String(p.minOrderQty ?? 0),
        orderMultiple: String(p.orderMultiple ?? 0),
        safetyStockOverride: p.safetyStockOverride == null ? '' : String(p.safetyStockOverride),
        leadTimeOverride: p.leadTimeOverride == null ? '' : String(p.leadTimeOverride),
        frozenDays: String(p.frozenDays ?? 0),
        isActive: p.isActive,
      })
      setErrors({})
    } finally {
      setLoadingDetail(false)
    }
  }

  async function save() {
    if (!form) return
    const fe: Record<string, string> = {}
    if (!form.itemCode) fe.itemCode = 'Pick an item'
    if (form.lotSizeRule !== 'LOT_FOR_LOT' && num(form.minOrderQty) <= 0) {
      fe.minOrderQty = 'This rule needs a minimum order quantity above zero'
    }
    if (num(form.orderMultiple) < 0) fe.orderMultiple = 'Cannot be negative'
    if (num(form.frozenDays) < 0) fe.frozenDays = 'Cannot be negative'
    // A duplicate policy for the same item would make MRP's behaviour depend on
    // row order; the table has a unique key on it, so catch it here with a
    // readable message rather than letting the database reject it.
    const clash = (policiesQ.data ?? []).find(
      (p) => p.itemCode === form.itemCode && !p.deletedAt && p.uid !== editUid,
    )
    if (clash) fe.itemCode = `${form.itemCode} already has a planning policy`
    if (Object.keys(fe).length) { setErrors(fe); return }
    setErrors({})

    const body = {
      itemCode: form.itemCode,
      itemName: form.itemName,
      lotSizeRule: form.lotSizeRule,
      minOrderQty: num(form.minOrderQty),
      orderMultiple: num(form.orderMultiple),
      safetyStockOverride: optNum(form.safetyStockOverride),
      leadTimeOverride: optNum(form.leadTimeOverride),
      frozenDays: num(form.frozenDays),
      isActive: form.isActive,
    }

    try {
      if (editUid) {
        await update.mutateAsync({ uid: editUid, data: { ...body, version: editVersion } as never })
        toast.success('Saved', `Planning policy for ${form.itemCode} updated.`)
      } else {
        await create.mutateAsync(body as never)
        toast.success('Created', `Planning policy for ${form.itemCode} added.`)
      }
      setForm(null)
      setEditUid(null)
    } catch (e) {
      reportError('Could not save this policy', e)
    }
  }

  async function runDeactivate() {
    if (!confirm) return
    try {
      await update.mutateAsync({
        uid: confirm.uid,
        data: { isActive: false, version: confirm.version } as never,
      })
      toast.success('Deactivated', `${confirm.itemCode} will plan lot-for-lot from the next MRP run.`)
      setConfirm(null)
    } catch (e) {
      reportError('Could not deactivate this policy', e)
      setConfirm(null)
    }
  }

  const columns: Column<PlanningPolicy>[] = [
    {
      key: 'sno', header: 'S.No', width: '68px', align: 'center',
      render: (_r, i) => <span className="text-[13px] tabular-nums text-fg-subtle">{i + 1}</span>,
    },
    {
      key: 'item', header: 'Item', width: '250px', sortable: true, className: 'cell-stack',
      accessor: (p) => `${p.itemName} ${p.itemCode}`,
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-fg" title={p.itemName}>{p.itemName || p.itemCode}</p>
          <p className="truncate font-mono text-[12px] text-fg-subtle" title={String(p.itemCode ?? "")}>{p.itemCode}</p>
        </div>
      ),
    },
    {
      key: 'lotSizeRule', header: 'Lot Size Rule', width: '195px', sortable: true,
      accessor: (p) => p.lotSizeRule,
      render: (p) => <Badge tone="neutral" size="sm" dot={false}>{ruleLabel(p.lotSizeRule)}</Badge>,
    },
    {
      key: 'minOrderQty', header: 'Min Order Qty', width: '140px', align: 'right',
      accessor: (p) => p.minOrderQty,
      render: (p) => (
        <span className="text-[14px] tabular-nums text-fg-muted">
          {p.minOrderQty ? p.minOrderQty.toLocaleString('en-IN') : '—'}
        </span>
      ),
    },
    {
      key: 'orderMultiple', header: 'Order Multiple', width: '140px', align: 'right',
      accessor: (p) => p.orderMultiple,
      render: (p) => (
        <span className="text-[14px] tabular-nums text-fg-muted">
          {p.orderMultiple ? p.orderMultiple.toLocaleString('en-IN') : '—'}
        </span>
      ),
    },
    {
      key: 'safetyStockOverride', header: 'Safety Stock', width: '135px', align: 'right', defaultHidden: true,
      accessor: (p) => p.safetyStockOverride ?? -1,
      render: (p) => p.safetyStockOverride == null
        ? <span className="text-fg-subtle" title="Falls back to the item master's minimum stock">Item default</span>
        : <span className="text-[14px] tabular-nums text-fg">{p.safetyStockOverride.toLocaleString('en-IN')}</span>,
    },
    {
      key: 'leadTimeOverride', header: 'Lead Time', width: '125px', align: 'right', defaultHidden: true,
      accessor: (p) => p.leadTimeOverride ?? -1,
      render: (p) => p.leadTimeOverride == null
        ? <span className="text-fg-subtle" title="Falls back to the item master's lead time">Item default</span>
        : <span className="text-[14px] tabular-nums text-fg">{p.leadTimeOverride} d</span>,
    },
    {
      key: 'frozenDays', header: 'Frozen Days', width: '130px', align: 'right',
      accessor: (p) => p.frozenDays,
      render: (p) => (
        <span className="text-[14px] tabular-nums text-fg-muted">{p.frozenDays || '—'}</span>
      ),
    },
    {
      key: 'isActive', header: 'Status', width: '120px', align: 'center',
      accessor: (p) => (p.isActive ? 'Active' : 'Inactive'),
      render: (p) => (
        <Badge tone={p.isActive ? 'success' : 'neutral'} size="sm">
          {p.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions', header: 'Actions', width: '120px', align: 'center', className: 'col-flex',
      render: (p) => (
        <div className="flex items-center justify-center gap-0.5">
          <IconButton icon={Eye} variant="ghost" size="sm" title="View"
            aria-label={`View policy for ${p.itemCode}`} onClick={() => openDetail(p.uid, 'view')} />
          <IconButton icon={Pencil} variant="ghost" size="sm" title="Edit"
            aria-label={`Edit policy for ${p.itemCode}`} onClick={() => openDetail(p.uid, 'edit')} />
          <Menu trigger={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" title="More actions" aria-label="More actions" />}>
            {p.isActive && <MenuItem label="Deactivate" danger onClick={() => setConfirm(p)} />}
            {!p.isActive && (
              <MenuItem
                label="Reactivate"
                onClick={async () => {
                  try {
                    await update.mutateAsync({ uid: p.uid, data: { isActive: true, version: p.version } as never })
                    toast.success('Reactivated', `${p.itemCode} is planning to its policy again.`)
                  } catch (e) { reportError('Could not reactivate', e) }
                }}
              />
            )}
          </Menu>
        </div>
      ),
    },
  ]

  const selectedRule = LOT_SIZE_RULES.find((r) => r.value === form?.lotSizeRule)

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader
        title="Planning Policy"
        description="How MRP sizes an order for each item — the lot rule, the minimum, the multiple, and how far ahead the plan is frozen."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Masters' }, { label: 'Planning Policy' }]}
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => { setEditUid(null); setForm({ ...EMPTY }); setErrors({}) }}
          >
            New Policy
          </Button>
        }
      />

      {!companyUid && <Alert tone="warning" title="Not signed in">Sign in to load planning policies.</Alert>}
      {policiesQ.error && (
        <Alert tone="danger" title="Could not load planning policies">
          {policiesQ.error instanceof ProblemError
            ? policiesQ.error.problem.detail
            : 'Unable to load planning policies. Is the backend running?'}
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="pp-search" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Search</label>
          <input
            id="pp-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Item name or code…"
            className="h-9 w-64 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pp-rule" className="text-2xs font-medium uppercase tracking-wider text-fg-muted">Lot Size Rule</label>
          <select
            id="pp-rule" value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)}
            className="h-9 rounded-xl border border-border bg-surface-2 px-3 text-xs text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          >
            <option value="">All rules</option>
            {LOT_SIZE_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setSearch(''); setRuleFilter('') }}>
            Clear Filters
          </Button>
          <Button
            size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => {
              const n = exportRows('csv', 'planning-policies', 'Planning policy', columnsFromTable(columns), rows)
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
        rowKey={(p) => p.uid}
        loading={policiesQ.isLoading || loadingDetail}
        emptyTitle="No planning policies"
        emptyDescription="Items with no policy are planned lot-for-lot with the item master's lead time and minimum stock."
      />

      {/* ── New / Edit ─────────────────────────────────────────────────── */}
      {form && (
        <Modal
          open
          onClose={() => { setForm(null); setEditUid(null) }}
          title={editUid ? 'Edit Planning Policy' : 'New Planning Policy'}
          description="MRP reads these on every net requirement, so a change here changes the next run."
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
            <div className="col-span-2">
              <Select
                label="Item" required value={form.itemCode} error={errors.itemCode}
                disabled={!!editUid}
                onChange={(e) => {
                  const it = items.find((i) => i.code === e.target.value)
                  setForm({ ...form, itemCode: e.target.value, itemName: it?.name ?? '' })
                }}
                options={[
                  { value: '', label: 'Select an item…' },
                  ...items.map((i) => ({ value: i.code, label: `${i.code} — ${i.name}` })),
                ]}
              />
              {editUid && (
                <p className="mt-1 text-2xs text-fg-muted">
                  The item cannot be changed — create a policy for the other item instead.
                </p>
              )}
            </div>

            <div className="col-span-2">
              <Select
                label="Lot Size Rule" required value={form.lotSizeRule}
                onChange={(e) => setForm({ ...form, lotSizeRule: e.target.value })}
                options={LOT_SIZE_RULES.map((r) => ({ value: r.value, label: r.label }))}
              />
              {selectedRule && (
                <p className="mt-1 text-2xs text-fg-muted">{selectedRule.hint}</p>
              )}
            </div>

            <Input
              label="Minimum Order Quantity" type="number" min="0"
              value={form.minOrderQty} error={errors.minOrderQty}
              onChange={(e) => setForm({ ...form, minOrderQty: e.target.value })}
            />
            <Input
              label="Order Multiple" type="number" min="0"
              value={form.orderMultiple} error={errors.orderMultiple}
              onChange={(e) => setForm({ ...form, orderMultiple: e.target.value })}
            />

            <Input
              label="Safety Stock Override"
              placeholder="Blank = use the item master"
              type="number" min="0" value={form.safetyStockOverride}
              onChange={(e) => setForm({ ...form, safetyStockOverride: e.target.value })}
            />
            <Input
              label="Lead Time Override (days)"
              placeholder="Blank = use the item master"
              type="number" min="0" value={form.leadTimeOverride}
              onChange={(e) => setForm({ ...form, leadTimeOverride: e.target.value })}
            />

            <Input
              label="Frozen Days" type="number" min="0"
              value={form.frozenDays} error={errors.frozenDays}
              onChange={(e) => setForm({ ...form, frozenDays: e.target.value })}
            />
            <label className="flex items-end gap-2 pb-2 text-sm text-fg">
              <input
                type="checkbox" checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500"
              />
              Active
            </label>

            <div className="col-span-2 rounded-lg border-l-[3px] border-brand-500 bg-brand-50/60 p-3 text-2xs text-fg-muted dark:bg-brand-500/10">
              A new order landing inside the frozen window does not stop the plan — MRP still
              raises it, and flags it as needing planner approval before release.
            </div>
          </div>
        </Modal>
      )}

      {/* ── View ───────────────────────────────────────────────────────── */}
      {viewRecord && (
        <Modal
          open
          onClose={() => setViewRecord(null)}
          title={`${viewRecord.itemCode} — ${viewRecord.itemName || 'Planning policy'}`}
          size="2xl"
          footer={<Button variant="secondary" onClick={() => setViewRecord(null)}>Close</Button>}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {([
              ['Item Code', viewRecord.itemCode],
              ['Item Name', viewRecord.itemName || '—'],
              ['Lot Size Rule', ruleLabel(viewRecord.lotSizeRule)],
              ['Minimum Order Quantity', viewRecord.minOrderQty ? viewRecord.minOrderQty.toLocaleString('en-IN') : '—'],
              ['Order Multiple', viewRecord.orderMultiple ? viewRecord.orderMultiple.toLocaleString('en-IN') : '—'],
              ['Safety Stock', viewRecord.safetyStockOverride == null ? 'Item master default' : viewRecord.safetyStockOverride.toLocaleString('en-IN')],
              ['Lead Time', viewRecord.leadTimeOverride == null ? 'Item master default' : `${viewRecord.leadTimeOverride} days`],
              ['Frozen Days', viewRecord.frozenDays ? `${viewRecord.frozenDays} days` : 'Not frozen'],
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
        title="Deactivate this policy?"
        message={`${confirm?.itemCode ?? ''} will be planned lot-for-lot from the next MRP run, using the item master's lead time and minimum stock. The policy is kept and can be reactivated.`}
        confirmLabel="Deactivate"
        busy={update.isPending}
        onConfirm={runDeactivate}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}

export default PlanningPolicyPage
