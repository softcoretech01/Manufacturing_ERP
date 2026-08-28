import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { ApprovalTrail, DetailBlock, InvStatusBadge, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { useCurrentUser } from '@/store/auth'
import { requisitions as seedRequisitions, stockPositions, warehouseSummaries } from '@/mock/inventory'
import type { MaterialRequisition } from '@/types/inventory'

/** Material requisition — the shop floor asking the store for material. */
export function RequisitionsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedRequisitions, [])
  const { rows: requisitions, create, update } = useCollection<MaterialRequisition>('inv:requisition', seed)
  const rowEdit = useRowEdit<MaterialRequisition>({
    key: 'inv:requisition',
    seed: seed,
    entity: 'Requisition',
    titleOf: (r) => r.docNo,
  })

  const [detail, setDetail] = useState<MaterialRequisition | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    department: 'Press Shop',
    costCentre: 'CC-PRD-01',
    productionOrderNo: 'PRD/2607/0121',
    fromWarehouse: 'Raw Material Store',
    requiredOn: '',
    shift: 'A',
    priority: 'NORMAL' as MaterialRequisition['priority'],
    itemCode: 'RM-SS304-050',
    quantity: '',
    remarks: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const pending = requisitions.filter((r) => r.status === 'PENDING_APPROVAL')
  const blocked = requisitions.filter((r) => r.lines.some((l) => l.shortage))

  const item = stockPositions.find((p) => p.itemCode === form.itemCode)
  const qty = Number(form.quantity || 0)
  const free = item ? item.available - item.reserved : 0
  const short = qty > free

  const columns: Column<MaterialRequisition>[] = [
    { key: 'docNo', header: 'Requisition', sortable: true, width: '12rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'docDate', header: 'Raised', sortable: true, width: '7rem', accessor: (r) => r.docDate, render: (r) => formatDate(r.docDate) },
    { key: 'department', header: 'Department', sortable: true },
    { key: 'productionOrderNo', header: 'For order', width: '11rem', render: (r) => <span className="font-mono text-2xs">{r.productionOrderNo ?? '—'}</span> },
    { key: 'requestedBy', header: 'Asked by', sortable: true },
    { key: 'requiredOn', header: 'Needed on', sortable: true, width: '8rem', accessor: (r) => r.requiredOn, render: (r) => formatDate(r.requiredOn) },
    { key: 'priority', header: 'Priority', width: '6.5rem', sortable: true, render: (r) => (
      <Badge size="sm" dot={false} tone={r.priority === 'URGENT' ? 'danger' : r.priority === 'HIGH' ? 'warning' : 'neutral'}>
        {r.priority.charAt(0) + r.priority.slice(1).toLowerCase()}
      </Badge>
    ) },
    { key: 'lines', header: 'Lines', align: 'right', width: '5rem', accessor: (r) => r.lines.length, render: (r) => r.lines.length },
    { key: 'availability', header: 'Availability', width: '10rem', accessor: (r) => (r.lines.some((l) => l.shortage) ? 'Shortage' : 'Covered'), render: (r) => (
      r.lines.some((l) => l.shortage) ? <Badge tone="danger" size="sm">Shortage</Badge> : <span className="text-2xs text-success">Stock available</span>
    ) },
    ...(canSeeValue ? [{ key: 'estimatedValue', header: 'Est. value', align: 'right' as const, sortable: true, render: (r: MaterialRequisition) => formatCurrency(r.estimatedValue) }] : []),
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (r) => <InvStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'material-requisitions', 'Material requisition register', columnsFromTable(columns), requisitions)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function approve(r: MaterialRequisition) {
    update(r.uid, {
      status: 'APPROVED',
      approvals: r.approvals.map((a) => (a.status === 'PENDING' ? { ...a, status: 'APPROVED' as const, actedAt: new Date().toISOString(), approver: user?.fullName ?? a.approver } : a)),
    })
    toast.success('Approved', `${r.docNo} approved — the store can now pick and issue against it.`)
  }

  function save() {
    const e: Record<string, string> = {}
    if (!form.quantity || qty <= 0) e.quantity = 'Enter a quantity greater than zero.'
    if (!form.requiredOn) e.requiredOn = 'When is it needed?'
    setErrors(e)
    if (Object.keys(e).length || !item) return

    const next = Math.max(...requisitions.map((r) => Number(r.docNo.slice(-6)) || 0)) + 1
    const docNo = `P1/MRQ/26-27/${String(next).padStart(6, '0')}`
    create({
      uid: newUid('mrq'),
      docNo,
      docDate: new Date().toISOString().slice(0, 10),
      status: 'PENDING_APPROVAL',
      plant: 'Chennai — Unit 1',
      department: form.department,
      costCentre: form.costCentre,
      productionOrderNo: form.productionOrderNo || null,
      requiredOn: form.requiredOn,
      shift: form.shift,
      priority: form.priority,
      requestedBy: user?.fullName ?? 'Current user',
      fromWarehouse: form.fromWarehouse,
      estimatedValue: qty * item.rate,
      remarks: form.remarks || undefined,
      createdBy: user?.fullName ?? 'Current user',
      createdAt: new Date().toISOString(),
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: [{ level: 1, role: 'Shift Supervisor', approver: 'N. Selvam', status: 'PENDING' }],
      lines: [
        {
          uid: newUid('mrql'),
          itemCode: item.itemCode,
          itemName: item.itemName,
          uom: item.uom,
          bomStandardQty: null,
          quantity: qty,
          issuedQty: 0,
          available: free,
          shortage: short,
        },
      ],
    } as MaterialRequisition)
    toast.success(
      'Requisition raised',
      short
        ? `${docNo} raised, but only ${formatQty(free)} ${item.uom} is free — it will show as a shortage until stock arrives.`
        : `${docNo} raised and sent to the shift supervisor for approval.`,
    )
    setFormOpen(false)
    setForm({ ...form, quantity: '', remarks: '' })
  }

  return (
    <div>
      <PageHeader
        title="Material requisitions"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Requisitions' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setErrors({}); setFormOpen(true) }}>
            New requisition
          </Button>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        A requisition is the shop floor asking the store for material. It is approved first, then picked and issued — so nothing
        leaves the store on a verbal request.{' '}
        <span className={cn('font-medium', pending.length ? 'text-warning' : 'text-success')}>{pending.length}</span> awaiting
        approval · <span className={cn('font-medium', blocked.length ? 'text-danger' : 'text-success')}>{blocked.length}</span>{' '}
        blocked by shortage.
      </p>

      <DataTable
        rows={requisitions}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search requisition, department, order or person…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No requisitions"
        emptyDescription="Raise one to ask the store for material against a production order or a cost centre."
        rowClassName={(r) => cn(r.lines.some((l) => l.shortage) && 'bg-danger/[0.03]')}
        rowActions={(r) => (
          <>
            {rowEdit.actions(r)}
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem label="Approve" icon={<Check />} disabled={r.status !== 'PENDING_APPROVAL'} onClick={() => approve(r)} />
            <MenuItem
              label="Reject"
              icon={<X />}
              danger
              disabled={r.status !== 'PENDING_APPROVAL'}
              onClick={() => {
                update(r.uid, { status: 'REJECTED', approvals: r.approvals.map((a) => (a.status === 'PENDING' ? { ...a, status: 'REJECTED' as const, actedAt: new Date().toISOString() } : a)) })
                toast.success('Rejected', `${r.docNo} sent back to ${r.requestedBy}.`)
              }}
            />
            <MenuItem
              label="Issue against this requisition"
              separatorBefore
              disabled={r.status !== 'APPROVED'}
              onClick={() => navigate('/inventory/issues')}
            />
          </>
        )}
      />

      {/* Detail --------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.department} · needed ${formatDate(detail.requiredOn)}` : undefined}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              {detail.status === 'PENDING_APPROVAL' && (
                <Button variant="success" size="sm" onClick={() => { approve(detail); setDetail(null) }}>Approve</Button>
              )}
              {detail.status === 'APPROVED' && (
                <Button variant="primary" size="sm" onClick={() => navigate('/inventory/issues')}>Go to issue</Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <InvStatusBadge status={detail.status} />
              <Badge size="sm" dot={false} tone={detail.priority === 'URGENT' ? 'danger' : 'neutral'}>
                {detail.priority.charAt(0) + detail.priority.slice(1).toLowerCase()}
              </Badge>
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Production order', value: detail.productionOrderNo ?? '—', mono: true },
                { label: 'Cost centre', value: detail.costCentre },
                { label: 'Asked by', value: detail.requestedBy },
                { label: 'Shift', value: detail.shift },
                { label: 'From warehouse', value: detail.fromWarehouse },
                { label: 'Needed on', value: formatDate(detail.requiredOn) },
                ...(canSeeValue ? [{ label: 'Estimated value', value: formatCurrency(detail.estimatedValue) }] : []),
              ]}
            />

            <DetailBlock title={`Lines (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">BOM standard</th>
                      <th className="text-right">Asked for</th>
                      <th className="text-right">Issued</th>
                      <th className="text-right">Free stock</th>
                      <th>Availability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.uid} className={l.shortage ? 'bg-danger/[0.04]' : undefined}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                        </td>
                        <td className="text-right tabular text-fg-muted">{l.bomStandardQty ? formatQty(l.bomStandardQty) : '—'}</td>
                        <td className="text-right tabular font-medium">{formatQty(l.quantity)} {l.uom}</td>
                        <td className="text-right tabular">{formatQty(l.issuedQty)}</td>
                        <td className="text-right tabular">{formatQty(l.available)}</td>
                        <td>
                          {l.shortage
                            ? <Badge tone="danger" size="sm">Short by {formatQty(l.quantity - l.available)}</Badge>
                            : <span className="text-2xs text-success">Covered</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            {detail.remarks && (
              <DetailBlock title="Remarks">
                <p className="text-xs text-fg-muted">{detail.remarks}</p>
              </DetailBlock>
            )}

            <DetailBlock title="Approval">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>
          </div>
        )}
      </Drawer>

      {/* New requisition ------------------------------------------------------ */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New material requisition"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Raise requisition</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            options={['Press Shop', 'Welding & Vacuum', 'Coating & Printing', 'Assembly', 'Packing', 'Maintenance'].map((v) => ({ value: v, label: v }))}
          />
          <Input label="Production order" value={form.productionOrderNo} onChange={(e) => setForm({ ...form, productionOrderNo: e.target.value })} hint="Leave blank for a cost-centre request" />
          <Select
            label="From warehouse"
            value={form.fromWarehouse}
            onChange={(e) => setForm({ ...form, fromWarehouse: e.target.value })}
            options={warehouseSummaries.filter((w) => w.includeInAtp).map((w) => ({ value: w.name, label: `${w.code} — ${w.name}` }))}
          />
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as MaterialRequisition['priority'] })}
            options={[{ value: 'LOW', label: 'Low' }, { value: 'NORMAL', label: 'Normal' }, { value: 'HIGH', label: 'High' }, { value: 'URGENT', label: 'Urgent' }]}
          />
          <Select
            label="Item"
            containerClassName="sm:col-span-2"
            value={form.itemCode}
            onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
            options={stockPositions.map((p) => ({ value: p.itemCode, label: `${p.itemCode} — ${p.itemName}` }))}
          />
          <Input
            label={`Quantity${item ? ` (${item.uom})` : ''}`}
            type="number"
            required
            value={form.quantity}
            error={errors.quantity}
            hint={item ? `Free right now: ${formatQty(free)} ${item.uom}` : undefined}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <Input label="Needed on" type="date" required value={form.requiredOn} error={errors.requiredOn} onChange={(e) => setForm({ ...form, requiredOn: e.target.value })} />
          <Textarea label="Remarks" containerClassName="sm:col-span-2" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>

        {short && item && (
          <p className="mt-3 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            Only {formatQty(free)} {item.uom} is free. The requisition can still be raised — it will sit on the shortage list and
            the planner will see it — but the store cannot issue more than exists.
          </p>
        )}
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
