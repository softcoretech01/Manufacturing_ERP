import { api as client } from './client'
import type { Complaint } from '../types/quality'

const ENDPOINT = '/quality/complaints'

export const complaintsApi = {
  getAll: () => client.get<Complaint[]>(ENDPOINT),
  
  create: (data: Partial<Complaint>) => 
    client.post<Complaint>(ENDPOINT, data),
    
  update: (id: number, data: Partial<Complaint>) => 
    client.put<Complaint>(`${ENDPOINT}/${id}`, data),
    
  remove: (id: number) => 
    client.del<{message: string}>(`${ENDPOINT}/${id}`)
}
