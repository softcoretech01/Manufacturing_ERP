import { api as client } from './client'
import type { Instrument } from '../types/quality'

const ENDPOINT = '/quality/instruments'

export const instrumentsApi = {
  getAll: () => client.get<Instrument[]>(ENDPOINT),
  
  create: (data: Partial<Instrument>) => 
    client.post<Instrument>(ENDPOINT, data),
    
  update: (id: number, data: Partial<Instrument>) => 
    client.put<Instrument>(`${ENDPOINT}/${id}`, data),
    
  remove: (id: number) => 
    client.del<{message: string}>(`${ENDPOINT}/${id}`)
}
