import { api } from './client'
import type { 
  Bom, EngProduct, EngDocument, Operation, EngWorkCentre, 
  Tool, Routing, EngChange 
} from '@/types/engineering'

const mapItemToEngProduct = (item: any) => ({
  uid: item.uid || item.id || item.code,
  code: item.code,
  name: item.name,
  productType: item.itemType || 'FINISHED',
  family: item.category || item.family || 'Vacuum Flask',
  capacityMl: item.capacityMl,
  colour: item.colour || '',
  brand: item.series || 'AquaSteel',
  baseUom: item.baseUom || 'NOS',
  netWeightG: item.netWeightG,
  lifecycle: item.status === 'ACTIVE' ? 'PRODUCTION' : item.status === 'DRAFT' ? 'CONCEPT' : 'APPROVED',
  revision: item.revision || 1,
  effectiveFrom: item.effectiveFrom || new Date().toISOString().slice(0, 10),
  spec: (() => {
    try {
      return item.specification ? JSON.parse(item.specification) : {}
    } catch (e) {
      return {}
    }
  })(),
  standardCost: item.standardCost || 0,
  costRolledAt: null,
  createdBy: 'Rahul Iyer',
  createdAt: item.createdAt || new Date().toISOString(),
  modifiedAt: item.modifiedAt || new Date().toISOString(),
  version: 1,
  remarks: item.description || ''
});

