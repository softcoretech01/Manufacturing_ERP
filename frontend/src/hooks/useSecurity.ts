/** TanStack Query hooks for the Security policy (server state only). */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as sec from '@/api/security'
import type { SecurityPolicyUpdate } from '@/api/security'
import { useSession } from '@/api/session'

const key = (c: string | null) => ['security-policy', c] as const

export function useSecurityPolicy() {
  const companyUid = useSession((s) => s.companyUid)
  return useQuery({
    queryKey: key(companyUid),
    queryFn: () => sec.securityPolicy.get(),
    enabled: !!companyUid,
  })
}

export function useUpdateSecurityPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SecurityPolicyUpdate) => sec.securityPolicy.update(body),
    onSuccess: (data) => {
      // Write the fresh policy straight into the cache so version stays in sync.
      qc.setQueryData(['security-policy', useSession.getState().companyUid], data)
    },
  })
}
