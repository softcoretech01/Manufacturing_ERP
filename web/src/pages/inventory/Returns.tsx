import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { useRowEdit } from '@/components/crud/RowEdit'
import { InvStatusBadge, ItemCell, QtyCell, useCanSeeValue } from '@/components/inventory/InvShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatCurrency, formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { useCurrentUser } from '@/store/auth'
import { materialIssues as seedIssues, materialReturns as seedReturns } from '@/mock/inventory'
import type { MaterialIssue, MaterialReturn, ReturnCondition } from '@/types/inventory'

const CONDITIONS: { value: ReturnCondition; label: string; effect: string; warehouse: string }[] = [
  { value: 'GOOD', label: 'Good — usable as it is', effect: 'Goes straight back to available stock, at the rate it was issued.', warehouse: 'Raw Material Store' },
  { value: 'SUSPECT', label: 'Suspect — needs re-checking', effect: 'Held in quarantine until QC re-tests it.', warehouse: 'Quarantine Store' },
  { value: 'DAMAGED', label: 'Damaged — not usable', effect: 'Held in the reject store and routed to scrap review.', warehouse: 'Reject Store' },
]

/** Material return — unconsumed or residual material coming back to the store. */
export function MaterialReturnsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const canSeeValue = useCanSeeValue()
  const returnSeed = useMemo(() => seedReturns, [])
  const issueSeed = useMemo(() => seedIssues, [])
  const { rows: returns, create } = useCollection<MaterialReturn>('inv:return', returnSeed)
  const rowEdit = useRowEdit<MaterialReturn>({
    key: 'inv:return',
    seed: returnSeed,
    entity: 'Material return',
    titleOf: (r) => r.docNo,
  })
  const { rows: issues, update: updateIssue } = useCollection<MaterialIssue>('inv:issue', issueSeed)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ issueUid: '', lineUid: '', quantity: '', condition: 'GOOD' as ReturnCondition, weighmentRef: '', remarks: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const issue = issues.find((i) => i.uid === form.issueUid) ?? issues[0]
  const line = issue?.lines.find((l) => l.uid === form.lineUid) ?? issue?.lines[0]
  const qty = Number(form.quantity || 0)
  /** You can never return more than was issued, net of what already came back. */
  const returnable = line ? line.quantity - line.returnedQty : 0
  const overReturn = qty > returnable
  const condition = CONDITIONS.find((c) => c.value === form.condition)!

  const columns: Column<MaterialReturn>[] = [
    { key: 'docNo', header: 'Return', sortable: true, width: '12rem', render: (r) => <span className="font-mono text-xs font-medium text-brand-600">{r.docNo}</span> },
    { key: 'docDate', header: 'Date', sortable: true, width: '7rem', accessor: (r) => r.docDate, render: (r) => formatDate(r.docDate) },
    { key: 'issueNo', header: 'Against issue', width: '12rem', render: (r) => <span className="font-mono text-2xs">{r.issueNo}</span> },
    { key: 'itemCode', header: 'Item', sortable: true, render: (r) => <ItemCell code={r.itemCode} name={r.itemName} sub={r.batchNo ?? undefined} /> },
    { key: 'quantity', header: 'Quantity', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.quantity} uom={r.uom} /> },
    { key: 'condition', header: 'Condition', sortable: true, width: '9rem', render: (r) => (
      <Badge size="sm" tone={r.condition === 'GOOD' ? 'success' : r.condition === 'SUSPECT' ? 'warning' : 'danger'}>
        {r.condition.charAt(0) + r.condition.slice(1).toLowerCase()}
      </Badge>
    ) },
    { key: 'toWarehouse', header: 'Returned to', sortable: true },
    { key: 'toBin', header: 'Bin', width: '7rem', render: (r) => <span className="font-mono text-2xs">{r.toBin ?? '—'}</span> },
    { key: 'weighmentRef', header: 'Weighment', width: '9rem', render: (r) => <span className="font-mono text-2xs">{r.weighmentRef ?? '—'}</span> },
    { key: 'returnedBy', header: 'Returned by', sortable: true },
    ...(canSeeValue ? [{ key: 'value', header: 'Value back', align: 'right' as const, sortable: true, render: (r: MaterialReturn) => formatCurrency(r.value) }] : []),
    { key: 'status', header: 'Status', sortable: true, width: '8rem', render: (r) => <InvStatusBadge status={r.status} size="sm" /> },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'material-returns', 'Material return register', columnsFromTable(columns), returns)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function save() {
    const e: Record<string, string> = {}
    if (!form.quantity || qty <= 0) e.quantity = 'Enter a quantity greater than zero.'
    if (overReturn) e.quantity = `Only ${formatQty(returnable)} ${line?.uom} was issued and not yet returned.`
    setErrors(e)
    if (Object.keys(e).length || !issue || !line) return

    const next = Math.max(...returns.map((r) => Number(r.docNo.slice(-5)) || 0)) + 1
    const docNo = `P1/MR/26-27/${String(next).padStart(5, '0')}`

    create({
      uid: newUid('mr'),
      docNo,
      docDate: new Date().toISOString().slice(0, 10),
      status: 'POSTED',
      plant: issue.plant,
      issueNo: issue.docNo,
      returnedBy: user?.fullName ?? issue.issuedTo,
      toWarehouse: condition.warehouse,
      itemCode: line.itemCode,
      itemName: line.itemName,
      uom: line.uom,
      batchNo: line.batchNo,
      quantity: qty,
      condition: form.condition,
      weighmentRef: form.weighmentRef || undefined,
      toBin: form.condition === 'GOOD' ? line.bin : null,
      value: qty * line.rate,
      remarks: form.remarks || undefined,
      createdBy: user?.fullName ?? 'Current user',
      createdAt: new Date().toISOString(),
      version: 1,
      attachments: 0,
      comments: 0,
      approvals: [{ level: 1, role: 'Stores In-charge', approver: 'M. Lakshmi', status: 'APPROVED', actedAt: new Date().toISOString() }],
    } as MaterialReturn)

    // The issue line remembers what came back, so it can never be returned twice.
    updateIssue(issue.uid, {
      lines: issue.lines.map((l) => (l.uid === line.uid ? { ...l, returnedQty: l.returnedQty + qty } : l)),
    })

    toast.success(
      'Return posted',
      `${docNo} — ${formatQty(qty)} ${line.uom} back to ${condition.warehouse}${form.condition === 'GOOD' ? ` at the rate it was issued, batch ${line.batchNo ?? 'n/a'} preserved` : ''}.`,
    )
    setFormOpen(false)
    setForm({ ...form, quantity: '', weighmentRef: '', remarks: '' })
  }

  const openIssues = issues.filter((i) => i.status === 'ISSUED' || i.status === 'PARTIALLY_ISSUED')

  return (
    <div>
      <PageHeader
        title="Material return to store"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Inventory', to: '/inventory' }, { label: 'Returns' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              const first = openIssues[0]
              setForm({ issueUid: first?.uid ?? '', lineUid: first?.lines[0]?.uid ?? '', quantity: '', condition: 'GOOD', weighmentRef: '', remarks: '' })
              setErrors({})
              setFormOpen(true)
            }}
          >
            New return
          </Button>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        Whatever was issued and not consumed comes back here — part coils, leftover components, wrong picks. The return goes to
        the <span className="font-medium text-fg">same batch</span> at the rate it was issued, so consumption and valuation both
        stay honest. <span className="font-medium text-fg">{returns.length}</span> return{returns.length === 1 ? '' : 's'} recorded.
      </p>

      <DataTable
        rows={returns}
        columns={columns}
        rowKey={(r) => r.uid}
        searchPlaceholder="Search return, issue, item or batch…"
        onExport={doExport}
        emptyTitle="No returns yet"
        emptyDescription="When material comes back from the shop floor, record it here so stock and cost both correct themselves."
        rowActions={(r) => (
          <>
            {rowEdit.actions(r)}
            <MenuItem label="Print return note" onClick={() => toast.success('Sent to printer', `${r.docNo} — one copy for the store, one for the shop floor.`)} />
            <MenuItem
              label="Raise a scrap note"
              disabled={r.condition !== 'DAMAGED'}
              onClick={() => navigate('/inventory/scrap')}
            />
          </>
        )}
        rowClassName={(r) => cn(r.condition === 'DAMAGED' && 'bg-danger/[0.03]', r.condition === 'SUSPECT' && 'bg-warning/[0.03]')}
      />

      <Card className="mt-4">
        <CardHeader title="Condition decides where it goes" description="The storekeeper picks one; the system does the rest" />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {CONDITIONS.map((c) => (
            <div key={c.value} className="rounded border border-border p-3">
              <Badge size="sm" tone={c.value === 'GOOD' ? 'success' : c.value === 'SUSPECT' ? 'warning' : 'danger'}>
                {c.label.split(' — ')[0]}
              </Badge>
              <p className="mt-1.5 text-2xs leading-relaxed text-fg-muted">{c.effect}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* New return ----------------------------------------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Return material to store"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={overReturn}>Post return</Button>
          </>
        }
      >
        {openIssues.length === 0 ? (
          <p className="text-sm text-fg-muted">There are no posted issues to return against yet.</p>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Select
              label="Against issue"
              containerClassName="sm:col-span-2"
              value={issue?.uid ?? ''}
              onChange={(e) => {
                const i = issues.find((x) => x.uid === e.target.value)
                setForm({ ...form, issueUid: e.target.value, lineUid: i?.lines[0]?.uid ?? '' })
              }}
              options={openIssues.map((i) => ({ value: i.uid, label: `${i.docNo} — ${i.chargeRef} (${i.issuedTo})` }))}
            />
            <Select
              label="Line"
              containerClassName="sm:col-span-2"
              value={line?.uid ?? ''}
              onChange={(e) => setForm({ ...form, lineUid: e.target.value })}
              options={(issue?.lines ?? []).map((l) => ({
                value: l.uid,
                label: `${l.itemCode} — issued ${formatQty(l.quantity)} ${l.uom}, already returned ${formatQty(l.returnedQty)}`,
              }))}
            />
            <Input
              label={`Quantity to return${line ? ` (${line.uom})` : ''}`}
              type="number"
              required
              value={form.quantity}
              error={errors.quantity}
              hint={line ? `Returnable: ${formatQty(returnable)} ${line.uom}` : undefined}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <Select
              label="Condition"
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value as ReturnCondition })}
              hint={condition.effect}
              options={CONDITIONS.map((c) => ({ value: c.value, label: c.label }))}
            />
            <Input
              label="Weighment reference"
              value={form.weighmentRef}
              placeholder="WB/26/8841"
              hint="For part coils and drums — the residual weight cross-check"
              onChange={(e) => setForm({ ...form, weighmentRef: e.target.value })}
            />
            <Textarea label="Remarks" containerClassName="sm:col-span-2" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </div>
        )}

        {line && form.quantity && (
          <div className={cn('mt-4 rounded border p-3 text-xs', overReturn ? 'border-danger/30 bg-danger/5' : 'border-border bg-surface-2')}>
            {overReturn ? (
              <p className="text-danger">
                {formatQty(qty)} is more than was issued. Only {formatQty(returnable)} {line.uom} remains returnable on this line —
                returning more would create stock that never left.
              </p>
            ) : (
              <ul className="space-y-1 text-fg-muted">
                <li>• {formatQty(qty)} {line.uom} returns to <span className="font-medium text-fg">{condition.warehouse}</span>{form.condition === 'GOOD' && line.bin ? `, bin ${line.bin}` : ''}.</li>
                <li>• Batch <span className="font-mono text-fg">{line.batchNo ?? 'not tracked'}</span> keeps its identity — no new batch is created.</li>
                {canSeeValue && <li>• {formatCurrency(qty * line.rate)} comes back at the issued rate, so consumption cost corrects itself.</li>}
              </ul>
            )}
          </div>
        )}
      </Modal>

      {rowEdit.dialogs}
    </div>
  )
}
