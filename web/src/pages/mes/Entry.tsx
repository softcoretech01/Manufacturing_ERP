import { useMemo, useState } from 'react'
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
import { MesStatusBadge, OperationCell } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { newUid, useCollection } from '@/store/data'
import { useCurrentUser } from '@/store/auth'
import { productionEntries as seedEntries, workOrders as seedWorkOrders } from '@/mock/mes'
import type { ProductionEntry, Shift, WorkOrder } from '@/types/mes'

/**
 * Production entry — the one screen an operator uses all day. Booking a
 * quantity here is what moves every other number in the module: work order
 * progress, WIP, OEE, labour hours and the scrap register.
 */
export function ProductionEntryPage() {
  const toast = useToast()
  const user = useCurrentUser()
  const entrySeed = useMemo(() => seedEntries, [])
  const woSeed = useMemo(() => seedWorkOrders, [])
  const { rows: entries, create } = useCollection<ProductionEntry>('mes:entry', entrySeed)
  const rowEdit = useRowEdit<ProductionEntry>({
    key: 'mes:entry',
    seed: entrySeed,
    entity: 'Production entry',
    titleOf: (r) => r.docNo,
  })
  const { rows: workOrders, update: updateWo } = useCollection<WorkOrder>('mes:workorder', woSeed)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    workOrderUid: '',
    shift: 'A' as Shift,
    startedAt: '07:00',
    endedAt: '11:00',
    goodQty: '',
    scrapQty: '',
    reworkQty: '',
    remarks: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const bookable = workOrders.filter((w) => ['RUNNING', 'READY', 'SETUP', 'PAUSED'].includes(w.status))
  const wo = workOrders.find((w) => w.uid === form.workOrderUid) ?? bookable[0]

  const good = Number(form.goodQty || 0)
  const scrap = Number(form.scrapQty || 0)
  const rework = Number(form.reworkQty || 0)
  const total = good + scrap + rework
  /** You cannot produce more than the previous operation handed you. */
  const remaining = wo ? Math.max(0, wo.inputQty - wo.producedQty - wo.scrapQty - wo.reworkQty) : 0
  const overBooked = wo ? total > remaining : false

  const today = new Date().toISOString().slice(0, 10)
  const todays = entries.filter((e) => e.entryDate === today)
  const todayGood = todays.reduce((s, e) => s + e.goodQty, 0)
  const todayScrap = todays.reduce((s, e) => s + e.scrapQty, 0)

  const columns: Column<ProductionEntry>[] = [
    { key: 'docNo', header: 'Entry', sortable: true, width: '11rem', render: (e) => <span className="font-mono text-xs font-medium text-brand-600">{e.docNo}</span> },
    { key: 'entryDate', header: 'Date', sortable: true, width: '7rem', accessor: (e) => e.entryDate, render: (e) => formatDate(e.entryDate) },
    { key: 'workOrderNo', header: 'Work order', sortable: true, width: '11rem', render: (e) => (
      <div>
        <p className="font-mono text-2xs text-fg">{e.workOrderNo}</p>
        <p className="truncate text-2xs text-fg-subtle">{e.operationName}</p>
      </div>
    ) },
    { key: 'machine', header: 'Machine', sortable: true, width: '8rem', render: (e) => <span className="font-mono text-2xs">{e.machine}</span> },
    { key: 'operator', header: 'Operator', sortable: true },
    { key: 'shift', header: 'Shift', align: 'center', width: '5.5rem', sortable: true, render: (e) => <Badge tone="neutral" size="sm" dot={false}>{e.shift}</Badge> },
    { key: 'window', header: 'Window', width: '11rem', accessor: (e) => e.startedAt, render: (e) => (
      <span className="text-2xs text-fg-muted">{formatDateTime(e.startedAt).slice(-5)} → {formatDateTime(e.endedAt).slice(-5)}</span>
    ) },
    { key: 'goodQty', header: 'Good', align: 'right', sortable: true, render: (e) => <span className="tabular font-medium text-success">{formatQty(e.goodQty)}</span> },
    { key: 'scrapQty', header: 'Scrap', align: 'right', sortable: true, render: (e) => (e.scrapQty ? <span className="tabular text-danger">{e.scrapQty}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'reworkQty', header: 'Rework', align: 'right', render: (e) => (e.reworkQty ? <span className="tabular text-warning">{e.reworkQty}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'cycleSeconds', header: 'Cycle', align: 'right', width: '6rem', sortable: true, render: (e) => <span className="tabular text-2xs">{e.cycleSeconds}s</span> },
    { key: 'batchNo', header: 'Batch', width: '9rem', defaultHidden: true, render: (e) => <span className="font-mono text-2xs">{e.batchNo ?? '—'}</span> },
    { key: 'remarks', header: 'Remarks', defaultHidden: true },
  ]

  function doExport(format: ExportFormat) {
    try {
      const n = exportRows(format, 'production-entries', 'Production register', columnsFromTable(columns), entries)
      toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error.')
    }
  }

  function post() {
    const e: Record<string, string> = {}
    if (!wo) return
    if (total <= 0) e.goodQty = 'Book at least one piece — good, scrap or rework.'
    if (overBooked) e.goodQty = `Only ${formatQty(remaining)} ${wo.uom} came into this operation and is still unbooked.`
    if (form.startedAt >= form.endedAt) e.endedAt = 'The end of the window must be after its start.'
    setErrors(e)
    if (Object.keys(e).length) return

    const minutes = (Number(form.endedAt.slice(0, 2)) * 60 + Number(form.endedAt.slice(3))) - (Number(form.startedAt.slice(0, 2)) * 60 + Number(form.startedAt.slice(3)))
    const cycle = total ? Number(((minutes * 60) / total).toFixed(1)) : 0
    const next = Math.max(...entries.map((x) => Number(x.docNo.slice(-5)) || 0)) + 1
    const docNo = `PE/2607/${String(next).padStart(5, '0')}`

    create({
      uid: newUid('pe'),
      docNo,
      entryDate: today,
      workOrderNo: wo.docNo,
      productionOrderNo: wo.productionOrderNo,
      operationName: wo.operationName,
      machine: wo.machine ?? '—',
      operator: wo.operator ?? user?.fullName ?? 'Operator',
      shift: form.shift,
      startedAt: `${today}T${form.startedAt}:00`,
      endedAt: `${today}T${form.endedAt}:00`,
      goodQty: good,
      scrapQty: scrap,
      reworkQty: rework,
      uom: wo.uom,
      batchNo: wo.batchNo,
      cycleSeconds: cycle,
      remarks: form.remarks || undefined,
      postedBy: user?.fullName ?? 'Operator',
    } as ProductionEntry)

    updateWo(wo.uid, {
      producedQty: wo.producedQty + good,
      scrapQty: wo.scrapQty + scrap,
      reworkQty: wo.reworkQty + rework,
      actualMinutes: wo.actualMinutes + minutes,
      status: wo.status === 'READY' || wo.status === 'SETUP' ? 'RUNNING' : wo.status,
      startedAt: wo.startedAt ?? `${today}T${form.startedAt}:00`,
    })

    toast.success(
      'Production booked',
      `${docNo} — ${formatQty(good)} good${scrap ? `, ${scrap} scrap` : ''}${rework ? `, ${rework} for rework` : ''} on ${wo.operationName}. Work order, WIP, machine hours and OEE have all moved.`,
    )
    setFormOpen(false)
    setForm({ ...form, goodQty: '', scrapQty: '', reworkQty: '', remarks: '' })
  }

  return (
    <div>
      <PageHeader
        title="Production entry"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Production entry' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setForm({ ...form, workOrderUid: bookable[0]?.uid ?? '', goodQty: '', scrapQty: '', reworkQty: '' })
              setErrors({})
              setFormOpen(true)
            }}
          >
            Book production
          </Button>
        }
      />

      <p className="mb-3 text-xs text-fg-muted">
        Today: <span className="font-medium text-success tabular">{formatQty(todayGood)}</span> good ·{' '}
        <span className={cn('font-medium tabular', todayScrap ? 'text-danger' : 'text-fg')}>{formatQty(todayScrap)}</span> scrap
        across <span className="font-medium text-fg">{todays.length}</span> entr{todays.length === 1 ? 'y' : 'ies'}. Every entry
        names the machine, the operator, the shift and the batch — that is what makes the traceability work later.
      </p>

      <DataTable
        rows={entries}
        columns={columns}
        rowKey={(e) => e.uid}
        searchPlaceholder="Search entry, work order, machine or operator…"
        onExport={doExport}
        emptyTitle="Nothing booked yet"
        emptyDescription="Book production against a running work order to move the whole module forward."
        rowActions={(e) => (
          <>
            {rowEdit.actions(e)}
            <MenuItem label="Print entry slip" onClick={() => toast.success('Sent to printer', `${e.docNo} — one copy for the operator, one for the shift file.`)} />
            <MenuItem
              label="Reverse this entry"
              danger
              onClick={() => toast.warning('Reversal, not deletion', 'A production record is never deleted. A reversing entry with a reason is posted against it, and both stay visible.')}
            />
          </>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Book production"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={post} disabled={overBooked}>Post entry</Button>
          </>
        }
      >
        {bookable.length === 0 ? (
          <p className="text-sm text-fg-muted">No work order is on the floor right now. Release a production order first.</p>
        ) : (
          <div className="space-y-4">
            <Select
              label="Work order"
              value={wo?.uid ?? ''}
              onChange={(e) => setForm({ ...form, workOrderUid: e.target.value })}
              options={bookable.map((w) => ({ value: w.uid, label: `${w.docNo} — ${w.operationName} (${w.machine ?? 'no machine'})` }))}
            />

            {wo && (
              <div className="rounded border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <OperationCell sequence={wo.sequence} name={wo.operationName} workCentre={wo.workCentre} />
                  <MesStatusBadge status={wo.status} size="sm" />
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                  <p className="text-fg-muted">Came in <span className="block font-medium tabular text-fg">{formatQty(wo.inputQty)}</span></p>
                  <p className="text-fg-muted">Booked <span className="block font-medium tabular text-fg">{formatQty(wo.producedQty + wo.scrapQty + wo.reworkQty)}</span></p>
                  <p className="text-fg-muted">Still to book <span className={cn('block font-medium tabular', remaining ? 'text-fg' : 'text-success')}>{formatQty(remaining)}</span></p>
                  <p className="text-fg-muted">Machine <span className="block font-medium text-fg">{wo.machine ?? '—'}</span></p>
                </div>
              </div>
            )}

            <div className="grid gap-3.5 sm:grid-cols-3">
              <Select
                label="Shift"
                value={form.shift}
                onChange={(e) => setForm({ ...form, shift: e.target.value as Shift })}
                options={[{ value: 'A', label: 'A — morning' }, { value: 'B', label: 'B — evening' }, { value: 'C', label: 'C — night' }]}
              />
              <Input label="From" type="time" value={form.startedAt} onChange={(e) => setForm({ ...form, startedAt: e.target.value })} />
              <Input label="To" type="time" value={form.endedAt} error={errors.endedAt} onChange={(e) => setForm({ ...form, endedAt: e.target.value })} />
              <Input label={`Good pieces${wo ? ` (${wo.uom})` : ''}`} type="number" required value={form.goodQty} error={errors.goodQty} onChange={(e) => setForm({ ...form, goodQty: e.target.value })} />
              <Input label="Scrap" type="number" value={form.scrapQty} hint="Goes to the scrap register with a reason" onChange={(e) => setForm({ ...form, scrapQty: e.target.value })} />
              <Input label="For rework" type="number" value={form.reworkQty} hint="Raises a rework order" onChange={(e) => setForm({ ...form, reworkQty: e.target.value })} />
            </div>

            <Textarea label="Remarks" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Weld current re-set after the jig change…" />

            {wo && total > 0 && (
              <div className={cn('rounded border p-3 text-xs', overBooked ? 'border-danger/30 bg-danger/5' : 'border-border bg-surface-2')}>
                {overBooked ? (
                  <p className="text-danger">
                    {formatQty(total)} is more than the {formatQty(remaining)} {wo.uom} still unbooked at this operation. Pieces
                    cannot appear that the previous operation never handed over.
                  </p>
                ) : (
                  <ul className="space-y-1 text-fg-muted">
                    <li>• Work order {wo.docNo} moves to {formatQty(wo.producedQty + good)} good of {formatQty(wo.inputQty)} in.</li>
                    <li>• Cycle time works out at {total ? (((Number(form.endedAt.slice(0, 2)) * 60 + Number(form.endedAt.slice(3))) - (Number(form.startedAt.slice(0, 2)) * 60 + Number(form.startedAt.slice(3)))) * 60 / total).toFixed(1) : '—'} s per piece against a {wo.standardMinutes} min standard.</li>
                    {scrap > 0 && <li>• {scrap} scrap pieces go to the scrap register for a reason code.</li>}
                    {rework > 0 && <li>• {rework} pieces raise a rework order and stay out of good output.</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Card className="mt-4">
        <CardHeader title="What one entry moves" description="This is why the operator screen is kept short — everything else is derived" />
        <CardBody className="grid gap-3 text-xs leading-relaxed text-fg-muted sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-fg">Work order</span> — produced, scrap and rework quantities, and actual minutes against standard.</p>
          <p><span className="font-medium text-fg">WIP</span> — the lot moves to the next operation with its batch identity intact.</p>
          <p><span className="font-medium text-fg">OEE</span> — performance and quality both come from the pieces and the time booked here.</p>
          <p><span className="font-medium text-fg">Genealogy</span> — machine, operator, shift and batch are stamped on the record for good.</p>
        </CardBody>
      </Card>

      {rowEdit.dialogs}
    </div>
  )
}
