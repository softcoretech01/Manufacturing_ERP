import { api } from './client'
import type { SupplierQualityRecord } from '../types/quality'

const ENDPOINT = '/quality/suppliers'

export const supplierQualityApi = {
  getAll: async () => {
    return api.get<SupplierQualityRecord[]>(ENDPOINT)
  },
  
  update: async (supplierCode: string, data: Partial<SupplierQualityRecord>) => {
    return api.put<SupplierQualityRecord>(`${ENDPOINT}/${supplierCode}`, data)
  }
}
