import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { Duration, MesStatusBadge, OperationCell } from '@/components/mes/MesShell'
import { exportRows } from '@/lib/export'
import { formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ProblemError } from '@/api/client'
import { getMachines } from '@/api/masters'
import { productionApi, type WorkOrderRow } from '@/api/production'

/**
 * Operation queue — the dispatch list, read from the shop floor.
 *
 * Every row is a work order the server has released. Whether an operation may
 * start is the server's answer, not this screen's: `canStart` and
 * `blockedReason` arrive with each row, so the button and the explanation
 * always agree with what the server would actually allow.
 *
 * Assigning sets a machine and a shift. It deliberately does not set an
 * operator: the operator is recorded when someone signs in and presses start,
 * so a name chosen in advance would be overwritten the moment the job ran.
 */

/** Operations still waiting, running or paused. A finished one leaves the list. */
const QUEUE_STATES = ['QUEUED', 'READY', 'RUNNING', 'PAUSED', 'HOLD', 'QC_HOLD']

interface MachineRow {
  code: string
  name: string
  workCentreCode?: string | null
  workCentre?: string | null
  currentState?: string | null
  status?: string | null
}

export function OperationQueuePage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState<WorkOrderRow[]>([])
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<WorkOrderRow | null>(null)
  const [assign, setAssign] = useState({ machine: '', shift: '' })
  const [busy, setBusy] = useState(false)

  function message(err: unknown, fallback: string) {
    return err instanceof ProblemError ? err.problem.detail : fallback
  }

  async function load() {
    try {
      const work = await productionApi.getWorkOrders()
      setRows(work)
      setError(null)
    } catch (err) {
      setError(message(err, 'Could not reach the backend.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // The machine master is a separate module; a failure there must not blank
    // the queue, so it is loaded on its own and degrades to a free choice.
    getMachines()
      .then((list) => setMachines(Array.isArray(list) ? list : []))
      .catch(() => setMachines([]))
  }, [])

  const queue = useMemo(() => rows.filter((w) => QUEUE_STATES.includes(w.status)), [rows])
  const workCentres = useMemo(
    () => [...new Set(queue.map((w) => w.workCentreCode))].sort(),
    [queue],
  )

  /** Machines the master says belong to this work centre. */
  function machinesFor(workCentre: string) {
    const scoped = machines.filter(
      (m) => (m.workCentreCode ?? m.workCentre ?? '') === workCentre,
    )
    return scoped.length ? scoped : machines
  }

  async function saveAssignment() {
    if (!assignTarget) return
    if (!assign.machine && !assign.shift) {
      toast.error('Nothing to assign', 'Choose a machine, a shift, or both.')
      return
    }
    setBusy(true)
    try {
      await productionApi.assignOperation(assignTarget.uid, {
        machineCode: assign.machine || undefined,
        shiftCode: assign.shift || undefined,
      })
      toast.success(
        'Assigned',
        `${assignTarget.operationName} → ${assign.machine || 'machine unchanged'}${
          assign.shift ? ` on shift ${assign.shift}` : ''
        }.`,
      )
      setAssignTarget(null)
      await load()
    } catch (err) {
      toast.error('Not assigned', message(err, 'The server refused the assignment.'))
    } finally {
      setBusy(false)
    }
  }

  async function start(w: WorkOrderRow) {
    try {
      await productionApi.startOperation(w.uid, { machineCode: w.machineCode ?? undefined })
      toast.success('Started', `${w.operationName} is running${w.machineCode ? ` on ${w.machineCode}` : ''}.`)
      await load()
    } catch (err) {
      toast.error('Not started', message(err, 'The server refused to start this operation.'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Operation queue"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Shop floor', to: '/production' }, { label: 'Operation queue' }]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!queue.length}
              onClick={() => {
                try {
                  exportRows('pdf', 'dispatch-list', 'Dispatch list', [
                    { header: 'Work centre', value: (w: WorkOrderRow) => w.workCentreCode },
                    { header: 'Seq', value: (w) => String(w.seq) },
                    { header: 'Work order', value: (w) => w.docNo },
                    { header: 'Operation', value: (w) => w.operationName },
                    { header: 'Machine', value: (w) => w.machineCode ?? '—' },
                    { header: 'Operator', value: (w) => w.operatorName ?? 'recorded at start' },
                    { header: 'Quantity', value: (w) => formatQty(w.inputQty || w.plannedQty) },
                    { header: 'Status', value: (w) => w.status },
                  ], queue)
                  toast.success('Dispatch list printed', 'One sheet per work centre for the shift board.')
                } catch (e) {
                  toast.error('Print failed', e instanceof Error ? e.message : 'Unknown error.')
                }
              }}
            >
              Print dispatch list
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/production/entry')}>Book production</Button>
          </>
        }
      />

      <p className="mb-4 text-xs text-fg-muted">
        What each work centre runs next, in routing sequence. A greyed row is waiting on the operation in front of it — the
        server refuses to start it, because the material is not there yet.
      </p>

      {error && (
        <Alert tone="danger" title="The queue could not be loaded" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && <p className="text-xs text-fg-muted">Loading the floor…</p>}

      {!loading && !error && !queue.length && (
        <Alert tone="info" title="Nothing is queued">
          No released operation is waiting, running or on hold. Release a production order to put work on the floor.
        </Alert>
      )}

      <div className="space-y-4">
        {workCentres.map((wc) => {
          const centreRows = queue.filter((w) => w.workCentreCode === wc).sort((a, b) => a.seq - b.seq)
          const running = centreRows.filter((w) => w.status === 'RUNNING').length
          return (
            <Card key={wc}>
              <CardHeader
                title={wc}
                description={`${centreRows.length} operation${centreRows.length === 1 ? '' : 's'} queued · ${running} running`}
                actions={
                  <Badge tone={running ? 'success' : 'neutral'} size="sm">
                    {running ? 'Working' : 'Idle'}
                  </Badge>
                }
              />
              <CardBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th className="w-40">Work order</th>
                        <th>Operation</th>
                        <th className="w-32">Machine</th>
                        <th className="w-40">Operator</th>
                        <th className="w-24 text-right">Quantity</th>
                        <th className="w-24">Std time</th>
                        <th className="w-28">Status</th>
                        <th className="w-48">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {centreRows.map((w) => (
                        <tr
                          key={w.uid}
                          className={cn(!w.canStart && w.status !== 'RUNNING' && 'opacity-55', w.status === 'RUNNING' && 'bg-success/[0.04]')}
                        >
                          <td>
                            <p className="font-mono text-2xs font-medium text-brand-600">{w.docNo}</p>
                            <p className="font-mono text-2xs text-fg-subtle">{w.orderDocNo}</p>
                          </td>
                          <td><OperationCell sequence={w.seq} name={w.operationName} /></td>
                          <td className="font-mono text-2xs">{w.machineCode || <span className="text-danger">not set</span>}</td>
                          <td className="text-xs">
                            {w.operatorName || <span className="text-fg-subtle">recorded at start</span>}
                          </td>
                          <td className="text-right tabular">
                            {w.inputQty > 0 ? (
                              formatQty(w.inputQty)
                            ) : (
                              /* Nothing has reached this station yet, so the only
                                 honest figure is what it is planned to run. */
                              <span className="text-2xs text-fg-subtle">{formatQty(w.plannedQty)} planned</span>
                            )}
                          </td>
                          <td><Duration minutes={w.setupMinutesStd + w.runMinutesStd} /></td>
                          <td><MesStatusBadge status={w.status} size="sm" /></td>
                          <td>
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => {
                                  setAssignTarget(w)
                                  setAssign({ machine: w.machineCode ?? '', shift: w.shiftCode ?? '' })
                                }}
                              >
                                Assign
                              </Button>
                              <Button
                                variant="success"
                                size="xs"
                                icon={<Play className="h-3 w-3" />}
                                disabled={!w.canStart}
                                onClick={() => void start(w)}
                              >
                                Start
                              </Button>
                            </div>
                            {w.blockedReason && <p className="mt-1 text-2xs text-warning">{w.blockedReason}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )
        })}
      </div>

      {/* Assign --------------------------------------------------------------- */}
      <Modal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        title={assignTarget ? `Assign — ${assignTarget.operationName}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void saveAssignment()}>Assign</Button>
          </>
        }
      >
        {assignTarget && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              {assignTarget.docNo} · {assignTarget.workCentreCode} ·{' '}
              {formatQty(assignTarget.inputQty || assignTarget.plannedQty)} {assignTarget.uom} to run.
            </p>
            <Select
              label="Machine"
              value={assign.machine}
              onChange={(e) => setAssign({ ...assign, machine: e.target.value })}
              hint={
                machines.length
                  ? 'Machines the master lists against this work centre'
                  : 'The machine master could not be read; the field is left free'
              }
              options={[
                { value: '', label: 'Leave unchanged…' },
                ...machinesFor(assignTarget.workCentreCode).map((m) => ({
                  value: m.code,
                  label: `${m.code} — ${m.name}`,
                })),
              ]}
            />
            <Select
              label="Shift"
              value={assign.shift}
              onChange={(e) => setAssign({ ...assign, shift: e.target.value })}
              options={[
                { value: '', label: 'Leave unchanged…' },
                { value: 'SH-A', label: 'SH-A — morning' },
                { value: 'SH-B', label: 'SH-B — evening' },
                { value: 'SH-C', label: 'SH-C — night' },
              ]}
            />
            <p className="rounded border border-border bg-surface-2 px-3 py-2 text-2xs text-fg-subtle">
              A machine already running another operation is refused by the server. The operator is not assigned here — whoever
              signs in and presses start is recorded as the operator, so the record matches who actually ran the job.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
