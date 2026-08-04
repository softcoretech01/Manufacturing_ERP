import { useMemo, useState } from 'react'
import { Award, Handshake, Mail, Plus, Scale, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Checkbox, Input, Select, Switch, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ApprovalTrail, DetailBlock, ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { newUid, useCollection } from '@/store/data'
import { negotiations, quotations as seedQuotations, requisitions as seedPrs, rfqs as seedRfqs } from '@/mock/procurement'
import type { PurchaseRequisition, Rfq, SupplierQuotation } from '@/types/procurement'
import { nextDocNo, rfqLinesFromPr, sourceableRequisitions, VENDORS } from '@/lib/procFlow'
import { cn } from '@/lib/cn'

const CATEGORIES = [
  'Raw material — steel',
  'Plastic components',
  'Packaging',
  'Surface treatment',
  'Components & tooling',
  'Instruments',
  'Logistics',
  'Job work',
]

export function RfqPage() {
  const toast = useToast()
  const seed = useMemo(() => seedRfqs, [])
  const prSeed = useMemo(() => seedPrs, [])
  const qSeed = useMemo(() => seedQuotations, [])
  const { rows, create, update, remove } = useCollection<Rfq>('proc:rfq', seed)
  const { rows: prs, update: updatePr } = useCollection<PurchaseRequisition>('proc:pr', prSeed)
  const { rows: quotations } = useCollection<SupplierQuotation>('proc:sq', qSeed)

  /** Approved requisitions that have not been sourced yet. */
  const sourceable = sourceableRequisitions(prs, rows)

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<Rfq | null>(null)
  const [compare, setCompare] = useState<Rfq | null>(null)
  const [negotiate, setNegotiate] = useState<SupplierQuotation | null>(null)
  const [target, setTarget] = useState('3')
  const [note, setNote] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Rfq | null>(null)
  const [form, setForm] = useState({ prNo: '', title: '', category: CATEGORIES[0], buyer: '', quoteDueBy: '', estimatedValue: '', sealed: true, plant: 'Chennai — Unit 1' })
  const [vendorUids, setVendorUids] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  /** Lines the selected requisition would carry into the RFQ. */
  const prLinesPreview = useMemo(() => {
    const pr = prs.find((p) => p.docNo === form.prNo)
    return pr ? rfqLinesFromPr(pr) : []
  }, [prs, form.prNo])
  const [confirmDelete, setConfirmDelete] = useState<Rfq | null>(null)

  const counts = {
    all: rows.length,
    open: rows.filter((r) => r.status === 'IN_PROGRESS' || r.status === 'PENDING_APPROVAL').length,
    awarded: rows.filter((r) => r.status === 'COMPLETED').length,
    closed: rows.filter((r) => r.status === 'CANCELLED').length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'open') return r.status === 'IN_PROGRESS' || r.status === 'PENDING_APPROVAL'
    if (tab === 'awarded') return r.status === 'COMPLETED'
    if (tab === 'closed') return r.status === 'CANCELLED'
    return true
  })

  const columns: Column<Rfq>[] = [
    { key: 'docNo', header: 'RFQ', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="text-xs font-medium text-fg">{r.title}</span> },
    { key: 'category', header: 'Category', sortable: true },
    { key: 'buyer', header: 'Buyer', sortable: true, width: '8rem' },
    { key: 'quoteDueBy', header: 'Quotes due', sortable: true, width: '7rem', accessor: (r) => r.quoteDueBy, render: (r) => formatDate(r.quoteDueBy) },
    {
      key: 'responses',
      header: 'Responses',
      width: '9rem',
      accessor: (r) => `${r.suppliers.filter((s) => s.responseStatus === 'QUOTED').length}/${r.suppliers.length}`,
      render: (r) => {
        const q = r.suppliers.filter((s) => s.responseStatus === 'QUOTED').length
        return (
          <div className="w-24">
            <ProgressBar value={(q / Math.max(1, r.suppliers.length)) * 100} tone={q === 0 ? 'danger' : q < 3 ? 'warning' : 'success'} />
            <span className="mt-0.5 block text-2xs text-fg-muted tabular">
              {q} of {r.suppliers.length} quoted
            </span>
          </div>
        )
      },
    },
    { key: 'sealed', header: 'Sealed', align: 'center', width: '5rem', accessor: (r) => (r.sealed ? 'Yes' : 'No'), render: (r) => (r.sealed ? <Badge tone="brand" size="sm" dot={false}>Sealed</Badge> : <span className="text-2xs text-fg-subtle">Open</span>) },
    { key: 'estimatedValue', header: 'Est. value', align: 'right', sortable: true, accessor: (r) => r.estimatedValue, render: (r) => formatCurrency(r.estimatedValue) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'rfqs', 'Requests for quotation', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** Everything the RFQ needs is already on the requisition — pull it across. */
  function applyPr(prNo: string) {
    const pr = sourceable.find((p) => p.docNo === prNo)
    if (!pr) {
      setForm((f) => ({ ...f, prNo }))
      return
    }
    const due = new Date()
    due.setDate(due.getDate() + 7)
    setForm((f) => ({
      ...f,
      prNo,
      title: `${pr.lines[0]?.itemName ?? pr.department}${pr.lines.length > 1 ? ` +${pr.lines.length - 1} more` : ''}`,
      buyer: f.buyer || pr.requestedBy,
      quoteDueBy: f.quoteDueBy || due.toISOString().slice(0, 10),
      estimatedValue: String(pr.estimatedValue),
      plant: pr.plant,
    }))
  }

  function openCreate() {
    setEditing(null)
    const first = sourceable[0]
    setForm({ prNo: '', title: '', category: CATEGORIES[0], buyer: '', quoteDueBy: '', estimatedValue: '', sealed: true, plant: 'Chennai — Unit 1' })
    setVendorUids([])
    setErrors({})
    setFormOpen(true)
    if (first) setTimeout(() => applyPr(first.docNo), 0)
  }

  function openEdit(r: Rfq) {
    setEditing(r)
    setVendorUids(r.suppliers.map((s) => s.supplierUid))
    setForm({
      prNo: r.prRefs[0] ?? '',
      title: r.title,
      category: r.category,
      buyer: r.buyer,
      quoteDueBy: r.quoteDueBy,
      estimatedValue: String(r.estimatedValue),
      sealed: r.sealed,
      plant: r.plant,
    })
    setErrors({})
    setFormOpen(true)
  }

  function save() {
    const e: Record<string, string> = {}
    if (!editing && !form.prNo) e.prNo = 'Select the approved requisition this RFQ sources.'
    if (!form.title.trim()) e.title = 'Title is required.'
    if (!form.buyer.trim()) e.buyer = 'Assign a buyer.'
    if (!form.quoteDueBy) e.quoteDueBy = 'A quote due date is required.'
    const v = Number(form.estimatedValue)
    if (!form.estimatedValue || Number.isNaN(v) || v <= 0) e.estimatedValue = 'Enter a positive estimated value.'
    if (!editing && vendorUids.length < 2) e.vendors = 'Invite at least two vendors — a comparison needs something to compare.'
    setErrors(e)
    if (Object.keys(e).length) return

    const patch = {
      title: form.title.trim(),
      category: form.category,
      buyer: form.buyer.trim(),
      quoteDueBy: form.quoteDueBy,
      estimatedValue: v,
      sealed: form.sealed,
      plant: form.plant,
    }

    if (editing) {
      update(editing.uid, { ...patch, version: editing.version + 1 })
      toast.success('RFQ updated', `${editing.docNo} saved.`)
    } else {
      const pr = sourceable.find((p) => p.docNo === form.prNo)
      if (!pr) return
      const docNo = nextDocNo('RFQ', rows, 5)
      const now = new Date().toISOString()
      create({
        uid: newUid('rfq'),
        docNo,
        docDate: now.slice(0, 10),
        // Issued straight away — the requisition already carries the approval,
        // so a second gate before merely asking for prices adds delay, not control.
        status: 'IN_PROGRESS',
        prRefs: [pr.docNo],
        currency: 'INR',
        createdBy: form.buyer.trim(),
        createdAt: now,
        version: 1,
        attachments: 0,
        comments: 0,
        approvals: [],
        lines: rfqLinesFromPr(pr),
        suppliers: vendorUids.map((uid) => ({
          supplierUid: uid,
          supplierName: VENDORS.find((x) => x.uid === uid)?.name ?? uid,
          invitedAt: now,
          responseStatus: 'INVITED' as const,
        })),
        ...patch,
      } as Rfq)
      updatePr(pr.uid, { convertedTo: docNo })
      toast.success(
        'RFQ issued',
        `${docNo} raised from ${pr.docNo} with ${pr.lines.length} item${pr.lines.length > 1 ? 's' : ''}, sent to ${vendorUids.length} vendors. Record their quotations next.`,
      )
    }
    setFormOpen(false)
  }

  function sendNegotiation() {
    if (!negotiate) return
    const pct = Number(target)
    if (Number.isNaN(pct) || pct <= 0) {
      toast.error('Invalid target', 'Enter a positive reduction percentage.')
      return
    }
    toast.success(
      `Round ${negotiate.negotiationRounds + 1} sent`,
      `${negotiate.supplierName} asked for ${pct}% — target ${formatCurrency(negotiate.landedValue * (1 - pct / 100))}.`,
    )
    setNegotiate(null)
    setNote('')
  }

  return (
    <div>
      <PageHeader
        title="RFQ & quotations"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'RFQ' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New RFQ
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'open', label: 'Open', count: counts.open },
              { id: 'awarded', label: 'Awarded', count: counts.awarded },
              { id: 'closed', label: 'Cancelled', count: counts.closed },
            ]}
          />
        }
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search RFQ, title, category…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No RFQs"
        rowActions={(r) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem label="Compare quotations" icon={<Scale />} disabled={!r.suppliers.some((s) => s.responseStatus === 'QUOTED')} onClick={() => setCompare(r)} />
            <MenuItem label="Edit" disabled={r.status === 'COMPLETED' || r.status === 'CANCELLED'} onClick={() => openEdit(r)} />
            <MenuItem
              label="Issue to suppliers"
              icon={<Send />}
              separatorBefore
              disabled={r.status !== 'DRAFT' && r.status !== 'PENDING_APPROVAL'}
              onClick={() => {
                update(r.uid, { status: 'IN_PROGRESS' })
                toast.success('RFQ issued', `${r.suppliers.length || 'No'} suppliers notified by email and on the supplier portal.`)
              }}
            />
            <MenuItem
              label="Cancel RFQ"
              danger
              disabled={r.status === 'CANCELLED' || r.status === 'COMPLETED'}
              onClick={() => {
                update(r.uid, { status: 'CANCELLED', remarks: 'Cancelled by the buyer.' })
                toast.success('Cancelled', `${r.docNo} closed with a reason code.`)
              }}
            />
            <MenuItem label="Delete" icon={<Trash2 />} danger separatorBefore disabled={r.status === 'COMPLETED'} onClick={() => setConfirmDelete(r)} />
          </>
        )}
      />

      {/* RFQ detail ---------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail?.title}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCompare(detail); setDetail(null) }} disabled={!detail.suppliers.some((s) => s.responseStatus === 'QUOTED')}>
                Compare quotations
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ProcStatusBadge status={detail.status} />
              {detail.sealed && <Badge tone="brand" size="sm">Sealed bid</Badge>}
              {detail.awardedTo && <span className="text-2xs text-success">Awarded to {detail.awardedTo}</span>}
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Category', value: detail.category },
                { label: 'Buyer', value: detail.buyer },
                { label: 'Issued', value: formatDate(detail.docDate) },
                { label: 'Quotes due', value: formatDate(detail.quoteDueBy) },
                { label: 'Estimated value', value: formatCurrency(detail.estimatedValue) },
                { label: 'Requisitions', value: detail.prRefs.join(', ') || '—' },
              ]}
            />

            <DetailBlock title={`Lines (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th>UoM</th>
                      <th>Required by</th>
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
                        <td className="text-2xs">{formatDate(l.requiredBy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title={`Invited suppliers (${detail.suppliers.length})`}>
              <div className="space-y-1.5">
                {detail.suppliers.map((s) => (
                  <div key={s.supplierUid} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-fg">{s.supplierName}</p>
                      <p className="text-2xs text-fg-muted">
                        Invited {formatDateTime(s.invitedAt)}
                        {s.respondedAt && ` · responded ${formatDateTime(s.respondedAt)}`}
                      </p>
                    </div>
                    <ProcStatusBadge status={s.responseStatus} size="sm" />
                  </div>
                ))}
              </div>
            </DetailBlock>

            <DetailBlock title="Approval trail">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>
          </div>
        )}
      </Drawer>

      {/* Comparison matrix ---------------------------------------------------- */}
      <Modal open={!!compare} onClose={() => setCompare(null)} title={`Quotation comparison — ${compare?.docNo ?? ''}`} size="xl">
        {compare && <ComparisonMatrix rfq={compare} quotations={quotations} onNegotiate={setNegotiate} onAward={(q) => {
          update(compare.uid, { status: 'COMPLETED', awardedTo: q.supplierName })
          toast.success('Awarded', `${compare.docNo} awarded to ${q.supplierName} at ${formatCurrency(q.landedValue)}.`)
          setCompare(null)
        }} />}
      </Modal>

      {/* Negotiation ---------------------------------------------------------- */}
      <Modal
        open={!!negotiate}
        onClose={() => setNegotiate(null)}
        title={`Negotiate — ${negotiate?.supplierName ?? ''}`}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setNegotiate(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={sendNegotiation}>
              Send round {(negotiate?.negotiationRounds ?? 0) + 1}
            </Button>
          </>
        }
      >
        {negotiate && (
          <div className="space-y-4">
            <DataGrid
              columns={2}
              items={[
                { label: 'Current landed value', value: formatCurrency(negotiate.landedValue) },
                { label: 'Rank', value: `#${negotiate.rank}` },
                { label: 'Lead time', value: `${negotiate.leadTimeDays} days` },
                { label: 'Rounds so far', value: negotiate.negotiationRounds },
              ]}
            />
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Input label="Target reduction (%)" type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
              <Input
                label="Target value"
                readOnly
                value={formatCurrency(negotiate.landedValue * (1 - (Number(target) || 0) / 100))}
                className="bg-surface-2"
              />
            </div>
            <Textarea label="Message to supplier" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reference the benchmark, the volume commitment, or the lead-time trade-off you are offering." />

            {negotiations.filter((n) => n.quotationUid === negotiate.uid).length > 0 && (
              <DetailBlock title="Round history">
                <div className="space-y-2">
                  {negotiations
                    .filter((n) => n.quotationUid === negotiate.uid)
                    .map((n) => (
                      <div key={n.uid} className="rounded border border-border p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-fg">Round {n.round}</span>
                          <ProcStatusBadge status={n.outcome} size="sm" />
                        </div>
                        <p className="mt-1 text-2xs text-fg-muted">
                          {formatCurrency(n.previousValue)} → {formatCurrency(n.offeredValue)} · saved{' '}
                          <span className="font-medium text-success">{formatCurrency(n.savings)}</span>
                        </p>
                        <p className="mt-0.5 text-2xs italic text-fg-subtle">{n.note}</p>
                      </div>
                    ))}
                </div>
              </DetailBlock>
            )}
          </div>
        )}
      </Modal>

      {/* Create / edit --------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.docNo}` : 'New RFQ'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save changes' : 'Create RFQ'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!editing && !sourceable.length && (
            <Alert tone="warning" title="No approved requisition is waiting to be sourced">
              An RFQ is raised from an approved requisition. Create one on the Purchase Requisition screen and get it
              approved first.
            </Alert>
          )}

          <div className="grid gap-3.5 sm:grid-cols-2">
            {!editing && (
              <Select
                label="Purchase requisition"
                required
                containerClassName="sm:col-span-2"
                value={form.prNo}
                error={errors.prNo}
                onChange={(e) => applyPr(e.target.value)}
                hint="Approved requisitions not yet sourced. Selecting one fills the rest of this form."
                options={[
                  { value: '', label: sourceable.length ? 'Select a requisition…' : 'Nothing approved and unsourced' },
                  ...sourceable.map((p) => ({ value: p.docNo, label: `${p.docNo} — ${p.department} · ${p.lines.length} items · ${formatCurrency(p.estimatedValue)}` })),
                ]}
              />
            )}
            <Input label="Title" required containerClassName="sm:col-span-2" value={form.title} error={errors.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
            <Input label="Buyer" required value={form.buyer} error={errors.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} />
            <Input label="Quotes due by" type="date" required value={form.quoteDueBy} error={errors.quoteDueBy} onChange={(e) => setForm({ ...form, quoteDueBy: e.target.value })} />
            <Input label="Estimated value (₹)" type="number" required value={form.estimatedValue} error={errors.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} />
            <Select label="Plant" value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })} options={[{ value: 'Chennai — Unit 1', label: 'Chennai — Unit 1' }, { value: 'Hosur — Unit 2', label: 'Hosur — Unit 2' }]} />
            <div className="flex items-end pb-1">
              <Switch checked={form.sealed} onChange={(v) => setForm({ ...form, sealed: v })} label="Sealed bid" />
            </div>
          </div>

          {!editing && prLinesPreview.length > 0 && (
            <DetailBlock title={`Items carried from ${form.prNo} (${prLinesPreview.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th>Required by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prLinesPreview.map((l) => (
                      <tr key={l.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                        </td>
                        <td className="text-right tabular">{l.qty.toLocaleString('en-IN')} {l.uom}</td>
                        <td className="text-2xs">{formatDate(l.requiredBy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>
          )}

          {!editing && (
            <DetailBlock title={`Invite vendors (${vendorUids.length} selected)`}>
              {errors.vendors && <p className="mb-2 text-2xs text-danger">{errors.vendors}</p>}
              <div className="grid gap-1.5 sm:grid-cols-2">
                {VENDORS.map((v) => (
                  <Checkbox
                    key={v.uid}
                    checked={vendorUids.includes(v.uid)}
                    onChange={() =>
                      setVendorUids((prev) => (prev.includes(v.uid) ? prev.filter((x) => x !== v.uid) : [...prev, v.uid]))
                    }
                    label={v.name}
                  />
                ))}
              </div>
              <p className="mt-2 text-2xs text-fg-subtle">
                Only these vendors will be offered on the Vendor Quotations screen for this RFQ.
              </p>
            </DetailBlock>
          )}
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete RFQ"
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
                  toast.success('Deleted', `${confirmDelete.docNo} soft-deleted.`)
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
          {confirmDelete?.docNo} and its supplier invitations will be marked deleted. Quotations already received are
          retained for audit.
        </p>
      </Modal>
    </div>
  )
}

/* ═════════════════════ Comparison matrix (Ch 8) ═════════════════════ */

function ComparisonMatrix({
  rfq,
  quotations,
  onNegotiate,
  onAward,
}: {
  rfq: Rfq
  quotations: SupplierQuotation[]
  onNegotiate: (q: SupplierQuotation) => void
  onAward: (q: SupplierQuotation) => void
}) {
  const quotes = quotations.filter((q) => q.rfqNo === rfq.docNo).sort((a, b) => a.rank - b.rank)
  const [basis, setBasis] = useState<'landed' | 'basic'>('landed')

  if (!quotes.length) return <p className="text-sm text-fg-muted">No quotations received yet.</p>

  const value = (q: SupplierQuotation) => (basis === 'landed' ? q.landedValue : q.basicValue)
  const best = Math.min(...quotes.map(value))
  const bestScore = Math.max(...quotes.map((q) => q.totalScore))
  const bestLead = Math.min(...quotes.map((q) => q.leadTimeDays))

  const rowsSpec: { label: string; render: (q: SupplierQuotation) => React.ReactNode }[] = [
    { label: 'Status', render: (q) => <ProcStatusBadge status={q.status} size="sm" /> },
    { label: 'Basic value', render: (q) => formatCurrency(q.basicValue) },
    { label: 'Tax', render: (q) => formatCurrency(q.taxValue) },
    { label: 'Freight', render: (q) => formatCurrency(q.freightValue) },
    {
      label: 'Landed value',
      render: (q) => (
        <span className={cn('font-semibold', q.landedValue === best && basis === 'landed' ? 'text-success' : 'text-fg')}>
          {formatCurrency(q.landedValue)}
        </span>
      ),
    },
    {
      label: 'Variance vs best',
      render: (q) => {
        const diff = ((value(q) - best) / best) * 100
        return diff === 0 ? <span className="text-2xs font-medium text-success">Best</span> : <span className="text-2xs text-danger">+{diff.toFixed(1)}%</span>
      },
    },
    { label: 'Lead time', render: (q) => <span className={cn(q.leadTimeDays === bestLead && 'font-medium text-success')}>{q.leadTimeDays} days</span> },
    { label: 'Payment terms', render: (q) => <span className="text-2xs">{q.paymentTerms}</span> },
    { label: 'Delivery terms', render: (q) => <span className="text-2xs">{q.deliveryTerms}</span> },
    { label: 'Warranty', render: (q) => (q.warrantyMonths ? `${q.warrantyMonths} months` : '—') },
    { label: 'Valid till', render: (q) => formatDate(q.validTill) },
    { label: 'Technical score', render: (q) => <ScoreCell value={q.technicalScore} /> },
    { label: 'Commercial score', render: (q) => <ScoreCell value={q.commercialScore} /> },
    {
      label: 'Weighted total',
      render: (q) => (
        <span className={cn('text-sm font-semibold tabular', q.totalScore === bestScore ? 'text-success' : 'text-fg')}>
          {q.totalScore.toFixed(1)}
        </span>
      ),
    },
    { label: 'Negotiation rounds', render: (q) => q.negotiationRounds },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-muted">
          {quotes.length} quotations · ranked on a 60/40 technical–commercial weighting. Landed value includes freight,
          duty and tax so the comparison is like for like.
        </p>
        <Tabs
          variant="pill"
          active={basis}
          onChange={(v) => setBasis(v as 'landed' | 'basic')}
          tabs={[
            { id: 'landed', label: 'Landed cost' },
            { id: 'basic', label: 'Basic price' },
          ]}
        />
      </div>

      <div className="overflow-x-auto rounded border border-border">
        <table className="grid-table">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-surface-2">Criterion</th>
              {quotes.map((q) => (
                <th key={q.uid} className="min-w-[12rem]">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{q.supplierName}</span>
                    {q.rank === 1 && <Award className="h-3.5 w-3.5 shrink-0 text-success" />}
                  </div>
                  <span className="block font-mono text-2xs font-normal text-fg-subtle">{q.docNo}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsSpec.map((r) => (
              <tr key={r.label}>
                <td className="sticky left-0 z-10 bg-surface text-xs font-medium text-fg-muted">{r.label}</td>
                {quotes.map((q) => (
                  <td key={q.uid} className="text-xs">
                    {r.render(q)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-10 bg-surface text-xs font-medium text-fg-muted">Action</td>
              {quotes.map((q) => (
                <td key={q.uid}>
                  <div className="flex gap-1.5">
                    <Button size="xs" variant="outline" onClick={() => onNegotiate(q)} disabled={q.status === 'AWARDED' || q.status === 'REGRETTED'}>
                      Negotiate
                    </Button>
                    <Button size="xs" variant="primary" onClick={() => onAward(q)} disabled={q.status === 'AWARDED'}>
                      Award
                    </Button>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Line-level comparison ------------------------------------------------ */}
      <Card>
        <CardHeader title="Line-by-line landed rate" description="Rate after discount, freight, duty and tax, per unit" />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Qty</th>
                  {quotes.map((q) => (
                    <th key={q.uid} className="text-right">
                      {q.supplierName.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rfq.lines.map((line) => {
                  const rates = quotes.map((q) => q.lines.find((l) => l.itemCode === line.itemCode)?.landedRate ?? null)
                  const valid = rates.filter((r): r is number => r !== null)
                  const min = valid.length ? Math.min(...valid) : 0
                  return (
                    <tr key={line.uid}>
                      <td>
                        <p className="text-xs font-medium text-fg">{line.itemName}</p>
                        <p className="font-mono text-2xs text-fg-subtle">{line.itemCode}</p>
                      </td>
                      <td className="text-right tabular">{line.qty.toLocaleString('en-IN')}</td>
                      {rates.map((r, i) => (
                        <td key={i} className={cn('text-right tabular', r === min && 'font-semibold text-success')}>
                          {r === null ? '—' : `₹${r.toFixed(2)}`}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function ScoreCell({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn('h-full rounded-full', value >= 85 ? 'bg-success' : value >= 70 ? 'bg-warning' : 'bg-danger')}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-2xs tabular">{value}</span>
    </div>
  )
}
