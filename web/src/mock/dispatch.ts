/**
 * Packing, dispatch and logistics demonstration data — the same Chennai bottle
 * plant, the same week as the shop-floor data. The chain ties together: the
 * cartons belong to the packing orders, the pallets hold those cartons, the
 * dispatch plans move those pallets, and the shipments carry those plans
 * through to proof of delivery.
 */

import { daysAgo, daysAhead } from './data'
import type {
  Carton,
  DispatchPlan,
  DispatchTrendPoint,
  ExportDocument,
  ExportShipment,
  FreightCharge,
  LabelFormat,
  LoadingSheet,
  PackMaterialLine,
  PackingOrder,
  Pallet,
  PickList,
  Pod,
  RegionDispatch,
  SalesReturn,
  Shipment,
  TransporterScore,
  Vehicle,
} from '@/types/dispatch'

const d = (n: number) => daysAgo(n).slice(0, 10)
const fwd = (n: number) => daysAhead(n).slice(0, 10)
const at = (n: number, h: number) => daysAgo(n, h)
const atFwd = (n: number) => daysAhead(n)

/* ══════════════════════════ Packing orders ════════════════════════════════ */

export const packingOrders: PackingOrder[] = [
  {
    uid: 'pk-01', docNo: 'PKO/2607/0308', docDate: d(1), status: 'PACKING_STARTED',
    sourceType: 'PRODUCTION_ORDER', sourceNo: 'PRD/2607/0121',
    customer: 'Reliance Retail Ltd', customerCode: 'CUS-0012', salesOrderNo: 'SO/2627/0455',
    itemCode: 'FG-SS-750-BLK', itemName: 'Insulated Bottle 750 ml — Matte Black', batchNo: 'B2607-FG-0121',
    quantity: 4_800, packedQuantity: 3_120, uom: 'NOS', warehouse: 'FG Store — Chennai',
    packingDate: d(1), supervisor: 'R. Vasanth', cartonSpec: '12 bottles / carton',
    cartonsPlanned: 400, cartonsPacked: 260,
    materialReady: true, qcReleased: true, weightVerified: true,
    priority: 'HIGH', isExport: false, isOem: false,
    remarks: 'Retail SKU with shelf-ready inner boxes. Carton label carries the Reliance article code.',
  },
  {
    uid: 'pk-02', docNo: 'PKO/2607/0311', docDate: d(0), status: 'MATERIAL_READY',
    sourceType: 'SALES_ORDER', sourceNo: 'SO/2627/0461',
    customer: 'Hydra GmbH — Hamburg', customerCode: 'CUS-0047', salesOrderNo: 'SO/2627/0461',
    itemCode: 'FG-SS-1000-STL', itemName: 'Insulated Bottle 1000 ml — Brushed Steel', batchNo: 'B2607-FG-0119',
    quantity: 6_000, packedQuantity: 0, uom: 'NOS', warehouse: 'FG Store — Chennai',
    packingDate: d(0), supervisor: 'K. Latha', cartonSpec: '24 bottles / export carton',
    cartonsPlanned: 250, cartonsPacked: 0,
    materialReady: true, qcReleased: true, weightVerified: false,
    priority: 'URGENT', isExport: true, isOem: true,
    remarks: 'OEM branding — Hydra logo on carton and bottle sleeve. German and English label text required.',
  },
  {
    uid: 'pk-03', docNo: 'PKO/2607/0298', docDate: d(3), status: 'READY_FOR_DISPATCH',
    sourceType: 'PRODUCTION_ORDER', sourceNo: 'PRD/2607/0119',
    customer: 'Metro Cash & Carry', customerCode: 'CUS-0021', salesOrderNo: 'SO/2627/0448',
    itemCode: 'FG-SS-500-BLU', itemName: 'Insulated Bottle 500 ml — Ocean Blue', batchNo: 'B2607-FG-0119',
    quantity: 2_400, packedQuantity: 2_400, uom: 'NOS', warehouse: 'FG Store — Chennai',
    packingDate: d(3), supervisor: 'R. Vasanth', cartonSpec: '12 bottles / carton',
    cartonsPlanned: 200, cartonsPacked: 200,
    materialReady: true, qcReleased: true, weightVerified: true,
    priority: 'NORMAL', isExport: false, isOem: false,
  },
  {
    uid: 'pk-04', docNo: 'PKO/2607/0312', docDate: d(0), status: 'PLANNED',
    sourceType: 'DISPATCH_SCHEDULE', sourceNo: 'DSP/2607/0141',
    customer: 'Amazon Retail India', customerCode: 'CUS-0058', salesOrderNo: 'SO/2627/0463',
    itemCode: 'FG-SS-750-BLK', itemName: 'Insulated Bottle 750 ml — Matte Black', batchNo: null,
    quantity: 1_800, packedQuantity: 0, uom: 'NOS', warehouse: 'FG Store — Chennai',
    packingDate: fwd(1), supervisor: 'K. Latha', cartonSpec: 'FBA single-unit box',
    cartonsPlanned: 1_800, cartonsPacked: 0,
    materialReady: false, qcReleased: false, weightVerified: false,
    priority: 'NORMAL', isExport: false, isOem: false,
    remarks: 'FBA packaging — every bottle in its own printed box with an FNSKU label. No master carton label.',
  },
  {
    uid: 'pk-05', docNo: 'PKO/2607/0289', docDate: d(6), status: 'DISPATCHED',
    sourceType: 'SALES_ORDER', sourceNo: 'SO/2627/0440',
    customer: 'Own outlet — T. Nagar', customerCode: 'CUS-0003', salesOrderNo: 'SO/2627/0440',
    itemCode: 'FG-SS-500-BLU', itemName: 'Insulated Bottle 500 ml — Ocean Blue', batchNo: 'B2607-FG-0112',
    quantity: 600, packedQuantity: 600, uom: 'NOS', warehouse: 'FG Store — Chennai',
    packingDate: d(6), supervisor: 'R. Vasanth', cartonSpec: '12 bottles / carton',
    cartonsPlanned: 50, cartonsPacked: 50,
    materialReady: true, qcReleased: true, weightVerified: true,
    priority: 'LOW', isExport: false, isOem: false,
  },
  {
    uid: 'pk-06', docNo: 'PKO/2607/0305', docDate: d(2), status: 'PACKED',
    sourceType: 'PRODUCTION_ORDER', sourceNo: 'PRD/2607/0114',
    customer: 'Croma — Tata Digital', customerCode: 'CUS-0034', salesOrderNo: 'SO/2627/0452',
    itemCode: 'FG-SS-1000-STL', itemName: 'Insulated Bottle 1000 ml — Brushed Steel', batchNo: 'B2607-FG-0114',
    quantity: 1_200, packedQuantity: 1_200, uom: 'NOS', warehouse: 'FG Store — Chennai',
    packingDate: d(2), supervisor: 'K. Latha', cartonSpec: '12 bottles / carton',
    cartonsPlanned: 100, cartonsPacked: 100,
    materialReady: true, qcReleased: false, weightVerified: true,
    priority: 'NORMAL', isExport: false, isOem: false,
    remarks: 'Waiting on the final QC release certificate before it can move to dispatch staging.',
  },
]

/* ═════════════════════ Packaging material consumption ═════════════════════ */

