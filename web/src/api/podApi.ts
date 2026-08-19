import { api } from './client'
import type { Pod } from '@/types/dispatch'

export const podApi = {
  getAll: () => api.get<Pod[]>('/dispatch/pods'),
  create: (data: Partial<Pod>) => api.post<Pod>('/dispatch/pods', data),
  update: (id: string | number, data: Partial<Pod>) => api.put<Pod>(`/dispatch/pods/${id}`, data),
  delete: (id: string | number) => api.delete(`/dispatch/pods/${id}`),
}
