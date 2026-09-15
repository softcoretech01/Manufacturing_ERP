from pydantic import BaseModel, Field, constr, field_validator
from typing import List, Optional, Union
from datetime import date, datetime


class ProcBase(BaseModel):
    """Base for procurement documents. Stored procedures return SQL NULL for
    unset numeric columns (e.g. receivedQty, discountPct); the schema types them
    as plain float/int with a 0 default, and a bare None would fail response
    validation (422 on read). This coerces None -> 0 for numeric-typed fields so
    reads never 422 on unpopulated numbers, while leaving Optional/str fields as-is.
    """

    @field_validator("*", mode="before")
    @classmethod
    def _null_numeric_to_zero(cls, v, info):
        if v is None:
            ann = cls.model_fields[info.field_name].annotation
            if ann in (float, int):
                return 0
        return v


class PrLineSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    itemCode: str
    itemName: str
    uom: str
    qty: float
    qtyOrdered: float = 0.0
    requiredBy: date
    estimatedRate: float = 0.0            # MySQL DECIMAL NOT NULL — default 0
    costCentre: Optional[str] = None
    suggestedSupplier: Optional[str] = None
    specification: Optional[str] = None

class ApprovalStepSchema(ProcBase):
    level: int
    role: str
    approver: str
    status: str
    actedAt: Optional[datetime] = None
    remarks: Optional[str] = None

class PurchaseRequisitionSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    docNo: Optional[str] = None           # None → SP auto-generates the PR number
    docDate: date
    status: str
    plant: str
    version: int = 1
    remarks: Optional[str] = None
    attachments: int = 0
    comments: int = 0
    source: str
    department: str
    requestedBy: str
    priority: str
    requiredBy: date
    justification: str
    estimatedValue: float = 0.0
    budgetCode: Optional[str] = None
    budgetAvailable: float = 0.0          # MySQL DECIMAL NOT NULL — never send null
    convertedTo: Optional[str] = None
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedAt: Optional[datetime] = None
    lines: List[PrLineSchema] = []
    approvals: List[ApprovalStepSchema] = []

class RfqLineSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    itemCode: str
    itemName: str
    uom: str
    qty: float
    requiredBy: Optional[date] = None
    specification: Optional[str] = None

class RfqSupplierSchema(ProcBase):
    supplierUid: str
    supplierName: str
    invitedAt: Optional[datetime] = None
    respondedAt: Optional[datetime] = None
    responseStatus: Optional[str] = "PENDING"
    quotationUid: Optional[str] = None

class RfqSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    docNo: Optional[str] = None
    docDate: date
    status: Optional[str] = None
    plant: Optional[str] = None
    title: Optional[str] = None
    category: str
    quoteDueBy: date
    buyer: Optional[str] = None
    sealed: bool = True
    currency: str = "INR"
    estimatedValue: float = 0
    awardedTo: Optional[str] = None
    prRefs: Optional[List[str]] = []
    version: int = 1
    remarks: Optional[str] = None
    attachments: int = 0
    comments: int = 0
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedAt: Optional[datetime] = None
    lines: List[RfqLineSchema] = []
    suppliers: List[RfqSupplierSchema] = []
    approvals: List[ApprovalStepSchema] = []

class SupplierQuotationLineSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    itemCode: str
    itemName: str
    uom: str
    qty: float
    rate: float
    discountPct: float = 0
    taxPct: float = 0
    freight: float = 0
    landedRate: float = 0
    leadTimeDays: int = 0
    moq: float = 0
    remarks: Optional[str] = None

class SupplierQuotationSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    docNo: Optional[str] = None
    docDate: date
    rfqNo: str
    supplierUid: str
    supplierName: str
    status: str = "QUOTED"
    currency: str = "INR"
    exchangeRate: float = 1
    validTill: date
    paymentTerms: Optional[str] = None
    deliveryTerms: Optional[str] = None
    warrantyMonths: int = 0
    basicValue: float = 0
    taxValue: float = 0
    freightValue: float = 0
    landedValue: float = 0
    leadTimeDays: int = 0
    technicalScore: float = 0
    commercialScore: float = 0
    totalScore: float = 0
    rank: int = 0
    attachments: int = 0
    negotiationRounds: int = 0
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedAt: Optional[datetime] = None
    lines: List[SupplierQuotationLineSchema] = []

class PoScheduleSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    dueDate: date
    qty: float
    receivedQty: float = 0

class PoLineSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    itemCode: str
    itemName: str
    uom: str
    qty: float
    receivedQty: float = 0
    rejectedQty: float = 0
    billedQty: float = 0
    rate: float
    discountPct: float = 0
    hsn: str
    taxPct: float = 0
    amount: float = 0
    taxAmount: float = 0
    lineTotal: float = 0
    dueDate: date
    qcRequired: bool = False
    schedules: List[PoScheduleSchema] = []

class PoAmendmentChangeSchema(ProcBase):
    field: str
    fromValue: Optional[str] = Field(None, alias='from')
    toValue: Optional[str] = Field(None, alias='to')

class PoAmendmentSchema(ProcBase):
    revision: int
    amendedAt: str
    amendedBy: str
    reason: str
    changes: List[PoAmendmentChangeSchema] = []

class PurchaseOrderSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    docNo: Optional[str] = None
    docDate: date
    status: str
    plant: str
    poType: str
    supplierUid: str
    supplierName: str
    buyer: str
    currency: str = "INR"
    exchangeRate: float = 1
    paymentTerms: str
    deliveryTerms: Optional[str] = None
    incoterm: Optional[str] = None
    deliveryWarehouse: str
    promisedDate: date
    rfqNo: Optional[str] = None
    prRefs: List[str] = []
    contractNo: Optional[str] = None
    basicValue: float = 0
    discountValue: float = 0
    taxValue: float = 0
    freightValue: float = 0
    totalValue: float = 0
    receivedPct: float = 0
    billedPct: float = 0
    acknowledged: bool = False
    acknowledgedAt: Optional[str] = None
    shortCloseReason: Optional[str] = None
    remarks: Optional[str] = None
    version: int = 1
    attachments: int = 0
    comments: int = 0
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedAt: Optional[datetime] = None
    lines: List[PoLineSchema] = []
    amendments: List[PoAmendmentSchema] = []
    approvals: List[ApprovalStepSchema] = []

class GrnLineSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    itemCode: str
    itemName: str
    uom: str
    poQty: float = 0
    challanQty: float = 0
    receivedQty: float = 0
    acceptedQty: float = 0
    rejectedQty: float = 0
    shortQty: float = 0
    excessQty: float = 0
    rate: float = 0
    batchNo: Optional[str] = None
    heatNo: Optional[str] = None
    mfgDate: Optional[date] = None
    expiryDate: Optional[date] = None
    binCode: str = "MAIN"
    qcStatus: str = "NOT_REQUIRED"
    rejectionReason: Optional[str] = None

class GrnSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    docNo: Optional[str] = None          # None → SP auto-generates GRN/26-27/#####
    docDate: date
    status: str
    poNo: str
    asnNo: Optional[str] = None
    supplierUid: str
    supplierName: str
    warehouse: str
    gateEntryNo: str
    gateEntryAt: str
    invoiceNo: constr(max_length=50)
    invoiceDate: date
    invoiceValue: float = 0
    vehicleNo: constr(max_length=20)
    lrNo: str = ""
    receivedBy: str
    qcStatus: str = "PENDING"
    totalReceived: float = 0
    totalAccepted: float = 0
    totalRejected: float = 0
    grnValue: float = 0
    delayDays: int = 0
    version: int = 1
    attachments: int = 0
    comments: int = 0
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedAt: Optional[datetime] = None
    lines: List[GrnLineSchema] = []
    approvals: List[ApprovalStepSchema] = []

class InspectionParameterSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    name: str
    method: str
    spec: str
    observed: str
    result: str
    critical: bool = False

class IncomingInspectionSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    docNo: str
    docDate: date
    grnNo: str
    poNo: str
    supplierUid: str
    supplierName: str
    itemCode: str
    itemName: str
    batchNo: Optional[str] = None
    heatNo: Optional[str] = None
    lotQty: float = 0
    sampleSize: float = 0
    samplingPlan: str = ""
    aql: str = ""
    inspectedBy: str
    status: str = "PENDING"
    acceptedQty: float = 0
    rejectedQty: float = 0
    defectsFound: int = 0
    mtcReceived: bool = False
    mtcVerified: bool = False
    ncrNo: Optional[str] = None
    deviationApprovedBy: Optional[str] = None
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedBy: Optional[str] = None
    modifiedAt: Optional[datetime] = None
    parameters: List[InspectionParameterSchema] = []


