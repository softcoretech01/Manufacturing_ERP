/**
 * The server-side MRP run.
 *
 * A run is a stored document, not a computation the browser performs. `run()`
 * returns a run uid; the plan is then read back from the server, so every
 * planner sees the same numbers and a plan survives a refresh.
 *
 * This replaces `lib/planFlow.ts`, which computed MRP in React state. Keep both
 * only until the two have been compared — they will not agree, and the server is
 * right: the browser fed the engine a 7-row item master instead of the 20-row
 * Masters one, and placed master-schedule lines by a stored bucket index that
 * silently time-shifts as the horizon rolls forward.
 */

import { api } from './client'

export interface MrpStats {
  items_planned: number
  purchase_orders: number
  production_orders: number
  purchase_value: number
  late_orders: number
  exceptions: number
}

export interface MrpRunSummary {
  uid: string
  run_no: string
  run_at: string
  run_by_name: string | null
  horizon: number
  bucket_days: number
  use_mps: boolean
  first_bucket_start: string
  status: string
  /**
   * Set when the run was scoped to one demand document — make-to-order.
   * Null on a full run across the whole order book. The two answer different
   * questions and must never be compared as though they were the same plan.
   */
  demand_doc_no: string | null
  stats: MrpStats
}

export interface MrpBucket {
  bucket: number
  start: string
  gross_requirement: number
  scheduled_receipts: number
  projected_on_hand: number
  net_requirement: number
  planned_receipt: number
  release_bucket: number | null
  release_date: string | null
}

export interface MrpItemPlan {
  item_code: string
  item_name: string
  uom: string
  llc: number
  is_manufactured: boolean
  opening_stock: number
  safety_stock: number
  lead_time_days: number
  unit_rate: number
  buckets: MrpBucket[]
  total_gross: number
  total_planned: number
  first_late_bucket: number | null
}

export interface MrpPlannedOrder {
  uid: string
  item_code: string
  item_name: string
  uom: string
  llc: number
  order_type: 'PURCHASE' | 'PRODUCTION'
  quantity: number
  net_requirement: number
  unit_rate: number
  value: number
  bucket: number
  due_date: string
  release_bucket: number
  release_date: string
  is_late: boolean
  days_late: number
  /** What consumes this, one level up — a parent order below the top level. */
  pegged_to: string
  /**
   * The customer demand at the root of this requirement, carried down through
   * every BOM level. Comma-separated when several orders share the proposal.
   * This is the one a buyer needs: `pegged_to` on a steel coil names a
   * sub-assembly, which does not say who is waiting for it.
   */
  demand_doc_no: string
  lead_time_days: number
  converted_to_doc_no: string | null
}

export interface MrpException {
  uid: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  type: string
  item_code: string
  item_name: string
  message: string
  action: string
  is_resolved: boolean
}

export interface MrpShortage {
  item_code: string
  item_name: string
  uom: string
  required_on: string
  short_qty: number
  value: number
  lead_time_days: number
  days_late: number
}

export interface MrpRunDetail extends MrpRunSummary {
  starts: string[]
  plans: MrpItemPlan[]
  planned_orders: MrpPlannedOrder[]
  exceptions: MrpException[]
  shortages: MrpShortage[]
}

export interface MrpRunOptions {
  horizon?: number
  use_mps?: boolean
  consume_forecast?: boolean
  /**
   * Plan one demand document instead of the whole order book. Stock and open
   * purchase orders still net off, so what comes back is what must be bought
   * and made on top of what the plant already has.
   */
  demand_doc_no?: string
}

export interface ConvertResult {
  document_no: string
  document_type: 'PURCHASE_REQUISITION' | 'PRODUCTION_ORDER'
  lines?: number
  estimated_value?: number
  required_by?: string
  product_code?: string
  quantity?: number
  bom?: string
  routing?: string | null
  components?: number
  operations?: number
}

export const mrpApi = {
  /** Start a run. Returns the run header — read the plan back separately. */
  run: (body: MrpRunOptions = {}) => api.post<MrpRunSummary>('/planning/mrp/run', body),
  /** The current plan, or null when MRP has never been run. */
  latest: () => api.get<MrpRunDetail | null>('/planning/mrp/latest'),
  get: (uid: string) => api.get<MrpRunDetail>(`/planning/mrp/runs/${uid}`),
  listRuns: (limit = 25) => api.get<MrpRunSummary[]>('/planning/mrp/runs', { limit }),

  /** Raise one requisition in Procurement covering the selected planned buys. */
  toPurchaseRequisition: (body: {
    planned_order_uids: string[]
    plant?: string
    department?: string
    justification?: string
  }) => api.post<ConvertResult>('/planning/mrp/convert/purchase-requisition', body),

  /** Raise a production order, with its BOM and routing snapshotted onto it. */
  toProductionOrder: (body: { planned_order_uid: string; plant?: string; warehouse?: string }) =>
    api.post<ConvertResult>('/planning/mrp/convert/production-order', body),
}
