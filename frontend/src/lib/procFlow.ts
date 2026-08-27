/**
 * The procure-to-pay chain.
 *
 *   PR ──approve──► RFQ ──invite──► Vendor quotations ──2 or more──►
 *   Comparison ──award──► PO ──approve──► GRN
 *
 * Each stage reads the stage before it rather than asking the user to re-key
 * what the system already knows. These helpers hold the arithmetic and the
 * "what can move forward from here" rules so the screens stay presentation.
 */

import type {
  PrLine,
  PurchaseOrder,
  PurchaseRequisition,
  QuotationLine,
  Rfq,
  RfqLine,
  SupplierQuotation,
} from '@/types/procurement'

/** Standard tax applied through the prototype. */
export const GST_PCT = 18

/**
 * The document types the approval queue handles. Stock adjustments, sales
 * orders and maintenance jobs are approved by their own owners on their own
 * screens; the badge counts and the queue must agree on that, so both read this.
 */
export const APPROVAL_DOC_TYPES = ['PURCHASE_REQUISITION', 'PURCHASE_ORDER']

export function isApprovable(documentType: string) {
  return APPROVAL_DOC_TYPES.includes(documentType)
}

/**
 * The vendor pool RFQs are issued to. In the real system this is the approved
 * vendor list filtered to the item being sourced; here it is one shared list so
 * every stage of the chain names the same vendor by the same identifier.
 */
export const VENDORS: { uid: string; name: string }[] = [
  { uid: 'sup-01', name: 'Jindal Stainless Limited' },
  { uid: 'sup-02', name: 'Chennai Steel Traders' },
  { uid: 'sup-03', name: 'Coatmaster Powder Coatings LLP' },
  { uid: 'sup-04', name: 'Sri Venkateswara Packaging Industries' },
  { uid: 'sup-05', name: 'Perfect Polymers Private Limited' },
  { uid: 'sup-06', name: 'Suraj Polymers LLP' },
  { uid: 'sup-07', name: 'Apex Tooling Works' },
  { uid: 'sup-08', name: 'Kaveri Plastics' },
]

