import { useState, useEffect, useMemo } from 'react'
import { Plus, CheckCircle2, Truck } from 'lucide-react'
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

const RETURN_TYPES = ['REJECTION', 'QUALITY_FAILURE', 'DAMAGE', 'EXCESS', 'WRONG_ITEM', 'EXPIRY']
const DISPOSITIONS = ['RETURN_TO_SUPPLIER', 'REPLACEMENT_EXPECTED', 'REWORK_AT_SUPPLIER', 'SCRAP_AT_OUR_END', 'USE_AS_IS_WITH_CONCESSION']

export function ReturnsPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [masters, setMasters] = useState<{ suppliers: any[]; grns: any[]; pos: any[] }>({ suppliers: [], grns: [], pos: [] })

  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const detail = useDocDetail<any>(api.getPurchaseReturn)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const emptyForm = {
    grnNo: '', poNo: '', supplierUid: '', supplierName: '', warehouse: '',
    returnType: 'REJECTION', disposition: 'RETURN_TO_SUPPLIER', reasonCode: '',
    vehicleNo: '', ewayBillNo: '', replacementExpected: false, remarks: '', lines: [] as any[],
  }
  const [form, setForm] = useState<any>(emptyForm)

  const fetchList = () => {
    setLoading(true)
    api.getPurchaseReturns().then(res => { setData(res || []); setLoading(false) })
      .catch(() => { toast.error('Error', 'Failed to load purchase returns'); setLoading(false) })
  }

  useEffect(() => {
    fetchList()
    Promise.all([getSuppliers(), api.getGrns(), api.getPurchaseOrders()])
      .then(([suppliers, grns, pos]) => setMasters({
        suppliers,
        grns: (grns || []).filter((g: any) => String(g.status).toUpperCase() === 'POSTED'),
        pos: pos || [],
      }))
      .catch(() => toast.error('Error', 'Failed to load master data'))
  }, [])

  const filtered = useMemo(() => data.filter(d => {
    const q = search.toLowerCase()
    if (search && !(
      d.docNo?.toLowerCase().includes(q) || d.grnNo?.toLowerCase().includes(q) ||
      (d.supplierName || '').toLowerCase().includes(q)
    )) return false
    if (dateFrom && new Date(d.docDate) < new Date(dateFrom)) return false
    if (dateTo && new Date(d.docDate) > new Date(dateTo)) return false
    return true
  }), [data, search, dateFrom, dateTo])

  const resetFilters = () => { setSearch(''); setDateFrom(''); setDateTo(''); fetchList() }

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormOpen(true) }

  const openEdit = async (row: any) => {
    const ret = await detail.load(row)
    setEditing(ret)
    setForm({
      grnNo: ret.grnNo || '', poNo: ret.poNo || '', supplierUid: ret.supplierUid || '',
      supplierName: ret.supplierName || '', warehouse: ret.warehouse || '',
      returnType: ret.returnType || 'REJECTION', disposition: ret.disposition || 'RETURN_TO_SUPPLIER',
      reasonCode: ret.reasonCode || '', vehicleNo: ret.vehicleNo || '', ewayBillNo: ret.ewayBillNo || '',
      replacementExpected: !!ret.replacementExpected, remarks: ret.remarks || '',
      lines: (ret.lines || []).map((l: any) => ({ ...l })),
    })
    setFormOpen(true)
  }

  const openView = async (row: any) => { setEditing(row); setViewOpen(true); setEditing(await detail.load(row)) }

  /** Load the GRN lines; default each line to returning the rejected quantity as
   *  paper-only (rejected-at-GRN material never entered stock). */
  const handleGrnSelect = (grnNo: string) => {
    const grn = masters.grns.find(g => g.docNo === grnNo)
    if (!grn) return
    const po = masters.pos.find(p => p.docNo === grn.poNo)
    const poLineByItem = (code: string) => po?.lines?.find((pl: any) => pl.itemCode === code)?.uid || null
    const lines = (grn.lines || []).map((l: any) => {
      const rejected = Number(l.rejectedQty) || 0
      const accepted = Number(l.acceptedQty) || 0
      return {
        grnLineRef: l.uid || l.id || null,
        poLineRef: poLineByItem(l.itemCode),
        itemCode: l.itemCode, itemName: l.itemName, uom: l.uom,
        batchNo: l.batchNo || '', heatNo: l.heatNo || '',
        rate: Number(l.rate) || 0,
        acceptedQty: accepted, rejectedQty: rejected,
        fromStock: false,
        returnQty: rejected,           // default: send back what was rejected
        stockStatus: 'AVAILABLE',
        maxReturnable: rejected,
        taxPct: 0,
      }
    })
    setForm({
      ...form, grnNo, poNo: grn.poNo || '', supplierUid: grn.supplierUid,
      supplierName: grn.supplierName || '', warehouse: grn.warehouse || '', lines,
    })
  }

  const handleLine = (i: number, field: string, value: any) => {
    const lines = [...form.lines]
    const line = { ...lines[i], [field]: value }
    if (field === 'fromStock') {
      // switching source flips the ceiling: rejected qty (paper) vs accepted qty (stock)
      line.maxReturnable = value ? Number(line.acceptedQty) || 0 : Number(line.rejectedQty) || 0
    }
    lines[i] = line
    setForm({ ...form, lines })
  }

  const lineAmount = (l: any) => (Number(l.returnQty) || 0) * (Number(l.rate) || 0)
  const totals = useMemo(() => {
    const taxable = form.lines.reduce((a: number, l: any) => a + lineAmount(l), 0)
    const tax = form.lines.reduce((a: number, l: any) => a + lineAmount(l) * (Number(l.taxPct) || 0) / 100, 0)
    return { taxable, tax, total: taxable + tax }
  }, [form.lines])

  const handleSave = async () => {
    if (!form.grnNo) return toast.error('Validation', 'Select the GRN being returned against')
    const active = form.lines.filter((l: any) => Number(l.returnQty) > 0)
    if (active.length === 0) return toast.error('Validation', 'Enter a return quantity on at least one line')
    const over = active.find((l: any) => Number(l.returnQty) > Number(l.maxReturnable) + 0.0001)
    if (over) return toast.error('Validation',
      `${over.itemName}: cannot return ${over.returnQty} — only ${over.maxReturnable} ${over.fromStock ? 'accepted in stock' : 'rejected'} is available`)

    const today = new Date().toISOString().slice(0, 10)
    setSaving(true)
    try {
      const payload = {
        docNo: editing?.docNo && editing.docNo !== 'null' ? editing.docNo : null,
        docDate: editing?.docDate ? String(editing.docDate).slice(0, 10) : today,
        status: 'DRAFT',
        grnNo: form.grnNo, poNo: form.poNo || null,
        supplierUid: String(form.supplierUid),
        supplierName: form.supplierName || masters.suppliers.find((s: any) => String(s.uid || s.id) === String(form.supplierUid))?.name || '',
        warehouse: form.warehouse,
        returnType: form.returnType, disposition: form.disposition,
        reasonCode: form.reasonCode || null, vehicleNo: form.vehicleNo || null, ewayBillNo: form.ewayBillNo || null,
        replacementExpected: !!form.replacementExpected, remarks: form.remarks || null,
        lines: active.map((l: any) => ({
          grnLineRef: l.grnLineRef ? Number(l.grnLineRef) : null,
          poLineRef: l.poLineRef ? Number(l.poLineRef) : null,
          itemCode: String(l.itemCode ?? ''), itemName: l.itemName || '', uom: l.uom || '',
          batchNo: l.batchNo || null, heatNo: l.heatNo || null,
          rate: Number(l.rate) || 0, returnQty: Number(l.returnQty) || 0,
          fromStock: !!l.fromStock, stockStatus: l.stockStatus || 'AVAILABLE',
          maxReturnable: Number(l.maxReturnable) || 0, taxPct: Number(l.taxPct) || 0,
          reasonCode: l.reasonCode || form.reasonCode || null,
        })),
      }
      if (editing) { await api.updatePurchaseReturn(editing.uid || editing.id, payload); toast.success('Saved', 'Return updated') }
      else { await api.createPurchaseReturn(payload); toast.success('Saved', 'Purchase return saved as draft') }
      setFormOpen(false); fetchList()
    } catch (err: any) {
      toast.error('Could not save return', err.message || 'Please check the values and try again.')
    } finally { setSaving(false) }
  }

  const runApprove = async (ret: any) => {
    setBusy(true)
    try {
      const res = await api.approvePurchaseReturn(ret.uid || ret.id)
      const dn = res?.debitNote?.docNo
      toast.success('Approved', dn ? `Stock posted; debit note ${dn} drafted` : 'Return approved and stock posted')
      setViewOpen(false); fetchList()
    } catch (err: any) {
      toast.error('Approval failed', err.message || 'Could not approve the return')
    } finally { setBusy(false) }
  }

  const runDispatch = async (ret: any) => {
    setBusy(true)
    try {
      await api.dispatchPurchaseReturn(ret.uid || ret.id, ret.vehicleNo, ret.ewayBillNo)
      toast.success('Dispatched', 'Return marked as dispatched')
      setViewOpen(false); fetchList()
    } catch (err: any) {
      toast.error('Dispatch failed', err.message || 'Could not dispatch the return')
    } finally { setBusy(false) }
  }

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center', render: (_, i) => i + 1 },
    { key: 'docNo', header: 'Return No', width: '150px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'Date', width: '120px', render: (r) => formatDate(r.docDate) },
    { key: 'grnNo', header: 'GRN Ref', width: '140px' },
    { key: 'supplier', header: 'Supplier', render: (r) => masters.suppliers.find(s => (s.uid || s.id) === r.supplierUid)?.name || r.supplierName || r.supplierUid },
    { key: 'returnType', header: 'Type', width: '130px', render: (r) => <span className="text-xs">{String(r.returnType || '').replace(/_/g, ' ')}</span> },
    { key: 'totalAmount', header: 'Value', align: 'right', width: '120px', render: (r) => money(r.totalAmount) },
    { key: 'debitNoteNo', header: 'Debit Note', width: '130px', render: (r) => r.debitNoteNo || <span className="text-fg-subtle">—</span> },
    { key: 'status', header: 'Status', width: '130px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions', header: 'Action', width: '120px', className: 'col-flex',
      render: (r) => (
        <RowActions onView={() => openView(r)}
          onEdit={['APPROVED', 'DISPATCHED', 'CANCELLED'].includes(String(r.status).toUpperCase()) ? undefined : () => openEdit(r)} />
      ),
    },
  ]

  const isDraft = (s?: string) => String(s || '').toUpperCase() === 'DRAFT'
  const isApproved = (s?: string) => String(s || '').toUpperCase() === 'APPROVED'

  return (
    <div className="flex h-full w-full flex-col flex-1">
      <PageHeader
        title="Purchase Returns"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'Purchase Returns' }]}
        actions={<Button variant="primary" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Create Return</Button>}
      />
      <ProcurementToolbar
        search={search} onSearchChange={setSearch}
        dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
        onReset={resetFilters} searchHint="Return, GRN or supplier" dateLabel="Return date"
      />

      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">
        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">
          <DataTable searchable={false} rows={filtered} rowKey={(r) => r.uid || r.id || r.docNo} columns={columns} loading={loading} />
        </div>
      </div>

      {/* Create / edit */}
      <ProcModal
        open={formOpen} onClose={() => setFormOpen(false)}
        title={editing ? `Edit Return ${editing.docNo}` : 'New Purchase Return'}
        subtitle="Rejected material is paper-only; toggle From Stock to return accepted material and reduce inventory."
        width="wide"
        footer={
          <ModalFooter onCancel={() => setFormOpen(false)}>
            <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
              {editing ? 'Update Return' : 'Save Draft'}
            </Button>
          </ModalFooter>
        }
      >
        <Section title="Return Information">
          <FieldGrid>
            <Select label="Against GRN" value={form.grnNo} onChange={e => handleGrnSelect(e.target.value)} disabled={!!editing}>
              <option value="">Select a posted GRN…</option>
              {masters.grns.map(g => (
                <option key={g.docNo} value={g.docNo}>
                  {g.docNo} — {masters.suppliers.find(s => (s.uid || s.id) === g.supplierUid)?.name || g.supplierName}
                </option>
              ))}
            </Select>
            <Input label="Supplier" value={masters.suppliers.find(s => String(s.uid || s.id) === String(form.supplierUid))?.name || form.supplierName} disabled />
            <Select label="Return Type" value={form.returnType} onChange={e => setForm({ ...form, returnType: e.target.value })}>
              {RETURN_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
            <Select label="Disposition" value={form.disposition} onChange={e => setForm({ ...form, disposition: e.target.value })}>
              {DISPOSITIONS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
            <Input label="Reason Code" value={form.reasonCode} onChange={e => setForm({ ...form, reasonCode: e.target.value })} />
            <Input label="Vehicle No" value={form.vehicleNo} onChange={e => setForm({ ...form, vehicleNo: e.target.value })} />
            <Input label="E-way Bill No" value={form.ewayBillNo} onChange={e => setForm({ ...form, ewayBillNo: e.target.value })} />
            <div className="flex items-end pb-1">
              <Switch label="Replacement expected" checked={form.replacementExpected} onChange={(v: boolean) => setForm({ ...form, replacementExpected: v })} />
            </div>
            <div className="sm:col-span-2">
              <Textarea label="Remarks" rows={2} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
            </div>
          </FieldGrid>
        </Section>

        <Section title="Return Lines">
          <LineItemsTable
            rows={form.lines}
            empty="Select a GRN to load its items."
            columns={[
              { key: 'itemName', header: 'Item', width: '15rem', render: (l) => (
                  <div><span className="font-medium text-fg">{l.itemName}</span><span className="block text-[11px] text-fg-muted">{l.uom}</span></div>
                ) },
              { key: 'acceptedQty', header: 'Accepted', align: 'right', width: '80px', render: (l) => fmtQty(l.acceptedQty) },
              { key: 'rejectedQty', header: 'Rejected', align: 'right', width: '80px', render: (l) =>
                  Number(l.rejectedQty) > 0 ? <span className="text-danger">{fmtQty(l.rejectedQty)}</span> : fmtQty(0) },
              { key: 'fromStock', header: 'From Stock', align: 'center', width: '90px', render: (l, i) => (
                  <Switch checked={!!l.fromStock} onChange={(v: boolean) => handleLine(i, 'fromStock', v)} />
                ) },
              { key: 'returnQty', header: 'Return Qty', align: 'right', width: '100px', render: (l, i) => (
                  <Input type="number" min={0} value={l.returnQty} className="h-9 text-right" onChange={e => handleLine(i, 'returnQty', e.target.value)} />
                ) },
              { key: 'max', header: 'Max', align: 'right', width: '70px', render: (l) => <span className="text-fg-muted">{fmtQty(l.maxReturnable)}</span> },
              { key: 'rate', header: 'Rate', align: 'right', width: '95px', render: (l) => money(l.rate) },
              { key: 'taxPct', header: 'Tax %', align: 'right', width: '75px', render: (l, i) => (
                  <Input type="number" min={0} value={l.taxPct} className="h-9 text-right" onChange={e => handleLine(i, 'taxPct', e.target.value)} />
                ) },
              { key: 'amount', header: 'Amount', align: 'right', width: '110px', render: (l) => <span className="font-medium text-fg">{money(lineAmount(l))}</span> },
            ]}
          />
          {form.lines.length > 0 && <TotalsPanel subtotal={totals.taxable} tax={totals.tax} grandTotal={totals.total} />}
        </Section>
      </ProcModal>

      {/* Detail + approve/dispatch */}
      <ProcModal
        open={viewOpen} onClose={() => setViewOpen(false)}
        title={`Purchase Return ${editing?.docNo ?? ''}`.trim()} width="wide"
        footer={
          <ModalFooter onCancel={() => setViewOpen(false)} cancelLabel="Close">
            {editing && isDraft(editing.status) && (
              <Button variant="primary" onClick={() => runApprove(editing)} loading={busy} disabled={busy}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve &amp; Post
              </Button>
            )}
            {editing && isApproved(editing.status) && (
              <Button variant="primary" onClick={() => runDispatch(editing)} loading={busy} disabled={busy}>
                <Truck className="mr-2 h-4 w-4" /> Mark Dispatched
              </Button>
            )}
          </ModalFooter>
        }
      >
        {editing && (() => {
          const lines = editing.lines || []
          return (
            <>
              <Section title="Return Information">
                <FieldGrid>
                  <Field label="Return Number" mono value={editing.docNo} />
                  <Field label="Return Date" value={formatDate(editing.docDate)} />
                  <Field label="GRN" mono value={editing.grnNo} />
                  <Field label="PO" mono value={editing.poNo} />
                  <Field label="Supplier" value={
                    masters.suppliers.find((s: any) => String(s.uid || s.id) === String(editing.supplierUid))?.name
                    || editing.supplierName || editing.supplierUid} />
                  <Field label="Type" value={String(editing.returnType || '').replace(/_/g, ' ')} />
                  <Field label="Disposition" value={String(editing.disposition || '').replace(/_/g, ' ')} />
                  <Field label="Status" value={<ProcStatusBadge status={editing.status || 'DRAFT'} />} />
                  <Field label="Debit Note" value={editing.debitNoteNo || '—'} />
                  <Field label="Return Value" value={money(editing.totalAmount)} />
                </FieldGrid>
              </Section>
              <Section title="Return Lines">
                <LineItemsTable
                  rows={lines} empty="This return has no lines."
                  columns={[
                    { key: 'itemName', header: 'Item', width: '15rem', render: (l) => <span className="font-medium text-fg">{l.itemName}</span> },
                    { key: 'returnQty', header: 'Return Qty', align: 'right', width: '95px', render: (l) => <span className="font-medium text-fg">{fmtQty(l.returnQty)}</span> },
                    { key: 'uom', header: 'UOM', align: 'center', width: '70px' },
                    { key: 'fromStock', header: 'Source', width: '110px', render: (l) =>
                        l.fromStock ? <span className="text-warning">Stock ({l.stockStatus})</span> : <span className="text-fg-muted">Rejected (paper)</span> },
                    { key: 'batchNo', header: 'Batch', width: '110px', render: (l) => l.batchNo || '—' },
                    { key: 'rate', header: 'Rate', align: 'right', width: '100px', render: (l) => money(l.rate) },
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
