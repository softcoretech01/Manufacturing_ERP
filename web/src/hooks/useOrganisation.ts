/**
 * TanStack Query hooks for the Organisation module (CLAUDE.md §7: server state
 * via TanStack Query only — never Zustand).
 *
 * Every query key begins with the active `companyUid` from the session, so
 * switching company transparently re-scopes and refetches all Organisation data
 * (CLAUDE.md §4.3 multi-company). Mutations invalidate the matching list so the
 * UI stays consistent without manual refetching.
 *
 * `branches` here is the reference implementation; the other masters are wired
 * with the same one-line factory. A list screen migrates from the mock
 * `useCollection(...)` to `useBranches(...)` + `useCreateBranch()` etc.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import type { Crud, DeactivateBody, ListParams, Versioned } from '@/api/organisation'
import * as org from '@/api/organisation'
import type { Page } from '@/api/client'
import { useSession } from '@/api/session'

/* ─────────────────────────── Key factory ─────────────────────────── */
export const orgKeys = {
  all: (companyUid: string | null) => ['org', companyUid] as const,
  list: (companyUid: string | null, resource: string, params?: ListParams) =>
    ['org', companyUid, resource, 'list', params ?? {}] as const,
  detail: (companyUid: string | null, resource: string, uid: string) =>
    ['org', companyUid, resource, 'detail', uid] as const,
}

/* ─────────────────────────── CRUD hook factory ─────────────────────────── */
function makeHooks<TOut extends { uid: string }, TCreate, TUpdate>(
  resource: string,
  client: Crud<TOut, TCreate, TUpdate>,
) {
  const useList = (params?: ListParams): UseQueryResult<Page<TOut>> => {
    const companyUid = useSession((s) => s.companyUid)
    return useQuery({
      queryKey: orgKeys.list(companyUid, resource, params),
      queryFn: () => client.list(params),
      enabled: !!companyUid,
    })
  }

  const useGet = (uid: string | undefined): UseQueryResult<TOut> => {
    const companyUid = useSession((s) => s.companyUid)
    return useQuery({
      queryKey: orgKeys.detail(companyUid, resource, uid ?? ''),
      queryFn: () => client.get(uid as string),
      enabled: !!companyUid && !!uid,
    })
  }

  const useInvalidate = () => {
    const qc = useQueryClient()
    const companyUid = useSession((s) => s.companyUid)
    return () => qc.invalidateQueries({ queryKey: ['org', companyUid, resource] })
  }

  const useCreate = (): UseMutationResult<TOut, unknown, TCreate> => {
    const invalidate = useInvalidate()
    return useMutation({ mutationFn: (body: TCreate) => client.create(body), onSuccess: invalidate })
  }

  const useUpdate = (): UseMutationResult<TOut, unknown, { uid: string; body: Versioned<TUpdate> }> => {
    const invalidate = useInvalidate()
    return useMutation({
      mutationFn: ({ uid, body }: { uid: string; body: Versioned<TUpdate> }) => client.update(uid, body),
      onSuccess: invalidate,
    })
  }

  const useDeactivate = (): UseMutationResult<TOut, unknown, { uid: string; body: DeactivateBody }> => {
    const invalidate = useInvalidate()
    return useMutation({
      mutationFn: ({ uid, body }: { uid: string; body: DeactivateBody }) => client.deactivate(uid, body),
      onSuccess: invalidate,
    })
  }

  const useRestore = (): UseMutationResult<TOut, unknown, string> => {
    const invalidate = useInvalidate()
    return useMutation({ mutationFn: (uid: string) => client.restore(uid), onSuccess: invalidate })
  }

  return { useList, useGet, useCreate, useUpdate, useDeactivate, useRestore }
}

/* ─────────────────────────── Per-entity hooks ─────────────────────────── */
const branchHooks = makeHooks('branches', org.branches)
export const useBranches = branchHooks.useList
export const useBranch = branchHooks.useGet
export const useCreateBranch = branchHooks.useCreate
export const useUpdateBranch = branchHooks.useUpdate
export const useDeactivateBranch = branchHooks.useDeactivate
export const useRestoreBranch = branchHooks.useRestore

const companyHooks = makeHooks('companies', org.companies)
export const useCompanies = companyHooks.useList
export const useCompany = companyHooks.useGet
export const useUpdateCompany = companyHooks.useUpdate

const plantHooks = makeHooks('plants', org.plants)
export const usePlants = plantHooks.useList
export const useCreatePlant = plantHooks.useCreate
export const useUpdatePlant = plantHooks.useUpdate
export const useDeactivatePlant = plantHooks.useDeactivate

const warehouseHooks = makeHooks('warehouses', org.warehouses)
export const useWarehouses = warehouseHooks.useList
export const useCreateWarehouse = warehouseHooks.useCreate

const departmentHooks = makeHooks('departments', org.departments)
export const useDepartments = departmentHooks.useList
export const useCreateDepartment = departmentHooks.useCreate

const costCentreHooks = makeHooks('cost-centres', org.costCentres)
export const useCostCentres = costCentreHooks.useList
export const useCreateCostCentre = costCentreHooks.useCreate

/* ─────────────────────────── Bespoke: FY + currency ─────────────────────────── */
export function useFinancialYears() {
  const companyUid = useSession((s) => s.companyUid)
  return useQuery({
    queryKey: orgKeys.list(companyUid, 'financial-years'),
    queryFn: () => org.financialYears.list(),
    enabled: !!companyUid,
  })
}

export function useCurrencies() {
  const companyUid = useSession((s) => s.companyUid)
  return useQuery({
    queryKey: orgKeys.list(companyUid, 'currencies'),
    queryFn: () => org.currencies.list(),
    enabled: !!companyUid,
    staleTime: 60 * 60 * 1000, // currencies rarely change
  })
}
