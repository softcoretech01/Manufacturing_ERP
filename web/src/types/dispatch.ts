/**
 * Packing, Dispatch & Logistics — Volume 10.
 *
 * The chain is: finished goods released by quality → packing order → cartons →
 * pallets → dispatch plan → pick list → loading → shipment → proof of delivery.
 * Everything downstream carries the carton and pallet numbers created upstream,
 * which is what makes a complaint six months later traceable to an operator.
 */

export type PackingStatus =
  | 'PLANNED'
  | 'MATERIAL_READY'
  | 'PACKING_STARTED'
  | 'PACKED'
  | 'QC_VERIFIED'
  | 'READY_FOR_DISPATCH'
  | 'DISPATCHED'
  | 'CANCELLED'

export interface PackingOrder {
  uid: string
  deletedAt?: string | null
  docNo: string
  docDate: string
  status: PackingStatus
  /** Where the order came from — production completion or a sales commitment. */
  sourceType: 'PRODUCTION_ORDER' | 'SALES_ORDER' | 'DISPATCH_SCHEDULE'
  sourceNo: string
  customer: string
  customerCode: string
  salesOrderNo: string | null
  itemCode: string
  itemName: string
  batchNo: string | null
  quantity: number
  packedQuantity: number
  uom: string
  warehouse: string
  packingDate: string
  supervisor: string
  cartonSpec: string
  cartonsPlanned: number
  cartonsPacked: number
  /** Gates on the way to READY_FOR_DISPATCH. */
  materialReady: boolean
  qcReleased: boolean
  weightVerified: boolean
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  isExport: boolean
  isOem: boolean
  remarks?: string
}

/** One line of packaging material consumed by a packing order. */
export interface PackMaterialLine {
  uid: string
  deletedAt?: string | null
  packingOrderNo: string
  itemCode: string
  itemName: string
  category: 'CARTON' | 'INNER_BOX' | 'PROTECTIVE' | 'LABEL' | 'INSERT' | 'PALLET' | 'WRAP'
  standardQty: number
  issuedQty: number
  consumedQty: number
  uom: string
  unitCost: number
  warehouse: string
  issuedOn: string | null
  issuedBy: string | null
  status: 'PENDING' | 'ISSUED' | 'CONSUMED' | 'RETURNED'
}

export interface Carton {
  uid: string
  deletedAt?: string | null
  cartonNo: string
  barcode: string
  packingOrderNo: string
  customer: string
  itemCode: string
  itemName: string
  batchNo: string | null
  /** Mixed-SKU cartons list every SKU inside; a plain carton lists one. */
  contents: { itemCode: string; itemName: string; quantity: number }[]
  quantity: number
  uom: string
  grossWeightKg: number
  netWeightKg: number
  lengthMm: number
  widthMm: number
  heightMm: number
  packedOn: string
  operator: string
  palletNo: string | null
  labelPrinted: boolean
  weightChecked: boolean
  status: 'OPEN' | 'SEALED' | 'PALLETISED' | 'LOADED' | 'DELIVERED'
}

export interface Pallet {
  uid: string
  deletedAt?: string | null
  palletNo: string
  barcode: string
  palletType: 'STANDARD' | 'EXPORT' | 'RETURNABLE' | 'MIXED'
  customer: string
  destination: string
  cartonCount: number
  cartonCapacity: number
  totalWeightKg: number
  lengthMm: number
  widthMm: number
  stackHeightMm: number
  builtOn: string
  builtBy: string
  wrapped: boolean
  strapped: boolean
  labelPrinted: boolean
  shipmentNo: string | null
  containerNo: string | null
  status: 'BUILDING' | 'CLOSED' | 'STAGED' | 'LOADED' | 'SHIPPED'
}

export type LabelKind = 'PRODUCT' | 'CARTON' | 'PALLET' | 'SHIPMENT'

export interface LabelFormat {
  uid: string
  deletedAt?: string | null
  code: string
  name: string
  kind: LabelKind
  standard: 'GS1' | 'CUSTOMER' | 'INTERNAL'
  customer: string | null
  widthMm: number
  heightMm: number
  /** Fields the layout prints, in order. */
  fields: string[]
  hasBarcode: boolean
  hasQrCode: boolean
  hasCustomerLogo: boolean
  languages: string[]
  printedCount: number
  lastPrintedOn: string | null
  isActive: boolean
}

export type DispatchPlanStatus = 'DRAFT' | 'PLANNED' | 'PICKING' | 'LOADING' | 'DISPATCHED' | 'CANCELLED'