# --- Supplier invoice verification (3-way match) ---------------------------------

class SupplierInvoiceLineSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    poLineRef: Optional[int] = None          # PurchaseOrderLine.Id — the invoice bills this exact PO line
    grnNo: Optional[str] = None
    itemCode: str
    itemName: str
    uom: str
    poQty: float = 0
    receivedAcceptedQty: float = 0           # accepted-so-far snapshot, filled by MATCH
    billedQty: float = 0
    poRate: float = 0
    invoiceRate: float = 0
    discountPct: float = 0
    taxPct: float = 0
    amount: float = 0                        # server-computed from the line
    taxAmount: float = 0
    lineTotal: float = 0
    qtyVariancePct: float = 0
    rateVariancePct: float = 0
    matchStatus: str = "NOT_MATCHED"
    exceptionNote: Optional[str] = None
    remarks: Optional[str] = None

class SupplierInvoiceExceptionSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    lineRef: Optional[int] = None
    itemCode: Optional[str] = None
    type: str
    expected: Optional[str] = None
    actual: Optional[str] = None
    variancePct: float = 0
    status: str = "OPEN"
    remarks: Optional[str] = None

class SupplierInvoiceSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    docNo: Optional[str] = None              # None → SP auto-generates PINV/26-27/#####
    docDate: date
    status: str = "DRAFT"
    poNo: str
    supplierUid: str
    supplierName: str
    supplierInvoiceNo: str                   # the vendor's own invoice number
    supplierInvoiceDate: date
    currency: str = "INR"
    exchangeRate: float = 1
    basicValue: float = 0                    # server-computed from the lines
    discountValue: float = 0
    taxValue: float = 0
    freightValue: float = 0
    totalValue: float = 0
    supplierStatedTotal: float = 0
    matchStatus: str = "NOT_MATCHED"
    matchedAt: Optional[datetime] = None
    isBlocked: bool = False
    blockReason: Optional[str] = None
    dueDate: Optional[date] = None
    remarks: Optional[str] = None
    version: int = 1
    attachments: int = 0
    comments: int = 0
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedAt: Optional[datetime] = None
    lines: List[SupplierInvoiceLineSchema] = []
    exceptions: List[SupplierInvoiceExceptionSchema] = []


# --- Purchase return (rejected/damaged material out) -----------------------------

class PurchaseReturnLineSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    grnLineRef: Optional[int] = None         # GrnLine.Id this return draws from
    poLineRef: Optional[int] = None
    itemCode: str
    itemName: str
    uom: str
    batchNo: Optional[str] = None
    heatNo: Optional[str] = None
    rate: float = 0
    returnQty: float = 0
    fromStock: bool = False                  # True → posts an OUT movement; False → rejected-at-GRN, paper only
    stockStatus: str = "AVAILABLE"
    maxReturnable: float = 0
    taxPct: float = 0
    taxableAmount: float = 0
    taxAmount: float = 0
    lineTotal: float = 0
    reasonCode: Optional[str] = None
    remarks: Optional[str] = None

class PurchaseReturnSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    docNo: Optional[str] = None              # None → SP auto-generates PRET/26-27/#####
    docDate: date
    status: str = "DRAFT"
    grnNo: str
    poNo: Optional[str] = None
    supplierUid: str
    supplierName: str
    warehouse: str
    returnType: str = "REJECTION"            # REJECTION|EXCESS|DAMAGE|WRONG_ITEM|QUALITY_FAILURE|EXPIRY
    reasonCode: Optional[str] = None
    disposition: str = "RETURN_TO_SUPPLIER"
    transporterName: Optional[str] = None
    vehicleNo: Optional[str] = None
    ewayBillNo: Optional[str] = None
    ewayBillDate: Optional[date] = None
    replacementExpected: bool = False
    replacementPoNo: Optional[str] = None
    taxableAmount: float = 0                  # server-computed from the lines
    taxAmount: float = 0
    totalAmount: float = 0
    debitNoteId: Optional[int] = None
    debitNoteNo: Optional[str] = None
    stockPostedAt: Optional[datetime] = None
    approvedAt: Optional[datetime] = None
    remarks: Optional[str] = None
    version: int = 1
    attachments: int = 0
    comments: int = 0
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedAt: Optional[datetime] = None
    lines: List[PurchaseReturnLineSchema] = []


