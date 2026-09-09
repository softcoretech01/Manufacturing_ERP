import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mrpApi, type MrpRunOptions } from '@/api/mrp'
import { useSession } from '@/api/session'

function useCompany() {
  return useSession((s) => s.companyUid)
}

/** The current plan. `data === null` means MRP has never been run — which the
 *  screen must say, rather than rendering an empty grid that reads as no demand. */
export function useLatestMrpRun() {
  const c = useCompany()
  return useQuery({
    queryKey: ['mrp', c, 'latest'] as const,
    queryFn: mrpApi.latest,
    enabled: !!c,
  })
}

export function useMrpRun(uid: string | undefined) {
  const c = useCompany()
  return useQuery({
    queryKey: ['mrp', c, 'run', uid ?? ''] as const,
    queryFn: () => mrpApi.get(uid as string),
    enabled: !!c && !!uid,
  })
}

export function useMrpRuns(limit = 25) {
  const c = useCompany()
  return useQuery({
    queryKey: ['mrp', c, 'runs', limit] as const,
    queryFn: () => mrpApi.listRuns(limit),
    enabled: !!c,
  })
}

export function useRunMrp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts: MrpRunOptions = {}) => mrpApi.run(opts),
    // A run creates a new document; every cached view of "the plan" is now stale.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mrp'] }),
  })
}

/** Convert planned buys into one purchase requisition in Procurement. */
export function useConvertToPurchaseRequisition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mrpApi.toPurchaseRequisition,
    // The planned orders are now stamped as converted, so the run is stale.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mrp'] }),
  })
}

/** Convert one planned make into a production order. */
export function useConvertToProductionOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mrpApi.toProductionOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mrp'] }),
  })
}
