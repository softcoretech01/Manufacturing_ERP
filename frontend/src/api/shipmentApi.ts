import { api } from './client'
import type { Shipment } from '@/types/dispatch'

const BASE_PATH = '/dispatch/shipments'

export const shipmentApi = {
  getAll: () => api.get<Shipment[]>(BASE_PATH),
  getById: (id: number) => api.get<Shipment>(`${BASE_PATH}/${id}`),
  create: (data: Partial<Shipment>) => api.post<Shipment>(BASE_PATH, data),
  update: (id: number, data: Partial<Shipment>) => api.put<Shipment>(`${BASE_PATH}/${id}`, data),
  delete: (id: number) => api.del<{ detail: string }>(`${BASE_PATH}/${id}`),
}
