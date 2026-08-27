import { api } from './client'
import type * as Masters from '@/types/masters'

// Bank
export const getBanks = () => api.get<any>('/banks').then(res => Array.isArray(res) ? res : res.data || [])
export const createBank = (data: any) => api.post<any>('/banks', data)
export const updateBank = (id: number | string, data: any) => api.put<any>(`/banks/${id}`, data)
export const deleteBank = (id: number | string) => api.del(`/banks/${id}`)

// BottleCapacity
export const getBottleCapacities = () => api.get<any>('/bottle-capacities').then(res => Array.isArray(res) ? res : res.data || [])
export const createBottleCapacity = (data: any) => api.post<any>('/bottle-capacities', data)
export const updateBottleCapacity = (id: number | string, data: any) => api.put<any>(`/bottle-capacities/${id}`, data)
export const deleteBottleCapacity = (id: number | string) => api.del(`/bottle-capacities/${id}`)
export const getNextBottleCapacityCode = () => api.get<{code: string}>(`/bottle-capacities/next-code`)

// BottleColour
export const getBottleColours = () => api.get<any>('/bottle-colours').then(res => Array.isArray(res) ? res : res.data || [])
export const createBottleColour = (data: any) => api.post<any>('/bottle-colours', data)
export const updateBottleColour = (id: number | string, data: any) => api.put<any>(`/bottle-colours/${id}`, data)
export const deleteBottleColour = (id: number | string) => api.del(`/bottle-colours/${id}`)
export const getNextBottleColourCode = () => api.get<{code: string}>(`/bottle-colours/next-code`)

// BottleModel
export const getBottleModels = () => api.get<any>('/bottle-models').then(res => Array.isArray(res) ? res : res.data || [])
export const createBottleModel = (data: any) => api.post<any>('/bottle-models', data)
export const updateBottleModel = (id: number | string, data: any) => api.put<any>(`/bottle-models/${id}`, data)
export const deleteBottleModel = (id: number | string) => api.del(`/bottle-models/${id}`)
export const getNextBottleModelCode = () => api.get<{code: string}>(`/bottle-models/next-code`)

// City
export const getCities = () => api.get<any>('/cities').then(res => Array.isArray(res) ? res : res.data || [])
export const createCity = (data: any) => api.post<any>('/cities', data)
export const updateCity = (id: number | string, data: any) => api.put<any>(`/cities/${id}`, data)
export const deleteCity = (id: number | string) => api.del(`/cities/${id}`)
export const getNextCityCode = () => api.get<{code: string}>(`/cities/next-code`)

// Contact
export const getContacts = () => api.get<any>('/contacts').then(res => Array.isArray(res) ? res : res.data || [])
export const createContact = (data: any) => api.post<any>('/contacts', data)
export const updateContact = (id: number | string, data: any) => api.put<any>(`/contacts/${id}`, data)
export const deleteContact = (id: number | string) => api.del(`/contacts/${id}`)
export const getNextContactCode = () => api.get<{code: string}>(`/contacts/next-code`)

// Country
export const getCountries = () => api.get<any>('/countries').then(res => Array.isArray(res) ? res : res.data || [])
export const createCountry = (data: any) => api.post<any>('/countries', data)
export const updateCountry = (id: number | string, data: any) => api.put<any>(`/countries/${id}`, data)
export const deleteCountry = (id: number | string) => api.del(`/countries/${id}`)
export const getNextCountryCode = () => api.get<{code: string}>(`/countries/next-code`)

// Customer
export const getCustomers = () => api.get<any>('/customers').then(res => Array.isArray(res) ? res : res.data || [])
export const createCustomer = (data: any) => api.post<any>('/customers', data)
export const updateCustomer = (id: number | string, data: any) => api.put<any>(`/customers/${id}`, data)
export const deleteCustomer = (id: number | string) => api.del(`/customers/${id}`)

// Defect
export const getDefects = () => api.get<any>('/defects').then(res => Array.isArray(res) ? res : res.data || [])
export const createDefect = (data: any) => api.post<any>('/defects', data)
export const updateDefect = (id: number | string, data: any) => api.put<any>(`/defects/${id}`, data)
export const deleteDefect = (id: number | string) => api.del(`/defects/${id}`)
export const getNextDefectCode = () => api.get<{code: string}>(`/defects/next-code`)

// Employee
export const getEmployees = () => api.get<any>('/employees').then(res => Array.isArray(res) ? res : res.data || [])
export const createEmployee = (data: any) => api.post<any>('/employees', data)
export const updateEmployee = (id: number | string, data: any) => api.put<any>(`/employees/${id}`, data)
export const deleteEmployee = (id: number | string) => api.del(`/employees/${id}`)
export const getNextEmployeeCode = () => api.get<{code: string}>(`/employees/next-code`)

