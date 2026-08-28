/**
 * Security policy — the company's account-security settings (passwords, sessions,
 * network allow/deny, MFA requirements). One settings resource per company.
 */

import { api } from './client'

export interface IpRange {
  cidr: string
  label?: string | null
}

export interface SecurityPolicy {
  uid: string
  version: number
  password_min_length: number
  password_require_upper: boolean
  password_require_lower: boolean
  password_require_number: boolean
  password_require_symbol: boolean
  password_expiry_days: number
  password_history_count: number
  block_identifiers_in_password: boolean
  session_idle_minutes: number
  session_max_concurrent: number
  ip_allow_list: IpRange[]
  ip_deny_list: IpRange[]
  mfa_required_for: string[]
}

/** Every field optional except version (partial update / optimistic lock). */
export type SecurityPolicyUpdate = { version: number } & Partial<Omit<SecurityPolicy, 'uid' | 'version'>>

export const securityPolicy = {
  get: () => api.get<SecurityPolicy>('/security-policy'),
  update: (body: SecurityPolicyUpdate) => api.put<SecurityPolicy>('/security-policy', body),
}