export const engineeringApi = {
  // BOMs
  getBoms: (): Promise<Bom[]> => api.get<Bom[]>('/engineering/boms').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createBom: (data: Partial<Bom>) => api.post<Bom>('/engineering/boms', data),
  updateBom: (id: string | number, data: Partial<Bom>) => api.put<Bom>(`/engineering/boms/${id}`, data),
  deleteBom: (id: string | number) => api.del(`/engineering/boms/${id}`),
  getNextBomCode: () => api.get<{nextCode: string}>('/engineering/boms/next-code'),

  // Products (Migrated to Item Master)

  getEngProducts: (): Promise<EngProduct[]> => api.get<any[]>('/items').then((res: any) => {
    const data = Array.isArray(res) ? res : res.data || [];
    return data.map(mapItemToEngProduct);
  }),
  createEngProduct: (data: any) => {
    const itemData = {
      itemType: data.productType || 'FINISHED',
      category: data.family || '',
      family: data.family || '',
      series: data.brand || '',
      baseUom: data.baseUom || 'NOS',
      capacityMl: data.capacityMl || null,
      colour: data.colour || null,
      netWeightG: data.netWeightG || null,
      steelGrade: data.spec?.materialGrade || null,
      lidType: null,
      status: data.lifecycle === 'PRODUCTION' ? 'ACTIVE' : data.lifecycle === 'CONCEPT' ? 'DRAFT' : 'APPROVED',
      effectiveFrom: data.effectiveFrom || new Date().toISOString().slice(0, 10),
      specification: JSON.stringify(data.spec || {}),
      standardCost: data.standardCost || 0,
      description: data.remarks || '',
      isManufactured: true,
      isPurchased: false,
      isSold: true,
      name: data.name,
      code: data.code,
      shortName: (data.name || '').substring(0, 10),
      purchaseUom: data.baseUom || 'NOS',
      salesUom: data.baseUom || 'NOS',
      valuationMethod: 'FIFO',
    };
    return api.post<any>('/items', itemData).then(mapItemToEngProduct);
  },
  updateEngProduct: (id: string | number, data: any) => {
    const itemData = {
      itemType: data.productType || 'FINISHED',
      category: data.family || '',
      family: data.family || '',
      series: data.brand || '',
      baseUom: data.baseUom || 'NOS',
      capacityMl: data.capacityMl || null,
      colour: data.colour || null,
      netWeightG: data.netWeightG || null,
      steelGrade: data.spec?.materialGrade || null,
      lidType: null,
      status: data.lifecycle === 'PRODUCTION' ? 'ACTIVE' : data.lifecycle === 'CONCEPT' ? 'DRAFT' : 'APPROVED',
      effectiveFrom: data.effectiveFrom || new Date().toISOString().slice(0, 10),
      specification: JSON.stringify(data.spec || {}),
      standardCost: data.standardCost || 0,
      description: data.remarks || '',
      isManufactured: true,
      isPurchased: false,
      isSold: true,
      name: data.name,
      code: data.code,
      shortName: (data.name || '').substring(0, 10),
      purchaseUom: data.baseUom || 'NOS',
      salesUom: data.baseUom || 'NOS',
      valuationMethod: 'FIFO',
    };
    return api.put<any>(`/items/${id}`, itemData).then(mapItemToEngProduct);
  },
  deleteEngProduct: (id: string | number) => api.del(`/items/${id}`),
  getEngProductNextCode: () => api.get<{nextCode: string}>('/items/next-code'),

  // Documents
  getEngDocuments: (): Promise<EngDocument[]> => api.get<EngDocument[]>('/engineering/documents').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngDocument: (data: Partial<EngDocument>) => api.post<EngDocument>('/engineering/documents', data),
  updateEngDocument: (id: string | number, data: Partial<EngDocument>) => api.put<EngDocument>(`/engineering/documents/${id}`, data),
  deleteEngDocument: (id: string | number) => api.del(`/engineering/documents/${id}`),
  getNextEngDocumentCode: () => api.get<{nextCode: string}>('/engineering/documents/next-code'),

  // Operations
  getEngOperations: (): Promise<Operation[]> => api.get<Operation[]>('/engineering/operations').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngOperation: (data: Partial<Operation>) => api.post<Operation>('/engineering/operations', data),
  updateEngOperation: (id: string | number, data: Partial<Operation>) => api.put<Operation>(`/engineering/operations/${id}`, data),
  deleteEngOperation: (id: string | number) => api.del(`/engineering/operations/${id}`),
  getEngOperationsNextCode: () => api.get<{nextCode: string}>('/engineering/operations/next-code'),
  getOperations: (): Promise<Operation[]> => api.get<Operation[]>('/engineering/operations').then((res: any) => Array.isArray(res) ? res : res.data || []), // Alias for some pages

  // WorkCentres
  getEngWorkCentres: (): Promise<EngWorkCentre[]> => api.get<EngWorkCentre[]>('/engineering/workcentres').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngWorkCentre: (data: Partial<EngWorkCentre>) => api.post<EngWorkCentre>('/engineering/workcentres', data),
  updateEngWorkCentre: (id: string | number, data: Partial<EngWorkCentre>) => api.put<EngWorkCentre>(`/engineering/workcentres/${id}`, data),
  deleteEngWorkCentre: (id: string | number) => api.del(`/engineering/workcentres/${id}`),
  getEngWorkCentresNextCode: () => api.get<{nextCode: string}>('/engineering/workcentres/next-code'),
  getWorkCentres: (): Promise<EngWorkCentre[]> => api.get<EngWorkCentre[]>('/engineering/workcentres').then((res: any) => Array.isArray(res) ? res : res.data || []),

  // Tools
  getEngTools: (): Promise<Tool[]> => api.get<Tool[]>('/engineering/tools').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngTool: (data: Partial<Tool>) => api.post<Tool>('/engineering/tools', data),
  updateEngTool: (id: string | number, data: Partial<Tool>) => api.put<Tool>(`/engineering/tools/${id}`, data),
  deleteEngTool: (id: string | number) => api.del(`/engineering/tools/${id}`),
  getEngToolsNextCode: () => api.get<{nextCode: string}>('/engineering/tools/next-code'),
  getTools: (): Promise<Tool[]> => api.get<Tool[]>('/engineering/tools').then((res: any) => Array.isArray(res) ? res : res.data || []),

  // Routings
  getRoutings: (): Promise<Routing[]> => api.get<Routing[]>('/engineering/routings').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createRouting: (data: Partial<Routing>) => api.post<Routing>('/engineering/routings', data),
  updateRouting: (id: string | number, data: Partial<Routing>) => api.put<Routing>(`/engineering/routings/${id}`, data),
  deleteRouting: (id: string | number) => api.del(`/engineering/routings/${id}`),
  getRoutingsNextCode: () => api.get<{nextCode: string}>('/engineering/routings/next-code'),

  // Machines (Used in Routings)
  getMachines: (): Promise<any[]> => api.get<any[]>('/engineering/workcentres').then((res: any) => Array.isArray(res) ? res : res.data || []),

  // Changes (ECN/ECR)
  getEngChanges: (): Promise<EngChange[]> => api.get<EngChange[]>('/engineering/changes').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngChange: (data: Partial<EngChange>) => api.post<EngChange>('/engineering/changes', data),
  updateEngChange: (id: string | number, data: Partial<EngChange>) => api.put<EngChange>(`/engineering/changes/${id}`, data),
  deleteEngChange: (id: string | number) => api.del(`/engineering/changes/${id}`),
  getNextEngChangeCode: (type: string) => api.get<{nextCode: string}>(`/engineering/changes/next-code?type=${type}`).then((res: any) => res.nextCode || res.data?.nextCode || ''),
}
