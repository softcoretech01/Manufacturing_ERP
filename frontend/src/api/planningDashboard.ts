/**
 * Planning dashboard figures, computed on the server.
 *
 * The screen this feeds used to derive its KPIs from the browser MRP engine and
 * read plan attainment off a hardcoded array. Every number here is a query
 * against the same stored MRP run and capacity service the rest of the portal
 * reads, so the dashboard cannot disagree with the screen you click into.
 */

import { api } from './client'

export interface PlanningKpis {
  open_demand_qty: number
  open_demand_lines: number
  /** Open demand with no master schedule built for it yet. */
  pending_mps: number
  /** Scheduled, but nothing planned or raised against it yet. */
  pending_mrp: number
  /** Un-converted purchase proposals on the current run. */
  to_buy: number
  /** Un-converted production proposals on the current run. */
  to_make: number
  overdue_demand_lines: number
  shortages: number
  unconverted_value: number
  peak_capacity_pct: number
  overloaded_centres: number
  /** Null — not zero — when there is no completed history to measure against. */
  plan_attainment_pct: number | null
  wip_value: number
  open_orders: number
  orders_in_production: number
}

export interface ActionQueueItem {
  key: string
  label: string
  count: number
  to: string
  tone: 'danger' | 'warning' | 'pending' | 'progress'
}

export interface AttainmentWeek {
  week_start: string
  label: string
  planned: number
  actual: number
  on_time_pct: number
}

export interface BottleneckRow {
  work_centre_code: string
  work_centre_name: string
  peak_load_pct: number
  overloaded_buckets: number
}

export interface PlanningDashboard {
  as_of: string
  horizon: number
  mrp_run_no: string | null
  mrp_run_at: string | null
  kpis: PlanningKpis
  action_queue: ActionQueueItem[]
  attainment_series: AttainmentWeek[]
  bottlenecks: BottleneckRow[]
}

export const planningDashboardApi = {
  get: (params: { horizon?: number; attainment_weeks?: number } = {}) =>
    api.get<PlanningDashboard>('/planning/dashboard', params),
}
