import { useMemo, useState } from 'react'
import { ArrowLeftRight, CalendarClock, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { OrderStatusBadge, PriorityBadge } from '@/components/planning/PlanShell'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatDate, formatDateTime, formatQty } from '@/lib/format'
import { addDays, iso, plantHoursOn, routingMinutesFor, scheduleRouting } from '@/lib/planFlow'
import { defaultRoutingFor } from '@/lib/engFlow'
import { usePlanningData } from './usePlanningData'
import type { ProductionOrder } from '@/types/planning'

/**
 * Scheduling and machine loading (Ch 13 and 14).
 *
 * Two views of the same orders. The board shows what each work centre is doing
 * day by day, so a clash is something you see rather than something you find
 * out about. Re-scheduling an order is forward from a start date or backward
 * from a due date — backward is the one that answers "can this still be made in
 * time", because it reports the date the order had to have started.
 */

const OPEN: ProductionOrder['status'][] = ['PLANNED', 'FIRM_PLANNED', 'RELEASED', 'MATERIAL_RESERVED', 'MATERIAL_ISSUED', 'IN_PRODUCTION']
const DAYS_SHOWN = 21

export function SchedulePage() {
  const toast = useToast()
  const { orders, ctx, workCentres, starts } = usePlanningData()

  const [tab, setTab] = useState('board')
  const [rescheduling, setRescheduling] = useState<ProductionOrder | null>(null)
  const [direction, setDirection] = useState<'FORWARD' | 'BACKWARD'>('FORWARD')
  const [anchor, setAnchor] = useState('')

  const open = orders.rows.filter((o) => !o.deletedAt && OPEN.includes(o.status))

  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => iso(addDays(starts[0], i))), [starts])

  /**
   * Every scheduled operation, keyed by work centre and day. An operation that
   * spans days appears on each of them, because that is what occupies the centre.
   */
  const board = useMemo(() => {
    const map = new Map<string, Map<string, { order: ProductionOrder; opName: string; minutes: number }[]>>()
    for (const o of open) {
      for (const op of o.operations) {
        const start = op.plannedStart.slice(0, 10)
        const finish = op.plannedFinish.slice(0, 10)
        const total = op.setupMinutes + op.runMinutes
        const span = Math.max(1, Math.round((new Date(finish).getTime() - new Date(start).getTime()) / 86_400_000) + 1)
        for (let i = 0; i < span; i++) {
          const day = iso(addDays(start, i))
          if (!days.includes(day)) continue
          if (!map.has(op.workCentreCode)) map.set(op.workCentreCode, new Map())
          const byDay = map.get(op.workCentreCode)!
          byDay.set(day, [...(byDay.get(day) ?? []), { order: o, opName: op.operationName, minutes: total / span }])
        }
      }
    }
    return map
  }, [open, days])

  const centres = workCentres.rows.filter((w) => w.isActive && !w.deletedAt)

  function reschedule() {
    if (!rescheduling || !anchor) return
    const routing = defaultRoutingFor(rescheduling.productCode, ctx.routings)
    if (!routing) {
      toast.error('No routing', `${rescheduling.productCode} has no live routing, so it cannot be scheduled.`)
      return
    }
    const operations = scheduleRouting(routing, rescheduling.qty, anchor, direction, ctx.calendar)
    const first = operations[0]?.plannedStart.slice(0, 10) ?? anchor
    const last = operations[operations.length - 1]?.plannedFinish.slice(0, 10) ?? anchor

    orders.update(rescheduling.uid, {
      operations,
      plannedStart: first,
      plannedFinish: last,
      version: rescheduling.version + 1,
    })

    const late = direction === 'BACKWARD' && first < starts[0]
    if (late) {
      toast.error(
        'Scheduled, but it cannot be made in time',
        `To finish by ${formatDate(anchor)} the order had to start on ${formatDate(first)} — that is already past.`,
      )
    } else {
      toast.success(
        'Rescheduled',
        `${rescheduling.docNo} now runs ${formatDate(first)} to ${formatDate(last)} across ${operations.length} operations.`,
      )
    }
    setRescheduling(null)
  }

  /** What a backward schedule would say, shown live in the dialog. */
  const preview = useMemo(() => {
    if (!rescheduling || !anchor) return null
    const routing = defaultRoutingFor(rescheduling.productCode, ctx.routings)
    if (!routing) return null
    const ops = scheduleRouting(routing, rescheduling.qty, anchor, direction, ctx.calendar)
    if (!ops.length) return null
    return {
      first: ops[0].plannedStart,
      last: ops[ops.length - 1].plannedFinish,
      hours: routingMinutesFor(routing, rescheduling.qty) / 60,
      count: ops.length,
      isImpossible: direction === 'BACKWARD' && ops[0].plannedStart.slice(0, 10) < starts[0],
    }
  }, [rescheduling, anchor, direction, ctx, starts])

  function doExport(format: ExportFormat) {
    interface Row { order: string; product: string; seq: number; op: string; centre: string; start: string; finish: string }
    const data: Row[] = open.flatMap((o) =>
      o.operations.map((op) => ({
        order: o.docNo,
        product: o.productCode,
        seq: op.seq,
        op: op.operationName,
        centre: op.workCentreCode,
        start: op.plannedStart,
        finish: op.plannedFinish,
      })),
    )
    const columns: ExportColumn<Row>[] = [
      { header: 'Order', value: (r) => r.order },
      { header: 'Product', value: (r) => r.product },
      { header: 'Seq', value: (r) => r.seq },
      { header: 'Operation', value: (r) => r.op },
      { header: 'Work centre', value: (r) => r.centre },
      { header: 'Planned start', value: (r) => r.start },
      { header: 'Planned finish', value: (r) => r.finish },
    ]
    const n = exportRows(format, 'production-schedule', 'Production schedule', columns, data)
    toast.success('Export ready', `${n} rows written.`)
  }

  const unscheduled = open.filter((o) => !o.operations.length)

  return (
    <div>
      <PageHeader
        title="Schedule board"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'Schedule' }]}
        actions={
          <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => doExport('xlsx')}>
            Export
          </Button>
        }
        tabs={
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'board', label: 'Machine loading' },
              { id: 'orders', label: 'Orders', count: open.length },
            ]}
          />
        }
      />

      {unscheduled.length > 0 && (
        <Alert tone="warning" className="mb-4">
          {unscheduled.length} open order{unscheduled.length === 1 ? '' : 's'} {unscheduled.length === 1 ? 'has' : 'have'} no
          scheduled operations — {unscheduled.map((o) => o.docNo).join(', ')}. They occupy no capacity on this board,
          which flatters it.
        </Alert>
      )}

      {tab === 'board' && (
        <Card>
          <CardHeader
            title="Work centre loading"
            description={`${DAYS_SHOWN} days from ${formatDate(days[0])} · each cell shows the orders occupying that centre`}
          />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-surface-2" style={{ minWidth: '12rem' }}>Work centre</th>
                    {days.map((d) => {
                      const hours = plantHoursOn(d, ctx.calendar)
                      return (
                        <th key={d} className={cn('text-center', hours === 0 && 'bg-surface-3')} style={{ minWidth: '4.5rem' }}>
                          <span className="block">{formatDate(d).slice(0, 6)}</span>
                          <span className={cn('block text-[9px] font-normal normal-case', hours === 0 ? 'text-danger' : 'text-fg-subtle')}>
                            {hours === 0 ? 'closed' : `${hours}h`}
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {centres.map((w) => {
                    const byDay = board.get(w.code)
                    return (
                      <tr key={w.uid}>
                        <td className="sticky left-0 z-10 bg-surface">
                          <p className="text-xs font-medium text-fg">{w.name}</p>
                          <p className="font-mono text-2xs text-fg-subtle">{w.code}</p>
                        </td>
                        {days.map((d) => {
                          const entries = byDay?.get(d) ?? []
                          const hours = plantHoursOn(d, ctx.calendar)
                          const loadMin = entries.reduce((s, e) => s + e.minutes, 0)
                          const pct = hours > 0 ? (loadMin / (hours * 60)) * 100 : 0
                          return (
                            <td key={d} className={cn('px-1 text-center align-top', hours === 0 && 'bg-surface-3')}>
                              {entries.length === 0 ? (
                                <span className="text-2xs text-fg-subtle">—</span>
                              ) : (
                                <span
                                  title={entries.map((e) => `${e.order.docNo} · ${e.opName}`).join('\n')}
                                  className={cn(
                                    'block truncate rounded px-1 py-0.5 text-[9px] font-medium',
                                    pct > 100 ? 'bg-danger/15 text-danger' : pct > 85 ? 'bg-warning/15 text-warning' : 'bg-brand-500/15 text-brand-600',
                                  )}
                                >
                                  {entries.length === 1 ? entries[0].order.docNo.slice(-4) : `${entries.length} ops`}
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'board' && (
        <p className="mt-2 text-2xs text-fg-subtle">
          Closed days come from the production calendar — holidays, the weekly off and the maintenance shutdown. Nothing
          is scheduled across them, which is why an order's finish date moves out when a holiday lands mid-run.
        </p>
      )}

      {tab === 'orders' && (
        <Card>
          <CardHeader title="Open orders" description="Re-schedule forward from a start date, or backward from a due date" />
          <CardBody className="p-0">
            {!open.length ? (
              <EmptyState title="Nothing open" description="Firm an MRP suggestion or raise an order to schedule it." />
            ) : (
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Product</th>
                      <th className="text-right" style={{ width: '7.5rem' }}>Quantity</th>
                      <th className="text-right" style={{ width: '6rem' }}>Hours</th>
                      <th style={{ width: '6rem' }}>Priority</th>
                      <th style={{ width: '11rem' }}>First operation</th>
                      <th style={{ width: '11rem' }}>Last operation</th>
                      <th style={{ width: '10rem' }}>Status</th>
                      <th className="text-right" style={{ width: '7rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.map((o) => {
                      const routing = defaultRoutingFor(o.productCode, ctx.routings)
                      const hours = routing ? routingMinutesFor(routing, o.qty) / 60 : 0
                      return (
                        <tr key={o.uid}>
                          <td className="font-mono text-2xs font-medium text-brand-600">{o.docNo}</td>
                          <td>
                            <p className="text-xs font-medium text-fg">{o.productName}</p>
                            <p className="font-mono text-2xs text-fg-subtle">{o.productCode}</p>
                          </td>
                          <td className="text-right tabular text-xs">{formatQty(o.qty, 0)} {o.uom}</td>
                          <td className="text-right tabular text-xs">{hours.toFixed(1)}</td>
                          <td><PriorityBadge priority={o.priority} /></td>
                          <td className="text-2xs text-fg-muted">{o.operations.length ? formatDateTime(o.operations[0].plannedStart) : <Badge tone="warning" size="sm">not scheduled</Badge>}</td>
                          <td className="text-2xs text-fg-muted">{o.operations.length ? formatDateTime(o.operations[o.operations.length - 1].plannedFinish) : '—'}</td>
                          <td><OrderStatusBadge status={o.status} /></td>
                          <td className="text-right">
                            <Button
                              size="xs"
                              variant="outline"
                              icon={<CalendarClock className="h-3 w-3" />}
                              onClick={() => {
                                setRescheduling(o)
                                setDirection('FORWARD')
                                setAnchor(o.plannedStart)
                              }}
                            >
                              Schedule
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Re-schedule ---------------------------------------------------------- */}
      <Modal
        open={!!rescheduling}
        onClose={() => setRescheduling(null)}
        title={rescheduling ? `Schedule ${rescheduling.docNo}` : ''}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRescheduling(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!anchor} onClick={reschedule}>
              Apply schedule
            </Button>
          </>
        }
      >
        {rescheduling && (
          <div className="space-y-3.5">
            <p className="text-sm text-fg-muted">
              {formatQty(rescheduling.qty, 0)} {rescheduling.uom} of{' '}
              <span className="font-medium text-fg">{rescheduling.productCode}</span>.
            </p>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Select
                label="Direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'FORWARD' | 'BACKWARD')}
                options={[
                  { value: 'FORWARD', label: 'Forward — start on this date' },
                  { value: 'BACKWARD', label: 'Backward — finish by this date' },
                ]}
              />
              <Input
                label={direction === 'FORWARD' ? 'Start on' : 'Finish by'}
                type="date"
                required
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
              />
            </div>

            {preview && (
              <div className={cn('rounded border p-3 text-xs', preview.isImpossible ? 'border-danger/40 bg-danger/5' : 'border-border bg-surface-2')}>
                <p className="flex items-center gap-1.5 font-medium text-fg">
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  {preview.hours.toFixed(1)} shop hours across {preview.count} operations
                </p>
                <p className="mt-1 text-fg-muted">
                  Runs {formatDateTime(preview.first)} to {formatDateTime(preview.last)}, with closed days skipped.
                </p>
                {preview.isImpossible && (
                  <p className="mt-1.5 font-medium text-danger">
                    To finish by {formatDate(anchor)} this order had to start on {formatDate(preview.first)} — that date
                    has passed. Split the lot, add a shift, or move the due date.
                  </p>
                )}
              </div>
            )}

            <p className="text-2xs text-fg-subtle">
              Scheduling is sequential: each operation starts when the one before it finishes. Finite loading against
              other orders on the same centre is shown on the capacity screen rather than enforced here.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
