import { api } from './client'
import type { PackMaterialLine } from '../types/dispatch'

export const packMaterialApi = {
  getAll: async (): Promise<PackMaterialLine[]> => {
    const data = await api.get('/dispatch/pack-materials')
    return data.map((item: any) => ({
      ...item,
      uid: String(item.id),
    }))
  },

  getById: async (id: number): Promise<PackMaterialLine> => {
    const data = await api.get(`/dispatch/pack-materials/${id}`)
    return {
      ...data,
      uid: String(data.id),
    }
  },

  create: async (payload: Partial<PackMaterialLine>): Promise<PackMaterialLine> => {
    const data = await api.post('/dispatch/pack-materials', payload)
    return {
      ...data,
      uid: String(data.id),
    }
  },

  update: async (id: number, payload: Partial<PackMaterialLine>): Promise<PackMaterialLine> => {
    const data = await api.put(`/dispatch/pack-materials/${id}`, payload)
    return {
      ...data,
      uid: String(data.id),
    }
  },

  delete: async (id: number): Promise<void> => {
    await api.del(`/dispatch/pack-materials/${id}`)
  },

  issueAll: async (packingOrderNo: string): Promise<PackMaterialLine[]> => {
    const data = await api.post(`/dispatch/pack-materials/issue-order/${packingOrderNo}`)
    return data.map((item: any) => ({
      ...item,
      uid: String(item.id),
    }))
  }
}