// HolidayCalendar
export const getHolidayCalendars = () => api.get<any>('/holiday-calendars').then(res => Array.isArray(res) ? res : res.data || [])
export const createHolidayCalendar = (data: any) => api.post<any>('/holiday-calendars', data)
export const updateHolidayCalendar = (id: number | string, data: any) => api.put<any>(`/holiday-calendars/${id}`, data)
export const deleteHolidayCalendar = (id: number | string) => api.del(`/holiday-calendars/${id}`)
export const getNextHolidayCalendarCode = () => api.get<{code: string}>(`/holiday-calendars/next-code`)

// Hsn
export const getHsns = () => api.get<any>('/hsns').then(res => Array.isArray(res) ? res : res.data || [])
export const createHsn = (data: any) => api.post<any>('/hsns', data)
export const updateHsn = (id: number | string, data: any) => api.put<any>(`/hsns/${id}`, data)
export const deleteHsn = (id: number | string) => api.del(`/hsns/${id}`)
export const getNextHsnCode = () => api.get<{code: string}>(`/hsns/next-code`)

// Item
export const getItems = () => api.get<any>('/items').then(res => Array.isArray(res) ? res : res.data || [])
export const createItem = (data: any) => api.post<any>('/items', data)
export const updateItem = (id: number | string, data: any) => api.put<any>(`/items/${id}`, data)
export const deleteItem = (id: number | string) => api.del(`/items/${id}`)
export const getNextItemCode = () => api.get<{code: string}>(`/items/next-code`)

// LidType
export const getLidTypes = () => api.get<any>('/lid-types').then(res => Array.isArray(res) ? res : res.data || [])
export const createLidType = (data: any) => api.post<any>('/lid-types', data)
export const updateLidType = (id: number | string, data: any) => api.put<any>(`/lid-types/${id}`, data)
export const deleteLidType = (id: number | string) => api.del(`/lid-types/${id}`)
export const getNextLidTypeCode = () => api.get<{code: string}>(`/lid-types/next-code`)

// Machine
export const getMachines = () => api.get<any>('/machines').then(res => Array.isArray(res) ? res : res.data || [])
export const createMachine = (data: any) => api.post<any>('/machines', data)
export const updateMachine = (id: number | string, data: any) => api.put<any>(`/machines/${id}`, data)
export const deleteMachine = (id: number | string) => api.del(`/machines/${id}`)
export const getNextMachineCode = () => api.get<{code: string}>(`/machines/next-code`)

// Machine-form reference lists (normalized masters keyed by integer FK)
export const getMachineGroups = () => api.get<any>('/machine-groups').then(res => Array.isArray(res) ? res : res.data || [])
export const getPlantsList = () => api.get<any>('/plants').then(res => Array.isArray(res) ? res : res.data || [])
export const getProductionLines = (plantUid?: string) =>
  api.get<any>('/production-lines', plantUid ? { plant_uid: plantUid } : undefined).then(res => Array.isArray(res) ? res : res.data || [])
export const getWorkCentres = (lineId?: number) =>
  api.get<any>('/work-centres', lineId ? { line_id: lineId } : undefined).then(res => Array.isArray(res) ? res : res.data || [])

// NextBottleCapacityCode

// NextBottleColourCode

// NextBottleModelCode

// NextCityCode

// NextContactCode

// NextCountryCode

// NextDefectCode

// NextEmployeeCode

// NextHolidayCalendarCode

// NextHsnCode

// NextItemCode

// NextLidTypeCode

// NextMachineCode

// NextPackagingCode

// NextPaymentTermCode

// NextQualityParameterCode

// NextReasonCodeCode

// NextShiftCode

// NextStateCode

// NextSteelGradeCode

// NextSteelThicknessCode

// NextTaxCode

// NextUOMCode

// Packaging
export const getPackagings = () => api.get<any>('/packaging').then(res => Array.isArray(res) ? res : res.data || [])
export const createPackaging = (data: any) => api.post<any>('/packaging', data)
export const updatePackaging = (id: number | string, data: any) => api.put<any>(`/packaging/${id}`, data)
export const deletePackaging = (id: number | string) => api.del(`/packaging/${id}`)
export const getNextPackagingCode = () => api.get<{code: string}>(`/packaging/next-code`)

// Currency (read-only list for dropdowns; managed under Finance)
export const getCurrencies = () => api.get<any>('/currencies').then(res => Array.isArray(res) ? res : res.data || [])

// PaymentTerm
export const getPaymentTerms = () => api.get<any>('/payment-terms').then(res => Array.isArray(res) ? res : res.data || [])
export const createPaymentTerm = (data: any) => api.post<any>('/payment-terms', data)
export const updatePaymentTerm = (id: number | string, data: any) => api.put<any>(`/payment-terms/${id}`, data)
export const deletePaymentTerm = (id: number | string) => api.del(`/payment-terms/${id}`)
export const getNextPaymentTermCode = () => api.get<{code: string}>(`/payment-terms/next-code`)