export const packMaterials: PackMaterialLine[] = [
  { uid: 'pm-01', packingOrderNo: 'PKO/2607/0308', itemCode: 'PKG-CTN-12X750', itemName: 'Master carton — 12 × 750 ml', category: 'CARTON', standardQty: 400, issuedQty: 400, consumedQty: 260, uom: 'NOS', unitCost: 42.5, warehouse: 'Packing Store', issuedOn: at(1, 6), issuedBy: 'S. Bhaskar', status: 'ISSUED' },
  { uid: 'pm-02', packingOrderNo: 'PKO/2607/0308', itemCode: 'PKG-INR-750', itemName: 'Inner box — 750 ml retail', category: 'INNER_BOX', standardQty: 4_800, issuedQty: 4_800, consumedQty: 3_120, uom: 'NOS', unitCost: 11.2, warehouse: 'Packing Store', issuedOn: at(1, 6), issuedBy: 'S. Bhaskar', status: 'ISSUED' },
  { uid: 'pm-03', packingOrderNo: 'PKO/2607/0308', itemCode: 'PKG-FOAM-750', itemName: 'Foam insert — 750 ml', category: 'PROTECTIVE', standardQty: 4_800, issuedQty: 4_800, consumedQty: 3_120, uom: 'NOS', unitCost: 3.8, warehouse: 'Packing Store', issuedOn: at(1, 6), issuedBy: 'S. Bhaskar', status: 'ISSUED' },
  { uid: 'pm-04', packingOrderNo: 'PKO/2607/0308', itemCode: 'PKG-MAN-EN', itemName: 'User manual & warranty card — English', category: 'INSERT', standardQty: 4_800, issuedQty: 4_800, consumedQty: 3_120, uom: 'NOS', unitCost: 2.1, warehouse: 'Packing Store', issuedOn: at(1, 6), issuedBy: 'S. Bhaskar', status: 'ISSUED' },
  { uid: 'pm-05', packingOrderNo: 'PKO/2607/0308', itemCode: 'PKG-LBL-CTN', itemName: 'Carton label — thermal 100 × 150', category: 'LABEL', standardQty: 400, issuedQty: 450, consumedQty: 268, uom: 'NOS', unitCost: 1.4, warehouse: 'Packing Store', issuedOn: at(1, 6), issuedBy: 'S. Bhaskar', status: 'ISSUED' },
  { uid: 'pm-06', packingOrderNo: 'PKO/2607/0308', itemCode: 'PKG-SIL-2G', itemName: 'Silica gel sachet — 2 g', category: 'PROTECTIVE', standardQty: 4_800, issuedQty: 4_800, consumedQty: 3_120, uom: 'NOS', unitCost: 0.6, warehouse: 'Packing Store', issuedOn: at(1, 6), issuedBy: 'S. Bhaskar', status: 'ISSUED' },
  { uid: 'pm-07', packingOrderNo: 'PKO/2607/0308', itemCode: 'PKG-PLT-STD', itemName: 'Wooden pallet — 1200 × 1000', category: 'PALLET', standardQty: 10, issuedQty: 10, consumedQty: 7, uom: 'NOS', unitCost: 385, warehouse: 'Packing Store', issuedOn: at(1, 7), issuedBy: 'S. Bhaskar', status: 'ISSUED' },
  { uid: 'pm-08', packingOrderNo: 'PKO/2607/0308', itemCode: 'PKG-FLM-STR', itemName: 'Stretch film — 500 mm', category: 'WRAP', standardQty: 12, issuedQty: 12, consumedQty: 8, uom: 'KG', unitCost: 148, warehouse: 'Packing Store', issuedOn: at(1, 7), issuedBy: 'S. Bhaskar', status: 'ISSUED' },

  { uid: 'pm-09', packingOrderNo: 'PKO/2607/0311', itemCode: 'PKG-CTN-24X1000-EX', itemName: 'Export carton — 24 × 1000 ml, 5-ply', category: 'CARTON', standardQty: 250, issuedQty: 250, consumedQty: 0, uom: 'NOS', unitCost: 96, warehouse: 'Packing Store', issuedOn: at(0, 7), issuedBy: 'S. Bhaskar', status: 'ISSUED' },
  { uid: 'pm-10', packingOrderNo: 'PKO/2607/0311', itemCode: 'PKG-LBL-OEM-HYD', itemName: 'OEM carton label — Hydra GmbH, DE/EN', category: 'LABEL', standardQty: 250, issuedQty: 260, consumedQty: 0, uom: 'NOS', unitCost: 4.2, warehouse: 'Packing Store', issuedOn: at(0, 7), issuedBy: 'S. Bhaskar', status: 'ISSUED' },
  { uid: 'pm-11', packingOrderNo: 'PKO/2607/0311', itemCode: 'PKG-PLT-EXP', itemName: 'Heat-treated export pallet (ISPM-15)', category: 'PALLET', standardQty: 12, issuedQty: 12, consumedQty: 0, uom: 'NOS', unitCost: 720, warehouse: 'Packing Store', issuedOn: null, issuedBy: null, status: 'PENDING' },
  { uid: 'pm-12', packingOrderNo: 'PKO/2607/0311', itemCode: 'PKG-STRP-PP', itemName: 'PP strap — 12 mm', category: 'WRAP', standardQty: 24, issuedQty: 0, consumedQty: 0, uom: 'KG', unitCost: 132, warehouse: 'Packing Store', issuedOn: null, issuedBy: null, status: 'PENDING' },

  { uid: 'pm-13', packingOrderNo: 'PKO/2607/0298', itemCode: 'PKG-CTN-12X500', itemName: 'Master carton — 12 × 500 ml', category: 'CARTON', standardQty: 200, issuedQty: 200, consumedQty: 200, uom: 'NOS', unitCost: 34, warehouse: 'Packing Store', issuedOn: at(3, 6), issuedBy: 'S. Bhaskar', status: 'CONSUMED' },
  { uid: 'pm-14', packingOrderNo: 'PKO/2607/0298', itemCode: 'PKG-BUB-1M', itemName: 'Bubble wrap — 1 m roll', category: 'PROTECTIVE', standardQty: 18, issuedQty: 20, consumedQty: 18, uom: 'KG', unitCost: 96, warehouse: 'Packing Store', issuedOn: at(3, 6), issuedBy: 'S. Bhaskar', status: 'CONSUMED' },
  { uid: 'pm-15', packingOrderNo: 'PKO/2607/0298', itemCode: 'PKG-LBL-CTN', itemName: 'Carton label — thermal 100 × 150', category: 'LABEL', standardQty: 200, issuedQty: 200, consumedQty: 204, uom: 'NOS', unitCost: 1.4, warehouse: 'Packing Store', issuedOn: at(3, 6), issuedBy: 'S. Bhaskar', status: 'CONSUMED' },
]

/* ═════════════════════════════ Cartons ═══════════════════════════════════ */

/** Cartons are generated so the count matches each packing order's packed cartons. */
function makeCartons(): Carton[] {
  const out: Carton[] = []
  const defs: [string, string, string, string, string | null, number, number, number, number, number, number, string, number, number, Carton['status']][] = [
    // order, customer, itemCode, itemName, batch, qtyPerCarton, gross, net, L, W, H, operator, count, palletEvery, status
    ['PKO/2607/0308', 'Reliance Retail Ltd', 'FG-SS-750-BLK', 'Insulated Bottle 750 ml — Matte Black', 'B2607-FG-0121', 12, 9.84, 8.9, 420, 320, 285, 'M. Priya', 8, 40, 'PALLETISED'],
    ['PKO/2607/0298', 'Metro Cash & Carry', 'FG-SS-500-BLU', 'Insulated Bottle 500 ml — Ocean Blue', 'B2607-FG-0119', 12, 7.2, 6.4, 380, 290, 245, 'V. Suresh', 5, 40, 'LOADED'],
    ['PKO/2607/0305', 'Croma — Tata Digital', 'FG-SS-1000-STL', 'Insulated Bottle 1000 ml — Brushed Steel', 'B2607-FG-0114', 12, 12.6, 11.5, 450, 350, 320, 'M. Priya', 4, 36, 'SEALED'],
    ['PKO/2607/0289', 'Own outlet — T. Nagar', 'FG-SS-500-BLU', 'Insulated Bottle 500 ml — Ocean Blue', 'B2607-FG-0112', 12, 7.2, 6.4, 380, 290, 245, 'V. Suresh', 3, 40, 'DELIVERED'],
  ]

  let seq = 4_118
  for (const [order, customer, itemCode, itemName, batch, qty, gross, net, L, W, H, operator, count, palletEvery, status] of defs) {
    for (let i = 0; i < count; i++) {
      seq++
      const cartonNo = `CTN/2607/${String(seq).padStart(5, '0')}`
      out.push({
        uid: `ct-${seq}`,
        cartonNo,
        barcode: `(01)8901234${String(seq).padStart(6, '0')}(37)${qty}`,
        packingOrderNo: order,
        customer,
        itemCode,
        itemName,
        batchNo: batch,
        contents: [{ itemCode, itemName, quantity: qty }],
        quantity: qty,
        uom: 'NOS',
        grossWeightKg: gross,
        netWeightKg: net,
        lengthMm: L,
        widthMm: W,
        heightMm: H,
        packedOn: at(order === 'PKO/2607/0308' ? 1 : order === 'PKO/2607/0298' ? 3 : order === 'PKO/2607/0305' ? 2 : 6, 9 + (i % 6)),
        operator,
        palletNo: status === 'SEALED' ? null : `PLT/2607/${String(210 + Math.floor(i / (palletEvery / 8))).padStart(4, '0')}`,
        labelPrinted: status !== 'OPEN',
        weightChecked: status !== 'OPEN',
        status,
      })
    }
  }

  // One deliberately mixed-SKU carton — a retail assortment box.
  out.push({
    uid: 'ct-mixed-1',
    cartonNo: 'CTN/2607/04199',
    barcode: '(01)8901234041990(37)12',
    packingOrderNo: 'PKO/2607/0308',
    customer: 'Reliance Retail Ltd',
    itemCode: 'MIXED',
    itemName: 'Assortment carton — 750 ml / 500 ml',
    batchNo: 'B2607-FG-0121',
    contents: [
      { itemCode: 'FG-SS-750-BLK', itemName: 'Insulated Bottle 750 ml — Matte Black', quantity: 6 },
      { itemCode: 'FG-SS-500-BLU', itemName: 'Insulated Bottle 500 ml — Ocean Blue', quantity: 6 },
    ],
    quantity: 12,
    uom: 'NOS',
    grossWeightKg: 8.6,
    netWeightKg: 7.7,
    lengthMm: 420,
    widthMm: 320,
    heightMm: 285,
    packedOn: at(1, 11),
    operator: 'M. Priya',
    palletNo: 'PLT/2607/0210',
    labelPrinted: true,
    weightChecked: true,
    status: 'PALLETISED',
  })

  // One open carton being packed right now.
  out.push({
    uid: 'ct-open-1',
    cartonNo: 'CTN/2607/04200',
    barcode: '(01)8901234042000(37)12',
    packingOrderNo: 'PKO/2607/0308',
    customer: 'Reliance Retail Ltd',
    itemCode: 'FG-SS-750-BLK',
    itemName: 'Insulated Bottle 750 ml — Matte Black',
    batchNo: 'B2607-FG-0121',
    contents: [{ itemCode: 'FG-SS-750-BLK', itemName: 'Insulated Bottle 750 ml — Matte Black', quantity: 7 }],
    quantity: 7,
    uom: 'NOS',
    grossWeightKg: 6.1,
    netWeightKg: 5.2,
    lengthMm: 420,
    widthMm: 320,
    heightMm: 285,
    packedOn: at(0, 10),
    operator: 'M. Priya',
    palletNo: null,
    labelPrinted: false,
    weightChecked: false,
    status: 'OPEN',
  })

  return out
}

