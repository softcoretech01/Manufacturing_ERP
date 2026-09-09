import { useQuery } from '@tanstack/react-query'
import { planningDashboardApi } from '@/api/planningDashboard'
import { useSession } from '@/api/session'

export function usePlanningDashboard(
  params: { horizon?: number; attainment_weeks?: number } = {},
) {
  const companyUid = useSession((s) => s.companyUid)
  return useQuery({
    queryKey: ['planning', companyUid, 'dashboard', params] as const,
    queryFn: () => planningDashboardApi.get(params),
    enabled: !!companyUid,
  })
}
