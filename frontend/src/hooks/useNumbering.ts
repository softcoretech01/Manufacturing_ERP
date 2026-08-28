/**
 * TanStack Query hooks for the document-numbering engine (config + reporting).
 * Server state only (CLAUDE.md §7); keys scoped by active company.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as num from '@/api/numbering'
import { useSession } from '@/api/session'

function useCompany() {
  return useSession((s) => s.companyUid)
}

export function useSeries(documentType?: string, activeOnly = false) {
  const c = useCompany()
  return useQuery({
    queryKey: ['num', c, 'series', documentType ?? 'all', activeOnly] as const,
    queryFn: () => num.numberSeries.list(documentType, activeOnly),
    enabled: !!c,
  })
}

export function useExhaustionWarnings() {
  const c = useCompany()
  return useQuery({
    queryKey: ['num', c, 'exhaustion'] as const,
    queryFn: () => num.numberSeries.exhaustionWarnings(),
    enabled: !!c,
  })
}

export function useAllocations(uid: string | undefined) {
  const c = useCompany()
  return useQuery({
    queryKey: ['num', c, 'allocations', uid ?? ''] as const,
    queryFn: () => num.numberSeries.allocations(uid as string),
    enabled: !!c && !!uid,
  })
}

export function useGapAnalysis(uid: string | undefined) {
  const c = useCompany()
  return useQuery({
    queryKey: ['num', c, 'gap', uid ?? ''] as const,
    queryFn: () => num.numberSeries.gapAnalysis(uid as string),
    enabled: !!c && !!uid,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'num', refetchType: 'active' })
}

export function useCreateSeries() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => num.numberSeries.create(body),
    onSuccess: invalidate,
  })
}

export function useUpdateSeries() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: Record<string, unknown> }) =>
      num.numberSeries.update(uid, body),
    onSuccess: invalidate,
  })
}

export function useDeactivateSeries() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ uid, active }: { uid: string; active: boolean }) =>
      active ? num.numberSeries.restore(uid) : num.numberSeries.deactivate(uid),
    onSuccess: invalidate,
  })
}

export function usePreview() {
  return useMutation({ mutationFn: (body: Record<string, unknown>) => num.numberSeries.preview(body) })
}

export function useSimulate() {
  return useMutation({ mutationFn: (body: Record<string, unknown>) => num.numberSeries.simulate(body) })
}