export const cartons: Carton[] = makeCartons()

/* ═════════════════════════════ Pallets ═══════════════════════════════════ */

export const pallets: Pallet[] = [
  { uid: 'pl-01', palletNo: 'PLT/2607/0210', barcode: '(00)389012340000002101', palletType: 'STANDARD', customer: 'Reliance Retail Ltd', destination: 'Chennai DC — Sriperumbudur', cartonCount: 40, cartonCapacity: 40, totalWeightKg: 778, lengthMm: 1_200, widthMm: 1_000, stackHeightMm: 1_650, builtOn: at(1, 12), builtBy: 'A. Ramesh', wrapped: true, strapped: true, labelPrinted: true, shipmentNo: 'SHP/2607/0512', containerNo: null, status: 'STAGED' },
  { uid: 'pl-02', palletNo: 'PLT/2607/0211', barcode: '(00)389012340000002118', palletType: 'STANDARD', customer: 'Reliance Retail Ltd', destination: 'Chennai DC — Sriperumbudur', cartonCount: 32, cartonCapacity: 40, totalWeightKg: 622, lengthMm: 1_200, widthMm: 1_000, stackHeightMm: 1_400, builtOn: at(1, 14), builtBy: 'A. Ramesh', wrapped: false, strapped: false, labelPrinted: false, shipmentNo: null, containerNo: null, status: 'BUILDING' },
  { uid: 'pl-03', palletNo: 'PLT/2607/0206', barcode: '(00)389012340000002064', palletType: 'STANDARD', customer: 'Metro Cash & Carry', destination: 'Bengaluru — Whitefield', cartonCount: 40, cartonCapacity: 40, totalWeightKg: 574, lengthMm: 1_200, widthMm: 1_000, stackHeightMm: 1_480, builtOn: at(3, 13), builtBy: 'S. Karthik', wrapped: true, strapped: true, labelPrinted: true, shipmentNo: 'SHP/2607/0498', containerNo: null, status: 'LOADED' },
  { uid: 'pl-04', palletNo: 'PLT/2607/0214', barcode: '(00)389012340000002149', palletType: 'EXPORT', customer: 'Hydra GmbH — Hamburg', destination: 'Hamburg, Germany', cartonCount: 0, cartonCapacity: 21, totalWeightKg: 28, lengthMm: 1_200, widthMm: 800, stackHeightMm: 145, builtOn: at(0, 8), builtBy: 'S. Karthik', wrapped: false, strapped: false, labelPrinted: false, shipmentNo: null, containerNo: 'MSCU 782 4419', status: 'BUILDING' },
  { uid: 'pl-05', palletNo: 'PLT/2607/0208', barcode: '(00)389012340000002088', palletType: 'MIXED', customer: 'Croma — Tata Digital', destination: 'Mumbai — Bhiwandi', cartonCount: 36, cartonCapacity: 36, totalWeightKg: 466, lengthMm: 1_200, widthMm: 1_000, stackHeightMm: 1_620, builtOn: at(2, 15), builtBy: 'A. Ramesh', wrapped: true, strapped: true, labelPrinted: true, shipmentNo: null, containerNo: null, status: 'CLOSED' },
  { uid: 'pl-06', palletNo: 'PLT/2607/0198', barcode: '(00)389012340000001982', palletType: 'RETURNABLE', customer: 'Own outlet — T. Nagar', destination: 'Chennai — T. Nagar', cartonCount: 24, cartonCapacity: 40, totalWeightKg: 198, lengthMm: 1_200, widthMm: 1_000, stackHeightMm: 920, builtOn: at(6, 11), builtBy: 'S. Karthik', wrapped: true, strapped: true, labelPrinted: true, shipmentNo: 'SHP/2607/0471', containerNo: null, status: 'SHIPPED' },
]

/* ══════════════════════════ Label formats ════════════════════════════════ */

export const labelFormats: LabelFormat[] = [
  { uid: 'lf-01', code: 'LBL-CTN-GS1', name: 'Master carton label — GS1-128', kind: 'CARTON', standard: 'GS1', customer: null, widthMm: 100, heightMm: 150, fields: ['Product name', 'SKU', 'Quantity', 'Batch', 'Carton number', 'Gross weight', 'Manufacturing date', 'Country of origin'], hasBarcode: true, hasQrCode: true, hasCustomerLogo: false, languages: ['English'], printedCount: 12_480, lastPrintedOn: at(0, 10), isActive: true },
  { uid: 'lf-02', code: 'LBL-PLT-SSCC', name: 'Pallet label — SSCC', kind: 'PALLET', standard: 'GS1', customer: null, widthMm: 148, heightMm: 210, fields: ['SSCC', 'Customer', 'Destination', 'Carton count', 'Total weight', 'Pallet number', 'Build date'], hasBarcode: true, hasQrCode: false, hasCustomerLogo: false, languages: ['English'], printedCount: 842, lastPrintedOn: at(1, 12), isActive: true },
  { uid: 'lf-03', code: 'LBL-OEM-HYDRA', name: 'OEM export carton — Hydra GmbH', kind: 'CARTON', standard: 'CUSTOMER', customer: 'Hydra GmbH — Hamburg', widthMm: 105, heightMm: 148, fields: ['Hydra article code', 'Product name (DE)', 'Product name (EN)', 'Quantity', 'Batch', 'Country of origin', 'EAN', 'Recycling marks'], hasBarcode: true, hasQrCode: true, hasCustomerLogo: true, languages: ['German', 'English'], printedCount: 3_260, lastPrintedOn: at(9, 14), isActive: true },
  { uid: 'lf-04', code: 'LBL-FBA-FNSKU', name: 'Amazon FBA unit label — FNSKU', kind: 'PRODUCT', standard: 'CUSTOMER', customer: 'Amazon Retail India', widthMm: 62, heightMm: 29, fields: ['FNSKU', 'Product title', 'Condition'], hasBarcode: true, hasQrCode: false, hasCustomerLogo: false, languages: ['English'], printedCount: 24_600, lastPrintedOn: at(4, 11), isActive: true },
  { uid: 'lf-05', code: 'LBL-PRD-RETAIL', name: 'Retail bottle sleeve label', kind: 'PRODUCT', standard: 'INTERNAL', customer: null, widthMm: 210, heightMm: 90, fields: ['Product name', 'Capacity', 'Material', 'MRP', 'Manufacturing date', 'Batch', 'Customer care', 'Country of origin'], hasBarcode: true, hasQrCode: true, hasCustomerLogo: false, languages: ['English', 'Hindi', 'Tamil'], printedCount: 96_400, lastPrintedOn: at(0, 9), isActive: true },
  { uid: 'lf-06', code: 'LBL-SHP-DOM', name: 'Shipment address label', kind: 'SHIPMENT', standard: 'INTERNAL', customer: null, widthMm: 100, heightMm: 100, fields: ['Shipment number', 'Customer', 'Address', 'Cartons', 'Weight', 'Transporter', 'Vehicle'], hasBarcode: true, hasQrCode: false, hasCustomerLogo: false, languages: ['English'], printedCount: 1_204, lastPrintedOn: at(1, 16), isActive: true },
  { uid: 'lf-07', code: 'LBL-CTN-OLD', name: 'Master carton label — pre-GS1 layout', kind: 'CARTON', standard: 'INTERNAL', customer: null, widthMm: 100, heightMm: 150, fields: ['Product name', 'SKU', 'Quantity', 'Carton number'], hasBarcode: true, hasQrCode: false, hasCustomerLogo: false, languages: ['English'], printedCount: 48_200, lastPrintedOn: at(120, 10), isActive: false },
]

/* ═════════════════════════ Dispatch planning ═════════════════════════════ */