// QualityParameter
export const getQualityParameters = () => api.get<any>('/quality-parameters').then(res => Array.isArray(res) ? res : res.data || [])
export const createQualityParameter = (data: any) => api.post<any>('/quality-parameters', data)
export const updateQualityParameter = (id: number | string, data: any) => api.put<any>(`/quality-parameters/${id}`, data)
export const deleteQualityParameter = (id: number | string) => api.del(`/quality-parameters/${id}`)
export const getNextQualityParameterCode = () => api.get<{code: string}>(`/quality-parameters/next-code`)

// ReasonCode
export const getReasonCodes = () => api.get<any>('/reason-codes').then(res => Array.isArray(res) ? res : res.data || [])
export const createReasonCode = (data: any) => api.post<any>('/reason-codes', data)
export const updateReasonCode = (id: number | string, data: any) => api.put<any>(`/reason-codes/${id}`, data)
export const deleteReasonCode = (id: number | string) => api.del(`/reason-codes/${id}`)
export const getNextReasonCodeCode = () => api.get<{code: string}>(`/reason-codes/next-code`)

// Shift
export const getShifts = () => api.get<any>('/shifts').then(res => Array.isArray(res) ? res : res.data || [])
export const createShift = (data: any) => api.post<any>('/shifts', data)
export const updateShift = (id: number | string, data: any) => api.put<any>(`/shifts/${id}`, data)
export const deleteShift = (id: number | string) => api.del(`/shifts/${id}`)
export const getNextShiftCode = () => api.get<{code: string}>(`/shifts/next-code`)

// State
export const getStates = () => api.get<any>('/states').then(res => Array.isArray(res) ? res : res.data || [])
export const createState = (data: any) => api.post<any>('/states', data)
export const updateState = (id: number | string, data: any) => api.put<any>(`/states/${id}`, data)
export const deleteState = (id: number | string) => api.del(`/states/${id}`)
export const getNextStateCode = () => api.get<{code: string}>(`/states/next-code`)

// SteelGrade
export const getSteelGrades = () => api.get<any>('/steel-grades').then(res => Array.isArray(res) ? res : res.data || [])
export const createSteelGrade = (data: any) => api.post<any>('/steel-grades', data)
export const updateSteelGrade = (id: number | string, data: any) => api.put<any>(`/steel-grades/${id}`, data)
export const deleteSteelGrade = (id: number | string) => api.del(`/steel-grades/${id}`)
export const getNextSteelGradeCode = () => api.get<{code: string}>(`/steel-grades/next-code`)

// SteelThickness
export const getSteelThicknesses = () => api.get<any>('/steel-thicknesses').then(res => Array.isArray(res) ? res : res.data || [])
export const createSteelThickness = (data: any) => api.post<any>('/steel-thicknesses', data)
export const updateSteelThickness = (id: number | string, data: any) => api.put<any>(`/steel-thicknesses/${id}`, data)
export const deleteSteelThickness = (id: number | string) => api.del(`/steel-thicknesses/${id}`)
export const getNextSteelThicknessCode = () => api.get<{code: string}>(`/steel-thicknesses/next-code`)

// Supplier
export const getSuppliers = () => api.get<any>('/suppliers').then(res => Array.isArray(res) ? res : res.data || [])
export const createSupplier = (data: any) => api.post<any>('/suppliers', data)
export const updateSupplier = (id: number | string, data: any) => api.put<any>(`/suppliers/${id}`, data)
export const deleteSupplier = (id: number | string) => api.del(`/suppliers/${id}`)

// Tax
export const getTaxes = () => api.get<any>('/taxes').then(res => Array.isArray(res) ? res : res.data || [])
export const createTax = (data: any) => api.post<any>('/taxes', data)
export const updateTax = (id: number | string, data: any) => api.put<any>(`/taxes/${id}`, data)
export const deleteTax = (id: number | string) => api.del(`/taxes/${id}`)
export const getNextTaxCode = () => api.get<{code: string}>(`/taxes/next-code`)



// Transporter
export const getTransporters = () => api.get<any>('/transporters').then(res => Array.isArray(res) ? res : res.data || [])
export const createTransporter = (data: any) => api.post<any>('/transporters', data)
export const updateTransporter = (id: number | string, data: any) => api.put<any>(`/transporters/${id}`, data)
export const deleteTransporter = (id: number | string) => api.del(`/transporters/${id}`)

// UOM
export const getUOMs = () => api.get<any>('/uoms').then(res => Array.isArray(res) ? res : res.data || [])
export const createUOM = (data: any) => api.post<any>('/uoms', data)
export const updateUOM = (id: number | string, data: any) => api.put<any>(`/uoms/${id}`, data)
export const deleteUOM = (id: number | string) => api.del(`/uoms/${id}`)
export const getNextUOMCode = () => api.get<{code: string}>(`/uoms/next-code`)

// Duplicate review (Masters ▸ Governance) — live server-side detection
export const getDuplicateCandidates = () =>
  api.get<any>('/masters/duplicates').then((res) => (Array.isArray(res) ? res : res.data || []) as Masters.DuplicateCandidate[])
