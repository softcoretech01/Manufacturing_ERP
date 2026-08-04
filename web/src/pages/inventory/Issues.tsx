import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
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
import { useCurrentUser } from '@/store/auth'
import { materialIssues as seedIssues, requisitions as seedRequisitions, stockPositions, warehouseSummaries } from '@/mock/inventory'
import type { MaterialIssue, MaterialRequisition } from '@/types/inventory'

const EMPTY_FORM = {
  chargeType: 'PRODUCTION_ORDER' as MaterialIssue['chargeType'],
  chargeRef: 'PRD/2607/0121',
  requisitionNo: '',
  itemCode: 'RM-SS304-050',
  quantity: '',
  bomStandard: '4200',
  warehouse: 'Raw Material Store',
  issuedTo: '',
  reason: '',
}

/** Goods issue — material leaving the store against an approved demand. */
export function MaterialIssuePage() {
  const toast = useToast()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const canSeeValue = useCanSeeValue()
  const issueSeed = useMemo(() => seedIssues, [])
  const reqSeed = useMemo(() => seedRequisitions, [])
  const { rows: issues, create, update } = useCollection<MaterialIssue>('inv:issue', issueSeed)
  const rowEdit = useRowEdit<MaterialIssue>({
    key: 'inv:issue',
    seed: issueSeed,
    entity: 'Material issue',
    titleOf: (r) => r.docNo,
  })
  const { rows: requisitions } = useCollection<MaterialRequisition>('inv:requisition', reqSeed)

  const [tab, setTab] = useState('all')
  const [detail, setDetail] = useState<MaterialIssue | null>(null)
  const [detailTab, setDetailTab] = useState('lines')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const overIssues = issues.reduce((s, i) => s + i.overIssueCount, 0)
  const today = new Date().toISOString().slice(0, 10)

  const filtered = issues.filter((i) => {
    if (tab === 'today') return i.docDate === today
    if (tab === 'over') return i.overIssueCount > 0
    if (tab === 'unreturned') return i.lines.some((l) => l.quantity - l.returnedQty > 0 && i.chargeType === 'PRODUCTION_ORDER')
    return true
  })

  const item = stockPositions.find((p) => p.itemCode === form.itemCode)
  const qty = Number(form.quantity || 0)
  const standard = Number(form.bomStandard || 0)
  const overPct = standard > 0 ? ((qty - standard) / standard) * 100 : 0
  const isOverIssue = standard > 0 && overPct > 5
  const free = item ? item.available - item.reserved : 0
  const insufficient = qty > free

  const columns: Column<MaterialIssue>[] = [
    { key: 'docNo', header: 'Issue', sortable: true, width: '12rem', render: (i) => <span className="font-mono text-xs font-medium text-brand-600">{i.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (i) => i.docDate, render: (i) => formatDate(i.docDate) },
    { key: 'chargeRef', header: 'Charged to', sortable: true, render: (i) => (
      <div className="min-w-0">
        <p className="truncate font-mono text-2xs text-fg">{i.chargeRef}</p>
        <p className="truncate text-2xs text-fg-subtle">{i.chargeName}{i.operation ? ` · ${i.operation}` : ''}</p>
      </div>
    ) },
    { key: 'requisitionNo', header: 'Requisition', width: '12rem', defaultHidden: true, render: (i) => <span className="font-mono text-2xs">{i.requisitionNo ?? '—'}</span> },
    { key: 'fromWarehouse', header: 'From', sortable: true, defaultHidden: true },
    { key: 'issuedTo', header: 'Issued to', sortable: true },
    { key: 'lines', header: 'Lines', align: 'right', width: '5rem', accessor: (i) => i.lines.length, render: (i) => i.lines.length },
    { key: 'totalQty', header: 'Quantity', align: 'right', sortable: true, render: (i) => <QtyCell qty={i.totalQty} /> },
    { key: 'returned', header: 'Returned', align: 'right', width: '7rem', accessor: (i) => i.lines.reduce((s, l) => s + l.returnedQty, 0), render: (i) => {
      const r = i.lines.reduce((s, l) => s + l.returnedQty, 0)
      return r ? <QtyCell qty={r} tone="success" /> : <span className="text-2xs text-fg-subtle">—</span>
    } },
    { key: 'overIssueCount', header: 'Over-issue', align: 'center', width: '7rem', sortable: true, render: (i) => (i.overIssueCount ? <Badge tone="warning" size="sm">{i.overIssueCount}</Badge> : <span className="text-2xs text-fg-subtle">—</span>) },
    ...(canSeeValue ? [{ key: 'totalValue', header: 'Value', align: 'right' as const, sortable: true, render: (i: MaterialIssue) => formatCurrency(i.totalValue) }] : []),
    { key: 'status', header: 'Status', sortable: true, width: '9rem', render: (i) => <InvStatusBadge status={i.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'material-issues', 'Material issue register', columnsFromTable(columns), filtered)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function postIssue() {
    const e: Record<string, string> = {}
    if (!form.quantity || qty <= 0) e.quantity = 'Enter a quantity greater than zero.'
    if (!form.issuedTo.trim()) e.issuedTo = 'Record who is taking custody of the material.'
    if (insufficient) e.quantity = `Only ${formatQty(free)} ${item?.uom} is free — issuing more is refused.`
    if (isOverIssue && !form.reason.trim()) e.reason = 'Over-issue beyond the 5% tolerance needs a reason; it is reported the same day.'
    setErrors(e)
    if (Object.keys(e).length || !item) return

    const next = Math.max(...issues.map((i) => Number(i.docNo.slice(-6)) || 0)) + 1
    const docNo = `P1/MI/26-27/${String(next).padStart(6, '0')}`
    create({
      uid: newUid('mi'),
      docNo,
      docDate: today,
      status: 'ISSUED',
      plant: 'Chennai — Unit 1',
      chargeType: form.chargeType,
      chargeRef: form.chargeRef,
      chargeName: form.chargeType === 'PRODUCTION_ORDER' ? 'Production order issue' : form.chargeType === 'SAMPLE' ? 'Sample / free issue' : 'Cost centre consumption',
      costCentre: 'CC-PRD-01',
      requisitionNo: form.requisitionNo || null,
      issuedTo: form.issuedTo.trim(),
      fromWarehouse: form.warehouse,
      shift: 'A',
      totalQty: qty,
      totalValue: qty * item.rate,
      overIssueCount: isOverIssue ? 1 : 0,
      createdBy: user?.fullName ?? form.issuedTo.trim(),
      createdAt: new Date().toISOString(),
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: [{ level: 1, role: 'Shift Supervisor', approver: 'N. Selvam', status: 'APPROVED', actedAt: new Date().toISOString() }],
      lines: [
        {
          uid: newUid('mil'),
          itemCode: item.itemCode,
          itemName: item.itemName,
          uom: item.uom,
          bomStandardQty: standard || null,
          alreadyIssued: 0,
          quantity: qty,
          bin: null,
          batchNo: item.isBatchTracked ? 'FIFO-resolved at posting' : null,
          rate: item.rate,
          value: qty * item.rate,
          returnedQty: 0,
          overIssueReason: isOverIssue ? form.reason.trim() : undefined,
          strategy: item.itemClass === 'CONSUMABLE' ? 'FEFO' : 'FIFO',
        },
      ],
    } as MaterialIssue)

    toast.success(
      'Issue posted',
      isOverIssue
        ? `${docNo} posted with an over-issue of ${overPct.toFixed(1)}% — it appears on today's exception report.`
        : `${docNo} posted; ${formatQty(qty)} ${item.uom} left ${form.warehouse}.`,
    )
    setFormOpen(false)
    setForm(EMPTY_FORM)
  }

  const approvedRequisitions = requisitions.filter((r) => r.status === 'APPROVED')

  return (
    <div>
      <PageHeader
        title="Goods issue"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Goods issue' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/inventory/requisitions')}>
              Requisitions
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setForm(EMPTY_FORM); setErrors({}); setFormOpen(true) }}>
              New issue
            </Button>
          </>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'All', count: issues.length },
              { id: 'today', label: 'Today', count: issues.filter((i) => i.docDate === today).length },
              { id: 'over', label: 'Over-issues', count: issues.filter((i) => i.overIssueCount > 0).length },
              { id: 'unreturned', label: 'Unreturned balance', count: issues.filter((i) => i.chargeType === 'PRODUCTION_ORDER' && i.lines.some((l) => l.quantity - l.returnedQty > 0)).length },
            ]}
          />
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        Nothing leaves the store without a document. Stock is checked at the moment of posting — if it is not free, the issue is
        refused rather than driving the balance negative.{' '}
        <span className={cn('font-medium', overIssues ? 'text-warning' : 'text-success')}>{overIssues}</span> line
        {overIssues === 1 ? '' : 's'} exceeded the BOM standard beyond tolerance.
      </p>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(i) => i.uid}
        searchPlaceholder="Search issue, production order, item or person…"
        onExport={doExport}
        onRowClick={(i) => { setDetail(i); setDetailTab('lines') }}
        emptyTitle="No issues"
        emptyDescription="Post an issue to move material from the store to a production order or a cost centre."
        rowActions={(i) => (
          <>
            {rowEdit.actions(i)}
            <MenuItem label="Open" onClick={() => { setDetail(i); setDetailTab('lines') }} />
            <MenuItem label="Return material against this issue" onClick={() => navigate('/inventory/returns')} />
            <MenuItem
              label="Print pick list"
              onClick={() => {
                try {
                  exportRows('pdf', `pick-list-${i.docNo.replace(/\W/g, '-')}`, `Pick list — ${i.docNo}`, [
                    { header: 'Item', value: (l: MaterialIssue['lines'][number]) => `${l.itemCode} — ${l.itemName}` },
                    { header: 'Bin', value: (l) => l.bin ?? 'resolved at picking' },
                    { header: 'Batch', value: (l) => l.batchNo ?? '—' },
                    { header: 'Quantity', value: (l) => `${formatQty(l.quantity)} ${l.uom}` },
                    { header: 'Strategy', value: (l) => l.strategy },
                  ], i.lines)
                  toast.success('Pick list ready', `${i.docNo} — ${i.lines.length} line(s) in bin walk order.`)
                } catch (err) {
                  toast.error('Print failed', err instanceof Error ? err.message : 'Unknown error.')
                }
              }}
            />
            <MenuItem
              label="Cancel"
              icon={<X />}
              danger
              separatorBefore
              disabled={i.status === 'ISSUED'}
              onClick={() => {
                update(i.uid, { status: 'CANCELLED' })
                toast.success('Cancelled', `${i.docNo} cancelled before posting. A posted issue is corrected by a return, never by cancellation.`)
              }}
            />
          </>
        )}
        rowClassName={(i) => cn(i.overIssueCount > 0 && 'bg-warning/[0.04]')}
      />

      {/* Detail --------------------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.chargeRef} · ${detail.chargeName}` : undefined}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/inventory/returns')}>Return material</Button>
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <InvStatusBadge status={detail.status} />
              <Badge tone="neutral" size="sm" dot={false}>{detail.chargeType.replace(/_/g, ' ').toLowerCase()}</Badge>
              {detail.overIssueCount > 0 && <Badge tone="warning" size="sm">{detail.overIssueCount} over-issue</Badge>}
            </div>

            <Tabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'lines', label: 'Lines', count: detail.lines.length },
                { id: 'header', label: 'Header' },
                { id: 'approval', label: 'Approval' },
              ]}
            />

            {detailTab === 'lines' && (
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">BOM std</th>
                      <th className="text-right">Issued</th>
                      <th className="text-right">Returned</th>
                      <th className="text-right">Net used</th>
                      <th>Bin · batch</th>
                      <th>Rule</th>
                      {canSeeValue && <th className="text-right">Value</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => {
                      const over = l.bomStandardQty ? ((l.quantity - l.bomStandardQty) / l.bomStandardQty) * 100 : 0
                      return (
                        <tr key={l.uid} className={l.overIssueReason ? 'bg-warning/[0.05]' : undefined}>
                          <td>
                            <p className="text-xs font-medium text-fg">{l.itemName}</p>
                            <p className="font-mono text-2xs text-fg-subtle">{l.itemCode}</p>
                            {l.overIssueReason && <p className="mt-0.5 text-2xs text-warning">Over-issue {over.toFixed(1)}% — {l.overIssueReason}</p>}
                          </td>
                          <td className="text-right tabular text-fg-muted">{l.bomStandardQty ? formatQty(l.bomStandardQty) : '—'}</td>
                          <td className="text-right tabular font-medium">{formatQty(l.quantity)} {l.uom}</td>
                          <td className="text-right tabular text-success">{l.returnedQty ? formatQty(l.returnedQty) : '—'}</td>
                          <td className="text-right tabular">{formatQty(l.quantity - l.returnedQty)}</td>
                          <td className="font-mono text-2xs">{l.bin ?? '—'}{l.batchNo ? ` · ${l.batchNo}` : ''}</td>
                          <td className="text-2xs">{l.strategy}{l.fefoOverride && <span className="ml-1 text-danger">override</span>}</td>
                          {canSeeValue && <td className="text-right tabular">{formatCurrency(l.value)}</td>}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'header' && (
              <DataGrid
                columns={2}
                items={[
                  { label: 'Charged to', value: `${detail.chargeRef} · ${detail.chargeName}` },
                  { label: 'Operation', value: detail.operation ?? '—' },
                  { label: 'Cost centre', value: detail.costCentre },
                  { label: 'Requisition', value: detail.requisitionNo ?? 'None (exempt type)', mono: true },
                  { label: 'From warehouse', value: detail.fromWarehouse },
                  { label: 'Issued to', value: detail.issuedTo },
                  { label: 'Shift', value: detail.shift },
                  { label: 'Total quantity', value: formatQty(detail.totalQty) },
                  ...(canSeeValue ? [{ label: 'Total value', value: formatCurrency(detail.totalValue) }] : []),
                  { label: 'Posted by', value: detail.createdBy },
                ]}
              />
            )}

            {detailTab === 'approval' && (
              <div className="space-y-4">
                <ApprovalTrail steps={detail.approvals} />
                <DetailBlock title="Why this cannot be edited">
                  <p className="text-xs text-fg-muted">
                    A posted issue has already moved stock and cost. Corrections are a material return or an adjustment, each
                    with its own reason and trail — editing the original would rewrite consumption history.
                  </p>
                </DetailBlock>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* New issue ------------------------------------------------------------ */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New material issue"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={postIssue} disabled={insufficient}>Post issue</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Charge to"
            value={form.chargeType}
            onChange={(e) => setForm({ ...form, chargeType: e.target.value as MaterialIssue['chargeType'] })}
            options={[
              { value: 'PRODUCTION_ORDER', label: 'Production order' },
              { value: 'COST_CENTRE', label: 'Cost centre / expense' },
              { value: 'SAMPLE', label: 'Sample / free issue' },
            ]}
          />
          <Input label="Reference" value={form.chargeRef} onChange={(e) => setForm({ ...form, chargeRef: e.target.value })} hint="Production order or cost centre" />
          <Select
            label="Against requisition"
            containerClassName="sm:col-span-2"
            value={form.requisitionNo}
            onChange={(e) => {
              const r = approvedRequisitions.find((x) => x.docNo === e.target.value)
              setForm({
                ...form,
                requisitionNo: e.target.value,
                itemCode: r?.lines[0]?.itemCode ?? form.itemCode,
                quantity: r?.lines[0] ? String(r.lines[0].quantity - r.lines[0].issuedQty) : form.quantity,
                bomStandard: r?.lines[0]?.bomStandardQty ? String(r.lines[0].bomStandardQty) : form.bomStandard,
                chargeRef: r?.productionOrderNo ?? form.chargeRef,
                issuedTo: r?.requestedBy ?? form.issuedTo,
              })
            }}
            hint="Pick an approved requisition to fill the lines automatically"
            options={[{ value: '', label: 'None — direct issue' }, ...approvedRequisitions.map((r) => ({ value: r.docNo, label: `${r.docNo} — ${r.department} (${r.requestedBy})` }))]}
          />
          <Select
            label="Item"
            containerClassName="sm:col-span-2"
            value={form.itemCode}
            onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
            options={stockPositions.map((p) => ({ value: p.itemCode, label: `${p.itemCode} — ${p.itemName}` }))}
          />
          <Select
            label="From warehouse"
            value={form.warehouse}
            onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
            options={warehouseSummaries.filter((w) => w.includeInAtp).map((w) => ({ value: w.name, label: `${w.code} — ${w.name}` }))}
          />
          <Input label="Issued to" required value={form.issuedTo} error={errors.issuedTo} placeholder="T. Ganesh" onChange={(e) => setForm({ ...form, issuedTo: e.target.value })} />
          <Input label="BOM standard quantity" type="number" value={form.bomStandard} hint="Blank for non-order issues" onChange={(e) => setForm({ ...form, bomStandard: e.target.value })} />
          <Input
            label={`Quantity${item ? ` (${item.uom})` : ''}`}
            type="number"
            required
            value={form.quantity}
            error={errors.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          {isOverIssue && (
            <Textarea
              label="Over-issue reason (required)"
              containerClassName="sm:col-span-2"
              rows={2}
              value={form.reason}
              error={errors.reason}
              placeholder="Trial run, rework, setting loss…"
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          )}
        </div>

        {item && (
          <div className={cn('mt-4 rounded border p-3', insufficient ? 'border-danger/30 bg-danger/5' : 'border-border bg-surface-2')}>
            <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">Live position</p>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
              <p className="text-fg-muted">On hand <span className="block font-medium tabular text-fg">{formatQty(item.onHand)}</span></p>
              <p className="text-fg-muted">Free <span className={cn('block font-medium tabular', insufficient ? 'text-danger' : 'text-success')}>{formatQty(free)}</span></p>
              <p className="text-fg-muted">Reserved <span className="block font-medium tabular text-fg">{formatQty(item.reserved)}</span></p>
              <p className="text-fg-muted">Picking rule <span className="block font-medium text-fg">{item.itemClass === 'CONSUMABLE' ? 'FEFO — earliest expiry' : 'FIFO — oldest batch'}</span></p>
            </div>
            {insufficient && (
              <p className="mt-2 text-xs text-danger">
                Free stock is {formatQty(free)} {item.uom}. Issuing more is refused — release a reservation or receive stock first.
              </p>
            )}
            {isOverIssue && !insufficient && (
              <p className="mt-2 text-xs text-warning">
                Exceeds the BOM standard by {overPct.toFixed(1)}% (tolerance 5%). Posting needs a reason and appears on the
                over-issue exception report.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Consumption against standard" description="Issued minus returned, against the BOM standard for open orders" />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {issues
            .filter((i) => i.chargeType === 'PRODUCTION_ORDER')
            .slice(0, 3)
            .map((i) => {
              const std = i.lines.reduce((s, l) => s + (l.bomStandardQty ?? 0), 0)
              const actual = i.lines.reduce((s, l) => s + l.quantity - l.returnedQty, 0)
              const variance = std ? ((actual - std) / std) * 100 : 0
              return (
                <div key={i.uid} className="rounded border border-border p-3">
                  <p className="font-mono text-2xs text-brand-600">{i.chargeRef}</p>
                  <p className="mt-1 truncate text-xs text-fg">{i.chargeName}</p>
                  <p className="mt-1.5 text-lg font-semibold tabular text-fg">
                    {formatQty(actual)}
                    <span className="text-xs font-normal text-fg-subtle"> / {formatQty(std)} std</span>
                  </p>
                  <p className={cn('mt-0.5 text-2xs', variance > 5 ? 'text-danger' : variance > 0 ? 'text-warning' : 'text-success')}>
                    {variance >= 0 ? '+' : ''}{variance.toFixed(1)}% against standard
                  </p>
                </div>
              )
            })}
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