export const dispatchPlans: DispatchPlan[] = [
  { uid: 'dp-01', docNo: 'DSP/2607/0138', planDate: d(0), status: 'LOADING', basis: 'ROUTE', route: 'Chennai — Sriperumbudur', region: 'South', customer: 'Reliance Retail Ltd', customerCode: 'CUS-0012', salesOrderNo: 'SO/2627/0455', deliveryDate: fwd(1), priority: 'HIGH', cartons: 260, pallets: 7, weightKg: 2_558, volumeCbm: 12.4, vehicleNo: 'TN-22-BG-4471', transporter: 'Sree Logistics', vehicleCapacityKg: 9_000, isExport: false },
  { uid: 'dp-02', docNo: 'DSP/2607/0141', planDate: d(0), status: 'PLANNED', basis: 'CUSTOMER', route: 'Chennai — Bengaluru', region: 'South', customer: 'Amazon Retail India', customerCode: 'CUS-0058', salesOrderNo: 'SO/2627/0463', deliveryDate: fwd(3), priority: 'NORMAL', cartons: 1_800, pallets: 12, weightKg: 1_980, volumeCbm: 18.6, vehicleNo: null, transporter: 'Delhivery', vehicleCapacityKg: 7_500, isExport: false },
  { uid: 'dp-03', docNo: 'DSP/2607/0135', planDate: d(3), status: 'DISPATCHED', basis: 'DAILY', route: 'Chennai — Bengaluru', region: 'South', customer: 'Metro Cash & Carry', customerCode: 'CUS-0021', salesOrderNo: 'SO/2627/0448', deliveryDate: d(1), priority: 'NORMAL', cartons: 200, pallets: 5, weightKg: 1_440, volumeCbm: 7.2, vehicleNo: 'KA-05-MJ-8802', transporter: 'VRL Logistics', vehicleCapacityKg: 12_000, isExport: false },
  { uid: 'dp-04', docNo: 'DSP/2607/0142', planDate: d(0), status: 'DRAFT', basis: 'EXPORT', route: 'Chennai Port — Hamburg', region: 'Export', customer: 'Hydra GmbH — Hamburg', customerCode: 'CUS-0047', salesOrderNo: 'SO/2627/0461', deliveryDate: fwd(32), priority: 'URGENT', cartons: 250, pallets: 12, weightKg: 8_450, volumeCbm: 28.4, vehicleNo: null, transporter: 'Maersk / CONCOR', vehicleCapacityKg: 26_000, isExport: true },
  { uid: 'dp-05', docNo: 'DSP/2607/0139', planDate: d(0), status: 'PICKING', basis: 'CUSTOMER', route: 'Chennai — Mumbai', region: 'West', customer: 'Croma — Tata Digital', customerCode: 'CUS-0034', salesOrderNo: 'SO/2627/0452', deliveryDate: fwd(4), priority: 'NORMAL', cartons: 100, pallets: 3, weightKg: 1_260, volumeCbm: 6.1, vehicleNo: 'MH-04-KP-2219', transporter: 'TCI Freight', vehicleCapacityKg: 9_000, isExport: false },
  { uid: 'dp-06', docNo: 'DSP/2607/0129', planDate: d(6), status: 'DISPATCHED', basis: 'DAILY', route: 'Chennai city', region: 'South', customer: 'Own outlet — T. Nagar', customerCode: 'CUS-0003', salesOrderNo: 'SO/2627/0440', deliveryDate: d(6), priority: 'LOW', cartons: 50, pallets: 2, weightKg: 360, volumeCbm: 1.9, vehicleNo: 'TN-01-AK-9034', transporter: 'Own fleet', vehicleCapacityKg: 1_500, isExport: false },
]

/* ═══════════════════════════ Pick lists ══════════════════════════════════ */

export const pickLists: PickList[] = [
  { uid: 'pl2-01', docNo: 'PCK/2607/0421', dispatchPlanNo: 'DSP/2607/0138', createdOn: at(0, 7), method: 'FEFO', warehouse: 'FG Store — Chennai', zone: 'FG-A', customer: 'Reliance Retail Ltd', itemCode: 'FG-SS-750-BLK', itemName: 'Insulated Bottle 750 ml — Matte Black', batchNo: 'B2607-FG-0121', bin: 'FG-A-02-14', requiredQty: 3_120, pickedQty: 3_120, uom: 'NOS', picker: 'D. Anand', status: 'PICKED', shortReason: null },
  { uid: 'pl2-02', docNo: 'PCK/2607/0422', dispatchPlanNo: 'DSP/2607/0139', createdOn: at(0, 8), method: 'FIFO', warehouse: 'FG Store — Chennai', zone: 'FG-B', customer: 'Croma — Tata Digital', itemCode: 'FG-SS-1000-STL', itemName: 'Insulated Bottle 1000 ml — Brushed Steel', batchNo: 'B2607-FG-0114', bin: 'FG-B-01-08', requiredQty: 1_200, pickedQty: 840, uom: 'NOS', picker: 'D. Anand', status: 'PICKING', shortReason: null },
  { uid: 'pl2-03', docNo: 'PCK/2607/0423', dispatchPlanNo: 'DSP/2607/0141', createdOn: at(0, 9), method: 'WAVE', warehouse: 'FG Store — Chennai', zone: 'FG-C', customer: 'Amazon Retail India', itemCode: 'FG-SS-750-BLK', itemName: 'Insulated Bottle 750 ml — Matte Black', batchNo: null, bin: 'FG-C-03-02', requiredQty: 1_800, pickedQty: 0, uom: 'NOS', picker: null, status: 'OPEN', shortReason: null },
  { uid: 'pl2-04', docNo: 'PCK/2607/0418', dispatchPlanNo: 'DSP/2607/0135', createdOn: at(3, 7), method: 'FEFO', warehouse: 'FG Store — Chennai', zone: 'FG-A', customer: 'Metro Cash & Carry', itemCode: 'FG-SS-500-BLU', itemName: 'Insulated Bottle 500 ml — Ocean Blue', batchNo: 'B2607-FG-0119', bin: 'FG-A-01-06', requiredQty: 2_400, pickedQty: 2_400, uom: 'NOS', picker: 'R. Sekar', status: 'PICKED', shortReason: null },
  { uid: 'pl2-05', docNo: 'PCK/2607/0424', dispatchPlanNo: 'DSP/2607/0142', createdOn: at(0, 10), method: 'BATCH', warehouse: 'FG Store — Chennai', zone: 'FG-EXP', customer: 'Hydra GmbH — Hamburg', itemCode: 'FG-SS-1000-STL', itemName: 'Insulated Bottle 1000 ml — Brushed Steel', batchNo: 'B2607-FG-0119', bin: 'FG-EXP-01-01', requiredQty: 6_000, pickedQty: 5_640, uom: 'NOS', picker: 'R. Sekar', status: 'SHORT', shortReason: 'Bin holds 5,640 of this batch. The balance 360 is still in quarantine awaiting the leak-test certificate.' },
  { uid: 'pl2-06', docNo: 'PCK/2607/0412', dispatchPlanNo: 'DSP/2607/0129', createdOn: at(6, 8), method: 'ZONE', warehouse: 'FG Store — Chennai', zone: 'FG-A', customer: 'Own outlet — T. Nagar', itemCode: 'FG-SS-500-BLU', itemName: 'Insulated Bottle 500 ml — Ocean Blue', batchNo: 'B2607-FG-0112', bin: 'FG-A-01-02', requiredQty: 600, pickedQty: 600, uom: 'NOS', picker: 'R. Sekar', status: 'PICKED', shortReason: null },
]

/* ══════════════════════════════ Vehicles ═════════════════════════════════ */

export const vehicles: Vehicle[] = [
  { uid: 'vh-01', vehicleNo: 'TN-22-BG-4471', vehicleType: 'THIRD_PARTY', transporter: 'Sree Logistics', driver: 'M. Rajan', driverPhone: '+91 98410 22114', capacityKg: 9_000, capacityCbm: 32, route: 'Chennai — Sriperumbudur', hasGps: true, insuranceExpiry: fwd(184), fitnessExpiry: fwd(96), permitExpiry: fwd(211), lastServiceOn: d(24), state: 'LOADING', currentShipmentNo: 'SHP/2607/0512', isActive: true },
  { uid: 'vh-02', vehicleNo: 'KA-05-MJ-8802', vehicleType: 'THIRD_PARTY', transporter: 'VRL Logistics', driver: 'S. Basavaraj', driverPhone: '+91 99860 41207', capacityKg: 12_000, capacityCbm: 44, route: 'Chennai — Bengaluru', hasGps: true, insuranceExpiry: fwd(62), fitnessExpiry: fwd(148), permitExpiry: fwd(74), lastServiceOn: d(12), state: 'IN_TRANSIT', currentShipmentNo: 'SHP/2607/0498', isActive: true },
  { uid: 'vh-03', vehicleNo: 'TN-01-AK-9034', vehicleType: 'COMPANY', transporter: 'Own fleet', driver: 'K. Murugan', driverPhone: '+91 94440 87612', capacityKg: 1_500, capacityCbm: 8, route: 'Chennai city', hasGps: true, insuranceExpiry: fwd(311), fitnessExpiry: fwd(28), permitExpiry: fwd(290), lastServiceOn: d(6), state: 'AVAILABLE', currentShipmentNo: null, isActive: true },
  { uid: 'vh-04', vehicleNo: 'MH-04-KP-2219', vehicleType: 'THIRD_PARTY', transporter: 'TCI Freight', driver: 'A. Deshmukh', driverPhone: '+91 98204 33518', capacityKg: 9_000, capacityCbm: 32, route: 'Chennai — Mumbai', hasGps: false, insuranceExpiry: fwd(140), fitnessExpiry: fwd(202), permitExpiry: fwd(155), lastServiceOn: d(31), state: 'AVAILABLE', currentShipmentNo: null, isActive: true },
  { uid: 'vh-05', vehicleNo: 'MSCU 782 4419', vehicleType: 'CONTAINER', transporter: 'Maersk / CONCOR', driver: 'CONCOR haulage', driverPhone: '+91 44 2536 1180', capacityKg: 26_000, capacityCbm: 67, route: 'Chennai Port — Hamburg', hasGps: true, insuranceExpiry: fwd(240), fitnessExpiry: fwd(240), permitExpiry: fwd(240), lastServiceOn: d(45), state: 'AVAILABLE', currentShipmentNo: null, isActive: true },
  { uid: 'vh-06', vehicleNo: 'TN-11-CD-5560', vehicleType: 'COMPANY', transporter: 'Own fleet', driver: 'P. Elango', driverPhone: '+91 90031 55420', capacityKg: 3_500, capacityCbm: 14, route: 'Chennai city', hasGps: false, insuranceExpiry: d(9), fitnessExpiry: fwd(58), permitExpiry: fwd(120), lastServiceOn: d(58), state: 'MAINTENANCE', currentShipmentNo: null, isActive: true },
  { uid: 'vh-07', vehicleNo: 'BLUEDART-AIR', vehicleType: 'AIR_CARGO', transporter: 'Blue Dart Aviation', driver: 'Air cargo — no driver', driverPhone: '+91 44 6644 5555', capacityKg: 500, capacityCbm: 3, route: 'Chennai — Delhi (air)', hasGps: true, insuranceExpiry: fwd(365), fitnessExpiry: fwd(365), permitExpiry: fwd(365), lastServiceOn: d(2), state: 'AVAILABLE', currentShipmentNo: null, isActive: true },
]

