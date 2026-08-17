import { api } from './client'
import type { 
  Bom, EngProduct, EngDocument, EngOperation, EngWorkCentre, 
  EngTool, Routing, EngChange 
} from '@/types/engineering'

export const engineeringApi = {
  // BOMs
  getBoms: () => api.get<Bom[]>('/engineering/boms').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createBom: (data: Partial<Bom>) => api.post<Bom>('/engineering/boms', data),
  updateBom: (id: string | number, data: Partial<Bom>) => api.put<Bom>(`/engineering/boms/${id}`, data),
  deleteBom: (id: string | number) => api.del(`/engineering/boms/${id}`),
  getNextBomCode: () => api.get<{nextCode: string}>('/engineering/boms/next-code'),

  // Products
  getEngProducts: () => api.get<EngProduct[]>('/engineering/products').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngProduct: (data: Partial<EngProduct>) => api.post<EngProduct>('/engineering/products', data),
  updateEngProduct: (id: string | number, data: Partial<EngProduct>) => api.put<EngProduct>(`/engineering/products/${id}`, data),
  deleteEngProduct: (id: string | number) => api.del(`/engineering/products/${id}`),
  getEngProductNextCode: () => api.get<{nextCode: string}>('/engineering/products/next-code'),

  // Documents
  getEngDocuments: () => api.get<EngDocument[]>('/engineering/documents').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngDocument: (data: Partial<EngDocument>) => api.post<EngDocument>('/engineering/documents', data),
  updateEngDocument: (id: string | number, data: Partial<EngDocument>) => api.put<EngDocument>(`/engineering/documents/${id}`, data),
  deleteEngDocument: (id: string | number) => api.del(`/engineering/documents/${id}`),
  getNextEngDocumentCode: () => api.get<{nextCode: string}>('/engineering/documents/next-code'),

  // Operations
  getEngOperations: () => api.get<EngOperation[]>('/engineering/operations').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngOperation: (data: Partial<EngOperation>) => api.post<EngOperation>('/engineering/operations', data),
  updateEngOperation: (id: string | number, data: Partial<EngOperation>) => api.put<EngOperation>(`/engineering/operations/${id}`, data),
  deleteEngOperation: (id: string | number) => api.del(`/engineering/operations/${id}`),
  getEngOperationsNextCode: () => api.get<{nextCode: string}>('/engineering/operations/next-code'),
  getOperations: () => api.get<EngOperation[]>('/engineering/operations').then((res: any) => Array.isArray(res) ? res : res.data || []), // Alias for some pages

  // WorkCentres
  getEngWorkCentres: () => api.get<EngWorkCentre[]>('/engineering/workcentres').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngWorkCentre: (data: Partial<EngWorkCentre>) => api.post<EngWorkCentre>('/engineering/workcentres', data),
  updateEngWorkCentre: (id: string | number, data: Partial<EngWorkCentre>) => api.put<EngWorkCentre>(`/engineering/workcentres/${id}`, data),
  deleteEngWorkCentre: (id: string | number) => api.del(`/engineering/workcentres/${id}`),
  getEngWorkCentresNextCode: () => api.get<{nextCode: string}>('/engineering/workcentres/next-code'),
  getWorkCentres: () => api.get<EngWorkCentre[]>('/engineering/workcentres').then((res: any) => Array.isArray(res) ? res : res.data || []),

  // Tools
  getEngTools: () => api.get<EngTool[]>('/engineering/tools').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngTool: (data: Partial<EngTool>) => api.post<EngTool>('/engineering/tools', data),
  updateEngTool: (id: string | number, data: Partial<EngTool>) => api.put<EngTool>(`/engineering/tools/${id}`, data),
  deleteEngTool: (id: string | number) => api.del(`/engineering/tools/${id}`),
  getEngToolsNextCode: () => api.get<{nextCode: string}>('/engineering/tools/next-code'),
  getTools: () => api.get<EngTool[]>('/engineering/tools').then((res: any) => Array.isArray(res) ? res : res.data || []),

  // Routings
  getRoutings: () => api.get<Routing[]>('/engineering/routings').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createRouting: (data: Partial<Routing>) => api.post<Routing>('/engineering/routings', data),
  updateRouting: (id: string | number, data: Partial<Routing>) => api.put<Routing>(`/engineering/routings/${id}`, data),
  deleteRouting: (id: string | number) => api.del(`/engineering/routings/${id}`),
  getRoutingsNextCode: () => api.get<{nextCode: string}>('/engineering/routings/next-code'),

  // Machines (Used in Routings)
  getMachines: () => api.get<any[]>('/engineering/workcentres').then((res: any) => Array.isArray(res) ? res : res.data || []),

  // Changes (ECN/ECR)
  getEngChanges: () => api.get<EngChange[]>('/engineering/changes').then((res: any) => Array.isArray(res) ? res : res.data || []),
  createEngChange: (data: Partial<EngChange>) => api.post<EngChange>('/engineering/changes', data),
  updateEngChange: (id: string | number, data: Partial<EngChange>) => api.put<EngChange>(`/engineering/changes/${id}`, data),
  deleteEngChange: (id: string | number) => api.del(`/engineering/changes/${id}`),
  getNextEngChangeCode: (type: string) => api.get<{nextCode: string}>(`/engineering/changes/next-code?type=${type}`).then((res) => res.nextCode || res.data?.nextCode || ''),
}
