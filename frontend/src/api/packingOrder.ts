import { api } from './client'
import type { PackingOrder } from '../types/dispatch'

// Map API snake_case keys to camelCase manually or ensure backend responds with CamelModel
// Since backend is CamelModel, the keys should already be camelCase.
// We map 'id' to 'uid' because frontend expects 'uid' for its unique key.

export const packingOrderApi = {
  getAll: async (): Promise<PackingOrder[]> => {
    const data = await api.get('/dispatch/packing-orders')
    return data.map((item: any) => ({
      ...item,
      uid: String(item.id),
    }))
  },

  getById: async (id: number): Promise<PackingOrder> => {
    const data = await api.get(`/dispatch/packing-orders/${id}`)
    return {
      ...data,
      uid: String(data.id),
    }
  },

  create: async (payload: Partial<PackingOrder>): Promise<PackingOrder> => {
    const data = await api.post('/dispatch/packing-orders', payload)
    return {
      ...data,
      uid: String(data.id),
    }
  },

  update: async (id: number, payload: Partial<PackingOrder>): Promise<PackingOrder> => {
    const data = await api.put(`/dispatch/packing-orders/${id}`, payload)
    return {
      ...data,
      uid: String(data.id),
    }
  },

  delete: async (id: number): Promise<void> => {
    await api.del(`/dispatch/packing-orders/${id}`)
  },
}
