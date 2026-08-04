import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { Duration, MesStatusBadge, OperationCell } from '@/components/mes/MesShell'
import { exportRows } from '@/lib/export'
import { formatQty } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCollection } from '@/store/data'
import { machines as seedMachines, operatorStats, workOrders as seedWorkOrders } from '@/mock/mes'
import type { Machine, OperatorStat, WorkOrder } from '@/types/mes'

/**
 * Operation queue — the dispatch list. What each work centre should run next,
 * in sequence, with the machine and operator to put on it.
 */
export function OperationQueuePage() {
  const toast = useToast()
  const navigate = useNavigate()
  const woSeed = useMemo(() => seedWorkOrders, [])
  const mcSeed = useMemo(() => seedMachines, [])
  const { rows: workOrders, update } = useCollection<WorkOrder>('mes:workorder', woSeed)
  const { rows: machines } = useCollection<Machine>('mes:machine', mcSeed)

  const [assignTarget, setAssignTarget] = useState<WorkOrder | null>(null)
  const [assign, setAssign] = useState({ machine: '', operator: '', shift: 'A' })

  const queue = workOrders.filter((w) => ['READY', 'SETUP', 'RUNNING', 'PAUSED', 'QUEUED'].includes(w.status))
  const workCentres = [...new Set(queue.map((w) => w.workCentre))]

  /** An operation is startable only when everything before it is done. */
  function isBlocked(w: WorkOrder) {
    return workOrders.some((x) => x.productionOrderNo === w.productionOrderNo && x.sequence < w.sequence && x.status !== 'COMPLETED')
  }

  function certifiedFor(w: WorkOrder): OperatorStat[] {
    return operatorStats.filter((o) => o.present && (o.workCentre === w.workCentre || o.certifiedFor.some((c) => w.operationName.toLowerCase().includes(c.toLowerCase().split(' ')[0]))))
  }

  function saveAssignment() {
    if (!assignTarget) return
    if (!assign.machine || !assign.operator) {
      toast.error('Both are needed', 'A work order needs a machine and a certified operator before it can run.')
      return
    }
    const busy = workOrders.find((w) => w.machine === assign.machine && w.status === 'RUNNING' && w.uid !== assignTarget.uid)
    if (busy) {
      toast.error('Machine already running', `${assign.machine} is on ${busy.docNo}. Finish or pause that first.`)
      return
    }
    update(assignTarget.uid, { machine: assign.machine, operator: assign.operator, shift: assign.shift as WorkOrder['shift'], status: assignTarget.status === 'QUEUED' ? 'READY' : assignTarget.status })
    toast.success('Assigned', `${assignTarget.operationName} → ${assign.machine} with ${assign.operator} on shift ${assign.shift}.`)
    setAssignTarget(null)
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
              onClick={() => {
                try {
                  exportRows('pdf', 'dispatch-list', 'Dispatch list — today', [
                    { header: 'Work centre', value: (w: WorkOrder) => w.workCentre },
                    { header: 'Seq', value: (w) => String(w.sequence) },
                    { header: 'Work order', value: (w) => w.docNo },
                    { header: 'Operation', value: (w) => w.operationName },
                    { header: 'Machine', value: (w) => w.machine ?? '—' },
                    { header: 'Operator', value: (w) => w.operator ?? 'unassigned' },
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
        What each work centre runs next, in routing sequence. A greyed row is waiting on the operation in front of it — starting
        it is refused, because the material is not there yet.
      </p>

      <div className="space-y-4">
        {workCentres.map((wc) => {
          const rows = queue.filter((w) => w.workCentre === wc).sort((a, b) => a.sequence - b.sequence)
          const running = rows.filter((w) => w.status === 'RUNNING').length
          return (
            <Card key={wc}>
              <CardHeader
                title={wc}
                description={`${rows.length} operation${rows.length === 1 ? '' : 's'} queued · ${running} running`}
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
                      {rows.map((w) => {
                        const blocked = isBlocked(w)
                        return (
                          <tr key={w.uid} className={cn(blocked && 'opacity-55', w.status === 'RUNNING' && 'bg-success/[0.04]')}>
                            <td>
                              <p className="font-mono text-2xs font-medium text-brand-600">{w.docNo}</p>
                              <p className="font-mono text-2xs text-fg-subtle">{w.productionOrderNo}</p>
                            </td>
                            <td><OperationCell sequence={w.sequence} name={w.operationName} /></td>
                            <td className="font-mono text-2xs">{w.machine ?? <span className="text-danger">not set</span>}</td>
                            <td className="text-xs">{w.operator ?? <span className="text-danger">not set</span>}</td>
                            <td className="text-right tabular">{formatQty(w.inputQty || w.plannedQty)}</td>
                            <td><Duration minutes={w.standardMinutes} /></td>
                            <td><MesStatusBadge status={w.status} size="sm" /></td>
                            <td>
                              <div className="flex flex-wrap gap-1.5">
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => {
                                    setAssignTarget(w)
                                    setAssign({ machine: w.machine ?? '', operator: w.operator ?? '', shift: w.shift ?? 'A' })
                                  }}
                                >
                                  Assign
                                </Button>
                                <Button
                                  variant="success"
                                  size="xs"
                                  icon={<Play className="h-3 w-3" />}
                                  disabled={blocked || w.status === 'RUNNING' || !w.machine || !w.operator}
                                  onClick={() => {
                                    update(w.uid, { status: 'RUNNING', startedAt: new Date().toISOString() })
                                    toast.success('Started', `${w.operationName} running on ${w.machine}.`)
                                  }}
                                >
                                  Start
                                </Button>
                              </div>
                              {blocked && <p className="mt-1 text-2xs text-warning">Waiting on the previous operation</p>}
                            </td>
                          </tr>
                        )
                      })}
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
            <Button variant="primary" onClick={saveAssignment}>Assign</Button>
          </>
        }
      >
        {assignTarget && (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-muted">
              {assignTarget.docNo} · {assignTarget.workCentre} · {formatQty(assignTarget.inputQty || assignTarget.plannedQty)}{' '}
              {assignTarget.uom} to run.
            </p>
            <Select
              label="Machine"
              value={assign.machine}
              onChange={(e) => setAssign({ ...assign, machine: e.target.value })}
              options={[
                { value: '', label: 'Choose a machine…' },
                ...machines
                  .filter((m) => m.workCentre === assignTarget.workCentre)
                  .map((m) => ({ value: m.code, label: `${m.code} — ${m.name}${m.state === 'BREAKDOWN' ? ' (down)' : m.state === 'RUNNING' ? ' (busy)' : ''}` })),
              ]}
            />
            <Select
              label="Operator"
              value={assign.operator}
              onChange={(e) => setAssign({ ...assign, operator: e.target.value })}
              hint="Only operators present today and certified for this work centre are listed"
              options={[
                { value: '', label: 'Choose an operator…' },
                ...certifiedFor(assignTarget).map((o) => ({ value: o.name, label: `${o.name} — ${o.skill}` })),
              ]}
            />
            <Select
              label="Shift"
              value={assign.shift}
              onChange={(e) => setAssign({ ...assign, shift: e.target.value })}
              options={[{ value: 'A', label: 'A — morning' }, { value: 'B', label: 'B — evening' }, { value: 'C', label: 'C — night' }]}
            />
            <p className="rounded border border-border bg-surface-2 px-3 py-2 text-2xs text-fg-subtle">
              A machine already running another work order cannot be assigned a second one, and an operator without the
              certification for this work centre does not appear in the list.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