export interface DispatchPlan {
  uid: string
  deletedAt?: string | null
  docNo: string
  planDate: string
  status: DispatchPlanStatus
  basis: 'DAILY' | 'WEEKLY' | 'ROUTE' | 'CUSTOMER' | 'EXPORT'
  route: string
  region: string
  customer: string
  customerCode: string
  salesOrderNo: string | null
  deliveryDate: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  cartons: number
  pallets: number
  weightKg: number
  volumeCbm: number
  vehicleNo: string | null
  transporter: string
  vehicleCapacityKg: number
  isExport: boolean
  remarks?: string
}

export type PickMethod = 'FIFO' | 'FEFO' | 'BATCH' | 'ZONE' | 'WAVE'

export interface PickList {
  uid: string
  deletedAt?: string | null
  docNo: string
  dispatchPlanNo: string
  createdOn: string
  method: PickMethod
  warehouse: string
  zone: string
  customer: string
  itemCode: string
  itemName: string
  batchNo: string | null
  bin: string
  requiredQty: number
  pickedQty: number
  uom: string
  picker: string | null
  status: 'OPEN' | 'ASSIGNED' | 'PICKING' | 'PICKED' | 'SHORT' | 'CANCELLED'
  shortReason: string | null
}

export type VehicleType = 'COMPANY' | 'THIRD_PARTY' | 'COURIER' | 'CONTAINER' | 'AIR_CARGO'

export interface Vehicle {
  uid: string
  deletedAt?: string | null
  vehicleNo: string
  vehicleType: VehicleType
  transporter: string
  driver: string
  driverPhone: string
  capacityKg: number
  capacityCbm: number
  route: string
  hasGps: boolean
  insuranceExpiry: string
  fitnessExpiry: string
  permitExpiry: string
  lastServiceOn: string
  state: 'AVAILABLE' | 'LOADING' | 'IN_TRANSIT' | 'RETURNING' | 'MAINTENANCE'
  currentShipmentNo: string | null
  isActive: boolean
}

export interface LoadingSheet {
  uid: string
  deletedAt?: string | null
  docNo: string
  dispatchPlanNo: string
  vehicleNo: string
  transporter: string
  driver: string
  customer: string
  destination: string
  stagingBay: string
  cartonsPlanned: number
  cartonsLoaded: number
  palletsLoaded: number
  plannedWeightKg: number
  actualWeightKg: number
  startedAt: string | null
  completedAt: string | null
  loader: string
  supervisor: string
  sealNo: string | null
  sealVerified: boolean
  photosAttached: number
  status: 'STAGED' | 'VERIFYING' | 'LOADING' | 'SEALED' | 'DISPATCHED' | 'CANCELLED'
  remarks?: string
}

export type ShipmentType = 'DOMESTIC' | 'EXPORT' | 'SAMPLE' | 'REPLACEMENT' | 'DISTRIBUTOR' | 'ECOMMERCE'
export type ShipmentStatus = 'PLANNED' | 'LOADED' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'CLOSED' | 'CANCELLED'

export interface Shipment {
  uid: string
  deletedAt?: string | null
  docNo: string
  shipmentType: ShipmentType
  status: ShipmentStatus
  dispatchPlanNo: string
  challanNo: string
  invoiceNo: string | null
  ewayBillNo: string | null
  customer: string
  customerCode: string
  destination: string
  region: string
  route: string
  vehicleNo: string
  transporter: string
  driver: string
  driverPhone: string
  cartons: number
  pallets: number
  weightKg: number
  invoiceValue: number
  dispatchedAt: string | null
  etaAt: string | null
  deliveredAt: string | null
  /** Current tracking snapshot. */
  lastLocation: string | null
  lastUpdatedAt: string | null
  delayReason: string | null
  podStatus: 'NOT_DUE' | 'PENDING' | 'RECEIVED' | 'SHORT' | 'DAMAGED' | 'DISPUTED'
  isExport: boolean
  remarks?: string
}

export interface ExportShipment {
  uid: string
  deletedAt?: string | null
  docNo: string
  shipmentNo: string
  customer: string
  country: string
  incoterm: 'FOB' | 'CIF' | 'CFR' | 'EXW' | 'DAP' | 'DDP'
  containerNo: string
  containerSize: '20FT' | '40FT' | '40HC'
  sealNo: string
  stuffingDate: string
  vessel: string
  voyageNo: string
  portOfLoading: string
  portOfDischarge: string
  etd: string
  eta: string
  hsCode: string
  fobValueUsd: number
  exchangeRate: number
  shippingBillNo: string | null
  blNo: string | null
  customsStatus: 'NOT_FILED' | 'FILED' | 'ASSESSED' | 'CLEARED' | 'HELD'
  status: 'PLANNED' | 'STUFFED' | 'GATED_IN' | 'SAILED' | 'ARRIVED' | 'DELIVERED'
  remarks?: string
}

