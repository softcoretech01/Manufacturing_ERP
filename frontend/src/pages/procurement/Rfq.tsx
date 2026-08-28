import { useState, useEffect, useMemo } from 'react'
import { Eye, Edit, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { ProcStatusBadge } from '@/components/procurement/ProcShell'
import { ProcurementToolbar } from '@/components/procurement/ProcurementToolbar'
import * as api from '@/api/procurement'
import { getSuppliers } from '@/api/masters'

export function RfqPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [prs, setPrs] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])

  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  
  const [form, setForm] = useState<any>({
    title: '',
    category: '',
    buyer: '',
    quoteDueBy: '',
    prRefs: [],
    lines: [],
    suppliers: []
  })

  const fetchList = () => {
    setLoading(true)
    api.getRfqs().then(res => {
      setData(res || [])
      setLoading(false)
    }).catch(() => {
      toast.error('Error', 'Failed to load RFQs')
      setLoading(false)
    })
  }

  useEffect(() => {
    fetchList()
    // Fetch APPROVED PRs for referencing
    api.getRequisitions().then(res => {
      setPrs(res?.filter((pr:any) => pr.status === 'APPROVED') || [])
    }).catch(console.error)
    getSuppliers().then(setSuppliers).catch(console.error)
  }, [])

  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (search && !d.docNo?.toLowerCase().includes(search.toLowerCase()) && !d.title?.toLowerCase().includes(search.toLowerCase())) return false
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

  const handleOpenForm = (rfq?: any) => {
    if (rfq) {
      setEditing(rfq)
      setForm({
        title: rfq.title || '',
        category: rfq.category || '',
        buyer: rfq.buyer || '',
        quoteDueBy: rfq.quoteDueBy ? new Date(rfq.quoteDueBy).toISOString().split('T')[0] : '',
        prRefs: rfq.prRefs || [],
        lines: rfq.lines || [],
        suppliers: rfq.suppliers || []
      })
    } else {
      setEditing(null)
      setForm({
        title: '',
        category: '',
        buyer: '',
        quoteDueBy: '',
        prRefs: [],
        lines: [],
        suppliers: []
      })
    }
    setFormOpen(true)
  }

  const handleView = (rfq: any) => {
    setEditing(rfq)
    setViewOpen(true)
  }

  const handlePrSelect = async (prUid: string) => {
    if (!prUid) {
      setForm({...form, prRefs: [], lines: []})
      return
    }
    try {
      const fullPr = await api.getRequisition(prUid)
      if (fullPr && fullPr.lines) {
        const newLines = fullPr.lines.map((l:any) => ({
          itemCode: l.itemUid || l.itemCode,
          itemName: l.itemName,
          uom: l.uom,
          qty: l.qty,
          requiredBy: l.requiredBy,
          specification: l.remarks
        }))
        setForm({...form, prRefs: [prUid], lines: newLines, category: fullPr.department || fullPr.itemType || ''})
      } else {
        toast.error('Error', 'No items found in selected PR')
        setForm({...form, prRefs: [prUid], lines: [], category: fullPr?.department || fullPr?.itemType || ''})
      }
    } catch (err) {
      console.error(err)
      toast.error('Error', 'Failed to load PR details')
    }
  }

  const handleSupplierAdd = (supUid: string) => {
    if (!supUid) return
    if (form.suppliers.some((s:any) => s.supplierUid === supUid)) return
    
    const sup = suppliers.find(s => s.uid === supUid || s.id === supUid)
    if (sup) {
      setForm({...form, suppliers: [...form.suppliers, {
        supplierUid: sup.uid || sup.id,
        supplierName: sup.name
      }]})
    }
  }

  const handleSave = async () => {
    if (form.lines.length === 0) return toast.error('Validation', 'At least one item is required')
    if (!form.category) return toast.error('Validation', 'Category is required')
    if (!form.quoteDueBy) return toast.error('Validation', 'Quote Due By date is required')


    
    if (!form.quoteDueBy) return toast.error('Validation', 'Quotation Due Date is required')
    if (!form.suppliers || form.suppliers.length === 0) return toast.error('Validation', 'Select at least one supplier')

    const today = new Date().toISOString().slice(0, 10)
    const nowIso = new Date().toISOString()

    try {
      const payload = {
        docNo: editing?.docNo && editing.docNo !== 'null' ? editing.docNo : null,
        docDate: editing?.docDate ? String(editing.docDate).slice(0, 10) : today,
        status: editing?.status || 'OPEN',
        plant: editing?.plant || 'DEFAULT',
        title: form.title || `RFQ - ${form.category || 'General'}`,
        category: form.category || 'General',
        buyer: form.buyer || '',
        quoteDueBy: String(form.quoteDueBy).slice(0, 10),
        prRefs: form.prRefs,
        lines: form.lines.map((l: any) => ({
          itemCode: String(l.itemCode ?? l.itemUid ?? ''),
          itemName: l.itemName || '',
          uom: l.uom || '',
          qty: Number(l.qty) || 0,
          requiredBy: l.requiredBy ? String(l.requiredBy).slice(0, 10) : today,
          specification: l.specification || l.remarks || null,
        })),
        suppliers: form.suppliers.map((s: any) => ({
          supplierUid: String(s.supplierUid),
          supplierName: s.supplierName || '',
          invitedAt: s.invitedAt || nowIso,
          responseStatus: s.responseStatus || 'PENDING',
        })),
      }

      if (editing) {
        await api.updateRfq(editing.uid || editing.id, payload)
        toast.success('Success', 'RFQ updated')
      } else {
        await api.createRfq(payload)
        toast.success('Success', 'RFQ created successfully')
      }
      setFormOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Error', err.message || 'Failed to save RFQ')
    }
  }

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'RFQ Number', width: '160px', render: (r) => <span className="text-xs font-semibold text-brand-700">{r.docNo || '-'}</span> },
    { key: 'docDate', header: 'Date', render: (r) => formatDate(r.docDate), width: '130px' },
    { key: 'title', header: 'Title' },
    { key: 'quoteDueBy', header: 'Quote Due By', render: (r) => r.quoteDueBy ? formatDate(r.quoteDueBy) : '-', width: '130px' },
    { key: 'suppliers', header: 'Suppliers', align: 'center' as const, render: (r) => r.suppliers?.length || 0, width: '80px' },
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
        title="Request for Quotation (RFQ)"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'RFQs' }]}
        actions={
          <Button variant="primary" onClick={() => handleOpenForm()}>
            <Plus className="mr-2 h-4 w-4" /> New RFQ
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

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.docNo}` : 'New Request for Quotation'} size="xl">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Reference PR" />
            <CardBody>
              <Select label="Select Approved PR to automatically load items" value={form.prRefs[0] || ''} onChange={e => handlePrSelect(e.target.value)}>
                <option value="">-- Select PR --</option>
                {prs.filter(pr => {
                  if (editing && form.prRefs.includes(pr.uid || pr.id)) return true;
                  const prIdStr = String(pr.uid || pr.id);
                  return !data.some(rfq => rfq.prRefs?.some((ref: any) => String(ref) === prIdStr || String(ref) === pr.docNo));
                }).map((pr, idx) => <option key={pr.uid || pr.id || idx} value={pr.uid || pr.id}>{pr.docNo} - {pr.department || pr.itemType}</option>)}
              </Select>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="RFQ Details" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Input label="Category" value={form.category} onChange={e => setForm({...form, category: e.target.value})} />
              <Input type="date" label="Quote Due By" value={form.quoteDueBy} onChange={e => setForm({...form, quoteDueBy: e.target.value})} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Items" />
            <CardBody className="p-0">
              <table className="grid-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-10 col-center">S.No</th>
                    <th>Item</th>
                    <th>UOM</th>
                    <th className="col-right">Qty</th>
                    <th>Required Date</th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="col-center">{i + 1}</td>
                      <td>{l.itemName}</td>
                      <td>{l.uom}</td>
                      <td className="col-right">{l.qty}</td>
                      <td>{l.requiredBy ? formatDate(l.requiredBy) : '-'}</td>
                    </tr>
                  ))}
                  {form.lines.length === 0 && (
                    <tr><td colSpan={5} className="col-center text-fg-muted py-4">No items loaded. Please select a PR.</td></tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Select Suppliers" />
            <CardBody>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-2">
                {suppliers.map((s, idx) => {
                  const supUid = s.uid || s.id;
                  const isChecked = form.suppliers.some((fs: any) => fs.supplierUid === supUid);
                  return (
                    <label key={supUid || idx} className="flex items-center space-x-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="form-checkbox h-4 w-4 text-brand-600 rounded border-border-strong focus:ring-brand-500"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            handleSupplierAdd(supUid);
                          } else {
                            const newSups = form.suppliers.filter((fs: any) => fs.supplierUid !== supUid);
                            setForm({...form, suppliers: newSups});
                          }
                        }}
                      />
                      <span className="text-sm font-medium text-fg">{s.name}</span>
                    </label>
                  );
                })}
              </div>
              {suppliers.length === 0 && (
                <div className="text-sm text-fg-muted text-center py-4">No suppliers available.</div>
              )}
            </CardBody>
          </Card>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>{editing ? 'Update RFQ' : 'Create RFQ'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={`View RFQ - ${editing?.docNo}`} size="xl">
        {editing && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50/50 p-4 rounded-lg border border-border">
              <div><span className="text-fg-muted">RFQ Number:</span> <span className="font-medium">{editing.docNo}</span></div>
              <div><span className="text-fg-muted">Date:</span> <span className="font-medium">{formatDate(editing.docDate)}</span></div>
              <div><span className="text-fg-muted">Title:</span> <span className="font-medium">{editing.title}</span></div>
              <div><span className="text-fg-muted">Category:</span> <span className="font-medium">{editing.category}</span></div>
              <div><span className="text-fg-muted">Quote Due By:</span> <span className="font-medium">{editing.quoteDueBy ? formatDate(editing.quoteDueBy) : '-'}</span></div>
            </div>

            <Card>
              <CardHeader title="Items" />
              <CardBody className="p-0">
                <table className="grid-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="w-10">S.No</th>
                      <th>Item</th>
                      <th>UOM</th>
                      <th className="text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editing.lines?.map((l: any, i: number) => (
                      <tr key={i}>
                        <td className="text-center">{i + 1}</td>
                        <td>{l.itemName}</td>
                        <td>{l.uom}</td>
                        <td className="text-right">{l.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Selected Suppliers" />
              <CardBody className="p-0">
                <table className="grid-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="w-10">S.No</th>
                      <th>Supplier Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editing.suppliers?.map((s: any, i: number) => (
                      <tr key={i}>
                        <td className="text-center">{i + 1}</td>
                        <td>{s.supplierName}</td>
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
