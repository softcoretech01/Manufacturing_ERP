import { api } from './client'
import type { ExportDocument } from '@/types/dispatch'

export const exportDocumentApi = {
  getAll: () => api.get<ExportDocument[]>('/dispatch/export-documents'),
  create: (data: Partial<ExportDocument>) => api.post<ExportDocument>('/dispatch/export-documents', data),
  update: (id: string | number, data: Partial<ExportDocument>) => api.put<ExportDocument>(`/dispatch/export-documents/${id}`, data),
  delete: (id: string | number) => api.delete(`/dispatch/export-documents/${id}`),
}
