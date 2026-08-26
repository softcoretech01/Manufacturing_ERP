import { api as client } from './client'
import type { QualityAudit } from '../types/quality'

const ENDPOINT = '/quality/audits'

export const auditsApi = {
  getAll: () => client.get<QualityAudit[]>(ENDPOINT),
  
  create: (data: Partial<QualityAudit>) => 
    client.post<QualityAudit>(ENDPOINT, data),
    
  update: (id: number, data: Partial<QualityAudit>) => 
    client.put<QualityAudit>(`${ENDPOINT}/${id}`, data),
    
  remove: (id: number) => 
    client.del<{message: string}>(`${ENDPOINT}/${id}`)
}
