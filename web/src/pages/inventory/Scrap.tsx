import { useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
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
import { ApprovalTrail, DetailBlock, InvStatusBadge, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { useCurrentUser } from '@/store/auth'
import { scrapNotes as seedScrap, stockPositions } from '@/mock/inventory'
import type { ScrapNote } from '@/types/inventory'

const SOURCES: { value: ScrapNote['source']; label: string; needsOrder: boolean }[] = [
  { value: 'PRODUCTION_REJECTION', label: 'Production rejection', needsOrder: true },
  { value: 'HANDLING_DAMAGE', label: 'Handling damage', needsOrder: false },
  { value: 'EXPIRY', label: 'Expired material', needsOrder: false },
  { value: 'MACHINE_TRIAL', label: 'Machine trial / setting loss', needsOrder: true },
]

const DEFECTS = ['WELD-POROSITY', 'DRAW-CRACK', 'COAT-PEEL', 'PRINT-SMUDGE', 'DENT-HANDLING', 'VACUUM-FAIL']

/** Scrap & write-off — material leaving stock because it can no longer be used. */
export function ScrapPage() {
  const toast = useToast()
  const user = useCurrentUser()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedScrap, [])
  const { rows: notes, create, update } = useCollection<ScrapNote>('inv:scrap', seed)
  const rowEdit = useRowEdit<ScrapNote>({
    key: 'inv:scrap',
    seed: seed,
    entity: 'Scrap note',
    titleOf: (r) => r.docNo,
  })

  const [detail, setDetail] = useState<ScrapNote | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    source: 'PRODUCTION_REJECTION' as ScrapNote['source'],
    productionOrderNo: 'PRD/2607/0119',
    operation: 'OP-30 Welding',
    defectCode: DEFECTS[0],
    costCentre: 'CC-PRD-02',
    shift: 'Shift A',
    itemCode: 'SF-BODY-750',
    quantity: '',
    orderQty: '5000',
    tolerancePct: '2',
    scrapItem: 'SCR-SS304',
    scrapQty: '',
    nrvRate: '92',
    remarks: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const pending = notes.filter((n) => n.status === 'PENDING_APPROVAL')
  const netCost = notes.filter((n) => n.status === 'POSTED').reduce((s, n) => s + n.bookValue - n.recoveryValue, 0)

  const item = stockPositions.find((p) => p.itemCode === form.itemCode)
  const qty = Number(form.quantity || 0)
  const orderQty = Number(form.orderQty || 0)
  const tolerance = Number(form.tolerancePct || 0)
  const actualPct = orderQty > 0 ? (qty / orderQty) * 100 : 0
  const beyondTolerance = tolerance > 0 && actualPct > tolerance
  const bookValue = item ? qty * item.rate : 0
  const recovery = Number(form.scrapQty || 0) * Number(form.nrvRate || 0)
  const sourceMeta = SOURCES.find((s) => s.value === form.source)!

  const columns: Column<ScrapNote>[] = [
    { key: 'docNo', header: 'Scrap note', sortable: true, width: '12rem', render: (n) => <span className="font-mono text-xs font-medium text-brand-600">{n.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (n) => n.docDate, render: (n) => formatDate(n.docDate) },
    { key: 'source', header: 'Source', sortable: true, width: '11rem', render: (n) => <span className="text-xs">{SOURCES.find((s) => s.value === n.source)?.label ?? n.source}</span> },
    { key: 'itemCode', header: 'Item', sortable: true, render: (n) => <ItemCell code={n.itemCode} name={n.itemName} sub={n.batchNo ?? undefined} /> },
    { key: 'productionOrderNo', header: 'Order', width: '10rem', render: (n) => <span className="font-mono text-2xs">{n.productionOrderNo ?? '—'}</span> },
    { key: 'defectCode', header: 'Defect', width: '11rem', render: (n) => (n.defectCode ? <Badge tone="danger" size="sm" dot={false}>{n.defectCode}</Badge> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'quantity', header: 'Scrapped', align: 'right', sortable: true, render: (n) => <QtyCell qty={n.quantity} uom={n.uom} /> },
    { key: 'scrapQty', header: 'Recovered', align: 'right', render: (n) => (n.scrapQty ? <span className="tabular text-2xs">{formatQty(n.scrapQty)} kg</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'actualPct', header: 'vs tolerance', width: '9rem', accessor: (n) => n.actualPct, render: (n) => (
      n.tolerancePct
        ? <span className={cn('tabular text-2xs', n.actualPct > n.tolerancePct ? 'font-medium text-danger' : 'text-success')}>{n.actualPct.toFixed(1)}% / {n.tolerancePct.toFixed(1)}%</span>
        : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    ...(canSeeValue
      ? [{ key: 'net', header: 'Net cost', align: 'right' as const, sortable: true, accessor: (n: ScrapNote) => n.bookValue - n.recoveryValue, render: (n: ScrapNote) => formatCurrency(n.bookValue - n.recoveryValue) }]
      : []),
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (n) => <InvStatusBadge status={n.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'scrap-register', 'Scrap & write-off register', columnsFromTable(columns), notes)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function save() {
    const e: Record<string, string> = {}
    if (!form.quantity || qty <= 0) e.quantity = 'Enter the quantity being scrapped.'
    if (sourceMeta.needsOrder && !form.productionOrderNo.trim()) e.productionOrderNo = 'Production scrap must name the order it came from.'
    if (form.source === 'PRODUCTION_REJECTION' && !form.defectCode) e.defectCode = 'A defect code connects scrap to quality data instead of leaving it as an unexplained cost.'
    setErrors(e)
    if (Object.keys(e).length || !item) return

    const next = Math.max(...notes.map((n) => Number(n.docNo.slice(-4)) || 0)) + 1
    const docNo = `P1/SCR/26-27/${String(next).padStart(4, '0')}`

    create({
      uid: newUid('sc'),
      docNo,
      docDate: new Date().toISOString().slice(0, 10),
      status: 'PENDING_APPROVAL',
      plant: 'Chennai — Unit 1',
      source: form.source,
      productionOrderNo: sourceMeta.needsOrder ? form.productionOrderNo : null,
      operation: form.operation || undefined,
      defectCode: form.source === 'PRODUCTION_REJECTION' ? form.defectCode : null,
      costCentre: form.costCentre,
      responsibleShift: form.shift,
      itemCode: item.itemCode,
      itemName: item.itemName,
      uom: item.uom,
      batchNo: item.isBatchTracked ? 'FIFO-resolved at posting' : null,
      quantity: qty,
      bookValue,
      scrapItem: form.scrapItem || null,
      scrapQty: Number(form.scrapQty || 0),
      recoveryValue: recovery,
      tolerancePct: tolerance,
      actualPct: Number(actualPct.toFixed(1)),
      remarks: form.remarks || undefined,
      createdBy: user?.fullName ?? 'Current user',
      createdAt: new Date().toISOString(),
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: beyondTolerance
        ? [
            { level: 1, role: 'Production Manager', approver: 'S. Balaji', status: 'PENDING' as const },
            { level: 2, role: 'Factory Head', approver: 'V. Ramanathan', status: 'PENDING' as const },
          ]
        : [{ level: 1, role: 'Production Manager', approver: 'S. Balaji', status: 'PENDING' as const }],
    } as ScrapNote)

    toast.success(
      'Scrap note raised',
      beyondTolerance
        ? `${docNo} — ${actualPct.toFixed(1)}% against a ${tolerance}% tolerance, so it needs the Factory Head as well as the Production Manager.`
        : `${docNo} raised for approval.`,
    )
    setFormOpen(false)
    setForm({ ...form, quantity: '', scrapQty: '', remarks: '' })
  }

  return (
    <div>
      <PageHeader
        title="Scrap & write-off"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Scrap' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setErrors({}); setFormOpen(true) }}>
            New scrap note
          </Button>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        Material that can no longer be used leaves stock here — with the order, the operation and the defect code that caused it,
        so scrap can be analysed instead of merely absorbed.{' '}
        <span className={cn('font-medium', pending.length ? 'text-warning' : 'text-success')}>{pending.length}</span> awaiting
        approval
        {canSeeValue && <> · <span className="font-medium text-fg tabular">{formatCurrency(netCost)}</span> net scrap cost posted</>}.
      </p>

      <DataTable
        rows={notes}
        columns={columns}
        rowKey={(n) => n.uid}
        searchPlaceholder="Search scrap note, order, defect or item…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No scrap notes"
        rowActions={(n) => (
          <>
            {rowEdit.actions(n)}
            <MenuItem label="Open" onClick={() => setDetail(n)} />
            <MenuItem
              label="Approve & post"
              icon={<Check />}
              disabled={n.status !== 'PENDING_APPROVAL'}
              onClick={() => {
                update(n.uid, {
                  status: 'POSTED',
                  approvals: n.approvals.map((a) => (a.status === 'PENDING' ? { ...a, status: 'APPROVED' as const, actedAt: new Date().toISOString(), approver: user?.fullName ?? a.approver } : a)),
                })
                toast.success('Posted', `${formatQty(n.quantity)} ${n.uom} out of stock${n.scrapItem ? `, ${formatQty(n.scrapQty)} kg received into the scrap yard at NRV` : ''}.`)
              }}
            />
            <MenuItem
              label="Reject"
              danger
              disabled={n.status !== 'PENDING_APPROVAL'}
              onClick={() => {
                update(n.uid, { status: 'REJECTED' })
                toast.success('Rejected', `${n.docNo} sent back to ${n.createdBy}.`)
              }}
            />
          </>
        )}
        rowClassName={(n) => cn(n.tolerancePct > 0 && n.actualPct > n.tolerancePct && 'bg-warning/[0.04]')}
      />

      {/* Detail --------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.itemName} · ${SOURCES.find((s) => s.value === detail.source)?.label}` : undefined}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              {detail.status === 'PENDING_APPROVAL' && (
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => {
                    update(detail.uid, { status: 'POSTED' })
                    toast.success('Posted', `${detail.docNo} posted to the ledger.`)
                    setDetail(null)
                  }}
                >
                  Approve & post
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
              {detail.defectCode && <Badge tone="danger" size="sm" dot={false}>{detail.defectCode}</Badge>}
              {detail.tolerancePct > 0 && detail.actualPct > detail.tolerancePct && <Badge tone="warning" size="sm">Beyond tolerance</Badge>}
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Production order', value: detail.productionOrderNo ?? '—', mono: true },
                { label: 'Operation', value: detail.operation ?? '—' },
                { label: 'Cost centre', value: detail.costCentre },
                { label: 'Responsible shift', value: detail.responsibleShift },
                { label: 'Item', value: detail.itemName },
                { label: 'Batch', value: detail.batchNo ?? '—', mono: true },
                { label: 'Quantity scrapped', value: `${formatQty(detail.quantity)} ${detail.uom}` },
                { label: 'Scrap generated', value: detail.scrapItem ? `${formatQty(detail.scrapQty)} kg → ${detail.scrapItem}` : 'None' },
                ...(canSeeValue
                  ? [
                      { label: 'Book value written off', value: formatCurrency(detail.bookValue) },
                      { label: 'Recovered at NRV', value: formatCurrency(detail.recoveryValue) },
                      { label: 'Net cost', value: formatCurrency(detail.bookValue - detail.recoveryValue) },
                    ]
                  : []),
                { label: 'Against tolerance', value: detail.tolerancePct ? `${detail.actualPct.toFixed(1)}% vs ${detail.tolerancePct.toFixed(1)}%` : '—' },
              ]}
            />

            <DetailBlock title="Approval">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>

            <p className="text-2xs leading-relaxed text-fg-subtle">
              Scrap from a production rejection always names the order and the defect code, so the scrap register lines up with
              the quality data instead of appearing as an unexplained line in the cost sheet.
            </p>
          </div>
        )}
      </Drawer>

      {/* New scrap note -------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New scrap note"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Submit for approval</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="What happened?"
            containerClassName="sm:col-span-2"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value as ScrapNote['source'] })}
            options={SOURCES.map((s) => ({ value: s.value, label: s.label }))}
          />
          {sourceMeta.needsOrder && (
            <>
              <Input label="Production order" required value={form.productionOrderNo} error={errors.productionOrderNo} onChange={(e) => setForm({ ...form, productionOrderNo: e.target.value })} />
              <Input label="Operation" value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value })} />
            </>
          )}
          {form.source === 'PRODUCTION_REJECTION' && (
            <Select
              label="Defect code"
              required
              value={form.defectCode}
              error={errors.defectCode}
              onChange={(e) => setForm({ ...form, defectCode: e.target.value })}
              options={DEFECTS.map((d) => ({ value: d, label: d }))}
            />
          )}
          <Select
            label="Responsible shift"
            value={form.shift}
            onChange={(e) => setForm({ ...form, shift: e.target.value })}
            options={['Shift A', 'Shift B', 'Shift C'].map((s) => ({ value: s, label: s }))}
          />
          <Select
            label="Item scrapped"
            containerClassName="sm:col-span-2"
            value={form.itemCode}
            onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
            options={stockPositions.map((p) => ({ value: p.itemCode, label: `${p.itemCode} — ${p.itemName}` }))}
          />
          <Input label={`Quantity${item ? ` (${item.uom})` : ''}`} type="number" required value={form.quantity} error={errors.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <Input label="Order quantity" type="number" value={form.orderQty} hint="Used to work out the scrap percentage" onChange={(e) => setForm({ ...form, orderQty: e.target.value })} />
          <Input label="Tolerance (%)" type="number" value={form.tolerancePct} onChange={(e) => setForm({ ...form, tolerancePct: e.target.value })} />
          <Input label="Scrap item recovered" value={form.scrapItem} hint="Blank if nothing is recovered" onChange={(e) => setForm({ ...form, scrapItem: e.target.value })} />
          <Input label="Scrap weight (kg)" type="number" value={form.scrapQty} onChange={(e) => setForm({ ...form, scrapQty: e.target.value })} />
          <Input label="Scrap rate (₹/kg)" type="number" value={form.nrvRate} onChange={(e) => setForm({ ...form, nrvRate: e.target.value })} />
          <Textarea label="Remarks" containerClassName="sm:col-span-2" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>

        {item && qty > 0 && (
          <div className={cn('mt-4 rounded border p-3 text-xs', beyondTolerance ? 'border-warning/30 bg-warning/5' : 'border-border bg-surface-2')}>
            <ul className="space-y-1 text-fg-muted">
              <li>• {formatQty(qty)} {item.uom} leaves stock ({actualPct.toFixed(1)}% of the order quantity, tolerance {tolerance}%).</li>
              {form.scrapItem && Number(form.scrapQty) > 0 && <li>• {formatQty(Number(form.scrapQty))} kg of {form.scrapItem} is received into the scrap yard in the same posting.</li>}
              {canSeeValue && <li>• Book value {formatCurrency(bookValue)} out, {formatCurrency(recovery)} recovered — net cost {formatCurrency(bookValue - recovery)}.</li>}
              {beyondTolerance && <li className="text-warning">• Beyond tolerance, so approval goes to the Factory Head as well as the Production Manager.</li>}
            </ul>
          </div>
        )}
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