/* ════════════════════════ Loading sheets ═════════════════════════════════ */

export const loadingSheets: LoadingSheet[] = [
  { uid: 'ls-01', docNo: 'LDS/2607/0288', dispatchPlanNo: 'DSP/2607/0138', vehicleNo: 'TN-22-BG-4471', transporter: 'Sree Logistics', driver: 'M. Rajan', customer: 'Reliance Retail Ltd', destination: 'Chennai DC — Sriperumbudur', stagingBay: 'Bay 2', cartonsPlanned: 260, cartonsLoaded: 184, palletsLoaded: 5, plannedWeightKg: 2_558, actualWeightKg: 1_812, startedAt: at(0, 11), completedAt: null, loader: 'Loading gang B', supervisor: 'R. Vasanth', sealNo: null, sealVerified: false, photosAttached: 2, status: 'LOADING' },
  { uid: 'ls-02', docNo: 'LDS/2607/0284', dispatchPlanNo: 'DSP/2607/0135', vehicleNo: 'KA-05-MJ-8802', transporter: 'VRL Logistics', driver: 'S. Basavaraj', customer: 'Metro Cash & Carry', destination: 'Bengaluru — Whitefield', stagingBay: 'Bay 1', cartonsPlanned: 200, cartonsLoaded: 200, palletsLoaded: 5, plannedWeightKg: 1_440, actualWeightKg: 1_452, startedAt: at(3, 14), completedAt: at(3, 17), loader: 'Loading gang A', supervisor: 'R. Vasanth', sealNo: 'SL-448120', sealVerified: true, photosAttached: 4, status: 'DISPATCHED' },
  { uid: 'ls-03', docNo: 'LDS/2607/0289', dispatchPlanNo: 'DSP/2607/0139', vehicleNo: 'MH-04-KP-2219', transporter: 'TCI Freight', driver: 'A. Deshmukh', customer: 'Croma — Tata Digital', destination: 'Mumbai — Bhiwandi', stagingBay: 'Bay 3', cartonsPlanned: 100, cartonsLoaded: 0, palletsLoaded: 0, plannedWeightKg: 1_260, actualWeightKg: 0, startedAt: null, completedAt: null, loader: 'Loading gang A', supervisor: 'K. Latha', sealNo: null, sealVerified: false, photosAttached: 0, status: 'STAGED' },
  { uid: 'ls-04', docNo: 'LDS/2607/0271', dispatchPlanNo: 'DSP/2607/0129', vehicleNo: 'TN-01-AK-9034', transporter: 'Own fleet', driver: 'K. Murugan', customer: 'Own outlet — T. Nagar', destination: 'Chennai — T. Nagar', stagingBay: 'Bay 1', cartonsPlanned: 50, cartonsLoaded: 50, palletsLoaded: 2, plannedWeightKg: 360, actualWeightKg: 362, startedAt: at(6, 10), completedAt: at(6, 11), loader: 'Loading gang B', supervisor: 'R. Vasanth', sealNo: 'SL-447902', sealVerified: true, photosAttached: 3, status: 'DISPATCHED' },
]

/* ═══════════════════════════ Shipments ═══════════════════════════════════ */

export const shipments: Shipment[] = [
  {
    uid: 'sh-01', docNo: 'SHP/2607/0512', shipmentType: 'DOMESTIC', status: 'LOADED',
    dispatchPlanNo: 'DSP/2607/0138', challanNo: 'DC/2607/0448', invoiceNo: null, ewayBillNo: null,
    customer: 'Reliance Retail Ltd', customerCode: 'CUS-0012', destination: 'Chennai DC — Sriperumbudur',
    region: 'South', route: 'Chennai — Sriperumbudur', vehicleNo: 'TN-22-BG-4471', transporter: 'Sree Logistics',
    driver: 'M. Rajan', driverPhone: '+91 98410 22114', cartons: 184, pallets: 5, weightKg: 1_812,
    invoiceValue: 1_842_000, dispatchedAt: null, etaAt: atFwd(1), deliveredAt: null,
    lastLocation: 'Plant — Bay 2', lastUpdatedAt: at(0, 11), delayReason: null, podStatus: 'NOT_DUE', isExport: false,
  },
  {
    uid: 'sh-02', docNo: 'SHP/2607/0498', shipmentType: 'DOMESTIC', status: 'IN_TRANSIT',
    dispatchPlanNo: 'DSP/2607/0135', challanNo: 'DC/2607/0431', invoiceNo: 'INV/2627/0884', ewayBillNo: '2418 7743 9021',
    customer: 'Metro Cash & Carry', customerCode: 'CUS-0021', destination: 'Bengaluru — Whitefield',
    region: 'South', route: 'Chennai — Bengaluru', vehicleNo: 'KA-05-MJ-8802', transporter: 'VRL Logistics',
    driver: 'S. Basavaraj', driverPhone: '+91 99860 41207', cartons: 200, pallets: 5, weightKg: 1_452,
    invoiceValue: 962_400, dispatchedAt: at(3, 18), etaAt: at(1, 9), deliveredAt: null,
    lastLocation: 'Krishnagiri toll — NH 44', lastUpdatedAt: at(0, 6),
    delayReason: 'Held 9 hours at Hosur for a driver rest stop after a tyre burst. Revised ETA is 14:00 today.',
    podStatus: 'PENDING', isExport: false,
  },
  {
    uid: 'sh-03', docNo: 'SHP/2607/0471', shipmentType: 'DISTRIBUTOR', status: 'DELIVERED',
    dispatchPlanNo: 'DSP/2607/0129', challanNo: 'DC/2607/0412', invoiceNo: 'INV/2627/0871', ewayBillNo: '2418 7612 4408',
    customer: 'Own outlet — T. Nagar', customerCode: 'CUS-0003', destination: 'Chennai — T. Nagar',
    region: 'South', route: 'Chennai city', vehicleNo: 'TN-01-AK-9034', transporter: 'Own fleet',
    driver: 'K. Murugan', driverPhone: '+91 94440 87612', cartons: 50, pallets: 2, weightKg: 362,
    invoiceValue: 248_000, dispatchedAt: at(6, 12), etaAt: at(6, 15), deliveredAt: at(6, 14),
    lastLocation: 'Delivered — T. Nagar showroom', lastUpdatedAt: at(6, 14), delayReason: null,
    podStatus: 'RECEIVED', isExport: false,
  },
  {
    uid: 'sh-04', docNo: 'SHP/2607/0464', shipmentType: 'ECOMMERCE', status: 'DELIVERED',
    dispatchPlanNo: 'DSP/2607/0124', challanNo: 'DC/2607/0398', invoiceNo: 'INV/2627/0854', ewayBillNo: '2418 7511 2260',
    customer: 'Amazon Retail India', customerCode: 'CUS-0058', destination: 'Bengaluru FC — BLR8',
    region: 'South', route: 'Chennai — Bengaluru', vehicleNo: 'KA-05-MJ-8802', transporter: 'Delhivery',
    driver: 'V. Ganesan', driverPhone: '+91 90080 71422', cartons: 620, pallets: 8, weightKg: 682,
    invoiceValue: 486_200, dispatchedAt: at(9, 8), etaAt: at(8, 12), deliveredAt: at(8, 11),
    lastLocation: 'Delivered — BLR8 dock 4', lastUpdatedAt: at(8, 11), delayReason: null,
    podStatus: 'SHORT', isExport: false,
  },
  {
    uid: 'sh-05', docNo: 'SHP/2607/0455', shipmentType: 'EXPORT', status: 'IN_TRANSIT',
    dispatchPlanNo: 'DSP/2607/0118', challanNo: 'DC/2607/0381', invoiceNo: 'INV/2627/0842', ewayBillNo: '2418 7402 8813',
    customer: 'Hydra GmbH — Hamburg', customerCode: 'CUS-0047', destination: 'Hamburg, Germany',
    region: 'Export', route: 'Chennai Port — Hamburg', vehicleNo: 'MSCU 641 2208', transporter: 'Maersk / CONCOR',
    driver: 'Vessel — MV Ever Grace', driverPhone: '+91 44 2536 1180', cartons: 240, pallets: 12, weightKg: 8_120,
    invoiceValue: 5_412_000, dispatchedAt: at(18, 6), etaAt: atFwd(11), deliveredAt: null,
    lastLocation: 'At sea — Suez transit', lastUpdatedAt: at(1, 4), delayReason: null,
    podStatus: 'NOT_DUE', isExport: true,
  },
  {
    uid: 'sh-06', docNo: 'SHP/2607/0448', shipmentType: 'SAMPLE', status: 'DELIVERED',
    dispatchPlanNo: 'DSP/2607/0112', challanNo: 'DC/2607/0374', invoiceNo: null, ewayBillNo: null,
    customer: 'Decathlon Sports India', customerCode: 'CUS-0066', destination: 'Bengaluru — head office',
    region: 'South', route: 'Chennai — Bengaluru (air)', vehicleNo: 'BLUEDART-AIR', transporter: 'Blue Dart Aviation',
    driver: 'Air cargo — no driver', driverPhone: '+91 44 6644 5555', cartons: 2, pallets: 0, weightKg: 18,
    invoiceValue: 0, dispatchedAt: at(21, 10), etaAt: at(20, 12), deliveredAt: at(20, 11),
    lastLocation: 'Delivered — reception', lastUpdatedAt: at(20, 11), delayReason: null,
    podStatus: 'RECEIVED', isExport: false,
  },
  {
    uid: 'sh-07', docNo: 'SHP/2607/0503', shipmentType: 'REPLACEMENT', status: 'DISPATCHED',
    dispatchPlanNo: 'DSP/2607/0136', challanNo: 'DC/2607/0441', invoiceNo: null, ewayBillNo: '2418 7728 5514',
    customer: 'Metro Cash & Carry', customerCode: 'CUS-0021', destination: 'Bengaluru — Whitefield',
    region: 'South', route: 'Chennai — Bengaluru', vehicleNo: 'TN-11-CD-5560', transporter: 'Own fleet',
    driver: 'P. Elango', driverPhone: '+91 90031 55420', cartons: 12, pallets: 1, weightKg: 88,
    invoiceValue: 0, dispatchedAt: at(2, 9), etaAt: at(1, 18), deliveredAt: null,
    lastLocation: 'Vellore bypass', lastUpdatedAt: at(1, 12),
    delayReason: 'Vehicle went into unscheduled maintenance at Vellore. Load being transferred to a hired vehicle.',
    podStatus: 'PENDING', isExport: false,
  },
]

