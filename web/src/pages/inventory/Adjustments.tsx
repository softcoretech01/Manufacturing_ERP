import { useMemo, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
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
import { ApprovalTrail, DetailBlock, InvStatusBadge, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { useCurrentUser } from '@/store/auth'
import { adjustments as seedAdjustments, stockBalances, warehouseSummaries } from '@/mock/inventory'
import type { StockAdjustment } from '@/types/inventory'

const REASONS = [
  'Weighment difference',
  'Measurement error',
  'Data entry error',
  'Pilferage',
  'Spillage',
  'Evaporation',
  'Damage in handling',
  'Receipt error',
  'Issue error',
  'System migration',
]

/** Approval bands seeded from Ch 11 §11.5 — placeholders until the client confirms. */
function approvalRoute(value: number): string[] {
  const abs = Math.abs(value)
  if (abs <= 10_000) return ['Stores In-charge']
  if (abs <= 100_000) return ['Stores In-charge', 'Materials Manager']
  if (abs <= 500_000) return ['Stores In-charge', 'Materials Manager', 'Factory Head', 'Finance (parallel)']
  return ['Stores In-charge', 'Materials Manager', 'Factory Head', 'Finance (parallel)', 'Director']
}

export function AdjustmentsPage() {
  const toast = useToast()
  const user = useCurrentUser()
  const canSeeValue = useCanSeeValue()
  const adjSeed = useMemo(() => seedAdjustments, [])
  const { rows: adjustments, create, update } = useCollection<StockAdjustment>('inv:adjustment', adjSeed)
  const rowEdit = useRowEdit<StockAdjustment>({
    key: 'inv:adjustment',
    seed: adjSeed,
    entity: 'Adjustment',
    titleOf: (r) => r.docNo,
  })

  const [detail, setDetail] = useState<StockAdjustment | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    category: 'QUANTITY_CORRECTION',
    warehouse: 'Raw Material Store',
    balanceUid: stockBalances[0]?.uid ?? '',
    physicalQty: '',
    reason: REASONS[0],
    note: '',
    reference: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const stats = {
    pending: adjustments.filter((a) => a.status === 'PENDING_APPROVAL').length,
    postedValue: adjustments.filter((a) => a.status === 'POSTED').reduce((s, a) => s + Math.abs(a.netValueImpact), 0),
    pilferage: adjustments.filter((a) => a.category === 'PILFERAGE').length,
    ratio: 0.28,
  }

  const selectedBalance = stockBalances.find((b) => b.uid === form.balanceUid)
  const physical = Number(form.physicalQty || 0)
  const delta = selectedBalance ? physical - selectedBalance.quantity : 0
  const valueImpact = selectedBalance ? delta * selectedBalance.rate : 0

  const adjColumns: Column<StockAdjustment>[] = [
    { key: 'docNo', header: 'Adjustment', sortable: true, width: '11rem', render: (a) => <span className="font-mono text-xs font-medium text-brand-600">{a.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (a) => a.docDate, render: (a) => formatDate(a.docDate) },
    { key: 'category', header: 'Category', sortable: true, width: '11rem', render: (a) => (
      <Badge tone={a.category === 'PILFERAGE' ? 'danger' : a.category === 'DAMAGE' ? 'warning' : 'neutral'} size="sm" dot={false}>
        {a.category.replace(/_/g, ' ').toLowerCase()}
      </Badge>
    ) },
    { key: 'warehouse', header: 'Warehouse', sortable: true },
    { key: 'reference', header: 'Reference', defaultHidden: true },
    { key: 'lines', header: 'Lines', align: 'right', width: '5rem', accessor: (a) => a.lines.length, render: (a) => a.lines.length },
    { key: 'raisedBy', header: 'Raised by', sortable: true },
    ...(canSeeValue
      ? [{
          key: 'netValueImpact',
          header: 'Value impact',
          align: 'right' as const,
          sortable: true,
          render: (a: StockAdjustment) => <span className={cn(a.netValueImpact < 0 ? 'text-danger' : 'text-success')}>{formatCurrency(a.netValueImpact)}</span>,
        }]
      : []),
    { key: 'status', header: 'Status', sortable: true, width: '10rem', render: (a) => <InvStatusBadge status={a.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'stock-adjustments', 'Stock adjustment register', columnsFromTable(adjColumns), adjustments)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  /** Segregation of duties: the raiser can never approve (seeded rule sod-05). */
  function canApprove(a: StockAdjustment) {
    return a.status === 'PENDING_APPROVAL' && a.raisedBy !== (user?.fullName ?? '')
  }

  function saveAdjustment() {
    const e: Record<string, string> = {}
    if (!form.physicalQty) e.physicalQty = 'Enter the counted physical quantity.'
    if (physical < 0) e.physicalQty = 'A physical quantity can never be negative.'
    if (delta === 0) e.physicalQty = 'Physical equals system — there is nothing to adjust.'
    if (!form.note.trim()) e.note = 'Explain what happened; the reason code alone is not an explanation.'
    setErrors(e)
    if (Object.keys(e).length || !selectedBalance) return

    const next = Math.max(...adjustments.map((a) => Number(a.docNo.slice(-4)) || 0)) + 1
    const docNo = `ADJ/26-27/${String(next).padStart(4, '0')}`
    create({
      uid: newUid('adj'),
      docNo,
      docDate: new Date().toISOString().slice(0, 10),
      status: 'PENDING_APPROVAL',
      plant: 'Chennai — Unit 1',
      category: form.category as StockAdjustment['category'],
      warehouse: form.warehouse,
      reference: form.reference,
      netValueImpact: valueImpact,
      raisedBy: user?.fullName ?? 'Current user',
      createdBy: user?.fullName ?? 'Current user',
      createdAt: new Date().toISOString(),
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: approvalRoute(valueImpact).map((role, i) => ({ level: i + 1, role, approver: '—', status: 'PENDING' as const })),
      lines: [
        {
          uid: newUid('adjl'),
          itemCode: selectedBalance.itemCode,
          itemName: selectedBalance.itemName,
          uom: selectedBalance.uom,
          warehouseCode: selectedBalance.warehouseCode,
          bin: selectedBalance.bin,
          batchNo: selectedBalance.batchNo,
          systemQty: selectedBalance.quantity,
          physicalQty: physical,
          deltaQty: delta,
          reasonCode: form.reason,
          note: form.note.trim(),
          valueImpact,
        },
      ],
    } as StockAdjustment)
    toast.success('Adjustment raised', `${docNo} submitted. You raised it, so you cannot approve it — it routes to ${approvalRoute(valueImpact).join(' → ')}.`)
    setFormOpen(false)
    setForm({ ...form, physicalQty: '', note: '', reference: '' })
  }

  return (
    <div>
      <PageHeader
        title="Adjustments, scrap & write-off"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Adjustments' }]}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setErrors({}); setFormOpen(true) }}>
            New adjustment
          </Button>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        <span className="font-medium text-fg">{stats.pending}</span> awaiting approval · adjustment ratio{' '}
        <span className={cn('font-medium tabular', stats.ratio > 0.3 ? 'text-warning' : 'text-success')}>{stats.ratio.toFixed(2)}%</span>{' '}
        of closing value (target ≤ 0.30%) ·{' '}
        <span className={cn('font-medium', stats.pilferage ? 'text-danger' : 'text-fg')}>{stats.pilferage}</span> pilferage case
        {stats.pilferage === 1 ? '' : 's'}
        {canSeeValue ? (
          <>
            {' '}· posted adjustments <span className="font-medium text-fg tabular">{formatCurrency(stats.postedValue)}</span>
          </>
        ) : null}
      </p>

      {(
        <DataTable
          rows={adjustments}
          columns={adjColumns}
          rowKey={(a) => a.uid}
          searchPlaceholder="Search adjustment, reason, warehouse or raiser…"
          onExport={doExport}
          onRowClick={setDetail}
          emptyTitle="No adjustments"
          rowActions={(a) => (
            <>
              {rowEdit.actions(a)}
              <MenuItem label="Open" onClick={() => setDetail(a)} />
              <MenuItem
                label={a.raisedBy === (user?.fullName ?? '') ? 'Approve (blocked — you raised it)' : 'Approve & post'}
                icon={<Check />}
                disabled={!canApprove(a)}
                onClick={() => {
                  update(a.uid, {
                    status: 'POSTED',
                    approvals: a.approvals.map((s) => (s.status === 'PENDING' ? { ...s, status: 'APPROVED' as const, actedAt: new Date().toISOString(), approver: user?.fullName ?? 'Approver' } : s)),
                  })
                  toast.success('Approved and posted', `${a.docNo} posted to the ledger with its reason codes.`)
                }}
              />
              <MenuItem
                label="Reject"
                icon={<X />}
                danger
                disabled={a.status !== 'PENDING_APPROVAL'}
                onClick={() => {
                  update(a.uid, { status: 'REJECTED' })
                  toast.success('Rejected', `${a.docNo} returned to ${a.raisedBy}.`)
                }}
              />
              <MenuItem
                label="Raise a count for this location"
                separatorBefore
                onClick={() => toast.success('Count raised', 'Repeated adjustments on one location trigger a mandatory cycle count.')}
              />
            </>
          )}
          rowClassName={(a) => cn(a.category === 'PILFERAGE' && 'bg-danger/[0.04]')}
        />
      )}

      {/* Adjustment detail ---------------------------------------------------- */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo}
        description={detail ? `${detail.warehouse} · ${detail.category.replace(/_/g, ' ').toLowerCase()}` : undefined}
        width="max-w-4xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-2xs text-fg-subtle">Raised by {detail.raisedBy}</span>
              <div className="flex gap-2">
                {detail.status === 'PENDING_APPROVAL' && (
                  <Button
                    variant="success"
                    size="sm"
                    disabled={!canApprove(detail)}
                    onClick={() => {
                      update(detail.uid, { status: 'POSTED' })
                      toast.success('Posted', `${detail.docNo} posted to the ledger.`)
                      setDetail(null)
                    }}
                  >
                    {canApprove(detail) ? 'Approve & post' : 'Blocked — you raised this'}
                  </Button>
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
              <Badge tone={detail.category === 'PILFERAGE' ? 'danger' : 'neutral'} size="sm" dot={false}>
                {detail.category.replace(/_/g, ' ').toLowerCase()}
              </Badge>
              {canSeeValue && (
                <span className={cn('text-xs font-medium tabular', detail.netValueImpact < 0 ? 'text-danger' : 'text-success')}>
                  {formatCurrency(detail.netValueImpact)}
                </span>
              )}
            </div>

            {detail.raisedBy === (user?.fullName ?? '') && detail.status === 'PENDING_APPROVAL' && (
              <div className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                You raised this document, so you cannot approve it — segregation of duties rule
                <span className="font-mono"> sod-05 </span> (adjustment entry vs approval). The workflow has routed it to the
                next authority and recorded why.
              </div>
            )}

            <DataGrid
              columns={2}
              items={[
                { label: 'Warehouse', value: detail.warehouse },
                { label: 'Reference', value: detail.reference || '—' },
                { label: 'Raised by', value: detail.raisedBy },
                { label: 'Raised on', value: formatDate(detail.docDate) },
                { label: 'Approval route', value: approvalRoute(detail.netValueImpact).join(' → ') },
                ...(canSeeValue ? [{ label: 'Net value impact', value: formatCurrency(detail.netValueImpact) }] : []),
              ]}
            />

            <DetailBlock title={`Lines (${detail.lines.length})`}>
              <div className="overflow-x-auto rounded border border-border">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Item · location</th>
                      <th className="text-right">System</th>
                      <th className="text-right">Physical</th>
                      <th className="text-right">Delta</th>
                      <th>Reason & note</th>
                      {canSeeValue && <th className="text-right">Value</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.uid}>
                        <td>
                          <p className="text-xs font-medium text-fg">{l.itemName}</p>
                          <p className="font-mono text-2xs text-fg-subtle">
                            {l.warehouseCode}{l.bin ? ` · ${l.bin}` : ''}{l.batchNo ? ` · ${l.batchNo}` : ''}
                          </p>
                        </td>
                        <td className="text-right tabular text-fg-muted">{formatQty(l.systemQty)}</td>
                        <td className="text-right tabular">{formatQty(l.physicalQty)}</td>
                        <td className={cn('text-right tabular font-medium', l.deltaQty < 0 ? 'text-danger' : 'text-success')}>
                          {l.deltaQty > 0 ? '+' : ''}{formatQty(l.deltaQty)} {l.uom}
                        </td>
                        <td>
                          <p className="text-xs text-fg">{l.reasonCode}</p>
                          <p className="text-2xs text-fg-subtle">{l.note}</p>
                        </td>
                        {canSeeValue && (
                          <td className={cn('text-right tabular', l.valueImpact < 0 ? 'text-danger' : 'text-success')}>
                            {formatCurrency(l.valueImpact)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailBlock>

            <DetailBlock title="Approval">
              <ApprovalTrail steps={detail.approvals} />
            </DetailBlock>

            {detail.remarks && (
              <DetailBlock title="Remarks">
                <p className="text-xs text-fg-muted">{detail.remarks}</p>
              </DetailBlock>
            )}

            <p className="text-2xs leading-relaxed text-fg-subtle">
              A posted adjustment is immutable. If it turns out to be wrong the correction is a new adjustment that references
              this one, and the pair appears together in the register — the history of the mistake survives the correction.
            </p>
          </div>
        )}
      </Drawer>


      {/* New adjustment ------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New stock adjustment"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveAdjustment}>Submit for approval</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            options={[
              { value: 'QUANTITY_CORRECTION', label: 'Quantity correction' },
              { value: 'DAMAGE', label: 'Damage' },
              { value: 'EXPIRY', label: 'Expiry' },
              { value: 'PILFERAGE', label: 'Pilferage' },
              { value: 'MIGRATION', label: 'Migration correction' },
            ]}
          />
          <Select
            label="Warehouse"
            value={form.warehouse}
            onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
            options={warehouseSummaries.map((w) => ({ value: w.name, label: `${w.code} — ${w.name}` }))}
          />
          <Select
            label="Stock line to adjust"
            containerClassName="sm:col-span-2"
            value={form.balanceUid}
            onChange={(e) => setForm({ ...form, balanceUid: e.target.value })}
            options={stockBalances.map((b) => ({
              value: b.uid,
              label: `${b.itemCode} · ${b.warehouseCode}${b.bin ? ` · ${b.bin}` : ''}${b.batchNo ? ` · ${b.batchNo}` : ''} — ${formatQty(b.quantity)} ${b.uom}`,
            }))}
          />
          <Input label="System quantity" readOnly value={selectedBalance ? formatQty(selectedBalance.quantity) : ''} className="bg-surface-2" hint="Captured now and re-verified at posting" />
          <Input label="Physical quantity" type="number" required value={form.physicalQty} error={errors.physicalQty} onChange={(e) => setForm({ ...form, physicalQty: e.target.value })} />
          <Select label="Reason code" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} options={REASONS.map((r) => ({ value: r, label: r }))} />
          <Input label="Reference" value={form.reference} placeholder="Weighbridge slip, incident report…" onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          <Textarea
            label="What happened (required)"
            containerClassName="sm:col-span-2"
            rows={2}
            value={form.note}
            error={errors.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Coil re-weighed at despatch, −0.36%…"
          />
        </div>

        {selectedBalance && form.physicalQty !== '' && (
          <div className="mt-4 rounded border border-border bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-fg-muted">
                Delta{' '}
                <span className={cn('font-medium tabular', delta < 0 ? 'text-danger' : 'text-success')}>
                  {delta > 0 ? '+' : ''}{formatQty(delta)} {selectedBalance.uom}
                </span>
              </span>
              {canSeeValue && (
                <span className="text-fg-muted">
                  Value impact <span className={cn('font-medium tabular', valueImpact < 0 ? 'text-danger' : 'text-success')}>{formatCurrency(valueImpact)}</span>
                </span>
              )}
              <span className="text-fg-muted">Route <span className="font-medium text-fg">{approvalRoute(valueImpact).join(' → ')}</span></span>
            </div>
            <p className="mt-2 text-2xs text-fg-subtle">
              You are raising this document, so you will not be able to approve it. If the stock changes between now and
              posting, posting is refused and the document must be refreshed against the new system quantity.
            </p>
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="Adjustment ratio by reason" description="Where the corrections are coming from — the shape of this chart is a management report, not a curiosity" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {['Weighment difference', 'Spillage', 'Pilferage', 'Damage in handling', 'Issue error'].map((r) => {
            const lines = adjustments.flatMap((a) => a.lines).filter((l) => l.reasonCode === r)
            const value = lines.reduce((s, l) => s + Math.abs(l.valueImpact), 0)
            return (
              <div key={r} className="rounded border border-border p-3">
                <p className="text-xs font-medium text-fg">{r}</p>
                <p className="mt-1 text-lg font-semibold tabular text-fg">{lines.length}</p>
                <p className="mt-0.5 text-2xs text-fg-muted">{canSeeValue ? formatCurrency(value) : 'lines'}</p>
              </div>
            )
          })}
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
