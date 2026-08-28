import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useLiveCrud } from '@/components/crud/CrudKit'
import { salesReturnApi } from '@/api/salesReturnApi'
import { useEffect } from 'react'
import {
  DispatchStatusBadge,
  ItemCell,
  PartyCell,
  RETURN_TYPE_LABEL,
  useCanSeeFreight,
} from '@/components/dispatch/DispatchShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'

import type { ReturnDisposition, ReturnType, SalesReturn } from '@/types/dispatch'

/** Request → approve → pick up → receive → inspect → decide. */
const FLOW: SalesReturn['status'][] = ['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'RECEIVED', 'INSPECTED', 'CLOSED']

const DISPOSITIONS: { value: ReturnDisposition; label: string; effect: string }[] = [
  { value: 'RESTOCK', label: 'Back into stock', effect: 'Goes back into the finished-goods store as saleable. Only for goods that are genuinely as-new.' },
  { value: 'REWORK', label: 'Rework', effect: 'Raises a rework order on the shop floor. The bottle comes back into WIP and is re-inspected before it can be sold.' },
  { value: 'SCRAP', label: 'Scrap', effect: 'Written off at recovery value. The cost lands against the return reason, which is how repeat causes get noticed.' },
]

const TABS = [
  { id: 'OPEN', label: 'Open' },
  { id: 'INSPECT', label: 'Awaiting a decision' },
  { id: 'CLOSED', label: 'Closed' },
  { id: 'ALL', label: 'All' },
]

/**
 * Returns and reverse logistics — five reasons goods come back, and one chain
 * they all follow. The disposition at the end is the point of the whole process:
 * restock, rework or scrap, each with a different cost and a different owner.
 */
export function SalesReturnsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeFreight()
  const [returns, setReturns] = useState<SalesReturn[]>([])

  const loadData = async () => {
    try {
      const data = await salesReturnApi.getAll()
      setReturns(data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const crud = useLiveCrud<SalesReturn>({
    key: 'dispatch:sales-return',
    entity: 'Return',
    titleOf: (r) => r.docNo,
    fields: [
      { name: 'docNo', label: 'Return number', required: true, readOnly: true },
      {
        name: 'returnType',
        label: 'Return type',
        type: 'select',
        required: true,
        options: Object.entries(RETURN_TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { name: 'customer', label: 'Customer', required: true },
      { name: 'shipmentNo', label: 'Original shipment' },
      { name: 'invoiceNo', label: 'Original invoice' },
      { name: 'itemName', label: 'Product', required: true, span: 2 },
      { name: 'batchNo', label: 'Batch' },
      { name: 'quantity', label: 'Quantity returned', type: 'number', required: true },
      { name: 'receivedQty', label: 'Quantity received back', type: 'number' },
      { name: 'uom', label: 'Unit', required: true },
      { name: 'value', label: 'Value', type: 'number' },
      { name: 'requestedOn', label: 'Requested on', type: 'date', required: true },
      { name: 'reason', label: 'Reason', type: 'textarea', span: 2, required: true },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ],
    fromForm: (v, existing) => ({
      ...(existing ?? {
        docNo: v.docNo,
        customerCode: 'CUS-NEW',
        itemCode: 'FG-NEW',
        approvedBy: null,
        pickupOn: null,
        receivedOn: null,
        inspectedBy: null,
        disposition: 'PENDING' as ReturnDisposition,
        creditNoteNo: null,
        status: 'REQUESTED' as const,
      }),
      returnType: v.returnType as ReturnType,
      customer: v.customer,
      shipmentNo: v.shipmentNo || null,
      invoiceNo: v.invoiceNo || null,
      itemName: v.itemName,
      batchNo: v.batchNo || null,
      quantity: Number(v.quantity) || 0,
      receivedQty: Number(v.receivedQty) || 0,
      uom: v.uom,
      value: Number(v.value) || 0,
      requestedOn: v.requestedOn,
      reason: v.reason,
      remarks: v.remarks || undefined,
    }),
    blockDelete: (r) =>
      r.receivedQty > 0
        ? `${r.docNo} has ${formatQty(r.receivedQty)} ${r.uom} physically back in the plant. Complete the inspection and disposition instead — deleting it would leave stock nobody can account for.`
        : r.creditNoteNo
          ? `${r.docNo} has credit note ${r.creditNoteNo} against it. A return with a credit note is a financial record.`
          : undefined,
  }, returns, salesReturnApi, loadData)

  const _returns = crud.rows

  const updateRow = async (id: number, patch: Partial<SalesReturn>) => {
    try {
      const row = returns.find((x: any) => x.id === id);
      if (!row) return;
      await salesReturnApi.update(id, { ...row, ...patch });
      loadData();
    } catch (e) {
      toast.error('Update failed', e instanceof Error ? e.message : 'Unknown error');
      throw e;
    }
  }

  const [tab, setTab] = useState('OPEN')
  const [receiving, setReceiving] = useState<SalesReturn | null>(null)
  const [receivedQty, setReceivedQty] = useState('')
  const [deciding, setDeciding] = useState<SalesReturn | null>(null)
  const [decision, setDecision] = useState({ disposition: 'RESTOCK' as ReturnDisposition, note: '' })

  const visible = returns.filter((r) => {
    if (tab === 'OPEN') return r.status !== 'CLOSED' && r.status !== 'REJECTED'
    if (tab === 'INSPECT') return r.status === 'RECEIVED' || (r.status === 'INSPECTED' && r.disposition === 'PENDING')
    if (tab === 'CLOSED') return r.status === 'CLOSED' || r.status === 'REJECTED'
    return true
  })

  const awaitingApproval = returns.filter((r) => r.status === 'REQUESTED')
  const awaitingDecision = returns.filter((r) => r.status === 'RECEIVED' || (r.status === 'INSPECTED' && r.disposition === 'PENDING'))
  const openValue = returns.filter((r) => r.status !== 'CLOSED' && r.status !== 'REJECTED').reduce((s, r) => s + r.value, 0)

  /** Which types recur — the answer usually points at one process, not many. */
  const byType = Object.keys(RETURN_TYPE_LABEL)
    .map((t) => ({
      type: RETURN_TYPE_LABEL[t],
      count: returns.filter((r) => r.returnType === t).length,
      qty: returns.filter((r) => r.returnType === t).reduce((s, r) => s + r.quantity, 0),
      value: returns.filter((r) => r.returnType === t).reduce((s, r) => s + r.value, 0),
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.value - a.value)

  const columns: Column<SalesReturn>[] = [
    { key: 'docNo', header: 'Return', sortable: true, width: '11.5rem', render: (r) => (
      <div className="min-w-0">
        <p className="font-mono text-xs font-medium text-brand-600">{r.docNo}</p>
        <p className="truncate text-2xs text-fg-subtle">{formatDate(r.requestedOn)}</p>
      </div>
    ) },
    { key: 'returnType', header: 'Type', sortable: true, width: '10.5rem', render: (r) => (
      <Badge
        tone={r.returnType === 'TRANSIT_DAMAGE' ? 'danger' : r.returnType === 'WRONG_SHIPMENT' ? 'warning' : r.returnType === 'WARRANTY' ? 'progress' : 'neutral'}
        size="sm"
        dot={false}
      >
        {RETURN_TYPE_LABEL[r.returnType]}
      </Badge>
    ) },
    { key: 'customer', header: 'Customer', sortable: true, render: (r) => (
      <PartyCell name={r.customer} place={r.shipmentNo ?? r.invoiceNo ?? 'no reference'} />
    ) },
    { key: 'itemName', header: 'Product', sortable: true, render: (r) => (
      <ItemCell name={r.itemName} code={r.itemCode} batch={r.batchNo} />
    ) },
    { key: 'quantity', header: 'Claimed', align: 'right', sortable: true, width: '7.5rem', render: (r) => (
      <span className="tabular text-xs">{formatQty(r.quantity)}</span>
    ) },
    { key: 'receivedQty', header: 'Back with us', align: 'right', sortable: true, width: '9rem', render: (r) => (
      r.receivedQty > 0 ? (
        <span className={cn('tabular text-xs font-medium', r.receivedQty < r.quantity ? 'text-warning' : 'text-fg')}>
          {formatQty(r.receivedQty)}
        </span>
      ) : (
        <span className="text-2xs text-fg-subtle">not yet</span>
      )
    ) },
    ...(canSeeValue
      ? [{ key: 'value', header: 'Value', align: 'right' as const, sortable: true, width: '9rem', render: (r: SalesReturn) => formatCurrency(r.value) }]
      : []),
    { key: 'reason', header: 'Why', render: (r) => <span className="text-2xs text-fg-muted">{r.reason}</span> },
    { key: 'pickupOn', header: 'Pickup', sortable: true, width: '8.5rem', accessor: (r) => r.pickupOn ?? '', render: (r) => (
      r.pickupOn ? <span className="text-2xs">{formatDate(r.pickupOn)}</span> : <span className="text-2xs text-fg-subtle">not booked</span>
    ) },
    { key: 'disposition', header: 'Decision', sortable: true, width: '9rem', render: (r) => (
      r.disposition === 'PENDING'
        ? <span className="text-2xs text-warning">not decided</span>
        : <DispatchStatusBadge status={r.disposition} size="sm" />
    ) },
    { key: 'creditNoteNo', header: 'Credit note', sortable: true, width: '10rem', render: (r) => (
      r.creditNoteNo ? <span className="font-mono text-2xs">{r.creditNoteNo}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'inspectedBy', header: 'Inspected by', sortable: true, defaultHidden: true },
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (r) => <DispatchStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'sales-returns', 'Sales return register', columnsFromTable(columns), visible)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Returns"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Packing & dispatch', to: '/dispatch' }, { label: 'Returns' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => crud.openCreate({
              docNo: `SRN/2607/${String(81 + returns.length).padStart(4, '0')}`,
              returnType: 'CUSTOMER_RETURN',
              uom: 'NOS',
              requestedOn: new Date().toISOString().slice(0, 10),
            })}
          >
            New return request
          </Button>
        }
        tabs={<Tabs variant="pill" active={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === 'INSPECT' ? awaitingDecision.length : undefined }))} />}
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className={cn('font-medium', awaitingApproval.length ? 'text-warning' : 'text-fg')}>{awaitingApproval.length}</span>{' '}
        awaiting approval ·{' '}
        <span className={cn('font-medium', awaitingDecision.length ? 'text-danger' : 'text-success')}>{awaitingDecision.length}</span>{' '}
        back with us but not yet dispositioned
        {canSeeValue && <> · <span className="font-medium text-fg tabular">{formatCurrency(openValue)}</span> of open return value</>}
        .
      </p>

      {awaitingDecision.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Sitting in the returns area"
            description="Stock that is neither saleable nor written off — the decision is what unblocks it"
          />
          <CardBody className="space-y-2">
            {awaitingDecision.map((r) => (
              <div key={r.uid} className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning/30 bg-warning/5 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">
                    {r.docNo} — {formatQty(r.receivedQty || r.quantity)} × {r.itemName}
                  </p>
                  <p className="text-2xs text-fg-muted">
                    {RETURN_TYPE_LABEL[r.returnType]} from {r.customer} · {r.reason}
                    {canSeeValue && ` · ${formatCurrency(r.value)}`}
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => { setDeciding(r); setDecision({ disposition: 'RESTOCK', note: '' }) }}>
                  Decide what happens
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => String((r as any).id || r.uid)}
        searchPlaceholder="Search return, customer, product, shipment or reason…"
        onExport={doExport}
        emptyTitle="No returns"
        emptyDescription="Returns are raised from a proof of delivery shortage, a customer request or a warranty claim."
        rowClassName={(r) => cn(
          r.status === 'REQUESTED' && 'bg-warning/[0.04]',
          (r.status === 'RECEIVED' || (r.status === 'INSPECTED' && r.disposition === 'PENDING')) && 'bg-danger/[0.03]',
        )}
        rowActions={(r) => (
          <>
            <MenuItem label="Edit the return" onClick={() => crud.openEdit(r)} />
            <MenuItem label="Delete the return" danger onClick={() => crud.askDelete(r)} />
            <MenuItem
              separatorBefore
              label="Approve the return"
              disabled={r.status !== 'REQUESTED'}
              onClick={() => {
                updateRow((r as any).id, { status: 'APPROVED', approvedBy: 'S. Ganapathy' })
                toast.success('Return approved', `${r.docNo} approved. A pickup can now be booked — the goods stay the customer's responsibility until we collect.`)
              }}
            />
            <MenuItem
              label="Book the pickup"
              disabled={r.status !== 'APPROVED'}
              onClick={() => {
                const when = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
                updateRow((r as any).id, { status: 'PICKUP_SCHEDULED', pickupOn: when })
                toast.success('Pickup booked', `${r.docNo} pickup booked for ${formatDate(when)}. The reverse leg goes on the next vehicle heading that way.`)
              }}
            />
            <MenuItem
              label="Receive it back"
              disabled={r.status !== 'PICKUP_SCHEDULED' && r.status !== 'APPROVED'}
              onClick={() => { setReceiving(r); setReceivedQty(String(r.quantity)) }}
            />
            <MenuItem
              label="Decide the disposition"
              disabled={r.receivedQty === 0 || r.disposition !== 'PENDING'}
              onClick={() => { setDeciding(r); setDecision({ disposition: 'RESTOCK', note: '' }) }}
            />
            <MenuItem
              label="Raise a credit note"
              disabled={!!r.creditNoteNo || r.receivedQty === 0}
              onClick={() => {
                const cn2 = `CRN/2627/${String(45 + returns.filter((x) => x.creditNoteNo).length).padStart(4, '0')}`
                updateRow((r as any).id, { creditNoteNo: cn2, status: 'CLOSED' })
                toast.success(
                  'Credit note raised',
                  `${cn2} for ${formatCurrency(r.value)} raised against ${r.customer} and ${r.docNo} closed. Finance sees it on the customer account immediately.`,
                )
              }}
            />
            <MenuItem
              separatorBefore
              label="Reject the request"
              danger
              disabled={r.status !== 'REQUESTED'}
              onClick={() => {
                updateRow((r as any).id, { status: 'REJECTED' })
                toast.success('Return rejected', `${r.docNo} rejected. The customer is notified with the reason, and no pickup is booked.`)
              }}
            />
          </>
        )}
      />

      {/* Receive back ------------------------------------------------------- */}
      <Modal
        open={!!receiving}
        onClose={() => setReceiving(null)}
        title={receiving ? `Receive ${receiving.docNo}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setReceiving(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!receiving) return
                const qty = Number(receivedQty)
                if (!qty || qty <= 0) {
                  toast.error('Enter a quantity', 'How many actually came back?')
                  return
                }
                if (qty > receiving.quantity) {
                  toast.error(
                    'More than claimed',
                    `The customer claimed ${formatQty(receiving.quantity)}. Receiving ${formatQty(qty)} means the claim was understated — amend the return first.`,
                  )
                  return
                }
                updateRow((receiving as any).id, {
                  receivedQty: qty,
                  receivedOn: new Date().toISOString().slice(0, 10),
                  status: 'RECEIVED',
                })
                toast.success(
                  'Goods received back',
                  qty < receiving.quantity
                    ? `${formatQty(qty)} of ${formatQty(receiving.quantity)} received into the returns area — short by ${formatQty(receiving.quantity - qty)}. Only what came back is creditable.`
                    : `${formatQty(qty)} received into the returns area. It sits outside saleable stock until the disposition is decided.`,
                )
                setReceiving(null)
              }}
            >
              Receive
            </Button>
          </>
        }
      >
        {receiving && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">{receiving.itemName}</p>
              <p className="mt-1 text-fg-muted">
                {RETURN_TYPE_LABEL[receiving.returnType]} from {receiving.customer} · claimed{' '}
                <span className="font-medium tabular text-fg">{formatQty(receiving.quantity)} {receiving.uom}</span>
              </p>
            </div>
            <Input label="Quantity received back" type="number" value={receivedQty} onChange={(e) => setReceivedQty(e.target.value)} />
            <p className="text-2xs text-fg-muted">
              Received goods land in the returns area, not in saleable stock. They only become stock again if the inspection says
              restock.
            </p>
          </div>
        )}
      </Modal>

      {/* Disposition -------------------------------------------------------- */}
      <Modal
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title={deciding ? `Disposition — ${deciding.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeciding(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!deciding) return
                if (!decision.note.trim()) {
                  toast.error('Inspection note required', 'What did the inspection actually find? A disposition without a finding cannot be defended or learned from.')
                  return
                }
                updateRow((deciding as any).id, {
                  disposition: decision.disposition,
                  status: 'INSPECTED',
                  inspectedBy: 'S. Meena',
                  remarks: decision.note.trim(),
                })
                toast.success(
                  'Disposition recorded',
                  decision.disposition === 'RESTOCK'
                    ? `${formatQty(deciding.receivedQty)} back into the finished-goods store as saleable stock.`
                    : decision.disposition === 'REWORK'
                      ? `Rework order raised for ${formatQty(deciding.receivedQty)} bottles. They re-enter WIP and are re-inspected before they can be sold.`
                      : `${formatQty(deciding.receivedQty)} written off at recovery value. The cost is charged against ${RETURN_TYPE_LABEL[deciding.returnType].toLowerCase()}.`,
                )
                setDeciding(null)
              }}
            >
              Record decision
            </Button>
          </>
        }
      >
        {deciding && (
          <div className="space-y-3.5">
            <div className="rounded border border-border bg-surface-2 p-3 text-xs">
              <p className="font-medium text-fg">
                {formatQty(deciding.receivedQty || deciding.quantity)} × {deciding.itemName}
              </p>
              <p className="mt-1 text-fg-muted">
                {RETURN_TYPE_LABEL[deciding.returnType]} · batch{' '}
                <span className="font-mono">{deciding.batchNo ?? 'not batch-controlled'}</span> · {deciding.reason}
              </p>
            </div>
            <Select
              label="What happens to these"
              value={decision.disposition}
              onChange={(e) => setDecision({ ...decision, disposition: e.target.value as ReturnDisposition })}
              hint={DISPOSITIONS.find((d) => d.value === decision.disposition)?.effect}
              options={DISPOSITIONS.map((d) => ({ value: d.value, label: d.label }))}
            />
            <Textarea
              label="What the inspection found (required)"
              rows={3}
              value={decision.note}
              onChange={(e) => setDecision({ ...decision, note: e.target.value })}
              placeholder="Vacuum failure traced to the sealing operation on 12 June. Lids re-seated and re-tested; bottles are saleable…"
            />
          </div>
        )}
      </Modal>

      {crud.dialogs}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Why goods come back" description="The tall line is the process worth fixing, not the customer worth blaming" />
          <CardBody className="space-y-2">
            {byType.map((t) => (
              <div key={t.type} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2 text-xs">
                <span className="text-fg">{t.type}</span>
                <span className="text-2xs tabular text-fg-muted">
                  {t.count} return{t.count === 1 ? '' : 's'} · {formatQty(t.qty)} bottles
                  {canSeeValue && ` · ${formatCurrency(t.value)}`}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Three dispositions, three different costs" />
          <CardBody className="space-y-2.5">
            {DISPOSITIONS.map((d) => (
              <div key={d.value} className="rounded border border-border p-3">
                <p className="text-xs font-medium text-fg">{d.label}</p>
                <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{d.effect}</p>
              </div>
            ))}
            <p className="text-2xs text-fg-muted">
              A transit damage return points at the transporter and the packing;{' '}
              <button type="button" onClick={() => navigate('/dispatch/transporters')} className="font-medium text-brand-600 hover:underline">
                transporter performance
              </button>{' '}
              is where that argument gets settled with numbers.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
