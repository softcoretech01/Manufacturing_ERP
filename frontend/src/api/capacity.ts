/**
 * Capacity requirements planning, computed on the server.
 *
 * Load is split into **committed** (operations on live production orders) and
 * **planned** (MRP proposals nobody has converted yet). A planner seeing a centre
 * at 300% needs to know which half it is: committed overload means move work or
 * add a shift, planned overload means change the plan.
 */

import { api } from './client'

export interface CapacityCell {
  bucket: number
  start: string
  committed_hours: number
  planned_hours: number
  required_hours: number
  /**
   * The selected demand's share of `required_hours`. Zero when no demand is
   * selected. It is a share, not a filter: the bar keeps the whole factory
   * load, because a work centre that one order fills to 20% can still be full.
   */
  focus_hours: number
  /** `focus_hours` as a percentage of available — the width of the shaded part. */
  focus_pct: number
  available_hours: number
  load_pct: number
  is_overloaded: boolean
  /** Working days the calendar allows in this week — a shutdown shows here. */
  working_days: number
}

export interface CapacityRow {
  work_centre_code: string
  work_centre_name: string
  plant: string | null
  shift_pattern: string | null
  hours_per_day: number
  oee_target_pct: number
  cells: CapacityCell[]
  total_required_hours: number
  /** The selected demand's share of `total_required_hours`. */
  total_focus_hours: number
  total_available_hours: number
  overall_load_pct: number
  peak_load_pct: number
  overloaded_buckets: number
  is_bottleneck: boolean
}

export interface CapacityPlan {
  horizon: number
  starts: string[]
  mrp_run_no: string | null
  includes_planned: boolean
  work_centres: CapacityRow[]
  bottlenecks: string[]
}

export interface CapacityLoadItem {
  work_centre_code: string
  bucket: number
  hours: number
  source: 'COMMITTED' | 'PLANNED'
  document_no: string | null
  product_code: string
  operation: string
  quantity: number
  status: string
}

export interface CapacityDetail {
  work_centre_code: string
  work_centre_name: string
  starts: string[]
  cells: CapacityCell[]
  peak_load_pct: number
  operations: CapacityLoadItem[]
  committed_hours: number
  planned_hours: number
}

export const capacityApi = {
  plan: (
    params: {
      horizon?: number
      include_planned?: boolean
      /** Mark the share of each centre's load belonging to this demand. */
      demand_doc_no?: string
    } = {},
  ) =>
    api.get<CapacityPlan>('/planning/capacity', params),
  /** The operations that make up one centre's load. */
  detail: (code: string, params: { horizon?: number; bucket?: number } = {}) =>
    api.get<CapacityDetail>(`/planning/capacity/${encodeURIComponent(code)}`, params),
}
