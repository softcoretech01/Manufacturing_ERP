import { useEffect, useState } from 'react'
import { Check, Hand, Pause, Play, Square } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, DataGrid } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { MenuItem } from '@/components/ui/Menu'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { MesDetailBlock, OperationCell, ProgressCell } from '@/components/mes/MesShell'
import { columnsFromTable, exportRows, type ExportFormat } from '@/lib/export'
import { formatDateTime, formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { productionApi, type WorkOrderRow } from '@/api/production'

/**
 * Work orders — one per routing operation, read from the shop floor itself.
 *
 * Every figure on this screen comes from `prd_work_order` and the production
 * entries posted against it. Nothing here is a browser counter: starting,
 * booking and completing are server actions, and the server decides whether the
 * sequence, the input quantity and the status allow them.
 */

const ACTIVE = ['READY', 'RUNNING', 'PAUSED']

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'progress'> = {
  RUNNING: 'success',
  READY: 'progress',
  PAUSED: 'warning',
  QC_HOLD: 'danger',
  HOLD: 'danger',
  COMPLETED: 'neutral',
  CANCELLED: 'neutral',
  QUEUED: 'neutral',
}

interface EntryForm {
  goodQty: string
  scrapQty: string
  reworkQty: string
  scrapReason: string
  remarks: string
}

const EMPTY_ENTRY: EntryForm = { goodQty: '', scrapQty: '', reworkQty: '', scrapReason: '', remarks: '' }

export function WorkOrdersPage() {
  const toast = useToast()
  const [rows, setRows] = useState<WorkOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('active')
  const [detail, setDetail] = useState<WorkOrderRow | null>(null)
  const [booking, setBooking] = useState<WorkOrderRow | null>(null)
  const [entry, setEntry] = useState<EntryForm>(EMPTY_ENTRY)
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({})
  const [qcTarget, setQcTarget] = useState<WorkOrderRow | null>(null)
  const [qc, setQc] = useState({ result: 'PASS', inspectionDocNo: '', note: '' })
  const [holdTarget, setHoldTarget] = useState<WorkOrderRow | null>(null)
  const [holdReason, setHoldReason] = useState('')

  async function load() {
    try {
      setRows(await productionApi.getWorkOrders())
    } catch (err) {
      toast.error('Could not load work orders', message(err, 'Is the backend running?'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function message(err: unknown, fallback: string) {
    return err instanceof ProblemError ? err.problem.detail : fallback
  }

  /** Every action is the same shape: call the server, report it, reload. */
  async function act(label: string, run: () => Promise<unknown>, success: (result: any) => string) {
    try {
      const result = await run()
      toast.success(label, success(result))
      await load()
      setDetail(null)
    } catch (err) {
      toast.error(`Could not ${label.toLowerCase()}`, message(err, 'The floor was not changed.'))
    }
  }

  const filtered = rows.filter((w) => {
    if (tab === 'active') return ACTIVE.includes(w.status)
    if (tab === 'queued') return w.status === 'QUEUED'
    if (tab === 'hold') return w.status === 'QC_HOLD' || w.status === 'HOLD'
    if (tab === 'done') return w.status === 'COMPLETED' || w.status === 'CANCELLED'
    return true
  })

  const yieldPct = (w: WorkOrderRow) => (w.inputQty ? (w.producedQty / w.inputQty) * 100 : 0)
  const booked = (w: WorkOrderRow) => w.producedQty + w.scrapQty + w.reworkQty

  /* ── Booking ───────────────────────────────────────────────────────────── */

  function openBooking(w: WorkOrderRow) {
    setBooking(w)
    setEntry(EMPTY_ENTRY)
    setEntryErrors({})
  }

  async function postEntry() {
    if (!booking) return
    const good = Number(entry.goodQty) || 0
    const scrap = Number(entry.scrapQty) || 0
    const rework = Number(entry.reworkQty) || 0
    const errors: Record<string, string> = {}
    if (good + scrap + rework <= 0) errors.goodQty = 'Book at least one piece.'
    if (scrap > 0 && !entry.scrapReason.trim()) errors.scrapReason = 'Scrap needs a reason.'
    setEntryErrors(errors)
    if (Object.keys(errors).length) return

    try {
      const result = await productionApi.recordProduction(booking.uid, {
        goodQty: good,
        scrapQty: scrap,
        reworkQty: rework,
        scrapReason: entry.scrapReason,
        remarks: entry.remarks,
      })
      toast.success(
        `Booked on ${booking.docNo}`,
        `${result.entryDocNo} — ${formatQty(good)} good${scrap ? `, ${formatQty(scrap)} scrap` : ''}. ` +
          `${formatQty(result.remainingToBook)} of the input is still unbooked.`,
      )
      setBooking(null)
      await load()
    } catch (err) {
      toast.error('Could not book production', message(err, 'Nothing was posted.'))
    }
  }

  /* ── Columns ───────────────────────────────────────────────────────────── */

  const columns: Column<WorkOrderRow>[] = [
    {
      key: 'docNo',
      header: 'Work order',
      sortable: true,
      width: '12rem',
      render: (w) => (
        <div>
          <p className="font-mono text-xs font-medium text-brand-600">{w.docNo}</p>
          <p className="font-mono text-2xs text-fg-subtle">{w.orderDocNo}</p>
        </div>
      ),
    },
    {
      key: 'seq',
      header: 'Operation',
      sortable: true,
      render: (w) => <OperationCell sequence={w.seq} name={w.operationName} workCentre={w.workCentreCode} />,
    },
    { key: 'productCode', header: 'Product', width: '11rem', render: (w) => <span className="font-mono text-2xs">{w.productCode}</span> },
    { key: 'machineCode', header: 'Machine', width: '8rem', render: (w) => <span className="font-mono text-2xs">{w.machineCode ?? '—'}</span> },
    {
      key: 'inputQty',
      header: 'In',
      align: 'right',
      width: '7rem',
      accessor: (w) => w.inputQty,
      render: (w) => <span className="tabular text-xs">{formatQty(w.inputQty)}</span>,
    },
    {
      key: 'producedQty',
      header: 'Good / scrap',
      align: 'right',
      width: '9rem',
      accessor: (w) => w.producedQty,
      render: (w) => (
        <span className="tabular text-xs">
          {formatQty(w.producedQty)}
          {w.scrapQty > 0 && <span className="text-danger"> / {formatQty(w.scrapQty)}</span>}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Booked',
      width: '9rem',
      accessor: (w) => yieldPct(w),
      render: (w) => <ProgressCell done={booked(w)} total={w.inputQty || w.plannedQty} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '10rem',
      accessor: (w) => w.status,
      render: (w) => (
        <div>
          <Badge tone={STATUS_TONE[w.status] ?? 'neutral'} size="sm">
            {w.status.replace('_', ' ').toLowerCase()}
          </Badge>
          {w.qcCheckpoint && w.qcResult !== 'NOT_REQUIRED' && (
            <p className="mt-0.5 text-3xs text-fg-subtle">QC {w.qcResult.toLowerCase()}</p>
          )}
        </div>
      ),
    },
    {
      key: 'blockedReason',
      header: 'Waiting on',
      width: '14rem',
      render: (w) => <span className="text-2xs text-fg-muted">{w.blockedReason ?? '—'}</span>,
    },
  ]

  const runningCount = rows.filter((w) => w.status === 'RUNNING').length
  const holdCount = rows.filter((w) => w.status === 'QC_HOLD' || w.status === 'HOLD').length

  return (
    <div>
      <PageHeader
        title="Work orders"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Work orders' }]}
      />

      {!loading && !rows.length && (
        <Alert tone="info" className="mb-4">
          Nothing has been released to the floor. A planner releases a production order in Planning,
          and its routing operations appear here as work orders.
        </Alert>
      )}

      {holdCount > 0 && (
        <Alert tone="warning" className="mb-4">
          {holdCount} operation{holdCount === 1 ? ' is' : 's are'} held. A lot waiting on inspection
          passes nothing to the next operation until quality decides.
        </Alert>
      )}

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(w) => w.uid}
        loading={loading}
        searchPlaceholder="Search work order, order, product or work centre…"
        toolbar={
          <Tabs
            tabs={[
              { id: 'active', label: 'On the floor', count: rows.filter((w) => ACTIVE.includes(w.status)).length },
              { id: 'queued', label: 'Queued', count: rows.filter((w) => w.status === 'QUEUED').length },
              { id: 'hold', label: 'Held', count: holdCount },
              { id: 'done', label: 'Finished', count: rows.filter((w) => w.status === 'COMPLETED').length },
              { id: 'all', label: 'All', count: rows.length },
            ]}
            active={tab}
            onChange={setTab}
          />
        }
        onRowClick={setDetail}
        onExport={(f: ExportFormat) => {
          const n = exportRows(f, 'work-orders', 'Work orders', columnsFromTable(columns), filtered)
          toast.success('Export ready', `${n} rows written.`)
        }}
        emptyTitle="No work orders"
        emptyDescription="Release a production order in Planning to put work on the floor."
        rowClassName={(w) => cn(w.status === 'RUNNING' && 'bg-success/[0.04]', (w.status === 'QC_HOLD' || w.status === 'HOLD') && 'bg-danger/[0.04]')}
        rowActions={(w) => (
          <>
            <MenuItem label="Open" onClick={() => setDetail(w)} />
            <MenuItem
              label="Start"
              icon={<Play />}
              disabled={!w.canStart || w.status === 'RUNNING'}
              onClick={() => act('Started', () => productionApi.startOperation(w.uid), () => `${w.docNo} is running on ${w.workCentreCode}.`)}
            />
            <MenuItem
              label="Book production"
              disabled={w.status !== 'RUNNING' && w.status !== 'PAUSED'}
              onClick={() => openBooking(w)}
            />
            <MenuItem
              label="Pause"
              icon={<Pause />}
              disabled={w.status !== 'RUNNING'}
              onClick={() => act('Paused', () => productionApi.pauseOperation(w.uid), () => `${w.docNo} is paused.`)}
            />
            <MenuItem
              label="Resume"
              disabled={w.status !== 'PAUSED' && w.status !== 'HOLD'}
              onClick={() => act('Resumed', () => productionApi.resumeOperation(w.uid), () => `${w.docNo} is running again.`)}
            />
            <MenuItem
              label="Complete"
              icon={<Square />}
              separatorBefore
              disabled={w.status !== 'RUNNING' && w.status !== 'PAUSED'}
              onClick={() =>
                act(
                  'Completed',
                  () => productionApi.completeOperation(w.uid),
                  (r: any) =>
                    r.awaitingQc
                      ? `${w.docNo} is held for inspection. Nothing moves on until quality decides.`
                      : r.finishedGoods
                        ? `${formatQty(r.finishedGoods.quantity)} received into finished goods on ${r.finishedGoods.documentNo}.`
                        : `${formatQty(r.next?.inputQty ?? 0)} passed to operation ${r.next?.seq}.`,
                )
              }
            />
            <MenuItem
              label="Record QC decision"
              icon={<Check />}
              disabled={!w.qcCheckpoint || w.status !== 'QC_HOLD'}
              onClick={() => {
                setQcTarget(w)
                setQc({ result: 'PASS', inspectionDocNo: '', note: '' })
              }}
            />
            <MenuItem
              label="Hold"
              icon={<Hand />}
              danger
              separatorBefore
              disabled={['COMPLETED', 'CANCELLED'].includes(w.status)}
              onClick={() => {
                setHoldTarget(w)
                setHoldReason('')
              }}
            />
          </>
        )}
      />

      <Card className="mt-4">
        <CardBody>
          <DataGrid
            items={[
              { label: 'Running now', value: String(runningCount) },
              { label: 'Held', value: String(holdCount) },
              { label: 'Released operations', value: String(rows.length) },
              {
                label: 'Good booked today',
                value: formatQty(rows.reduce((s, w) => s + w.producedQty, 0)),
              },
            ]}
          />
        </CardBody>
      </Card>

      {/* Detail ------------------------------------------------------------ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.docNo ?? ''}
        description={detail ? `${detail.orderDocNo} · ${detail.productCode}` : ''}
        width="42rem"
      >
        {detail && (
          <div className="space-y-4">
            {detail.blockedReason && <Alert tone="warning">{detail.blockedReason}</Alert>}
            <MesDetailBlock title="The operation, as the routing specified it">
              <DataGrid
                items={[
                  { label: 'Operation', value: `${detail.seq} · ${detail.operationName}` },
                  { label: 'Work centre', value: detail.workCentreCode },
                  { label: 'Machine', value: detail.machineCode ?? 'Any' },
                  { label: 'Tool', value: detail.toolCode ?? 'None' },
                  { label: 'Skill', value: detail.skill || '—' },
                  { label: 'Operators', value: String(detail.operators) },
                  { label: 'Setup (std)', value: `${detail.setupMinutesStd} min` },
                  { label: 'Run (std)', value: `${detail.runMinutesStd} min` },
                  { label: 'QC checkpoint', value: detail.qcCheckpoint ? `Yes — ${detail.qcResult.toLowerCase()}` : 'No' },
                ]}
              />
            </MesDetailBlock>
            <MesDetailBlock title="What has actually happened">
              <DataGrid
                items={[
                  { label: 'Received', value: `${formatQty(detail.inputQty)} ${detail.uom}` },
                  { label: 'Good', value: formatQty(detail.producedQty) },
                  { label: 'Scrap', value: formatQty(detail.scrapQty) },
                  { label: 'Rework', value: formatQty(detail.reworkQty) },
                  { label: 'Still unbooked', value: formatQty(detail.inputQty - booked(detail)) },
                  { label: 'Operator', value: detail.operatorName ?? '—' },
                  { label: 'Started', value: detail.startedAt ? formatDateTime(detail.startedAt) : '—' },
                  { label: 'Completed', value: detail.completedAt ? formatDateTime(detail.completedAt) : '—' },
                  { label: 'Batch', value: detail.batchNo || '—' },
                ]}
              />
            </MesDetailBlock>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<Play className="h-3.5 w-3.5" />} disabled={!detail.canStart || detail.status === 'RUNNING'} onClick={() => act('Started', () => productionApi.startOperation(detail.uid), () => `${detail.docNo} is running.`)}>
                Start
              </Button>
              <Button size="sm" variant="outline" disabled={detail.status !== 'RUNNING' && detail.status !== 'PAUSED'} onClick={() => openBooking(detail)}>
                Book production
              </Button>
              <Button size="sm" variant="outline" disabled={detail.status !== 'RUNNING' && detail.status !== 'PAUSED'} onClick={() => act('Completed', () => productionApi.completeOperation(detail.uid), (r: any) => (r.awaitingQc ? 'Held for inspection.' : 'Operation complete.'))}>
                Complete
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Book production --------------------------------------------------- */}
      <Modal
        open={!!booking}
        onClose={() => setBooking(null)}
        title={booking ? `Book production on ${booking.docNo}` : ''}
        description={booking ? `${booking.operationName} · ${formatQty(booking.inputQty - booked(booking))} of ${formatQty(booking.inputQty)} still unbooked` : ''}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setBooking(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={postEntry}>
              Post entry
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-3">
          <Input label="Good" type="number" min={0} required value={entry.goodQty} error={entryErrors.goodQty} onChange={(e) => setEntry({ ...entry, goodQty: e.target.value })} />
          <Input label="Scrap" type="number" min={0} value={entry.scrapQty} onChange={(e) => setEntry({ ...entry, scrapQty: e.target.value })} />
          <Input label="Rework" type="number" min={0} value={entry.reworkQty} onChange={(e) => setEntry({ ...entry, reworkQty: e.target.value })} />
          <Input
            label="Scrap reason"
            containerClassName="sm:col-span-3"
            value={entry.scrapReason}
            error={entryErrors.scrapReason}
            hint="Recorded against the order and the operation; scrap is a document, not a number."
            onChange={(e) => setEntry({ ...entry, scrapReason: e.target.value })}
          />
          <Textarea label="Remarks" containerClassName="sm:col-span-3" rows={2} value={entry.remarks} onChange={(e) => setEntry({ ...entry, remarks: e.target.value })} />
        </div>
      </Modal>

      {/* QC decision ------------------------------------------------------- */}
      <Modal
        open={!!qcTarget}
        onClose={() => setQcTarget(null)}
        title={qcTarget ? `Quality decision on ${qcTarget.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setQcTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!qcTarget) return
                try {
                  const r = await productionApi.recordQc(qcTarget.uid, qc)
                  toast.success(
                    'Quality decision recorded',
                    r.released
                      ? `${qcTarget.docNo} passed; ${formatQty(r.next?.inputQty ?? r.finishedGoods?.quantity ?? 0)} moved on.`
                      : `${qcTarget.docNo} stays held. Nothing moved on.`,
                  )
                  setQcTarget(null)
                  await load()
                } catch (err) {
                  toast.error('Could not record the decision', message(err, 'Nothing changed.'))
                }
              }}
            >
              Record
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select
            label="Decision"
            value={qc.result}
            onChange={(e) => setQc({ ...qc, result: e.target.value })}
            options={[
              { value: 'PASS', label: 'Pass — release the quantity to the next operation' },
              { value: 'FAIL', label: 'Fail — nothing moves on' },
              { value: 'REWORK', label: 'Rework — hold for repair' },
              { value: 'HOLD', label: 'Hold — awaiting a decision' },
            ]}
          />
          <Input
            label="Inspection document"
            value={qc.inspectionDocNo}
            hint="Optional. Checked against Quality; an unknown number is refused rather than invented."
            onChange={(e) => setQc({ ...qc, inspectionDocNo: e.target.value })}
          />
          <Textarea label="Note" rows={2} value={qc.note} onChange={(e) => setQc({ ...qc, note: e.target.value })} />
        </div>
      </Modal>

      {/* Hold -------------------------------------------------------------- */}
      <Modal
        open={!!holdTarget}
        onClose={() => setHoldTarget(null)}
        title={holdTarget ? `Hold ${holdTarget.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setHoldTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!holdTarget) return
                try {
                  await productionApi.holdOperation(holdTarget.uid, holdReason)
                  toast.success('Held', `${holdTarget.docNo} is on hold.`)
                  setHoldTarget(null)
                  await load()
                } catch (err) {
                  toast.error('Could not hold', message(err, 'Nothing changed.'))
                }
              }}
            >
              Hold
            </Button>
          </>
        }
      >
        <Textarea label="Reason" required rows={3} value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
      </Modal>
    </div>
  )
}
