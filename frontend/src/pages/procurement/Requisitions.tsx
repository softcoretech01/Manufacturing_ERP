import { useState, useEffect, useMemo } from 'react'
import { Edit, Eye, Plus, Trash2 } from 'lucide-react'
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
import { getItems, getEmployees } from '@/api/masters'
import { useItemCategories } from '@/hooks/useItemCategories'

export function RequisitionsPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [masters, setMasters] = useState<{items: any[], employees: any[]}>({items: [], employees: []})

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  
  const [form, setForm] = useState<any>({
    requestedBy: '',
    requiredBy: '',
    justification: '',
    itemType: '',
    lines: []
  })

  // For PR item selection flow
  const [itemEntry, setItemEntry] = useState({ categoryId: '', itemId: '', qty: '', unitPrice: '' })

  const cats = useItemCategories()

  const fetchList = () => {
    setLoading(true)
    api.getRequisitions().then(res => {
      setData(res || [])
      setLoading(false)
    }).catch(() => {
      toast.error('Error', 'Failed to load requisitions')
      setLoading(false)
    })
  }

  useEffect(() => {
    fetchList()
    Promise.all([getItems(), getEmployees()]).then(
      ([items, employees]) => setMasters({items, employees})
    ).catch(() => toast.error('Error', 'Failed to load master data'))
  }, [])

  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (search && !d.docNo?.toLowerCase().includes(search.toLowerCase()) && !d.requestedBy?.toLowerCase().includes(search.toLowerCase())) return false
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

  const handleOpenForm = (pr?: any) => {
    if (pr) {
      setEditing(pr)
      setForm({
        requestedBy: pr.requestedBy || '',
        requiredBy: pr.requiredBy ? new Date(pr.requiredBy).toISOString().split('T')[0] : '',
        justification: pr.justification || '',
        itemType: pr.itemType || (pr.lines?.length ? masters.items.find(i => i.uid === pr.lines[0].itemUid)?.itemType : ''),
        lines: pr.lines ? pr.lines.map((l:any) => ({
          itemUid: l.itemUid || '',
          itemName: l.itemName || '',
          uom: l.uom || '',
          qty: l.qty || '',
          unitPrice: l.estimatedRate || l.unitPrice || 0,
          total: (l.qty || 0) * (l.estimatedRate || l.unitPrice || 0)
        })) : []
      })
    } else {
      setEditing(null)
      setForm({
        requestedBy: '',
        requiredBy: '',
        justification: '',
        itemType: '',
        lines: []
      })
    }
    setItemEntry({ categoryId: '', itemId: '', qty: '', unitPrice: '' })
    setFormOpen(true)
  }

  const handleView = (pr: any) => {
    setEditing(pr)
    setViewOpen(true)
  }

  const handleSave = (isDraft: boolean) => async () => {
    if (!form.itemType) return toast.error('Validation', 'Item Type is required')
    if (!form.requestedBy.trim()) return toast.error('Validation', 'Requested By is required')
    if (!form.requiredBy) return toast.error('Validation', 'Required Date is required')
    if (form.lines.length === 0) return toast.error('Validation', 'At least one item is required')

    const today = new Date().toISOString().slice(0, 10)
    const requiredByDate = form.requiredBy

    try {
      const targetStatus = isDraft ? 'DRAFT' : 'PENDING_APPROVAL'
      const payload = {
        docNo: editing?.docNo || null,
        docDate: today,
        status: targetStatus,
        plant: 'DEFAULT',
        source: 'MANUAL',
        department: form.itemType,
        requestedBy: form.requestedBy.trim(),
        priority: 'NORMAL',
        requiredBy: requiredByDate,
        justification: form.justification || '',
        estimatedValue: form.lines.reduce((s: number, l: any) => s + (l.total || 0), 0),
        remarks: form.justification || null,
        version: 1,
        attachments: 0,
        comments: 0,
        lines: form.lines.map((l: any) => ({
          itemCode: l.itemCode || String(l.itemUid || ''),
          itemName: l.itemName,
          uom: l.uom,
          qty: Number(l.qty),
          qtyOrdered: 0,
          requiredBy: requiredByDate,
          estimatedRate: l.unitPrice || 0,
          costCentre: null,
          suggestedSupplier: null,
          specification: null,
          remarks: l.remarks || ''
        })),
        approvals: [],
      }

      if (editing) {
        await api.updateRequisition(editing.uid || editing.id, payload)
        toast.success('Success', `PR updated as ${targetStatus}`)
      } else {
        await api.createRequisition(payload)
        toast.success('Success', `PR created successfully as ${targetStatus}`)
      }
      setFormOpen(false)
      fetchList()
    } catch (err: any) {
      toast.error('Error', err.message || 'Failed to save requisition')
    }
  }

  const handleApproveFromList = async (pr: any) => {
    try {
      await api.updateRequisition(pr.uid || pr.id, { ...pr, status: 'PENDING_APPROVAL' })
      toast.success('Success', 'Submitted for approval')
      fetchList()
    } catch (err: any) {
      toast.error('Error', 'Failed to submit')
    }
  }

  const handleDeletePR = async (id: number | string) => {
    if (!confirm('Are you sure you want to delete this PR?')) return
    try {
      await api.deleteRequisition(String(id))
      toast.success('Success', 'PR deleted successfully')
      fetchList()
    } catch (err) {
      toast.error('Error', 'Failed to delete PR')
    }
  }

  const handleItemTypeChange = (val: string) => {
    setForm({...form, itemType: val, lines: []})
    setItemEntry({ categoryId: '', itemId: '', qty: '', unitPrice: '' })
  }

  // Item Type = the two category parents; categories + item→parent mapping all
  // come from the shared Item Category master (no hardcoded category arrays).
  const ITEM_TYPE_OPTIONS = cats.parents.length ? cats.parents : ['Product Items', 'Company Items']

  const availableCategories = useMemo(() => {
    if (!form.itemType) return []
    return cats.byParent[form.itemType] || []
  }, [cats, form.itemType])

  const availableItems = useMemo(() => {
    if (!form.itemType) return []
    let filtered = masters.items.filter(i => cats.parentFor[i.category] === form.itemType)
    if (itemEntry.categoryId) {
      filtered = filtered.filter(i => i.category === itemEntry.categoryId)
    }
    return filtered
  }, [masters.items, cats, form.itemType, itemEntry.categoryId])

  const handleAddItem = () => {
    if (!itemEntry.itemId || !itemEntry.qty || Number(itemEntry.qty) <= 0) {
      return toast.warning('Validation', 'Please select an item and valid quantity')
    }
    const item = masters.items.find(i => String(i.uid || i.id) === String(itemEntry.itemId))
    if (!item) {
      toast.error('Error', 'Selected item not found. Please re-select the item.')
      return
    }
    const price = Number(itemEntry.unitPrice) || Number(item.lastPurchasePrice || item.purchasePrice || item.standardCost || item.sellingPrice || 0)
    const qty = Number(itemEntry.qty)
    
    const existingIndex = form.lines.findIndex((l:any) => String(l.itemUid) === String(itemEntry.itemId))
    if (existingIndex > -1) {
      const newLines = [...form.lines]
      newLines[existingIndex].qty += qty
      newLines[existingIndex].total = newLines[existingIndex].qty * price
      setForm({...form, lines: newLines})
    } else {
      const newLine = {
        itemUid: item.uid || item.id,
        itemCode: item.code || String(item.uid || item.id),
        itemName: item.name,
        uom: item.baseUom,
        qty: qty,
        unitPrice: price,
        total: qty * price,
        category: item.category,
        itemType: item.itemType
      }
      setForm({...form, lines: [...form.lines, newLine]})
    }
    setItemEntry({ ...itemEntry, itemId: '', qty: '', unitPrice: '' })
  }

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', width: '52px', align: 'center' as const, render: (_, i) => i + 1 },
    { key: 'docNo', header: 'PR Number', width: '160px', render: (r) => (
      r.docNo && r.docNo !== 'null'
        ? <span className="text-xs font-semibold text-brand-700">{r.docNo}</span>
        : <span className="text-xs text-fg-muted italic">Auto-generating…</span>
    ) },
    { key: 'docDate', header: 'Request Date', width: '130px', render: (r) => formatDate(r.docDate) },
    { key: 'requestedBy', header: 'Requested By' },
    { key: 'itemType', header: 'Item Type', width: '140px', render: (r) => r.itemType || r.department || '-' },
    { key: 'requiredBy', header: 'Required Date', width: '130px', render: (r) => r.requiredBy ? formatDate(r.requiredBy) : '-' },
    { key: 'items', header: 'Items', width: '72px', align: 'center' as const, render: (r) => r.lines?.length || 0 },
    { key: 'status', header: 'Status', width: '150px', className: 'col-flex', render: (r) => <ProcStatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'Action',
      width: '164px',
      className: 'col-flex',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => handleView(r)} title="View">
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => handleOpenForm(r)} title="Edit">
            <Edit className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={() => handleDeletePR(r.uid || r.id)} title="Delete" className="text-danger hover:text-danger hover:bg-danger/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  const subtotal = form.lines.reduce((acc: number, l: any) => acc + (l.total || 0), 0)
  const tax = subtotal * 0.18
  const grandTotal = subtotal + tax

  return (
    <div className="flex h-full w-full flex-col flex-1">
      <PageHeader
        title="Purchase Requisitions"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'Requisitions' }]}
        actions={
          <Button variant="primary" onClick={() => handleOpenForm()}>
            <Plus className="mr-2 h-4 w-4" /> New PR
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

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.docNo}` : 'New Purchase Requisition'} size="3xl">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Basic Information" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Select label="Item Type" value={form.itemType} onChange={e => handleItemTypeChange(e.target.value)} disabled={!!editing}>
                <option value="">Select Item Type</option>
                {ITEM_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Input label="Requested By" value={form.requestedBy} onChange={e => setForm({...form, requestedBy: e.target.value})} placeholder="Enter name manually" />
              <Input type="date" label="Required Date" value={form.requiredBy} onChange={e => setForm({...form, requiredBy: e.target.value})} />
              <Input label="Remarks" value={form.justification} onChange={e => setForm({...form, justification: e.target.value})} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Add Item" />
            <CardBody className="grid gap-4 sm:grid-cols-7 items-end">
              <div className="sm:col-span-2">
                <Select label="Category (Optional)" value={itemEntry.categoryId} onChange={e => setItemEntry({...itemEntry, categoryId: e.target.value, itemId: ''})} disabled={!form.itemType || availableCategories.length === 0}>
                  <option value="">Select Category</option>
                  {availableCategories.map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Select label="Item" value={itemEntry.itemId} onChange={e => {
                  const item = availableItems.find(i => String(i.uid || i.id) === e.target.value)
                  const defaultPrice = item ? (item.lastPurchasePrice || item.purchasePrice || item.standardCost || item.sellingPrice || 0) : ''
                  setItemEntry({...itemEntry, itemId: e.target.value, unitPrice: String(defaultPrice)})
                }} disabled={!form.itemType}>
                  <option value="">Select Item</option>
                  {availableItems.map(i => <option key={String(i.uid || i.id)} value={String(i.uid || i.id)}>{i.name}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-1">
                <Input type="number" label="Quantity" value={itemEntry.qty} onChange={e => setItemEntry({...itemEntry, qty: e.target.value})} disabled={!itemEntry.itemId} />
              </div>
              <div className="sm:col-span-1">
                <Input type="number" label="Unit Price" value={itemEntry.unitPrice} onChange={e => setItemEntry({...itemEntry, unitPrice: e.target.value})} disabled={!itemEntry.itemId} />
              </div>
              <div className="sm:col-span-1">
                <Button variant="outline" className="w-full" onClick={handleAddItem} disabled={!itemEntry.itemId || !itemEntry.qty}>Add</Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Items" />
            <CardBody className="p-0">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-border">
                    <th className="py-2 px-3 text-left text-fg-muted font-medium w-10">#</th>
                    <th className="py-2 px-3 text-left text-fg-muted font-medium">Category</th>
                    <th className="py-2 px-3 text-left text-fg-muted font-medium">Item</th>
                    <th className="py-2 px-3 text-center text-fg-muted font-medium w-14">UOM</th>
                    <th className="py-2 px-3 text-right text-fg-muted font-medium w-16">Qty</th>
                    <th className="py-2 px-3 text-right text-fg-muted font-medium w-24">Unit Price</th>
                    <th className="py-2 px-3 text-right text-fg-muted font-medium w-24">Total</th>
                    <th className="py-2 px-3 text-center text-fg-muted font-medium w-16">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-gray-50/50">
                      <td className="py-2 px-3 text-center text-fg-muted">{i + 1}</td>
                      <td className="py-2 px-3 text-fg-muted">{l.category || '-'}</td>
                      <td className="py-2 px-3 font-medium text-fg">{l.itemName}</td>
                      <td className="py-2 px-3 text-center text-fg-muted">{l.uom}</td>
                      <td className="py-2 px-3 text-right">{l.qty}</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(l.unitPrice || 0)}</td>
                      <td className="py-2 px-3 text-right font-semibold text-fg">{formatCurrency(l.total || 0)}</td>
                      <td className="py-2 px-3 text-center">
                        <button onClick={() => {
                          const newLines = [...form.lines]
                          newLines.splice(i, 1)
                          setForm({...form, lines: newLines})
                        }} className="text-danger hover:text-red-700 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {form.lines.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-fg-muted py-6 text-xs">No items added yet.</td></tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <div className="flex justify-between items-center border-t border-border pt-4 mt-6">
            <div className="text-sm font-semibold text-fg">
              Grand Total: {formatCurrency(grandTotal)} <span className="text-xs text-fg-muted font-normal">(inc. 18% tax)</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button variant="outline" onClick={handleSave(true)}>Save Draft</Button>
              <Button variant="primary" onClick={handleSave(false)}>Submit for Approval</Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={`View PR - ${editing?.docNo}`} size="3xl">
        {editing && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50/50 p-4 rounded-lg border border-border">
              <div><span className="text-fg-muted">PR Number:</span> <span className="font-medium font-mono text-brand-700">{editing.docNo && editing.docNo !== 'null' ? editing.docNo : <span className="italic text-fg-muted font-sans">Auto-generating…</span>}</span></div>
              <div><span className="text-fg-muted">Request Date:</span> <span className="font-medium">{formatDate(editing.docDate)}</span></div>
              <div><span className="text-fg-muted">Requested By:</span> <span className="font-medium">{editing.requestedBy || '-'}</span></div>
              <div><span className="text-fg-muted">Item Type:</span> <span className="font-medium">{editing.department || editing.itemType || 'Product Item'}</span></div>
            </div>

            <Card>
              <CardHeader title="Items" />
              <CardBody className="p-0">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-border">
                      <th className="py-2 px-3 text-center text-fg-muted font-medium w-12">#</th>
                      <th className="py-2 px-3 text-left text-fg-muted font-medium">Item</th>
                      <th className="py-2 px-3 text-center text-fg-muted font-medium w-20">UOM</th>
                      <th className="py-2 px-3 text-right text-fg-muted font-medium w-24">Qty</th>
                      <th className="py-2 px-3 text-right text-fg-muted font-medium w-32">Unit Price</th>
                      <th className="py-2 px-3 text-right text-fg-muted font-medium w-32">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editing.lines?.map((l: any, i: number) => {
                      const item = masters.items.find(mi => mi.uid === l.itemCode || mi.id === l.itemCode || mi.code === l.itemCode)
                      const itemPrice = item ? (item.lastPurchasePrice || item.purchasePrice || item.standardCost || item.sellingPrice || 0) : 0
                      const price = l.estimatedRate || l.unitPrice || itemPrice || 0
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-gray-50/50">
                          <td className="py-2 px-3 text-center text-fg-muted">{i + 1}</td>
                          <td className="py-2 px-3 font-medium text-fg">{l.itemName}</td>
                          <td className="py-2 px-3 text-center text-fg-muted">{l.uom}</td>
                          <td className="py-2 px-3 text-right">{l.qty}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(price)}</td>
                          <td className="py-2 px-3 text-right font-medium text-fg">{formatCurrency((l.qty || 0) * price)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="flex justify-end p-4 border-t border-border bg-gray-50/50">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-fg-muted">Subtotal</span>
                      <span className="font-medium text-fg">
                        {formatCurrency(editing.lines?.reduce((a:number, b:any) => {
                          const item = masters.items.find(mi => mi.uid === b.itemCode || mi.id === b.itemCode || mi.code === b.itemCode)
                          const itemPrice = item ? (item.lastPurchasePrice || item.purchasePrice || item.standardCost || item.sellingPrice || 0) : 0
                          const price = b.estimatedRate || b.unitPrice || itemPrice || 0
                          return a + (b.qty||0)*price
                        }, 0) || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
              {editing.status === 'DRAFT' && (
                <Button variant="primary" onClick={async () => { await handleApproveFromList(editing); setViewOpen(false) }}>Submit for Approval</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
