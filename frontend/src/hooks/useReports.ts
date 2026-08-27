/** TanStack Query hook for Administration reports. */

import { useQuery } from '@tanstack/react-query'
import { adminReports } from '@/api/reports'
import { useSession } from '@/api/session'

export function useAdminReports() {
  const companyUid = useSession((s) => s.companyUid)
  return useQuery({
    queryKey: ['admin-reports', companyUid] as const,
    queryFn: () => adminReports.get(),
    enabled: !!companyUid,
  })
}
