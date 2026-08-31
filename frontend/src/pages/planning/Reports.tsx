import { useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Card, CardBody } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/Misc'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/export'
import { formatAmount, formatDate } from '@/lib/format'
import {
  ORDER_STATUS_LABEL,
  bucketIndex,
  capacityPlan,
  forecastAccuracy,
  planningItem,
  routingMinutesFor,
  workingDaysInBucket,
} from '@/lib/planFlow'
import { defaultRoutingFor } from '@/lib/engFlow'
import { usePlanningData } from './usePlanningData'
import { DEMAND_SOURCE_LABEL } from '@/components/planning/PlanShell'

/** Plan against actual output, last eight weeks. */
const planVsActual = [
  { week: 'W-8', planned: 4_200, actual: 4_050, onTimePct: 94 },
  { week: 'W-7', planned: 4_200, actual: 4_310, onTimePct: 97 },
  { week: 'W-6', planned: 4_500, actual: 3_980, onTimePct: 88 },
  { week: 'W-5', planned: 4_500, actual: 4_460, onTimePct: 96 },
  { week: 'W-4', planned: 4_800, actual: 4_120, onTimePct: 86 },
  { week: 'W-3', planned: 4_800, actual: 4_740, onTimePct: 93 },
  { week: 'W-2', planned: 5_000, actual: 5_020, onTimePct: 98 },
  { week: 'W-1', planned: 5_000, actual: 4_580, onTimePct: 91 },
]
/**
 * Planning reports (Ch 21).
 *
 * Every report is computed from the live plan at the moment it is opened, so a
 * demand line added a minute ago is already in the MRP report. All of them
 * export with the columns as shown.
 */

type Row = Record<string, string | number>

interface ReportDef {
  id: string
  name: string
  description: string
  columns: { key: string; header: string; align?: 'right'; width?: string; mono?: boolean }[]
  build: () => Row[]
}

