import { useMemo, useState } from 'react'
import { Check, Plus, Printer, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { ApprovalTrail, DetailBlock, InvStatusBadge, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { binSlots, goodsReceipts as seedReceipts, stockPositions, warehouseSummaries } from '@/mock/inventory'
import type { GoodsReceipt, ReceiptSource } from '@/types/inventory'

const SOURCES: { value: ReceiptSource; label: string; hint: string }[] = [
  { value: 'PURCHASE', label: 'Purchase (GRN)', hint: 'Material bought from a supplier' },
  { value: 'PRODUCTION', label: 'Production completion', hint: 'Finished or semi-finished goods made in-house' },
  { value: 'SALES_RETURN', label: 'Sales return', hint: 'Goods sent back by a customer — always inspected' },
  { value: 'JOB_WORK', label: 'Job-work return', hint: 'Material coming back from a subcontractor' },
  { value: 'TRANSFER', label: 'Inter-plant transfer', hint: 'Received against a transfer in goods-in-transit' },
  { value: 'OPENING', label: 'Opening / adjustment', hint: 'Migration or approved correction' },
]

/** Simple, explainable put-away rule: first available bin in the warehouse. */
function suggestBin(warehouseCode: string) {
  const bin = binSlots.find((b) => b.warehouseCode === warehouseCode && b.status === 'AVAILABLE' && b.utilisationPct < 90)
  return bin?.code ?? null
}

function nextBatchNo() {
  const d = new Date()
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `B${stamp}${String(Math.floor(Math.random() * 900) + 100)}`
}

export function GoodsReceiptPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedReceipts, [])
  const { rows: receipts, create, update } = useCollection<GoodsReceipt>('inv:receipt', seed)
  const rowEdit = useRowEdit<GoodsReceipt>({
    key: 'inv:receipt',
    seed: seed,
    entity: 'Goods receipt',
    titleOf: (r) => r.docNo,
  })

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<GoodsReceipt | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    sourceType: 'PURCHASE' as ReceiptSource,
    sourceDocNo: '',
    sourceParty: '',
    warehouse: 'RM-01',
    itemCode: 'RM-SS304-050',
    quantity: '',
    batchNo: '',
    expiresOn: '',
    qcRequired: 'yes',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const counts = {
    all: receipts.length,
    awaiting: receipts.filter((r) => r.status === 'PENDING_APPROVAL' || r.status === 'IN_PROGRESS').length,
    qc: receipts.filter((r) => r.qcRequired && r.qcStatus === 'PENDING').length,
    today: receipts.filter((r) => r.docDate === new Date().toISOString().slice(0, 10)).length,
  }

  const filtered = receipts.filter((r) => {
    if (tab === 'awaiting') return r.status === 'PENDING_APPROVAL' || r.status === 'IN_PROGRESS'
    if (tab === 'qc') return r.qcRequired && r.qcStatus === 'PENDING'
    if (tab === 'done') return r.status === 'COMPLETED'
    return true
  })

  const item = stockPositions.find((p) => p.itemCode === form.itemCode)
  const qty = Number(form.quantity || 0)
  const suggestedBin = suggestBin(form.warehouse)

  const columns: Column<GoodsReceipt>[] = [
    { key: 'docNo', header: 'Receipt', sortable: true, width: '11rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (r) => r.docDate, render: (r) => formatDate(r.docDate) },
    { key: 'sourceType', header: 'Source', sortable: true, width: '10rem', render: (r) => (
      <Badge tone="neutral" size="sm" dot={false}>{SOURCES.find((s) => s.value === r.sourceType)?.label ?? r.sourceType}</Badge>
    ) },
    { key: 'sourceParty', header: 'From', sortable: true, render: (r) => (
      <div className="min-w-0">
        <p className="truncate text-xs text-fg">{r.sourceParty}</p>
        <p className="truncate font-mono text-2xs text-fg-subtle">{r.sourceDocNo}</p>
      </div>
    ) },
    { key: 'itemCode', header: 'Item', sortable: true, render: (r) => <ItemCell code={r.itemCode} name={r.itemName} sub={r.batchNo ?? undefined} /> },
    { key: 'quantity', header: 'Received', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.quantity} uom={r.uom} /> },
    { key: 'acceptedQty', header: 'Accepted', align: 'right', render: (r) => <QtyCell qty={r.acceptedQty} tone={r.acceptedQty ? 'success' : 'muted'} /> },
    { key: 'rejectedQty', header: 'Rejected', align: 'right', render: (r) => <QtyCell qty={r.rejectedQty} tone={r.rejectedQty ? 'danger' : 'muted'} /> },
    { key: 'warehouse', header: 'Warehouse', sortable: true },
    { key: 'bin', header: 'Bin', width: '7rem', render: (r) => <span className="font-mono text-2xs">{r.bin ?? 'not binned'}</span> },
    ...(canSeeValue ? [{ key: 'value', header: 'Value', align: 'right' as const, sortable: true, render: (r: GoodsReceipt) => formatCurrency(r.value) }] : []),
    { key: 'qcStatus', header: 'QC', sortable: true, width: '9rem', render: (r) => <InvStatusBadge status={r.qcStatus} size="sm" /> },
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (r) => <InvStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'goods-receipts', 'Goods receipt register', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function save() {
    const e: Record<string, string> = {}
    if (!form.sourceDocNo.trim()) e.sourceDocNo = 'Enter the source document number (GRN, production order, return…).'
    if (!form.sourceParty.trim()) e.sourceParty = 'Who or where is it coming from?'
    if (!form.quantity || qty <= 0) e.quantity = 'Enter a quantity greater than zero.'
    if (item?.isBatchTracked && !form.batchNo.trim()) e.batchNo = 'This item is batch tracked — a batch number is required.'
    setErrors(e)
    if (Object.keys(e).length || !item) return

    const qcRequired = form.qcRequired === 'yes'
    const wh = warehouseSummaries.find((w) => w.code === (qcRequired ? 'QTN-01' : form.warehouse))
    const next = Math.max(...receipts.map((r) => Number(r.docNo.slice(-5)) || 0)) + 1
    const docNo = `GR/26-27/${String(next).padStart(5, '0')}`

    create({
      uid: newUid('gr'),
      docNo,
      docDate: new Date().toISOString().slice(0, 10),
      status: qcRequired ? 'IN_PROGRESS' : 'COMPLETED',
      plant: 'Chennai — Unit 1',
      sourceType: form.sourceType,
      sourceDocNo: form.sourceDocNo.trim(),
      sourceParty: form.sourceParty.trim(),
      warehouse: wh?.name ?? form.warehouse,
      itemCode: item.itemCode,
      itemName: item.itemName,
      uom: item.uom,
      quantity: qty,
      acceptedQty: qcRequired ? 0 : qty,
      rejectedQty: 0,
      batchNo: item.isBatchTracked ? form.batchNo.trim() : null,
      expiresOn: form.expiresOn || null,
      bin: qcRequired ? null : suggestedBin,
      rate: item.rate,
      value: qty * item.rate,
      qcRequired,
      qcStatus: qcRequired ? 'PENDING' : 'NOT_REQUIRED',
      receivedBy: 'K. Ravi',
      labelsPrinted: 1,
      createdBy: 'K. Ravi',
      createdAt: new Date().toISOString(),
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: qcRequired ? 'PENDING' : 'APPROVED', actedAt: qcRequired ? undefined : new Date().toISOString() }],
    } as GoodsReceipt)

    toast.success(
      'Receipt posted',
      qcRequired
        ? `${docNo} — ${formatQty(qty)} ${item.uom} held in Quarantine Store until QC decides. It counts in stock value, not in free stock.`
        : `${docNo} — ${formatQty(qty)} ${item.uom} available in ${wh?.name ?? form.warehouse}${suggestedBin ? `, bin ${suggestedBin}` : ''}.`,
    )
    setFormOpen(false)
    setForm({ ...form, sourceDocNo: '', sourceParty: '', quantity: '', batchNo: '', expiresOn: '' })
  }

  return (
    <div>
      <PageHeader
        title="Goods receipt"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Goods receipt' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setErrors({})
              setForm({ ...form, batchNo: nextBatchNo() })
              setFormOpen(true)
            }}
          >
            New receipt
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'awaiting', label: 'Awaiting action', count: counts.awaiting },
              { id: 'qc', label: 'In QC hold', count: counts.qc },
              { id: 'done', label: 'Completed', count: receipts.filter((r) => r.status === 'COMPLETED').length },
            ]}
          />
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg">{counts.today}</span> receipt{counts.today === 1 ? '' : 's'} today ·{' '}
        <span className={cn('font-medium', counts.awaiting ? 'text-warning' : 'text-success')}>{counts.awaiting}</span> awaiting
        put-away or QC · <span className="font-medium text-fg">{counts.qc}</span> in QC hold. Stock is added the moment a receipt
        is posted — quarantined stock is valued but cannot be issued.
      </p>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search receipt, source document, supplier, item or batch…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No goods receipts"
        emptyDescription="Post a receipt to bring stock in from a purchase, production, a return or a transfer."
        rowActions={(r) => (
          <>
            {rowEdit.actions(r)}
            <MenuItem label="Open" onClick={() => setDetail(r)} />
            <MenuItem
              label="Accept in QC"
              icon={<Check />}
              disabled={!r.qcRequired || r.qcStatus !== 'PENDING'}
              onClick={() => {
                update(r.uid, { qcStatus: 'ACCEPTED', acceptedQty: r.quantity, rejectedQty: 0, status: 'COMPLETED', bin: suggestBin('RM-01') })
                toast.success('Released to stores', `${formatQty(r.quantity)} ${r.uom} of ${r.itemCode} is now free stock.`)
              }}
            />
            <MenuItem
              label="Reject in QC"
              icon={<X />}
              danger
              disabled={!r.qcRequired || r.qcStatus !== 'PENDING'}
              onClick={() => {
                update(r.uid, { qcStatus: 'REJECTED', acceptedQty: 0, rejectedQty: r.quantity, status: 'COMPLETED', warehouse: 'Reject Store' })
                toast.success('Rejected', `${r.docNo} moved to the Reject Store — a purchase return can now be raised.`)
              }}
            />
            <MenuItem
              label="Print label"
              icon={<Printer />}
              separatorBefore
              onClick={() => {
                update(r.uid, { labelsPrinted: r.labelsPrinted + 1 })
                toast.success('Label sent to printer', `${r.batchNo ?? r.itemCode} — reprints are counted and audited.`)
              }}
            />
          </>
        )}
        rowClassName={(r) => cn(r.qcRequired && r.qcStatus === 'PENDING' && 'bg-warning/[0.04]')}
      />

      {/* Detail --------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.sourceParty} · ${detail.itemName}` : undefined}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              {detail.qcRequired && detail.qcStatus === 'PENDING' && (
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => {
                    update(detail.uid, { qcStatus: 'ACCEPTED', acceptedQty: detail.quantity, status: 'COMPLETED', bin: suggestBin('RM-01') })
                    toast.success('Released to stores', `${detail.docNo} accepted.`)
                    setDetail(null)
                  }}
                >
                  Accept & release
                </Button>
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
              <InvStatusBadge status={detail.qcStatus} size="sm" />
              <Badge tone="neutral" size="sm" dot={false}>{SOURCES.find((s) => s.value === detail.sourceType)?.label}</Badge>
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Source document', value: detail.sourceDocNo, mono: true },
                { label: 'From', value: detail.sourceParty },
                { label: 'Item', value: `${detail.itemCode} — ${detail.itemName}` },
                { label: 'Batch', value: detail.batchNo ?? 'Not batch tracked', mono: true },
                { label: 'Expiry', value: detail.expiresOn ? formatDate(detail.expiresOn) : 'No shelf life' },
                { label: 'Received', value: `${formatQty(detail.quantity)} ${detail.uom}` },
                { label: 'Accepted', value: formatQty(detail.acceptedQty) },
                { label: 'Rejected', value: formatQty(detail.rejectedQty) },
                { label: 'Warehouse', value: detail.warehouse },
                { label: 'Bin', value: detail.bin ?? 'Awaiting put-away' },
                { label: 'Received by', value: detail.receivedBy },
                { label: 'Labels printed', value: String(detail.labelsPrinted) },
                ...(canSeeValue ? [{ label: 'Value', value: formatCurrency(detail.value) }] : []),
              ]}
            />

            <DetailBlock title="Approval">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>

            <p className="text-2xs leading-relaxed text-fg-subtle">
              A receipt can never be deleted. If it was wrong, cancel it (which posts a reversing movement) or correct it with a
              stock adjustment — either way the original stays visible in the ledger.
            </p>
          </div>
        )}
      </Drawer>

      {/* New receipt ---------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New goods receipt"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Post receipt</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Where is it coming from?"
            containerClassName="sm:col-span-2"
            value={form.sourceType}
            onChange={(e) => setForm({ ...form, sourceType: e.target.value as ReceiptSource, qcRequired: e.target.value === 'SALES_RETURN' ? 'yes' : form.qcRequired })}
            hint={SOURCES.find((s) => s.value === form.sourceType)?.hint}
            options={SOURCES.map((s) => ({ value: s.value, label: s.label }))}
          />
          <Input label="Source document no" required value={form.sourceDocNo} error={errors.sourceDocNo} placeholder="P1/GRN/26-27/00352" onChange={(e) => setForm({ ...form, sourceDocNo: e.target.value })} />
          <Input label="Supplier / source" required value={form.sourceParty} error={errors.sourceParty} placeholder="Jindal Stainless Ltd" onChange={(e) => setForm({ ...form, sourceParty: e.target.value })} />
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
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <Select
            label="Receiving warehouse"
            value={form.warehouse}
            onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
            options={warehouseSummaries.filter((w) => !['QTN-01', 'REJ-01', 'TRN-01', 'SUB-01'].includes(w.code)).map((w) => ({ value: w.code, label: `${w.code} — ${w.name}` }))}
          />
          {item?.isBatchTracked && (
            <Input
              label="Batch number"
              required
              value={form.batchNo}
              error={errors.batchNo}
              hint="Generated automatically — overwrite with the supplier's lot if you prefer"
              onChange={(e) => setForm({ ...form, batchNo: e.target.value })}
            />
          )}
          <Input label="Expiry date (shelf-life items)" type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} />
          <Select
            label="Inspection required?"
            value={form.qcRequired}
            onChange={(e) => setForm({ ...form, qcRequired: e.target.value })}
            hint={form.qcRequired === 'yes' ? 'Stock lands in Quarantine Store and cannot be issued yet' : 'Stock becomes available immediately'}
            options={[{ value: 'yes', label: 'Yes — hold in quarantine for QC' }, { value: 'no', label: 'No — release straight to stores' }]}
          />
        </div>

        <div className="mt-4 rounded border border-border bg-surface-2 p-3 text-xs">
          <p className="font-medium text-fg">What will happen when you post</p>
          <ul className="mt-1.5 space-y-1 text-fg-muted">
            <li>• Stock increases by {form.quantity ? formatQty(qty) : '—'} {item?.uom} at {form.qcRequired === 'yes' ? 'Quarantine Store' : warehouseSummaries.find((w) => w.code === form.warehouse)?.name}.</li>
            <li>• {item?.isBatchTracked ? `Batch ${form.batchNo || '(auto)'} is created and carries the traceability from here on.` : 'This item is not batch tracked, so no batch is created.'}</li>
            <li>• {form.qcRequired === 'yes' ? 'Status is QUARANTINE — valued, but invisible to production until QC releases it.' : `Suggested bin ${suggestedBin ?? '—'} (first available bin under 90% full).`}</li>
            {canSeeValue && item && <li>• Stock value increases by {formatCurrency(qty * item.rate)} at {formatCurrency(item.rate)} per {item.uom}.</li>}
          </ul>
        </div>
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Six ways stock comes in" description="Same screen, same ledger — only the source document changes" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SOURCES.map((s) => (
            <div key={s.value} className="rounded border border-border p-3">
              <p className="text-xs font-medium text-fg">{s.label}</p>
              <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{s.hint}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
