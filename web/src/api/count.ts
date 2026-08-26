/**
 * Typed physical-inventory (stock count) endpoints (SRS Vol 4 Ch 8).
 * Counting is blind — `system_qty` is null until the count is submitted.
 */

import { api } from './client'

export interface CountLine {
  uid: string
  item_code: string
  item_name: string
  uom: string
  batch_no: string
  stock_status: string
  system_qty: number | null
  counted_qty: number | null
  variance: number | null
  reason_code: string | null
  root_cause: string | null
  remarks: string | null
}

export interface Count {
  uid: string
  document_no: string
  warehouse_code: string | null
  count_type: string
  status: string
  count_date: string
  remarks: string | null
  counted_by_name: string | null
  submitted_at: string | null
  approved_at: string | null
  version: number
  line_count: number
  variance_lines: number
  counted: number
}

export interface CountDetail {
  count: Count
  blind: boolean
  lines: CountLine[]
}

export interface ApproveResult {
  document_no: string
  movements_posted: number
  net_value: number
  status: string
}

export interface CountEntry {
  line_uid: string
  counted_qty?: number | null
  reason_code?: string | null
  root_cause?: string | null
  remarks?: string | null
}

export const counts = {
  list: (params: { status?: string; count_type?: string } = {}) => api.get<Count[]>('/inventory/counts', params),
  create: (body: { warehouse_uid: string; count_type?: string; item_uid?: string | null; remarks?: string | null }) =>
    api.post<CountDetail>('/inventory/counts', body),
  get: (uid: string) => api.get<CountDetail>(`/inventory/counts/${uid}`),
  record: (uid: string, entries: CountEntry[]) => api.post<CountDetail>(`/inventory/counts/${uid}/record`, { entries }),
  submit: (uid: string) => api.post<CountDetail>(`/inventory/counts/${uid}/submit`),
  approve: (uid: string) => api.post<ApproveResult>(`/inventory/counts/${uid}/approve`),
  cancel: (uid: string) => api.post<CountDetail>(`/inventory/counts/${uid}/cancel`),
}
