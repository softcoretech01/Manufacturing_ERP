import { api } from './client'
import type { SalesReturn } from '@/types/dispatch'

export const salesReturnApi = {
  getAll: () => api.get<SalesReturn[]>('/dispatch/sales-returns'),
  create: (data: Partial<SalesReturn>) => api.post<SalesReturn>('/dispatch/sales-returns', data),
  update: (id: string | number, data: Partial<SalesReturn>) => api.put<SalesReturn>(`/dispatch/sales-returns/${id}`, data),
  delete: (id: string | number) => api.delete(`/dispatch/sales-returns/${id}`),
}
