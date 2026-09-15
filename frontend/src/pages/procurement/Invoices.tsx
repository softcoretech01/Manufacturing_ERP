import { useState, useEffect, useMemo } from 'react'
import { Plus, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { ProcStatusBadge } from '@/components/procurement/ProcShell'
import { ProcurementToolbar } from '@/components/procurement/ProcurementToolbar'
import * as api from '@/api/procurement'
import { useDocDetail } from '@/hooks/useDocDetail'
import {
  ProcModal, ModalFooter, Section, FieldGrid, Field,
  LineItemsTable, TotalsPanel, RowActions, money, qty as fmtQty,
} from '@/components/procurement/ProcKit'
import { getSuppliers } from '@/api/masters'

const PO_INVOICEABLE = ['APPROVED', 'RELEASED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED']

/** A small coloured pill for the 3-way match state, paired with text (never
 *  colour alone) so it stays legible for colour-blind users. */
function MatchBadge({ status, open }: { status?: string; open?: number }) {
  const s = String(status || 'NOT_MATCHED').toUpperCase()
  const map: Record<string, string> = {
    MATCHED: 'bg-success/10 text-success',
    EXCEPTION: 'bg-danger/10 text-danger',
    NOT_MATCHED: 'bg-surface-3 text-fg-muted',
  }
  const label = s === 'MATCHED' ? 'Matched' : s === 'EXCEPTION' ? `${open || 0} exception${(open || 0) === 1 ? '' : 's'}` : 'Not matched'
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[s] || map.NOT_MATCHED}`}>{label}</span>
}

export function InvoicesPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [masters, setMasters] = useState<{ suppliers: any[]; pos: any[] }>({ suppliers: [], pos: [] })

  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const detail = useDocDetail<any>(api.getInvoice)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const emptyForm = {
    poNo: '', supplierUid: '', supplierName: '',
    supplierInvoiceNo: '', supplierInvoiceDate: '', dueDate: '', remarks: '',
    supplierStatedTotal: '', lines: [] as any[],
  }
  const [form, setForm] = useState<any>(emptyForm)

  const fetchList = () => {
    setLoading(true)
    api.getInvoices().then(res => { setData(res || []); setLoading(false) })
      .catch(() => { toast.error('Error', 'Failed to load supplier invoices'); setLoading(false) })
  }

  useEffect(() => {
    fetchList()
    Promise.all([getSuppliers(), api.getPurchaseOrders()])
      .then(([suppliers, pos]) => setMasters({
        suppliers,
        pos: (pos || []).filter((p: any) => PO_INVOICEABLE.includes(p.status)),
      }))
      .catch(() => toast.error('Error', 'Failed to load master data'))
  }, [])

  const filtered = useMemo(() => data.filter(d => {
    const q = search.toLowerCase()
    if (search && !(
      d.docNo?.toLowerCase().includes(q) ||
      d.poNo?.toLowerCase().includes(q) ||
      (d.supplierName || '').toLowerCase().includes(q) ||
      (d.supplierInvoiceNo || '').toLowerCase().includes(q)
    )) return false
    if (dateFrom && new Date(d.docDate) < new Date(dateFrom)) return false
    if (dateTo && new Date(d.docDate) > new Date(dateTo)) return false
    return true
  }), [data, search, dateFrom, dateTo])

  const resetFilters = () => { setSearch(''); setDateFrom(''); setDateTo(''); fetchList() }

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormOpen(true) }

  const openEdit = async (row: any) => {
    const inv = await detail.load(row)
    setEditing(inv)
    setForm({
      poNo: inv.poNo || '',
      supplierUid: inv.supplierUid || '',
      supplierName: inv.supplierName || '',
      supplierInvoiceNo: inv.supplierInvoiceNo || '',
      supplierInvoiceDate: inv.supplierInvoiceDate ? String(inv.supplierInvoiceDate).slice(0, 10) : '',
      dueDate: inv.dueDate ? String(inv.dueDate).slice(0, 10) : '',
      remarks: inv.remarks || '',
      supplierStatedTotal: inv.supplierStatedTotal || '',
      lines: (inv.lines || []).map((l: any) => ({ ...l })),
    })
    setFormOpen(true)
  }

  const openView = async (row: any) => {
    setEditing(row); setViewOpen(true)
    setEditing(await detail.load(row))
  }

  /** Load the PO lines and default each to the quantity received-but-not-yet-billed. */
  const handlePoSelect = (poNo: string) => {
    const po = masters.pos.find(p => p.docNo === poNo)
    if (!po) return
    const lines = (po.lines || []).map((l: any) => {
      const received = Number(l.receivedQty) || 0
      const alreadyBilled = Number(l.billedQty) || 0
      const toBill = Math.max(0, Math.min(Number(l.qty) || 0, received) - alreadyBilled)
      return {
        poLineRef: l.uid || l.id || null,
        grnNo: null,
        itemCode: l.itemCode,
        itemName: l.itemName,
        uom: l.uom,
        poQty: Number(l.qty) || 0,
        receivedAcceptedQty: received,
        billedQty: toBill,
        poRate: Number(l.rate) || 0,
        invoiceRate: Number(l.rate) || 0,
        discountPct: 0,
        taxPct: Number(l.taxPct) || 0,
      }
    })
    setForm({ ...form, poNo, supplierUid: po.supplierUid, supplierName: po.supplierName, lines })
  }

  const handleLine = (i: number, field: string, value: string) => {
    const lines = [...form.lines]
    lines[i] = { ...lines[i], [field]: value }
    setForm({ ...form, lines })
  }

  const lineAmount = (l: any) => (Number(l.billedQty) || 0) * (Number(l.invoiceRate) || 0) * (1 - (Number(l.discountPct) || 0) / 100)
  const lineTax = (l: any) => lineAmount(l) * (Number(l.taxPct) || 0) / 100

  const totals = useMemo(() => {
    const basic = form.lines.reduce((a: number, l: any) => a + lineAmount(l), 0)
    const tax = form.lines.reduce((a: number, l: any) => a + lineTax(l), 0)
    return { basic, tax, total: basic + tax }
  }, [form.lines])

  const handleSave = async () => {
    if (!form.poNo) return toast.error('Validation', 'Select the purchase order being invoiced')
    if (!String(form.supplierInvoiceNo).trim()) return toast.error('Validation', "Enter the supplier's invoice number")
    if (!form.supplierInvoiceDate) return toast.error('Validation', 'Enter the supplier invoice date')
    if (!form.lines.some((l: any) => Number(l.billedQty) > 0)) return toast.error('Validation', 'Enter a billed quantity for at least one line')

    const today = new Date().toISOString().slice(0, 10)
    setSaving(true)
    try {
      const payload = {
        docNo: editing?.docNo && editing.docNo !== 'null' ? editing.docNo : null,
        docDate: editing?.docDate ? String(editing.docDate).slice(0, 10) : today,
        status: 'DRAFT',
        poNo: form.poNo,
        supplierUid: String(form.supplierUid),
        supplierName: form.supplierName || masters.suppliers.find((s: any) => String(s.uid || s.id) === String(form.supplierUid))?.name || '',
        supplierInvoiceNo: String(form.supplierInvoiceNo).trim(),
        supplierInvoiceDate: form.supplierInvoiceDate,
        currency: 'INR',
        supplierStatedTotal: Number(form.supplierStatedTotal) || 0,
        dueDate: form.dueDate || null,
        remarks: form.remarks || null,
        lines: form.lines
          .filter((l: any) => Number(l.billedQty) > 0)
          .map((l: any) => ({
            poLineRef: l.poLineRef ? Number(l.poLineRef) : null,
            grnNo: l.grnNo || null,
            itemCode: String(l.itemCode ?? ''),
            itemName: l.itemName || '',
            uom: l.uom || '',
            poQty: Number(l.poQty) || 0,
            receivedAcceptedQty: Number(l.receivedAcceptedQty) || 0,
            billedQty: Number(l.billedQty) || 0,
            poRate: Number(l.poRate) || 0,
            invoiceRate: Number(l.invoiceRate) || 0,
            discountPct: Number(l.discountPct) || 0,
            taxPct: Number(l.taxPct) || 0,
          })),
      }
      if (editing) {
        await api.updateInvoice(editing.uid || editing.id, payload)
        toast.success('Saved', 'Invoice updated — re-run the 3-way match')
      } else {
        await api.createInvoice(payload)
        toast.success('Saved', 'Supplier invoice booked as draft')
      }
      setFormOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Could not save invoice', err.message || 'Please check the values and try again.')
    } finally { setSaving(false) }
  }

  const runMatch = async (inv: any) => {
    setBusy(true)
    try {
      const res = await api.matchInvoice(inv.uid || inv.id)
      const exc = res?.exceptionCount ?? res?.invoice?.exceptions?.length ?? 0
      if (Number(exc) === 0) toast.success('Matched', '3-way match passed — invoice is ready to approve')
      else toast.error('Match exceptions', `${exc} exception(s) found — review before approving`)
      setEditing(await detail.load(inv))
      fetchList()
    } catch (err: any) {
      toast.error('Match failed', err.message || 'Could not run the match')
    } finally { setBusy(false) }
  }

  const runApprove = async (inv: any) => {
    const openExc = (inv.exceptions || []).filter((e: any) => String(e.status).toUpperCase() === 'OPEN')
    let override = false, reason: string | undefined
    if (openExc.length > 0) {
      reason = window.prompt(`This invoice has ${openExc.length} open match exception(s). Enter a reason to approve anyway, or Cancel:`) || undefined
      if (!reason) return
      override = true
    }
    setBusy(true)
    try {
      await api.approveInvoice(inv.uid || inv.id, override, reason)
      toast.success('Approved', 'Invoice approved and billed to the PO')
      setViewOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Approval failed', err.message || 'Could not approve the invoice')
    } finally { setBusy(false) }
  }

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center', render: (_, i) => i + 1 },
    { key: 'docNo', header: 'Invoice No', width: '150px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'Date', width: '120px', render: (r) => formatDate(r.docDate) },
    { key: 'poNo', header: 'PO Ref', width: '140px' },
    { key: 'supplier', header: 'Supplier', render: (r) =>
        masters.suppliers.find(s => (s.uid || s.id) === r.supplierUid)?.name || r.supplierName || r.supplierUid },
    { key: 'supplierInvoiceNo', header: 'Supplier Inv #', width: '130px' },
    { key: 'totalValue', header: 'Value', align: 'right', width: '120px', render: (r) => money(r.totalValue) },
    { key: 'match', header: 'Match', width: '130px', className: 'col-flex', render: (r) => <MatchBadge status={r.matchStatus} open={r.exceptionCount} /> },
    { key: 'status', header: 'Status', width: '130px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions', header: 'Action', width: '120px', className: 'col-flex',
      render: (r) => (
        <RowActions
          onView={() => openView(r)}
          onEdit={String(r.status).toUpperCase() === 'APPROVED' ? undefined : () => openEdit(r)}
        />
      ),
    },
  ]

  const isApproved = (s?: string) => String(s || '').toUpperCase() === 'APPROVED'

  return (
    <div className="flex h-full w-full flex-col flex-1">
      <PageHeader
        title="Invoice Verification"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'Invoice Verification' }]}
        actions={<Button variant="primary" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Book Invoice</Button>}
      />

      <ProcurementToolbar
        search={search} onSearchChange={setSearch}
        dateFrom={dateFrom} onDateFromChange={setDateFrom}
        dateTo={dateTo} onDateToChange={setDateTo}
        onReset={resetFilters}
        searchHint="Invoice, PO, supplier or supplier invoice number" dateLabel="Invoice date"
      />

      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">
        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">
          <DataTable searchable={false} rows={filtered} rowKey={(r) => r.uid || r.id || r.docNo} columns={columns} loading={loading} />
        </div>
      </div>

      {/* Create / edit */}
      <ProcModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Invoice ${editing.docNo}` : 'Book Supplier Invoice'}
        subtitle="Line values are recomputed on the server from quantity × rate."
        width="wide"
        footer={
          <ModalFooter onCancel={() => setFormOpen(false)}>
            <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
              {editing ? 'Update Invoice' : 'Save Draft'}
            </Button>
          </ModalFooter>
        }
      >
        <Section title="Invoice Information">
          <FieldGrid>
            <Select label="Purchase Order" value={form.poNo} onChange={e => handlePoSelect(e.target.value)} disabled={!!editing}>
              <option value="">Select a purchase order…</option>
              {masters.pos.map(p => (
                <option key={p.docNo} value={p.docNo}>
                  {p.docNo} — {masters.suppliers.find(s => (s.uid || s.id) === p.supplierUid)?.name || p.supplierName}
                </option>
              ))}
            </Select>
            <Input label="Supplier" value={masters.suppliers.find(s => String(s.uid || s.id) === String(form.supplierUid))?.name || form.supplierName} disabled />
            <Input label="Supplier Invoice No" value={form.supplierInvoiceNo} onChange={e => setForm({ ...form, supplierInvoiceNo: e.target.value })} />
            <Input type="date" label="Supplier Invoice Date" value={form.supplierInvoiceDate} onChange={e => setForm({ ...form, supplierInvoiceDate: e.target.value })} />
            <Input type="date" label="Payment Due Date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
            <Input type="number" label="Supplier Stated Total" value={form.supplierStatedTotal}
              onChange={e => setForm({ ...form, supplierStatedTotal: e.target.value })} placeholder="Amount the vendor claims" />
            <div className="sm:col-span-2">
              <Textarea label="Remarks" rows={2} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
            </div>
          </FieldGrid>
        </Section>

        <Section title="Billed Lines">
          <LineItemsTable
            rows={form.lines}
            empty="Select a purchase order to load its lines."
            columns={[
              { key: 'itemName', header: 'Item', width: '16rem', render: (l) => (
                  <div><span className="font-medium text-fg">{l.itemName}</span><span className="block text-[11px] text-fg-muted">{l.uom}</span></div>
                ) },
              { key: 'poQty', header: 'PO Qty', align: 'right', width: '80px', render: (l) => fmtQty(l.poQty) },
              { key: 'receivedAcceptedQty', header: 'Received', align: 'right', width: '85px', render: (l) => fmtQty(l.receivedAcceptedQty) },
              { key: 'billedQty', header: 'Billed', align: 'right', width: '100px', render: (l, i) => (
                  <Input type="number" min={0} value={l.billedQty} className="h-9 text-right" onChange={e => handleLine(i, 'billedQty', e.target.value)} />
                ) },
              { key: 'poRate', header: 'PO Rate', align: 'right', width: '95px', render: (l) => money(l.poRate) },
              { key: 'invoiceRate', header: 'Inv. Rate', align: 'right', width: '105px', render: (l, i) => (
                  <Input type="number" min={0} value={l.invoiceRate} className="h-9 text-right" onChange={e => handleLine(i, 'invoiceRate', e.target.value)} />
                ) },
              { key: 'taxPct', header: 'Tax %', align: 'right', width: '80px', render: (l, i) => (
                  <Input type="number" min={0} value={l.taxPct} className="h-9 text-right" onChange={e => handleLine(i, 'taxPct', e.target.value)} />
                ) },
              { key: 'amount', header: 'Amount', align: 'right', width: '115px', render: (l) => (
                  <span className="font-medium text-fg">{money(lineAmount(l))}</span>
                ) },
            ]}
          />
          {form.lines.length > 0 && <TotalsPanel subtotal={totals.basic} tax={totals.tax} grandTotal={totals.total} />}
        </Section>
      </ProcModal>

      {/* Detail + match/approve */}
      <ProcModal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={`Supplier Invoice ${editing?.docNo ?? ''}`.trim()}
        width="wide"
        footer={
          <ModalFooter onCancel={() => setViewOpen(false)} cancelLabel="Close">
            {editing && !isApproved(editing.status) && (
              <>
                <Button variant="secondary" onClick={() => runMatch(editing)} loading={busy} disabled={busy}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Run 3-Way Match
                </Button>
                <Button
                  variant="primary"
                  onClick={() => runApprove(editing)}
                  loading={busy}
                  disabled={busy || String(editing.matchStatus || '').toUpperCase() === 'NOT_MATCHED'}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve &amp; Bill PO
                </Button>
              </>
            )}
          </ModalFooter>
        }
      >
        {editing && (() => {
          const lines = editing.lines || []
          const exceptions = editing.exceptions || []
          return (
            <>
              <Section title="Invoice Information">
                <FieldGrid>
                  <Field label="Invoice Number" mono value={editing.docNo} />
                  <Field label="Invoice Date" value={formatDate(editing.docDate)} />
                  <Field label="PO Number" mono value={editing.poNo} />
                  <Field label="Supplier" value={
                    masters.suppliers.find((s: any) => String(s.uid || s.id) === String(editing.supplierUid))?.name
                    || editing.supplierName || editing.supplierUid} />
                  <Field label="Supplier Invoice No" value={editing.supplierInvoiceNo} />
                  <Field label="Supplier Invoice Date" value={editing.supplierInvoiceDate ? formatDate(editing.supplierInvoiceDate) : null} />
                  <Field label="Status" value={<ProcStatusBadge status={editing.status || 'DRAFT'} />} />
                  <Field label="3-Way Match" value={<MatchBadge status={editing.matchStatus} open={exceptions.filter((e: any) => String(e.status).toUpperCase() === 'OPEN').length} />} />
                  <Field label="Invoice Value" value={money(editing.totalValue)} />
                  <Field label="Supplier Stated Total" value={money(editing.supplierStatedTotal)} />
                </FieldGrid>
              </Section>

              {exceptions.length > 0 && (
                <Section title="Match Exceptions">
                  <div className="space-y-2">
                    {exceptions.map((e: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                        <div>
                          <span className="font-semibold text-danger">{e.type}</span>
                          {e.itemCode && <span className="text-fg-muted"> · {e.itemCode}</span>}
                          <span className="block text-fg-muted">
                            expected <span className="font-medium text-fg">{e.expected ?? '—'}</span>, got <span className="font-medium text-fg">{e.actual ?? '—'}</span>
                            {Number(e.variancePct) ? <> ({Number(e.variancePct).toFixed(2)}% variance)</> : null}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Billed Lines">
                <LineItemsTable
                  rows={lines}
                  empty="This invoice has no lines."
                  columns={[
                    { key: 'itemName', header: 'Item', width: '16rem', render: (l) => <span className="font-medium text-fg">{l.itemName}</span> },
                    { key: 'poQty', header: 'PO Qty', align: 'right', width: '80px', render: (l) => fmtQty(l.poQty) },
                    { key: 'receivedAcceptedQty', header: 'Received', align: 'right', width: '85px', render: (l) => fmtQty(l.receivedAcceptedQty) },
                    { key: 'billedQty', header: 'Billed', align: 'right', width: '80px', render: (l) => <span className="font-medium text-fg">{fmtQty(l.billedQty)}</span> },
                    { key: 'poRate', header: 'PO Rate', align: 'right', width: '95px', render: (l) => money(l.poRate) },
                    { key: 'invoiceRate', header: 'Inv. Rate', align: 'right', width: '95px', render: (l) => money(l.invoiceRate) },
                    { key: 'rateVariancePct', header: 'Rate Δ', align: 'right', width: '80px', render: (l) =>
                        Number(l.rateVariancePct) ? <span className={Math.abs(Number(l.rateVariancePct)) > 2 ? 'text-danger' : 'text-fg-muted'}>{Number(l.rateVariancePct).toFixed(1)}%</span> : '—' },
                    { key: 'match', header: 'Match', width: '110px', render: (l) => <MatchBadge status={l.matchStatus} /> },
                    { key: 'lineTotal', header: 'Line Total', align: 'right', width: '115px', render: (l) => <span className="font-medium text-fg">{money(l.lineTotal)}</span> },
                  ]}
                />
                <TotalsPanel subtotal={editing.basicValue} tax={editing.taxValue} grandTotal={editing.totalValue} />
              </Section>
            </>
          )
        })()}
      </ProcModal>
    </div>
  )
}
