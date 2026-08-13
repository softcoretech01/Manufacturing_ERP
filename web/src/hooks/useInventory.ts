/**
 * TanStack Query hooks for Inventory storage structure (zones + bins).
 * Server state only (CLAUDE.md §7). Keys are scoped by the active company and the
 * selected warehouse, so switching either re-scopes and refetches. Mutations
 * invalidate the affected lists so the tables stay consistent.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as inv from '@/api/inventory'
import type { BinListParams } from '@/api/inventory'
import type { Page } from '@/api/client'
import { useSession } from '@/api/session'

export const invKeys = {
  zones: (c: string | null, wh: string) => ['inv', c, 'zones', wh] as const,
  bins: (c: string | null, wh: string, params?: BinListParams) =>
    ['inv', c, 'bins', wh, params ?? {}] as const,
}

function useCompany() {
  return useSession((s) => s.companyUid)
}

/** Invalidate every inventory query of a kind (zones|bins), regardless of warehouse. */
function useInvalidate(kind: 'zones' | 'bins') {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'inv' && q.queryKey[2] === kind,
      refetchType: 'active',
    })
}

/* ─────────────────────────── Zones ─────────────────────────── */
export function useZones(warehouseUid: string | undefined) {
  const c = useCompany()
  return useQuery({
    queryKey: invKeys.zones(c, warehouseUid ?? ''),
    queryFn: () => inv.zones.list(warehouseUid as string),
    enabled: !!c && !!warehouseUid,
  })
}

export function useCreateZone() {
  const invalidate = useInvalidate('zones')
  return useMutation({ mutationFn: (body: Record<string, unknown>) => inv.zones.create(body), onSuccess: invalidate })
}

export function useUpdateZone() {
  const invalidate = useInvalidate('zones')
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: Record<string, unknown> }) => inv.zones.update(uid, body),
    onSuccess: invalidate,
  })
}

export function useDeactivateZone() {
  const invalidate = useInvalidate('zones')
  return useMutation({
    mutationFn: ({ uid, version }: { uid: string; version: number }) => inv.zones.deactivate(uid, version),
    onSuccess: invalidate,
  })
}

export function useRestoreZone() {
  const invalidate = useInvalidate('zones')
  return useMutation({ mutationFn: (uid: string) => inv.zones.restore(uid), onSuccess: invalidate })
}

/* ─────────────────────────── Bins ─────────────────────────── */
export function useBins(warehouseUid: string | undefined, params?: BinListParams) {
  const c = useCompany()
  return useQuery<Page<inv.Bin>>({
    queryKey: invKeys.bins(c, warehouseUid ?? '', params),
    queryFn: () => inv.bins.list(warehouseUid as string, params),
    enabled: !!c && !!warehouseUid,
  })
}

export function useCreateBin() {
  const invalidate = useInvalidate('bins')
  return useMutation({ mutationFn: (body: Record<string, unknown>) => inv.bins.create(body), onSuccess: invalidate })
}

export function useUpdateBin() {
  const invalidate = useInvalidate('bins')
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: Record<string, unknown> }) => inv.bins.update(uid, body),
    onSuccess: invalidate,
  })
}

export function useBlockBin() {
  const invalidate = useInvalidate('bins')
  return useMutation({
    mutationFn: ({ uid, version, reason }: { uid: string; version: number; reason: string }) =>
      inv.bins.block(uid, version, reason),
    onSuccess: invalidate,
  })
}

export function useUnblockBin() {
  const invalidate = useInvalidate('bins')
  return useMutation({
    mutationFn: ({ uid, version }: { uid: string; version: number }) => inv.bins.unblock(uid, version),
    onSuccess: invalidate,
  })
}

export function useDeactivateBin() {
  const invalidate = useInvalidate('bins')
  return useMutation({
    mutationFn: ({ uid, version }: { uid: string; version: number }) => inv.bins.deactivate(uid, version),
    onSuccess: invalidate,
  })
}

export function useRestoreBin() {
  const invalidate = useInvalidate('bins')
  return useMutation({ mutationFn: (uid: string) => inv.bins.restore(uid), onSuccess: invalidate })
}

export function useBulkGenerateBins() {
  const invalidate = useInvalidate('bins')
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => inv.bins.bulkGenerate(body),
    onSuccess: invalidate,
  })
}
