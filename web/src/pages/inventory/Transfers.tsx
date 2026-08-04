import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Truck, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { ApprovalTrail, DetailBlock, InvStatusBadge, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { binSlots, stockPositions, transfers as seedTransfers, warehouseSummaries } from '@/mock/inventory'
import type { StockTransfer, TransferType } from '@/types/inventory'

const TYPE_META: Record<TransferType, { label: string; note: string; twoStep: boolean }> = {
  BIN: { label: 'Bin to bin', note: 'Within one warehouse. Posts immediately, no approval, no value change.', twoStep: false },
  WAREHOUSE: { label: 'Warehouse to warehouse', note: 'Within the plant. Approved when the value is high or the destination is controlled.', twoStep: false },
  INTER_PLANT: { label: 'Plant to plant', note: 'Two steps: dispatch into goods-in-transit, then receipt at the other end.', twoStep: true },
  JOB_WORK: { label: 'To a job worker', note: 'Raised on the job-work screen — it needs a statutory challan.', twoStep: true },
}

export function TransfersPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedTransfers, [])
  const { rows: transfers, create, update } = useCollection<StockTransfer>('inv:transfer', seed)
  const rowEdit = useRowEdit<StockTransfer>({
    key: 'inv:transfer',
    seed: seed,
    entity: 'Transfer',
    titleOf: (r) => r.docNo,
  })

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<StockTransfer | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    transferType: 'BIN' as TransferType,
    from: 'Raw Material Store',
    to: 'Raw Material Store',
    fromBin: 'CY-01',
    toBin: 'CY-04',
    itemCode: 'RM-SS304-050',
    quantity: '',
    vehicleNo: '',
    ewayBillNo: '',
    reason: 'Re-slotting',
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const filtered = transfers.filter((t) => {
    if (tab === 'pending') return t.status === 'PENDING_APPROVAL'
    if (tab === 'approved') return t.status === 'APPROVED'
    if (tab === 'transit') return t.status === 'IN_TRANSIT' || t.status === 'PARTIALLY_RECEIVED'
    if (tab === 'done') return t.status === 'COMPLETED'
    return true
  })

  const item = stockPositions.find((p) => p.itemCode === form.itemCode)
  const qty = Number(form.quantity || 0)
  const free = item ? item.available - item.reserved : 0
  const value = item ? qty * item.rate : 0
  const meta = TYPE_META[form.transferType]
  const needsEway = form.transferType === 'INTER_PLANT' && value > 50_000

  const columns: Column<StockTransfer>[] = [
    { key: 'docNo', header: 'Transfer', sortable: true, width: '11rem', render: (t) => <span className="font-mono text-xs font-medium text-brand-600">{t.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (t) => t.docDate, render: (t) => formatDate(t.docDate) },
    { key: 'transferType', header: 'Type', sortable: true, width: '11rem', render: (t) => (
      <Badge tone={t.transferType === 'INTER_PLANT' ? 'brand' : 'neutral'} size="sm" dot={false}>{TYPE_META[t.transferType].label}</Badge>
    ) },
    { key: 'route', header: 'From → to', accessor: (t) => `${t.fromWarehouse} ${t.toWarehouse}`, render: (t) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{t.fromWarehouse}{t.lines[0]?.fromBin ? ` · ${t.lines[0].fromBin}` : ''}</p>
        <p className="truncate text-2xs text-fg-subtle">→ {t.toWarehouse}{t.lines[0]?.toBin ? ` · ${t.lines[0].toBin}` : ''}</p>
      </div>
    ) },
    { key: 'item', header: 'Item', accessor: (t) => t.lines[0]?.itemName ?? '', render: (t) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{t.lines[0]?.itemName ?? '—'}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{t.lines[0]?.batchNo ?? ''}</p>
      </div>
    ) },
    { key: 'totalQty', header: 'Quantity', align: 'right', sortable: true, render: (t) => <QtyCell qty={t.totalQty} /> },
    { key: 'reason', header: 'Reason', defaultHidden: true },
    { key: 'ewayBillNo', header: 'E-way bill', width: '10rem', defaultHidden: true, render: (t) => <span className="font-mono text-2xs">{t.ewayBillNo ?? '—'}</span> },
    ...(canSeeValue ? [{ key: 'totalValue', header: 'Value moved', align: 'right' as const, sortable: true, render: (t: StockTransfer) => formatCurrency(t.totalValue) }] : []),
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (t) => <InvStatusBadge status={t.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'stock-transfers', 'Stock transfer register', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function save() {
    const e: Record<string, string> = {}
    if (!form.quantity || qty <= 0) e.quantity = 'Enter a quantity greater than zero.'
    if (qty > free) e.quantity = `Only ${formatQty(free)} ${item?.uom} is free. Reserved stock cannot be transferred without releasing the reservation.`
    if (form.transferType === 'BIN' && form.fromBin === form.toBin) e.toBin = 'Source and destination bin must be different.'
    if (form.transferType !== 'BIN' && form.from === form.to) e.to = 'Source and destination warehouse must be different.'
    if (form.transferType === 'INTER_PLANT' && !form.vehicleNo.trim()) e.vehicleNo = 'A movement leaving the premises needs a vehicle number.'
    if (needsEway && !form.ewayBillNo.trim()) e.ewayBillNo = 'Value is above ₹50,000 — an e-way bill number is required before dispatch.'
    setErrors(e)
    if (Object.keys(e).length || !item) return

    const next = Math.max(...transfers.map((t) => Number(t.docNo.slice(-5)) || 0)) + 1
    const docNo = `ST/26-27/${String(next).padStart(5, '0')}`
    const immediate = form.transferType === 'BIN'

    create({
      uid: newUid('st'),
      docNo,
      docDate: new Date().toISOString().slice(0, 10),
      status: immediate ? 'COMPLETED' : 'PENDING_APPROVAL',
      plant: 'Chennai — Unit 1',
      transferType: form.transferType,
      fromWarehouse: form.from,
      toWarehouse: form.to,
      toPlant: form.transferType === 'INTER_PLANT' ? 'Coimbatore Depot' : 'Chennai — Unit 1',
      reason: form.reason,
      vehicleNo: form.vehicleNo || undefined,
      ewayBillNo: form.ewayBillNo || undefined,
      isDistinctPerson: false,
      transitDays: 0,
      totalQty: qty,
      totalValue: value,
      createdBy: 'M. Lakshmi',
      createdAt: new Date().toISOString(),
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: immediate ? [] : [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'PENDING' }],
      lines: [
        {
          uid: newUid('trl'),
          itemCode: item.itemCode,
          itemName: item.itemName,
          uom: item.uom,
          batchNo: item.isBatchTracked ? 'FIFO-resolved at picking' : null,
          fromBin: form.transferType === 'BIN' ? form.fromBin : null,
          toBin: form.transferType === 'BIN' ? form.toBin : null,
          quantity: qty,
          receivedQty: immediate ? qty : 0,
          shortQty: 0,
          damageQty: 0,
          value,
        },
      ],
    } as StockTransfer)

    toast.success(
      immediate ? 'Bin transfer posted' : 'Transfer raised',
      immediate
        ? `${docNo} — ${formatQty(qty)} ${item.uom} moved from ${form.fromBin} to ${form.toBin}. No valuation figure changes on a bin move.`
        : `${docNo} sent for approval. ${meta.twoStep ? 'On dispatch the stock moves into goods-in-transit until the other end receives it.' : 'It posts as soon as it is approved.'}`,
    )
    setFormOpen(false)
    setForm({ ...form, quantity: '', vehicleNo: '', ewayBillNo: '' })
  }

  const eligibleBins = binSlots.filter((b) => b.warehouseCode === (warehouseSummaries.find((w) => w.name === form.from)?.code ?? ''))

  return (
    <div>
      <PageHeader
        title="Stock transfer"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Stock transfer' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/goods-in-transit')}>
              Goods in transit
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setErrors({}); setFormOpen(true) }}>
              New transfer
            </Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: transfers.length },
              { id: 'pending', label: 'Awaiting approval', count: transfers.filter((t) => t.status === 'PENDING_APPROVAL').length },
              { id: 'approved', label: 'Ready to dispatch', count: transfers.filter((t) => t.status === 'APPROVED').length },
              { id: 'transit', label: 'In transit', count: transfers.filter((t) => t.status === 'IN_TRANSIT' || t.status === 'PARTIALLY_RECEIVED').length },
              { id: 'done', label: 'Completed', count: transfers.filter((t) => t.status === 'COMPLETED').length },
            ]}
          />
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        Moving stock without selling or consuming it. A bin move posts straight away and changes no value; a plant-to-plant move
        goes through goods-in-transit so a consignment can never vanish between two warehouses.
      </p>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(t) => t.uid}
        searchPlaceholder="Search transfer, route, item or vehicle…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No transfers"
        emptyDescription="Raise one to move stock between bins, warehouses or plants."
        rowActions={(t) => (
          <>
            {rowEdit.actions(t)}
            <MenuItem label="Open" onClick={() => setDetail(t)} />
            <MenuItem
              label="Approve"
              icon={<Check />}
              disabled={t.status !== 'PENDING_APPROVAL'}
              onClick={() => {
                update(t.uid, {
                  status: 'APPROVED',
                  approvals: t.approvals.map((a) => (a.status === 'PENDING' ? { ...a, status: 'APPROVED' as const, actedAt: new Date().toISOString() } : a)),
                })
                toast.success('Approved', `${t.docNo} may now be dispatched.`)
              }}
            />
            <MenuItem
              label="Dispatch"
              icon={<Truck />}
              disabled={t.status !== 'APPROVED'}
              onClick={() => {
                const twoStep = TYPE_META[t.transferType].twoStep
                update(t.uid, {
                  status: twoStep ? 'IN_TRANSIT' : 'COMPLETED',
                  dispatchedAt: new Date().toISOString(),
                  lines: twoStep ? t.lines : t.lines.map((l) => ({ ...l, receivedQty: l.quantity })),
                })
                toast.success(
                  'Dispatched',
                  twoStep
                    ? `Stock left ${t.fromWarehouse} and now sits in goods-in-transit under the sending plant.`
                    : `${t.docNo} completed — stock is at ${t.toWarehouse}.`,
                )
              }}
            />
            <MenuItem
              label="Receive at destination"
              disabled={t.status !== 'IN_TRANSIT' && t.status !== 'PARTIALLY_RECEIVED'}
              onClick={() => navigate('/inventory/goods-in-transit')}
            />
            <MenuItem
              label="Cancel"
              icon={<X />}
              danger
              separatorBefore
              disabled={['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'COMPLETED'].includes(t.status)}
              onClick={() => {
                update(t.uid, { status: 'CANCELLED' })
                toast.success('Cancelled', 'A dispatched transfer can never be cancelled — the material physically exists somewhere.')
              }}
            />
          </>
        )}
      />

      {/* Detail --------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.fromWarehouse} → ${detail.toWarehouse}` : undefined}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">{TYPE_META[detail.transferType].label} · {detail.reason}</span>
              <div className="flex gap-2">
                {(detail.status === 'IN_TRANSIT' || detail.status === 'PARTIALLY_RECEIVED') && (
                  <Button variant="success" size="sm" onClick={() => navigate('/inventory/goods-in-transit')}>Receive</Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <InvStatusBadge status={detail.status} />
              <Badge tone="neutral" size="sm" dot={false}>{TYPE_META[detail.transferType].label}</Badge>
              {detail.isDistinctPerson && <Badge tone="warning" size="sm">Distinct person — tax invoice</Badge>}
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'From', value: detail.fromWarehouse },
                { label: 'To', value: `${detail.toWarehouse} (${detail.toPlant})` },
                { label: 'Reason', value: detail.reason },
                { label: 'Vehicle / LR', value: detail.vehicleNo ? `${detail.vehicleNo} / ${detail.lrNo ?? '—'}` : '—' },
                { label: 'Transporter', value: detail.transporter ?? '—' },
                { label: 'E-way bill', value: detail.ewayBillNo ?? '—', mono: true },
                { label: 'Dispatched', value: detail.dispatchedAt ? formatDate(detail.dispatchedAt) : 'Not dispatched' },
                { label: 'Received', value: detail.receivedAt ? formatDate(detail.receivedAt) : 'Not received' },
                ...(canSeeValue ? [{ label: 'Value moved', value: formatCurrency(detail.totalValue) }] : []),
              ]}
            />

            <DetailBlock title={`Lines (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item · batch</th>
                      <th>From bin</th>
                      <th>To bin</th>
                      <th className="text-right">Sent</th>
                      <th className="text-right">Received</th>
                      <th className="text-right">Short</th>
                      <th>Variance reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}{l.batchNo ? ` · ${l.batchNo}` : ''}</p>
                        </td>
                        <td className="font-mono text-2xs">{l.fromBin ?? '—'}</td>
                        <td className="font-mono text-2xs">{l.toBin ?? '—'}</td>
                        <td className="text-right tabular">{formatQty(l.quantity)} {l.uom}</td>
                        <td className="text-right tabular text-success">{formatQty(l.receivedQty)}</td>
                        <td className={cn('text-right tabular', l.shortQty > 0 && 'font-medium text-danger')}>{formatQty(l.shortQty)}</td>
                        <td className="text-2xs text-fg-muted">{l.varianceReason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            {detail.approvals.length > 0 && (
              <DetailBlock title="Approval">
                <ApprovalTrail steps={detail.approvals} />
              </DetailBlock>
            )}

            {detail.remarks && (
              <DetailBlock title="Remarks">
                <p className="text-xs text-fg-muted">{detail.remarks}</p>
              </DetailBlock>
            )}
          </div>
        )}
      </Drawer>

      {/* New transfer --------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New stock transfer"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>{form.transferType === 'BIN' ? 'Post transfer' : 'Submit for approval'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="What kind of move?"
            containerClassName="sm:col-span-2"
            value={form.transferType}
            onChange={(e) => setForm({ ...form, transferType: e.target.value as TransferType })}
            hint={meta.note}
            options={(['BIN', 'WAREHOUSE', 'INTER_PLANT'] as TransferType[]).map((t) => ({ value: t, label: TYPE_META[t].label }))}
          />
          <Select
            label="From warehouse"
            value={form.from}
            onChange={(e) => setForm({ ...form, from: e.target.value, to: form.transferType === 'BIN' ? e.target.value : form.to })}
            options={warehouseSummaries.map((w) => ({ value: w.name, label: `${w.code} — ${w.name}` }))}
          />
          <Select
            label="To warehouse"
            value={form.to}
            error={errors.to}
            disabled={form.transferType === 'BIN'}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
            options={warehouseSummaries.map((w) => ({ value: w.name, label: `${w.code} — ${w.name}` }))}
          />
          {form.transferType === 'BIN' && (
            <>
              <Select
                label="From bin"
                value={form.fromBin}
                onChange={(e) => setForm({ ...form, fromBin: e.target.value })}
                options={eligibleBins.map((b) => ({ value: b.code, label: `${b.code} — ${b.contents}` }))}
              />
              <Select
                label="To bin"
                value={form.toBin}
                error={errors.toBin}
                onChange={(e) => setForm({ ...form, toBin: e.target.value })}
                options={eligibleBins.filter((b) => b.status === 'AVAILABLE').map((b) => ({ value: b.code, label: `${b.code} · ${b.utilisationPct}% full` }))}
              />
            </>
          )}
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
            hint={item ? `Free ${formatQty(free)} · reserved ${formatQty(item.reserved)}` : undefined}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <Input label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          {form.transferType === 'INTER_PLANT' && (
            <>
              <Input label="Vehicle number" required value={form.vehicleNo} error={errors.vehicleNo} placeholder="TN 38 BQ 4471" onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} />
              <Input
                label="E-way bill number"
                required={needsEway}
                value={form.ewayBillNo}
                error={errors.ewayBillNo}
                hint={needsEway ? 'Required above ₹50,000 — dispatch is blocked without it' : 'Not required below the threshold'}
                onChange={(e) => setForm({ ...form, ewayBillNo: e.target.value })}
              />
              <Textarea label="Notes" containerClassName="sm:col-span-2" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Seal number, loading condition, anything the receiving store should know." />
            </>
          )}
        </div>

        {item && qty > 0 && (
          <div className="mt-4 rounded border border-border bg-surface-2 p-3 text-xs">
            <p className="font-medium text-fg">What will happen</p>
            <ul className="mt-1.5 space-y-1 text-fg-muted">
              <li>• {formatQty(qty)} {item.uom} leaves {form.transferType === 'BIN' ? `bin ${form.fromBin}` : form.from}.</li>
              <li>• {meta.twoStep ? 'It sits in goods-in-transit under this plant until the destination confirms arrival.' : `It arrives at ${form.transferType === 'BIN' ? `bin ${form.toBin}` : form.to} in the same posting.`}</li>
              {canSeeValue && <li>• {form.transferType === 'BIN' ? 'No valuation figure changes — a bin move never affects value.' : `${formatCurrency(value)} moves with it.`}</li>}
            </ul>
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Three kinds of move" description="The type decides the approval, the paperwork and whether it is one step or two" />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {(['BIN', 'WAREHOUSE', 'INTER_PLANT'] as TransferType[]).map((t) => (
            <div key={t} className="rounded border border-border p-3">
              <p className="text-xs font-medium text-fg">{TYPE_META[t].label}</p>
              <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{TYPE_META[t].note}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
