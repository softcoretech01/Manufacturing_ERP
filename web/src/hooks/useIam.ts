/**
 * TanStack Query hooks for IAM management (users, roles, permissions).
 * Server state only (CLAUDE.md §7). Keys are scoped by the active company so a
 * company switch transparently re-scopes; mutations invalidate the affected
 * lists so tables stay consistent without manual refetching.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as iam from '@/api/iam'
import type {
  RoleCreateBody,
  RoleUpdateBody,
  UserCreateBody,
  UserUpdateBody,
} from '@/api/iam'
import { useSession } from '@/api/session'

export const iamKeys = {
  permissions: (c: string | null) => ['iam', c, 'permissions'] as const,
  roles: (c: string | null) => ['iam', c, 'roles'] as const,
  rolePerms: (c: string | null, uid: string) => ['iam', c, 'roles', uid, 'permissions'] as const,
  users: (c: string | null) => ['iam', c, 'users'] as const,
}

function useCompany() {
  return useSession((s) => s.companyUid)
}

function useInvalidate(kind: 'roles' | 'users') {
  const qc = useQueryClient()
  // Drop companyUid from the predicate to avoid a stale-closure miss; refetch the
  // mounted lists so the UI always reflects the write (mirrors useOrganisation).
  return () =>
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'iam' && q.queryKey[2] === kind,
      refetchType: 'active',
    })
}

/* ─────────────────────────── Permissions ─────────────────────────── */
export function usePermissions() {
  const c = useCompany()
  return useQuery({
    queryKey: iamKeys.permissions(c),
    queryFn: () => iam.permissions.list(),
    enabled: !!c,
    staleTime: 60 * 60 * 1000, // the catalogue is effectively static
  })
}

export function useAccessMatrix() {
  const c = useCompany()
  return useQuery({
    queryKey: ['iam', c, 'access-matrix'] as const,
    queryFn: () => iam.accessMatrix(),
    enabled: !!c,
  })
}

export function useSessions() {
  const c = useCompany()
  return useQuery({
    queryKey: ['iam', c, 'sessions'] as const,
    queryFn: () => iam.sessions.list(),
    enabled: !!c,
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (uid: string) => iam.sessions.revoke(uid),
    onSuccess: () =>
      qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'iam' && q.queryKey[2] === 'sessions',
        refetchType: 'active',
      }),
  })
}

export function useLoginActivity() {
  const c = useCompany()
  return useQuery({
    queryKey: ['iam', c, 'login-activity'] as const,
    queryFn: () => iam.loginActivity.list(),
    enabled: !!c,
  })
}

export function useAuditLog(params: iam.AuditFilterParams) {
  const c = useCompany()
  return useQuery({
    queryKey: ['iam', c, 'audit-log', params] as const,
    queryFn: () => iam.auditLog.list(params),
    enabled: !!c,
  })
}

export function useAuditFilters() {
  const c = useCompany()
  return useQuery({
    queryKey: ['iam', c, 'audit-filters'] as const,
    queryFn: () => iam.auditLog.filters(),
    enabled: !!c,
    staleTime: 5 * 60 * 1000,
  })
}

export function useApiKeys() {
  const c = useCompany()
  return useQuery({
    queryKey: ['iam', c, 'api-keys'] as const,
    queryFn: () => iam.apiKeys.list(),
    enabled: !!c,
  })
}

function useInvalidateApiKeys() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'iam' && q.queryKey[2] === 'api-keys',
      refetchType: 'active',
    })
}

export function useCreateApiKey() {
  const invalidate = useInvalidateApiKeys()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => iam.apiKeys.create(body),
    onSuccess: invalidate,
  })
}

export function useRevokeApiKey() {
  const invalidate = useInvalidateApiKeys()
  return useMutation({ mutationFn: (uid: string) => iam.apiKeys.revoke(uid), onSuccess: invalidate })
}

export function useSodRules() {
  const c = useCompany()
  return useQuery({
    queryKey: ['iam', c, 'sod-rules'] as const,
    queryFn: () => iam.sodRules.list(),
    enabled: !!c,
  })
}

function useInvalidateSod() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'iam' && q.queryKey[2] === 'sod-rules',
      refetchType: 'active',
    })
}

export function useCreateSodRule() {
  const invalidate = useInvalidateSod()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => iam.sodRules.create(body),
    onSuccess: invalidate,
  })
}

