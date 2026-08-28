import { api as client } from './client'
import type { DefectType } from '@/types/quality'

const ENDPOINT = '/quality/defects'

export const defectsApi = {
  getNextCode: () => client.get<{code: string}>(`${ENDPOINT}/next-code`),
  getAll: () => client.get<DefectType[]>(ENDPOINT),
  
  create: (data: Partial<DefectType>) => 
    client.post<DefectType>(ENDPOINT, data),
    
  update: (id: number, data: Partial<DefectType>) => 
    client.put<DefectType>(`${ENDPOINT}/${id}`, data),
    
  remove: (id: number) => 
    client.del<{message: string}>(`${ENDPOINT}/${id}`)
}
