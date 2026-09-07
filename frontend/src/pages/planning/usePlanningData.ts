import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { runMrp, type MrpResult, type PlanningContext } from '@/lib/planFlow'
import { planningApi } from '@/api/planning'
import { engineeringApi } from '@/api/engineering'
import { items as masterItemsApi, stock } from '@/api/stock'
import { getPurchaseOrders } from '@/api/procurement'
import { bucketStarts, DEFAULT_HORIZON } from '@/lib/planFlow'
import type { Bom, EngProduct, EngWorkCentre, Routing, Tool } from '@/types/engineering'
import type { PurchaseOrder } from '@/types/procurement'
import type { DemandLine, ForecastLine, MpsLine, PlanningPolicy, ProductionOrder, CalendarDay } from '@/types/planning'
import type { StockPosition } from '@/types/inventory'

// Helper to mimic the `useCollection` signature using React Query
function useApiCollection<T extends { uid: string }>(
  key: string,
  fetchFn: () => Promise<T[]>,
  createFn: (data: Omit<T, 'uid' | 'createdAt' | 'version'>) => Promise<T>,
  updateFn: (uid: string, data: Partial<T>) => Promise<T>
) {
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: [key], queryFn: fetchFn })

  const createMutation = useMutation({
    mutationFn: createFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [key] })
  })

  const updateMutation = useMutation({
    mutationFn: ({ uid, data }: { uid: string, data: Partial<T> }) => updateFn(uid, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [key] })
  })

  return {
    rows: query.data ?? [],
    create: (data: Omit<T, 'uid' | 'createdAt' | 'version'>) => createMutation.mutateAsync(data),
    update: (uid: string, patch: Partial<T>) => updateMutation.mutateAsync({ uid, data: patch }),
    remove: async (uid: string) => {
      // Soft delete fallback if no delete endpoint exists
      await updateMutation.mutateAsync({ uid, data: { status: 'CANCELLED' } as any })
    },
    isLoading: query.isLoading,
  }
}

export function usePlanningData() {
  const demand = useApiCollection<DemandLine>('plan:demand', planningApi.getDemand, planningApi.createDemand, planningApi.updateDemand as any)
  const forecast = useApiCollection<ForecastLine>('plan:forecast', planningApi.getForecasts, planningApi.createForecast, planningApi.updateForecast as any)
  const mps = useApiCollection<MpsLine>('plan:mps', planningApi.getMps, planningApi.createMps, planningApi.updateMps as any)
  const policies = useApiCollection<PlanningPolicy>('plan:policies', planningApi.getPolicies, planningApi.createPolicy, planningApi.updatePolicy as any)
  const orders = useApiCollection<ProductionOrder>('plan:orders', planningApi.getOrders, planningApi.createOrder, planningApi.updateOrder as any)
  const calendar = useApiCollection<CalendarDay>('plan:calendar', planningApi.getCalendar, planningApi.createCalendarDay, planningApi.updateCalendarDay as any)

  const bomsQuery = useQuery({ queryKey: ['eng:boms'], queryFn: engineeringApi.getBoms })
  const routingsQuery = useQuery({ queryKey: ['eng:routings'], queryFn: engineeringApi.getRoutings })
  const workCentresQuery = useQuery({ queryKey: ['eng:workcentres'], queryFn: engineeringApi.getEngWorkCentres })
  const productsQuery = useQuery({ queryKey: ['eng:products'], queryFn: engineeringApi.getEngProducts })
  const toolsQuery = useQuery({ queryKey: ['eng:tools'], queryFn: engineeringApi.getEngTools })
  const purchaseOrdersQuery = useQuery({ queryKey: ['proc:po'], queryFn: getPurchaseOrders })
  
  const boms = { rows: bomsQuery.data ?? [], isLoading: bomsQuery.isLoading }
  const routings = { rows: routingsQuery.data ?? [], isLoading: routingsQuery.isLoading }
  const workCentres = { rows: workCentresQuery.data ?? [], isLoading: workCentresQuery.isLoading }
  const products = { rows: productsQuery.data ?? [], isLoading: productsQuery.isLoading }
  const tools = { rows: toolsQuery.data ?? [], isLoading: toolsQuery.isLoading }
  const purchaseOrders = { rows: purchaseOrdersQuery.data ?? [], isLoading: purchaseOrdersQuery.isLoading }

  const itemsQuery = useQuery({ queryKey: ['masters:items'], queryFn: (): Promise<any[]> => masterItemsApi.list().then(res => Array.isArray(res) ? res : (res as any).data || []) })
  const stockQuery = useQuery({ queryKey: ['stock:enquiry'], queryFn: (): Promise<any[]> => stock.enquiry().then(res => Array.isArray(res) ? res : (res as any).data || []) })

  const masterItems = itemsQuery.data ?? []
  
  const stockPositions: StockPosition[] = useMemo(() => {
    return (stockQuery.data ?? []).map((row: any) => ({
      uid: row.item_uid,
      itemCode: row.item_code,
      itemName: row.item_name,
      uom: row.uom,
      itemClass: row.item_type,
      onHand: row.on_hand,
      available: row.available,
      quarantine: row.quarantine,
      blocked: row.blocked,
      reorderLevel: row.reorder_level ?? 0,
      rate: row.value && row.on_hand > 0 ? row.value / row.on_hand : 0,
      maxLevel: row.max_level ?? 0,
      safetyStock: row.reorder_level ?? 0,
      leadTimeDays: 7, // Default estimation
      reserved: row.on_hand - row.available - row.quarantine - row.blocked,
      abcClass: 'C',
      xyzClass: 'Z',
      inTransit: 0,
      atSubcontractor: 0,
      onOrder: 0,
      wip: 0,
      minLevel: 0,
      avgDailyDemand: 0,
      lastIssueOn: null,
      isBatchTracked: false,
      isSerialTracked: false,
    }))
  }, [stockQuery.data])

  const ctx: PlanningContext = useMemo(
    () => ({
      boms: boms.rows,
      routings: routings.rows,
      workCentres: workCentres.rows,
      items: masterItems,
      stock: stockPositions,
      policies: policies.rows,
      calendar: calendar.rows,
    }),
    [boms.rows, routings.rows, workCentres.rows, policies.rows, calendar.rows, masterItems, stockPositions],
  )

  const mrp: MrpResult = useMemo(
    () =>
      runMrp({
        demand: demand.rows,
        mps: mps.rows,
        purchaseOrders: purchaseOrders.rows,
        productionOrders: orders.rows,
        ctx,
        horizon: DEFAULT_HORIZON,
        useMps: true,
      }),
    [demand.rows, mps.rows, purchaseOrders.rows, orders.rows, ctx],
  )

  const STARTS = useMemo(() => bucketStarts(DEFAULT_HORIZON), [])

  return {
    demand,
    forecast,
    mps,
    policies,
    orders,
    calendar,
    boms,
    routings,
    workCentres,
    products,
    tools,
    purchaseOrders,
    ctx,
    mrp,
    starts: STARTS,
    horizon: DEFAULT_HORIZON,
  }
}
