import { api as client } from './client'
import type { Ncr } from '../types/quality'

const ENDPOINT = '/quality/ncrs'

export const ncrsApi = {
  getNextCode: () => client.get<{code: string}>(`${ENDPOINT}/next-code`),
  getAll: () => client.get<Ncr[]>(ENDPOINT),
  
  create: (data: Partial<Ncr>) => 
    client.post<Ncr>(ENDPOINT, data),
    
  update: (id: number, data: Partial<Ncr>) => 
    client.put<Ncr>(`${ENDPOINT}/${id}`, data),
    
  remove: (id: number) => 
    client.del<{message: string}>(`${ENDPOINT}/${id}`)
}
