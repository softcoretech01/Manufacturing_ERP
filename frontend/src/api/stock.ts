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
  category: string
  uom: string
  warehouse_uid: string | null
  warehouse_name: string | null
  batch_no: string
  available_qty: number
  reserved_qty: number
  total_qty: number
  unit_cost: number | null
  stock_value: number | null
  last_movement_date: string | null
}

export interface BatchRow {
  item_uid: string
  item_code: string
  item_name: string
  batch_no: string
  total_inward: number
  total_outward: number
  current_stock: number
  status: string
  last_movement_date: string | null
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
}

export interface LedgerResponse {
  item: { uid: string; code: string; name: string; uom: string; valuation_method: string }
  rows: LedgerRow[]
  totals: {
    received: number
    issued: number
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
  list: (params: { item_type?: string; active_only?: boolean; search?: string } = {}) =>
    api.get<Item[]>('/items', params),
  create: (body: Record<string, unknown>) => api.post<Item>('/items', body),
  update: (uid: string, body: Record<string, unknown>) => api.patch<Item>(`/items/${uid}`, body),
  deactivate: (uid: string) => api.post<Item>(`/items/${uid}/deactivate`),
  restore: (uid: string) => api.post<Item>(`/items/${uid}/restore`),
}

export const stock = {
  enquiry: (params: { warehouse?: string; item_type?: string; search?: string; hide_zero?: boolean } = {}) =>
    api.get<StockRow[]>('/inventory/stock', params),
  balanceEnquiry: (params: { warehouse?: string; item_type?: string; search?: string; hide_zero?: boolean } = {}) =>
    api.get<StockBalanceRow[]>('/inventory/stock-balances', params),
  batchesEnquiry: (params: { item_type?: string; search?: string; hide_zero?: boolean } = {}) =>
    api.get<BatchRow[]>('/inventory/batches', params),
  ledger: (item: string, warehouse?: string, batch_no?: string) =>
    api.get<LedgerResponse>('/inventory/stock/ledger', { item, warehouse, batch_no }),
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
  returnMaterial: (body: Record<string, unknown>) => api.post<MovementResult>('/inventory/returns', body),
  adjust: (body: Record<string, unknown>) => api.post<MovementResult>('/inventory/adjustments', body),
  transfer: (body: Record<string, unknown>) => api.post<TransferResult>('/inventory/transfers', body),
  scrap: (body: Record<string, unknown>) => api.post<MovementResult>('/inventory/scrap', body),
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
