import { useMemo, useState, useEffect } from 'react'
import { Ban, Check, FileText, GitBranch, Plus, Printer, ShoppingCart, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { ApprovalTrail, DelayChip, DetailBlock, FillBar, ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import type { PurchaseRequisition, PurchaseOrder, Rfq, SupplierQuotation } from '@/types/procurement'
import { nextDocNo, orderableRequisitions, poLinesFromQuotation } from '@/lib/procFlow'
import { cn } from '@/lib/cn'

const PO_TYPES: PurchaseOrder['poType'][] = ['STANDARD', 'BLANKET', 'RATE_CONTRACT', 'IMPORT', 'SERVICE', 'ASSET', 'JOB_WORK']
const SUPPLIERS = [
  'Jindal Stainless Limited',
  'Perfect Polymers Private Limited',
  'Coatmaster Powder Coatings LLP',
  'Sri Venkateswara Packaging Industries',
  'Metro Logistics Services Private Limited',
  'Apex Tooling Works',
  'Nordic Vacuum Technologies AB',
  'Chennai Steel Traders',
]
const CANCEL_REASONS = [
  'DEMAND_DROP — customer order deferred or cancelled',
  'PRICE_CHANGE — supplier withdrew the quoted rate',
  'SUPPLIER_DEFAULT — supplier unable to deliver',
  'DUPLICATE — raised twice in error',
  'SPEC_CHANGE — engineering change made the item obsolete',
]

export function OrdersPage() {
  const toast = useToast()
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [prs, setPrs] = useState<PurchaseRequisition[]>([])
  const [rfqs, setRfqs] = useState<Rfq[]>([])
  const [quotations, setQuotations] = useState<SupplierQuotation[]>([])

  useEffect(() => {
    async function load() {
      try {
        const [poData, prData, rfqData, qData] = await Promise.all([
          api.getPurchaseOrders(),
          api.getRequisitions(),
          api.getRfqs(),
          api.getQuotations(),
        ])
        setRows(poData)
        setPrs(prData)
        setRfqs(rfqData)
        setQuotations(qData)
      } catch (e) {
        toast.error('Error', 'Failed to load purchase orders')
      }
    }
    load()
  }, [])

  async function update(uid: string, patch: Partial<PurchaseOrder>) {
    try {
      const existing = rows.find(r => r.uid.toString() === uid.toString())
      if (!existing) return
      await api.updatePurchaseOrder(uid, { ...existing, ...patch })
      const latest = await api.getPurchaseOrders()
      setRows(latest)
    } catch (e) {
      toast.error('Error', 'Failed to update purchase order')
    }
  }

  async function remove(uid: string) {
    try {
      await api.deletePurchaseOrder(uid)
      const latest = await api.getPurchaseOrders()
      setRows(latest)
    } catch (e) {
      toast.error('Error', 'Failed to delete purchase order')
    }
  }

  async function updateQuotation(uid: string, patch: Partial<SupplierQuotation>) {
    try {
      const existing = quotations.find(q => q.uid.toString() === uid.toString())
      if (!existing) return
      await api.updateQuotation(uid, { ...existing, ...patch })
      setQuotations(await api.getQuotations())
    } catch (e) {
      toast.error('Error', 'Failed to update quotation')
    }
  }

  /** Requisitions whose RFQ has an awarded quotation and no order yet. */
  const orderable = orderableRequisitions(prs, rfqs, quotations, rows)

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<PurchaseOrder | null>(null)
  const [detailTab, setDetailTab] = useState('lines')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PurchaseOrder | null>(null)
  const [form, setForm] = useState({
    prNo: '',
    supplierName: SUPPLIERS[0],
    poType: 'STANDARD',
    buyer: '',
    currency: 'INR',
    paymentTerms: '30 days from invoice',
    deliveryWarehouse: 'RM Store — Chennai',
    promisedDate: '',
    basicValue: '',
    plant: 'Chennai — Unit 1',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  /** The award behind the requisition currently chosen in the create form. */
  const awardPreview = orderable.find((o) => o.pr.docNo === form.prNo)?.award
  const [cancelling, setCancelling] = useState<PurchaseOrder | null>(null)
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0])
  const [cancelNote, setCancelNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<PurchaseOrder | null>(null)

  const counts = {
    all: rows.length,
    draft: rows.filter((r) => r.status === 'DRAFT').length,
    pending: rows.filter((r) => r.status === 'PENDING_APPROVAL').length,
    open: rows.filter((r) => ['APPROVED', 'PARTIALLY_EXECUTED', 'IN_PROGRESS', 'ON_HOLD'].includes(r.status)).length,
    closed: rows.filter((r) => ['COMPLETED', 'CLOSED', 'SHORT_CLOSED', 'CANCELLED'].includes(r.status)).length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'draft') return r.status === 'DRAFT'
    if (tab === 'pending') return r.status === 'PENDING_APPROVAL'
    if (tab === 'open') return ['APPROVED', 'PARTIALLY_EXECUTED', 'IN_PROGRESS', 'ON_HOLD'].includes(r.status)
    if (tab === 'closed') return ['COMPLETED', 'CLOSED', 'SHORT_CLOSED', 'CANCELLED'].includes(r.status)
    return true
  })

  const columns: Column<PurchaseOrder>[] = [
    { key: 'docNo', header: 'PO number', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (r) => r.docDate, render: (r) => formatDate(r.docDate) },
    { key: 'supplierName', header: 'Supplier', sortable: true },
    { key: 'poType', header: 'Type', sortable: true, width: '8rem', render: (r) => <Badge tone="neutral" size="sm" dot={false}>{r.poType.replace('_', ' ').toLowerCase()}</Badge> },
    { key: 'buyer', header: 'Buyer', sortable: true, width: '8rem' },
    { key: 'promisedDate', header: 'Promised', sortable: true, width: '7rem', accessor: (r) => r.promisedDate, render: (r) => formatDate(r.promisedDate) },
    { key: 'currency', header: 'Cur', width: '4rem', defaultHidden: true },
    { key: 'totalValue', header: 'Value', align: 'right', sortable: true, accessor: (r) => r.totalValue, render: (r) => formatCurrency(r.totalValue) },
    { key: 'receivedPct', header: 'Received', width: '8rem', accessor: (r) => r.receivedPct, render: (r) => <FillBar pct={r.receivedPct} /> },
    { key: 'billedPct', header: 'Billed', width: '8rem', defaultHidden: true, accessor: (r) => r.billedPct, render: (r) => <FillBar pct={r.billedPct} /> },
    {
      key: 'acknowledged',
      header: 'Ack',
      align: 'center',
      width: '4.5rem',
      accessor: (r) => (r.acknowledged ? 'Yes' : 'No'),
      render: (r) => (r.acknowledged ? <Check className="mx-auto h-3.5 w-3.5 text-success" /> : <span className="text-2xs text-fg-subtle">—</span>),
    },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'purchase-orders', 'Purchase orders', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /**
   * Selecting the requisition is the whole data-entry step: the awarded
   * quotation already holds the vendor, the rates and the terms, so re-keying
   * them is only an opportunity to key them wrong.
   */
  function applyPr(prNo: string) {
    const match = orderable.find((o) => o.pr.docNo === prNo)
    if (!match) {
      setForm((f) => ({ ...f, prNo }))
      return
    }
    const { pr, award } = match
    const due = new Date()
    due.setDate(due.getDate() + (award.leadTimeDays || 14))
    setForm((f) => ({
      ...f,
      prNo,
      supplierName: award.supplierName,
      buyer: f.buyer || pr.requestedBy,
      currency: award.currency || 'INR',
      paymentTerms: award.paymentTerms,
      promisedDate: due.toISOString().slice(0, 10),
      basicValue: String(Math.round(award.basicValue)),
      plant: pr.plant,
    }))
  }

  function openCreate() {
    setEditing(null)
    setForm({ prNo: '', supplierName: SUPPLIERS[0], poType: 'STANDARD', buyer: '', currency: 'INR', paymentTerms: '30 days from invoice', deliveryWarehouse: 'RM Store — Chennai', promisedDate: '', basicValue: '', plant: 'Chennai — Unit 1' })
    setErrors({})
    setFormOpen(true)
    const first = orderable[0]
    if (first) setTimeout(() => applyPr(first.pr.docNo), 0)
  }

  function openEdit(r: PurchaseOrder) {
    setEditing(r)
    setForm({
      prNo: r.prRefs[0] ?? '',
      supplierName: r.supplierName,
      poType: r.poType,
      buyer: r.buyer,
      currency: r.currency,
      paymentTerms: r.paymentTerms,
      deliveryWarehouse: r.deliveryWarehouse,
      promisedDate: r.promisedDate,
      basicValue: String(r.basicValue),
      plant: r.plant,
    })
    setErrors({})
    setFormOpen(true)
  }

  async function save(submit: boolean) {
    const e: Record<string, string> = {}
    if (!editing && !form.prNo) e.prNo = 'Select the requisition whose quotation was awarded.'
    if (!form.buyer.trim()) e.buyer = 'Assign a buyer.'
    if (!form.promisedDate) e.promisedDate = 'A promised delivery date is required.'
    const basic = Number(form.basicValue)
    if (!form.basicValue || Number.isNaN(basic) || basic <= 0) e.basicValue = 'Enter a positive basic value.'
    setErrors(e)
    if (Object.keys(e).length) return

    const tax = form.currency === 'INR' ? basic * 0.18 : 0
    const patch = {
      supplierName: form.supplierName,
      poType: form.poType as PurchaseOrder['poType'],
      buyer: form.buyer.trim(),
      currency: form.currency,
      paymentTerms: form.paymentTerms,
      deliveryWarehouse: form.deliveryWarehouse,
      promisedDate: form.promisedDate,
      plant: form.plant,
      basicValue: basic,
      taxValue: tax,
      totalValue: basic + tax,
      status: (submit ? 'PENDING_APPROVAL' : 'DRAFT') as PurchaseOrder['status'],
    }

    if (editing) {
      await update(editing.uid, { ...patch, version: editing.version + 1 })
      toast.success('Purchase order updated', `${editing.docNo} saved as version ${editing.version + 1}.`)
    } else {
      const match = orderable.find((o) => o.pr.docNo === form.prNo)
      const award = match?.award
      const docNo = nextDocNo('PO', rows, 5)
      try {
        await api.createPurchaseOrder({
          docNo,
          docDate: new Date().toISOString().slice(0, 10),
          supplierUid: award?.supplierUid ?? 'sup-new',
          exchangeRate: form.currency === 'INR' ? 1 : 96.4,
          deliveryTerms: award?.deliveryTerms ?? 'Free delivery',
          rfqNo: match?.rfq.docNo,
          prRefs: match ? [match.pr.docNo] : [],
          discountValue: 0,
          freightValue: 0,
          receivedPct: 0,
          billedPct: 0,
          acknowledged: false,
          createdBy: form.buyer.trim(),
          createdAt: new Date().toISOString(),
          version: 1,
          attachments: 0,
          comments: 0,
          approvals: submit ? [{ level: 1, role: 'Purchase Manager', approver: 'P. Suresh', status: 'PENDING' }] : [],
          lines: award ? poLinesFromQuotation(award, form.promisedDate) : [],
          amendments: [],
          ...patch,
        })
        const latest = await api.getPurchaseOrders()
        setRows(latest)
        if (award) await updateQuotation(award.uid.toString(), { status: 'AWARDED' })
        toast.success(
          submit ? 'Purchase order submitted' : 'Draft saved',
          award
            ? `${docNo} raised on ${award.supplierName} from ${award.docNo} with ${award.lines.length} line${award.lines.length > 1 ? 's' : ''} at the awarded rates.`
            : `${docNo} created.`,
        )
      } catch (e) {
        toast.error('Error', 'Failed to save purchase order')
      }
    }
    setFormOpen(false)
  }

  async function decide(r: PurchaseOrder, approve: boolean) {
    update(r.uid, {
      status: approve ? 'APPROVED' : 'REJECTED',
      approvals: r.approvals.map((a) => (a.status === 'PENDING' ? { ...a, status: approve ? 'APPROVED' : 'REJECTED', actedAt: new Date().toISOString() } : a)),
    })
    toast.success(approve ? 'Approved' : 'Rejected', `${r.docNo} ${approve ? 'released to the supplier' : 'returned to the buyer'}.`)
    setDetail(null)
  }

  async function doCancel() {
    if (!cancelling) return
    if (!cancelNote.trim()) {
      toast.error('Reason required', 'A cancellation note is mandatory and is written to the audit log.')
      return
    }
    update(cancelling.uid, { status: 'CANCELLED', remarks: `${cancelReason.split(' — ')[0]}: ${cancelNote.trim()}` })
    toast.success('Cancelled', `${cancelling.docNo} cancelled with reason ${cancelReason.split(' — ')[0]}.`)
    setCancelling(null)
    setCancelNote('')
  }

  const overdue = rows
    .filter((r) => ['APPROVED', 'PARTIALLY_EXECUTED', 'ON_HOLD'].includes(r.status))
    .filter((r) => new Date(r.promisedDate).getTime() < Date.now())

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Purchase orders' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New purchase order
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
              { id: 'open', label: 'Open', count: counts.open },
              { id: 'closed', label: 'Closed', count: counts.closed },
            ]}
          />
        }
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search PO number, supplier, buyer…"
        onExport={doExport}
        onRowClick={(r) => { setDetail(r); setDetailTab('lines') }}
        emptyTitle="No purchase orders"
        rowActions={(r) => (
          <>
            <MenuItem label="Open" onClick={() => { setDetail(r); setDetailTab('lines') }} />
            <MenuItem label="Edit" disabled={!['DRAFT', 'REJECTED'].includes(r.status)} onClick={() => openEdit(r)} />
            <MenuItem label="Print / PDF" icon={<Printer />} onClick={() => { try { exportRows('pdf', r.docNo.replace(/\//g, '-'), `Purchase order ${r.docNo}`, [{ header: 'Item', value: (l: PurchaseOrder['lines'][0]) => l.itemName }, { header: 'Qty', value: (l) => l.qty }, { header: 'UoM', value: (l) => l.uom }, { header: 'Rate', value: (l) => l.rate.toFixed(2) }, { header: 'Amount', value: (l) => l.amount.toFixed(2) }], r.lines); } catch (e) { toast.error('Print failed', e instanceof Error ? e.message : 'Unknown error.') } }} />
            <MenuItem label="Approve" icon={<Check />} separatorBefore disabled={r.status !== 'PENDING_APPROVAL'} onClick={() => decide(r, true)} />
            <MenuItem label="Reject" icon={<X />} danger disabled={r.status !== 'PENDING_APPROVAL'} onClick={() => decide(r, false)} />
            <MenuItem
              label={r.status === 'ON_HOLD' ? 'Release hold' : 'Put on hold'}
              separatorBefore
              disabled={!['APPROVED', 'PARTIALLY_EXECUTED', 'ON_HOLD'].includes(r.status)}
              onClick={() => {
                update(r.uid, { status: r.status === 'ON_HOLD' ? 'PARTIALLY_EXECUTED' : 'ON_HOLD' })
                toast.success(r.status === 'ON_HOLD' ? 'Hold released' : 'On hold', `${r.docNo} updated.`)
              }}
            />
            <MenuItem
              label="Short close"
              disabled={r.status !== 'PARTIALLY_EXECUTED'}
              onClick={() => {
                update(r.uid, { status: 'SHORT_CLOSED', shortCloseReason: 'Closed by the buyer; the balance is no longer required.' })
                toast.success('Short closed', `${r.docNo} closed at ${r.receivedPct}% fulfilment.`)
              }}
            />
            <MenuItem label="Cancel" icon={<Ban />} danger disabled={['CANCELLED', 'COMPLETED', 'CLOSED'].includes(r.status)} onClick={() => setCancelling(r)} />
            <MenuItem label="Delete" icon={<Trash2 />} danger separatorBefore disabled={r.status !== 'DRAFT'} onClick={() => setConfirmDelete(r)} />
          </>
        )}
      />

      {/* Detail --------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.supplierName} · ${detail.poType.replace('_', ' ').toLowerCase()}` : undefined}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">
                Version {detail.version} · {detail.amendments.length} amendments · {detail.attachments} attachments
              </span>
              <div className="flex gap-2">
                {detail.status === 'PENDING_APPROVAL' && (
                  <>
                    <Button variant="danger" size="sm" onClick={() => decide(detail, false)}>Reject</Button>
                    <Button variant="success" size="sm" onClick={() => decide(detail, true)}>Approve</Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <ProcStatusBadge status={detail.status} />
              <Badge tone="neutral" size="sm" dot={false}>{detail.poType.replace('_', ' ').toLowerCase()}</Badge>
              {detail.acknowledged && <span className="text-2xs text-success">Acknowledged {formatDateTime(detail.acknowledgedAt!)}</span>}
              {detail.contractNo && <span className="text-2xs text-fg-muted">Against {detail.contractNo}</span>}
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <ValueTile label="Basic" value={formatCurrency(detail.basicValue)} />
              <ValueTile label="Tax" value={formatCurrency(detail.taxValue)} />
              <ValueTile label="Freight" value={formatCurrency(detail.freightValue)} />
              <ValueTile label="Total" value={formatCurrency(detail.totalValue)} strong />
            </div>

            <Tabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'lines', label: 'Lines', count: detail.lines.length },
                { id: 'schedule', label: 'Delivery schedule' },
                { id: 'terms', label: 'Terms' },
                { id: 'amendments', label: 'Amendments', count: detail.amendments.length },
                { id: 'approval', label: 'Approval' },
              ]}
            />

            {detailTab === 'lines' && (
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Disc</th>
                      <th>HSN</th>
                      <th className="text-right">Tax</th>
                      <th className="text-right">Line total</th>
                      <th className="text-right">Received</th>
                      <th className="text-right">Rejected</th>
                      <th className="text-center">QC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                        </td>
                        <td className="text-right tabular">{l.qty.toLocaleString('en-IN')} {l.uom}</td>
                        <td className="text-right tabular">{l.rate.toFixed(2)}</td>
                        <td className="text-right tabular">{l.discountPct}%</td>
                        <td className="font-mono text-2xs">{l.hsn}</td>
                        <td className="text-right tabular">{l.taxPct}%</td>
                        <td className="text-right tabular font-medium">{formatCurrency(l.lineTotal)}</td>
                        <td className="text-right tabular">{l.receivedQty.toLocaleString('en-IN')}</td>
                        <td className={cn('text-right tabular', l.rejectedQty > 0 && 'text-danger')}>{l.rejectedQty.toLocaleString('en-IN')}</td>
                        <td className="text-center text-2xs">{l.qcRequired ? 'Yes' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'schedule' && (
              <div className="space-y-3">
                {detail.lines.map((l) => (
                  <div key={l.uid} className="rounded border border-border">
                    <div className="border-b border-border px-3 py-2">
                      <p className="text-xs font-medium text-fg">{l.itemName}</p>
                      <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                    </div>
                    <table className="grid-table">
                      <thead>
                        <tr>
                          <th>Due date</th>
                          <th className="text-right">Scheduled</th>
                          <th className="text-right">Received</th>
                          <th className="text-right">Balance</th>
                          <th>Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.schedules.map((s) => (
                          <tr key={s.uid}>
                            <td className="text-xs">
                              {formatDate(s.dueDate)}
                              {new Date(s.dueDate).getTime() < Date.now() && s.receivedQty < s.qty && (
                                <span className="ml-2">
                                  <DelayChip days={Math.ceil((Date.now() - new Date(s.dueDate).getTime()) / 86_400_000)} />
                                </span>
                              )}
                            </td>
                            <td className="text-right tabular">{s.qty.toLocaleString('en-IN')}</td>
                            <td className="text-right tabular">{s.receivedQty.toLocaleString('en-IN')}</td>
                            <td className="text-right tabular">{Math.max(0, s.qty - s.receivedQty).toLocaleString('en-IN')}</td>
                            <td><FillBar pct={(s.receivedQty / s.qty) * 100} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {detailTab === 'terms' && (
              <DataGrid
                columns={2}
                items={[
                  { label: 'Payment terms', value: detail.paymentTerms },
                  { label: 'Delivery terms', value: detail.deliveryTerms },
                  { label: 'Incoterm', value: detail.incoterm ?? '—' },
                  { label: 'Currency', value: `${detail.currency} @ ${detail.exchangeRate}` },
                  { label: 'Delivery warehouse', value: detail.deliveryWarehouse },
                  { label: 'Promised date', value: formatDate(detail.promisedDate) },
                  { label: 'RFQ reference', value: detail.rfqNo ?? '—' },
                  { label: 'Requisitions', value: detail.prRefs.join(', ') || '—' },
                  { label: 'Buyer', value: detail.buyer },
                  { label: 'Plant', value: detail.plant },
                ]}
              />
            )}

            {detailTab === 'amendments' && (
              <div className="space-y-3">
                {detail.amendments.length === 0 ? (
                  <p className="text-xs text-fg-subtle">
                    No amendments. Once approved, this order can only be changed through a numbered revision with a
                    reason — never edited in place.
                  </p>
                ) : (
                  detail.amendments.map((a) => (
                    <div key={a.revision} className="rounded border border-border p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-fg-subtle" />
                        <span className="text-xs font-medium text-fg">Revision {a.revision}</span>
                        <span className="text-2xs text-fg-muted">
                          {a.amendedBy} · {formatDateTime(a.amendedAt)}
                        </span>
                      </div>
                      <p className="mb-2 text-2xs italic text-fg-muted">{a.reason}</p>
                      <table className="grid-table">
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>From</th>
                            <th>To</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.changes.map((c, i) => (
                            <tr key={i}>
                              <td className="text-xs">{c.field}</td>
                              <td className="text-xs text-danger line-through">{c.from}</td>
                              <td className="text-xs text-success">{c.to}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === 'approval' && (
              <div className="space-y-4">
                <ApprovalTrail steps={detail.approvals} />
                {detail.shortCloseReason && (
                  <DetailBlock title="Short close reason">
                    <p className="text-xs text-fg-muted">{detail.shortCloseReason}</p>
                  </DetailBlock>
                )}
                {detail.remarks && (
                  <DetailBlock title="Remarks">
                    <p className="text-xs text-fg-muted">{detail.remarks}</p>
                  </DetailBlock>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Create / edit --------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.docNo}` : 'New purchase order'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => save(false)}>Save draft</Button>
            <Button variant="primary" onClick={() => save(true)}>{editing ? 'Save and submit' : 'Create and submit'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {!editing && !orderable.length && (
            <Alert tone="warning" title="No awarded quotation is waiting for an order">
              An order is raised from a requisition whose quotations have been compared and awarded. Award one on the
              Quotation Comparison screen first.
            </Alert>
          )}

          {!editing && (
            <Select
              label="Purchase requisition"
              required
              value={form.prNo}
              error={errors.prNo}
              onChange={(e) => applyPr(e.target.value)}
              hint="Requisitions with an awarded quotation. Selecting one fills the vendor, rates and terms from that award."
              options={[
                { value: '', label: orderable.length ? 'Select a requisition…' : 'Nothing awarded and unordered' },
                ...orderable.map((o) => ({
                  value: o.pr.docNo,
                  label: `${o.pr.docNo} — awarded to ${o.award.supplierName} · ${formatCurrency(o.award.landedValue)}`,
                })),
              ]}
            />
          )}

          {!editing && awardPreview && (
            <DetailBlock title={`Lines from ${awardPreview.docNo} (${awardPreview.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Awarded rate</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awardPreview.lines.map((l) => (
                      <tr key={l.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                        </td>
                        <td className="text-right tabular">{l.qty.toLocaleString('en-IN')} {l.uom}</td>
                        <td className="text-right tabular">{l.rate.toFixed(2)}</td>
                        <td className="text-right tabular font-medium">{formatCurrency(l.rate * (1 - l.discountPct / 100) * l.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>
          )}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select label="Supplier" containerClassName="sm:col-span-2" value={form.supplierName} disabled={!editing && !!awardPreview} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} options={SUPPLIERS.map((s) => ({ value: s, label: s }))} />
          <Select label="Order type" value={form.poType} onChange={(e) => setForm({ ...form, poType: e.target.value })} options={PO_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ').toLowerCase() }))} />
          <Input label="Buyer" required value={form.buyer} error={errors.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} />
          <Select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} options={[{ value: 'INR', label: 'INR' }, { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }]} />
          <Input label="Promised date" type="date" required value={form.promisedDate} error={errors.promisedDate} onChange={(e) => setForm({ ...form, promisedDate: e.target.value })} />
          <Select label="Payment terms" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} options={['15 days from invoice', '30 days from invoice', '45 days from invoice', 'Advance 50%, balance on delivery', 'LC at sight'].map((v) => ({ value: v, label: v }))} />
          <Select label="Delivery warehouse" value={form.deliveryWarehouse} onChange={(e) => setForm({ ...form, deliveryWarehouse: e.target.value })} options={['RM Store — Chennai', 'Packing Store — Chennai', 'Spares Store — Chennai', 'Tool Room — Hosur', 'WIP Store — Hosur'].map((v) => ({ value: v, label: v }))} />
          <Input label="Basic value" type="number" required value={form.basicValue} error={errors.basicValue} hint={form.currency === 'INR' ? 'GST at 18% is added automatically.' : 'Import — duty and IGST are computed at clearance.'} onChange={(e) => setForm({ ...form, basicValue: e.target.value })} />
          <Select label="Plant" value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })} options={[{ value: 'Chennai — Unit 1', label: 'Chennai — Unit 1' }, { value: 'Hosur — Unit 2', label: 'Hosur — Unit 2' }]} />
        </div>
        </div>
      </Modal>

      {/* Cancel ---------------------------------------------------------------- */}
      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title={`Cancel ${cancelling?.docNo ?? ''}`}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(null)}>Keep order</Button>
            <Button variant="danger" onClick={doCancel}>Cancel order</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select label="Reason code" required value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} options={CANCEL_REASONS.map((r) => ({ value: r, label: r }))} />
          <Textarea label="Cancellation note" required rows={3} value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} hint="Written to the audit log and visible to the supplier on the portal." />
          {cancelling && cancelling.receivedPct > 0 && (
            <p className="rounded border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
              {cancelling.receivedPct}% of this order has already been received. Cancellation applies only to the
              undelivered balance; received quantities stay in stock and remain payable.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete draft"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
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
          Only drafts can be deleted. Approved orders must be cancelled with a reason so the document number and audit
          trail survive.
        </p>
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Order types in use" icon={<FileText className="h-4 w-4" />} />
        <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PO_TYPES.map((t) => {
            const n = rows.filter((r) => r.poType === t).length
            const v = rows.filter((r) => r.poType === t).reduce((s, r) => s + r.totalValue, 0)
            return (
              <div key={t} className="rounded border border-border p-2.5">
                <p className="text-xs font-medium text-fg">{t.replace('_', ' ').toLowerCase()}</p>
                <p className="mt-0.5 text-2xs text-fg-muted tabular">
                  {n} orders · {formatCurrency(v)}
                </p>
              </div>
            )
          })}
        </CardBody>
      </Card>
    </div>
  )
}

function ValueTile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded border border-border bg-surface-2 p-2.5">
      <p className="text-2xs uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={cn('mt-0.5 tabular', strong ? 'text-base font-semibold text-fg' : 'text-sm text-fg')}>{value}</p>
    </div>
  )
}