/* ═══════════════════════ Export shipments & documents ════════════════════ */

export const exportShipments: ExportShipment[] = [
  {
    uid: 'ex-01', docNo: 'EXP/2607/0044', shipmentNo: 'SHP/2607/0455', customer: 'Hydra GmbH — Hamburg',
    country: 'Germany', incoterm: 'CIF', containerNo: 'MSCU 641 2208', containerSize: '40HC', sealNo: 'MSC-9924118',
    stuffingDate: d(19), vessel: 'MV Ever Grace', voyageNo: '227W', portOfLoading: 'INMAA — Chennai',
    portOfDischarge: 'DEHAM — Hamburg', etd: d(18), eta: fwd(11), hsCode: '9617 0011',
    fobValueUsd: 64_800, exchangeRate: 83.52, shippingBillNo: 'SB/4471820', blNo: 'MAEU-2274418',
    customsStatus: 'CLEARED', status: 'SAILED',
  },
  {
    uid: 'ex-02', docNo: 'EXP/2607/0047', shipmentNo: 'SHP/2607/0518', customer: 'Hydra GmbH — Hamburg',
    country: 'Germany', incoterm: 'FOB', containerNo: 'MSCU 782 4419', containerSize: '40FT', sealNo: '',
    stuffingDate: fwd(2), vessel: 'MV Nordic Star', voyageNo: '231W', portOfLoading: 'INMAA — Chennai',
    portOfDischarge: 'DEHAM — Hamburg', etd: fwd(5), eta: fwd(32), hsCode: '9617 0011',
    fobValueUsd: 78_400, exchangeRate: 83.52, shippingBillNo: null, blNo: null,
    customsStatus: 'NOT_FILED', status: 'PLANNED',
    remarks: 'Stuffing planned for the day after tomorrow. Certificate of origin and inspection certificate still outstanding.',
  },
  {
    uid: 'ex-03', docNo: 'EXP/2606/0039', shipmentNo: 'SHP/2606/0402', customer: 'Aqua Nordic AS — Oslo',
    country: 'Norway', incoterm: 'DAP', containerNo: 'TCLU 553 1120', containerSize: '20FT', sealNo: 'MSC-9911402',
    stuffingDate: d(48), vessel: 'MV Baltic Trader', voyageNo: '214W', portOfLoading: 'INMAA — Chennai',
    portOfDischarge: 'NOOSL — Oslo', etd: d(46), eta: d(9), hsCode: '9617 0011',
    fobValueUsd: 31_200, exchangeRate: 83.18, shippingBillNo: 'SB/4468102', blNo: 'MAEU-2261140',
    customsStatus: 'CLEARED', status: 'DELIVERED',
  },
]

export const exportDocuments: ExportDocument[] = [
  // EXP/2607/0044 — complete, sailed.
  { uid: 'ed-01', exportShipmentNo: 'EXP/2607/0044', docType: 'COMMERCIAL_INVOICE', docNo: 'CI/2627/0088', issuedOn: d(20), issuedBy: 'S. Ganapathy', dependsOn: null, isMandatory: true, status: 'ACCEPTED', fileName: 'CI-2627-0088.pdf' },
  { uid: 'ed-02', exportShipmentNo: 'EXP/2607/0044', docType: 'PACKING_LIST', docNo: 'PL/2627/0088', issuedOn: d(20), issuedBy: 'S. Ganapathy', dependsOn: 'COMMERCIAL_INVOICE', isMandatory: true, status: 'ACCEPTED', fileName: 'PL-2627-0088.pdf' },
  { uid: 'ed-03', exportShipmentNo: 'EXP/2607/0044', docType: 'CERTIFICATE_OF_ORIGIN', docNo: 'COO/TN/44812', issuedOn: d(19), issuedBy: 'Chennai Chamber of Commerce', dependsOn: 'COMMERCIAL_INVOICE', isMandatory: true, status: 'ACCEPTED', fileName: 'COO-TN-44812.pdf' },
  { uid: 'ed-04', exportShipmentNo: 'EXP/2607/0044', docType: 'SHIPPING_BILL', docNo: 'SB/4471820', issuedOn: d(19), issuedBy: 'ICEGATE', dependsOn: 'COMMERCIAL_INVOICE', isMandatory: true, status: 'ACCEPTED', fileName: 'SB-4471820.pdf' },
  { uid: 'ed-05', exportShipmentNo: 'EXP/2607/0044', docType: 'BILL_OF_LADING', docNo: 'MAEU-2274418', issuedOn: d(18), issuedBy: 'Maersk Line', dependsOn: 'SHIPPING_BILL', isMandatory: true, status: 'ISSUED', fileName: 'BL-MAEU-2274418.pdf' },
  { uid: 'ed-06', exportShipmentNo: 'EXP/2607/0044', docType: 'INSPECTION_CERTIFICATE', docNo: 'EIC/2607/0221', issuedOn: d(21), issuedBy: 'Export Inspection Agency', dependsOn: null, isMandatory: true, status: 'ACCEPTED', fileName: 'EIC-2607-0221.pdf' },
  { uid: 'ed-07', exportShipmentNo: 'EXP/2607/0044', docType: 'INSURANCE_POLICY', docNo: 'MI/NIA/884120', issuedOn: d(19), issuedBy: 'New India Assurance', dependsOn: 'COMMERCIAL_INVOICE', isMandatory: true, status: 'ISSUED', fileName: 'MI-NIA-884120.pdf' },

  // EXP/2607/0047 — the one that is not ready.
  { uid: 'ed-08', exportShipmentNo: 'EXP/2607/0047', docType: 'COMMERCIAL_INVOICE', docNo: 'CI/2627/0094', issuedOn: d(1), issuedBy: 'S. Ganapathy', dependsOn: null, isMandatory: true, status: 'ISSUED', fileName: 'CI-2627-0094.pdf' },
  { uid: 'ed-09', exportShipmentNo: 'EXP/2607/0047', docType: 'PACKING_LIST', docNo: null, issuedOn: null, issuedBy: null, dependsOn: 'COMMERCIAL_INVOICE', isMandatory: true, status: 'DRAFT', fileName: null, remarks: 'Cannot be finalised until palletisation is complete — the carton and pallet counts come from it.' },
  { uid: 'ed-10', exportShipmentNo: 'EXP/2607/0047', docType: 'CERTIFICATE_OF_ORIGIN', docNo: null, issuedOn: null, issuedBy: null, dependsOn: 'COMMERCIAL_INVOICE', isMandatory: true, status: 'MISSING', fileName: null, remarks: 'Chamber of Commerce application not yet lodged. Two working days lead time.' },
  { uid: 'ed-11', exportShipmentNo: 'EXP/2607/0047', docType: 'SHIPPING_BILL', docNo: null, issuedOn: null, issuedBy: null, dependsOn: 'COMMERCIAL_INVOICE', isMandatory: true, status: 'MISSING', fileName: null },
  { uid: 'ed-12', exportShipmentNo: 'EXP/2607/0047', docType: 'BILL_OF_LADING', docNo: null, issuedOn: null, issuedBy: null, dependsOn: 'SHIPPING_BILL', isMandatory: true, status: 'MISSING', fileName: null },
  { uid: 'ed-13', exportShipmentNo: 'EXP/2607/0047', docType: 'INSPECTION_CERTIFICATE', docNo: null, issuedOn: null, issuedBy: null, dependsOn: null, isMandatory: true, status: 'MISSING', fileName: null, remarks: 'EIA inspection booked for tomorrow morning.' },
  { uid: 'ed-14', exportShipmentNo: 'EXP/2607/0047', docType: 'INSURANCE_POLICY', docNo: null, issuedOn: null, issuedBy: null, dependsOn: 'COMMERCIAL_INVOICE', isMandatory: false, status: 'MISSING', fileName: null, remarks: 'FOB terms — the buyer arranges marine insurance, so this is not our document.' },
]

