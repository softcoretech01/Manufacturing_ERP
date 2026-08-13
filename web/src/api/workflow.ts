/**
 * Typed Workflow & approval-engine endpoints (SRS V1-WFL §4.9).
 *
 * Two areas: the approval matrix (rules configuration + simulate + coverage) and
 * the runtime (inbox, decide, monitor). Plain arrays, `uid` as the only id.
 */

import { api } from './client'

/* ─────────────────────────── Approval matrix ─────────────────────────── */
export interface RuleLevel {
  level_no: number
  level_name: string | null
  approver_type: string
  approver_role_uid: string | null
  approver_role_code: string | null
  approval_mode: string
  quorum_count: number | null
  is_parallel_with_previous: boolean
  sla_hours: number | null
  escalation_action: string
}

export interface Rule {
  uid: string
  document_type: string
  sub_type: string | null
  name: string
  condition_type: string
  min_amount: number | null
  max_amount: number | null
  currency_code: string
  condition_expr: string | null
  priority: number
  auto_approve_below: number | null
  restart_on_change: boolean
  material_change_fields: string[] | null
  is_active: boolean
  version: number
  levels: RuleLevel[]
}

export interface RuleWrite {
  document_type: string
  sub_type?: string | null
  name: string
  condition_type: string
  min_amount?: number | null
  max_amount?: number | null
  condition_expr?: string | null
  priority?: number
  auto_approve_below?: number | null
  restart_on_change?: boolean
  material_change_fields?: string[] | null
  levels: Record<string, unknown>[]
}

export interface Coverage {
  bands: { from: number; to: number | null; name: string }[]
  gaps: { from: number; to: number }[]
  overlaps: string[]
  full_coverage: boolean
}

export interface SimulateLevel {
  level_no: number
  level_name: string | null
  approver_type: string
  approver_label: string
  approval_mode: string
  sla_hours: number | null
  is_parallel_with_previous: boolean
  resolved_user_count: number
  unresolved_reason: string | null
}

export interface SimulateResult {
  matched: boolean
  reason?: string
  rule_uid?: string
  rule_name?: string
  priority?: number
  auto_approved?: boolean
  auto_approve_below?: number | null
  levels?: SimulateLevel[]
}

export interface CodeLabel {
  code: string
  label: string
}

export const approvalRules = {
  list: (documentType?: string, activeOnly = false) =>
    api.get<Rule[]>('/approval-rules', { document_type: documentType, active_only: activeOnly }),
  get: (uid: string) => api.get<Rule>(`/approval-rules/${uid}`),
  create: (body: Record<string, unknown>) => api.post<Rule>('/approval-rules', body),
  update: (uid: string, body: Record<string, unknown>) => api.patch<Rule>(`/approval-rules/${uid}`, body),
  deactivate: (uid: string) => api.post<Rule>(`/approval-rules/${uid}/deactivate`),
  restore: (uid: string) => api.post<Rule>(`/approval-rules/${uid}/restore`),
  documentTypes: () => api.get<CodeLabel[]>('/approval-rules/document-types'),
  reasonCodes: () => api.get<CodeLabel[]>('/approval-rules/reason-codes'),
  coverage: (documentType: string) =>
    api.get<Coverage>('/approval-rules/coverage', { document_type: documentType }),
  simulate: (body: Record<string, unknown>) =>
    api.post<SimulateResult>('/approval-rules/simulate', body),
}

/* ─────────────────────────── Inbox / runtime ─────────────────────────── */
export interface InboxTask {
  task_uid: string
  instance_uid: string
  document_no: string | null
  document_label: string | null
  document_type: string
  subject: string | null
  requester: string | null
  department: string | null
  amount: number | null
  currency: string | null
  level_no: number
  level_name: string | null
  total_levels: number
  assigned_at: string
  due_at: string | null
  status: string
  on_behalf_of: string | null
  overdue: boolean
}

export interface Instance {
  uid: string
  entity_type: string
  document_type: string
  document_no: string | null
  document_label: string | null
  subject: string | null
  amount: number | null
  currency: string | null
  status: string
  current_level: number | null
  current_level_name: string | null
  current_task_uid: string | null
  total_levels: number
  requester: string | null
  department: string | null
  initiated_at: string
  completed_at: string | null
  due_at: string | null
  overdue: boolean
}

export interface InstanceTask {
  uid: string
  level_no: number
  level_name: string | null
  assignee: string | null
  on_behalf_of: string | null
  status: string
  assigned_at: string
  due_at: string | null
  acted_at: string | null
  comments: string | null
  reason_code: string | null
}

export interface HistoryEvent {
  sequence_no: number
  event_type: string
  from_status: string | null
  to_status: string | null
  level_no: number | null
  level_name: string | null
  user_name: string | null
  comments: string | null
  created_at: string
}

export interface InstanceDetail {
  instance: Instance
  tasks: InstanceTask[]
  history: HistoryEvent[]
}

export interface DecideBody {
  action: 'APPROVE' | 'REJECT' | 'RETURN'
  comments?: string | null
  reason_code?: string | null
}

export const approvals = {
  inbox: (includeDone = false) => api.get<InboxTask[]>('/approvals/inbox', { include_done: includeDone }),
  inboxCount: () => api.get<{ count: number }>('/approvals/inbox/count'),
  decide: (taskUid: string, body: DecideBody) =>
    api.post<Instance>(`/approvals/tasks/${taskUid}/decide`, body),
  reassign: (taskUid: string, body: { to_user_uid: string; reason: string }) =>
    api.post<Instance>(`/approvals/tasks/${taskUid}/reassign`, body),
}

export const workflowInstances = {
  list: (status?: string, overdue?: boolean) =>
    api.get<Instance[]>('/workflow-instances', { status, overdue }),
  get: (uid: string) => api.get<InstanceDetail>(`/workflow-instances/${uid}`),
  recall: (uid: string) => api.post<Instance>(`/workflow-instances/${uid}/recall`),
  adminReassign: (uid: string, body: { task_uid: string; to_user_uid: string; reason: string }) =>
    api.post<Instance>(`/workflow-instances/${uid}/admin-reassign`, body),
}
