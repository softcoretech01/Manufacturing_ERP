import { api } from './client'

export const dispatchDashboardApi = {
  getAnalytics: () => api.get<any>('/dispatch/dashboard/analytics'),
}
