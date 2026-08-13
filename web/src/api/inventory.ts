/**
 * Typed Inventory storage-structure endpoints (zones + bins) — SRS Vol 4 Ch 1.
 * Zones and bins hang off a warehouse (owned by the Organisation module); the
 * warehouse is referenced by its public `uid`. Bins can be created one at a time
 * or bulk-generated from an aisle/rack/level/position pattern (server-side stored
 * procedure).
 */

import { api, type Page } from './client'

export interface Zone {
  uid: string
  code: string
  name: string
  zone_type: string | null
  pick_sequence: number
  is_active: boolean
  version: number
}

export interface Bin {
  uid: string
  zone_uid: string | null
  code: string
  bin_type: string
  status: string
  max_weight_kg: number | null
  max_volume_m3: number | null
  pick_sequence: number
  mixing_allowed: boolean
  block_reason: string | null
  hazard_class: string | null
  is_active: boolean
  version: number
}

export interface BulkBinResult {
  requested: number
  created: number
  skipped: number
}

export interface BinListParams {
  zone?: string
  page?: number
  page_size?: number
  sort?: string
  q?: string
}

export const BIN_TYPES = [
  'RACK',
  'PALLET',
  'BULK',
  'COIL_STAND',
  'FLOOR',
  'SHELF',
  'BIN_BOX',
  'TANK',
  'STAGING',
] as const

/* ─────────────────────────── Zones ─────────────────────────── */
export const zones = {
  list: (warehouseUid: string) => api.get<Zone[]>('/inventory/zones', { warehouse: warehouseUid }),
  get: (uid: string) => api.get<Zone>(`/inventory/zones/${uid}`),
  nextCode: (warehouseUid: string) =>
    api.get<{ code: string }>('/inventory/zones/next-code', { warehouse: warehouseUid }).then((r) => r.code),
  create: (body: Record<string, unknown>) => api.post<Zone>('/inventory/zones', body),
  update: (uid: string, body: Record<string, unknown>) => api.patch<Zone>(`/inventory/zones/${uid}`, body),
  deactivate: (uid: string, version: number) =>
    api.post<Zone>(`/inventory/zones/${uid}/deactivate`, { version }),
  restore: (uid: string) => api.post<Zone>(`/inventory/zones/${uid}/restore`),
}

/* ─────────────────────────── Bins ─────────────────────────── */
export const bins = {
  list: (warehouseUid: string, params?: BinListParams) =>
    api.get<Page<Bin>>('/inventory/bins', {
      warehouse: warehouseUid,
      ...(params as Record<string, string | number | undefined>),
    }),
  get: (uid: string) => api.get<Bin>(`/inventory/bins/${uid}`),
  create: (body: Record<string, unknown>) => api.post<Bin>('/inventory/bins', body),
  update: (uid: string, body: Record<string, unknown>) => api.patch<Bin>(`/inventory/bins/${uid}`, body),
  block: (uid: string, version: number, reason: string) =>
    api.post<Bin>(`/inventory/bins/${uid}/block`, { version, reason }),
  unblock: (uid: string, version: number) => api.post<Bin>(`/inventory/bins/${uid}/unblock`, { version }),
  deactivate: (uid: string, version: number) =>
    api.post<Bin>(`/inventory/bins/${uid}/deactivate`, { version }),
  restore: (uid: string) => api.post<Bin>(`/inventory/bins/${uid}/restore`),
  bulkGenerate: (body: Record<string, unknown>) =>
    api.post<BulkBinResult>('/inventory/bins/bulk-generate', body),
}
