/**
 * Typed item-master + stock endpoints (SRS Vol 4 Ch 2-3). The stock engine is the
 * foundation the inventory portal reads from; every quantity comes from here.
 */

import { api } from './client'

export interface Item {
  uid: string
  code: string
  name: string
  item_type: string
  base_uom: string
  hsn_code: string | null
  is_batch_tracked: boolean
  is_serial_tracked: boolean
  valuation_method: string
  qty_precision: number
  reorder_level: number | null
  min_level: number | null
  max_level: number | null
  standard_rate: number | null
  is_active: boolean
  is_blocked_for_movement: boolean
  default_receipt_status: string
  version: number
}

export interface StockRow {
  item_uid: string
  item_code: string
  item_name: string
  uom: string
  item_type: string
  on_hand: number
  available: number
  quarantine: number
  blocked: number
  reorder_level: number | null
  value: number | null
  below_reorder: boolean
}

export interface StockBalanceRow {
  item_uid: string
  item_code: string
  item_name: string
  /** Raw enum, e.g. RAW_MATERIAL — for filtering and sorting. */
  item_type: string
  /** The same value as a human label, e.g. "Raw Material" — for display. */
  category: string
  uom: string
  warehouse_uid: string | null
  warehouse_name: string | null
  batch_no: string
  available_qty: number
  /** Committed to a production order, not yet issued. */
  reserved_qty: number
  /** Quarantined or blocked — on the shelf but not usable. */
  held_qty: number
  /** available_qty - reserved_qty. What may still be committed. */
  free_qty: number
  total_qty: number
  unit_cost: number | null
  stock_value: number | null
  last_movement_date: string | null
}

export interface BatchRow {
  item_uid: string
  item_code: string
  item_name: string
  item_type: string
  batch_no: string
  warehouse_uid: string | null
  warehouse_code: string | null
  warehouse_name: string | null
  uom: string
  available_qty: number
  unit_cost: number | null
  stock_value: number | null
  mfg_date: string | null
  expiry_date: string | null
  /** Null when no expiry date is recorded; `status` is then UNKNOWN. */
  days_to_expiry: number | null
  status: 'EXPIRED' | 'EXPIRING_SOON' | 'VALID' | 'UNKNOWN'
  last_movement_date: string | null
}

export interface BatchQuery {
  // Index signature so the object satisfies the query-param type api.get takes.
  [k: string]: string | boolean | undefined
  item_type?: string
  search?: string
  warehouse?: string
  batch_no?: string
  expiry_from?: string
  expiry_to?: string
  expiry_status?: string
  hide_zero?: boolean
}

export interface LedgerRow {
  uid: string
  posted_at: string
  business_date: string
  movement_type: string
  direction: string
  quantity: number
  rate: number
  value: number
  balance_qty_after: number
  balance_rate_after: number
  balance_value_after: number
  document_type: string | null
  document_no: string | null
  batch_no: string
  stock_status: string
  posted_by_name: string | null
  warehouse_code: string | null
  warehouse_name: string | null
  uom: string
  item_code: string
  item_name: string
}

export interface LedgerQuery {
  [k: string]: string | undefined
  warehouse?: string
  batch_no?: string
  date_from?: string
  date_to?: string
  movement_type?: string
  document_no?: string
}

export interface LedgerResponse {
  item: { uid: string; code: string; name: string; uom: string; valuation_method: string }
  rows: LedgerRow[]
  totals: {
    received: number
    issued: number
    /** Count over the whole filtered set, not just the returned page. */
    movements: number
    closing_qty: number
    closing_rate: number
    closing_value: number
  }
}

export interface ReceiptBody {
  item_uid: string
  warehouse_uid: string
  quantity: number
  rate: number
  bin_uid?: string | null
  batch_no?: string
  business_date?: string | null
  remarks?: string | null
  supplier_label?: string | null
}

export interface ReceiptResult {
  document_no: string
  item_code: string
  warehouse_code: string
  quantity: number
  rate: number
  value: number
  stock_status: string
  balance_qty_after: number
  balance_rate_after: number
}