export function useDeactivateSodRule() {
  const invalidate = useInvalidateSod()
  return useMutation({
    mutationFn: ({ uid, version }: { uid: string; version: number }) => iam.sodRules.deactivate(uid, version),
    onSuccess: invalidate,
  })
}

export function useRestoreSodRule() {
  const invalidate = useInvalidateSod()
  return useMutation({ mutationFn: (uid: string) => iam.sodRules.restore(uid), onSuccess: invalidate })
}

export function useDelegations() {
  const c = useCompany()
  return useQuery({
    queryKey: ['iam', c, 'delegations'] as const,
    queryFn: () => iam.delegations.list(),
    enabled: !!c,
  })
}

function useInvalidateDelegations() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'iam' && q.queryKey[2] === 'delegations',
      refetchType: 'active',
    })
}

export function useCreateDelegation() {
  const invalidate = useInvalidateDelegations()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => iam.delegations.create(body),
    onSuccess: invalidate,
  })
}

export function useRevokeDelegation() {
  const invalidate = useInvalidateDelegations()
  return useMutation({
    mutationFn: ({ uid, version }: { uid: string; version: number }) => iam.delegations.revoke(uid, version),
    onSuccess: invalidate,
  })
}

/* ─────────────────────────── Roles ─────────────────────────── */
export function useRoles() {
  const c = useCompany()
  return useQuery({ queryKey: iamKeys.roles(c), queryFn: () => iam.roles.list(), enabled: !!c })
}

export function useRolePermissions(uid: string | undefined) {
  const c = useCompany()
  return useQuery({
    queryKey: iamKeys.rolePerms(c, uid ?? ''),
    queryFn: () => iam.roles.permissionCodes(uid as string),
    enabled: !!c && !!uid,
  })
}

export function useCreateRole() {
  const invalidate = useInvalidate('roles')
  return useMutation({ mutationFn: (body: RoleCreateBody) => iam.roles.create(body), onSuccess: invalidate })
}

export function useUpdateRole() {
  const invalidate = useInvalidate('roles')
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: RoleUpdateBody }) => iam.roles.update(uid, body),
    onSuccess: invalidate,
  })
}

export function useDeactivateRole() {
  const invalidate = useInvalidate('roles')
  return useMutation({
    mutationFn: ({ uid, version }: { uid: string; version: number }) => iam.roles.deactivate(uid, version),
    onSuccess: invalidate,
  })
}

export function useRestoreRole() {
  const invalidate = useInvalidate('roles')
  return useMutation({ mutationFn: (uid: string) => iam.roles.restore(uid), onSuccess: invalidate })
}

export function useSetRolePermissions() {
  const qc = useQueryClient()
  const invalidate = useInvalidate('roles')
  return useMutation({
    mutationFn: ({ uid, codes }: { uid: string; codes: string[] }) =>
      iam.roles.setPermissions(uid, codes),
    onSuccess: (_data, { uid }) => {
      invalidate()
      qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'iam' && q.queryKey[2] === 'roles' && q.queryKey[3] === uid,
      })
    },
  })
}

/* ─────────────────────────── Users ─────────────────────────── */
export function useUsers() {
  const c = useCompany()
  return useQuery({ queryKey: iamKeys.users(c), queryFn: () => iam.users.list(), enabled: !!c })
}

export function useCreateUser() {
  const invalidate = useInvalidate('users')
  return useMutation({ mutationFn: (body: UserCreateBody) => iam.users.create(body), onSuccess: invalidate })
}

export function useUpdateUser() {
  const invalidate = useInvalidate('users')
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: UserUpdateBody }) => iam.users.update(uid, body),
    onSuccess: invalidate,
  })
}

export function useDeactivateUser() {
  const invalidate = useInvalidate('users')
  return useMutation({
    mutationFn: ({ uid, version }: { uid: string; version: number }) => iam.users.deactivate(uid, version),
    onSuccess: invalidate,
  })
}

export function useRestoreUser() {
  const invalidate = useInvalidate('users')
  return useMutation({ mutationFn: (uid: string) => iam.users.restore(uid), onSuccess: invalidate })
}

export function useSetUserRoles() {
  const invalidate = useInvalidate('users')
  return useMutation({
    mutationFn: ({ uid, roleUids }: { uid: string; roleUids: string[] }) =>
      iam.users.setRoles(uid, roleUids),
    onSuccess: invalidate,
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ uid, password }: { uid: string; password: string }) =>
      iam.users.resetPassword(uid, password),
  })
}
