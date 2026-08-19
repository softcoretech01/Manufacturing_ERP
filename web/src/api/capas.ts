import { api as client } from './client'
import type { Capa } from '../types/quality'

const ENDPOINT = '/quality/capas'

export const capasApi = {
  getNextCode: () => client.get<{code: string}>(`${ENDPOINT}/next-code`),
  getAll: () => client.get<Capa[]>(ENDPOINT),
  
  create: (data: Partial<Capa>) => 
    client.post<Capa>(ENDPOINT, data),
    
  update: (id: number, data: Partial<Capa>) => 
    client.put<Capa>(`${ENDPOINT}/${id}`, data),
    
  remove: (id: number) => 
    client.del<{message: string}>(`${ENDPOINT}/${id}`)
}
