import { api } from './client'
import type { Inspection } from '../types/quality'

export const inspectionsApi = {
  getAll: async () => {
    return api.get<Inspection[]>('/quality/inspections')
  },
  
  create: async (data: Partial<Inspection>) => {
    return api.post<{ message: string; id: number; docNo: string }>('/quality/inspections', data)
  },
  
  update: async (id: number, data: Partial<Inspection>) => {
    return api.put<{ message: string; id: number }>(`/quality/inspections/${id}`, data)
  },
  
  remove: async (id: number) => {
    return api.del<{ message: string; id: number }>(`/quality/inspections/${id}`)
  }
}
