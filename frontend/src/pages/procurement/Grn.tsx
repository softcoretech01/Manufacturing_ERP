import { useState, useEffect, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { ProcStatusBadge } from '@/components/procurement/ProcShell'
import { ProcurementToolbar } from '@/components/procurement/ProcurementToolbar'
import * as api from '@/api/procurement'
import { useDocDetail } from '@/hooks/useDocDetail'
import { useItemLookup } from '@/hooks/useItemLookup'
import {
  ProcModal, ModalFooter, Section, FieldGrid, Field,
  LineItemsTable, TotalsPanel, RowActions, money, qty as fmtQty,
} from '@/components/procurement/ProcKit'
import { getSuppliers } from '@/api/masters'
import { getWarehouses } from '@/api/masters_extra'

export function GrnPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [masters, setMasters] = useState<{
    suppliers: any[], 
    stores: any[], 
    pos: any[]
  }>({ suppliers: [], stores: [], pos: [] })

  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const detail = useDocDetail<any>(api.getGrn)
  const lookup = useItemLookup()
  const [saving, setSaving] = useState(false)
  
  const emptyForm = {
    poNo: '', supplierUid: '', warehouse: '', invoiceNo: '', invoiceDate: '',
    gateEntryNo: '', vehicleNo: '', receivedBy: '', remarks: '', lines: [] as any[],
  }
  const [form, setForm] = useState<any>(emptyForm)

  const fetchList = () => {
    setLoading(true)
    api.getGrns().then(res => {
      setData(res || [])
      setLoading(false)
    }).catch(() => {
      toast.error('Error', 'Failed to load GRNs')
      setLoading(false)
    })
  }

  useEffect(() => {
    fetchList()
    Promise.all([
      getSuppliers(), 
      getWarehouses(), 
      api.getPurchaseOrders()
    ]).then(([suppliers, stores, pos]) => {
      setMasters({ suppliers, stores, pos: pos.filter((p:any) => ['APPROVED', 'RELEASED', 'PARTIALLY_RECEIVED'].includes(p.status)) })
    }).catch(() => toast.error('Error', 'Failed to load master data'))
  }, [])

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const q = search.toLowerCase()
      if (search && !(
        d.docNo?.toLowerCase().includes(q) ||
        d.poNo?.toLowerCase().includes(q) ||
        (d.supplierName || '').toLowerCase().includes(q)
      )) return false
      if (dateFrom && new Date(d.docDate) < new Date(dateFrom)) return false
      if (dateTo && new Date(d.docDate) > new Date(dateTo)) return false
      return true
    })
  }, [data, search, dateFrom, dateTo])

  const handleResetFilters = () => {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    fetchList()
  }

  const handleOpenForm = async (grnRow?: any) => {
    const grn = grnRow ? await detail.load(grnRow) : undefined
    if (grn) {
      setEditing(grn)
      setForm({
        poNo: grn.poNo || '',
        supplierUid: grn.supplierUid || '',
        warehouse: grn.warehouse || '',
        invoiceNo: grn.invoiceNo || '',
        invoiceDate: grn.invoiceDate ? String(grn.invoiceDate).slice(0, 10) : '',
        gateEntryNo: grn.gateEntryNo || '',
        vehicleNo: grn.vehicleNo || '',
        receivedBy: grn.receivedBy || '',
        remarks: grn.remarks || '',
        lines: grn.lines || [],
      })
    } else {
      setEditing(null)
      setForm(emptyForm)
    }
    setFormOpen(true)
  }

  const handleView = async (grn: any) => {
    setEditing(grn)
    setViewOpen(true)
    setEditing(await detail.load(grn))
  }

  /** Load the ordered lines, defaulting the receipt to whatever is still due. */
  const handlePoSelect = (poNo: string) => {
    const po = masters.pos.find(p => p.docNo === poNo)
    if (!po) return
    const newLines = (po.lines || []).map((l: any) => {
      const ordered = Number(l.qty) || 0
      const prevReceived = Number(l.receivedQty) || 0
      const remaining = Math.max(0, ordered - prevReceived)
      return {
        itemCode: l.itemCode,
        itemName: l.itemName,
        uom: l.uom,
        poQty: ordered,
        prevReceived,
        remaining,
        challanQty: remaining,
        receivedQty: remaining,
        acceptedQty: remaining,
        rejectedQty: 0,
        rate: Number(l.rate) || 0,
        batchNo: '',
        binCode: 'MAIN',
      }
    })
    setForm({
      ...form,
      poNo,
      supplierUid: po.supplierUid,
      warehouse: po.deliveryWarehouse || form.warehouse,
      lines: newLines,
    })
  }

  const handleLineChange = (index: number, field: string, value: string | number) => {
    const newLines = [...form.lines]
    const line = { ...newLines[index], [field]: value }

    if (field === 'receivedQty' || field === 'rejectedQty') {
      const remaining = Number(line.remaining) || 0
      // Never receive more than the order still has outstanding.
      let rec = Math.max(0, Number(line.receivedQty) || 0)
      if (remaining > 0 && rec > remaining) rec = remaining
      const rej = Math.min(Math.max(0, Number(line.rejectedQty) || 0), rec)
      line.receivedQty = rec
      line.rejectedQty = rej
      line.acceptedQty = rec - rej
    }

    newLines[index] = line
    setForm({ ...form, lines: newLines })
  }

  const handleSave = async () => {
    if (!form.poNo) return toast.error('Validation', 'Select the purchase order being received')
    if (!form.warehouse) return toast.error('Validation', 'Select the store receiving the goods')
    if (!String(form.invoiceNo).trim()) return toast.error('Validation', 'Supplier invoice number is required')
    if (form.lines.length === 0) return toast.error('Validation', 'There are no items to receive')

    const bad = form.lines.find((l: any) =>
      Number(l.receivedQty) > 0 &&
      Number(l.acceptedQty) + Number(l.rejectedQty) !== Number(l.receivedQty))
    if (bad) return toast.error('Validation', bad.itemName + ': accepted plus rejected must equal received')
    if (!form.lines.some((l: any) => Number(l.receivedQty) > 0)) {
      return toast.error('Validation', 'Enter a received quantity for at least one item')
    }

    const today = new Date().toISOString().slice(0, 10)
    const supplier = masters.suppliers.find((x: any) => String(x.uid || x.id) === String(form.supplierUid))
    const sum = (f: string) => form.lines.reduce((a: number, l: any) => a + (Number(l[f]) || 0), 0)

    setSaving(true)
    try {
      const payload = {
        docNo: editing?.docNo && editing.docNo !== 'null' ? editing.docNo : null,
        docDate: editing?.docDate ? String(editing.docDate).slice(0, 10) : today,
        status: 'DRAFT',
        poNo: form.poNo,
        supplierUid: String(form.supplierUid),
        supplierName: supplier?.name || editing?.supplierName || '',
        warehouse: form.warehouse,
        gateEntryNo: form.gateEntryNo || '-',
        gateEntryAt: new Date().toISOString(),
        invoiceNo: String(form.invoiceNo).trim(),
        invoiceDate: form.invoiceDate ? String(form.invoiceDate).slice(0, 10) : today,
        invoiceValue: form.lines.reduce(
          (a: number, l: any) => a + (Number(l.acceptedQty) || 0) * (Number(l.rate) || 0), 0),
        vehicleNo: form.vehicleNo || '-',
        lrNo: '',
        receivedBy: 'Procurement',
        qcStatus: 'PENDING',
        totalReceived: sum('receivedQty'),
        totalAccepted: sum('acceptedQty'),
        totalRejected: sum('rejectedQty'),
        grnValue: form.lines.reduce(
          (a: number, l: any) => a + (Number(l.acceptedQty) || 0) * (Number(l.rate) || 0), 0),
        delayDays: 0,
        lines: form.lines
          .filter((l: any) => Number(l.receivedQty) > 0)
          .map((l: any) => ({
            ...l,
            id: l.id || null,
            uid: l.uid || null,
            itemCode: String(l.itemCode ?? ''),
            itemName: l.itemName || '',
            uom: l.uom || '',
            poQty: Number(l.poQty) || 0,
            challanQty: Number(l.challanQty) || Number(l.receivedQty) || 0,
            receivedQty: Number(l.receivedQty) || 0,
            acceptedQty: Number(l.acceptedQty) || 0,
            rejectedQty: Number(l.rejectedQty) || 0,
            rate: Number(l.rate) || 0,
            batchNo: l.batchNo || null,
            binCode: l.binCode || 'MAIN',
          })),
      }

      if (editing) {
        await api.updateGrn(editing.uid || editing.id, payload)
        toast.success('Success', 'GRN updated')
      } else {
        await api.createGrn(payload)
        toast.success('Success', 'GRN saved as draft')
      }
      setFormOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Could not post GRN', err.message || 'Please check the quantities and try again.')
    } finally {
      setSaving(false)
    }
  }

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'GRN No', width: '150px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'GRN Date', render: (r) => formatDate(r.docDate), width: '130px' },
    { key: 'poNo', header: 'PO Ref', width: '140px' },
    { key: 'supplier', header: 'Supplier', render: (r) => {
      const sup = masters.suppliers.find(s => (s.uid || s.id) === r.supplierUid)
      return sup ? sup.name : r.supplierUid
    } },
    { key: 'challanNo', header: 'Challan No', width: '120px' },
    { key: 'items', header: 'Items', align: 'center' as const, render: (r) => r.lines?.length || 0, width: '72px' },
    { key: 'status', header: 'Status', width: '150px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'Action',
      width: '120px',
      className: 'col-flex',
      render: (r) => (
        <RowActions
          onView={() => handleView(r)}
          // A posted GRN has already moved stock — its quantities are final.
          onEdit={String(r.status).toUpperCase() === 'POSTED' ? undefined : () => handleOpenForm(r)}
        />
      ),
    },
  ]

  return (
    <div className="flex h-full w-full flex-col flex-1">
      <PageHeader
        title="Goods Receipt Notes (GRN)"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'GRNs' }]}
        actions={
          <Button variant="primary" onClick={() => handleOpenForm()}>
            <Plus className="mr-2 h-4 w-4" /> Create GRN
          </Button>
        }
      />
      
      <ProcurementToolbar 
        search={search} onSearchChange={setSearch}
        dateFrom={dateFrom} onDateFromChange={setDateFrom}
        dateTo={dateTo} onDateToChange={setDateTo}
        onReset={handleResetFilters}
        searchHint="GRN number, PO number or supplier" dateLabel="GRN date"
      />

      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">
        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">
          <DataTable searchable={false} rows={filteredData} rowKey={(r) => r.uid || r.id || r.docNo || String(Math.random())} columns={columns} loading={loading} />
        </div>
      </div>

      <ProcModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit GRN ${editing.docNo}` : 'New Goods Receipt Note'}
        subtitle="Posting a GRN moves the accepted quantity into stock."
        width="wide"
        footer={
          <ModalFooter onCancel={() => setFormOpen(false)}>
            <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
              {editing ? 'Update GRN' : 'Post GRN'}
            </Button>
          </ModalFooter>
        }
      >
        <Section title="Receipt Information">
          <FieldGrid>
            <Select
              label="Purchase Order"
              value={form.poNo}
              onChange={e => handlePoSelect(e.target.value)}
              disabled={!!editing}
            >
              <option value="">Select an approved PO…</option>
              {masters.pos.map(p => (
                <option key={p.docNo} value={p.docNo}>
                  {p.docNo} — {masters.suppliers.find(s => (s.uid || s.id) === p.supplierUid)?.name || p.supplierName}
                </option>
              ))}
            </Select>
            <Select
              label="Supplier"
              value={form.supplierUid}
              onChange={e => setForm({ ...form, supplierUid: e.target.value })}
              disabled={!!editing}
            >
              <option value="">Select supplier</option>
              {masters.suppliers.map(s => (
                <option key={s.uid || s.id} value={s.uid || s.id}>{s.name}</option>
              ))}
            </Select>
            <Select
              label="Store / Warehouse"
              value={form.warehouse}
              onChange={e => setForm({ ...form, warehouse: e.target.value })}
            >
              <option value="">Select store</option>
              {masters.stores.map((w: any) => (
                <option key={w.uid || w.code} value={w.code}>{w.name || w.code}</option>
              ))}
            </Select>
            <Input
              label="Received By"
              value={form.receivedBy}
              onChange={e => setForm({ ...form, receivedBy: e.target.value })}
              placeholder="Storekeeper name"
            />
            <Input
              label="Supplier Invoice No"
              value={form.invoiceNo}
              onChange={e => setForm({ ...form, invoiceNo: e.target.value })}
            />
            <Input
              type="date"
              label="Invoice Date"
              value={form.invoiceDate}
              onChange={e => setForm({ ...form, invoiceDate: e.target.value })}
            />
            <Input
              label="Gate Entry No"
              value={form.gateEntryNo}
              onChange={e => setForm({ ...form, gateEntryNo: e.target.value })}
            />
            <Input
              label="Vehicle No"
              value={form.vehicleNo}
              onChange={e => setForm({ ...form, vehicleNo: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Textarea
                label="Remarks"
                rows={2}
                value={form.remarks}
                onChange={e => setForm({ ...form, remarks: e.target.value })}
              />
            </div>
          </FieldGrid>
        </Section>

        <Section title="Items Received">
          <LineItemsTable
            rows={form.lines}
            empty="Select a purchase order to load its items."
            columns={[
              { key: 'itemType', header: 'Type', width: '130px', render: (l) =>
                  lookup.itemTypeOf(l.itemCode) || <span className="text-fg-subtle">—</span> },
              { key: 'category', header: 'Category', width: '140px', render: (l) =>
                  lookup.categoryOf(l.itemCode) || <span className="text-fg-subtle">—</span> },
              { key: 'itemName', header: 'Item', render: (l) => (
                  <div>
                    <span className="font-medium text-fg">{l.itemName}</span>
                    <span className="block text-[11px] text-fg-muted">{l.uom}</span>
                  </div>
                ) },
              { key: 'poQty', header: 'Ordered', align: 'right', width: '85px', render: (l) => fmtQty(l.poQty) },
              { key: 'prevReceived', header: 'Prev. Recd', align: 'right', width: '90px', render: (l) => fmtQty(l.prevReceived) },
              { key: 'remaining', header: 'Remaining', align: 'right', width: '90px', render: (l) => (
                  <span className="font-medium text-fg">{fmtQty(l.remaining)}</span>
                ) },
              { key: 'receivedQty', header: 'Received', align: 'right', width: '100px', render: (l, i) => (
                  <Input type="number" min={0} value={l.receivedQty} className="h-9 text-right"
                    onChange={e => handleLineChange(i, 'receivedQty', e.target.value)} />
                ) },
              { key: 'rejectedQty', header: 'Rejected', align: 'right', width: '100px', render: (l, i) => (
                  <Input type="number" min={0} value={l.rejectedQty} className="h-9 text-right"
                    onChange={e => handleLineChange(i, 'rejectedQty', e.target.value)} />
                ) },
              { key: 'acceptedQty', header: 'Accepted', align: 'right', width: '95px', render: (l) => (
                  <span className="font-semibold text-success">{fmtQty(l.acceptedQty)}</span>
                ) },
              { key: 'batchNo', header: 'Batch/Lot', width: '120px', render: (l, i) => (
                  <Input value={l.batchNo || ''} className="h-9"
                    onChange={e => handleLineChange(i, 'batchNo', e.target.value)} />
                ) },
              { key: 'rate', header: 'Unit Price', align: 'right', width: '105px', render: (l) => money(l.rate) },
              { key: 'amount', header: 'Amount', align: 'right', width: '115px', render: (l) => (
                  <span className="font-medium text-fg">
                    {money((Number(l.acceptedQty) || 0) * (Number(l.rate) || 0))}
                  </span>
                ) },
            ]}
          />
          {form.lines.length > 0 && (() => {
            const value = form.lines.reduce(
              (a: number, l: any) => a + (Number(l.acceptedQty) || 0) * (Number(l.rate) || 0), 0)
            const taxAmt = value * 0.18
            return <TotalsPanel subtotal={value} tax={taxAmt} grandTotal={value + taxAmt} />
          })()}
        </Section>
      </ProcModal>

      <ProcModal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={`Goods Receipt Note ${editing?.docNo ?? ''}`.trim()}
        width="wide"
        footer={<ModalFooter onCancel={() => setViewOpen(false)} cancelLabel="Close" />}
      >
        {editing && (() => {
          const lines = editing.lines || []
          const value = lines.reduce(
            (a: number, l: any) => a + (Number(l.acceptedQty) || 0) * (Number(l.rate) || 0), 0)
          const taxAmt = value * 0.18
          const isPosted = String(editing.status || '').toUpperCase() === 'POSTED'
          return (
            <>
              <Section title="GRN Information">
                <FieldGrid>
                  <Field label="GRN Number" mono value={editing.docNo} />
                  <Field label="GRN Date" value={formatDate(editing.docDate)} />
                  <Field label="PO Number" mono value={editing.poNo} />
                  <Field label="Supplier" value={
                    masters.suppliers.find((s: any) => String(s.uid || s.id) === String(editing.supplierUid))?.name
                    || editing.supplierName || editing.supplierUid} />
                  <Field label="Store" value={
                    masters.stores.find((w: any) => String(w.code) === String(editing.warehouse))?.name
                    || editing.warehouse} />
                  <Field label="Invoice Number" value={editing.invoiceNo} />
                  <Field label="Invoice Date" value={editing.invoiceDate ? formatDate(editing.invoiceDate) : null} />
                  <Field label="Status" value={<ProcStatusBadge status={editing.status || 'DRAFT'} />} />
                  <Field
                    label="Inventory"
                    value={
                      <span className={isPosted ? 'text-success' : 'text-warning'}>
                        {isPosted ? 'Added to inventory' : 'Pending inventory'}
                      </span>
                    }
                  />
                  <Field label="Received By" value={editing.receivedBy} />
                </FieldGrid>
              </Section>

              <Section title="Received Items">
                <LineItemsTable
                  rows={lines}
                  empty="This GRN has no items."
                  columns={[
                    { key: 'itemType', header: 'Type', width: '130px', render: (l) =>
                        lookup.itemTypeOf(l.itemCode) || <span className="text-fg-subtle">—</span> },
                    { key: 'category', header: 'Category', width: '140px', render: (l) =>
                        lookup.categoryOf(l.itemCode) || <span className="text-fg-subtle">—</span> },
                    { key: 'itemName', header: 'Item', render: (l) => <span className="font-medium text-fg">{l.itemName}</span> },
                    { key: 'poQty', header: 'Ordered', align: 'right', width: '90px', render: (l) => fmtQty(l.poQty) },
                    { key: 'receivedQty', header: 'Received', align: 'right', width: '95px', render: (l) => fmtQty(l.receivedQty) },
                    { key: 'acceptedQty', header: 'Accepted', align: 'right', width: '95px', render: (l) =>
                        <span className="font-medium text-fg">{fmtQty(l.acceptedQty)}</span> },
                    { key: 'rejectedQty', header: 'Rejected', align: 'right', width: '95px', render: (l) =>
                        Number(l.rejectedQty) > 0
                          ? <span className="text-danger">{fmtQty(l.rejectedQty)}</span>
                          : fmtQty(0) },
                    { key: 'uom', header: 'UOM', align: 'center', width: '70px' },
                    { key: 'batchNo', header: 'Batch/Lot', width: '110px' },
                    { key: 'rate', header: 'Unit Price', align: 'right', width: '110px', render: (l) => money(l.rate) },
                    { key: 'amount', header: 'Amount', align: 'right', width: '120px', render: (l) =>
                        <span className="font-medium text-fg">
                          {money((Number(l.acceptedQty) || 0) * (Number(l.rate) || 0))}
                        </span> },
                  ]}
                />
                <TotalsPanel subtotal={value} tax={taxAmt} grandTotal={value + taxAmt} />
              </Section>
            </>
          )
        })()}
      </ProcModal>
    </div>
  )
}