/* ══════════════════════════ Proof of delivery ════════════════════════════ */

export const pods: Pod[] = [
  { uid: 'pd-01', docNo: 'POD/2607/0388', shipmentNo: 'SHP/2607/0471', challanNo: 'DC/2607/0412', customer: 'Own outlet — T. Nagar', destination: 'Chennai — T. Nagar', deliveredOn: d(6), deliveredAtTime: '14:20', receiverName: 'S. Thangam', receiverDesignation: 'Store manager', signatureCaptured: true, photoCaptured: true, gpsLatitude: 13.0418, gpsLongitude: 80.2341, dispatchedQty: 600, receivedQty: 600, shortQty: 0, damagedQty: 0, capturedBy: 'K. Murugan', capturedVia: 'MOBILE', status: 'RECEIVED' },
  { uid: 'pd-02', docNo: 'POD/2607/0381', shipmentNo: 'SHP/2607/0464', challanNo: 'DC/2607/0398', customer: 'Amazon Retail India', destination: 'Bengaluru FC — BLR8', deliveredOn: d(8), deliveredAtTime: '11:05', receiverName: 'FC inbound — dock 4', receiverDesignation: 'Inbound associate', signatureCaptured: true, photoCaptured: true, gpsLatitude: 12.9812, gpsLongitude: 77.7204, dispatchedQty: 620, receivedQty: 614, shortQty: 6, damagedQty: 0, capturedBy: 'V. Ganesan', capturedVia: 'COURIER_API', status: 'SHORT', remarks: 'Six units short-received against carton CTN/2607/03918. Amazon has raised a shortage claim; investigation open with the transporter.' },
  { uid: 'pd-03', docNo: 'POD/2607/0374', shipmentNo: 'SHP/2607/0448', challanNo: 'DC/2607/0374', customer: 'Decathlon Sports India', destination: 'Bengaluru — head office', deliveredOn: d(20), deliveredAtTime: '11:40', receiverName: 'A. Iyer', receiverDesignation: 'Sourcing manager', signatureCaptured: true, photoCaptured: false, gpsLatitude: 12.9352, gpsLongitude: 77.6245, dispatchedQty: 24, receivedQty: 24, shortQty: 0, damagedQty: 0, capturedBy: 'Blue Dart', capturedVia: 'COURIER_API', status: 'RECEIVED' },
  { uid: 'pd-04', docNo: 'POD/2607/0392', shipmentNo: 'SHP/2607/0498', challanNo: 'DC/2607/0431', customer: 'Metro Cash & Carry', destination: 'Bengaluru — Whitefield', deliveredOn: null, deliveredAtTime: null, receiverName: null, receiverDesignation: null, signatureCaptured: false, photoCaptured: false, gpsLatitude: null, gpsLongitude: null, dispatchedQty: 2_400, receivedQty: 0, shortQty: 0, damagedQty: 0, capturedBy: null, capturedVia: null, status: 'PENDING', remarks: 'Overdue — the shipment was due yesterday at 09:00 and is still in transit.' },
  { uid: 'pd-05', docNo: 'POD/2607/0395', shipmentNo: 'SHP/2607/0503', challanNo: 'DC/2607/0441', customer: 'Metro Cash & Carry', destination: 'Bengaluru — Whitefield', deliveredOn: null, deliveredAtTime: null, receiverName: null, receiverDesignation: null, signatureCaptured: false, photoCaptured: false, gpsLatitude: null, gpsLongitude: null, dispatchedQty: 144, receivedQty: 0, shortQty: 0, damagedQty: 0, capturedBy: null, capturedVia: null, status: 'PENDING' },
  { uid: 'pd-06', docNo: 'POD/2606/0341', shipmentNo: 'SHP/2606/0402', challanNo: 'DC/2606/0318', customer: 'Aqua Nordic AS — Oslo', destination: 'Oslo, Norway', deliveredOn: d(9), deliveredAtTime: '09:15', receiverName: 'L. Haugen', receiverDesignation: 'Warehouse supervisor', signatureCaptured: true, photoCaptured: true, gpsLatitude: 59.9106, gpsLongitude: 10.7522, dispatchedQty: 1_440, receivedQty: 1_428, shortQty: 0, damagedQty: 12, capturedBy: 'Consignee', capturedVia: 'WEB', status: 'DAMAGED', remarks: '12 bottles dented in transit — one carton crushed in the container. Marine insurance claim MI/NIA/881204 lodged.' },
]

/* ═══════════════════════ Returns & reverse logistics ════════════════════ */

export const salesReturns: SalesReturn[] = [
  { uid: 'rt-01', docNo: 'SRN/2607/0072', requestedOn: d(4), returnType: 'TRANSIT_DAMAGE', customer: 'Aqua Nordic AS — Oslo', customerCode: 'CUS-0071', shipmentNo: 'SHP/2606/0402', invoiceNo: 'INV/2627/0812', itemCode: 'FG-SS-1000-STL', itemName: 'Insulated Bottle 1000 ml — Brushed Steel', batchNo: 'B2606-FG-0088', quantity: 12, receivedQty: 12, uom: 'NOS', reason: 'Dented in transit — one carton crushed inside the container', approvedBy: 'S. Ganapathy', pickupOn: d(2), receivedOn: d(1), inspectedBy: 'S. Meena', disposition: 'SCRAP', creditNoteNo: 'CRN/2627/0044', value: 14_400, status: 'CLOSED' },
  { uid: 'rt-02', docNo: 'SRN/2607/0078', requestedOn: d(1), returnType: 'CUSTOMER_RETURN', customer: 'Croma — Tata Digital', customerCode: 'CUS-0034', shipmentNo: 'SHP/2607/0462', invoiceNo: 'INV/2627/0868', itemCode: 'FG-SS-750-BLK', itemName: 'Insulated Bottle 750 ml — Matte Black', batchNo: 'B2607-FG-0114', quantity: 48, receivedQty: 0, uom: 'NOS', reason: 'Unsold seasonal stock returned under the buy-back clause', approvedBy: 'S. Ganapathy', pickupOn: fwd(1), receivedOn: null, inspectedBy: null, disposition: 'PENDING', creditNoteNo: null, value: 43_200, status: 'PICKUP_SCHEDULED' },
  { uid: 'rt-03', docNo: 'SRN/2607/0080', requestedOn: d(0), returnType: 'WRONG_SHIPMENT', customer: 'Metro Cash & Carry', customerCode: 'CUS-0021', shipmentNo: 'SHP/2607/0498', invoiceNo: 'INV/2627/0884', itemCode: 'FG-SS-500-BLU', itemName: 'Insulated Bottle 500 ml — Ocean Blue', batchNo: 'B2607-FG-0119', quantity: 144, receivedQty: 0, uom: 'NOS', reason: 'Ocean Blue sent against an order for Matte Black — picking error on PCK/2607/0418', approvedBy: null, pickupOn: null, receivedOn: null, inspectedBy: null, disposition: 'PENDING', creditNoteNo: null, value: 86_400, status: 'REQUESTED' },
  { uid: 'rt-04', docNo: 'SRN/2607/0069', requestedOn: d(9), returnType: 'WARRANTY', customer: 'Own outlet — T. Nagar', customerCode: 'CUS-0003', shipmentNo: null, invoiceNo: 'INV/2627/0798', itemCode: 'FG-SS-750-BLK', itemName: 'Insulated Bottle 750 ml — Matte Black', batchNo: 'B2606-FG-0074', quantity: 6, receivedQty: 6, uom: 'NOS', reason: 'Vacuum failure inside the warranty period — bottles no longer holding temperature', approvedBy: 'S. Meena', pickupOn: d(7), receivedOn: d(6), inspectedBy: 'S. Meena', disposition: 'REWORK', creditNoteNo: null, value: 5_400, status: 'INSPECTED', remarks: 'Traced to the vacuum sealing operation on 12 June. Rework order RWK/2607/0038 raised.' },
  { uid: 'rt-05', docNo: 'SRN/2607/0075', requestedOn: d(3), returnType: 'REPLACEMENT', customer: 'Metro Cash & Carry', customerCode: 'CUS-0021', shipmentNo: 'SHP/2607/0480', invoiceNo: 'INV/2627/0876', itemCode: 'FG-SS-1000-STL', itemName: 'Insulated Bottle 1000 ml — Brushed Steel', batchNo: 'B2607-FG-0102', quantity: 12, receivedQty: 12, uom: 'NOS', reason: 'Lid thread not seating — replacement shipped as SHP/2607/0503', approvedBy: 'S. Ganapathy', pickupOn: d(2), receivedOn: d(1), inspectedBy: 'S. Meena', disposition: 'RESTOCK', creditNoteNo: null, value: 14_400, status: 'INSPECTED', remarks: 'Lids replaced and re-tested. Bottles are saleable — returning to the finished-goods store.' },
]

