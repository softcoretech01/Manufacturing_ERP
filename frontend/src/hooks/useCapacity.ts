import { useQuery } from '@tanstack/react-query'
import { capacityApi } from '@/api/capacity'
import { useSession } from '@/api/session'

function useCompany() {
  return useSession((s) => s.companyUid)
}

export function useCapacityPlan(
  params: { horizon?: number; include_planned?: boolean; demand_doc_no?: string } = {},
) {
  const c = useCompany()
  return useQuery({
    queryKey: ['capacity', c, 'plan', params] as const,
    queryFn: () => capacityApi.plan(params),
    enabled: !!c,
  })
}

/** Drill-down for one work centre. Disabled until a centre is chosen. */
export function useCapacityDetail(
  code: string | undefined,
  params: { horizon?: number; bucket?: number } = {},
) {
  const c = useCompany()
  return useQuery({
    queryKey: ['capacity', c, 'detail', code ?? '', params] as const,
    queryFn: () => capacityApi.detail(code as string, params),
    enabled: !!c && !!code,
  })
}
