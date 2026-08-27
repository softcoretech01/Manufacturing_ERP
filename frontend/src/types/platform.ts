/**
 * Volume 15 — platform contracts for the parts not already modelled.
 *
 * The existing `types/index.ts` already carries User, Role, Permission,
 * Delegation, ApprovalRule, ApprovalTask, WorkflowDefinition, Attachment and
 * the rest. This file adds only what Volume 15 specifies and the codebase does
 * not yet have: a real document repository, an import framework, security
 * policy, and the monitoring records.
 */

import type { ID } from './index'

/* ─────────────────────── Document management (Ch 10) ─────────────────────── */

export type DocCategory =
  | 'DRAWING' | 'SOP' | 'WORK_INSTRUCTION' | 'QUALITY_CERTIFICATE' | 'INSPECTION_REPORT'
  | 'MACHINE_MANUAL' | 'CONTRACT' | 'PURCHASE' | 'SALES' | 'HR' | 'FINANCE' | 'STATUTORY'

export type DocStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SUPERSEDED' | 'EXPIRED' | 'ARCHIVED' | 'REJECTED'

/** One stored revision. Revisions are immutable once approved. */
export interface DocRevision {
  uid: ID
  revision: string
  fileName: string
  sizeBytes: number
  mimeType: string
  uploadedBy: string
  uploadedAt: string
  changeNote: string
  approvedBy: string | null
  approvedAt: string | null
  /** Set when a later revision replaced this one. */
  supersededAt: string | null
}

export interface ManagedDocument {
  uid: ID
  docNo: string
  title: string
  category: DocCategory
  /** Virtual folder path, e.g. "Engineering/Drawings/750ml". */
  folder: string
  description: string
  owner: string
  department: string
  /** Whichever revision is current — always the latest approved one. */
  currentRevision: string
  revisions: DocRevision[]
  status: DocStatus
  /** Who has it checked out, if anybody. Nobody else may upload while set. */
  checkedOutBy: string | null
  checkedOutAt: string | null
  /** Statutory and certificate documents expire; drawings do not. */
  expiresOn: string | null
  /** Warn this many days before expiry. */
  reviewLeadDays: number
  isConfidential: boolean
  /** ERP records this document is attached to. */
  links: { entityType: string; entityCode: string; entityName: string }[]
  tags: string[]
  downloadCount: number
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Import framework (Ch 13) ─────────────────────── */

export type ImportFieldType = 'STRING' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'ENUM' | 'REFERENCE'

export interface ImportField {
  key: string
  label: string
  type: ImportFieldType
  required: boolean
  /** Allowed values where the type is ENUM. */
  options?: string[]
  /** Which master a REFERENCE must exist in — checked before the row is accepted. */
  referenceOf?: string
  min?: number
  max?: number
  maxLength?: number
  /** Part of the natural key used to spot duplicates. */
  isKey?: boolean
  hint?: string
}

export interface ImportSpec {
  uid: ID
  code: string
  name: string
  module: string
  entity: string
  description: string
  fields: ImportField[]
  /** Whether an existing row with the same key is updated or rejected. */
  onDuplicate: 'REJECT' | 'UPDATE' | 'SKIP'
  /** Nothing is committed unless every row passes. */
  allOrNothing: boolean
  sampleRow: Record<string, string>
  version: number
  deletedAt?: string | null
}

export type ImportRunStatus = 'DRAFT' | 'VALIDATED' | 'FAILED_VALIDATION' | 'COMMITTED' | 'ROLLED_BACK'

export interface ImportIssue {
  rowNo: number
  field: string | null
  severity: 'ERROR' | 'WARNING'
  message: string
}

export interface ImportRun {
  uid: ID
  docNo: string
  specCode: string
  specName: string
  fileName: string
  uploadedBy: string
  uploadedAt: string
  rowCount: number
  validRows: number
  errorRows: number
  warningRows: number
  duplicateRows: number
  status: ImportRunStatus
  issues: ImportIssue[]
  committedAt: string | null
  rolledBackAt: string | null
  version: number
  deletedAt?: string | null
}

/* ─────────────────────── Security policy (Ch 19) ─────────────────────── */

export interface PasswordPolicy {
  minLength: number
  requireUpper: boolean
  requireLower: boolean
  requireDigit: boolean
  requireSymbol: boolean
  /** Days before a password must be changed. Nil means never. */
  expiryDays: number
  /** How many previous passwords may not be reused. */
  historyCount: number
  /** Failed attempts before the account locks. */
  lockoutThreshold: number
  lockoutMinutes: number
  /** Reject passwords containing the login id or the user's name. */
  disallowUserInfo: boolean
  /** Words rejected outright. */
  bannedWords: string[]
}

export interface SessionPolicy {
  idleTimeoutMinutes: number
  absoluteTimeoutHours: number
  maxConcurrentSessions: number
  /** Force a re-authentication before an approval or a payment release. */
  reauthForSensitive: boolean
}

export type MfaMethod = 'TOTP' | 'SMS' | 'EMAIL' | 'NONE'

export interface SecurityPolicy {
  uid: ID
  password: PasswordPolicy
  session: SessionPolicy
  /** MFA required for these user types. */
  mfaRequiredFor: string[]
  mfaMethods: MfaMethod[]
  /** CIDR ranges allowed to reach the application. Empty means anywhere. */
  ipAllowList: { cidr: string; label: string; appliesTo: string }[]
  ipDenyList: { cidr: string; label: string; reason: string }[]
  /** Channels a portal user may use. */
  allowedChannels: string[]
  encryptionAtRest: string
  tlsMinimum: string
  version: number
}

/* ─────────────────────── Monitoring & logging (Ch 17) ─────────────────────── */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
export type LogSource = 'API' | 'DATABASE' | 'JOB' | 'INTEGRATION' | 'AUTH' | 'WORKFLOW' | 'APPLICATION'

export interface SystemLog {
  uid: ID
  at: string
  level: LogLevel
  source: LogSource
  /** Endpoint, job name or integration this came from. */
  origin: string
  message: string
  correlationId: string
  userName: string | null
  durationMs: number | null
  httpStatus: number | null
  stackTrace: string
  /** Whether somebody has looked at it. */
  acknowledged: boolean
  version: number
  deletedAt?: string | null
}

export interface EndpointMetric {
  endpoint: string
  method: string
  calls: number
  errors: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  maxMs: number
}

export interface HealthCheck {
  component: string
  kind: 'DATABASE' | 'CACHE' | 'QUEUE' | 'STORAGE' | 'INTEGRATION' | 'SCHEDULER'
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN'
  latencyMs: number
  message: string
  checkedAt: string
}
