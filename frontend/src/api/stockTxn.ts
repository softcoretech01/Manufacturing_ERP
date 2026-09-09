import { api } from './client'

export interface StockTxnLine {
  uid?: string
  item_id: number
  item_code?: string
  item_name?: string
  item_type?: string
  category?: string
  uom?: string
  batch_no: string
  expiry_date?: string | null
  mfg_date?: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  tax_amount?: number
  line_total?: number
  remarks?: string | null
}

export interface StockTxn {
  uid?: string
  txn_type: 'STOCK_IN' | 'STOCK_OUT' | 'STOCK_RETURN' | 'STOCK_TRANSFER' | 'ADJUSTMENT'
  document_no?: string
  txn_date: string
  src_warehouse_uid?: string | null
  src_warehouse_code?: string | null
  src_warehouse_name?: string | null
  dst_warehouse_uid?: string | null
  dst_warehouse_code?: string | null
  dst_warehouse_name?: string | null
  department_id?: number | null
  department_code?: string | null
  department_name?: string | null
  issued_to?: string | null
  reference_type?: string | null
  reference_no?: string | null
  remarks?: string | null
  status?: 'DRAFT' | 'POSTED' | 'CANCELLED'
  subtotal?: number
  tax_total?: number
  grand_total?: number
  posted_at?: string | null
  posted_by_name?: string | null
  lines: StockTxnLine[]
  created_at?: string
  updated_at?: string
}

export interface DashboardKpis {
  total_stock_value: number | null
  total_sku_count: number
  below_reorder_count: number
  expiring_soon_count: number
  pending_grn_count: number
  draft_txn_count: number
  movement_trend: { date: string; receipts: number; issues: number }[]
  stock_in_period: number
  stock_out_period: number
  returns_period: number
  transfers_period: number
  recent_transactions: {
    date: string
    document_no: string
    type: string
    direction: string
    item_code: string
    item_name: string
    warehouse: string
    quantity: number
    value: number | null
  }[]
}

export interface LowStockRow {
  item_uid: string
  item_code: string
  item_name: string
  category: string
  uom: string
  warehouse_name: string
  current_qty: number
  min_level: number
  reorder_level: number
  shortage_qty: number
  status: 'Normal' | 'Low' | 'Critical'
}

export interface CategoryLedgerRow {
  category: string
  /** The raw item_type behind the display category, for drill-down filtering. */
  item_type: string
  item_count: number
  /** Closing less the period's net movement — so opening + in - out = closing. */
  opening_qty: number
  total_in_qty: number
  total_out_qty: number
  current_qty: number
  /** Null when the caller lacks INVENTORY.STOCK.VALUE. */
  total_value: number | null
}

export const stockTxn = {
  list: (params: {
    txn_type?: string
    status?: string
    date_from?: string
    date_to?: string
    warehouse?: string
    search?: string
  } = {}) => api.get<StockTxn[]>('/inventory/stock-transactions', params),

  get: (uid: string) => api.get<StockTxn>(`/inventory/stock-transactions/${uid}`),

  create: (body: StockTxn) => api.post<StockTxn>('/inventory/stock-transactions', body),

  update: (uid: string, body: StockTxn) => api.put<StockTxn>(`/inventory/stock-transactions/${uid}`, body),

  delete: (uid: string) => api.del(`/inventory/stock-transactions/${uid}`),

  post: (uid: string) => api.post<StockTxn>(`/inventory/stock-transactions/${uid}/post`),

  cancel: (uid: string) => api.post<StockTxn>(`/inventory/stock-transactions/${uid}/cancel`),

  getReturnableQty: (params: { stock_out_no: string; item_id: number; batch_no?: string }) =>
    api.get<{ returnable_qty: number }>('/inventory/stock-transactions/returnable-qty', params),

  getEligibleGrns: () => api.get<any[]>('/inventory/stock-transactions/eligible-grns'),

  getGrnDetails: (docNo: string) => api.get<any>(`/inventory/stock-transactions/grn-details/${docNo}`),

  getDashboardKpis: (params?: { date_from?: string; date_to?: string }) => api.get<DashboardKpis>('/inventory/dashboard-kpis', params),

  getLowStock: (params: { warehouse?: string; item_type?: string } = {}) =>
    api.get<LowStockRow[]>('/inventory/low-stock', params),

  getCategoryLedger: (params: {
    date_from?: string
    date_to?: string
    category?: string
    warehouse?: string
  } = {}) => api.get<CategoryLedgerRow[]>('/inventory/category-ledger', params)
}
