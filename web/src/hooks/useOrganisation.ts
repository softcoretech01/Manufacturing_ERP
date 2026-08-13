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
    // Invalidate every org query for the current resource across all companies.
    // Dropping companyUid avoids a stale-closure miss (the captured value could
    // predate session hydration), and refetchType:'active' forces the mounted
    // list to refetch so the table always reflects the write.
    return () =>
      qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'org' && q.queryKey[2] === resource,
        refetchType: 'active',
      })
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
export const usePlant = plantHooks.useGet
export const useCreatePlant = plantHooks.useCreate
export const useUpdatePlant = plantHooks.useUpdate
export const useDeactivatePlant = plantHooks.useDeactivate
export const useRestorePlant = plantHooks.useRestore

const warehouseHooks = makeHooks('warehouses', org.warehouses)
export const useWarehouses = warehouseHooks.useList
export const useCreateWarehouse = warehouseHooks.useCreate
export const useUpdateWarehouse = warehouseHooks.useUpdate
export const useDeactivateWarehouse = warehouseHooks.useDeactivate
export const useRestoreWarehouse = warehouseHooks.useRestore

const departmentHooks = makeHooks('departments', org.departments)
export const useDepartments = departmentHooks.useList
export const useCreateDepartment = departmentHooks.useCreate
export const useUpdateDepartment = departmentHooks.useUpdate
export const useDeactivateDepartment = departmentHooks.useDeactivate
export const useRestoreDepartment = departmentHooks.useRestore

const costCentreHooks = makeHooks('cost-centres', org.costCentres)
export const useCostCentres = costCentreHooks.useList
export const useCreateCostCentre = costCentreHooks.useCreate
export const useUpdateCostCentre = costCentreHooks.useUpdate
export const useDeactivateCostCentre = costCentreHooks.useDeactivate
export const useRestoreCostCentre = costCentreHooks.useRestore

/* ─────────────────────────── Bespoke: FY + currency ─────────────────────────── */
export function useFinancialYears() {
  const companyUid = useSession((s) => s.companyUid)
  return useQuery({
    queryKey: orgKeys.list(companyUid, 'financial-years'),
    queryFn: () => org.financialYears.list(),
    enabled: !!companyUid,
  })
}

export function useFinancialYearPeriods(uid: string | undefined) {
  const companyUid = useSession((s) => s.companyUid)
  return useQuery({
    queryKey: orgKeys.detail(companyUid, 'financial-years', `${uid}:periods`),
    queryFn: () => org.financialYears.periods(uid as string),
    enabled: !!companyUid && !!uid,
  })
}

function useInvalidateFy() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'org' && q.queryKey[2] === 'financial-years',
      refetchType: 'active',
    })
}

export function useCreateFinancialYear() {
  const invalidate = useInvalidateFy()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => org.financialYears.create(body),
    onSuccess: invalidate,
  })
}

export function useSetCurrentFinancialYear() {
  const invalidate = useInvalidateFy()
  return useMutation({
    mutationFn: (uid: string) => org.financialYears.setCurrent(uid),
    onSuccess: invalidate,
  })
}

export function useOrgStructure() {
  const companyUid = useSession((s) => s.companyUid)
  return useQuery({
    queryKey: orgKeys.list(companyUid, 'structure'),
    queryFn: () => org.structure.get(),
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

export function useExchangeRates(params?: ListParams) {
  const companyUid = useSession((s) => s.companyUid)
  return useQuery({
    queryKey: orgKeys.list(companyUid, 'exchange-rates', params),
    queryFn: () => org.exchangeRates.list(params),
    enabled: !!companyUid,
  })
}

export function useCreateExchangeRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => org.exchangeRates.create(body),
    onSuccess: () =>
      qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'org' && q.queryKey[2] === 'exchange-rates',
        refetchType: 'active',
      }),
  })
}
