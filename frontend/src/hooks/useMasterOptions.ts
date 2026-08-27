import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as masters from '@/api/masters'
import { currencies } from '@/api/organisation'

export type MasterOption = { value: string; label: string }

/**
 * Reference masters that dropdowns across the app source their options from.
 * Add a source here and any screen can render a live dropdown for it.
 */
const SOURCES: Record<string, { fetch: () => Promise<any[]>; map: (r: any) => MasterOption }> = {
  UOM: {
    fetch: masters.getUOMs,
    map: (r) => ({ value: r.code ?? r.symbol ?? r.name, label: r.symbol ? `${r.name} (${r.symbol})` : r.name }),
  },
  PAYMENT_TERMS: {
    fetch: masters.getPaymentTerms,
    map: (r) => ({ value: r.code, label: r.name }),
  },
  CURRENCY: {
    fetch: () => currencies.list(),
    map: (r) => ({ value: r.code, label: r.name ? `${r.code} — ${r.name}` : r.code }),
  },
}

/** Live dropdown options {value,label} sourced from a reference master. */
export function useMasterOptions(code: string): MasterOption[] {
  const src = SOURCES[code]
  const { data = [] } = useQuery({
    queryKey: ['master-options', code],
    queryFn: () => (src ? src.fetch() : Promise.resolve([])),
    enabled: !!src,
    staleTime: 5 * 60_000,
  })
  return useMemo(
    () => (src ? (data as any[]).map(src.map).filter((o) => o.value) : []),
    [data, src],
  )
}
