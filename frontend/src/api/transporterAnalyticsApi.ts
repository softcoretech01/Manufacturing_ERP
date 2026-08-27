import { api } from './client'
import type { TransporterScore, RegionDispatch } from '@/types/dispatch'

export const transporterAnalyticsApi = {
  getScores: () => api.get<TransporterScore[]>('/dispatch/analytics/transporter-scores'),
  createScore: (data: Partial<TransporterScore>) => api.post<TransporterScore>('/dispatch/analytics/transporter-scores', data),
  updateScore: (id: string | number, data: Partial<TransporterScore>) => api.put<TransporterScore>(`/dispatch/analytics/transporter-scores/${id}`, data),
  deleteScore: (id: string | number) => api.delete(`/dispatch/analytics/transporter-scores/${id}`),

  getRegions: () => api.get<RegionDispatch[]>('/dispatch/analytics/region-dispatch'),
  createRegion: (data: Partial<RegionDispatch>) => api.post<RegionDispatch>('/dispatch/analytics/region-dispatch', data),
  updateRegion: (id: string | number, data: Partial<RegionDispatch>) => api.put<RegionDispatch>(`/dispatch/analytics/region-dispatch/${id}`, data),
  deleteRegion: (id: string | number) => api.delete(`/dispatch/analytics/region-dispatch/${id}`),
}