export const items = {
  /** The stock item master (`mst_item`).
   *
   *  Must NOT be `/items` — that is procurement's separate item master, which
   *  returns camelCase fields and an integer `id`, so every `uid`, `base_uom`
   *  and `is_batch_tracked` read below came back `undefined` and the item
   *  pickers silently posted `item_uid: undefined`. */
  list: (params: { item_type?: string; active_only?: boolean; search?: string } = {}) =>
    api.get<Item[]>('/inventory/items', params),
  // Read only, on purpose. There were create/update/deactivate/restore wrappers
  // here, all unused and all pointing at `/items` — the *procurement* master —
  // while `list` reads the stock master. They would have written to a different
  // table than they read from, and `/items/{uid}/deactivate` and `/restore` do
  // not exist on the server at all. Item maintenance belongs to the Item master
  // screen; the stock screens only ever need to read.
}

export const stock = {
  enquiry: (params: { warehouse?: string; item_type?: string; search?: string; hide_zero?: boolean } = {}) =>
    api.get<StockRow[]>('/inventory/stock', params),
  balanceEnquiry: (params: { warehouse?: string; item_type?: string; search?: string; hide_zero?: boolean } = {}) =>
    api.get<StockBalanceRow[]>('/inventory/stock-balances', params),
  batchesEnquiry: (params: BatchQuery = {}) =>
    api.get<BatchRow[]>('/inventory/batches', params),
  ledger: (item: string, q: LedgerQuery = {}) =>
    api.get<LedgerResponse>('/inventory/stock/ledger', { item, ...q }),
  receive: (body: ReceiptBody) => api.post<ReceiptResult>('/inventory/receipts', body),
}

/* ─────────────────────────── Movement transactions ─────────────────────────── */
export interface MovementResult {
  document_no: string
  movement_type: string
  direction: string
  quantity: number
  rate: number
  value: number
  balance_qty_after: number
  balance_rate_after: number
}

export interface TransferResult {
  document_no: string
  item_code: string
  from_warehouse: string
  to_warehouse: string
  quantity: number
  rate: number
  source_balance_after: number
  dest_balance_after: number
}

export interface MovementRow {
  uid: string
  posted_at: string
  business_date: string
  movement_type: string
  direction: string
  quantity: number
  rate: number
  value: number
  balance_qty_after: number
  document_no: string | null
  batch_no: string
  stock_status: string
  remarks: string | null
  posted_by_name: string | null
  item_code: string
  item_name: string
  warehouse_code: string | null
}

export const transactions = {
  movements: (params: { movement_type?: string; item?: string; warehouse?: string; limit?: number } = {}) =>
    api.get<MovementRow[]>('/inventory/movements', params),
  issue: (body: Record<string, unknown>) => api.post<MovementResult>('/inventory/issues', body),
  issueBulk: (body: Record<string, unknown>[]) => api.post<MovementResult[]>('/inventory/issues/bulk', body),
  returnMaterial: (body: Record<string, unknown>) => api.post<MovementResult>('/inventory/returns', body),
  returnBulk: (body: Record<string, unknown>[]) => api.post<MovementResult[]>('/inventory/returns/bulk', body),
  adjust: (body: Record<string, unknown>) => api.post<MovementResult>('/inventory/adjustments', body),
  adjustBulk: (body: Record<string, unknown>[]) => api.post<MovementResult[]>('/inventory/adjustments/bulk', body),
  transfer: (body: Record<string, unknown>) => api.post<TransferResult>('/inventory/transfers', body),
  transferBulk: (body: Record<string, unknown>[]) => api.post<TransferResult[]>('/inventory/transfers/bulk', body),
  scrap: (body: Record<string, unknown>) => api.post<MovementResult>('/inventory/scrap', body),
  reverseDocument: (documentNo: string) => api.post<any>(`/inventory/documents/${documentNo}/reverse`),
  putaway: (body: Record<string, unknown>) => api.post<PutawayResult>('/inventory/putaway', body),
}

/* ─────────────────────────── Bin occupancy / put-away ─────────────────────────── */
export interface BinContent {
  item_code: string
  item_name: string
  uom: string
  batch_no: string
  stock_status: string
  quantity: number
  value: number | null
}

export interface OccupiedBin {
  bin_uid: string
  bin_code: string
  total_qty: number
  value: number | null
  distinct_items: number
  top_item_code: string | null
  contents: BinContent[]
}

export interface BinOccupancy {
  bins: OccupiedBin[]
  implicit: { total_qty: number; value: number | null; contents: BinContent[] }
}

export interface PutawayResult {
  document_no: string
  item_code: string
  quantity: number
  rate: number
  source_balance_after: number
  dest_balance_after: number
}

export const occupancy = {
  byWarehouse: (warehouse: string) =>
    api.get<BinOccupancy>('/inventory/bin-occupancy', { warehouse }),
}
