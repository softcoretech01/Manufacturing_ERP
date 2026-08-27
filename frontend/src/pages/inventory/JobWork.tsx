import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader, ProgressBar } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { ApprovalTrail, DetailBlock, InvStatusBadge, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCompact, formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { jobworkChallans as seedChallans, stockPositions } from '@/mock/inventory'
import type { JobworkChallan } from '@/types/inventory'

const daysTo = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)

/**
 * Job-work stock — our material sitting at a subcontractor. It is still company
 * stock: valued, counted, and reconciled challan by challan against the
 * statutory return window.
 */
export function JobWorkPage() {
  const toast = useToast()
  const canSeeValue = useCanSeeValue()
  const seed = useMemo(() => seedChallans, [])
  const { rows: challans, create, update } = useCollection<JobworkChallan>('inv:jobwork', seed)
  const rowEdit = useRowEdit<JobworkChallan>({
    key: 'inv:jobwork',
    seed: seed,
    entity: 'Job-work challan',
    titleOf: (r) => r.docNo,
  })

  const [detail, setDetail] = useState<JobworkChallan | null>(null)
  const [receiveDoc, setReceiveDoc] = useState<JobworkChallan | null>(null)
  const [receive, setReceive] = useState({ good: '', scrap: '', reason: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ vendor: 'Coat Tech Industries', subcontractPoNo: '', process: 'Powder coating — Matte Black', itemCode: 'SF-BODY-750', quantity: '', lossPct: '2', expectedReturnOn: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const open = challans.filter((c) => c.balanceQty > 0)
  const atVendor = open.reduce((s, c) => s + c.value, 0)
  const atRisk = open.filter((c) => daysTo(c.statutoryDueOn) < 60)

  const columns: Column<JobworkChallan>[] = [
    { key: 'docNo', header: 'Challan', sortable: true, width: '12rem', render: (c) => <span className="font-mono text-xs font-medium text-brand-600">{c.docNo}</span> },
    { key: 'docDate', header: 'Issued', sortable: true, width: '7rem', accessor: (c) => c.docDate, render: (c) => formatDate(c.docDate) },
    { key: 'vendor', header: 'Job worker', sortable: true },
    { key: 'process', header: 'Process', sortable: true },
    { key: 'itemCode', header: 'Item', render: (c) => <ItemCell code={c.itemCode} name={c.itemName} sub={c.batchNo ?? undefined} /> },
    { key: 'issuedQty', header: 'Sent', align: 'right', sortable: true, render: (c) => <QtyCell qty={c.issuedQty} uom={c.uom} /> },
    { key: 'returnedQty', header: 'Back', align: 'right', render: (c) => <QtyCell qty={c.returnedQty} tone="success" /> },
    { key: 'scrapReturnedQty', header: 'Scrap back', align: 'right', defaultHidden: true, render: (c) => <QtyCell qty={c.scrapReturnedQty} tone="muted" /> },
    { key: 'balanceQty', header: 'Still there', align: 'right', sortable: true, render: (c) => <QtyCell qty={c.balanceQty} tone={c.balanceQty > 0 ? 'danger' : 'muted'} /> },
    { key: 'loss', header: 'Loss vs agreed', width: '9rem', accessor: (c) => c.actualLossPct, render: (c) => (
      <span className={cn('tabular text-2xs', c.actualLossPct > c.agreedLossPct ? 'font-medium text-danger' : 'text-fg-muted')}>
        {c.actualLossPct.toFixed(1)}% / {c.agreedLossPct.toFixed(1)}%
      </span>
    ) },
    { key: 'daysOutstanding', header: 'Days out', align: 'right', width: '7rem', sortable: true, render: (c) => (
      <span className={cn('tabular text-2xs', c.daysOutstanding > 90 ? 'text-warning' : 'text-fg-muted')}>{c.daysOutstanding} d</span>
    ) },
    { key: 'statutoryDueOn', header: 'Statutory window', width: '11rem', sortable: true, accessor: (c) => c.statutoryDueOn, render: (c) => {
      const d = daysTo(c.statutoryDueOn)
      return (
        <span className={cn('tabular text-2xs', d < 30 ? 'font-medium text-danger' : d < 90 ? 'text-warning' : 'text-fg-muted')}>
          {formatDate(c.statutoryDueOn)} · {d} d left
        </span>
      )
    } },
    ...(canSeeValue ? [{ key: 'value', header: 'Value at vendor', align: 'right' as const, sortable: true, render: (c: JobworkChallan) => formatCurrency(c.value) }] : []),
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (c) => <InvStatusBadge status={c.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'jobwork-reconciliation', 'Job-work challan reconciliation', columnsFromTable(columns), challans)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function postReceipt() {
    if (!receiveDoc) return
    const good = Number(receive.good || 0)
    const scrap = Number(receive.scrap || 0)
    if (good <= 0) {
      toast.error('Nothing to receive', 'Enter the quantity coming back.')
      return
    }
    if (good + scrap > receiveDoc.balanceQty) {
      toast.error('More than is out there', `Only ${formatQty(receiveDoc.balanceQty)} ${receiveDoc.uom} is still at ${receiveDoc.vendor}. Material cannot be created at a vendor.`)
      return
    }
    const returnedQty = receiveDoc.returnedQty + good
    const scrapQty = receiveDoc.scrapReturnedQty + scrap
    const balance = receiveDoc.issuedQty - returnedQty - scrapQty
    const actualLossPct = ((receiveDoc.issuedQty - returnedQty) / receiveDoc.issuedQty) * 100
    const beyondTolerance = actualLossPct > receiveDoc.agreedLossPct

    if (beyondTolerance && !receive.reason.trim()) {
      toast.error('Loss beyond the agreed tolerance', `Actual loss ${actualLossPct.toFixed(1)}% against ${receiveDoc.agreedLossPct}% agreed — explain the difference before posting.`)
      return
    }

    update(receiveDoc.uid, {
      returnedQty,
      scrapReturnedQty: scrapQty,
      balanceQty: balance,
      actualLossPct: Number(actualLossPct.toFixed(1)),
      status: balance <= 0 ? 'COMPLETED' : 'IN_PROGRESS',
      remarks: beyondTolerance ? `Loss ${actualLossPct.toFixed(1)}% against ${receiveDoc.agreedLossPct}% agreed — ${receive.reason.trim()}` : receiveDoc.remarks,
    })
    toast.success(
      balance <= 0 ? 'Challan closed' : 'Partial receipt posted',
      `${formatQty(good)} ${receiveDoc.uom} back into stock${scrap ? `, ${formatQty(scrap)} as scrap` : ''}. ${balance > 0 ? `${formatQty(balance)} still at ${receiveDoc.vendor}.` : 'Nothing outstanding.'}`,
    )
    setReceiveDoc(null)
    setReceive({ good: '', scrap: '', reason: '' })
  }

  function save() {
    const e: Record<string, string> = {}
    const qty = Number(form.quantity || 0)
    if (!form.subcontractPoNo.trim()) e.subcontractPoNo = 'Which subcontract purchase order covers this?'
    if (!form.quantity || qty <= 0) e.quantity = 'Enter a quantity greater than zero.'
    if (!form.expectedReturnOn) e.expectedReturnOn = 'When should it come back?'
    setErrors(e)
    if (Object.keys(e).length) return

    const item = stockPositions.find((p) => p.itemCode === form.itemCode)!
    const loss = Number(form.lossPct || 0)
    const next = Math.max(...challans.map((c) => Number(c.docNo.slice(-4)) || 0)) + 1
    const docNo = `P1/JW/26-27/${String(next).padStart(4, '0')}`

    create({
      uid: newUid('jw'),
      docNo,
      docDate: new Date().toISOString().slice(0, 10),
      status: 'IN_PROGRESS',
      plant: 'Chennai — Unit 1',
      vendor: form.vendor,
      subcontractPoNo: form.subcontractPoNo.trim(),
      process: form.process,
      itemCode: item.itemCode,
      itemName: item.itemName,
      uom: item.uom,
      batchNo: item.isBatchTracked ? 'FIFO-resolved at issue' : null,
      issuedQty: qty,
      expectedReturnQty: Math.round(qty * (1 - loss / 100)),
      returnedQty: 0,
      scrapReturnedQty: 0,
      balanceQty: qty,
      agreedLossPct: loss,
      actualLossPct: 0,
      expectedReturnOn: form.expectedReturnOn,
      statutoryDueOn: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
      daysOutstanding: 0,
      value: qty * item.rate,
      createdBy: 'M. Devi',
      createdAt: new Date().toISOString(),
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: new Date().toISOString() }],
    } as JobworkChallan)

    toast.success(
      'Challan issued',
      `${docNo} — ${formatQty(qty)} ${item.uom} sent to ${form.vendor}. Expected back: ${formatQty(Math.round(qty * (1 - loss / 100)))} after ${loss}% agreed loss. Statutory window closes in 365 days.`,
    )
    setFormOpen(false)
    setForm({ ...form, subcontractPoNo: '', quantity: '' })
  }

  return (
    <div>
      <PageHeader
        title="Job-work stock"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Job work' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setErrors({}); setFormOpen(true) }}>
            Issue to job worker
          </Button>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        Material at a subcontractor is still ours — valued, counted and reconciled challan by challan.{' '}
        <span className="font-medium text-fg">{open.length}</span> open challan{open.length === 1 ? '' : 's'}
        {canSeeValue && <> holding <span className="font-medium text-fg tabular">₹{formatCompact(atVendor)}</span></>} ·{' '}
        <span className={cn('font-medium', atRisk.length ? 'text-danger' : 'text-success')}>{atRisk.length}</span> within 60 days
        of the statutory return window.
      </p>

      <DataTable
        rows={challans}
        columns={columns}
        rowKey={(c) => c.uid}
        searchPlaceholder="Search challan, vendor, process or item…"
        onExport={doExport}
        onRowClick={setDetail}
        emptyTitle="No job-work challans"
        rowActions={(c) => (
          <>
            {rowEdit.actions(c)}
            <MenuItem label="Open reconciliation" onClick={() => setDetail(c)} />
            <MenuItem
              label="Receive against this challan"
              disabled={c.balanceQty === 0}
              onClick={() => {
                setReceiveDoc(c)
                setReceive({ good: String(c.balanceQty), scrap: '', reason: '' })
              }}
            />
            <MenuItem
              label="Follow up with the vendor"
              onClick={() => toast.success('Reminder sent', `${c.vendor} chased for ${formatQty(c.balanceQty)} ${c.uom} outstanding ${c.daysOutstanding} days.`)}
            />
            <MenuItem label="Export ITC-04 extract" separatorBefore onClick={() => doExport('xlsx')} />
          </>
        )}
        rowClassName={(c) => cn(c.balanceQty > 0 && daysTo(c.statutoryDueOn) < 60 && 'bg-danger/[0.04]', c.actualLossPct > c.agreedLossPct && 'bg-warning/[0.03]')}
      />

      {/* Detail --------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.vendor} · ${detail.process}` : undefined}
        width="max-w-3xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              {detail.balanceQty > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setReceiveDoc(detail)
                    setReceive({ good: String(detail.balanceQty), scrap: '', reason: '' })
                    setDetail(null)
                  }}
                >
                  Receive
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
              {detail.actualLossPct > detail.agreedLossPct && (
                <Badge tone="danger" size="sm">Loss {detail.actualLossPct.toFixed(1)}% vs {detail.agreedLossPct.toFixed(1)}% agreed</Badge>
              )}
              {daysTo(detail.statutoryDueOn) < 60 && detail.balanceQty > 0 && (
                <Badge tone="danger" size="sm">Statutory window closes in {daysTo(detail.statutoryDueOn)} days</Badge>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-fg-muted">Returned against sent</span>
                <span className="tabular text-fg">{formatQty(detail.returnedQty)} / {formatQty(detail.issuedQty)} {detail.uom}</span>
              </div>
              <ProgressBar value={(detail.returnedQty / detail.issuedQty) * 100} tone={detail.balanceQty > 0 ? 'warning' : 'success'} height="h-2" showLabel />
            </div>

            <DataGrid
              columns={2}
              items={[
                { label: 'Subcontract PO', value: detail.subcontractPoNo, mono: true },
                { label: 'Item', value: detail.itemName },
                { label: 'Batch', value: detail.batchNo ?? '—', mono: true },
                { label: 'Sent', value: `${formatQty(detail.issuedQty)} ${detail.uom}` },
                { label: 'Expected back', value: `${formatQty(detail.expectedReturnQty)} (after ${detail.agreedLossPct}% agreed loss)` },
                { label: 'Received good', value: formatQty(detail.returnedQty) },
                { label: 'Scrap returned', value: formatQty(detail.scrapReturnedQty) },
                { label: 'Still at vendor', value: `${formatQty(detail.balanceQty)} ${detail.uom}` },
                { label: 'Expected return date', value: formatDate(detail.expectedReturnOn) },
                { label: 'Statutory window closes', value: `${formatDate(detail.statutoryDueOn)} (${daysTo(detail.statutoryDueOn)} days)` },
                { label: 'Days outstanding', value: `${detail.daysOutstanding} days` },
                ...(canSeeValue ? [{ label: 'Value at vendor', value: formatCurrency(detail.value) }] : []),
              ]}
            />

            {detail.remarks && <div className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">{detail.remarks}</div>}

            <DetailBlock title="Approval">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>
          </div>
        )}
      </Drawer>

      {/* Receive -------------------------------------------------------------- */}
      <Modal
        open={!!receiveDoc}
        onClose={() => setReceiveDoc(null)}
        title={receiveDoc ? `Receive from ${receiveDoc.vendor}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setReceiveDoc(null)}>Cancel</Button>
            <Button variant="primary" onClick={postReceipt}>Post receipt</Button>
          </>
        }
      >
        {receiveDoc && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              {receiveDoc.docNo} · <span className="font-medium text-fg">{receiveDoc.itemName}</span> · sent{' '}
              {formatQty(receiveDoc.issuedQty)} {receiveDoc.uom}, still at the vendor {formatQty(receiveDoc.balanceQty)}.
            </p>
            <Input label={`Good quantity received (${receiveDoc.uom})`} type="number" value={receive.good} onChange={(e) => setReceive({ ...receive, good: e.target.value })} />
            <Input label="Scrap returned" type="number" value={receive.scrap} hint="Received into the scrap yard at net realisable value" onChange={(e) => setReceive({ ...receive, scrap: e.target.value })} />
            <Textarea
              label="Explain any loss beyond the agreed tolerance"
              rows={2}
              value={receive.reason}
              onChange={(e) => setReceive({ ...receive, reason: e.target.value })}
              hint={`Agreed process loss is ${receiveDoc.agreedLossPct}%`}
            />
            <div className="rounded border border-border bg-surface-2 p-3 text-2xs text-fg-muted">
              Receiving more than was sent is refused — material cannot be created at a vendor. Anything not returned stays on
              this challan and ages against the Section 143 window.
            </div>
          </div>
        )}
      </Modal>

      {/* Issue to job worker --------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Issue material to a job worker"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save}>Issue on challan</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Job worker"
            value={form.vendor}
            onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            options={['Coat Tech Industries', 'Precision Print Works', 'Sundar Metal Forms'].map((v) => ({ value: v, label: v }))}
          />
          <Input label="Subcontract PO" required value={form.subcontractPoNo} error={errors.subcontractPoNo} placeholder="PO/26-27/00214" onChange={(e) => setForm({ ...form, subcontractPoNo: e.target.value })} />
          <Input label="Process" containerClassName="sm:col-span-2" value={form.process} onChange={(e) => setForm({ ...form, process: e.target.value })} />
          <Select
            label="Item"
            containerClassName="sm:col-span-2"
            value={form.itemCode}
            onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
            options={stockPositions.map((p) => ({ value: p.itemCode, label: `${p.itemCode} — ${p.itemName}` }))}
          />
          <Input label="Quantity to send" type="number" required value={form.quantity} error={errors.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <Input label="Agreed process loss (%)" type="number" value={form.lossPct} hint="Anything lost beyond this needs an explanation on return" onChange={(e) => setForm({ ...form, lossPct: e.target.value })} />
          <Input label="Expected return date" type="date" required value={form.expectedReturnOn} error={errors.expectedReturnOn} onChange={(e) => setForm({ ...form, expectedReturnOn: e.target.value })} />
        </div>
        <p className="mt-3 text-2xs text-fg-subtle">
          The stock moves to the vendor's location — it stays ours and stays valued. A statutory challan number is allocated and
          the 365-day return window starts today.
        </p>
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