export function PlanningReportsPage() {
  const toast = useToast()
  const { mrp, demand, forecast, mps, orders, ctx, workCentres, starts } = usePlanningData()

  const reports: ReportDef[] = useMemo(
    () => [
      {
        id: 'mps',
        name: 'Master production schedule',
        description: 'What the plant has committed to build, week by week, against the demand behind it',
        columns: [
          { key: 'product', header: 'Product', mono: true, width: '12rem' },
          { key: 'name', header: 'Name' },
          { key: 'week', header: 'Week', width: '5rem' },
          { key: 'start', header: 'Starting', width: '8rem' },
          { key: 'demand', header: 'Demand', align: 'right', width: '8rem' },
          { key: 'planned', header: 'Planned', align: 'right', width: '8rem' },
          { key: 'gap', header: 'Gap', align: 'right', width: '8rem' },
          { key: 'firm', header: 'Firm', width: '6rem' },
        ],
        build: () =>
          [...mps.rows]
            .sort((a, b) => a.productCode.localeCompare(b.productCode) || a.bucket - b.bucket)
            .map((m) => ({
              _key: m.uid,
              product: m.productCode,
              name: m.productName,
              week: `W${m.bucket + 1}`,
              start: formatDate(m.bucketStart),
              demand: m.demandQty,
              planned: m.plannedQty,
              gap: m.plannedQty - m.demandQty,
              firm: m.isFirm ? 'Firm' : '',
            })),
      },
      {
        id: 'mrp',
        name: 'MRP report',
        description: 'Time-phased netting per item — gross requirement, receipts, projection and planned orders',
        columns: [
          { key: 'item', header: 'Item', mono: true, width: '12rem' },
          { key: 'name', header: 'Description' },
          { key: 'level', header: 'Level', align: 'right', width: '5rem' },
          { key: 'source', header: 'Source', width: '6rem' },
          { key: 'free', header: 'Free stock', align: 'right', width: '8rem' },
          { key: 'safety', header: 'Safety', align: 'right', width: '7rem' },
          { key: 'lead', header: 'Lead days', align: 'right', width: '7rem' },
          { key: 'gross', header: 'Gross req.', align: 'right', width: '9rem' },
          { key: 'planned', header: 'Planned', align: 'right', width: '9rem' },
          { key: 'timing', header: 'Timing', width: '10rem' },
        ],
        build: () =>
          mrp.plans.map((p) => ({
            _key: p.itemCode,
            item: p.itemCode,
            name: p.itemName,
            level: p.llc,
            source: p.isManufactured ? 'Make' : 'Buy',
            free: Math.round(p.openingStock),
            safety: Math.round(p.safetyStock),
            lead: p.leadTimeDays,
            gross: Math.round(p.totalGross),
            planned: Math.round(p.totalPlanned),
            timing: p.firstLateBucket === null ? 'Coverable' : `Late from W${p.firstLateBucket + 1}`,
          })),
      },
      {
        id: 'plannedOrders',
        name: 'Planned order register',
        description: 'Every order MRP wants raised, with its release date and what it covers',
        columns: [
          { key: 'item', header: 'Item', mono: true, width: '12rem' },
          { key: 'name', header: 'Description' },
          { key: 'type', header: 'Type', width: '6rem' },
          { key: 'qty', header: 'Quantity', align: 'right', width: '9rem' },
          { key: 'uom', header: 'UoM', width: '4rem' },
          { key: 'release', header: 'Release on', width: '9rem' },
          { key: 'due', header: 'Needed by', width: '9rem' },
          { key: 'late', header: 'Days late', align: 'right', width: '7rem' },
          { key: 'value', header: 'Value', align: 'right', width: '10rem' },
          { key: 'covers', header: 'Covers' },
        ],
        build: () =>
          mrp.plannedOrders.map((o) => ({
            _key: o.uid,
            item: o.itemCode,
            name: o.itemName,
            type: o.orderType === 'PRODUCTION' ? 'Make' : 'Buy',
            qty: Number(o.qty.toFixed(2)),
            uom: o.uom,
            release: formatDate(o.releaseDate),
            due: formatDate(o.dueDate),
            late: o.daysLate || '',
            value: formatAmount(o.value),
            covers: o.peggedTo,
          })),
      },
      {
        id: 'shortage',
        name: 'Material shortage report',
        description: 'Requirements that cannot be covered inside the lead time, worst first',
        columns: [
          { key: 'item', header: 'Item', mono: true, width: '12rem' },
          { key: 'name', header: 'Description' },
          { key: 'short', header: 'Short by', align: 'right', width: '9rem' },
          { key: 'uom', header: 'UoM', width: '4rem' },
          { key: 'needed', header: 'Needed by', width: '9rem' },
          { key: 'lead', header: 'Lead days', align: 'right', width: '7rem' },
          { key: 'late', header: 'Days late', align: 'right', width: '7rem' },
          { key: 'value', header: 'Value at risk', align: 'right', width: '10rem' },
        ],
        build: () =>
          mrp.shortages.map((s, i) => ({
            _key: `${s.itemCode}-${i}`,
            item: s.itemCode,
            name: s.itemName,
            short: Number(s.shortQty.toFixed(2)),
            uom: s.uom,
            needed: formatDate(s.requiredOn),
            lead: s.leadTimeDays,
            late: s.daysLate,
            value: formatAmount(s.value),
          })),
      },
      {
        id: 'exceptions',
        name: 'MRP exception report',
        description: 'What the run wants a planner to look at, and the suggested action',
        columns: [
          { key: 'severity', header: 'Severity', width: '7rem' },
          { key: 'item', header: 'Item', mono: true, width: '12rem' },
          { key: 'type', header: 'Type', width: '13rem' },
          { key: 'message', header: 'What happened' },
          { key: 'action', header: 'What to do' },
        ],
        build: () =>
          mrp.exceptions.map((e) => ({
            _key: e.uid,
            severity: e.severity.charAt(0) + e.severity.slice(1).toLowerCase(),
            item: e.itemCode,
            type: e.type.replace(/_/g, ' ').toLowerCase(),
            message: e.message,
            action: e.action,
          })),
      },
      {
        id: 'capacity',
        name: 'Capacity requirement report',
        description: 'Hours required against hours available at each work centre, week by week',
        columns: [
          { key: 'centre', header: 'Centre', mono: true, width: '6.5rem' },
          { key: 'name', header: 'Work centre' },
          { key: 'week', header: 'Week', width: '5rem' },
          { key: 'workingDays', header: 'Working days', align: 'right', width: '9rem' },
          { key: 'required', header: 'Required h', align: 'right', width: '9rem' },
          { key: 'available', header: 'Available h', align: 'right', width: '9rem' },
          { key: 'load', header: 'Load', align: 'right', width: '7rem' },
          { key: 'state', header: 'State', width: '9rem' },
        ],
        build: () => {
          const load = capacityPlan(
            mrp.plannedOrders.filter((o) => o.orderType === 'PRODUCTION').map((o) => ({ productCode: o.itemCode, qty: o.qty, bucket: Math.max(0, o.releaseBucket) })),
            ctx,
            starts,
          )
          return load.flatMap((r) =>
            r.cells.map((c) => ({
              _key: `${r.workCentreCode}-${c.bucket}`,
              centre: r.workCentreCode,
              name: r.workCentreName,
              week: `W${c.bucket + 1}`,
              workingDays: workingDaysInBucket(c.start, ctx.calendar),
              required: Number(c.requiredHours.toFixed(1)),
              available: Number(c.availableHours.toFixed(1)),
              load: `${c.loadPct.toFixed(0)}%`,
              state: c.loadPct > 100 ? 'Overloaded' : c.loadPct > 85 ? 'Tight' : c.loadPct > 0 ? 'Comfortable' : 'Idle',
            })),
          )
        },
      },
      {
        id: 'machineLoad',
        name: 'Machine loading report',
        description: 'Scheduled operations by work centre, from the firm orders on the board',
        columns: [
          { key: 'centre', header: 'Centre', mono: true, width: '6.5rem' },
          { key: 'order', header: 'Order', mono: true, width: '11rem' },
          { key: 'product', header: 'Product', mono: true, width: '12rem' },
          { key: 'seq', header: 'Seq', align: 'right', width: '4.5rem' },
          { key: 'operation', header: 'Operation' },
          { key: 'machine', header: 'Machine', mono: true, width: '7rem' },
          { key: 'setup', header: 'Setup min', align: 'right', width: '8rem' },
          { key: 'run', header: 'Run h', align: 'right', width: '7rem' },
          { key: 'start', header: 'Start', width: '11rem' },
          { key: 'finish', header: 'Finish', width: '11rem' },
        ],
        build: () =>
          orders.rows
            .filter((o) => !o.deletedAt && !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(o.status))
            .flatMap((o) =>
              o.operations.map((op) => ({
                _key: `${o.uid}-${op.uid}`,
                centre: op.workCentreCode,
                order: o.docNo,
                product: o.productCode,
                seq: op.seq,
                operation: op.operationName,
                machine: op.machineCode || '—',
                setup: op.setupMinutes,
                run: Number((op.runMinutes / 60).toFixed(1)),
                start: op.plannedStart.replace('T', ' '),
                finish: op.plannedFinish.replace('T', ' '),
              })),
            ),
      },
      {
        id: 'orders',
        name: 'Production order register',
        description: 'Every order with its progress, dates and estimated value',
        columns: [
          { key: 'order', header: 'Order', mono: true, width: '11rem' },
          { key: 'product', header: 'Product', mono: true, width: '12rem' },
          { key: 'name', header: 'Description' },
          { key: 'type', header: 'Type', width: '7rem' },
          { key: 'qty', header: 'Quantity', align: 'right', width: '8rem' },
          { key: 'produced', header: 'Produced', align: 'right', width: '8rem' },
          { key: 'rejected', header: 'Rejected', align: 'right', width: '8rem' },
          { key: 'start', header: 'Start', width: '9rem' },
          { key: 'finish', header: 'Finish', width: '9rem' },
          { key: 'value', header: 'Est. value', align: 'right', width: '10rem' },
          { key: 'status', header: 'Status', width: '11rem' },
        ],
        build: () =>
          orders.rows.map((o) => ({
            _key: o.uid,
            order: o.docNo,
            product: o.productCode,
            name: o.productName,
            type: o.orderType.charAt(0) + o.orderType.slice(1).toLowerCase(),
            qty: o.qty,
            produced: o.producedQty,
            rejected: o.rejectedQty,
            start: formatDate(o.plannedStart),
            finish: formatDate(o.plannedFinish),
            value: formatAmount(o.estimatedUnitCost * o.qty),
            status: ORDER_STATUS_LABEL[o.status],
          })),
      },
      {
        id: 'costEstimate',
        name: 'Production cost estimate',
        description: 'Standard cost against planned cost for every open order, and the variance carried',
        columns: [
          { key: 'order', header: 'Order', mono: true, width: '11rem' },
          { key: 'product', header: 'Product', mono: true, width: '12rem' },
          { key: 'qty', header: 'Quantity', align: 'right', width: '8rem' },
          { key: 'standard', header: 'Standard ₹/unit', align: 'right', width: '10rem' },
          { key: 'planned', header: 'Planned ₹/unit', align: 'right', width: '10rem' },
          { key: 'variance', header: 'Variance ₹/unit', align: 'right', width: '10rem' },
          { key: 'orderValue', header: 'Order value', align: 'right', width: '11rem' },
          { key: 'exposure', header: 'Variance on order', align: 'right', width: '11rem' },
        ],
        build: () =>
          orders.rows
            .filter((o) => !o.deletedAt && !['CLOSED', 'CANCELLED'].includes(o.status))
            .map((o) => {
              const item = planningItem(o.productCode, ctx)
              const std = item.rate
              const variance = o.estimatedUnitCost - std
              return {
                _key: o.uid,
                order: o.docNo,
                product: o.productCode,
                qty: o.qty,
                standard: formatAmount(std),
                planned: formatAmount(o.estimatedUnitCost),
                variance: `${variance > 0 ? '+' : ''}${formatAmount(variance)}`,
                orderValue: formatAmount(o.estimatedUnitCost * o.qty),
                exposure: `${variance > 0 ? '+' : ''}${formatAmount(variance * o.qty)}`,
              }
            }),
      },
      {
        id: 'demand',
        name: 'Demand register',
        description: 'Everything the plant is being asked for, ranked by planning priority',
        columns: [
          { key: 'doc', header: 'Document', mono: true, width: '11rem' },
          { key: 'source', header: 'Source', width: '11rem' },
          { key: 'product', header: 'Product', mono: true, width: '12rem' },
          { key: 'customer', header: 'Customer' },
          { key: 'market', header: 'Market', width: '7rem' },
          { key: 'qty', header: 'Quantity', align: 'right', width: '8rem' },
          { key: 'required', header: 'Required by', width: '9rem' },
          { key: 'week', header: 'Week', width: '5rem' },
          { key: 'firm', header: 'Firm', width: '5rem' },
          { key: 'status', header: 'Status', width: '7rem' },
        ],
        build: () =>
          demand.rows.map((d) => {
            const b = bucketIndex(d.requiredOn, starts)
            return {
              _key: d.uid,
              doc: d.docNo,
              source: DEMAND_SOURCE_LABEL[d.source],
              product: d.productCode,
              customer: d.customer,
              market: d.market.toLowerCase(),
              qty: d.qty,
              required: formatDate(d.requiredOn),
              week: b < 0 ? 'beyond' : `W${b + 1}`,
              firm: d.isFirm ? 'Yes' : '',
              status: d.status.toLowerCase(),
            }
          }),
      },
      {
        id: 'forecastAccuracy',
        name: 'Forecast accuracy report',
        description: 'Every closed period, what was forecast and what actually shipped',
        columns: [
          { key: 'period', header: 'Period', width: '7rem' },
          { key: 'product', header: 'Product', mono: true, width: '12rem' },
          { key: 'market', header: 'Market', width: '7rem' },
          { key: 'method', header: 'Method', width: '13rem' },
          { key: 'forecast', header: 'Forecast', align: 'right', width: '9rem' },
          { key: 'actual', header: 'Actual', align: 'right', width: '9rem' },
          { key: 'error', header: 'Error', align: 'right', width: '8rem' },
          { key: 'absError', header: 'Absolute error', align: 'right', width: '9rem' },
          { key: 'confidence', header: 'Confidence', align: 'right', width: '9rem' },
        ],
        build: () =>
          forecast.rows
            .filter((f) => f.actualQty !== null)
            .map((f) => {
              const err = f.actualQty ? ((f.forecastQty - f.actualQty) / f.actualQty) * 100 : 0
              return {
                _key: f.uid,
                period: f.period,
                product: f.productCode,
                market: f.market.toLowerCase(),
                method: f.method.replace(/_/g, ' ').toLowerCase(),
                forecast: f.forecastQty,
                actual: f.actualQty ?? 0,
                error: `${err > 0 ? '+' : ''}${err.toFixed(1)}%`,
                absError: `${Math.abs(err).toFixed(1)}%`,
                confidence: `${f.confidencePct}%`,
              }
            }),
      },
      {
        id: 'adherence',
        name: 'Schedule adherence',
        description: 'Planned against actual output by week, with on-time completion',
        columns: [
          { key: 'week', header: 'Week', width: '7rem' },
          { key: 'planned', header: 'Planned', align: 'right', width: '9rem' },
          { key: 'actual', header: 'Actual', align: 'right', width: '9rem' },
          { key: 'variance', header: 'Variance', align: 'right', width: '9rem' },
          { key: 'attainment', header: 'Attainment', align: 'right', width: '9rem' },
          { key: 'onTime', header: 'On time', align: 'right', width: '8rem' },
        ],
        build: () =>
          planVsActual.map((w) => ({
            _key: w.week,
            week: w.week,
            planned: w.planned,
            actual: w.actual,
            variance: w.actual - w.planned,
            attainment: `${((w.actual / w.planned) * 100).toFixed(1)}%`,
            onTime: `${w.onTimePct}%`,
          })),
      },
      {
        id: 'labourLoad',
        name: 'Labour loading report',
        description: 'Operator hours each work centre needs from the plan, by skill',
        columns: [
          { key: 'centre', header: 'Centre', mono: true, width: '6.5rem' },
          { key: 'name', header: 'Work centre' },
          { key: 'skill', header: 'Skill', width: '13rem' },
          { key: 'operations', header: 'Operations', align: 'right', width: '9rem' },
          { key: 'machineHours', header: 'Machine h', align: 'right', width: '9rem' },
          { key: 'operators', header: 'Operators', align: 'right', width: '8rem' },
          { key: 'labourHours', header: 'Operator h', align: 'right', width: '9rem' },
        ],
        build: () => {
          const map = new Map<string, { centre: string; name: string; skill: string; operations: number; machineHours: number; operators: number; labourHours: number }>()
          for (const o of mrp.plannedOrders.filter((x) => x.orderType === 'PRODUCTION')) {
            const routing = defaultRoutingFor(o.itemCode, ctx.routings)
            if (!routing) continue
            for (const op of routing.operations) {
              const wc = workCentres.rows.find((w) => w.code === op.workCentreCode)
              const key = `${op.workCentreCode}|${op.skill}`
              const hours = op.setupMinutes / 60 + (o.qty * op.cycleSeconds) / 3600
              const e = map.get(key) ?? {
                centre: op.workCentreCode,
                name: wc?.name ?? op.workCentreCode,
                skill: op.skill,
                operations: 0,
                machineHours: 0,
                operators: op.operators,
                labourHours: 0,
              }
              e.operations++
              e.machineHours += hours
              e.labourHours += hours * op.operators
              e.operators = Math.max(e.operators, op.operators)
              map.set(key, e)
            }
          }
          return [...map.values()]
            .sort((a, b) => b.labourHours - a.labourHours)
            .map((e) => ({
              _key: `${e.centre}-${e.skill}`,
              centre: e.centre,
              name: e.name,
              skill: e.skill,
              operations: e.operations,
              machineHours: Number(e.machineHours.toFixed(1)),
              operators: e.operators,
              labourHours: Number(e.labourHours.toFixed(1)),
            }))
        },
      },
      {
        id: 'bottleneck',
        name: 'Bottleneck report',
        description: 'Work centres the plan pushes past capacity, and by how much',
        columns: [
          { key: 'centre', header: 'Centre', mono: true, width: '6.5rem' },
          { key: 'name', header: 'Work centre' },
          { key: 'peak', header: 'Peak load', align: 'right', width: '8rem' },
          { key: 'weeksOver', header: 'Weeks over', align: 'right', width: '8rem' },
          { key: 'excess', header: 'Excess hours', align: 'right', width: '9rem' },
          { key: 'shifts', header: 'Extra shifts', align: 'right', width: '9rem' },
          { key: 'slack', header: 'Slack weeks', align: 'right', width: '9rem' },
        ],
        build: () => {
          const load = capacityPlan(
            mrp.plannedOrders.filter((o) => o.orderType === 'PRODUCTION').map((o) => ({ productCode: o.itemCode, qty: o.qty, bucket: Math.max(0, o.releaseBucket) })),
            ctx,
            starts,
          )
          return load.map((r) => {
            const over = r.cells.filter((c) => c.loadPct > 100)
            const excess = over.reduce((s, c) => s + (c.requiredHours - c.availableHours), 0)
            return {
              _key: r.workCentreCode,
              centre: r.workCentreCode,
              name: r.workCentreName,
              peak: `${r.peakLoadPct.toFixed(0)}%`,
              weeksOver: r.overloadedBuckets,
              excess: Number(excess.toFixed(1)),
              shifts: Math.ceil(excess / 8),
              slack: r.cells.filter((c) => c.loadPct < 60).length,
            }
          })
        },
      },
      {
        id: 'dailyPlan',
        name: 'Daily production plan',
        description: 'What each order is doing on each day of the next three weeks',
        columns: [
          { key: 'date', header: 'Date', width: '9rem' },
          { key: 'order', header: 'Order', mono: true, width: '11rem' },
          { key: 'product', header: 'Product', mono: true, width: '12rem' },
          { key: 'operation', header: 'Operation' },
          { key: 'centre', header: 'Centre', mono: true, width: '6.5rem' },
          { key: 'hours', header: 'Hours', align: 'right', width: '7rem' },
          { key: 'qty', header: 'Order qty', align: 'right', width: '8rem' },
        ],
        build: () => {
          const horizon = new Set(Array.from({ length: 21 }, (_, i) => formatDate(new Date(new Date(starts[0]).getTime() + i * 86_400_000))))
          return orders.rows
            .filter((o) => !o.deletedAt && !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(o.status))
            .flatMap((o) =>
              o.operations
                .map((op) => ({
                  _key: `${o.uid}-${op.uid}`,
                  date: formatDate(op.plannedStart.slice(0, 10)),
                  order: o.docNo,
                  product: o.productCode,
                  operation: op.operationName,
                  centre: op.workCentreCode,
                  hours: Number(((op.setupMinutes + op.runMinutes) / 60).toFixed(1)),
                  qty: o.qty,
                }))
                .filter((r) => horizon.has(r.date)),
            )
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mrp, demand.rows, forecast.rows, mps.rows, orders.rows, ctx, workCentres.rows, starts],
  )

  const [activeId, setActiveId] = useState(reports[0].id)
  const active = reports.find((r) => r.id === activeId) ?? reports[0]
  const rows = useMemo(() => active.build(), [active])

  const tableColumns: Column<Row>[] = active.columns.map((c) => ({
    key: c.key,
    header: c.header,
    sortable: true,
    align: c.align,
    width: c.width,
    accessor: (r) => r[c.key],
    render: c.mono ? (r) => <span className="font-mono text-2xs">{r[c.key]}</span> : undefined,
  }))

  function doExport(format: ExportFormat) {
    const columns: ExportColumn<Row>[] = active.columns.map((c) => ({ header: c.header, value: (r) => r[c.key] }))
    const n = exportRows(format, active.id, active.name, columns, rows)
    toast.success('Export ready', `${n} rows written as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`)
  }

  const accuracy = forecastAccuracy(forecast.rows)

  return (
    <div>
      <PageHeader
        title="Planning reports"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Planning', to: '/planning' }, { label: 'Reports' }]}
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardBody className="space-y-0.5 p-2">
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveId(r.id)}
                className={cn(
                  'w-full rounded px-2.5 py-2 text-left transition-colors',
                  r.id === activeId ? 'bg-brand-500/10 text-brand-600' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                )}
              >
                <span className="flex items-center gap-2 text-xs font-medium">
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                  {r.name}
                </span>
              </button>
            ))}
          </CardBody>
        </Card>

        <div className="min-w-0">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-fg">{active.name}</h2>
            <p className="mt-0.5 text-xs text-fg-muted">
              {active.description}
              {active.id === 'forecastAccuracy' && accuracy.mapePct !== null && ` · mean absolute error ${accuracy.mapePct.toFixed(1)}% over ${accuracy.periods} periods`}
              {active.id === 'mrp' && ` · horizon ${mrp.horizon} weeks from ${formatDate(mrp.starts[0])}`}
            </p>
          </div>
          <DataTable
            rows={rows}
            columns={tableColumns}
            rowKey={(r) => String(r._key)}
            searchPlaceholder="Search this report…"
            onExport={doExport}
            pageSize={50}
            emptyTitle="Nothing to report"
            emptyDescription="There are no records that match this report yet."
          />
        </div>
      </div>
    </div>
  )
}
