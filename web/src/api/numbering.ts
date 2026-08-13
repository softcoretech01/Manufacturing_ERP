/**
 * Typed document-numbering endpoints (SRS V1-NUM §3.7). One engine issues every
 * document number; this is its configuration + reporting surface. `uid` only.
 */

import { api } from './client'

export interface Series {
  uid: string
  document_type: string
  document_label: string
  sub_type: string | null
  branch_code: string | null
  plant_code: string | null
  fy_code: string | null
  format_string: string
  prefix: string | null
  padding_width: number
  allow_widen: boolean
  start_number: number
  increment_by: number
  current_number: number
  reset_frequency: string
  allocate_on: string
  is_statutory: boolean
  is_gapless: boolean
  is_default: boolean
  is_active: boolean
  issued_count: number
  last_issued_at: string | null
  version: number
  next_number: string
}

export interface PreviewResult {
  numbers: string[]
  max_length: number
  issues: { severity: 'ERROR' | 'WARNING'; message: string }[]
}

export interface SimulateResult {
  matched: boolean
  reason?: string
  series_uid?: string
  series_label?: string
  format?: string
  next_numbers?: string[]
  on_fy_roll?: string
  length?: number
}

export interface Allocation {
  uid: string
  sequence: number
  formatted_number: string
  entity_label: string | null
  status: string
  reason: string | null
  allocated_by_name: string | null
  allocated_at: string
}

export interface GapAnalysis {
  issued: number
  range_from: number | null
  range_to: number | null
  gaps: number[]
  voided: number[]
  unbroken: boolean
}

export interface ExhaustionWarning {
  uid: string
  label: string
  current: number
  capacity: number
  used_pct: number
}

export const numberSeries = {
  list: (documentType?: string, activeOnly = false) =>
    api.get<Series[]>('/number-series', { document_type: documentType, active_only: activeOnly }),
  get: (uid: string) => api.get<Series>(`/number-series/${uid}`),
  create: (body: Record<string, unknown>) => api.post<Series>('/number-series', body),
  update: (uid: string, body: Record<string, unknown>) => api.patch<Series>(`/number-series/${uid}`, body),
  deactivate: (uid: string) => api.post<Series>(`/number-series/${uid}/deactivate`),
  restore: (uid: string) => api.post<Series>(`/number-series/${uid}/restore`),
  preview: (body: Record<string, unknown>) => api.post<PreviewResult>('/number-series/preview', body),
  simulate: (body: Record<string, unknown>) => api.post<SimulateResult>('/number-series/simulate', body),
  allocations: (uid: string) => api.get<Allocation[]>(`/number-series/${uid}/allocations`),
  gapAnalysis: (uid: string) => api.get<GapAnalysis>(`/number-series/${uid}/gap-analysis`),
  exhaustionWarnings: () => api.get<ExhaustionWarning[]>('/number-series/exhaustion-warnings'),
  void: (body: { formatted_number: string; reason: string }) =>
    api.post<{ status: string }>('/number-series/void', body),
}
