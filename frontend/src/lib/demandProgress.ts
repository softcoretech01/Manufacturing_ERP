import type { DemandLine, MpsLine, ProductionOrder } from '@/types/planning'
import type { WorkflowStep } from '@/components/planning/WorkflowTracker'

/**
 * How far one demand has got through the make-to-order chain.
 *
 *   Demand → MPS → MRP → Buy / Make → Capacity → Production
 *
 * Every screen in the portal needs these numbers and each was deriving them its
 * own way, so the Demand list, the MPS header and the order form could disagree
 * about how much of an order was already covered. They are computed once, here.
 *
 * The link is the demand document number, not the product code. Two orders for
 * the same bottle are different commitments to different customers, and rolling
 * them up by product is what makes a planner double-count.
 */

export interface DemandProgress {
  /** Ordered, less anything already netted off by the planner. */
  outstanding: number
  /** Quantity written into the master schedule for this demand. */
  scheduled: number
  /** Quantity on production orders raised against this demand. */
  ordered: number
  /** Quantity actually produced against those orders. */
  produced: number
  /** Still to be covered by a schedule. Never negative. */
  remaining: number
  /** True once the schedule covers the whole outstanding quantity. */
  fullyScheduled: boolean
  orders: ProductionOrder[]
}

const sum = <T,>(rows: T[], pick: (row: T) => number) =>
  rows.reduce((total, row) => total + (pick(row) || 0), 0)

export function demandProgress(
  demand: DemandLine,
  mps: MpsLine[],
  orders: ProductionOrder[],
): DemandProgress {
  const outstanding = Math.max(0, demand.qty - (demand.qtyPlanned ?? 0))

  const scheduled = sum(
    mps.filter((m) => m.demandDocNo === demand.docNo),
    (m) => m.plannedQty,
  )

  // A production order lists every demand it serves. An order raised for two
  // orders counts in both — which is right for "is this demand covered", and
  // why these figures must never be summed across demands to get a plant total.
  const mine = orders.filter((o) => (o.demandRefs ?? []).includes(demand.docNo))

  return {
    outstanding,
    scheduled,
    ordered: sum(mine, (o) => o.qty),
    produced: sum(mine, (o) => o.producedQty),
    remaining: Math.max(0, outstanding - scheduled),
    fullyScheduled: scheduled >= outstanding && outstanding > 0,
    orders: mine,
  }
}

/**
 * The tracker steps for one demand.
 *
 * `mrpPlanned` is the number of un-converted MRP proposals pegged to this
 * demand — it is what distinguishes "MRP has been run for this order" from "MRP
 * has been run at all", and the caller supplies it because only the MRP screen
 * holds the current run.
 */
export function demandWorkflow(
  demand: DemandLine,
  progress: DemandProgress,
  opts: { mrpPlanned?: number; capacityOverloaded?: boolean } = {},
): WorkflowStep[] {
  const cancelled = demand.status === 'CANCELLED'
  const { scheduled, ordered, produced, outstanding } = progress
  const mrpPlanned = opts.mrpPlanned ?? 0

  // Everything after the cancellation point is moot, so the whole chain reads
  // as cancelled rather than showing a half-finished plan that will never run.
  if (cancelled) {
    return ['Demand', 'MPS', 'MRP', 'Buy / Make', 'Capacity', 'Production'].map((label, i) => ({
      key: String(i),
      label,
      state: i === 0 ? 'cancelled' : 'todo',
      detail: i === 0 ? 'Cancelled' : undefined,
    }))
  }

  const qty = (n: number) => `${n.toLocaleString('en-IN')} ${demand.uom}`

  return [
    {
      key: 'demand',
      label: 'Demand',
      detail: qty(outstanding),
      state: 'done',
    },
    {
      key: 'mps',
      label: 'MPS',
      detail: scheduled > 0 ? `${qty(scheduled)} scheduled` : 'Not scheduled',
      state: scheduled <= 0 ? 'current' : scheduled >= outstanding ? 'done' : 'blocked',
    },
    {
      key: 'mrp',
      label: 'MRP',
      // Orders on the demand mean MRP already ran and was acted on, even if the
      // current run holds no live proposal for it — a converted proposal leaves
      // the open list. Reading "not planned" next to "8,000 on order" made the
      // tracker look broken.
      detail:
        mrpPlanned > 0
          ? `${mrpPlanned} proposal(s)`
          : ordered > 0
            ? 'Converted to orders'
            : 'Not planned',
      state:
        scheduled <= 0 && ordered <= 0
          ? 'todo'
          : mrpPlanned > 0 || ordered > 0
            ? 'done'
            : 'current',
    },
    {
      key: 'convert',
      label: 'Buy / Make',
      detail: ordered > 0 ? `${qty(ordered)} on order` : 'Nothing raised',
      state: mrpPlanned <= 0 && ordered <= 0 ? 'todo' : ordered > 0 ? 'done' : 'current',
    },
    {
      key: 'capacity',
      label: 'Capacity',
      detail: opts.capacityOverloaded ? 'Over capacity' : ordered > 0 ? 'Load applied' : '—',
      state: ordered <= 0 ? 'todo' : opts.capacityOverloaded ? 'blocked' : 'done',
    },
    {
      key: 'production',
      label: 'Production',
      detail: produced > 0 ? `${qty(produced)} made` : 'Not started',
      state:
        ordered <= 0
          ? 'todo'
          : produced >= outstanding && outstanding > 0
            ? 'done'
            : produced > 0
              ? 'current'
              : 'todo',
    },
  ]
}
