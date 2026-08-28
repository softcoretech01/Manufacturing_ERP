import { useState, useEffect, useMemo } from 'react'
import { Eye, Edit, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { formatDate, formatCurrency } from '@/lib/format'
import { ProcStatusBadge } from '@/components/procurement/ProcShell'
import { ProcurementToolbar } from '@/components/procurement/ProcurementToolbar'
import * as api from '@/api/procurement'
import { getSuppliers, getPaymentTerms, getTaxes } from '@/api/masters'
import { getWarehouses, getCurrencies, getPlants } from '@/api/masters_extra'

export function OrdersPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [masters, setMasters] = useState<{
    suppliers: any[], 
    terms: any[], 
    taxes: any[], 
    stores: any[], 
    currencies: any[], 
    plants: any[],
    quotes: any[]
  }>({ suppliers: [], terms: [], taxes: [], stores: [], currencies: [], plants: [], quotes: [] })

  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  
  const [form, setForm] = useState<any>({
    supplierUid: '',
    plant: '',
    deliveryWarehouse: '',
    paymentTerms: '',
    currency: 'INR',
    promisedDate: '',
    rfqNo: '',
    remarks: '',
    lines: [],
    basicValue: 0,
    taxValue: 0,
    totalValue: 0
  })

  const fetchList = () => {
    setLoading(true)
    api.getPurchaseOrders().then(res => {
      setData(res || [])
      setLoading(false)
    }).catch(() => {
      toast.error('Error', 'Failed to load POs')
      setLoading(false)
    })
  }

  useEffect(() => {
    fetchList()
    Promise.all([
      getSuppliers(), getPaymentTerms(), getTaxes(), 
      getWarehouses(), getCurrencies(), getPlants(), api.getQuotations()
    ]).then(([suppliers, terms, taxes, stores, currencies, plants, quotes]) => {
      setMasters({ suppliers, terms, taxes, stores, currencies, plants, quotes: quotes.filter((q:any) => q.status === 'APPROVED' || q.status === 'QUOTED') })
    }).catch(() => toast.error('Error', 'Failed to load master data'))
  }, [])

  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (search && !d.docNo?.toLowerCase().includes(search.toLowerCase()) && !d.rfqNo?.toLowerCase().includes(search.toLowerCase())) return false
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

  const handleOpenForm = (po?: any) => {
    if (po) {
      setEditing(po)
      setForm({
        supplierUid: po.supplierUid || '',
        plant: po.plant || '',
        deliveryWarehouse: po.deliveryWarehouse || '',
        paymentTerms: po.paymentTerms || '',
        currency: po.currency || 'INR',
        promisedDate: po.promisedDate ? new Date(po.promisedDate).toISOString().split('T')[0] : '',
        rfqNo: po.rfqNo || '',
        remarks: po.remarks || '',
        lines: po.lines || [],
        basicValue: po.basicValue || 0,
        taxValue: po.taxValue || 0,
        totalValue: po.totalValue || 0
      })
    } else {
      setEditing(null)
      setForm({
        supplierUid: '',
        plant: '',
        deliveryWarehouse: '',
        paymentTerms: '',
        currency: 'INR',
        promisedDate: '',
        rfqNo: '',
        remarks: '',
        lines: [],
        basicValue: 0,
        taxValue: 0,
        totalValue: 0
      })
    }
    setFormOpen(true)
  }

  const handleView = (po: any) => {
    setEditing(po)
    setViewOpen(true)
  }

  const handleQuoteSelect = (quoteNo: string) => {
    const quote = masters.quotes.find(q => q.docNo === quoteNo)
    if (quote) {
      const newLines = quote.lines.map((l:any) => ({
        itemCode: l.itemCode,
        itemName: l.itemName,
        uom: l.uom,
        qty: l.qty,
        rate: l.rate,
        taxPct: l.taxPct,
        taxAmt: (l.qty * l.rate) * (l.taxPct / 100),
        freight: l.freight,
        total: (l.qty * l.rate) + ((l.qty * l.rate) * (l.taxPct / 100)) + (l.qty * l.freight)
      }))
      setForm({
        ...form, 
        rfqNo: quote.rfqNo, 
        supplierUid: quote.supplierUid,
        lines: newLines,
        basicValue: quote.basicValue,
        taxValue: quote.taxValue,
        totalValue: quote.landedValue
      })
    }
  }

  // Build a complete, correctly-typed PO payload the backend schema accepts.
  const buildPoPayload = (status: string) => {
    const today = new Date().toISOString().slice(0, 10)
    const supplier = masters.suppliers.find((s: any) => String(s.uid || s.id) === String(form.supplierUid))
    return {
      docNo: editing?.docNo && editing.docNo !== 'null' ? editing.docNo : null,
      docDate: editing?.docDate ? String(editing.docDate).slice(0, 10) : today,
      status,
      plant: form.plant || 'DEFAULT',
      poType: editing?.poType || 'STANDARD',
      supplierUid: String(form.supplierUid),
      supplierName: supplier?.name || editing?.supplierName || '',
      buyer: form.buyer || editing?.buyer || 'Procurement',
      currency: form.currency || 'INR',
      exchangeRate: editing?.exchangeRate || 1,
      paymentTerms: form.paymentTerms || '',
      deliveryWarehouse: form.deliveryWarehouse || '',
      promisedDate: form.promisedDate ? String(form.promisedDate).slice(0, 10) : today,
      rfqNo: form.rfqNo || null,
      remarks: form.remarks || null,
      basicValue: Number(form.basicValue) || 0,
      discountValue: 0,
      taxValue: Number(form.taxValue) || 0,
      freightValue: 0,
      totalValue: Number(form.totalValue) || 0,
      version: editing?.version || 1,
      lines: form.lines.map((l: any) => ({
        itemCode: String(l.itemCode ?? ''),
        itemName: l.itemName || '',
        uom: l.uom || '',
        qty: Number(l.qty) || 0,
        rate: Number(l.rate) || 0,
        hsn: l.hsn || '',
        taxPct: Number(l.taxPct) || 0,
        amount: Number(l.qty) * Number(l.rate) || 0,
        taxAmount: Number(l.taxAmt ?? l.taxAmount) || 0,
        lineTotal: Number(l.total ?? l.lineTotal) || 0,
        dueDate: form.promisedDate ? String(form.promisedDate).slice(0, 10) : today,
      })),
    }
  }

  const handleSave = async () => {
    if (!form.supplierUid) return toast.error('Validation', 'Supplier is required')
    if (!form.paymentTerms) return toast.error('Validation', 'Payment Terms is required')
    if (!form.deliveryWarehouse) return toast.error('Validation', 'Delivery warehouse is required')
    if (!form.promisedDate) return toast.error('Validation', 'Expected delivery date is required')
    if (form.lines.length === 0) return toast.error('Validation', 'At least one item is required')

    try {
      const payload = buildPoPayload(editing?.status || 'DRAFT')
      if (editing) {
        await api.updatePurchaseOrder(editing.uid || editing.id, payload)
        toast.success('Success', 'Purchase Order updated')
      } else {
        await api.createPurchaseOrder(payload)
        toast.success('Success', 'Purchase Order created')
      }
      setFormOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Error', err.message || 'Failed to save PO')
    }
  }

  // Submit an existing (draft) PO for approval. Sends the FULL object with the new
  // status — the update SP rewrites the row from the payload, so a partial body
  // would wipe the PO's fields and lines.
  const handleSubmitApproval = async (po: any) => {
    try {
      const payload = {
        ...po,
        docNo: po.docNo && po.docNo !== 'null' ? po.docNo : null,
        docDate: po.docDate ? String(po.docDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        promisedDate: po.promisedDate ? String(po.promisedDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        status: 'PENDING_APPROVAL',
        lines: (po.lines || []).map((l: any) => ({
          ...l,
          dueDate: l.dueDate ? String(l.dueDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        })),
      }
      await api.updatePurchaseOrder(po.uid || po.id, payload)
      toast.success('Success', 'Submitted for approval')
      setViewOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Error', err.message || 'Failed to submit')
    }
  }

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'PO No', width: '150px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate), width: '130px' },
    { key: 'supplier', header: 'Supplier', render: (r) => {
      const sup = masters.suppliers.find(s => (s.uid || s.id) === r.supplierUid)
      return sup ? sup.name : r.supplierUid
    } },
    { key: 'promisedDate', header: 'Delivery Due', render: (r) => r.promisedDate ? formatDate(r.promisedDate) : '-', width: '130px' },
    { key: 'items', header: 'Items', align: 'center' as const, render: (r) => r.lines?.length || 0, width: '72px' },
    { key: 'totalValue', header: 'Total Value', align: 'right' as const, render: (r) => formatCurrency(r.totalValue), width: '120px' },
    { key: 'status', header: 'Status', width: '150px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'Action',
      width: '120px',
      className: 'col-flex',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => handleView(r)} title="View">
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => handleOpenForm(r)} title="Edit">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-full w-full flex-col flex-1">
      <PageHeader
        title="Purchase Orders"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'Purchase Orders' }]}
        actions={
          <Button variant="primary" onClick={() => handleOpenForm()}>
            <Plus className="mr-2 h-4 w-4" /> Create PO
          </Button>
        }
      />
      
      <ProcurementToolbar 
        search={search} onSearchChange={setSearch}
        dateFrom={dateFrom} onDateFromChange={setDateFrom}
        dateTo={dateTo} onDateToChange={setDateTo}
        onReset={handleResetFilters}
      />

      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">
        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">
          <DataTable searchable={false} rows={filteredData} rowKey={(r) => r.uid || r.id || r.docNo || String(Math.random())} columns={columns} loading={loading} />
        </div>
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit PO ${editing.docNo}` : 'New Purchase Order'} size="2xl">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Order Information" />
            <CardBody className="grid gap-4 sm:grid-cols-3">
              <Select label="Load from Quote" value="" onChange={e => handleQuoteSelect(e.target.value)} disabled={!!editing}>
                <option value="">Select Approved Quote...</option>
                {masters.quotes.map(q => <option key={q.docNo} value={q.docNo}>{q.docNo} (RFQ: {q.rfqNo})</option>)}
              </Select>
              <Select label="Supplier" value={form.supplierUid} onChange={e => setForm({...form, supplierUid: e.target.value})} disabled={!!editing}>
                <option value="">Select Supplier</option>
                {masters.suppliers.map(s => <option key={s.uid || s.id} value={s.uid || s.id}>{s.name}</option>)}
              </Select>
              <Input type="date" label="Promised Date" value={form.promisedDate} onChange={e => setForm({...form, promisedDate: e.target.value})} />
              
              <Select label="Plant" value={form.plant} onChange={e => setForm({...form, plant: e.target.value})}>
                <option value="">Select Plant</option>
                {masters.plants.map(p => <option key={p.uid || p.id} value={p.uid || p.id}>{p.name}</option>)}
              </Select>
              <Select label="Delivery Warehouse" value={form.deliveryWarehouse} onChange={e => setForm({...form, deliveryWarehouse: e.target.value})}>
                <option value="">Select Warehouse</option>
                {masters.stores.map(s => <option key={s.uid || s.id} value={s.uid || s.id}>{s.name}</option>)}
              </Select>
              <Select label="Payment Terms" value={form.paymentTerms} onChange={e => setForm({...form, paymentTerms: e.target.value})}>
                <option value="">Select Terms</option>
                {masters.terms.map(t => <option key={t.uid || t.id} value={t.uid || t.id}>{t.name}</option>)}
              </Select>
              
              <div className="sm:col-span-3">
                <Textarea label="Remarks / Terms & Conditions" rows={2} value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Order Lines" />
            <CardBody className="p-0 overflow-x-auto">
              <table className="grid-table w-full text-sm min-w-[800px]">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Item</th>
                    <th className="w-20">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Tax %</th>
                    <th className="text-right">Freight</th>
                    <th className="text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="text-center">{i + 1}</td>
                      <td>{l.itemName} <span className="text-xs text-fg-muted block">{l.uom}</span></td>
                      <td>{l.qty}</td>
                      <td className="text-right">{formatCurrency(l.rate)}</td>
                      <td className="text-right">{l.taxPct}%</td>
                      <td className="text-right">{formatCurrency(l.qty * l.freight)}</td>
                      <td className="text-right font-medium">{formatCurrency(l.total)}</td>
                    </tr>
                  ))}
                  {form.lines.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-fg-muted py-4">Select a Quotation to load items.</td></tr>
                  )}
                </tbody>
              </table>
              {form.lines.length > 0 && (
                <div className="flex justify-end p-4 border-t border-border bg-gray-50/50">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-fg-muted">Basic Value</span>
                      <span className="font-medium">{formatCurrency(form.basicValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-fg-muted">Tax Value</span>
                      <span className="font-medium">{formatCurrency(form.taxValue)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="font-medium">Total Order Value</span>
                      <span className="font-bold text-brand-600">{formatCurrency(form.totalValue)}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>{editing ? 'Update PO' : 'Save PO'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={`View PO - ${editing?.docNo}`} size="2xl">
        {editing && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-4 gap-4 text-sm bg-gray-50/50 p-4 rounded-lg border border-border">
              <div><span className="text-fg-muted">PO No:</span> <span className="font-medium">{editing.docNo}</span></div>
              <div><span className="text-fg-muted">Date:</span> <span className="font-medium">{formatDate(editing.docDate)}</span></div>
              <div><span className="text-fg-muted">Supplier:</span> <span className="font-medium">{masters.suppliers.find(s => (s.uid || s.id) === editing.supplierUid)?.name || editing.supplierUid}</span></div>
              <div><span className="text-fg-muted">Promised:</span> <span className="font-medium">{editing.promisedDate ? formatDate(editing.promisedDate) : '-'}</span></div>
            </div>

            <Card>
              <CardHeader title="Order Lines" />
              <CardBody className="p-0 overflow-x-auto">
                <table className="grid-table w-full text-sm min-w-[800px]">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      <th>Item</th>
                      <th className="w-20">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Tax %</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editing.lines?.map((l: any, i: number) => (
                      <tr key={i}>
                        <td className="text-center">{i + 1}</td>
                        <td>{l.itemName} <span className="text-xs text-fg-muted">({l.uom})</span></td>
                        <td>{l.qty}</td>
                        <td className="text-right">{formatCurrency(l.rate)}</td>
                        <td className="text-right">{l.taxPct}%</td>
                        <td className="text-right font-medium">{formatCurrency(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end p-4 border-t border-border bg-gray-50/50">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-fg-muted">Basic Value</span>
                      <span className="font-medium">{formatCurrency(editing.basicValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-fg-muted">Tax Value</span>
                      <span className="font-medium">{formatCurrency(editing.taxValue)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="font-medium">Total Value</span>
                      <span className="font-bold text-brand-600">{formatCurrency(editing.totalValue)}</span>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
              {editing.status === 'DRAFT' && (
                <Button variant="primary" onClick={() => handleSubmitApproval(editing)}>Submit for Approval</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
