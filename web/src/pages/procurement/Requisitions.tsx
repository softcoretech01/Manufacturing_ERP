import { useMemo, useState } from 'react'
import { Check, ClipboardList, Plus, Send, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ApprovalTrail, DetailBlock, PriorityBadge, ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { newUid, useCollection } from '@/store/data'
import { requisitions as seedRequisitions } from '@/mock/procurement'
import { items as masterItems } from '@/mock/masters'
import type { PrLine, PurchaseRequisition } from '@/types/procurement'

const SOURCES = ['MANUAL', 'MRP', 'REORDER', 'PRODUCTION', 'PROJECT', 'MAINTENANCE']
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
const DEPARTMENTS = ['Production Planning', 'Production', 'Stores', 'Maintenance', 'Quality', 'Packing', 'Administration']
const PLANTS = ['Chennai — Unit 1', 'Hosur — Unit 2']

/** One row of the item grid. The rate is never typed — it comes from the master. */
interface LineEntry {
  itemUid: string
  qty: string
}

interface FormState {
  department: string
  requestedBy: string
  plant: string
  source: string
  priority: string
  requiredBy: string
  justification: string
  lines: LineEntry[]
}

const emptyForm: FormState = {
  department: 'Production Planning',
  requestedBy: '',
  plant: PLANTS[0],
  source: 'MANUAL',
  priority: 'NORMAL',
  requiredBy: '',
  justification: '',
  lines: [],
}

export function RequisitionsPage() {
  const toast = useToast()
  const seed = useMemo(() => seedRequisitions, [])
  const { rows, create, update, remove } = useCollection<PurchaseRequisition>('proc:pr', seed)

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<PurchaseRequisition | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PurchaseRequisition | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<PurchaseRequisition | null>(null)

  /**
   * Only purchasable items can be requisitioned, and the rate is whatever the
   * item master last paid — a requester estimating their own price is how a
   * requisition ends up approved against a number nobody can source at.
   */
  const purchasable = useMemo(() => masterItems.filter((i) => i.isPurchased), [])

  /** The form's item grid, costed from the master. */
  const costedLines = form.lines.map((l) => {
    const item = purchasable.find((i) => i.uid === l.itemUid)
    const qty = Number(l.qty) || 0
    const rate = item ? item.lastPurchaseRate || item.standardCost : 0
    return { entry: l, item, qty, rate, amount: qty * rate }
  })
  const grandTotal = costedLines.reduce((s2, l) => s2 + l.amount, 0)

  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, { itemUid: purchasable[0]?.uid ?? '', qty: '' }] }))
  }
  function setLine(i: number, patch: Partial<LineEntry>) {
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  }
  function removeLine(i: number) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))
  }

  const counts = {
    all: rows.length,
    draft: rows.filter((r) => r.status === 'DRAFT').length,
    pending: rows.filter((r) => r.status === 'PENDING_APPROVAL').length,
    approved: rows.filter((r) => r.status === 'APPROVED' || r.status === 'PARTIALLY_EXECUTED').length,
    closed: rows.filter((r) => ['CLOSED', 'CANCELLED', 'REJECTED'].includes(r.status)).length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'draft') return r.status === 'DRAFT'
    if (tab === 'pending') return r.status === 'PENDING_APPROVAL'
    if (tab === 'approved') return r.status === 'APPROVED' || r.status === 'PARTIALLY_EXECUTED'
    if (tab === 'closed') return ['CLOSED', 'CANCELLED', 'REJECTED'].includes(r.status)
    return true
  })

  const columns: Column<PurchaseRequisition>[] = [
    { key: 'docNo', header: 'Requisition', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (r) => r.docDate, render: (r) => formatDate(r.docDate) },
    { key: 'department', header: 'Department', sortable: true },
    { key: 'requestedBy', header: 'Requested by', sortable: true },
    { key: 'source', header: 'Source', sortable: true, width: '7rem', render: (r) => <span className="text-xs text-fg-muted">{r.source.replace('_', ' ').toLowerCase()}</span> },
    { key: 'priority', header: 'Priority', sortable: true, width: '6rem', render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: 'requiredBy', header: 'Required by', sortable: true, width: '7rem', accessor: (r) => r.requiredBy, render: (r) => formatDate(r.requiredBy) },
    { key: 'lineCount', header: 'Lines', align: 'right', width: '4.5rem', accessor: (r) => r.lines.length },
    { key: 'estimatedValue', header: 'Est. value', align: 'right', sortable: true, accessor: (r) => r.estimatedValue, render: (r) => formatCurrency(r.estimatedValue) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'purchase-requisitions', 'Purchase requisitions', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(r: PurchaseRequisition) {
    setEditing(r)
    setForm({
      department: r.department,
      requestedBy: r.requestedBy,
      plant: r.plant,
      source: r.source,
      priority: r.priority,
      requiredBy: r.requiredBy,
      justification: r.justification,
      lines: r.lines.map((l) => ({
        itemUid: masterItems.find((i) => i.code === l.itemCode)?.uid ?? '',
        qty: String(l.qty),
      })),
    })
    setErrors({})
    setFormOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.requestedBy.trim()) e.requestedBy = 'Requester is required.'
    if (!form.requiredBy) e.requiredBy = 'A required-by date is mandatory.'
    if (!form.justification.trim() || form.justification.trim().length < 15)
      e.justification = 'Give a justification of at least 15 characters; it is shown to the approver.'
    if (!form.lines.length) e.lines = 'Add at least one item — a requisition with no items cannot be sourced.'
    else if (form.lines.some((l) => !l.itemUid)) e.lines = 'Every row needs an item.'
    else if (form.lines.some((l) => !(Number(l.qty) > 0))) e.lines = 'Enter a quantity greater than zero on every row.'
    else if (new Set(form.lines.map((l) => l.itemUid)).size !== form.lines.length)
      e.lines = 'The same item appears twice — combine the quantities into one row.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function save(submit: boolean) {
    if (!validate()) return
    const patch = {
      department: form.department,
      requestedBy: form.requestedBy.trim(),
      plant: form.plant,
      source: form.source as PurchaseRequisition['source'],
      priority: form.priority as PurchaseRequisition['priority'],
      requiredBy: form.requiredBy,
      // Still stored — downstream sourcing, comparison and budget reporting all
      // read it — but derived from the item lines rather than typed.
      estimatedValue: grandTotal,
      justification: form.justification.trim(),
      lines: costedLines.map<PrLine>((l, i) => ({
        uid: `prl-${Date.now().toString(36)}-${i}`,
        itemCode: l.item?.code ?? '',
        itemName: l.item?.name ?? '',
        uom: l.item?.purchaseUom ?? l.item?.baseUom ?? 'NOS',
        qty: l.qty,
        qtyOrdered: 0,
        requiredBy: form.requiredBy,
        estimatedRate: l.rate,
        costCentre: '',
        specification: l.item?.specification,
      })),
      status: (submit ? 'PENDING_APPROVAL' : 'DRAFT') as PurchaseRequisition['status'],
    }

    if (editing) {
      update(editing.uid, { ...patch, version: editing.version + 1 })
      toast.success('Requisition updated', `${editing.docNo} saved as version ${editing.version + 1}.`)
    } else {
      const next = Math.max(...rows.map((r) => Number(r.docNo.slice(-5)) || 0)) + 1
      const docNo = `PR/26-27/${String(next).padStart(5, '0')}`
      create({
        uid: newUid('pr'),
        docNo,
        docDate: new Date().toISOString().slice(0, 10),
        createdBy: form.requestedBy.trim(),
        createdAt: new Date().toISOString(),
        version: 1,
        attachments: 0,
        comments: 0,
        budgetAvailable: 0,
        budgetCode: '',
        approvals: submit ? [{ level: 1, role: 'Purchase Manager', approver: 'P. Suresh', status: 'PENDING' }] : [],
        ...patch,
      } as PurchaseRequisition)
      toast.success(submit ? 'Requisition submitted' : 'Draft saved', `${docNo} created.`)
    }
    setFormOpen(false)
  }

  function decide(r: PurchaseRequisition, approve: boolean) {
    update(r.uid, {
      status: approve ? 'APPROVED' : 'REJECTED',
      approvals: r.approvals.map((a) =>
        a.status === 'PENDING' ? { ...a, status: approve ? 'APPROVED' : 'REJECTED', actedAt: new Date().toISOString() } : a,
      ),
    })
    toast.success(approve ? 'Approved' : 'Rejected', `${r.docNo} moved to ${approve ? 'approved' : 'rejected'}.`)
    setDetail(null)
  }

  return (
    <div>
      <PageHeader
        title="Purchase requisitions"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Requisitions' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New requisition
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'draft', label: 'Draft', count: counts.draft },
              { id: 'pending', label: 'Pending approval', count: counts.pending },
              { id: 'approved', label: 'Approved', count: counts.approved },
              { id: 'closed', label: 'Closed', count: counts.closed },
            ]}
          />
        }
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search by number, item, requester…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No requisitions"
        emptyDescription="Raise one manually, or accept an MRP suggestion to generate it."
        rowActions={(r) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem label="Edit" disabled={!['DRAFT', 'REJECTED'].includes(r.status)} onClick={() => openEdit(r)} />
            <MenuItem
              label="Submit for approval"
              icon={<Send />}
              disabled={r.status !== 'DRAFT'}
              onClick={() => {
                update(r.uid, { status: 'PENDING_APPROVAL', approvals: [{ level: 1, role: 'Purchase Manager', approver: 'P. Suresh', status: 'PENDING' }] })
                toast.success('Submitted', `${r.docNo} sent for approval.`)
              }}
            />
            <MenuItem label="Approve" icon={<Check />} separatorBefore disabled={r.status !== 'PENDING_APPROVAL'} onClick={() => decide(r, true)} />
            <MenuItem label="Reject" icon={<X />} danger disabled={r.status !== 'PENDING_APPROVAL'} onClick={() => decide(r, false)} />
            <MenuItem
              label={r.convertedTo ? `Delete — blocked (${r.convertedTo})` : 'Delete'}
              icon={<Trash2 />}
              danger
              separatorBefore
              disabled={!!r.convertedTo}
              onClick={() => setConfirmDelete(r)}
            />
          </>
        )}
      />

      {/* Detail ------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.department} · ${detail.plant}` : undefined}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                Version {detail.version} · {detail.attachments} attachments · {detail.comments} comments
              </span>
              <div className="flex gap-2">
                {detail.status === 'PENDING_APPROVAL' && (
                  <>
                    <Button variant="danger" size="sm" onClick={() => decide(detail, false)}>
                      Reject
                    </Button>
                    <Button variant="success" size="sm" onClick={() => decide(detail, true)}>
                      Approve
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
                  Close
                </Button>
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ProcStatusBadge status={detail.status} />
              <PriorityBadge priority={detail.priority} />
              {detail.convertedTo && <span className="text-2xs text-fg-muted">Converted to {detail.convertedTo}</span>}
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Requested by', value: detail.requestedBy },
                { label: 'Source', value: detail.source.replace('_', ' ').toLowerCase() },
                { label: 'Document date', value: formatDate(detail.docDate) },
                { label: 'Required by', value: formatDate(detail.requiredBy) },
                { label: 'Estimated value', value: formatCurrency(detail.estimatedValue) },
                { label: 'Plant', value: detail.plant },
              ]}
            />

            <DetailBlock title="Justification">
              <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">
                {detail.justification}
              </p>
            </DetailBlock>

            <DetailBlock title={`Lines (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th>UoM</th>
                      <th className="text-right">Est. rate</th>
                      <th className="text-right">Value</th>
                      <th>Required by</th>
                      <th className="text-right">Ordered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                          {l.specification && <p className="mt-0.5 text-2xs text-fg-muted">{l.specification}</p>}
                        </td>
                        <td className="text-right tabular">{l.qty.toLocaleString('en-IN')}</td>
                        <td className="text-2xs">{l.uom}</td>
                        <td className="text-right tabular">{formatCurrency(l.estimatedRate)}</td>
                        <td className="text-right tabular">{formatCurrency(l.qty * l.estimatedRate)}</td>
                        <td className="text-2xs">{formatDate(l.requiredBy)}</td>
                        <td className="text-right tabular">{l.qtyOrdered.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title="Approval trail">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>

            {detail.remarks && (
              <DetailBlock title="Remarks">
                <p className="text-xs text-fg-muted">{detail.remarks}</p>
              </DetailBlock>
            )}
          </div>
        )}
      </Drawer>

      {/* Create / edit ------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.docNo}` : 'New purchase requisition'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => save(false)}>
              Save draft
            </Button>
            <Button variant="primary" onClick={() => save(true)}>
              {editing ? 'Save and submit' : 'Create and submit'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input
            label="Requested by"
            required
            value={form.requestedBy}
            error={errors.requestedBy}
            onChange={(e) => setForm({ ...form, requestedBy: e.target.value })}
          />
          <Select
            label="Department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            options={DEPARTMENTS.map((v) => ({ value: v, label: v }))}
          />
          <Select label="Plant" value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })} options={PLANTS.map((v) => ({ value: v, label: v }))} />
          <Select
            label="Source"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            options={SOURCES.map((v) => ({ value: v, label: v.replace('_', ' ').toLowerCase() }))}
          />
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            options={PRIORITIES.map((v) => ({ value: v, label: v.toLowerCase() }))}
          />
          <Input
            label="Required by"
            type="date"
            required
            value={form.requiredBy}
            error={errors.requiredBy}
            onChange={(e) => setForm({ ...form, requiredBy: e.target.value })}
          />
          <Textarea
            label="Justification"
            required
            containerClassName="sm:col-span-2"
            rows={3}
            value={form.justification}
            error={errors.justification}
            hint="Shown to every approver in the chain."
            onChange={(e) => setForm({ ...form, justification: e.target.value })}
          />
        </div>

        {/* ── Items ─────────────────────────────────────────────────────── */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
              Items ({form.lines.length})
            </p>
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={addLine} disabled={!purchasable.length}>
              Add item
            </Button>
          </div>

          {errors.lines && <Alert tone="danger" className="mb-2">{errors.lines}</Alert>}

          <div className="overflow-x-auto rounded border border-border">
            <table className="grid-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '16rem' }}>Item</th>
                  <th className="text-right" style={{ width: '8rem' }}>Qty *</th>
                  <th style={{ width: '5rem' }}>UoM</th>
                  <th className="text-right" style={{ width: '9rem' }}>Unit price</th>
                  <th className="text-right" style={{ width: '10rem' }}>Amount</th>
                  <th style={{ width: '3rem' }} />
                </tr>
              </thead>
              <tbody>
                {costedLines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        value={l.entry.itemUid}
                        aria-label={`Item on row ${i + 1}`}
                        onChange={(e) => setLine(i, { itemUid: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-xs text-fg focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">Select an item…</option>
                        {purchasable.map((it) => (
                          <option key={it.uid} value={it.uid}>
                            {it.code} — {it.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={l.entry.qty}
                        aria-label={`Quantity on row ${i + 1}`}
                        onChange={(e) => setLine(i, { qty: e.target.value })}
                        className="h-7 w-full rounded border border-border bg-surface px-2 text-right text-xs tabular text-fg focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td className="text-2xs text-fg-muted">{l.item?.purchaseUom ?? '—'}</td>
                    <td className="text-right tabular text-xs text-fg-muted">
                      {l.item ? l.rate.toFixed(2) : '—'}
                    </td>
                    <td className="text-right tabular text-xs font-medium text-fg">
                      {l.item && l.qty ? formatCurrency(l.amount) : '—'}
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        aria-label={`Remove row ${i + 1}`}
                        className="text-fg-subtle hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!form.lines.length && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-2xs text-fg-subtle">
                      No items yet. Use <span className="font-medium text-fg-muted">Add item</span> — the list comes from
                      the item master and the unit price comes with it.
                    </td>
                  </tr>
                )}
              </tbody>
              {form.lines.length > 0 && (
                <tfoot>
                  <tr className="bg-surface-2">
                    <td colSpan={4} className="text-right text-xs font-semibold text-fg">Grand total</td>
                    <td className="text-right text-sm font-semibold tabular text-fg">{formatCurrency(grandTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-1.5 text-2xs text-fg-subtle">
            Unit price is the item master's last purchase rate, falling back to standard cost. It is not editable here —
            the real price is settled by the quotations this requisition goes on to attract.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete requisition"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  toast.success('Deleted', `${confirmDelete.docNo} soft-deleted; the audit trail is retained.`)
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.docNo} will be marked deleted, not physically removed. It stays visible in the audit trail
          and can be restored.
        </p>
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Where requisitions go next" />
        <CardBody className="grid gap-2 text-xs text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Approved, single source</span> — converted straight to a purchase
            order against an existing rate contract.
          </p>
          <p>
            <span className="font-medium text-fg">Approved, competitive</span> — grouped by category into an RFQ, then
            awarded on the comparison matrix.
          </p>
          <p>
            <span className="font-medium text-fg">Rejected or cancelled</span> — closed with a reason code; the budget
            commitment is released the same day.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
