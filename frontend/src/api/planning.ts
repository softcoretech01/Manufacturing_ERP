import { api } from './client'
import type {
  DemandLine,
  ForecastLine,
  MpsLine,
  PlanningPolicy,
  ProductionOrder,
  CalendarDay
} from '@/types/planning'

function toCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toCamel)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
        toCamel(v)
      ])
    )
  }
  return obj
}

function toSnake(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toSnake)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`),
        toSnake(v)
      ])
    )
  }
  return obj
}

export const planningApi = {
  // Demand
  getDemand: () => api.get<any>('/planning/demand').then(toCamel) as Promise<DemandLine[]>,
  createDemand: (data: Omit<DemandLine, 'uid' | 'createdAt' | 'version'>) =>
    api.post<any>('/planning/demand', toSnake(data)).then(toCamel) as Promise<DemandLine>,
  updateDemand: (uid: string, data: Partial<DemandLine>) =>
    api.put<any>(`/planning/demand/${uid}`, toSnake(data)).then(toCamel) as Promise<DemandLine>,

  // Forecasts
  getForecasts: () => api.get<any>('/planning/forecasts').then(toCamel) as Promise<ForecastLine[]>,
  createForecast: (data: Omit<ForecastLine, 'uid' | 'createdAt' | 'version'>) =>
    api.post<any>('/planning/forecasts', toSnake(data)).then(toCamel) as Promise<ForecastLine>,
  updateForecast: (uid: string, data: Partial<ForecastLine>) =>
    api.put<any>(`/planning/forecasts/${uid}`, toSnake(data)).then(toCamel) as Promise<ForecastLine>,

  // MPS
  getMps: () => api.get<any>('/planning/mps').then(toCamel) as Promise<MpsLine[]>,
  createMps: (data: Omit<MpsLine, 'uid' | 'createdAt' | 'version'>) =>
    api.post<any>('/planning/mps', toSnake(data)).then(toCamel) as Promise<MpsLine>,
  updateMps: (uid: string, data: Partial<MpsLine>) =>
    api.put<any>(`/planning/mps/${uid}`, toSnake(data)).then(toCamel) as Promise<MpsLine>,

  // Planning Policies
  getPolicies: () => api.get<any>('/planning/policies').then(toCamel) as Promise<PlanningPolicy[]>,
  createPolicy: (data: Omit<PlanningPolicy, 'uid' | 'createdAt' | 'version'>) =>
    api.post<any>('/planning/policies', toSnake(data)).then(toCamel) as Promise<PlanningPolicy>,
  updatePolicy: (uid: string, data: Partial<PlanningPolicy>) =>
    api.put<any>(`/planning/policies/${uid}`, toSnake(data)).then(toCamel) as Promise<PlanningPolicy>,

  // Production Orders
  getOrders: () => api.get<any>('/planning/orders').then(toCamel) as Promise<ProductionOrder[]>,
  createOrder: (data: Omit<ProductionOrder, 'uid' | 'createdAt' | 'version'>) =>
    api.post<any>('/planning/orders', toSnake(data)).then(toCamel) as Promise<ProductionOrder>,
  updateOrder: (uid: string, data: Partial<ProductionOrder>) =>
    api.put<any>(`/planning/orders/${uid}`, toSnake(data)).then(toCamel) as Promise<ProductionOrder>,

  // Calendar
  getCalendar: () => api.get<any>('/planning/calendar')
    .then(res => toCamel(res).map((d: any) => ({ ...d, date: d.calDate }))) as Promise<CalendarDay[]>,
  createCalendarDay: (data: Omit<CalendarDay, 'uid' | 'createdAt' | 'version'>) =>
    api.post<any>('/planning/calendar', toSnake({ ...data, calDate: data.date }))
      .then(res => { const d = toCamel(res); d.date = d.calDate; return d }) as Promise<CalendarDay>,
  updateCalendarDay: (uid: string, data: Partial<CalendarDay>) =>
    api.put<any>(`/planning/calendar/${uid}`, toSnake({ ...data, calDate: data.date }))
      .then(res => { const d = toCamel(res); d.date = d.calDate; return d }) as Promise<CalendarDay>,
}
