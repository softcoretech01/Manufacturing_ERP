import { api } from './client'

// Exposing APIs that might not have been fully exported
export const getCostCentres = () => api.get<any>('/cost-centres').then(res => Array.isArray(res) ? res : res.data || [])
export const getPlants = () => api.get<any>('/plants').then(res => Array.isArray(res) ? res : res.data || [])
export const getWarehouses = () => api.get<any>('/warehouses').then(res => Array.isArray(res) ? res : res.data || [])
export const getCurrencies = () => api.get<any>('/currencies').then(res => Array.isArray(res) ? res : res.data || [])