export interface ExportDocument {
  uid: string
  deletedAt?: string | null
  exportShipmentNo: string
  docType:
    | 'COMMERCIAL_INVOICE'
    | 'PACKING_LIST'
    | 'CERTIFICATE_OF_ORIGIN'
    | 'BILL_OF_LADING'
    | 'SHIPPING_BILL'
    | 'INSPECTION_CERTIFICATE'
    | 'INSURANCE_POLICY'
  docNo: string | null
  issuedOn: string | null
  issuedBy: string | null
  /** Some documents cannot be raised before another exists. */
  dependsOn: string | null
  isMandatory: boolean
  status: 'MISSING' | 'DRAFT' | 'ISSUED' | 'SUBMITTED' | 'ACCEPTED'
  fileName: string | null
  remarks?: string
}

export interface Pod {
  uid: string
  deletedAt?: string | null
  docNo: string
  shipmentNo: string
  challanNo: string
  customer: string
  destination: string
  deliveredOn: string | null
  deliveredAtTime: string | null
  receiverName: string | null
  receiverDesignation: string | null
  signatureCaptured: boolean
  photoCaptured: boolean
  gpsLatitude: number | null
  gpsLongitude: number | null
  dispatchedQty: number
  receivedQty: number
  shortQty: number
  damagedQty: number
  capturedBy: string | null
  capturedVia: 'MOBILE' | 'WEB' | 'COURIER_API' | null
  status: 'PENDING' | 'RECEIVED' | 'SHORT' | 'DAMAGED' | 'DISPUTED'
  remarks?: string
}

export type ReturnType = 'CUSTOMER_RETURN' | 'TRANSIT_DAMAGE' | 'WRONG_SHIPMENT' | 'REPLACEMENT' | 'WARRANTY'
export type ReturnDisposition = 'PENDING' | 'RESTOCK' | 'REWORK' | 'SCRAP'

export interface SalesReturn {
  uid: string
  deletedAt?: string | null
  docNo: string
  requestedOn: string
  returnType: ReturnType
  customer: string
  customerCode: string
  shipmentNo: string | null
  invoiceNo: string | null
  itemCode: string
  itemName: string
  batchNo: string | null
  quantity: number
  receivedQty: number
  uom: string
  reason: string
  approvedBy: string | null
  pickupOn: string | null
  receivedOn: string | null
  inspectedBy: string | null
  disposition: ReturnDisposition
  creditNoteNo: string | null
  value: number
  status: 'REQUESTED' | 'APPROVED' | 'PICKUP_SCHEDULED' | 'RECEIVED' | 'INSPECTED' | 'CLOSED' | 'REJECTED'
  remarks?: string
}

export interface FreightCharge {
  uid: string
  deletedAt?: string | null
  docNo: string
  shipmentNo: string
  customer: string
  transporter: string
  route: string
  chargeType:
    | 'FREIGHT'
    | 'LOADING'
    | 'INSURANCE'
    | 'TOLL'
    | 'FUEL_SURCHARGE'
    | 'HANDLING'
    | 'DEMURRAGE'
    | 'EXPORT_CHARGES'
  basis: 'PER_TRIP' | 'PER_KG' | 'PER_CARTON' | 'PER_KM' | 'ACTUAL'
  quantity: number
  rate: number
  amount: number
  /** Which dimension the cost is charged to. */
  allocateTo: 'SHIPMENT' | 'CUSTOMER' | 'PRODUCT' | 'SALES_ORDER'
  billNo: string | null
  billDate: string | null
  approvedBy: string | null
  status: 'ESTIMATED' | 'ACTUAL' | 'APPROVED' | 'PAID' | 'DISPUTED'
  remarks?: string
}

/* ─────────────────────────── Chart series ─────────────────────────── */

export interface DispatchTrendPoint {
  day: string
  planned: number
  dispatched: number
  delivered: number
}

export interface RegionDispatch {
  region: string
  cartons: number
  weightKg: number
  value: number
  onTimePct: number
}

export interface TransporterScore {
  transporter: string
  trips: number
  onTimePct: number
  damagePct: number
  avgTransitDays: number
  freightPerKg: number
}
