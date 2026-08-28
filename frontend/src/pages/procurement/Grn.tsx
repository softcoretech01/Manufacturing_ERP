import { useState, useEffect, useMemo } from 'react'
import { Eye, Edit, Plus } from 'lucide-react'
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
  
  const [form, setForm] = useState<any>({
    poNo: '',
    supplierUid: '',
    plant: 'Unit 1',
    challanNo: '',
    challanDate: '',
    gateEntryNo: '',
    vehicleNo: '',
    remarks: '',
    lines: [],
  })

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
      setMasters({ suppliers, stores, pos: pos.filter((p:any) => p.status === 'APPROVED' || p.status === 'RELEASED') })
    }).catch(() => toast.error('Error', 'Failed to load master data'))
  }, [])

  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (search && !d.docNo?.toLowerCase().includes(search.toLowerCase()) && !d.poNo?.toLowerCase().includes(search.toLowerCase())) return false
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

  const handleOpenForm = (grn?: any) => {
    if (grn) {
      setEditing(grn)
      setForm({
        poNo: grn.poNo || '',
        supplierUid: grn.supplierUid || '',
        plant: grn.plant || 'Unit 1',
        challanNo: grn.challanNo || '',
        challanDate: grn.challanDate ? new Date(grn.challanDate).toISOString().split('T')[0] : '',
        gateEntryNo: grn.gateEntryNo || '',
        vehicleNo: grn.vehicleNo || '',
        remarks: grn.remarks || '',
        lines: grn.lines || []
      })
    } else {
      setEditing(null)
      setForm({
        poNo: '',
        supplierUid: '',
        plant: 'Unit 1',
        challanNo: '',
        challanDate: '',
        gateEntryNo: '',
        vehicleNo: '',
        remarks: '',
        lines: []
      })
    }
    setFormOpen(true)
  }

  const handleView = (grn: any) => {
    setEditing(grn)
    setViewOpen(true)
  }

  const handlePoSelect = (poNo: string) => {
    const po = masters.pos.find(p => p.docNo === poNo)
    if (po) {
      const newLines = po.lines.map((l:any) => ({
        itemCode: l.itemCode,
        itemName: l.itemName,
        uom: l.uom,
        poQty: l.qty,
        challanQty: l.qty, // default to remaining
        receivedQty: l.qty,
        acceptedQty: l.qty,
        rejectedQty: 0,
        remarks: ''
      }))
      setForm({
        ...form,
        poNo,
        supplierUid: po.supplierUid,
        lines: newLines
      })
    }
  }

  const handleLineChange = (index: number, field: string, value: string | number) => {
    const newLines = [...form.lines]
    newLines[index] = { ...newLines[index], [field]: value }
    
    if (field === 'receivedQty' || field === 'rejectedQty') {
      const rec = Number(newLines[index].receivedQty) || 0
      const rej = Number(newLines[index].rejectedQty) || 0
      newLines[index].acceptedQty = Math.max(0, rec - rej)
    }
    
    setForm({...form, lines: newLines})
  }

  const handleSave = async () => {
    if (!form.poNo) return toast.error('Validation', 'PO Number is required')
    if (!form.challanNo) return toast.error('Validation', 'Supplier Challan No is required')
    if (form.lines.length === 0) return toast.error('Validation', 'At least one item is required')
    
    try {
      const payload = {
        docDate: new Date().toISOString(),
        poNo: form.poNo,
        supplierUid: form.supplierUid,
        plant: form.plant,
        challanNo: form.challanNo,
        challanDate: form.challanDate ? new Date(form.challanDate).toISOString() : null,
        gateEntryNo: form.gateEntryNo,
        vehicleNo: form.vehicleNo,
        remarks: form.remarks,
        lines: form.lines
      }

      if (editing) {
        await api.updateGrn(editing.uid || editing.id, payload)
        toast.success('Success', 'GRN updated')
      } else {
        await api.createGrn(payload)
        toast.success('Success', 'GRN created successfully')
      }
      setFormOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Error', err.message || 'Failed to save GRN')
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
      />

      <div className="flex-1 flex flex-col min-h-0 bg-surface-2 pt-4 w-full">
        <div className="flex-1 w-full bg-surface border border-border shadow-sm rounded-lg flex flex-col min-h-0">
          <DataTable searchable={false} rows={filteredData} rowKey={(r) => r.uid || r.id || r.docNo || String(Math.random())} columns={columns} loading={loading} />
        </div>
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit GRN ${editing.docNo}` : 'New Goods Receipt Note'} size="2xl">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Receipt Information" />
            <CardBody className="grid gap-4 sm:grid-cols-3">
              <Select label="Load from PO" value={form.poNo} onChange={e => handlePoSelect(e.target.value)} disabled={!!editing}>
                <option value="">Select Released PO...</option>
                {masters.pos.map(p => <option key={p.docNo} value={p.docNo}>{p.docNo} - {masters.suppliers.find(s => (s.uid || s.id) === p.supplierUid)?.name}</option>)}
              </Select>
              <Select label="Supplier" value={form.supplierUid} onChange={e => setForm({...form, supplierUid: e.target.value})} disabled={!!editing}>
                <option value="">Select Supplier</option>
                {masters.suppliers.map(s => <option key={s.uid || s.id} value={s.uid || s.id}>{s.name}</option>)}
              </Select>
              
              <Input label="Supplier Challan / Invoice No" value={form.challanNo} onChange={e => setForm({...form, challanNo: e.target.value})} />
              <Input type="date" label="Challan Date" value={form.challanDate} onChange={e => setForm({...form, challanDate: e.target.value})} />
              <Input label="Gate Entry No" value={form.gateEntryNo} onChange={e => setForm({...form, gateEntryNo: e.target.value})} />
              <Input label="Vehicle / LR No" value={form.vehicleNo} onChange={e => setForm({...form, vehicleNo: e.target.value})} />
              
              <div className="sm:col-span-3">
                <Textarea label="Remarks" rows={2} value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Receipt Lines" />
            <CardBody className="p-0 overflow-x-auto">
              <table className="grid-table w-full text-sm min-w-[900px]">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Item</th>
                    <th className="w-20">PO Qty</th>
                    <th className="w-24">Challan Qty</th>
                    <th className="w-24">Received Qty</th>
                    <th className="w-24">Rejected Qty</th>
                    <th className="w-24">Accepted Qty</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="text-center">{i + 1}</td>
                      <td>{l.itemName} <span className="text-xs text-fg-muted block">{l.uom}</span></td>
                      <td className="text-center bg-gray-50">{l.poQty}</td>
                      <td><Input type="number" value={l.challanQty} onChange={e => handleLineChange(i, 'challanQty', e.target.value)} className="h-8" /></td>
                      <td><Input type="number" value={l.receivedQty} onChange={e => handleLineChange(i, 'receivedQty', e.target.value)} className="h-8" /></td>
                      <td><Input type="number" value={l.rejectedQty} onChange={e => handleLineChange(i, 'rejectedQty', e.target.value)} className="h-8 text-danger" /></td>
                      <td className="font-medium bg-green-50 text-center">{l.acceptedQty}</td>
                      <td><Input value={l.remarks} onChange={e => handleLineChange(i, 'remarks', e.target.value)} className="h-8" /></td>
                    </tr>
                  ))}
                  {form.lines.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-fg-muted py-4">Select a PO to load items.</td></tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>{editing ? 'Update GRN' : 'Save GRN'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={`View GRN - ${editing?.docNo}`} size="2xl">
        {editing && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-4 gap-4 text-sm bg-gray-50/50 p-4 rounded-lg border border-border">
              <div><span className="text-fg-muted">GRN No:</span> <span className="font-medium">{editing.docNo}</span></div>
              <div><span className="text-fg-muted">Date:</span> <span className="font-medium">{formatDate(editing.docDate)}</span></div>
              <div><span className="text-fg-muted">PO Ref:</span> <span className="font-medium">{editing.poNo}</span></div>
              <div><span className="text-fg-muted">Supplier:</span> <span className="font-medium">{masters.suppliers.find(s => (s.uid || s.id) === editing.supplierUid)?.name || editing.supplierUid}</span></div>
              
              <div><span className="text-fg-muted">Challan No:</span> <span className="font-medium">{editing.challanNo}</span></div>
              <div><span className="text-fg-muted">Challan Date:</span> <span className="font-medium">{editing.challanDate ? formatDate(editing.challanDate) : '-'}</span></div>
              <div><span className="text-fg-muted">Gate Entry No:</span> <span className="font-medium">{editing.gateEntryNo || '-'}</span></div>
              <div><span className="text-fg-muted">Vehicle No:</span> <span className="font-medium">{editing.vehicleNo || '-'}</span></div>
            </div>

            <Card>
              <CardHeader title="Received Items" />
              <CardBody className="p-0 overflow-x-auto">
                <table className="grid-table w-full text-sm min-w-[800px]">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      <th>Item</th>
                      <th className="text-right">PO Qty</th>
                      <th className="text-right">Challan Qty</th>
                      <th className="text-right">Received Qty</th>
                      <th className="text-right text-danger">Rejected Qty</th>
                      <th className="text-right text-success">Accepted Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editing.lines?.map((l: any, i: number) => (
                      <tr key={i}>
                        <td className="text-center">{i + 1}</td>
                        <td>{l.itemName} <span className="text-xs text-fg-muted">({l.uom})</span></td>
                        <td className="text-right">{l.poQty}</td>
                        <td className="text-right">{l.challanQty}</td>
                        <td className="text-right">{l.receivedQty}</td>
                        <td className="text-right text-danger">{l.rejectedQty}</td>
                        <td className="text-right font-medium text-success">{l.acceptedQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
