/**
 * TanStack Query hooks for the item master + stock engine.
 * Server state only (CLAUDE.md §7); keys scoped by active company.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as st from '@/api/stock'
import { useSession } from '@/api/session'

function useCompany() {
  return useSession((s) => s.companyUid)
}

export function useItems(params: { item_type?: string; active_only?: boolean; search?: string } = {}) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stock', c, 'items', params] as const,
    queryFn: () => st.items.list(params),
    enabled: !!c,
  })
}

export function useStockEnquiry(
  params: { warehouse?: string; item_type?: string; search?: string; hide_zero?: boolean } = {},
) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stock', c, 'enquiry', params] as const,
    queryFn: () => st.stock.enquiry(params),
    enabled: !!c,
  })
}

export function useStockBalances(
  params: { warehouse?: string; item_type?: string; search?: string; hide_zero?: boolean } = {},
) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stock', c, 'balances', params] as const,
    queryFn: () => st.stock.balanceEnquiry(params),
    enabled: !!c,
  })
}

export function useBatchEnquiry(
  params: { item_type?: string; search?: string; hide_zero?: boolean } = {},
) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stock', c, 'batches', params] as const,
    queryFn: () => st.stock.batchesEnquiry(params),
    enabled: !!c,
  })
}

export function useStockLedger(item: string | undefined, warehouse?: string, batch?: string) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stock', c, 'ledger', item ?? '', warehouse ?? '', batch ?? ''] as const,
    queryFn: () => st.stock.ledger(item as string, warehouse, batch),
    enabled: !!c && !!item,
  })
}

function useInvalidateStock() {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'stock', refetchType: 'active' })
}

export function useReceive() {
  const invalidate = useInvalidateStock()
  return useMutation({ mutationFn: (body: st.ReceiptBody) => st.stock.receive(body), onSuccess: invalidate })
}

/* ─────────────────────────── Movement transactions ─────────────────────────── */
export function useMovements(movement_type?: string, item?: string, warehouse?: string) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stock', c, 'movements', movement_type ?? '', item ?? '', warehouse ?? ''] as const,
    queryFn: () => st.transactions.movements({ movement_type, item, warehouse }),
    enabled: !!c,
  })
}

function useTxn<T>(fn: (body: any) => Promise<T>) {
  const invalidate = useInvalidateStock()
  return useMutation({ mutationFn: (body: any) => fn(body), onSuccess: invalidate })
}

export const useIssue = () => useTxn(st.transactions.issue)
export const useIssueBulk = () => useTxn(st.transactions.issueBulk)
export const useReturnMaterial = () => useTxn(st.transactions.returnMaterial)
export const useReturnBulk = () => useTxn(st.transactions.returnBulk)
export const useAdjust = () => useTxn(st.transactions.adjust)
export const useAdjustBulk = () => useTxn(st.transactions.adjustBulk)
export const useTransfer = () => useTxn(st.transactions.transfer)
export const useTransferBulk = () => useTxn(st.transactions.transferBulk)
export const useScrap = () => useTxn(st.transactions.scrap)

/* ─────────────────────────── Bin occupancy / put-away ─────────────────────────── */
export function useBinOccupancy(warehouse: string | undefined) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stock', c, 'occupancy', warehouse ?? ''] as const,
    queryFn: () => st.occupancy.byWarehouse(warehouse as string),
    enabled: !!c && !!warehouse,
  })
}

export const usePutaway = () => useTxn(st.transactions.putaway)
