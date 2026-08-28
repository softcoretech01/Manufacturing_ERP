import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { InvStatusBadge, ItemCell, QtyCell } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { reservations as seedReservations, stockPositions, warehouseSummaries } from '@/mock/inventory'
import type { Reservation } from '@/types/inventory'

/**
 * Reservation lifecycle (Vol 5 Ch 8):
 *   RESERVED → ALLOCATED → CONSUMED, with RELEASED and EXPIRED as exits.
 * A reservation is a soft claim that lowers free stock without moving anything;
 * an allocation is a hard claim pinned to a batch, made when picking starts.
 */
const NEXT_STATE: Record<string, { to: Reservation['state']; label: string; note: string } | undefined> = {
  RESERVED: { to: 'ALLOCATED', label: 'Allocate (pick)', note: 'Pinned to a batch and bin — nothing else can take it.' },
  ALLOCATED: { to: 'CONSUMED', label: 'Mark issued', note: 'The material issue posts and the claim closes.' },
}

export function ReservationsPage() {
  const toast = useToast()
  const seed = useMemo(() => seedReservations, [])
  const { rows: reservations, create, update } = useCollection<Reservation>('inv:reservation', seed)
  const rowEdit = useRowEdit<Reservation>({
    key: 'inv:reservation',
    seed: seed,
    entity: 'Reservation',
    titleOf: (r) => `${r.itemName}${r.batchNo ? ` · ${r.batchNo}` : ''}`,
  })

  const [tab, setTab] = useState('open')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    itemCode: 'FG-SS-750-BLK',
    warehouseCode: 'FG-01',
    quantity: '',
    demandType: 'SALES_ORDER' as Reservation['demandType'],
    demandDocNo: '',
    party: '',
    priority: 'NORMAL' as Reservation['priority'],
    requiredOn: '',
    expiresOn: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const open = reservations.filter((r) => r.state === 'RESERVED' || r.state === 'ALLOCATED')
  const filtered = reservations.filter((r) => {
    if (tab === 'open') return r.state === 'RESERVED' || r.state === 'ALLOCATED'
    if (tab === 'reserved') return r.state === 'RESERVED'
    if (tab === 'allocated') return r.state === 'ALLOCATED'
    if (tab === 'closed') return r.state === 'CONSUMED' || r.state === 'RELEASED' || r.state === 'EXPIRED'
    return true
  })

  const item = stockPositions.find((p) => p.itemCode === form.itemCode)
  const qty = Number(form.quantity || 0)
  /** Free = available − everything already reserved for this item. */
  const alreadyReserved = open.filter((r) => r.itemCode === form.itemCode).reduce((s, r) => s + r.quantity, 0)
  const freeNow = item ? item.available - alreadyReserved : 0
  const overCommit = qty > freeNow

  const columns: Column<Reservation>[] = [
    { key: 'demandDocNo', header: 'Demand', sortable: true, width: '12rem', render: (r) => (
      <div>
        <p className="font-mono text-2xs font-medium text-brand-600">{r.demandDocNo}</p>
        <p className="text-2xs text-fg-subtle">{r.demandType.replace(/_/g, ' ').toLowerCase()}</p>
      </div>
    ) },
    { key: 'itemCode', header: 'Item', sortable: true, render: (r) => <ItemCell code={r.itemCode} name={r.itemName} sub={r.batchNo ?? undefined} /> },
    { key: 'party', header: 'For', sortable: true },
    { key: 'warehouseCode', header: 'Warehouse', width: '8rem', render: (r) => <span className="font-mono text-2xs">{r.warehouseCode}</span> },
    { key: 'quantity', header: 'Quantity', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.quantity} uom={r.uom} /> },
    { key: 'priority', header: 'Priority', width: '7rem', sortable: true, render: (r) => (
      <Badge size="sm" dot={false} tone={r.priority === 'URGENT' ? 'danger' : r.priority === 'HIGH' ? 'warning' : 'neutral'}>
        {r.priority.charAt(0) + r.priority.slice(1).toLowerCase()}
      </Badge>
    ) },
    { key: 'requiredOn', header: 'Required', sortable: true, width: '8rem', accessor: (r) => r.requiredOn, render: (r) => formatDate(r.requiredOn) },
    { key: 'expiresOn', header: 'Expires', sortable: true, width: '8rem', accessor: (r) => r.expiresOn, render: (r) => {
      const days = Math.ceil((new Date(r.expiresOn).getTime() - Date.now()) / 86_400_000)
      return (
        <span className={cn('text-2xs tabular', days <= 0 ? 'text-danger' : days <= 1 ? 'text-warning' : 'text-fg-muted')}>
          {formatDate(r.expiresOn)}{days > 0 && days <= 3 ? ` · ${days} d` : ''}
        </span>
      )
    } },
    { key: 'state', header: 'State', sortable: true, width: '9rem', render: (r) => <InvStatusBadge status={r.state} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'reservations', 'Reservation & allocation register', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function save() {
    const e: Record<string, string> = {}
    if (!form.demandDocNo.trim()) e.demandDocNo = 'Which order or request is this for?'
    if (!form.party.trim()) e.party = 'Name the customer, department or line.'
    if (!form.quantity || qty <= 0) e.quantity = 'Enter a quantity greater than zero.'
    if (overCommit) e.quantity = `Only ${formatQty(freeNow)} ${item?.uom} is free — the rest is already reserved. Double allocation is refused.`
    if (!form.requiredOn) e.requiredOn = 'A reservation without a need date cannot be prioritised.'
    setErrors(e)
    if (Object.keys(e).length || !item) return

    const expires = form.expiresOn || new Date(new Date(form.requiredOn).getTime() + 2 * 86_400_000).toISOString().slice(0, 10)
    create({
      uid: newUid('rsv'),
      itemCode: item.itemCode,
      itemName: item.itemName,
      uom: item.uom,
      warehouseCode: form.warehouseCode,
      batchNo: null,
      quantity: qty,
      state: 'RESERVED',
      priority: form.priority,
      demandType: form.demandType,
      demandDocNo: form.demandDocNo.trim(),
      party: form.party.trim(),
      requiredOn: form.requiredOn,
      expiresOn: expires,
    } as Reservation)
    toast.success('Reserved', `${formatQty(qty)} ${item.uom} of ${item.itemCode} is now committed to ${form.demandDocNo}. Free stock has dropped, but nothing has moved.`)
    setFormOpen(false)
    setForm({ ...form, quantity: '', demandDocNo: '', party: '' })
  }

  /** Item-level pressure: how much of what is available is already claimed. */
  const pressure = stockPositions
    .map((p) => {
      const claimed = open.filter((r) => r.itemCode === p.itemCode).reduce((s, r) => s + r.quantity, 0)
      return { item: p, claimed, pct: p.available ? (claimed / p.available) * 100 : 0 }
    })
    .filter((x) => x.claimed > 0)
    .sort((a, b) => b.pct - a.pct)

  return (
    <div>
      <PageHeader
        title="Material reservation & allocation"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Reservations' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setErrors({}); setFormOpen(true) }}>
            New reservation
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'open', label: 'Open', count: open.length },
              { id: 'reserved', label: 'Reserved', count: reservations.filter((r) => r.state === 'RESERVED').length },
              { id: 'allocated', label: 'Allocated', count: reservations.filter((r) => r.state === 'ALLOCATED').length },
              { id: 'closed', label: 'Closed', count: reservations.filter((r) => ['CONSUMED', 'RELEASED', 'EXPIRED'].includes(r.state)).length },
              { id: 'all', label: 'All', count: reservations.length },
            ]}
          />
        }
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-xs">
          {[
            { s: 'Reserved', d: 'Soft claim — free stock drops, nothing moves' },
            { s: 'Allocated', d: 'Hard claim — pinned to a batch and bin for picking' },
            { s: 'Consumed', d: 'Issued against the demand; the claim closes' },
            { s: 'Released / Expired', d: 'Returned to free stock, holder notified' },
          ].map((x, i) => (
            <div key={x.s} className="flex items-center gap-2">
              {i > 0 && <span className="text-fg-subtle">→</span>}
              <div>
                <p className="font-medium text-fg">{x.s}</p>
                <p className="text-2xs text-fg-muted">{x.d}</p>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <DataTable
          density="comfortable"
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search demand document, item or customer…"
        onExport={doExport}
        emptyTitle="No reservations"
        emptyDescription="Reserve stock against a sales order, production order or transfer so nobody else can take it."
        rowActions={(r) => {
          const next = NEXT_STATE[r.state]
          return (
            <>
              {rowEdit.actions(r)}
              {next && (
                <MenuItem
                  label={next.label}
                  onClick={() => {
                    update(r.uid, { state: next.to, batchNo: next.to === 'ALLOCATED' ? 'FIFO-resolved at picking' : r.batchNo })
                    toast.success(next.label, next.note)
                  }}
                />
              )}
              <MenuItem
                label="Release back to free stock"
                danger
                disabled={r.state !== 'RESERVED' && r.state !== 'ALLOCATED'}
                onClick={() => {
                  update(r.uid, { state: 'RELEASED' })
                  toast.success('Released', `${formatQty(r.quantity)} ${r.uom} returned to free stock. ${r.party} has been notified — stock is never taken silently.`)
                }}
              />
              <MenuItem
                label="Raise priority to urgent"
                separatorBefore
                disabled={r.priority === 'URGENT' || r.state === 'CONSUMED'}
                onClick={() => {
                  update(r.uid, { priority: 'URGENT' })
                  toast.success('Priority raised', 'Urgent claims are picked first when stock is short.')
                }}
              />
            </>
          )
        }}
        rowClassName={(r) => cn(r.state === 'EXPIRED' && 'opacity-60', r.priority === 'URGENT' && r.state !== 'CONSUMED' && 'bg-danger/[0.03]')}
      />

      <Card className="mt-4">
        <CardHeader title="Reservation pressure" description="How much of the available stock is already committed — anything at 100% cannot be promised again" />
        <CardBody className="space-y-3">
          {pressure.length === 0 ? (
            <p className="text-xs text-fg-subtle">Nothing is committed right now — all available stock is free.</p>
          ) : (
            pressure.map((x) => (
              <div key={x.item.uid}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-fg">{x.item.itemName}</span>
                  <span className={cn('shrink-0 tabular text-2xs', x.pct >= 100 ? 'text-danger' : x.pct > 70 ? 'text-warning' : 'text-fg-muted')}>
                    {formatQty(x.claimed)} of {formatQty(x.item.available)} {x.item.uom} · {x.pct.toFixed(0)}%
                  </span>
                </div>
                <ProgressBar value={Math.min(100, x.pct)} tone={x.pct >= 100 ? 'danger' : x.pct > 70 ? 'warning' : 'brand'} />
              </div>
            ))
          )}
        </CardBody>
      </Card>

      {/* New reservation ------------------------------------------------------ */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Reserve stock"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={overCommit}>Reserve</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Item"
            containerClassName="sm:col-span-2"
            value={form.itemCode}
            onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
            options={stockPositions.map((p) => ({ value: p.itemCode, label: `${p.itemCode} — ${p.itemName}` }))}
          />
          <Select
            label="Warehouse"
            value={form.warehouseCode}
            onChange={(e) => setForm({ ...form, warehouseCode: e.target.value })}
            options={warehouseSummaries.filter((w) => w.includeInAtp).map((w) => ({ value: w.code, label: `${w.code} — ${w.name}` }))}
          />
          <Input
            label={`Quantity${item ? ` (${item.uom})` : ''}`}
            type="number"
            required
            value={form.quantity}
            error={errors.quantity}
            hint={item ? `Free right now: ${formatQty(freeNow)} ${item.uom}` : undefined}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <Select
            label="Demand type"
            value={form.demandType}
            onChange={(e) => setForm({ ...form, demandType: e.target.value as Reservation['demandType'] })}
            options={[
              { value: 'SALES_ORDER', label: 'Sales order' },
              { value: 'PRODUCTION_ORDER', label: 'Production order' },
              { value: 'TRANSFER', label: 'Stock transfer' },
              { value: 'SAMPLE', label: 'Sample / free issue' },
              { value: 'MANUAL', label: 'Manual hold' },
            ]}
          />
          <Input label="Demand document" required value={form.demandDocNo} error={errors.demandDocNo} placeholder="SO/26-27/00224" onChange={(e) => setForm({ ...form, demandDocNo: e.target.value })} />
          <Input label="For (customer / line)" required value={form.party} error={errors.party} placeholder="Metro Retail" onChange={(e) => setForm({ ...form, party: e.target.value })} />
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as Reservation['priority'] })}
            options={[
              { value: 'LOW', label: 'Low' },
              { value: 'NORMAL', label: 'Normal' },
              { value: 'HIGH', label: 'High' },
              { value: 'URGENT', label: 'Urgent' },
            ]}
          />
          <Input label="Required on" type="date" required value={form.requiredOn} error={errors.requiredOn} onChange={(e) => setForm({ ...form, requiredOn: e.target.value })} />
          <Input
            label="Expires on"
            type="date"
            value={form.expiresOn}
            hint="Left blank, it expires two days after the need date — no reservation lives forever"
            onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
          />
        </div>

        {item && (
          <div className={cn('mt-4 rounded border p-3 text-xs', overCommit ? 'border-danger/30 bg-danger/5' : 'border-border bg-surface-2')}>
            <div className="grid gap-2 sm:grid-cols-4">
              <p className="text-fg-muted">Available <span className="block font-medium tabular text-fg">{formatQty(item.available)}</span></p>
              <p className="text-fg-muted">Already reserved <span className="block font-medium tabular text-fg">{formatQty(alreadyReserved)}</span></p>
              <p className="text-fg-muted">Free <span className={cn('block font-medium tabular', freeNow <= 0 ? 'text-danger' : 'text-success')}>{formatQty(freeNow)}</span></p>
              <p className="text-fg-muted">After this <span className={cn('block font-medium tabular', overCommit ? 'text-danger' : 'text-fg')}>{formatQty(freeNow - qty)}</span></p>
            </div>
            {overCommit && (
              <p className="mt-2 text-danger">
                This would commit more than exists. Reserving twice over the same stock is exactly how an order gets accepted and
                then missed — so it is refused.
              </p>
            )}
          </div>
        )}
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
