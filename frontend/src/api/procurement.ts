import { api } from './client'

export const getRequisitions = () => api.get<any>('/procurement/requisitions').then(res => Array.isArray(res) ? res : res.data || [])
export const getRequisition = (id: string) => api.get<any>(`/procurement/requisitions/${id}`)
export const createRequisition = (data: any) => api.post<any>('/procurement/requisitions', data)
export const updateRequisition = (id: string, data: any) => api.put<any>(`/procurement/requisitions/${id}`, data)
export const deleteRequisition = (id: string) => api.del(`/procurement/requisitions/${id}`)

export const getRfqs = () => api.get<any>('/procurement/rfq').then(res => Array.isArray(res) ? res : res.data || [])
export const getRfq = (id: string) => api.get<any>(`/procurement/rfq/${id}`)
export const createRfq = (data: any) => api.post<any>('/procurement/rfq', data)
export const updateRfq = (id: string, data: any) => api.put<any>(`/procurement/rfq/${id}`, data)
export const deleteRfq = (id: string) => api.del(`/procurement/rfq/${id}`)

export const getQuotations = () => api.get<any>('/procurement/quotations').then(res => Array.isArray(res) ? res : res.data || [])
export const getQuotation = (id: string) => api.get<any>(`/procurement/quotations/${id}`)
export const createQuotation = (data: any) => api.post<any>('/procurement/quotations', data)
export const updateQuotation = (id: string, data: any) => api.put<any>(`/procurement/quotations/${id}`, data)
export const deleteQuotation = (id: string) => api.del(`/procurement/quotations/${id}`)
/** Award the RFQ to this supplier's quotation. The backend marks the winner
 *  SELECTED, the others REJECTED and closes the RFQ, all in one transaction. */
export const selectQuotation = (id: string, remarks?: string) =>
  api.post(`/procurement/quotations/${id}/select`, { remarks: remarks || null })

export const getPurchaseOrders = () => api.get<any>('/procurement/purchase-orders').then(res => Array.isArray(res) ? res : res.data || [])
export const getPurchaseOrder = (id: string) => api.get<any>(`/procurement/purchase-orders/${id}`)
export const createPurchaseOrder = (data: any) => api.post<any>('/procurement/purchase-orders', data)
export const updatePurchaseOrder = (id: string, data: any) => api.put<any>(`/procurement/purchase-orders/${id}`, data)
export const deletePurchaseOrder = (id: string) => api.del(`/procurement/purchase-orders/${id}`)

export const getGrns = () => api.get<any>('/procurement/grn/').then(res => Array.isArray(res) ? res : res.data || [])
export const getGrn = (id: string) => api.get<any>(`/procurement/grn/${id}`)
export const createGrn = (data: any) => api.post<any>('/procurement/grn/', data)
export const updateGrn = (id: string, data: any) => api.put<any>(`/procurement/grn/${id}`, data)
export const deleteGrn = (id: string) => api.del(`/procurement/grn/${id}`)
/** Post a draft GRN into the stock ledger.
 *
 *  The one authoritative stock-posting path for procurement (see the backend's
 *  GrnPostingService): it books only accepted quantity, sends inspection-gated
 *  items to quarantine, rolls the quantities back onto the PO and refuses a GRN
 *  that is already POSTED. Never receive a GRN through the generic stock
 *  endpoint — that bypasses all of it and double-counts stock. */
export const postGrn = (id: string) => api.post<any>(`/procurement/grn/${id}/post`, {})