/** Next document number in a series, from the rows already in the collection. */
export function nextDocNo(prefix: string, rows: { docNo: string }[], width = 5) {
  const highest = rows.reduce((max, r) => {
    const n = Number(r.docNo.slice(-width))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return `${prefix}/26-27/${String(highest + 1).padStart(width, '0')}`
}

/* ────────────────────────── PR → RFQ ────────────────────────── */

/** A requisition can be sourced once it is approved and not yet converted. */
export function sourceableRequisitions(prs: PurchaseRequisition[], rfqs: Rfq[]) {
  const used = new Set(rfqs.flatMap((r) => r.prRefs))
  return prs.filter((p) => p.status === 'APPROVED' && !used.has(p.docNo))
}

export function rfqLinesFromPr(pr: PurchaseRequisition): RfqLine[] {
  return pr.lines.map((l: PrLine) => ({
    uid: `rfql-${l.uid}`,
    itemCode: l.itemCode,
    itemName: l.itemName,
    uom: l.uom,
    qty: l.qty,
    requiredBy: l.requiredBy,
    specification: l.specification,
  }))
}

/* ────────────────────── RFQ → vendor quotation ────────────────────── */

/** RFQs still open for quotations. */
export function quotableRfqs(rfqs: Rfq[]) {
  return rfqs.filter((r) => r.status === 'IN_PROGRESS' || r.status === 'PENDING_APPROVAL')
}

/**
 * Only vendors this RFQ was actually sent to may quote against it, and each of
 * them only once. A vendor who has already quoted is offered for revision, not
 * for a second parallel quotation.
 */
export function invitedVendorsAwaitingQuote(rfq: Rfq, quotations: SupplierQuotation[]) {
  const quoted = new Set(quotations.filter((q) => q.rfqNo === rfq.docNo).map((q) => q.supplierUid))
  return rfq.suppliers.filter((s) => !quoted.has(s.supplierUid))
}

/** Landed rate per unit: rate less discount, plus apportioned freight and tax. */
export function landedRate(rate: number, discountPct: number, taxPct: number, freightPerUnit: number) {
  const net = rate * (1 - discountPct / 100)
  return net + freightPerUnit + net * (taxPct / 100)
}

export function quotationTotals(lines: QuotationLine[]) {
  const basicValue = lines.reduce((s, l) => s + l.rate * (1 - l.discountPct / 100) * l.qty, 0)
  const freightValue = lines.reduce((s, l) => s + l.freight, 0)
  const taxValue = lines.reduce((s, l) => s + l.rate * (1 - l.discountPct / 100) * l.qty * (l.taxPct / 100), 0)
  return {
    basicValue,
    freightValue,
    taxValue,
    landedValue: basicValue + freightValue + taxValue,
  }
}

/* ─────────────────── Quotations → comparison ─────────────────── */

/** Comparison needs at least this many quotations before it means anything. */
export const MIN_QUOTES_TO_COMPARE = 2

export function comparableRfqs(rfqs: Rfq[], quotations: SupplierQuotation[]) {
  return rfqs.filter((r) => quotations.filter((q) => q.rfqNo === r.docNo).length >= MIN_QUOTES_TO_COMPARE)
}

export interface ScoredQuotation {
  quotation: SupplierQuotation
  /** 0–100, lower landed value scores higher. */
  priceScore: number
  /** 0–100, shorter lead time scores higher. */
  deliveryScore: number
  /** 0–100, from the supplier's quoted terms. */
  termsScore: number
  totalScore: number
  rank: number
  isBestPrice: boolean
  isBestOverall: boolean
  /** Difference against the cheapest quotation on the table. */
  deltaVsBest: number
  deltaPct: number
}

/**
 * Scores every quotation on an RFQ against the others.
 *
 * Deliberately a ratio against the best value on the table rather than an
 * absolute scale, so a quotation is only ever judged against the alternatives
 * that actually exist.
 */
export function scoreQuotations(
  quotations: SupplierQuotation[],
  weights = { price: 60, delivery: 25, terms: 15 },
): ScoredQuotation[] {
  if (!quotations.length) return []

  const minLanded = Math.min(...quotations.map((q) => q.landedValue))
  const minLead = Math.min(...quotations.map((q) => q.leadTimeDays))
  const maxWarranty = Math.max(...quotations.map((q) => q.warrantyMonths), 1)

  const scored = quotations.map((q) => {
    const priceScore = minLanded > 0 ? (minLanded / q.landedValue) * 100 : 100
    const deliveryScore = q.leadTimeDays > 0 ? (minLead / q.leadTimeDays) * 100 : 100
    const termsScore = (q.warrantyMonths / maxWarranty) * 100
    const totalScore =
      (priceScore * weights.price + deliveryScore * weights.delivery + termsScore * weights.terms) /
      (weights.price + weights.delivery + weights.terms)
    return {
      quotation: q,
      priceScore,
      deliveryScore,
      termsScore,
      totalScore,
      rank: 0,
      isBestPrice: q.landedValue === minLanded,
      isBestOverall: false,
      deltaVsBest: q.landedValue - minLanded,
      deltaPct: minLanded > 0 ? ((q.landedValue - minLanded) / minLanded) * 100 : 0,
    }
  })

  scored.sort((a, b) => b.totalScore - a.totalScore)
  scored.forEach((s, i) => {
    s.rank = i + 1
    s.isBestOverall = i === 0
  })
  return scored
}

/* ────────────────────── Comparison → PO ────────────────────── */

/**
 * A requisition is ready to become an order once its RFQ has an awarded
 * quotation and no order has been raised against it yet.
 */
export function orderableRequisitions(
  prs: PurchaseRequisition[],
  rfqs: Rfq[],
  quotations: SupplierQuotation[],
  orders: PurchaseOrder[],
) {
  const ordered = new Set(orders.flatMap((o) => o.prRefs))
  return prs
    .filter((p) => p.status === 'APPROVED' && !ordered.has(p.docNo))
    .map((pr) => {
      const rfq = rfqs.find((r) => r.prRefs.includes(pr.docNo))
      const award = rfq ? quotations.find((q) => q.rfqNo === rfq.docNo && q.status === 'AWARDED') : undefined
      return { pr, rfq, award }
    })
    .filter((x): x is { pr: PurchaseRequisition; rfq: Rfq; award: SupplierQuotation } => !!x.rfq && !!x.award)
}

/** Turns the awarded quotation's lines into order lines at the quoted rates. */
export function poLinesFromQuotation(q: SupplierQuotation, promisedDate: string): PurchaseOrder['lines'] {
  return q.lines.map((l, i) => {
    const amount = l.rate * (1 - l.discountPct / 100) * l.qty
    const taxAmount = amount * (l.taxPct / 100)
    return {
      uid: `pol-${q.uid}-${i}`,
      itemCode: l.itemCode,
      itemName: l.itemName,
      uom: l.uom,
      qty: l.qty,
      receivedQty: 0,
      rejectedQty: 0,
      billedQty: 0,
      rate: l.rate,
      discountPct: l.discountPct,
      hsn: '—',
      taxPct: l.taxPct,
      amount,
      taxAmount,
      lineTotal: amount + taxAmount,
      dueDate: promisedDate,
      schedules: [],
      qcRequired: true,
    }
  })
}

/* ────────────────────────── PO → GRN ────────────────────────── */

/** Only an approved order can be received against. */
export function receivableOrders(orders: PurchaseOrder[]) {
  return orders.filter(
    (o) => o.status === 'APPROVED' || o.status === 'IN_PROGRESS' || o.status === 'PARTIALLY_EXECUTED',
  )
}
