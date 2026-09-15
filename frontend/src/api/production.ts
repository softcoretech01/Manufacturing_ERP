/**
 * Shop-floor execution API.
 *
 * Everything the floor does is a named action on the server, not a status the
 * browser writes: the server decides whether an operation may start, how much
 * may be booked against it and what moves to the next operation.
 */

import { api } from './client'

export interface WorkOrderRow {
  uid: string
  docNo: string
  orderDocNo: string
  productCode: string
  productName: string
  seq: number
  operationCode: string
  operationName: string
  workCentreCode: string
  machineCode: string | null
  toolCode: string | null
  skill: string
  operators: number
  status: string
  qcCheckpoint: boolean
  qcResult: string
  uom: string
  inputQty: number
  plannedQty: number
  producedQty: number
  scrapQty: number
  reworkQty: number
  setupMinutesStd: number
  runMinutesStd: number
  setupMinutesAct: number
  runMinutesAct: number
  operatorName: string | null
  shiftCode: string | null
  batchNo: string
  plannedStart: string
  plannedFinish: string
  startedAt: string | null
  completedAt: string | null
  remarks: string
  /** Which earlier operation is holding this one up, if any. */
  blockedBy: string | null
  blockedReason: string | null
  /** Computed server-side: sequence, input and status all allow a start. */
  canStart: boolean
}

export interface ReleaseResult {
  docNo: string
  status: string
  productCode: string
  quantity: number
  workOrders: string[]
  firstOperation: string | null
}

export interface OperationState {
  uid: string
  docNo: string
  orderDocNo: string
  seq: number
  status: string
  qcResult: string
  inputQty: number
  producedQty: number
  scrapQty: number
  reworkQty: number
  operatorName: string | null
  machineCode: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface CompleteResult {
  workOrder: OperationState
  awaitingQc: boolean
  next: { docNo: string; seq: number; inputQty: number } | null
  finishedGoods: {
    documentType: string
    documentNo: string
    itemCode: string
    quantity: number
    rate: number
    balanceAfter: number
  } | null
  released?: boolean
}

export interface EntryResult {
  entryDocNo: string
  workOrder: OperationState
  remainingToBook: number
}

export const productionApi = {
  /** Hand a planned order to the floor; the server writes its work orders. */
  releaseOrder: (orderUid: string) =>
    api.post<ReleaseResult>(`/production/orders/${orderUid}/release`),

  /** Released work in sequence, with why anything cannot start yet. */
  getWorkOrders: (params?: { workCentre?: string; status?: string }) =>
    api.get<WorkOrderRow[]>('/production/work-orders', params),

  /** Plan an operation onto a machine and a shift before anyone starts it. */
  assignOperation: (uid: string, body: { machineCode?: string; shiftCode?: string }) =>
    api.post<OperationState>(`/production/work-orders/${uid}/assign`, body),

  startOperation: (uid: string, body?: { machineCode?: string; shiftCode?: string }) =>
    api.post<OperationState>(`/production/work-orders/${uid}/start`, body ?? {}),
  pauseOperation: (uid: string, reason = '') =>
    api.post<OperationState>(`/production/work-orders/${uid}/pause`, { reason }),
  resumeOperation: (uid: string) =>
    api.post<OperationState>(`/production/work-orders/${uid}/resume`),
  holdOperation: (uid: string, reason: string) =>
    api.post<OperationState>(`/production/work-orders/${uid}/hold`, { reason }),
  cancelOperation: (uid: string, reason: string) =>
    api.post<OperationState>(`/production/work-orders/${uid}/cancel`, { reason }),
  completeOperation: (uid: string) =>
    api.post<CompleteResult>(`/production/work-orders/${uid}/complete`),

  /** Book good, scrap and rework. The only source of produced quantities. */
  recordProduction: (
    uid: string,
    body: {
      goodQty: number
      scrapQty?: number
      reworkQty?: number
      startedAt?: string
      endedAt?: string
      businessDate?: string
      machineCode?: string
      shiftCode?: string
      scrapReason?: string
      defectCode?: string
      remarks?: string
    },
  ) => api.post<EntryResult>(`/production/work-orders/${uid}/entries`, body),

  /** Record the quality decision on a checkpoint operation. */
  recordQc: (uid: string, body: { result: string; inspectionDocNo?: string; note?: string }) =>
    api.post<CompleteResult>(`/production/work-orders/${uid}/qc`, body),

  /** Consume the order's components from stock, through the inventory engine. */
  issueMaterial: (orderUid: string, body: { warehouse: string; workOrderUid?: string; remarks?: string }) =>
    api.post<{
      orderDocNo: string
      documentType: string
      components: { itemCode: string; quantity: number; rate: number; value: number; balanceAfter: number }[]
      totalValue: number
      /** Reservation the issue gave back, now that the stock has physically left. */
      reservationReleased: number
    }>(`/production/orders/${orderUid}/issue-material`, body),

  completeOrder: (orderUid: string) =>
    api.post<{
      docNo: string
      status: string
      orderedQty: number
      producedQty: number
      scrapQty: number
      operations: number
    }>(`/production/orders/${orderUid}/complete`),
}
