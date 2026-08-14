/** TanStack Query hooks for physical inventory (stock counts). */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/api/count'
import { useSession } from '@/api/session'

function useCompany() {
  return useSession((s) => s.companyUid)
}

export function useCounts(params: { status?: string; count_type?: string } = {}) {
  const c = useCompany()
  return useQuery({
    queryKey: ['count', c, 'list', params] as const,
    queryFn: () => api.counts.list(params),
    enabled: !!c,
  })
}

export function useCountDetail(uid: string | undefined) {
  const c = useCompany()
  return useQuery({
    queryKey: ['count', c, 'detail', uid ?? ''] as const,
    queryFn: () => api.counts.get(uid as string),
    enabled: !!c && !!uid,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'count' || q.queryKey[0] === 'stock', refetchType: 'active' })
}

export function useCreateCount() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (body: Parameters<typeof api.counts.create>[0]) => api.counts.create(body), onSuccess: invalidate })
}

export function useRecordCounts() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ uid, entries }: { uid: string; entries: api.CountEntry[] }) => api.counts.record(uid, entries),
    onSuccess: invalidate,
  })
}

export function useSubmitCount() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (uid: string) => api.counts.submit(uid), onSuccess: invalidate })
}

export function useApproveCount() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (uid: string) => api.counts.approve(uid), onSuccess: invalidate })
}

export function useCancelCount() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (uid: string) => api.counts.cancel(uid), onSuccess: invalidate })
}
