/** TanStack Query hooks for System parameters. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as prm from '@/api/parameters'
import type { ParameterChange } from '@/api/parameters'
import { useSession } from '@/api/session'

const key = (c: string | null) => ['parameters', c] as const

export function useParameters() {
  const companyUid = useSession((s) => s.companyUid)
  return useQuery({
    queryKey: key(companyUid),
    queryFn: () => prm.parameters.list(),
    enabled: !!companyUid,
  })
}

export function useUpdateParameters() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (changes: ParameterChange[]) => prm.parameters.update(changes),
    onSuccess: (data) => qc.setQueryData(['parameters', useSession.getState().companyUid], data),
  })
}
