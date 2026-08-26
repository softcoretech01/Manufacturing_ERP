/** Administration reports — read-only aggregates over live data. */

import { api } from './client'

export interface NameCount {
  label: string
  count: number
}
export interface OrgCount {
  total: number
  active: number
}
export interface RoleRow {
  code: string
  name: string
  permission_count: number
  user_count: number
}
export interface AdminReports {
  users: { total: number; active: number; inactive: number; by_type: NameCount[] }
  roles_total: number
  roles: RoleRow[]
  organisation: {
    branches: OrgCount
    plants: OrgCount
    warehouses: OrgCount
    departments: OrgCount
    cost_centres: OrgCount
  }
  audit: { total: number; last_7_days: number; actors: number; by_action: NameCount[] }
}

export const adminReports = {
  get: () => api.get<AdminReports>('/admin-reports'),
}
