import { useState, useEffect, useMemo } from 'react'
import { Plus, CheckCircle2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input, Select, Switch, Textarea } from '@/components/ui/Input'
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

const DN_TYPES = ['RATE_DIFFERENCE', 'SHORT_QUANTITY', 'QUALITY_PENALTY', 'LATE_DELIVERY_LD', 'FREIGHT_CLAIM', 'JOB_WORK_LOSS', 'OTHER']

export function DebitNotesPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [suppliers, setSuppliers] = useState<any[]>([])

  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const detail = useDocDetail<any>(api.getDebitNote)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const emptyLine = () => ({ itemName: '', uom: 'NOS', quantity: 0, rate: 0, taxPct: 0 })
  const emptyForm = {
    debitNoteType: 'RATE_DIFFERENCE', supplierUid: '', poNo: '', supplierInvoiceNo: '',
    isPendingInvoice: false, reasonCode: '', narration: '', lines: [emptyLine()] as any[],
  }
  const [form, setForm] = useState<any>(emptyForm)

  const fetchList = () => {
    setLoading(true)
    api.getDebitNotes().then(res => { setData(res || []); setLoading(false) })
      .catch(() => { toast.error('Error', 'Failed to load debit notes'); setLoading(false) })
  }

  useEffect(() => {
    fetchList()
    getSuppliers().then(setSuppliers).catch(() => {})
  }, [])

  const filtered = useMemo(() => data.filter(d => {
    const q = search.toLowerCase()
    if (search && !(
      d.docNo?.toLowerCase().includes(q) || (d.returnNo || '').toLowerCase().includes(q) ||
      (d.supplierName || '').toLowerCase().includes(q)
    )) return false
    if (dateFrom && new Date(d.docDate) < new Date(dateFrom)) return false
    if (dateTo && new Date(d.docDate) > new Date(dateTo)) return false
    return true
  }), [data, search, dateFrom, dateTo])

  const resetFilters = () => { setSearch(''); setDateFrom(''); setDateTo(''); fetchList() }

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm, lines: [emptyLine()] }); setFormOpen(true) }
  const openView = async (row: any) => { setEditing(row); setViewOpen(true); setEditing(await detail.load(row)) }

  const setLine = (i: number, field: string, value: any) => {
    const lines = [...form.lines]; lines[i] = { ...lines[i], [field]: value }; setForm({ ...form, lines })
  }
  const addLine = () => setForm({ ...form, lines: [...form.lines, emptyLine()] })
  const removeLine = (i: number) => setForm({ ...form, lines: form.lines.filter((_: any, k: number) => k !== i) })

  const lineAmount = (l: any) => (Number(l.quantity) || 0) * (Number(l.rate) || 0)
  const totals = useMemo(() => {
    const taxable = form.lines.reduce((a: number, l: any) => a + lineAmount(l), 0)
    const tax = form.lines.reduce((a: number, l: any) => a + lineAmount(l) * (Number(l.taxPct) || 0) / 100, 0)
    return { taxable, tax, total: taxable + tax }
  }, [form.lines])

  const handleSave = async () => {
    if (!form.supplierUid) return toast.error('Validation', 'Select the supplier')
    const active = form.lines.filter((l: any) => Number(l.quantity) > 0 && Number(l.rate) > 0)
    if (active.length === 0) return toast.error('Validation', 'Add at least one line with quantity and rate')
    const today = new Date().toISOString().slice(0, 10)
    setSaving(true)
    try {
      const payload = {
        docDate: today, status: 'DRAFT',
        debitNoteType: form.debitNoteType,
        supplierUid: String(form.supplierUid),
        supplierName: suppliers.find((s: any) => String(s.uid || s.id) === String(form.supplierUid))?.name || '',
        poNo: form.poNo || null,
        supplierInvoiceNo: form.supplierInvoiceNo || null,
        isPendingInvoice: !!form.isPendingInvoice,
        reasonCode: form.reasonCode || null,
        narration: form.narration || null,
        lines: active.map((l: any) => ({
          itemCode: l.itemCode || null, itemName: l.itemName || '', uom: l.uom || 'NOS',
          quantity: Number(l.quantity) || 0, rate: Number(l.rate) || 0, taxPct: Number(l.taxPct) || 0,
          sourceReference: form.poNo || null,
        })),
      }
      await api.createDebitNote(payload)
      toast.success('Saved', 'Debit note saved as draft')
      setFormOpen(false); fetchList()
    } catch (err: any) {
      toast.error('Could not save debit note', err.message || 'Please check the values and try again.')
    } finally { setSaving(false) }
  }

  const runApprove = async (dn: any) => {
    setBusy(true)
    try {
      await api.approveDebitNote(dn.uid || dn.id)
      toast.success('Approved', 'Debit note issued to the supplier')
      setViewOpen(false); fetchList()
    } catch (err: any) {
      toast.error('Approval failed', err.message || 'Could not approve the debit note')
    } finally { setBusy(false) }
  }

  const supplierName = (r: any) => suppliers.find(s => (s.uid || s.id) === r.supplierUid)?.name || r.supplierName || r.supplierUid

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center', render: (_, i) => i + 1 },
    { key: 'docNo', header: 'Debit Note No', width: '150px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'Date', width: '120px', render: (r) => formatDate(r.docDate) },
    { key: 'debitNoteType', header: 'Type', width: '150px', render: (r) => <span className="text-xs">{String(r.debitNoteType || '').replace(/_/g, ' ')}</span> },
    { key: 'supplier', header: 'Supplier', render: (r) => supplierName(r) },
    { key: 'source', header: 'Source', width: '150px', render: (r) => r.returnNo || r.grnNo || <span className="text-fg-subtle">standalone</span> },
    { key: 'totalAmount', header: 'Value', align: 'right', width: '120px', render: (r) => money(r.totalAmount) },
    { key: 'status', header: 'Status', width: '130px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions', header: 'Action', width: '120px', className: 'col-flex',
      render: (r) => <RowActions onView={() => openView(r)} />,
    },
  ]

  const isDraft = (s?: string) => String(s || '').toUpperCase() === 'DRAFT'

  return (
    <div className="flex h-full w-full flex-col flex-1">
      <PageHeader
        title="Debit Notes"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'Debit Notes' }]}
        actions={<Button variant="primary" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Debit Note</Button>}
      />
      <ProcurementToolbar
        search={search} onSearchChange={setSearch}
        dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
        onReset={resetFilters} searchHint="Debit note, return or supplier" dateLabel="Debit note date"
      />

      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">
        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">
          <DataTable searchable={false} rows={filtered} rowKey={(r) => r.uid || r.id || r.docNo} columns={columns} loading={loading} />
        </div>
      </div>

      {/* Standalone create */}
      <ProcModal
        open={formOpen} onClose={() => setFormOpen(false)}
        title="New Debit Note"
        subtitle="Goods-return debit notes are auto-drafted on return approval. Use this for rate, LD, short-quantity and other standalone claims."
        width="wide"
        footer={
          <ModalFooter onCancel={() => setFormOpen(false)}>
            <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>Save Draft</Button>
          </ModalFooter>
        }
      >
        <Section title="Debit Note Information">
          <FieldGrid>
            <Select label="Type" value={form.debitNoteType} onChange={e => setForm({ ...form, debitNoteType: e.target.value })}>
              {DN_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
            <Select label="Supplier" value={form.supplierUid} onChange={e => setForm({ ...form, supplierUid: e.target.value })}>
              <option value="">Select supplier</option>
              {suppliers.map(s => <option key={s.uid || s.id} value={s.uid || s.id}>{s.name}</option>)}
            </Select>
            <Input label="PO Ref (optional)" value={form.poNo} onChange={e => setForm({ ...form, poNo: e.target.value })} />
            <Input label="Supplier Invoice No (optional)" value={form.supplierInvoiceNo} onChange={e => setForm({ ...form, supplierInvoiceNo: e.target.value })} />
            <Input label="Reason Code" value={form.reasonCode} onChange={e => setForm({ ...form, reasonCode: e.target.value })} />
            <div className="flex items-end pb-1">
              <Switch label="Raised before invoice" checked={form.isPendingInvoice} onChange={(v: boolean) => setForm({ ...form, isPendingInvoice: v })} />
            </div>
            <div className="sm:col-span-2">
              <Textarea label="Narration" rows={2} value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} />
            </div>
          </FieldGrid>
        </Section>

        <Section title="Lines" action={<Button size="sm" variant="secondary" onClick={addLine}><Plus className="mr-1 h-3.5 w-3.5" /> Add line</Button>}>
          <LineItemsTable
            rows={form.lines}
            empty="Add a line to the debit note."
            columns={[
              { key: 'itemName', header: 'Description', width: '18rem', render: (l, i) => (
                  <Input value={l.itemName} className="h-9" placeholder="Item or claim description" onChange={e => setLine(i, 'itemName', e.target.value)} />
                ) },
              { key: 'quantity', header: 'Qty', align: 'right', width: '90px', render: (l, i) => (
                  <Input type="number" min={0} value={l.quantity} className="h-9 text-right" onChange={e => setLine(i, 'quantity', e.target.value)} />
                ) },
              { key: 'uom', header: 'UOM', width: '80px', render: (l, i) => (
                  <Input value={l.uom} className="h-9" onChange={e => setLine(i, 'uom', e.target.value)} />
                ) },
              { key: 'rate', header: 'Rate', align: 'right', width: '105px', render: (l, i) => (
                  <Input type="number" min={0} value={l.rate} className="h-9 text-right" onChange={e => setLine(i, 'rate', e.target.value)} />
                ) },
              { key: 'taxPct', header: 'Tax %', align: 'right', width: '80px', render: (l, i) => (
                  <Input type="number" min={0} value={l.taxPct} className="h-9 text-right" onChange={e => setLine(i, 'taxPct', e.target.value)} />
                ) },
              { key: 'amount', header: 'Amount', align: 'right', width: '110px', render: (l) => <span className="font-medium text-fg">{money(lineAmount(l))}</span> },
              { key: 'rm', header: '', width: '44px', render: (_l, i) => (
                  form.lines.length > 1 ? <button className="text-fg-subtle hover:text-danger" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></button> : null
                ) },
            ]}
          />
          <TotalsPanel subtotal={totals.taxable} tax={totals.tax} grandTotal={totals.total} />
        </Section>
      </ProcModal>

      {/* Detail + approve */}
      <ProcModal
        open={viewOpen} onClose={() => setViewOpen(false)}
        title={`Debit Note ${editing?.docNo ?? ''}`.trim()} width="wide"
        footer={
          <ModalFooter onCancel={() => setViewOpen(false)} cancelLabel="Close">
            {editing && isDraft(editing.status) && (
              <Button variant="primary" onClick={() => runApprove(editing)} loading={busy} disabled={busy}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve &amp; Issue
              </Button>
            )}
          </ModalFooter>
        }
      >
        {editing && (() => {
          const lines = editing.lines || []
          return (
            <>
              <Section title="Debit Note Information">
                <FieldGrid>
                  <Field label="Debit Note No" mono value={editing.docNo} />
                  <Field label="Date" value={formatDate(editing.docDate)} />
                  <Field label="Type" value={String(editing.debitNoteType || '').replace(/_/g, ' ')} />
                  <Field label="Supplier" value={supplierName(editing)} />
                  <Field label="Against Return" mono value={editing.returnNo || '—'} />
                  <Field label="GRN / PO" value={[editing.grnNo, editing.poNo].filter(Boolean).join(' / ') || '—'} />
                  <Field label="Supplier Invoice" value={editing.supplierInvoiceNo || (editing.isPendingInvoice ? 'Pending' : '—')} />
                  <Field label="Status" value={<ProcStatusBadge status={editing.status || 'DRAFT'} />} />
                  <Field label="Total Value" value={money(editing.totalAmount)} />
                  {editing.narration && <div className="sm:col-span-2"><Field label="Narration" value={editing.narration} /></div>}
                </FieldGrid>
              </Section>
              <Section title="Lines">
                <LineItemsTable
                  rows={lines} empty="This debit note has no lines."
                  columns={[
                    { key: 'itemName', header: 'Description', width: '18rem', render: (l) => <span className="font-medium text-fg">{l.itemName || l.itemCode}</span> },
                    { key: 'quantity', header: 'Qty', align: 'right', width: '90px', render: (l) => fmtQty(l.quantity) },
                    { key: 'uom', header: 'UOM', align: 'center', width: '70px' },
                    { key: 'rate', header: 'Rate', align: 'right', width: '105px', render: (l) => money(l.rate) },
                    { key: 'taxPct', header: 'Tax %', align: 'right', width: '75px', render: (l) => `${Number(l.taxPct || 0)}%` },
                    { key: 'lineTotal', header: 'Line Total', align: 'right', width: '115px', render: (l) => <span className="font-medium text-fg">{money(l.lineTotal)}</span> },
                  ]}
                />
                <TotalsPanel subtotal={editing.taxableAmount} tax={editing.taxAmount} grandTotal={editing.totalAmount} />
              </Section>
            </>
          )
        })()}
      </ProcModal>
    </div>
  )
}
