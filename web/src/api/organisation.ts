/**
 * Typed Organisation endpoints. Mirrors the backend contracts; `uid` is the only
 * identifier (CLAUDE.md §6). A small CRUD factory removes the boilerplate so each
 * master is one line, exactly like the backend's registry pattern.
 */

import { api, type Page } from './client'
import { useSession } from './session'

/* ─────────────────────────── Auth ─────────────────────────── */
export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user_uid: string
  user_name: string
  company_uid: string
}

export async function login(loginId: string, password: string, companyUid?: string): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>('/auth/login', {
    login_id: loginId,
    password,
    company_uid: companyUid,
  })
  useSession.getState().setAuth({
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    userUid: res.user_uid,
    userName: res.user_name,
    companyUid: res.company_uid,
  })
  return res
}

export async function logout(): Promise<void> {
  const { refreshToken } = useSession.getState()
  if (refreshToken) {
    try {
      await api.post('/auth/logout', { refresh_token: refreshToken })
    } catch {
      /* best-effort */
    }
  }
  useSession.getState().clear()
}

export interface Me {
  user_uid: string
  user_name: string
  login_id: string
  company_uid: string
  company_ids_count: number
  permissions: string[]
  roles: number[]
}
export const getMe = () => api.get<Me>('/auth/me')

/* ─────────────────────────── Shared shapes ─────────────────────────── */
export interface ListParams {
  page?: number
  page_size?: number
  sort?: string
  q?: string
}

/** version is required on every update (optimistic lock, CLAUDE.md §4.5). */
export type Versioned<T> = T & { version: number }
export interface DeactivateBody {
  version: number
  reason?: string
}

/* ─────────────────────────── Entity types ─────────────────────────── */
export interface Company {
  uid: string
  code: string
  legal_name: string
  trade_name: string | null
  entity_type: string | null
  pan: string | null
  base_currency_code: string
  fy_start_month: number
  timezone: string
  locale: string
  gst_state_code: string | null
  is_active: boolean
  version: number
}

export interface Branch {
  uid: string
  code: string
  name: string
  branch_type: string
  gstin: string | null
  has_separate_gstin: boolean
  gst_state_code: string | null
  is_active: boolean
  version: number
}

export interface Plant {
  uid: string
  code: string
  name: string
  factory_licence_no: string | null
  installed_capacity_per_day: number | null
  is_active: boolean
  version: number
}

export interface Warehouse {
  uid: string
  code: string
  name: string
  warehouse_type: string
  is_bin_managed: boolean
  is_batch_mandatory: boolean
  allow_negative_stock: boolean
  valuation_method: string
  is_active: boolean
  version: number
}

export interface Department {
  uid: string
  code: string
  name: string
  department_type: string
  level: number
  is_active: boolean
  version: number
}

export interface CostCentre {
  uid: string
  code: string
  name: string
  cost_centre_type: string
  level: number
  is_postable: boolean
  is_active: boolean
  version: number
}

export interface FinancialYear {
  uid: string
  code: string
  start_date: string
  end_date: string
  status: string
  is_current: boolean
  version: number
}

export interface Currency {
  uid: string
  code: string
  name: string
  symbol: string | null
  decimal_places: number
  use_indian_format: boolean
  is_active: boolean
}

/* ─────────────────────────── CRUD factory ─────────────────────────── */
export interface Crud<TOut, TCreate, TUpdate> {
  list: (params?: ListParams) => Promise<Page<TOut>>
  get: (uid: string) => Promise<TOut>
  create: (body: TCreate) => Promise<TOut>
  update: (uid: string, body: Versioned<TUpdate>) => Promise<TOut>
  deactivate: (uid: string, body: DeactivateBody) => Promise<TOut>
  restore: (uid: string) => Promise<TOut>
}

function crud<TOut, TCreate, TUpdate>(resource: string): Crud<TOut, TCreate, TUpdate> {
  return {
    list: (params) => api.get<Page<TOut>>(`/${resource}`, params as Record<string, string | number>),
    get: (uid) => api.get<TOut>(`/${resource}/${uid}`),
    create: (body) => api.post<TOut>(`/${resource}`, body),
    update: (uid, body) => api.patch<TOut>(`/${resource}/${uid}`, body),
    deactivate: (uid, body) => api.post<TOut>(`/${resource}/${uid}/deactivate`, body),
    restore: (uid) => api.post<TOut>(`/${resource}/${uid}/restore`),
  }
}

export const companies = crud<Company, Partial<Company>, Partial<Company>>('companies')
export const branches = crud<Branch, Partial<Branch>, Partial<Branch>>('branches')
export const plants = crud<Plant, Record<string, unknown>, Partial<Plant>>('plants')
export const warehouses = crud<Warehouse, Record<string, unknown>, Partial<Warehouse>>('warehouses')
export const departments = crud<Department, Record<string, unknown>, Partial<Department>>('departments')
export const costCentres = crud<CostCentre, Record<string, unknown>, Partial<CostCentre>>('cost-centres')

export const financialYears = {
  list: () => api.get<FinancialYear[]>('/financial-years'),
  get: (uid: string) => api.get<FinancialYear>(`/financial-years/${uid}`),
  create: (body: Record<string, unknown>) => api.post<FinancialYear>('/financial-years', body),
  periods: (uid: string) => api.get<unknown[]>(`/financial-years/${uid}/periods`),
  setCurrent: (uid: string) => api.post<FinancialYear>(`/financial-years/${uid}/set-current`),
}

export const currencies = {
  list: () => api.get<Currency[]>('/currencies'),
}
