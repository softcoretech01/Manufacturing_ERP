/**
 * Typed inventory-analysis endpoints (SRS Vol 4 Ch 9-10). All read-only over the
 * stock engine (balance + ledger). Value fields are null when the caller lacks
 * INVENTORY.STOCK.VALUE.
 */

import { api } from './client'

export interface ValuationRow {
  item_code: string
  item_name: string
  uom: string
  item_type: string
  quantity: number
  avg_rate: number
  value: number | null
}
export interface Valuation {
  items: ValuationRow[]
  by_type: { item_type: string; value: number | null }[]
  total_value: number | null
}

export interface ReorderRow {
  item_code: string
  item_name: string
  uom: string
  available: number
  reorder_level: number
  shortfall: number
  suggested_order: number
}

export interface AgeingRow {
  item_code: string
  item_name: string
  uom: string
  buckets_qty: number[]
  buckets_value: (number | null)[]
  on_hand: number
  oldest_days: number
}
export interface Ageing {
  labels: string[]
  rows: AgeingRow[]
  totals_value: (number | null)[]
  total_value: number | null
}

export interface AbcRow extends ValuationRow {
  cumulative_pct: number
  abc_class: string
  xyz_class: string
}
export interface AbcXyz {
  rows: AbcRow[]
  abc_counts: { A: number; B: number; C: number }
  total_value: number | null
}

export interface MovementRow {
  item_code: string
  item_name: string
  uom: string
  on_hand: number
  value: number | null
  last_issue_days: number | null
  issues: number
  movement_class: string
}
export interface Movement {
  rows: MovementRow[]
  counts: { FAST: number; SLOW: number; DEAD: number }
}

export const analysis = {
  valuation: (warehouse?: string) => api.get<Valuation>('/inventory/analysis/valuation', { warehouse }),
  reorder: (warehouse?: string) => api.get<ReorderRow[]>('/inventory/analysis/reorder', { warehouse }),
  ageing: (warehouse?: string) => api.get<Ageing>('/inventory/analysis/ageing', { warehouse }),
  abcXyz: (warehouse?: string) => api.get<AbcXyz>('/inventory/analysis/abc-xyz', { warehouse }),
  movement: (warehouse?: string) => api.get<Movement>('/inventory/analysis/movement', { warehouse }),
}
