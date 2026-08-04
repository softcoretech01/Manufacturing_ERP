import { useMemo, useState } from 'react'
import { Truck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { InvStatusBadge, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { transfers as seedTransfers } from '@/mock/inventory'
import type { StockTransfer } from '@/types/inventory'

/**
 * Goods in transit — stock that has left one plant but not yet arrived at the
 * other. It belongs to the sending plant until receipt, so it is valued there
 * and it ages: nothing is allowed to sit in transit silently.
 */
export function GoodsInTransitPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedTransfers, [])
  const { rows: transfers, update } = useCollection<StockTransfer>('inv:transfer', seed)
  const rowEdit = useRowEdit<StockTransfer>({
    key: 'inv:transfer',
    seed: seed,
    entity: 'Transfer',
    titleOf: (r) => r.docNo,
  })

  const [receiveDoc, setReceiveDoc] = useState<StockTransfer | null>(null)
  const [receiveQty, setReceiveQty] = useState('')
  const [reason, setReason] = useState('')

  const inTransit = transfers.filter((t) => t.status === 'IN_TRANSIT' || t.status === 'PARTIALLY_RECEIVED')
  const value = inTransit.reduce((s, t) => s + t.totalValue, 0)
  const oldest = Math.max(0, ...inTransit.map((t) => t.transitDays))
  const overdue = inTransit.filter((t) => t.expectedOn && new Date(t.expectedOn).getTime() < Date.now())

  const columns: Column<StockTransfer>[] = [
    { key: 'docNo', header: 'Transfer', sortable: true, width: '11rem', render: (t) => <span className="font-mono text-xs font-medium text-brand-600">{t.docNo}</span> },
    { key: 'route', header: 'Route', accessor: (t) => `${t.fromWarehouse} → ${t.toWarehouse}`, render: (t) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{t.fromWarehouse}</p>
        <p className="truncate text-2xs text-fg-subtle">→ {t.toWarehouse} ({t.toPlant})</p>
      </div>
    ) },
    { key: 'item', header: 'Item', accessor: (t) => t.lines[0]?.itemName ?? '', render: (t) => (
      t.lines[0] ? <ItemCell code={t.lines[0].itemCode} name={t.lines[0].itemName} sub={t.lines[0].batchNo ?? undefined} /> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'totalQty', header: 'Dispatched', align: 'right', sortable: true, render: (t) => <QtyCell qty={t.totalQty} /> },
    { key: 'received', header: 'Received', align: 'right', accessor: (t) => t.lines.reduce((s, l) => s + l.receivedQty, 0), render: (t) => {
      const r = t.lines.reduce((s, l) => s + l.receivedQty, 0)
      return r ? <QtyCell qty={r} tone="success" /> : <span className="text-2xs text-fg-subtle">—</span>
    } },
    { key: 'pending', header: 'Still in transit', align: 'right', accessor: (t) => t.totalQty - t.lines.reduce((s, l) => s + l.receivedQty, 0), render: (t) => (
      <QtyCell qty={t.totalQty - t.lines.reduce((s, l) => s + l.receivedQty, 0)} tone="danger" />
    ) },
    { key: 'vehicleNo', header: 'Vehicle / LR', width: '11rem', render: (t) => (
      <div>
        <p className="font-mono text-2xs">{t.vehicleNo ?? '—'}</p>
        <p className="font-mono text-2xs text-fg-subtle">{t.lrNo ?? ''}</p>
      </div>
    ) },
    { key: 'dispatchedAt', header: 'Dispatched', sortable: true, width: '8rem', accessor: (t) => t.dispatchedAt ?? '', render: (t) => (t.dispatchedAt ? formatDate(t.dispatchedAt) : '—') },
    { key: 'expectedOn', header: 'Expected', sortable: true, width: '8rem', accessor: (t) => t.expectedOn ?? '', render: (t) => {
      if (!t.expectedOn) return <span className="text-2xs text-fg-subtle">—</span>
      const late = new Date(t.expectedOn).getTime() < Date.now()
      return <span className={cn('text-2xs', late ? 'font-medium text-danger' : 'text-fg-muted')}>{formatDate(t.expectedOn)}{late ? ' · overdue' : ''}</span>
    } },
    { key: 'transitDays', header: 'Age', align: 'right', width: '6rem', sortable: true, render: (t) => (
      <span className={cn('tabular text-2xs', t.transitDays > 7 ? 'text-danger' : t.transitDays > 3 ? 'text-warning' : 'text-fg-muted')}>{t.transitDays} d</span>
    ) },
    ...(canSeeValue ? [{ key: 'totalValue', header: 'Value', align: 'right' as const, sortable: true, render: (t: StockTransfer) => formatCurrency(t.totalValue) }] : []),
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (t) => <InvStatusBadge status={t.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'goods-in-transit', 'Goods in transit & ageing', columnsFromTable(columns), inTransit)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function postReceipt() {
    if (!receiveDoc) return
    const line = receiveDoc.lines[0]
    if (!line) return
    const already = line.receivedQty
    const received = Number(receiveQty || 0)
    const remaining = line.quantity - already
    if (received <= 0 || received > remaining) {
      toast.error('Check the quantity', `Enter between 1 and ${formatQty(remaining)} ${line.uom}.`)
      return
    }
    const short = remaining - received
    if (short > 0 && !reason.trim()) {
      toast.error('Reason required', 'A short receipt needs a reason — the balance stays in transit until it is explained.')
      return
    }
    update(receiveDoc.uid, {
      status: short > 0 ? 'PARTIALLY_RECEIVED' : 'COMPLETED',
      receivedAt: new Date().toISOString(),
      lines: receiveDoc.lines.map((l) => (l.uid === line.uid ? { ...l, receivedQty: already + received, shortQty: short, varianceReason: short > 0 ? reason.trim() : l.varianceReason } : l)),
    })
    toast.success(
      short > 0 ? 'Received short' : 'Received in full',
      short > 0
        ? `${formatQty(short)} ${line.uom} stays in goods-in-transit until it is received, claimed from the transporter or written off.`
        : `${receiveDoc.docNo} closed — the stock is now on hand at ${receiveDoc.toWarehouse}.`,
    )
    setReceiveDoc(null)
    setReceiveQty('')
    setReason('')
  }

  return (
    <div>
      <PageHeader
        title="Goods in transit"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Goods in transit' }]}
      />

      <p className="mb-3 text-xs text-fg-muted">
        Dispatched but not yet received. It stays on the sending plant's books — and on this list — until someone confirms
        arrival. <span className="font-medium text-fg">{inTransit.length}</span> consignment{inTransit.length === 1 ? '' : 's'} ·
        oldest <span className={cn('font-medium tabular', oldest > 7 ? 'text-danger' : 'text-fg')}>{oldest} days</span> ·{' '}
        <span className={cn('font-medium', overdue.length ? 'text-danger' : 'text-success')}>{overdue.length}</span> past the
        expected date
        {canSeeValue && <> · <span className="font-medium text-fg tabular">₹{formatCompact(value)}</span> in transit</>}.
      </p>

      <DataTable
        rows={inTransit}
        columns={columns}
        rowKey={(t) => t.uid}
        searchPlaceholder="Search transfer, route, vehicle or LR number…"
        onExport={doExport}
        emptyTitle="Nothing in transit"
        emptyDescription="Every dispatched consignment has been received and closed."
        rowActions={(t) => (
          <>
            {rowEdit.actions(t)}
            <MenuItem
              label="Receive at destination"
              icon={<Truck />}
              onClick={() => {
                setReceiveDoc(t)
                const line = t.lines[0]
                setReceiveQty(String((line?.quantity ?? 0) - (line?.receivedQty ?? 0)))
                setReason('')
              }}
            />
            <MenuItem
              label="Chase the transporter"
              onClick={() => toast.success('Follow-up logged', `${t.transporter ?? 'The transporter'} contacted about ${t.docNo}, ${t.transitDays} days in transit.`)}
            />
            <MenuItem
              label="Raise a shortage claim"
              danger
              separatorBefore
              disabled={!t.lines.some((l) => l.shortQty > 0)}
              onClick={() => toast.success('Claim raised', `Shortage on ${t.docNo} sent to the transporter and to Finance.`)}
            />
          </>
        )}
        rowClassName={(t) => cn(t.transitDays > 7 && 'bg-danger/[0.04]', t.expectedOn && new Date(t.expectedOn).getTime() < Date.now() && 'bg-warning/[0.03]')}
      />

      <Card className="mt-4">
        <CardHeader title="Why transfers are two steps" description="Dispatch and receipt are separate postings, on purpose" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
          <p>
            <span className="font-medium text-fg">Dispatch</span> removes the stock from the sending warehouse and puts it into
            goods-in-transit — still valued, still owned, just not anywhere you can pick from.
          </p>
          <p>
            <span className="font-medium text-fg">Receipt</span> takes it out of transit and into the destination warehouse. Any
            shortfall stays in transit with a reason until it is found, claimed or written off.
          </p>
          <p>
            <span className="font-medium text-fg">Never one step.</span> A single instant move would hide every consignment lost
            on the road, and the two plants would each believe the other had it.
          </p>
        </CardBody>
      </Card>

      {/* Receive -------------------------------------------------------------- */}
      <Modal
        open={!!receiveDoc}
        onClose={() => setReceiveDoc(null)}
        title={receiveDoc ? `Receive ${receiveDoc.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setReceiveDoc(null)}>Cancel</Button>
            <Button variant="primary" onClick={postReceipt}>Post receipt</Button>
          </>
        }
      >
        {receiveDoc && receiveDoc.lines[0] && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              <span className="font-medium text-fg">{receiveDoc.lines[0].itemName}</span> · dispatched{' '}
              {formatQty(receiveDoc.lines[0].quantity)} {receiveDoc.lines[0].uom} from {receiveDoc.fromWarehouse}
              {receiveDoc.lines[0].receivedQty > 0 && <> · already received {formatQty(receiveDoc.lines[0].receivedQty)}</>}
            </p>
            <Input
              label="Quantity received now"
              type="number"
              value={receiveQty}
              hint={`Outstanding: ${formatQty(receiveDoc.lines[0].quantity - receiveDoc.lines[0].receivedQty)} ${receiveDoc.lines[0].uom}`}
              onChange={(e) => setReceiveQty(e.target.value)}
            />
            <Textarea
              label="Short or damage reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              hint="Required if you are receiving less than was dispatched"
              placeholder="Transporter claim, damage in transit, miscount at loading…"
            />
            <div className="rounded border border-border bg-surface-2 p-3 text-2xs text-fg-muted">
              Receiving less than dispatched does not make the difference disappear — it stays in goods-in-transit under the
              sending plant until it is received, claimed or written off with approval.
            </div>
          </div>
        )}
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
