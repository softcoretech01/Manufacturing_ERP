import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stockTxn } from '@/api/stockTxn'
import { useSession } from '@/api/session'

function useCompany() {
  return useSession((s) => s.companyUid)
}

export function useStockTxns(params: {
  txn_type?: string
  status?: string
  date_from?: string
  date_to?: string
  warehouse?: string
  search?: string
} = {}) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stockTxn', c, 'list', params] as const,
    queryFn: () => stockTxn.list(params),
    enabled: !!c,
  })
}

export function useStockTxnDetails(uid: string | undefined) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stockTxn', c, 'details', uid ?? ''] as const,
    queryFn: () => stockTxn.get(uid as string),
    enabled: !!c && !!uid,
  })
}

export function useReturnableQty(params: { stock_out_no: string; item_id: number; batch_no?: string } | null) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stockTxn', c, 'returnableQty', params] as const,
    queryFn: () => stockTxn.getReturnableQty(params!),
    enabled: !!c && !!params?.stock_out_no && !!params?.item_id,
  })
}

export function useDashboardKpis(params?: { date_from?: string; date_to?: string }) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stockTxn', c, 'dashboardKpis', params] as const,
    queryFn: () => stockTxn.getDashboardKpis(params),
    enabled: !!c,
  })
}

export function useLowStock(params: { warehouse?: string; item_type?: string } = {}) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stockTxn', c, 'lowStock', params] as const,
    queryFn: () => stockTxn.getLowStock(params),
    enabled: !!c,
  })
}

export function useCategoryLedger(params: {
  date_from?: string
  date_to?: string
  category?: string
  warehouse?: string
} = {}) {
  const c = useCompany()
  return useQuery({
    queryKey: ['stockTxn', c, 'categoryLedger', params] as const,
    queryFn: () => stockTxn.getCategoryLedger(params),
    enabled: !!c,
  })
}

function useInvalidateStockTxn() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'stockTxn', refetchType: 'active' })
    // Also invalidate general stock enquiry queries to keep balances in sync
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'stock', refetchType: 'active' })
  }
}

export function useCreateStockTxn() {
  const invalidate = useInvalidateStockTxn()
  return useMutation({
    mutationFn: stockTxn.create,
    onSuccess: invalidate,
  })
}

export function useUpdateStockTxn() {
  const invalidate = useInvalidateStockTxn()
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: any }) => stockTxn.update(uid, body),
    onSuccess: invalidate,
  })
}

export function useDeleteStockTxn() {
  const invalidate = useInvalidateStockTxn()
  return useMutation({
    mutationFn: stockTxn.delete,
    onSuccess: invalidate,
  })
}

export function usePostStockTxn() {
  const invalidate = useInvalidateStockTxn()
  return useMutation({
    mutationFn: stockTxn.post,
    onSuccess: invalidate,
  })
}

export function useCancelStockTxn() {
  const invalidate = useInvalidateStockTxn()
  return useMutation({
    mutationFn: stockTxn.cancel,
    onSuccess: invalidate,
  })
}
