/**
 * TanStack Query hooks for the Workflow module (approval matrix + runtime).
 * Server state only (CLAUDE.md §7). Keys are scoped by the active company so a
 * company switch re-scopes; mutations invalidate the affected lists.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as wf from '@/api/workflow'
import { useSession } from '@/api/session'

function useCompany() {
  return useSession((s) => s.companyUid)
}

function useToken() {
  return useSession((s) => s.accessToken)
}

/* ─────────────────────────── Approval matrix ─────────────────────────── */
export function useRuleDocumentTypes() {
  const c = useCompany()
  return useQuery({
    queryKey: ['wf', c, 'rule-doc-types'] as const,
    queryFn: () => wf.approvalRules.documentTypes(),
    enabled: !!c,
    staleTime: 60 * 60 * 1000,
  })
}

export function useReasonCodes() {
  const c = useCompany()
  return useQuery({
    queryKey: ['wf', c, 'reason-codes'] as const,
    queryFn: () => wf.approvalRules.reasonCodes(),
    enabled: !!c,
    staleTime: 60 * 60 * 1000,
  })
}

export function useRules(documentType: string | undefined, activeOnly = false) {
  const c = useCompany()
  return useQuery({
    queryKey: ['wf', c, 'rules', documentType ?? 'all', activeOnly] as const,
    queryFn: () => wf.approvalRules.list(documentType, activeOnly),
    enabled: !!c && !!documentType,
  })
}

export function useCoverage(documentType: string | undefined) {
  const c = useCompany()
  return useQuery({
    queryKey: ['wf', c, 'coverage', documentType ?? 'all'] as const,
    queryFn: () => wf.approvalRules.coverage(documentType as string),
    enabled: !!c && !!documentType,
  })
}

function useInvalidateRules() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === 'wf' && (q.queryKey[2] === 'rules' || q.queryKey[2] === 'coverage'),
      refetchType: 'active',
    })
}

export function useCreateRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => wf.approvalRules.create(body),
    onSuccess: invalidate,
  })
}

export function useUpdateRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: Record<string, unknown> }) =>
      wf.approvalRules.update(uid, body),
    onSuccess: invalidate,
  })
}

export function useDeactivateRule() {
  const invalidate = useInvalidateRules()
  return useMutation({ mutationFn: (uid: string) => wf.approvalRules.deactivate(uid), onSuccess: invalidate })
}

export function useRestoreRule() {
  const invalidate = useInvalidateRules()
  return useMutation({ mutationFn: (uid: string) => wf.approvalRules.restore(uid), onSuccess: invalidate })
}

export function useSimulate() {
  return useMutation({ mutationFn: (body: Record<string, unknown>) => wf.approvalRules.simulate(body) })
}

/* ─────────────────────────── Inbox / runtime ─────────────────────────── */
export function useInbox(includeDone = false) {
  const c = useCompany()
  const token = useToken()
  return useQuery({
    queryKey: ['wf', c, 'inbox', includeDone] as const,
    queryFn: () => wf.approvals.inbox(includeDone),
    enabled: !!c && !!token,
    refetchInterval: 30_000,
  })
}

export function useInboxCount() {
  const c = useCompany()
  const token = useToken()
  return useQuery({
    queryKey: ['wf', c, 'inbox-count'] as const,
    queryFn: () => wf.approvals.inboxCount(),
    enabled: !!c && !!token,
    refetchInterval: 30_000,
  })
}

function useInvalidateRuntime() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === 'wf' &&
        ['inbox', 'inbox-count', 'instances', 'instance'].includes(q.queryKey[2] as string),
      refetchType: 'active',
    })
}

export function useDecide() {
  const invalidate = useInvalidateRuntime()
  return useMutation({
    mutationFn: ({ taskUid, body }: { taskUid: string; body: wf.DecideBody }) =>
      wf.approvals.decide(taskUid, body),
    onSuccess: invalidate,
  })
}

export function useInstances(status?: string, overdue?: boolean) {
  const c = useCompany()
  const token = useToken()
  return useQuery({
    queryKey: ['wf', c, 'instances', status ?? 'all', overdue ?? false] as const,
    queryFn: () => wf.workflowInstances.list(status, overdue),
    enabled: !!c && !!token,
    refetchInterval: 30_000,
  })
}

export function useInstanceDetail(uid: string | undefined) {
  const c = useCompany()
  const token = useToken()
  return useQuery({
    queryKey: ['wf', c, 'instance', uid ?? ''] as const,
    queryFn: () => wf.workflowInstances.get(uid as string),
    enabled: !!c && !!token && !!uid,
  })
}

export function useAdminReassign() {
  const invalidate = useInvalidateRuntime()
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: { task_uid: string; to_user_uid: string; reason: string } }) =>
      wf.workflowInstances.adminReassign(uid, body),
    onSuccess: invalidate,
  })
}

export function useRecall() {
  const invalidate = useInvalidateRuntime()
  return useMutation({ mutationFn: (uid: string) => wf.workflowInstances.recall(uid), onSuccess: invalidate })
}
