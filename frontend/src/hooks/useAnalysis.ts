/** TanStack Query hooks for inventory analysis (read-only reports). */

import { useQuery } from '@tanstack/react-query'
import * as an from '@/api/analysis'
import { useSession } from '@/api/session'

function useCompany() {
  return useSession((s) => s.companyUid)
}

export function useValuation(warehouse?: string) {
  const c = useCompany()
  return useQuery({ queryKey: ['an', c, 'valuation', warehouse ?? ''] as const, queryFn: () => an.analysis.valuation(warehouse), enabled: !!c })
}
export function useReorder(warehouse?: string) {
  const c = useCompany()
  return useQuery({ queryKey: ['an', c, 'reorder', warehouse ?? ''] as const, queryFn: () => an.analysis.reorder(warehouse), enabled: !!c })
}
export function useAgeing(warehouse?: string) {
  const c = useCompany()
  return useQuery({ queryKey: ['an', c, 'ageing', warehouse ?? ''] as const, queryFn: () => an.analysis.ageing(warehouse), enabled: !!c })
}
export function useAbcXyz(warehouse?: string) {
  const c = useCompany()
  return useQuery({ queryKey: ['an', c, 'abc', warehouse ?? ''] as const, queryFn: () => an.analysis.abcXyz(warehouse), enabled: !!c })
}
export function useMovement(warehouse?: string) {
  const c = useCompany()
  return useQuery({ queryKey: ['an', c, 'movement', warehouse ?? ''] as const, queryFn: () => an.analysis.movement(warehouse), enabled: !!c })
}
