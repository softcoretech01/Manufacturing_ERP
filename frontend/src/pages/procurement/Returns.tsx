import { useMemo, useState } from 'react'
import { Check, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { ApprovalTrail, DetailBlock, ProcStatusBadge } from '@/components/procurement/ProcShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate } from '@/lib/format'
import { newUid, useCollection } from '@/store/data'
import { grns, purchaseReturns as seedReturns } from '@/mock/procurement'
import type { PurchaseReturn } from '@/types/procurement'

const RETURN_TYPES: PurchaseReturn['returnType'][] = ['REJECTION', 'EXCESS', 'DAMAGE', 'WRONG_ITEM', 'QUALITY_FAILURE', 'EXPIRY']

export function ReturnsPage() {
  const toast = useToast()
  const seed = useMemo(() => seedReturns, [])
  const { rows, create, update, remove } = useCollection<PurchaseReturn>('proc:prt', seed)
  const rowEdit = useRowEdit<PurchaseReturn>({
    key: 'proc:prt',
    seed: seed,
    entity: 'Purchase return',
    titleOf: (r) => r.docNo,
  })

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<PurchaseReturn | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    grnNo: grns[0]?.docNo ?? '',
    supplierName: grns[0]?.supplierName ?? '',
    returnType: 'REJECTION',
    reasonCode: '',
    returnValue: '',
    replacementExpected: 'yes',
    plant: 'Chennai — Unit 1',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState<PurchaseReturn | null>(null)

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === 'PENDING_APPROVAL').length,
    open: rows.filter((r) => r.status === 'APPROVED').length,
    closed: rows.filter((r) => r.status === 'COMPLETED' || r.status === 'CANCELLED').length,
  }

  const filtered = rows.filter((r) => {
    if (tab === 'pending') return r.status === 'PENDING_APPROVAL'
    if (tab === 'open') return r.status === 'APPROVED'
    if (tab === 'closed') return r.status === 'COMPLETED' || r.status === 'CANCELLED'
    return true
  })

  const columns: Column<PurchaseReturn>[] = [
    { key: 'docNo', header: 'Return', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (r) => r.docDate, render: (r) => formatDate(r.docDate) },
    { key: 'grnNo', header: 'Against GRN', width: '11rem', render: (r) => <span className="font-mono text-2xs">{r.grnNo}</span> },
    { key: 'supplierName', header: 'Supplier', sortable: true },
    { key: 'returnType', header: 'Type', sortable: true, width: '9rem', render: (r) => <Badge tone="warning" size="sm" dot={false}>{r.returnType.replace('_', ' ').toLowerCase()}</Badge> },
    { key: 'reasonCode', header: 'Reason', sortable: true, render: (r) => <span className="font-mono text-2xs">{r.reasonCode}</span> },
    { key: 'returnValue', header: 'Return value', align: 'right', sortable: true, accessor: (r) => r.returnValue, render: (r) => formatCurrency(r.returnValue) },
    { key: 'debitNoteNo', header: 'Debit note', width: '11rem', render: (r) => (r.debitNoteNo ? <span className="font-mono text-2xs">{r.debitNoteNo}</span> : <span className="text-2xs text-fg-subtle">Not raised</span>) },
    { key: 'debitNoteValue', header: 'DN value', align: 'right', accessor: (r) => r.debitNoteValue, render: (r) => formatCurrency(r.debitNoteValue) },
    { key: 'taxReversal', header: 'ITC reversed', align: 'right', defaultHidden: true, accessor: (r) => r.taxReversal, render: (r) => formatCurrency(r.taxReversal) },
    { key: 'replacementExpected', header: 'Replacement', align: 'center', width: '7rem', accessor: (r) => (r.replacementExpected ? 'Yes' : 'No'), render: (r) => (r.replacementExpected ? <Badge tone="progress" size="sm" dot={false}>Expected</Badge> : <span className="text-2xs text-fg-subtle">Credit only</span>) },
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (r) => <ProcStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'purchase-returns', 'Purchase returns and debit notes', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function save() {
    const e: Record<string, string> = {}
    if (!form.reasonCode.trim()) e.reasonCode = 'A reason code is mandatory — returns are never raised without one.'
    const v = Number(form.returnValue)
    if (!form.returnValue || Number.isNaN(v) || v <= 0) e.returnValue = 'Enter a positive return value.'
    setErrors(e)
    if (Object.keys(e).length) return

    const grn = grns.find((g) => g.docNo === form.grnNo)
    const next = Math.max(...rows.map((r) => Number(r.docNo.slice(-5)) || 0)) + 1
    const docNo = `PRT/26-27/${String(next).padStart(5, '0')}`
    create({
      uid: newUid('prt'),
      docNo,
      docDate: new Date().toISOString().slice(0, 10),
      status: 'PENDING_APPROVAL',
      grnNo: form.grnNo,
      poNo: grn?.poNo ?? '',
      supplierUid: grn?.supplierUid ?? 'sup-new',
      supplierName: form.supplierName,
      returnType: form.returnType as PurchaseReturn['returnType'],
      reasonCode: form.reasonCode.trim().toUpperCase(),
      debitNoteValue: v * 1.18,
      taxReversal: v * 0.18,
      replacementExpected: form.replacementExpected === 'yes',
      returnValue: v,
      plant: form.plant,
      createdBy: 'K. Ravi',
      createdAt: new Date().toISOString(),
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: [{ level: 1, role: 'Purchase Manager', approver: 'P. Suresh', status: 'PENDING' }],
      lines: [],
    } as PurchaseReturn)
    toast.success('Return raised', `${docNo} created against ${form.grnNo}.`)
    setFormOpen(false)
  }

  function decide(r: PurchaseReturn, approve: boolean) {
    update(r.uid, {
      status: approve ? 'APPROVED' : 'REJECTED',
      debitNoteNo: approve && !r.debitNoteNo ? `DN/26-27/${String(40 + rows.length).padStart(5, '0')}` : r.debitNoteNo,
      approvals: r.approvals.map((a) => (a.status === 'PENDING' ? { ...a, status: approve ? 'APPROVED' : 'REJECTED', actedAt: new Date().toISOString() } : a)),
    })
    toast.success(approve ? 'Approved' : 'Rejected', approve ? `${r.docNo} approved and a debit note raised.` : `${r.docNo} returned to stores.`)
    setDetail(null)
  }

  return (
    <div>
      <PageHeader
        title="Purchase returns & debit notes"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'Returns' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setForm({ grnNo: grns[0]?.docNo ?? '', supplierName: grns[0]?.supplierName ?? '', returnType: 'REJECTION', reasonCode: '', returnValue: '', replacementExpected: 'yes', plant: 'Chennai — Unit 1' })
              setErrors({})
              setFormOpen(true)
            }}
          >
            New return
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'pending', label: 'Pending approval', count: counts.pending },
              { id: 'open', label: 'Awaiting dispatch', count: counts.open },
              { id: 'closed', label: 'Closed', count: counts.closed },
            ]}
          />
        }
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search return, GRN, supplier, reason…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No purchase returns"
        emptyDescription="Returns are raised from a receipt line that failed inspection or arrived in excess."
        rowActions={(r) => (
          <>
            {rowEdit.actions(r)}
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem label="Approve" icon={<Check />} disabled={r.status !== 'PENDING_APPROVAL'} onClick={() => decide(r, true)} />
            <MenuItem label="Reject" icon={<X />} danger disabled={r.status !== 'PENDING_APPROVAL'} onClick={() => decide(r, false)} />
            <MenuItem
              label="Mark dispatched"
              separatorBefore
              disabled={r.status !== 'APPROVED'}
              onClick={() => {
                update(r.uid, { status: 'COMPLETED' })
                toast.success('Dispatched', `${r.docNo} closed — material returned to the supplier with an e-way bill.`)
              }}
            />
            <MenuItem
              label="Cancel"
              danger
              disabled={r.status === 'CANCELLED' || r.status === 'COMPLETED'}
              onClick={() => {
                update(r.uid, { status: 'CANCELLED', remarks: 'Cancelled with a reason code.' })
                toast.success('Cancelled', `${r.docNo} cancelled.`)
              }}
            />
            <MenuItem label="Delete" icon={<Trash2 />} danger separatorBefore disabled={r.status === 'COMPLETED'} onClick={() => setConfirmDelete(r)} />
          </>
        )}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.supplierName} · against ${detail.grnNo}` : undefined}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              {detail.status === 'PENDING_APPROVAL' && (
                <>
                  <Button variant="danger" size="sm" onClick={() => decide(detail, false)}>Reject</Button>
                  <Button variant="success" size="sm" onClick={() => decide(detail, true)}>Approve</Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ProcStatusBadge status={detail.status} />
              <Badge tone="warning" size="sm" dot={false}>{detail.returnType.replace('_', ' ').toLowerCase()}</Badge>
              <span className="font-mono text-2xs text-fg-muted">{detail.reasonCode}</span>
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Against GRN', value: detail.grnNo, mono: true },
                { label: 'Against PO', value: detail.poNo, mono: true },
                { label: 'Return value', value: formatCurrency(detail.returnValue) },
                { label: 'Debit note', value: detail.debitNoteNo ?? 'Not yet raised', mono: true },
                { label: 'Debit note value', value: formatCurrency(detail.debitNoteValue) },
                { label: 'ITC reversal', value: formatCurrency(detail.taxReversal) },
                { label: 'Replacement expected', value: detail.replacementExpected ? 'Yes' : 'No — credit only' },
                { label: 'Replacement PO', value: detail.replacementPoNo ?? '—', mono: true },
                { label: 'Vehicle', value: detail.vehicleNo ?? '—', mono: true },
                { label: 'E-way bill', value: detail.ewayBillNo ?? '—', mono: true },
              ]}
            />

            <DetailBlock title={`Lines (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Amount</th>
                      <th>Batch</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                        </td>
                        <td className="text-right tabular">{l.qty.toLocaleString('en-IN')} {l.uom}</td>
                        <td className="text-right tabular">{l.rate.toFixed(2)}</td>
                        <td className="text-right tabular font-medium">{formatCurrency(l.amount)}</td>
                        <td className="font-mono text-2xs">{l.batchNo ?? '—'}</td>
                        <td className="text-2xs text-fg-muted">{l.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title="Approval trail">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>

            {detail.remarks && (
              <DetailBlock title="Remarks">
                <p className="text-xs text-fg-muted">{detail.remarks}</p>
              </DetailBlock>
            )}

            <p className="text-2xs leading-relaxed text-fg-subtle">
              The debit note reverses both the value and the input tax credit claimed on the original receipt. Where a
              replacement is expected the original purchase order stays open for the returned quantity.
            </p>
          </div>
        )}
      </Drawer>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New purchase return"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Raise return</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Against GRN"
            containerClassName="sm:col-span-2"
            value={form.grnNo}
            onChange={(e) => {
              const g = grns.find((x) => x.docNo === e.target.value)
              setForm({ ...form, grnNo: e.target.value, supplierName: g?.supplierName ?? form.supplierName })
            }}
            options={grns.filter((g) => g.status !== 'CANCELLED').map((g) => ({ value: g.docNo, label: `${g.docNo} — ${g.supplierName}` }))}
          />
          <Input label="Supplier" readOnly value={form.supplierName} className="bg-surface-2" />
          <Select label="Return type" value={form.returnType} onChange={(e) => setForm({ ...form, returnType: e.target.value })} options={RETURN_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ').toLowerCase() }))} />
          <Input label="Reason code" required placeholder="QC-GLOSS-FAIL" value={form.reasonCode} error={errors.reasonCode} onChange={(e) => setForm({ ...form, reasonCode: e.target.value })} />
          <Input label="Return value (₹)" type="number" required value={form.returnValue} error={errors.returnValue} hint="GST at 18% is added to the debit note automatically." onChange={(e) => setForm({ ...form, returnValue: e.target.value })} />
          <Select label="Replacement expected" value={form.replacementExpected} onChange={(e) => setForm({ ...form, replacementExpected: e.target.value })} options={[{ value: 'yes', label: 'Yes — supplier resupplies' }, { value: 'no', label: 'No — credit only' }]} />
          <Select label="Plant" value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })} options={[{ value: 'Chennai — Unit 1', label: 'Chennai — Unit 1' }, { value: 'Hosur — Unit 2', label: 'Hosur — Unit 2' }]} />
          <Textarea label="Notes to supplier" containerClassName="sm:col-span-2" rows={2} placeholder="What failed, against which specification, and what you expect them to do about it." />
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete return"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) {
                  remove(confirmDelete.uid)
                  toast.success('Deleted', `${confirmDelete.docNo} soft-deleted.`)
                }
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {confirmDelete?.docNo} will be marked deleted. A completed return that has already generated a debit note
          cannot be deleted, only cancelled.
        </p>
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
