import { api } from './client'
import type { ExportShipment } from '@/types/dispatch'

export const exportShipmentApi = {
  getAll: () => api.get<ExportShipment[]>('/dispatch/export-shipments'),
  create: (data: Partial<ExportShipment>) => api.post<ExportShipment>('/dispatch/export-shipments', data),
  update: (id: string | number, data: Partial<ExportShipment>) => api.put<ExportShipment>(`/dispatch/export-shipments/${id}`, data),
  delete: (id: string | number) => api.delete(`/dispatch/export-shipments/${id}`),
}