/* ════════════════════════ Freight & logistics cost ══════════════════════ */

export const freightCharges: FreightCharge[] = [
  { uid: 'fr-01', docNo: 'FRT/2607/0284', shipmentNo: 'SHP/2607/0498', customer: 'Metro Cash & Carry', transporter: 'VRL Logistics', route: 'Chennai — Bengaluru', chargeType: 'FREIGHT', basis: 'PER_KG', quantity: 1_452, rate: 8.4, amount: 12_197, allocateTo: 'SHIPMENT', billNo: 'VRL/CH/88412', billDate: d(2), approvedBy: 'S. Ganapathy', status: 'APPROVED' },
  { uid: 'fr-02', docNo: 'FRT/2607/0285', shipmentNo: 'SHP/2607/0498', customer: 'Metro Cash & Carry', transporter: 'VRL Logistics', route: 'Chennai — Bengaluru', chargeType: 'LOADING', basis: 'PER_CARTON', quantity: 200, rate: 6, amount: 1_200, allocateTo: 'SHIPMENT', billNo: 'VRL/CH/88412', billDate: d(2), approvedBy: 'S. Ganapathy', status: 'APPROVED' },
  { uid: 'fr-03', docNo: 'FRT/2607/0286', shipmentNo: 'SHP/2607/0498', customer: 'Metro Cash & Carry', transporter: 'VRL Logistics', route: 'Chennai — Bengaluru', chargeType: 'FUEL_SURCHARGE', basis: 'PER_TRIP', quantity: 1, rate: 2_400, amount: 2_400, allocateTo: 'SHIPMENT', billNo: 'VRL/CH/88412', billDate: d(2), approvedBy: null, status: 'DISPUTED', remarks: 'Surcharge billed at 18% against a contracted 12%. Held pending a corrected bill.' },
  { uid: 'fr-04', docNo: 'FRT/2607/0288', shipmentNo: 'SHP/2607/0512', customer: 'Reliance Retail Ltd', transporter: 'Sree Logistics', route: 'Chennai — Sriperumbudur', chargeType: 'FREIGHT', basis: 'PER_TRIP', quantity: 1, rate: 6_800, amount: 6_800, allocateTo: 'CUSTOMER', billNo: null, billDate: null, approvedBy: null, status: 'ESTIMATED' },
  { uid: 'fr-05', docNo: 'FRT/2607/0289', shipmentNo: 'SHP/2607/0512', customer: 'Reliance Retail Ltd', transporter: 'Sree Logistics', route: 'Chennai — Sriperumbudur', chargeType: 'TOLL', basis: 'ACTUAL', quantity: 1, rate: 460, amount: 460, allocateTo: 'SHIPMENT', billNo: null, billDate: null, approvedBy: null, status: 'ESTIMATED' },
  { uid: 'fr-06', docNo: 'FRT/2607/0271', shipmentNo: 'SHP/2607/0455', customer: 'Hydra GmbH — Hamburg', transporter: 'Maersk / CONCOR', route: 'Chennai Port — Hamburg', chargeType: 'EXPORT_CHARGES', basis: 'PER_TRIP', quantity: 1, rate: 184_000, amount: 184_000, allocateTo: 'SALES_ORDER', billNo: 'MAEU/IN/442180', billDate: d(17), approvedBy: 'S. Ganapathy', status: 'PAID' },
  { uid: 'fr-07', docNo: 'FRT/2607/0272', shipmentNo: 'SHP/2607/0455', customer: 'Hydra GmbH — Hamburg', transporter: 'New India Assurance', route: 'Chennai Port — Hamburg', chargeType: 'INSURANCE', basis: 'ACTUAL', quantity: 1, rate: 24_360, amount: 24_360, allocateTo: 'SALES_ORDER', billNo: 'MI/NIA/884120', billDate: d(19), approvedBy: 'S. Ganapathy', status: 'PAID' },
  { uid: 'fr-08', docNo: 'FRT/2607/0273', shipmentNo: 'SHP/2607/0455', customer: 'Hydra GmbH — Hamburg', transporter: 'CONCOR', route: 'Chennai Port', chargeType: 'DEMURRAGE', basis: 'ACTUAL', quantity: 2, rate: 4_800, amount: 9_600, allocateTo: 'SHIPMENT', billNo: 'CON/44812', billDate: d(16), approvedBy: 'S. Ganapathy', status: 'ACTUAL', remarks: 'Two days at the port waiting for the certificate of origin. Avoidable — the document was applied for late.' },
  { uid: 'fr-09', docNo: 'FRT/2607/0262', shipmentNo: 'SHP/2607/0471', customer: 'Own outlet — T. Nagar', transporter: 'Own fleet', route: 'Chennai city', chargeType: 'FREIGHT', basis: 'PER_KM', quantity: 22, rate: 42, amount: 924, allocateTo: 'PRODUCT', billNo: null, billDate: null, approvedBy: 'R. Vasanth', status: 'ACTUAL' },
  { uid: 'fr-10', docNo: 'FRT/2607/0258', shipmentNo: 'SHP/2607/0464', customer: 'Amazon Retail India', transporter: 'Delhivery', route: 'Chennai — Bengaluru', chargeType: 'HANDLING', basis: 'PER_CARTON', quantity: 620, rate: 14, amount: 8_680, allocateTo: 'CUSTOMER', billNo: 'DLV/8841207', billDate: d(7), approvedBy: 'S. Ganapathy', status: 'PAID' },
]

/* ═══════════════════════════ Chart series ════════════════════════════════ */

export const dispatchTrend: DispatchTrendPoint[] = [
  { day: 'Mon', planned: 480, dispatched: 462, delivered: 440 },
  { day: 'Tue', planned: 520, dispatched: 518, delivered: 496 },
  { day: 'Wed', planned: 460, dispatched: 402, delivered: 388 },
  { day: 'Thu', planned: 610, dispatched: 604, delivered: 580 },
  { day: 'Fri', planned: 580, dispatched: 542, delivered: 510 },
  { day: 'Sat', planned: 340, dispatched: 318, delivered: 302 },
  { day: 'Today', planned: 620, dispatched: 184, delivered: 0 },
]

export const regionDispatch: RegionDispatch[] = [
  { region: 'South', cartons: 1_842, weightKg: 14_820, value: 8_940_000, onTimePct: 94.2 },
  { region: 'West', cartons: 620, weightKg: 6_240, value: 3_180_000, onTimePct: 88.6 },
  { region: 'North', cartons: 412, weightKg: 3_960, value: 2_140_000, onTimePct: 91.4 },
  { region: 'East', cartons: 208, weightKg: 1_980, value: 1_020_000, onTimePct: 82.1 },
  { region: 'Export', cartons: 480, weightKg: 16_240, value: 10_824_000, onTimePct: 96.4 },
]

export const transporterScores: TransporterScore[] = [
  { transporter: 'VRL Logistics', trips: 42, onTimePct: 88.1, damagePct: 0.42, avgTransitDays: 1.8, freightPerKg: 8.4 },
  { transporter: 'Sree Logistics', trips: 68, onTimePct: 96.4, damagePct: 0.11, avgTransitDays: 0.5, freightPerKg: 6.2 },
  { transporter: 'TCI Freight', trips: 24, onTimePct: 91.7, damagePct: 0.28, avgTransitDays: 3.2, freightPerKg: 9.1 },
  { transporter: 'Delhivery', trips: 96, onTimePct: 93.8, damagePct: 0.64, avgTransitDays: 2.1, freightPerKg: 11.4 },
  { transporter: 'Own fleet', trips: 118, onTimePct: 98.3, damagePct: 0.04, avgTransitDays: 0.3, freightPerKg: 5.1 },
  { transporter: 'Maersk / CONCOR', trips: 6, onTimePct: 83.3, damagePct: 0.82, avgTransitDays: 29.4, freightPerKg: 22.6 },
]
