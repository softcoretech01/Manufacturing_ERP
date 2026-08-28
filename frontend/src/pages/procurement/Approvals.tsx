import { useState, useEffect, useMemo } from 'react'
import { Eye, Check, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { Textarea } from '@/components/ui/Input'
import { formatDate, formatCurrency } from '@/lib/format'
import { ProcurementToolbar } from '@/components/procurement/ProcurementToolbar'
import { approvals } from '@/api/workflow'
import { getRequisitions, getPurchaseOrders, getRfqs } from '@/api/procurement'
import { getSuppliers, getPaymentTerms } from '@/api/masters'
import { useItemLookup } from '@/hooks/useItemLookup'
import {
  Section, FieldGrid, Field, LineItemsTable, TotalsPanel, EmptyState,
  money, qty as fmtQty,
} from '@/components/procurement/ProcKit'

/** Business names for the workflow's entity types — never show the raw code. */
const DOC_TYPE_LABEL: Record<string, string> = {
  PURCHASE_REQUISITION: 'Purchase Requisition',
  PURCHASE_ORDER: 'Purchase Order',
  REQUEST_FOR_QUOTATION: 'Request for Quotation',
}

/*
 * The document, as the approver actually needs to see it.
 *
 * A workflow task carries only a document number and a total, which is not
 * enough to approve anything - it says nothing about who the order is for, what
 * it came from upstream, or how the total was arrived at. So the referenced
 * document is fetched from its own module and rendered with the same kit the
 * buyer's own screens use: same columns, same money formatting, same totals. An
 * approver should never be shown a thinner document than the person who raised
 * it.
 */
function DocumentPreview({ task }: { task: any }) {
  const [doc, setDoc] = useState<any | null>(null)
  const [prs, setPrs] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const lookup = useItemLookup()

  useEffect(() => {
    if (!task?.document_no) return
    let alive = true
    setLoading(true)
    const load = async () => {
      try {
        // Requisitions and suppliers are needed whatever the document type: one
        // resolves a PR reference to its number, the other a supplier id to a
        // name. Neither may be shown to an approver as a raw id.
        const [prRows, supplierRows, termRows] = await Promise.all([
          getRequisitions(), getSuppliers(), getPaymentTerms(),
        ])
        let docs: any[] = prRows || []
        if (task.document_type === 'PURCHASE_ORDER') docs = (await getPurchaseOrders()) || []
        else if (task.document_type === 'REQUEST_FOR_QUOTATION') docs = (await getRfqs()) || []
        if (!alive) return
        setPrs(prRows || [])
        setSuppliers(supplierRows || [])
        setTerms(termRows || [])
        setDoc(docs.find((d: any) => d.docNo === task.document_no) ?? null)
      } catch (err) {
        console.error(err)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [task])

  if (loading) return <div className="py-4 text-center text-sm text-fg-muted">Loading document details...</div>
  if (!doc) return <EmptyState message="The referenced document could not be loaded." />

  const isPo = task.document_type === 'PURCHASE_ORDER'
  const isRfq = task.document_type === 'REQUEST_FOR_QUOTATION'
  // An RFQ asks suppliers for prices - it carries none of its own, so pricing
  // columns and a totals panel would be empty furniture on one.
  const priced = !isRfq
  const lines: any[] = doc.lines || []

  /** Referenced PRs by document number - never the internal id. */
  const prLabel = (refs?: any[]) =>
    refs?.length
      ? refs.map((r) => prs.find((p) => String(p.uid ?? p.id) === String(r))?.docNo || r).join(', ')
      : ''

  const supplierName =
    doc.supplierName
    || suppliers.find((s) => String(s.uid ?? s.id) === String(doc.supplierUid))?.name
    || doc.supplierUid

  // A PO line carries its own priced amounts; a PR line only an estimated rate.
  const rateOf = (l: any) => Number(l.rate ?? l.estimatedRate ?? l.unitPrice) || 0
  const totalOf = (l: any) => Number(l.lineTotal) || rateOf(l) * (Number(l.qty) || 0)

  // A PO's money is authoritative and already stored; a PR is only an estimate,
  // totalled the same way the requisition screen totals it.
  const subtotal = isPo ? Number(doc.basicValue) || 0 : lines.reduce((a, l) => a + totalOf(l), 0)
  const tax = isPo ? Number(doc.taxValue) || 0 : subtotal * 0.18
  const grandTotal = isPo ? Number(doc.totalValue) || 0 : subtotal + tax

  const dueDate = isPo ? doc.promisedDate : isRfq ? doc.quoteDueBy : doc.requiredBy

  return (
    <>
      <Section title="Document Details">
        <FieldGrid>
          {isPo && <Field label="Supplier" value={supplierName} />}
          {isPo && <Field label="Reference Quotation" mono value={doc.rfqNo} />}
          <Field
            label={isPo || isRfq ? 'Reference PR' : 'PR Number'}
            mono
            value={isPo || isRfq ? prLabel(doc.prRefs) : doc.docNo}
          />
          {!isPo && <Field label="Requested By" value={doc.requestedBy || doc.buyer} />}
          <Field label="Document Date" value={doc.docDate ? formatDate(doc.docDate) : null} />
          <Field
            label={isPo ? 'Expected Delivery' : isRfq ? 'Quote Due By' : 'Required Date'}
            value={dueDate ? formatDate(dueDate) : null}
          />
          {/* Stored as the master's id — resolve it, never show the raw id. */}
          {isPo && <Field label="Payment Terms" value={
            terms.find((t) => String(t.uid ?? t.id) === String(doc.paymentTerms))?.name
            || doc.paymentTerms} />}
          <Field label="Category" value={doc.category || doc.department || doc.itemType} />
          <Field label="Remarks" span value={doc.remarks || doc.justification} />
        </FieldGrid>
      </Section>

      <Section title="Document Items">
        <LineItemsTable
          rows={lines}
          empty="This document has no items."
          columns={[
            { key: 'itemType', header: 'Type', width: '130px', render: (l: any) =>
                lookup.itemTypeOf(l.itemCode) || <span className="text-fg-subtle">&mdash;</span> },
            { key: 'category', header: 'Category', width: '150px', render: (l: any) =>
                lookup.categoryOf(l.itemCode) || <span className="text-fg-subtle">&mdash;</span> },
            { key: 'itemName', header: 'Item', render: (l: any) =>
                <span className="font-medium text-fg">{l.itemName || l.itemCode}</span> },
            { key: 'qty', header: 'Qty', align: 'right' as const, width: '90px', render: (l: any) => fmtQty(l.qty) },
            { key: 'uom', header: 'UOM', align: 'center' as const, width: '70px' },
            ...(priced
              ? [
                  { key: 'rate', header: 'Unit Price', align: 'right' as const, width: '110px',
                    render: (l: any) => money(rateOf(l)) },
                  // Only a PO holds per-line tax; showing 0% on a PR line would
                  // contradict the estimated tax in its totals.
                  ...(isPo
                    ? [{ key: 'taxPct', header: 'Tax %', align: 'right' as const, width: '75px',
                         render: (l: any) => `${Number(l.taxPct) || 0}%` }]
                    : []),
                  { key: 'lineTotal', header: 'Line Total', align: 'right' as const, width: '130px',
                    render: (l: any) => <span className="font-medium text-fg">{money(totalOf(l))}</span> },
                ]
              : []),
          ]}
        />
        {priced && <TotalsPanel subtotal={subtotal} tax={tax} grandTotal={grandTotal} />}
      </Section>
    </>
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
      const q = search.toLowerCase()
      if (search && !(
        d.document_no?.toLowerCase().includes(q) ||
        (DOC_TYPE_LABEL[d.document_type] ?? d.document_type ?? '').toLowerCase().includes(q) ||
        (d.requester || '').toLowerCase().includes(q)
      )) return false
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
    { key: 'document_type', header: 'Type', width: '150px', render: r => DOC_TYPE_LABEL[r.document_type] ?? r.document_type },
    { key: 'requester', header: 'Requested By', render: r => r.requester || '-', width: '150px' },
    { key: 'assigned_at', header: 'Date', render: r => formatDate(r.assigned_at), width: '130px' },
    { key: 'amount', header: 'Amount', align: 'right' as const, render: r => r.amount ? formatCurrency(r.amount) : '-', width: '130px' },
    { key: 'level_name', header: 'Approval Level', width: '190px',
      render: r => r.level_name ? `${r.level_name} (${r.level_no} of ${r.total_levels})` : `Level ${r.level_no} of ${r.total_levels}` },
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
        searchHint="Document number, type or requester" dateLabel="Submitted"
      />

      <div className="flex-1 min-h-0 flex flex-col gap-4 mt-4">
        <DataTable searchable={false} rows={filteredData} rowKey={(r) => r.task_uid || String(Math.random())} columns={columns} loading={loading} />
      </div>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="Approval Task Details" size="4xl">
        {selectedTask && (
          <div className="flex flex-col gap-6">
            <Section title="Approval Task">
              <FieldGrid cols={3}>
                <Field label="Document" mono value={selectedTask.document_no || selectedTask.document_label} />
                <Field label="Type" value={DOC_TYPE_LABEL[selectedTask.document_type] ?? selectedTask.document_type} />
                <Field label="Requested By" value={selectedTask.requester} />
                <Field label="Submitted On" value={formatDate(selectedTask.assigned_at)} />
                <Field label="Amount" value={formatCurrency(selectedTask.amount || 0)} />
                <Field label="Approval Level" value={`${selectedTask.level_no} of ${selectedTask.total_levels}`} />
              </FieldGrid>
            </Section>

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
