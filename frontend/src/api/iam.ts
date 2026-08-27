/**
 * Typed IAM management endpoints (users, roles, permission catalogue, grants).
 * These endpoints return plain arrays (not the list envelope) and use `uid` as
 * the only identifier (CLAUDE.md §6). Every call maps to a permission-guarded
 * route under `/api/v1`.
 */

import { api } from './client'

export interface Permission {
  uid: string
  code: string
  module: string
  entity: string
  action: string
  label: string
  is_sensitive: boolean
}

export interface Role {
  uid: string
  code: string
  name: string
  role_type: string
  is_active: boolean
  version: number
  permission_count: number
}

export interface User {
  uid: string
  login_id: string
  email: string
  full_name: string
  user_type: string
  status: string
  version: number
  roles: string[]
  mfa_enabled?: boolean
  last_login_at?: string | null
}

export interface RoleCreateBody {
  code: string
  name: string
  role_type?: string
}
export interface RoleUpdateBody {
  version: number
  name?: string
  role_type?: string
}

export interface UserCreateBody {
  login_id: string
  email: string
  full_name: string
  password: string
  user_type?: string
  role_uids?: string[]
}
export interface UserUpdateBody {
  version: number
  full_name?: string
  email?: string
  user_type?: string
}

/* ─────────────────────────── Permissions ─────────────────────────── */
export const permissions = {
  list: () => api.get<Permission[]>('/permissions'),
}

export interface AccessMatrix {
  permissions: Permission[]
  roles: { uid: string; code: string; name: string; codes: string[] }[]
  users: { uid: string; login_id: string; full_name: string; roles: string[] }[]
}

/** One-call snapshot for the Permission explorer. */
export const accessMatrix = () => api.get<AccessMatrix>('/access-matrix')

/* ─────────────────────────── Sessions ─────────────────────────── */
export interface Session {
  uid: string
  user_login: string
  user_name: string
  ip_address: string | null
  issued_at: string
  expires_at: string
  revoked_at: string | null
  status: string
  is_current: boolean
}

export const sessions = {
  list: () => api.get<Session[]>('/sessions'),
  revoke: (uid: string) => api.post<void>(`/sessions/${uid}/revoke`),
}

/* ─────────────────────────── Login activity ─────────────────────────── */
export interface LoginEvent {
  uid: string
  action: string
  actor_name: string
  ip_address: string | null
  occurred_at: string
}

export const loginActivity = {
  list: () => api.get<LoginEvent[]>('/login-activity'),
}

/* ─────────────────────────── Audit trail ─────────────────────────── */
export interface AuditEntry {
  uid: string
  occurred_at: string
  actor_name: string
  action: string
  entity_type: string
  entity_uid: string | null
  document_no: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  reason: string | null
  channel: string
  ip_address: string | null
  user_agent: string | null
  correlation_id: string
}

export interface AuditFilterParams {
  entity_type?: string
  action?: string
  actor?: string
  from_date?: string
  to_date?: string
  search?: string
  limit?: number
}

export const auditLog = {
  list: (params: AuditFilterParams = {}) =>
    api.get<AuditEntry[]>('/audit-log', params as Record<string, string | number | undefined>),
  filters: () => api.get<{ entities: string[]; actions: string[]; actors: string[] }>('/audit-log/filters'),
}

/* ─────────────────────────── API keys ─────────────────────────── */
export interface ApiKey {
  uid: string
  name: string
  prefix: string
  role_code: string | null
  status: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}
export interface ApiKeyCreated extends ApiKey {
  secret: string
}

export const apiKeys = {
  list: () => api.get<ApiKey[]>('/api-keys'),
  create: (body: Record<string, unknown>) => api.post<ApiKeyCreated>('/api-keys', body),
  revoke: (uid: string) => api.post<void>(`/api-keys/${uid}/revoke`),
}

/* ─────────────────────────── Segregation of duties ─────────────────────────── */
export interface SodRule {
  uid: string
  name: string
  permission_a: string
  permission_b: string
  severity: string
  description: string | null
  is_active: boolean
  version: number
  violation_count: number
  violators: string[]
}

export const sodRules = {
  list: () => api.get<SodRule[]>('/sod-rules'),
  create: (body: Record<string, unknown>) => api.post<SodRule>('/sod-rules', body),
  deactivate: (uid: string, version: number) =>
    api.post<SodRule>(`/sod-rules/${uid}/deactivate`, { version }),
  restore: (uid: string) => api.post<SodRule>(`/sod-rules/${uid}/restore`),
}

/* ─────────────────────────── Delegations ─────────────────────────── */
export interface Delegation {
  uid: string
  from_name: string
  to_name: string
  valid_from: string
  valid_to: string
  reason: string | null
  status: string
  is_active: boolean
  version: number
}

export const delegations = {
  list: () => api.get<Delegation[]>('/delegations'),
  create: (body: Record<string, unknown>) => api.post<Delegation>('/delegations', body),
  revoke: (uid: string, version: number) =>
    api.post<Delegation>(`/delegations/${uid}/revoke`, { version }),
}

/* ─────────────────────────── Roles ─────────────────────────── */
export const roles = {
  list: () => api.get<Role[]>('/roles'),
  get: (uid: string) => api.get<Role>(`/roles/${uid}`),
  create: (body: RoleCreateBody) => api.post<Role>('/roles', body),
  update: (uid: string, body: RoleUpdateBody) => api.patch<Role>(`/roles/${uid}`, body),
  deactivate: (uid: string, version: number) =>
    api.post<Role>(`/roles/${uid}/deactivate`, { version }),
  restore: (uid: string) => api.post<Role>(`/roles/${uid}/restore`),
  permissionCodes: (uid: string) =>
    api.get<{ codes: string[] }>(`/roles/${uid}/permissions`).then((r) => r.codes),
  setPermissions: (uid: string, codes: string[]) =>
    api.put<{ codes: string[] }>(`/roles/${uid}/permissions`, { codes }).then((r) => r.codes),
}

/* ─────────────────────────── Users ─────────────────────────── */
export const users = {
  list: () => api.get<User[]>('/users'),
  get: (uid: string) => api.get<User>(`/users/${uid}`),
  create: (body: UserCreateBody) => api.post<User>('/users', body),
  update: (uid: string, body: UserUpdateBody) => api.patch<User>(`/users/${uid}`, body),
  deactivate: (uid: string, version: number) =>
    api.post<User>(`/users/${uid}/deactivate`, { version }),
  restore: (uid: string) => api.post<User>(`/users/${uid}/restore`),
  setRoles: (uid: string, roleUids: string[]) =>
    api.put<User>(`/users/${uid}/roles`, { role_uids: roleUids }),
  resetPassword: (uid: string, password: string) =>
    api.post<void>(`/users/${uid}/reset-password`, { password }),
}
