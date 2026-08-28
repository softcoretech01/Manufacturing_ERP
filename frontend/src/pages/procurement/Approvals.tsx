import { useState, useEffect, useMemo } from 'react'
import { Eye, Check, X as XIcon, CornerUpLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { Textarea } from '@/components/ui/Input'
import { formatDate, formatCurrency } from '@/lib/format'
import { ProcurementToolbar } from '@/components/procurement/ProcurementToolbar'
import { approvals } from '@/api/workflow'
import { getRequisitions, getPurchaseOrders, getRfqs } from '@/api/procurement'

function DocumentPreview({ task }: { task: any }) {
  const [lines, setLines] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!task || !task.document_no) return
    setLoading(true)
    
    const fetchDoc = async () => {
      try {
        let docs = []
        if (task.document_type === 'PURCHASE_REQUISITION') {
          docs = await getRequisitions()
        } else if (task.document_type === 'PURCHASE_ORDER') {
          docs = await getPurchaseOrders()
        } else if (task.document_type === 'REQUEST_FOR_QUOTATION') {
          docs = await getRfqs()
        }
        
        const doc = docs.find((d: any) => d.docNo === task.document_no)
        if (doc && doc.lines) {
          setLines(doc.lines)
        } else {
          setLines([])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchDoc()
  }, [task])

  if (loading) return <div className="text-sm text-fg-muted py-4 text-center">Loading document details...</div>
  
  if (lines.length === 0) return null

  return (
    <div className="mt-2 border border-border rounded-lg overflow-hidden">
      <div className="bg-surface-2 px-4 py-2 border-b border-border text-sm font-semibold text-fg">Document Items</div>
      <table className="w-full text-sm text-left">
        <thead className="bg-surface-2 text-fg-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Item</th>
            <th className="px-4 py-2 font-medium">UOM</th>
            <th className="px-4 py-2 font-medium text-right">Qty</th>
            {task.document_type === 'PURCHASE_ORDER' && <th className="px-4 py-2 font-medium text-right">Rate</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="px-4 py-2">{l.itemName || l.itemCode}</td>
              <td className="px-4 py-2">{l.uom}</td>
              <td className="px-4 py-2 text-right">{l.qty || l.orderQty}</td>
              {task.document_type === 'PURCHASE_ORDER' && <td className="px-4 py-2 text-right">{formatCurrency(l.rate || 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ApprovalsPage() {
  const toast = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  
  const [viewOpen, setViewOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<any>(null)
  
  const [actionModal, setActionModal] = useState<{open: boolean, type: 'APPROVE' | 'REJECT' | 'RETURN' | null, taskUid: string | null}>({open: false, type: null, taskUid: null})
  const [comments, setComments] = useState('')

  const fetchInbox = () => {
    setLoading(true)
    approvals.inbox(false)
      .then(res => {
        setData(res || [])
        setLoading(false)
      })
      .catch(() => {
        toast.error('Error', 'Failed to load inbox tasks')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchInbox()
  }, [])

  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (search && !d.document_no?.toLowerCase().includes(search.toLowerCase()) && !d.document_type?.toLowerCase().includes(search.toLowerCase())) return false
      if (dateFrom && new Date(d.assigned_at) < new Date(dateFrom)) return false
      if (dateTo && new Date(d.assigned_at) > new Date(dateTo)) return false
      return true
    })
  }, [data, search, dateFrom, dateTo])

  const handleResetFilters = () => {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    fetchInbox()
  }

  const handleAction = async () => {
    if ((actionModal.type === 'REJECT' || actionModal.type === 'RETURN') && !comments.trim()) {
      return toast.error('Validation', 'Comments are required for this action')
    }

    try {
      if (actionModal.taskUid && actionModal.type) {
        await approvals.decide(actionModal.taskUid, { action: actionModal.type, comments })
        toast.success('Success', `Task ${actionModal.type.toLowerCase()}d successfully`)
        setActionModal({ open: false, type: null, taskUid: null })
        setComments('')
        setViewOpen(false)
        fetchInbox()
      }
    } catch (err: any) {
      toast.error('Error', err.message || 'Action failed')
    }
  }

  const columns: Column<any>[] = [
    { key: 'sno', header: 'S.No', render: (_, i) => i + 1, width: '60px' },
    { key: 'document_no', header: 'Document No', render: r => r.document_no || r.document_label || '-', width: '160px' },
    { key: 'document_type', header: 'Type', width: '140px' },
    { key: 'requester', header: 'Requested By', render: r => r.requester || '-', width: '150px' },
    { key: 'assigned_at', header: 'Date', render: r => formatDate(r.assigned_at), width: '130px' },
    { key: 'amount', header: 'Amount', render: r => r.amount ? formatCurrency(r.amount) : '-', width: '120px' },
    { key: 'level_name', header: 'Approval Level', render: r => `${r.level_no} of ${r.total_levels} (${r.level_name || 'Level'})`, width: '180px' },
    {
      key: 'actions',
      header: 'Action',
      width: '200px',
      className: 'col-flex',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedTask(r); setViewOpen(true); }} title="View">
            <Eye className="h-4 w-4 text-brand-600" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setActionModal({open: true, type: 'APPROVE', taskUid: r.task_uid})} title="Approve">
            <Check className="h-4 w-4 text-success" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setActionModal({open: true, type: 'REJECT', taskUid: r.task_uid})} title="Reject">
            <XIcon className="h-4 w-4 text-danger" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-full w-full flex-col flex-1">
      <PageHeader
        title="Approval Center"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement/dashboard' }, { label: 'Approvals' }]}
      />
      
      <ProcurementToolbar 
        search={search} onSearchChange={setSearch}
        dateFrom={dateFrom} onDateFromChange={setDateFrom}
        dateTo={dateTo} onDateToChange={setDateTo}
        onReset={handleResetFilters}
      />

      <div className="flex-1 min-h-0 flex flex-col gap-4 mt-4">
        <DataTable searchable={false} rows={filteredData} rowKey={(r) => r.task_uid || String(Math.random())} columns={columns} loading={loading} />
      </div>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Approval Task Details" size="2xl">
        {selectedTask && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50/50 p-4 rounded-lg border border-border">
              <div><span className="text-fg-muted">Document:</span> <span className="font-medium">{selectedTask.document_no || selectedTask.document_label}</span></div>
              <div><span className="text-fg-muted">Type:</span> <span className="font-medium">{selectedTask.document_type}</span></div>
              <div><span className="text-fg-muted">Requested By:</span> <span className="font-medium">{selectedTask.requester}</span></div>
              <div><span className="text-fg-muted">Date:</span> <span className="font-medium">{formatDate(selectedTask.assigned_at)}</span></div>
              <div><span className="text-fg-muted">Amount:</span> <span className="font-medium">{formatCurrency(selectedTask.amount || 0)}</span></div>
              <div><span className="text-fg-muted">Level:</span> <span className="font-medium">{selectedTask.level_no} of {selectedTask.total_levels}</span></div>
            </div>

            <DocumentPreview task={selectedTask} />

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
              <Button variant="outline" className="text-danger" onClick={() => setActionModal({open: true, type: 'REJECT', taskUid: selectedTask.task_uid})}>Reject</Button>
              <Button variant="primary" className="bg-success text-white hover:bg-success/90" onClick={() => setActionModal({open: true, type: 'APPROVE', taskUid: selectedTask.task_uid})}>Approve</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={actionModal.open} onClose={() => setActionModal({open: false, type: null, taskUid: null})} title={`${actionModal.type?.toLowerCase() || ''} Task`} size="md">
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Are you sure you want to {actionModal.type?.toLowerCase()} this task?
          </p>
          <Textarea 
            label="Comments (Required for Reject/Send Back)" 
            rows={3} 
            value={comments} 
            onChange={e => setComments(e.target.value)} 
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setActionModal({open: false, type: null, taskUid: null})}>Cancel</Button>
            <Button variant={actionModal.type === 'APPROVE' ? 'primary' : actionModal.type === 'REJECT' ? 'danger' : 'outline'} onClick={handleAction}>Confirm</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
