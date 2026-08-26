import { api } from './client'
import type { FreightCharge } from '@/types/dispatch'

export const freightApi = {
  getAll: () => api.get<FreightCharge[]>('/dispatch/freight-charges'),
  create: (data: Partial<FreightCharge>) => api.post<FreightCharge>('/dispatch/freight-charges', data),
  update: (id: string | number, data: Partial<FreightCharge>) => api.put<FreightCharge>(`/dispatch/freight-charges/${id}`, data),
  delete: (id: string | number) => api.delete(`/dispatch/freight-charges/${id}`),
}
