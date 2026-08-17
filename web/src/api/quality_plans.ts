import { api } from '@/api/client'
import type { InspectionPlan } from '@/types/quality'

export const plansApi = {
  getAll: async () => {
    return api.get<InspectionPlan[]>('/quality/plans')
  },
  
  create: async (data: Partial<InspectionPlan>) => {
    return api.post<{ message: string; id: number; planCode: string }>('/quality/plans', data)
  },
  
  update: async (id: number, data: Partial<InspectionPlan>) => {
    return api.put<{ message: string; id: number }>(`/quality/plans/${id}`, data)
  },
  
  remove: async (id: number) => {
    return api.del<{ message: string; id: number }>(`/quality/plans/${id}`)
  }
}
