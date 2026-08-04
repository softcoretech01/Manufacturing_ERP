import { useMemo } from 'react'
import { useCollection } from '@/store/data'
import { runMrp, type MrpResult, type PlanningContext } from '@/lib/planFlow'
import {
  boms as seedBoms,
  products as seedProducts,
  routings as seedRoutings,
  tools as seedTools,
  workCentres as seedWorkCentres,
} from '@/mock/engineering'
import { items as masterItems } from '@/mock/masters'
import { stockPositions } from '@/mock/inventory'
import { purchaseOrders as seedPurchaseOrders } from '@/mock/procurement'
import {
  HORIZON,
  STARTS,
  calendarDays as seedCalendar,
  demandLines as seedDemand,
  forecastLines as seedForecast,
  mpsLines as seedMps,
  planningPolicies as seedPolicies,
  productionOrders as seedOrders,
} from '@/mock/planning'
import type { Bom, EngProduct, EngWorkCentre, Routing, Tool } from '@/types/engineering'
import type { PurchaseOrder } from '@/types/procurement'
import type {
  CalendarDay,
  DemandLine,
  ForecastLine,
  MpsLine,
  PlanningPolicy,
  ProductionOrder,
} from '@/types/planning'

/**
 * One place where planning binds to everything it reads.
 *
 * Eleven screens all need the same picture — demand, structures, stock, open
 * orders — and the MRP result on top of it. Wiring that per screen would mean
 * eleven chances for two screens to disagree about what the plan says, which is
 * exactly the failure a planning module cannot have.
 */
export function usePlanningData() {
  const demand = useCollection<DemandLine>('plan:demand', useMemo(() => seedDemand, []))
  const forecast = useCollection<ForecastLine>('plan:forecast', useMemo(() => seedForecast, []))
  const mps = useCollection<MpsLine>('plan:mps', useMemo(() => seedMps, []))
  const policies = useCollection<PlanningPolicy>('plan:policies', useMemo(() => seedPolicies, []))
  const orders = useCollection<ProductionOrder>('plan:orders', useMemo(() => seedOrders, []))
  const calendar = useCollection<CalendarDay>('plan:calendar', useMemo(() => seedCalendar, []))

  const boms = useCollection<Bom>('eng:boms', useMemo(() => seedBoms, []))
  const routings = useCollection<Routing>('eng:routings', useMemo(() => seedRoutings, []))
  const workCentres = useCollection<EngWorkCentre>('eng:workcentres', useMemo(() => seedWorkCentres, []))
  const products = useCollection<EngProduct>('eng:products', useMemo(() => seedProducts, []))
  const tools = useCollection<Tool>('eng:tools', useMemo(() => seedTools, []))
  const purchaseOrders = useCollection<PurchaseOrder>('proc:po', useMemo(() => seedPurchaseOrders, []))

  const ctx: PlanningContext = useMemo(
    () => ({
      boms: boms.rows,
      routings: routings.rows,
      workCentres: workCentres.rows,
      items: masterItems,
      stock: stockPositions,
      policies: policies.rows,
      calendar: calendar.rows,
    }),
    [boms.rows, routings.rows, workCentres.rows, policies.rows, calendar.rows],
  )

  const mrp: MrpResult = useMemo(
    () =>
      runMrp({
        demand: demand.rows,
        mps: mps.rows,
        purchaseOrders: purchaseOrders.rows,
        productionOrders: orders.rows,
        ctx,
        horizon: HORIZON,
        useMps: true,
      }),
    [demand.rows, mps.rows, purchaseOrders.rows, orders.rows, ctx],
  )

  return {
    demand,
    forecast,
    mps,
    policies,
    orders,
    calendar,
    boms,
    routings,
    workCentres,
    products,
    tools,
    purchaseOrders,
    ctx,
    mrp,
    starts: STARTS,
    horizon: HORIZON,
  }
}