# --- Supplier debit note (financial claim on the supplier) -----------------------

class DebitNoteLineSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    itemCode: Optional[str] = None
    itemName: Optional[str] = None
    uom: Optional[str] = None
    quantity: float = 0
    rate: float = 0
    hsnCode: Optional[str] = None
    taxPct: float = 0
    taxableAmount: float = 0
    taxAmount: float = 0
    lineTotal: float = 0
    sourceReference: Optional[str] = None
    remarks: Optional[str] = None

class DebitNoteSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    docNo: Optional[str] = None              # None → SP auto-generates DN/26-27/#####
    docDate: date
    status: str = "DRAFT"
    debitNoteType: str = "GOODS_RETURN"      # GOODS_RETURN|RATE_DIFFERENCE|SHORT_QUANTITY|QUALITY_PENALTY|LATE_DELIVERY_LD|FREIGHT_CLAIM|JOB_WORK_LOSS|OTHER
    supplierUid: str
    supplierName: str
    purchaseReturnId: Optional[int] = None
    returnNo: Optional[str] = None
    grnNo: Optional[str] = None
    poNo: Optional[str] = None
    supplierInvoiceId: Optional[int] = None
    supplierInvoiceNo: Optional[str] = None
    originalInvoiceNo: Optional[str] = None
    isPendingInvoice: bool = False
    reasonCode: Optional[str] = None
    narration: Optional[str] = None
    taxableAmount: float = 0                  # server-computed from the lines
    cgstAmount: float = 0
    sgstAmount: float = 0
    igstAmount: float = 0
    taxAmount: float = 0
    totalAmount: float = 0
    supplierAckStatus: Optional[str] = None
    approvedAt: Optional[datetime] = None
    remarks: Optional[str] = None
    version: int = 1
    attachments: int = 0
    comments: int = 0
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedAt: Optional[datetime] = None
    lines: List[DebitNoteLineSchema] = []


# --- Quotation comparison (scored, persisted; Ch 5) ------------------------------

class ComparisonVendorSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    quotationUid: str
    quotationNo: Optional[str] = None
    supplierUid: Optional[str] = None
    supplierName: Optional[str] = None
    quotationStatus: Optional[str] = None
    landedValue: float = 0                    # incl tax, for display
    comparisonBase: float = 0                 # ex creditable GST, for scoring
    leadTimeDays: int = 0
    priceScore: float = 0
    deliveryScore: float = 0
    qualityScore: float = 0
    totalScore: float = 0
    rank: int = 0
    isRecommended: bool = False
    isAwarded: bool = False
    byItem: Optional[dict] = None             # {itemCode: {rate,taxPct,landedRate,qty,lineTotal}}

class ComparisonSchema(ProcBase):
    uid: Optional[Union[int, str]] = None
    docNo: Optional[str] = None               # None → SP auto-generates CMP/26-27/#####
    docDate: date
    rfqNo: str
    title: Optional[str] = None
    buyer: Optional[str] = None
    weights: Optional[dict] = None            # frozen {price,delivery,quality}
    status: str = "RECOMMENDED"
    recommendedQuotationUid: Optional[str] = None
    recommendedSupplier: Optional[str] = None
    rationale: Optional[str] = None
    highestValue: float = 0
    lowestValue: float = 0
    savingsVsHighest: float = 0
    awardedQuotationUid: Optional[str] = None
    awardedSupplier: Optional[str] = None
    awardValue: float = 0
    deviationReasonCode: Optional[str] = None
    deviationJustification: Optional[str] = None
    remarks: Optional[str] = None
    version: int = 1
    createdBy: Optional[str] = None
    createdAt: Optional[datetime] = None
    modifiedAt: Optional[datetime] = None
    vendors: List[ComparisonVendorSchema] = []
