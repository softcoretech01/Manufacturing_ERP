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
import { getSuppliers, getItems } from '@/api/masters'

export function QuotationsPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [rfqs, setRfqs] = useState<any[]>([])
  const [prs, setPrs] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])

  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  
  const [form, setForm] = useState<any>({
    rfqNo: '',
    supplierUid: '',
    validTill: '',
    lines: [],
    basicValue: 0,
    taxValue: 0,
    landedValue: 0
  })

  const fetchList = () => {
    setLoading(true)
    api.getQuotations().then(res => {
      setData(res || [])
      setLoading(false)
    }).catch(() => {
      toast.error('Error', 'Failed to load Quotations')
      setLoading(false)
    })
  }

  useEffect(() => {
    fetchList()
    api.getRfqs().then(res => {
      setRfqs(res?.filter((r:any) => r.status === 'OPEN') || [])
    }).catch(console.error)
    api.getRequisitions().then(res => {
      setPrs(res || [])
    }).catch(console.error)
    getSuppliers().then(setSuppliers).catch(console.error)
    getItems().then(setItems).catch(console.error)
  }, [])

  const getPrNoForRfq = (rfqNo: string) => {
    const rfq = rfqs.find(r => r.docNo === rfqNo)
    if (!rfq || !rfq.prRefs || rfq.prRefs.length === 0) return ''
    const pr = prs.find(p => String(p.uid || p.id) === String(rfq.prRefs[0]) || p.docNo === String(rfq.prRefs[0]))
    return pr ? pr.docNo : rfq.prRefs[0]
  }

  // Suggested unit price for an item code, from the item master.
  const priceForItem = (itemCode: string): number => {
    const it = items.find(i => i.code === itemCode || String(i.id) === String(itemCode) || i.uid === itemCode)
    return it ? Number(it.lastPurchaseRate || it.standardCost || it.sellingPrice || 0) : 0
  }

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

  const handleOpenForm = (quote?: any) => {
    if (quote) {
      setEditing(quote)
      setForm({
        rfqNo: quote.rfqNo || '',
        supplierUid: quote.supplierUid || '',
        validTill: quote.validTill ? new Date(quote.validTill).toISOString().split('T')[0] : '',
        lines: quote.lines || [],
        basicValue: quote.basicValue || 0,
        taxValue: quote.taxValue || 0,
        landedValue: quote.landedValue || 0
      })
    } else {
      setEditing(null)
      setForm({
        rfqNo: '',
        supplierUid: '',
        validTill: '',
        lines: [],
        basicValue: 0,
        taxValue: 0,
        landedValue: 0
      })
    }
    setFormOpen(true)
  }

  const handleView = (quote: any) => {
    setEditing(quote)
    setViewOpen(true)
  }

  const handleRfqSelect = (rfqNo: string) => {
    const selectedRfq = rfqs.find(r => r.docNo === rfqNo)
    if (selectedRfq) {
      const newLines = selectedRfq.lines.map((l:any) => {
        const rate = priceForItem(l.itemCode)   // suggested unit price from item master
        const taxPct = 18
        return {
          itemCode: l.itemCode,
          itemName: l.itemName,
          uom: l.uom,
          qty: l.qty,
          rate,
          taxPct,
          freight: 0,
          landedRate: rate + rate * (taxPct / 100),
          remarks: ''
        }
      })
      let basic = 0, tax = 0, landed = 0
      newLines.forEach((l: any) => {
        const q = Number(l.qty) || 0
        basic += q * l.rate
        tax += q * l.rate * (l.taxPct / 100)
        landed += q * l.landedRate
      })
      setForm({...form, rfqNo, lines: newLines, basicValue: basic, taxValue: tax, landedValue: landed})
    }
  }

  const handleLineChange = (index: number, field: string, value: string | number) => {
    const newLines = [...form.lines]
    newLines[index] = { ...newLines[index], [field]: value }
    
    // Auto calculate landed rate
    if (['rate', 'taxPct', 'freight'].includes(field)) {
      const l = newLines[index]
      const r = Number(l.rate) || 0
      const t = Number(l.taxPct) || 0
      const f = Number(l.freight) || 0
      
      const taxAmt = r * (t / 100)
      l.landedRate = r + taxAmt + f
    }
    
    // Recalculate totals
    let basic = 0
    let tax = 0
    let landed = 0
    newLines.forEach(l => {
      const q = Number(l.qty) || 0
      const r = Number(l.rate) || 0
      const t = Number(l.taxPct) || 0
      const f = Number(l.freight) || 0
      
      basic += (q * r)
      tax += (q * r * (t / 100))
      landed += (q * (r + (r * (t / 100)) + f))
    })

    setForm({
      ...form, 
      lines: newLines,
      basicValue: basic,
      taxValue: tax,
      landedValue: landed
    })
  }

  const handleSave = async () => {
    if (!form.rfqNo) return toast.error('Validation', 'RFQ No is required')
    if (!form.supplierUid) return toast.error('Validation', 'Supplier is required')
    if (form.lines.length === 0) return toast.error('Validation', 'At least one item is required')
    
    const today = new Date().toISOString().slice(0, 10)
    const supplier = suppliers.find(s => String(s.uid || s.id) === String(form.supplierUid))

    try {
      const payload = {
        docNo: editing?.docNo && editing.docNo !== 'null' ? editing.docNo : null,
        docDate: editing?.docDate ? String(editing.docDate).slice(0, 10) : today,
        status: editing?.status || 'QUOTED',
        rfqNo: form.rfqNo,
        supplierUid: String(form.supplierUid),
        supplierName: supplier?.name || editing?.supplierName || '',
        validTill: form.validTill ? String(form.validTill).slice(0, 10) : today,
        basicValue: form.basicValue,
        taxValue: form.taxValue,
        landedValue: form.landedValue,
        lines: form.lines.map((l: any) => ({
          itemCode: String(l.itemCode ?? ''),
          itemName: l.itemName || '',
          uom: l.uom || '',
          qty: Number(l.qty) || 0,
          rate: Number(l.rate) || 0,
          taxPct: Number(l.taxPct) || 0,
          freight: Number(l.freight) || 0,
          landedRate: Number(l.landedRate) || 0,
          remarks: l.remarks || '',
        })),
      }

      if (editing) {
        await api.updateQuotation(editing.uid || editing.id, payload)
        toast.success('Success', 'Quotation updated')
      } else {
        await api.createQuotation(payload)
        toast.success('Success', 'Quotation received successfully')
      }
      setFormOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Error', err.message || 'Failed to save Quotation')
    }
  }

  const handleSubmitApproval = async (uid: string) => {
    try {
      await api.updateQuotation(uid, { status: 'PENDING_APPROVAL' })
      toast.success('Success', 'Submitted for approval')
      setViewOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Error', err.message || 'Failed to submit')
    }
  }

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'Quote No', width: '140px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate), width: '130px' },
    { key: 'rfqNo', header: 'RFQ Ref', width: '130px' },
    { key: 'supplier', header: 'Supplier', render: (r) => {
      const sup = suppliers.find(s => String(s.uid || s.id) === String(r.supplierUid))
      return sup ? sup.name : (r.supplierName || r.supplierUid)
    } },
    { key: 'validTill', header: 'Valid Till', render: (r) => r.validTill ? formatDate(r.validTill) : '-', width: '130px' },
    { key: 'items', header: 'Items', align: 'center' as const, render: (r) => r.lines?.length || 0, width: '72px' },
    { key: 'landedValue', header: 'Total Value', align: 'right' as const, render: (r) => formatCurrency(r.landedValue), width: '120px' },
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
        title="Vendor Quotations"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'Quotations' }]}
        actions={
          <Button variant="primary" onClick={() => handleOpenForm()}>
            <Plus className="mr-2 h-4 w-4" /> Record Quote
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

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit Quote ${editing.docNo}` : 'Record Vendor Quotation'} size="2xl">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Quote Details" />
            <CardBody className="grid gap-4 sm:grid-cols-3">
              <Select label="Reference RFQ" value={form.rfqNo} onChange={e => handleRfqSelect(e.target.value)} disabled={!!editing}>
                <option value="">Select RFQ</option>
                {rfqs.filter(r => {
                   if (editing && editing.rfqNo === r.docNo) return true;
                   const quotedSupplierUids = data.filter(q => q.rfqNo === r.docNo).map(q => String(q.supplierUid));
                   const rfqSupplierUids = (r.suppliers || []).map((rs:any) => String(rs.supplierUid));
                   const hasPendingSuppliers = rfqSupplierUids.length === 0 || rfqSupplierUids.some((uid: string) => !quotedSupplierUids.includes(uid));
                   return hasPendingSuppliers;
                }).map(r => {
                  const prNo = getPrNoForRfq(r.docNo);
                  return <option key={r.uid || r.id} value={r.docNo}>{r.docNo} {prNo ? `(${prNo})` : ''} - {r.title}</option>
                })}
              </Select>
              <Select label="Supplier" value={form.supplierUid} onChange={e => setForm({...form, supplierUid: e.target.value})} disabled={!!editing}>
                <option value="">Select Supplier</option>
                {suppliers.filter(s => {
                   if (!form.rfqNo) return true;
                   const rfq = rfqs.find(r => r.docNo === form.rfqNo);
                   if (!rfq || !rfq.suppliers || rfq.suppliers.length === 0) return true;
                   return rfq.suppliers.some((rs:any) => String(rs.supplierUid) === String(s.uid || s.id));
                }).filter(s => {
                   if (editing && String(editing.supplierUid) === String(s.uid || s.id)) return true;
                   const hasQuotation = data.some(q => q.rfqNo === form.rfqNo && String(q.supplierUid) === String(s.uid || s.id));
                   return !hasQuotation;
                }).map(s => <option key={s.uid || s.id} value={s.uid || s.id}>{s.name}</option>)}
              </Select>
              <Input type="date" label="Valid Till" value={form.validTill} onChange={e => setForm({...form, validTill: e.target.value})} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pricing" />
            <CardBody className="p-0 overflow-x-auto">
              <table className="grid-table w-full text-sm min-w-[800px]">
                <thead>
                  <tr>
                    <th className="w-10 col-center">#</th>
                    <th>Item</th>
                    <th className="w-20 col-right">Qty</th>
                    <th className="w-28 col-right">Basic Rate</th>
                    <th className="w-24 col-right">Tax %</th>
                    <th className="w-32 col-right">Freight/Unit</th>
                    <th className="w-32 col-right">Landed Rate</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="col-center">{i + 1}</td>
                      <td>{l.itemName} <span className="text-xs text-fg-muted block">{l.uom}</span></td>
                      <td className="col-right">{l.qty}</td>
                      <td><Input type="number" value={l.rate} onChange={e => handleLineChange(i, 'rate', e.target.value)} className="h-8 text-right" /></td>
                      <td><Input type="number" value={l.taxPct} onChange={e => handleLineChange(i, 'taxPct', e.target.value)} className="h-8 text-right" /></td>
                      <td><Input type="number" value={l.freight} onChange={e => handleLineChange(i, 'freight', e.target.value)} className="h-8 text-right" /></td>
                      <td className="font-medium bg-gray-50 col-right">{formatCurrency(l.landedRate)}</td>
                      <td><Input value={l.remarks} onChange={e => handleLineChange(i, 'remarks', e.target.value)} className="h-8" /></td>
                    </tr>
                  ))}
                  {form.lines.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-fg-muted py-4">Select an RFQ to load items.</td></tr>
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
                      <span className="font-medium">Total Landed Value</span>
                      <span className="font-bold text-brand-600">{formatCurrency(form.landedValue)}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>{editing ? 'Update Quotation' : 'Save Quotation'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={`View Quote - ${editing?.docNo}`} size="2xl">
        {editing && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-5 gap-4 text-sm bg-gray-50/50 p-4 rounded-lg border border-border">
              <div><span className="text-fg-muted">Quote No:</span> <span className="font-medium">{editing.docNo}</span></div>
              <div><span className="text-fg-muted">Date:</span> <span className="font-medium">{formatDate(editing.docDate)}</span></div>
              <div><span className="text-fg-muted">RFQ Ref:</span> <span className="font-medium">{editing.rfqNo}</span></div>
              <div><span className="text-fg-muted">PR Ref:</span> <span className="font-medium">{getPrNoForRfq(editing.rfqNo)}</span></div>
              <div><span className="text-fg-muted">Supplier:</span> <span className="font-medium">{suppliers.find(s => String(s.uid || s.id) === String(editing.supplierUid))?.name || editing.supplierName || editing.supplierUid}</span></div>
              <div><span className="text-fg-muted">Valid Till:</span> <span className="font-medium">{editing.validTill ? formatDate(editing.validTill) : '-'}</span></div>
            </div>

            <Card>
              <CardHeader title="Quoted Items" />
              <CardBody className="p-0 overflow-x-auto">
                <table className="grid-table w-full text-sm min-w-[800px]">
                  <thead>
                    <tr>
                      <th className="w-10 col-center">#</th>
                      <th>Item</th>
                      <th className="w-20 col-right">Qty</th>
                      <th className="col-right">Basic Rate</th>
                      <th className="col-right">Tax %</th>
                      <th className="col-right">Freight</th>
                      <th className="col-right">Landed Rate</th>
                      <th className="col-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editing.lines?.map((l: any, i: number) => (
                      <tr key={i}>
                        <td className="col-center">{i + 1}</td>
                        <td>{l.itemName} <span className="text-xs text-fg-muted">({l.uom})</span></td>
                        <td className="col-right">{l.qty}</td>
                        <td className="col-right">{formatCurrency(l.rate)}</td>
                        <td className="col-right">{l.taxPct}%</td>
                        <td className="col-right">{formatCurrency(l.freight)}</td>
                        <td className="col-right font-medium">{formatCurrency(l.landedRate)}</td>
                        <td className="col-right font-medium">{formatCurrency((l.qty || 0) * (l.landedRate || 0))}</td>
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
                      <span className="font-medium">Total Landed Value</span>
                      <span className="font-bold text-brand-600">{formatCurrency(editing.landedValue)}</span>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
              {editing.status === 'DRAFT' && (
                <Button variant="primary" onClick={() => handleSubmitApproval(editing.uid || editing.id)}>Submit for Approval</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
