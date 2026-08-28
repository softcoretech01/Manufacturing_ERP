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
    taxPct: float = 18
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
    taxPct: float = 18
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
    docNo: str
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
