import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { MesStatusBadge, OperationCell } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDate, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { productionApi, type WorkOrderRow } from '@/api/production'
import { shopFloorApi, type ProductionEntryRow } from '@/api/shopfloor'

/**
 * Production entry — the one screen an operator uses all day.
 *
 * Booking here is a server action. The browser does not add up quantities or
 * advance the work order: it posts the entry, the server validates it against
 * what the previous operation actually handed over, and this screen then reads
 * back what was written. If the post is refused, nothing on screen moves and
 * the reason the server gave is shown as it came.
 */

/** Operations that can still take a booking. */
const BOOKABLE = ['RUNNING', 'READY', 'PAUSED']

interface EntryForm {
  workOrderUid: string
  shift: string
  startedAt: string
  endedAt: string
  goodQty: string
  scrapQty: string
  reworkQty: string
  scrapReason: string
  remarks: string
}

const BLANK: EntryForm = {
  workOrderUid: '',
  shift: '',
  startedAt: '',
  endedAt: '',
  goodQty: '',
  scrapQty: '',
  reworkQty: '',
  scrapReason: '',
  remarks: '',
}

export function ProductionEntryPage() {
  const toast = useToast()
  const [entries, setEntries] = useState<ProductionEntryRow[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<EntryForm>(BLANK)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [posting, setPosting] = useState(false)

  function message(err: unknown, fallback: string) {
    return err instanceof ProblemError ? err.problem.detail : fallback
  }

  async function load() {
    try {
      const [register, work] = await Promise.all([
        shopFloorApi.entries({ limit: 200 }),
        productionApi.getWorkOrders(),
      ])
      setEntries(register)
      setWorkOrders(work)
      setError(null)
    } catch (err) {
      setError(message(err, 'Could not reach the backend.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const bookable = useMemo(() => workOrders.filter((w) => BOOKABLE.includes(w.status)), [workOrders])
  const wo = workOrders.find((w) => w.uid === form.workOrderUid) ?? bookable[0]

  const good = Number(form.goodQty || 0)
  const scrap = Number(form.scrapQty || 0)
  const rework = Number(form.reworkQty || 0)
  const total = good + scrap + rework
  /** The server enforces this too; showing it here just saves a round trip. */
  const remaining = wo ? Math.max(0, wo.inputQty - wo.producedQty - wo.scrapQty - wo.reworkQty) : 0
  const overBooked = wo ? total > remaining : false

  const today = new Date().toISOString().slice(0, 10)
  const todays = entries.filter((e) => e.businessDate === today && !e.isReversal)
  const todayGood = todays.reduce((s, e) => s + e.goodQty, 0)
  const todayScrap = todays.reduce((s, e) => s + e.scrapQty, 0)

  const columns: Column<ProductionEntryRow>[] = [
    { key: 'docNo', header: 'Entry', sortable: true, width: '11rem', render: (e) => (
      <span className={cn('font-mono text-xs font-medium', e.isReversal ? 'text-danger' : 'text-brand-600')}>{e.docNo}</span>
    ) },
    { key: 'businessDate', header: 'Date', sortable: true, width: '8.5rem', accessor: (e) => e.businessDate ?? '', render: (e) => (e.businessDate ? formatDate(e.businessDate) : '—') },
    { key: 'workOrderDocNo', header: 'Work order', sortable: true, width: '11rem', render: (e) => (
      <div>
        <p className="font-mono text-2xs text-fg">{e.workOrderDocNo}</p>
        <p className="truncate text-2xs text-fg-subtle" title={e.operationName}>{e.operationName}</p>
      </div>
    ) },
    { key: 'machineCode', header: 'Machine', sortable: true, width: '8rem', render: (e) => <span className="font-mono text-2xs">{e.machineCode || '—'}</span> },
    { key: 'operatorName', header: 'Operator', sortable: true, render: (e) => e.operatorName || '—' },
    { key: 'shiftCode', header: 'Shift', align: 'center', width: '5.5rem', sortable: true, render: (e) => (
      e.shiftCode ? <Badge tone="neutral" size="sm" dot={false}>{e.shiftCode}</Badge> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
    { key: 'goodQty', header: 'Good', align: 'right', sortable: true, render: (e) => <span className="tabular font-medium text-success">{formatQty(e.goodQty)}</span> },
    { key: 'scrapQty', header: 'Scrap', align: 'right', sortable: true, render: (e) => (e.scrapQty ? <span className="tabular text-danger">{formatQty(e.scrapQty)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'reworkQty', header: 'Rework', align: 'right', render: (e) => (e.reworkQty ? <span className="tabular text-warning">{formatQty(e.reworkQty)}</span> : <span className="text-2xs text-fg-subtle">—</span>) },
    { key: 'runMinutes', header: 'Run', align: 'right', width: '6rem', sortable: true, render: (e) => <span className="tabular text-2xs">{e.runMinutes} min</span> },
    { key: 'status', header: 'Status', width: '7rem', render: (e) => <MesStatusBadge status={e.status} size="sm" /> },
    { key: 'batchNo', header: 'Batch', width: '9rem', defaultHidden: true, render: (e) => <span className="font-mono text-2xs">{e.batchNo || '—'}</span> },
    { key: 'defects', header: 'Defects', defaultHidden: true, render: (e) => (
      e.defects.length ? <span className="text-2xs">{e.defects.map((d) => `${d.defectName || d.defectCode} ${formatQty(d.qty)}`).join(', ')}</span> : <span className="text-2xs text-fg-subtle">—</span>
    ) },
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

  async function post() {
    if (!wo) return
    const e: Record<string, string> = {}
    if (total <= 0) e.goodQty = 'Book at least one piece — good, scrap or rework.'
    if (overBooked) e.goodQty = `Only ${formatQty(remaining)} ${wo.uom} came into this operation and is still unbooked.`
    if (form.startedAt && form.endedAt && form.startedAt >= form.endedAt) {
      e.endedAt = 'The end of the window must be after its start.'
    }
    if (scrap > 0 && !form.scrapReason.trim()) e.scrapReason = 'Scrap needs a reason before it can be written off.'
    setErrors(e)
    if (Object.keys(e).length) return

    setPosting(true)
    try {
      const result = await productionApi.recordProduction(wo.uid, {
        goodQty: good,
        scrapQty: scrap || undefined,
        reworkQty: rework || undefined,
        startedAt: form.startedAt ? `${today}T${form.startedAt}:00` : undefined,
        endedAt: form.endedAt ? `${today}T${form.endedAt}:00` : undefined,
        businessDate: today,
        shiftCode: form.shift || undefined,
        machineCode: wo.machineCode ?? undefined,
        scrapReason: form.scrapReason || undefined,
        remarks: form.remarks || undefined,
      })
      toast.success(
        'Production booked',
        `${result.entryDocNo} — ${formatQty(good)} good${scrap ? `, ${formatQty(scrap)} scrap` : ''}${
          rework ? `, ${formatQty(rework)} for rework` : ''
        }. ${formatQty(result.remainingToBook)} ${wo.uom} still to book at this operation.`,
      )
      setFormOpen(false)
      setForm({ ...BLANK, workOrderUid: form.workOrderUid, shift: form.shift })
      await load()
    } catch (err) {
      // The entry was refused, so nothing on this screen may move.
      toast.error('Not booked', message(err, 'The server refused this entry.'))
    } finally {
      setPosting(false)
    }
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
            disabled={!bookable.length}
            onClick={() => {
              setForm({ ...BLANK, workOrderUid: bookable[0]?.uid ?? '' })
              setErrors({})
              setFormOpen(true)
            }}
          >
            Book production
          </Button>
        }
      />

      {error && (
        <Alert tone="danger" title="The production register could not be loaded" className="mb-4">
          {error}
        </Alert>
      )}

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
        loading={loading}
        searchPlaceholder="Search entry, work order, machine or operator…"
        onExport={doExport}
        emptyTitle="Nothing booked yet"
        emptyDescription="Book production against a running work order to move the whole module forward."
        rowActions={(e) => (
          <MenuItem
            label="Reverse this entry"
            danger
            onClick={() =>
              toast.warning(
                'Reversal is not wired to this screen yet',
                `${e.docNo} can only be reversed by a posting that creates a reversing entry. Deleting a production record is never allowed.`,
              )
            }
          />
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
            <Button variant="primary" loading={posting} onClick={() => void post()} disabled={overBooked}>Post entry</Button>
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
              options={bookable.map((w) => ({
                value: w.uid,
                label: `${w.docNo} — ${w.operationName} (${w.machineCode || 'no machine'})`,
              }))}
            />

            {wo && (
              <div className="rounded border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <OperationCell sequence={wo.seq} name={wo.operationName} workCentre={wo.workCentreCode} />
                  <MesStatusBadge status={wo.status} size="sm" />
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                  <p className="text-fg-muted">Came in <span className="block font-medium tabular text-fg">{formatQty(wo.inputQty)}</span></p>
                  <p className="text-fg-muted">Booked <span className="block font-medium tabular text-fg">{formatQty(wo.producedQty + wo.scrapQty + wo.reworkQty)}</span></p>
                  <p className="text-fg-muted">Still to book <span className={cn('block font-medium tabular', remaining ? 'text-fg' : 'text-success')}>{formatQty(remaining)}</span></p>
                  <p className="text-fg-muted">Machine <span className="block font-medium text-fg">{wo.machineCode || '—'}</span></p>
                </div>
              </div>
            )}

            <div className="grid gap-3.5 sm:grid-cols-3">
              <Input label="Shift" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })} placeholder="SH-A" hint="Leave blank to keep the work order's shift" />
              <Input label="From" type="time" value={form.startedAt} onChange={(e) => setForm({ ...form, startedAt: e.target.value })} />
              <Input label="To" type="time" value={form.endedAt} error={errors.endedAt} onChange={(e) => setForm({ ...form, endedAt: e.target.value })} />
              <Input label={`Good pieces${wo ? ` (${wo.uom})` : ''}`} type="number" required value={form.goodQty} error={errors.goodQty} onChange={(e) => setForm({ ...form, goodQty: e.target.value })} />
              <Input label="Scrap" type="number" value={form.scrapQty} hint="Goes to the scrap register with a reason" onChange={(e) => setForm({ ...form, scrapQty: e.target.value })} />
              <Input label="For rework" type="number" value={form.reworkQty} hint="Held out of good output" onChange={(e) => setForm({ ...form, reworkQty: e.target.value })} />
            </div>

            {scrap > 0 && (
              <Input
                label="Scrap reason"
                required
                value={form.scrapReason}
                error={errors.scrapReason}
                onChange={(e) => setForm({ ...form, scrapReason: e.target.value })}
                placeholder="Dented on the transfer chute"
              />
            )}

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
                    {scrap > 0 && <li>• {formatQty(scrap)} scrap pieces are written to the scrap register with the reason given.</li>}
                    {rework > 0 && <li>• {formatQty(rework)} pieces are held out of good output.</li>}
                    <li>• Nothing moves until the server accepts the entry.</li>
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
          <p><span className="font-medium text-fg">WIP</span> — what this operation still holds falls by whatever was booked.</p>
          <p><span className="font-medium text-fg">Scrap register</span> — a scrap quantity writes a scrap record carrying the reason.</p>
          <p><span className="font-medium text-fg">Traveller</span> — machine, operator, shift and batch are stamped on the record for good.</p>
        </CardBody>
      </Card>
    </div>
  )
}
