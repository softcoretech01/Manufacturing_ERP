"""Shared enumerations. Stored in MySQL as VARCHAR + CHECK, never as magic integers."""

from __future__ import annotations

from enum import StrEnum


# ─────────────────────────── Document lifecycle (V0 §10.1) ───────────────────
class DocumentStatus(StrEnum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ON_HOLD = "ON_HOLD"
    IN_PROGRESS = "IN_PROGRESS"
    PARTIALLY_EXECUTED = "PARTIALLY_EXECUTED"
    COMPLETED = "COMPLETED"
    CLOSED = "CLOSED"
    SHORT_CLOSED = "SHORT_CLOSED"
    CANCELLED = "CANCELLED"
    AMENDED = "AMENDED"


TERMINAL_STATUSES = {
    DocumentStatus.COMPLETED,
    DocumentStatus.CLOSED,
    DocumentStatus.CANCELLED,
    DocumentStatus.AMENDED,
    DocumentStatus.SHORT_CLOSED,
}

EDITABLE_STATUSES = {DocumentStatus.DRAFT}


class DocumentAction(StrEnum):
    SUBMIT = "SUBMIT"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    RETURN = "RETURN"
    RECALL = "RECALL"
    HOLD = "HOLD"
    RELEASE = "RELEASE"
    CANCEL = "CANCEL"
    AMEND = "AMEND"
    CLOSE = "CLOSE"
    SHORT_CLOSE = "SHORT_CLOSE"
    REOPEN = "REOPEN"


# ─────────────────────────── IAM ────────────────────────────────────────────
class UserType(StrEnum):
    INTERNAL = "INTERNAL"
    PORTAL_SUPPLIER = "PORTAL_SUPPLIER"
    PORTAL_CUSTOMER = "PORTAL_CUSTOMER"
    SYSTEM = "SYSTEM"
    SHOPFLOOR = "SHOPFLOOR"


class UserStatus(StrEnum):
    PENDING_ACTIVATION = "PENDING_ACTIVATION"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DEACTIVATED = "DEACTIVATED"


class RoleType(StrEnum):
    INTERNAL = "INTERNAL"
    PORTAL = "PORTAL"
    SYSTEM = "SYSTEM"
    AUDIT = "AUDIT"


class PermissionEffect(StrEnum):
    ALLOW = "ALLOW"
    DENY = "DENY"


class ScopeType(StrEnum):
    COMPANY = "COMPANY"
    BRANCH = "BRANCH"
    PLANT = "PLANT"
    WAREHOUSE = "WAREHOUSE"
    COST_CENTRE = "COST_CENTRE"
    DEPARTMENT = "DEPARTMENT"
    TERRITORY = "TERRITORY"


class RowRule(StrEnum):
    ALL = "ALL"
    OWN = "OWN"
    TEAM = "TEAM"
    DEPARTMENT = "DEPARTMENT"
    ASSIGNED_TERRITORY = "ASSIGNED_TERRITORY"


class FieldAccess(StrEnum):
    HIDDEN = "HIDDEN"
    READ_ONLY = "READ_ONLY"
    EDITABLE = "EDITABLE"


class Channel(StrEnum):
    WEB = "WEB"
    MOBILE = "MOBILE"
    API = "API"
    PORTAL = "PORTAL"
    KIOSK = "KIOSK"
    SYSTEM = "SYSTEM"
    IMPORT = "IMPORT"
    JOB = "JOB"
    EMAIL = "EMAIL"


# ─────────────────────────── Audit (V0 §12) ─────────────────────────────────
class AuditAction(StrEnum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    SUBMIT = "SUBMIT"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    RETURN = "RETURN"
    CANCEL = "CANCEL"
    AMEND = "AMEND"
    CLOSE = "CLOSE"
    REOPEN = "REOPEN"
    PRINT = "PRINT"
    EXPORT = "EXPORT"
    DOWNLOAD = "DOWNLOAD"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    LOGIN_FAILED = "LOGIN_FAILED"
    PERMISSION_CHANGE = "PERMISSION_CHANGE"
    CONFIG_CHANGE = "CONFIG_CHANGE"
    UNMASK = "UNMASK"
    IMPERSONATE = "IMPERSONATE"


# ─────────────────────────── Organisation ───────────────────────────────────
class BranchType(StrEnum):
    HEAD_OFFICE = "HEAD_OFFICE"
    FACTORY = "FACTORY"
    DEPOT = "DEPOT"
    SALES_OFFICE = "SALES_OFFICE"
    WAREHOUSE_ONLY = "WAREHOUSE_ONLY"
    SERVICE_CENTRE = "SERVICE_CENTRE"


class WarehouseType(StrEnum):
    RAW_MATERIAL = "RAW_MATERIAL"
    WIP = "WIP"
    FINISHED_GOODS = "FINISHED_GOODS"
    PACKING_MATERIAL = "PACKING_MATERIAL"
    CONSUMABLE_SPARES = "CONSUMABLE_SPARES"
    QUARANTINE = "QUARANTINE"
    REJECT = "REJECT"
    SCRAP = "SCRAP"
    SUBCONTRACTOR = "SUBCONTRACTOR"
    TRANSIT = "TRANSIT"
    RETURN = "RETURN"


class BinType(StrEnum):
    RACK = "RACK"
    PALLET = "PALLET"
    BULK = "BULK"
    COIL_STAND = "COIL_STAND"
    FLOOR = "FLOOR"
    SHELF = "SHELF"
    BIN_BOX = "BIN_BOX"
    TANK = "TANK"
    STAGING = "STAGING"


class BinStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    FULL = "FULL"
    BLOCKED = "BLOCKED"
    UNDER_COUNT = "UNDER_COUNT"
    DAMAGED = "DAMAGED"
    INACTIVE = "INACTIVE"


class DepartmentType(StrEnum):
    PRODUCTION = "PRODUCTION"
    QUALITY = "QUALITY"
    STORES = "STORES"
    PURCHASE = "PURCHASE"
    SALES = "SALES"
    FINANCE = "FINANCE"
    HR = "HR"
    MAINTENANCE = "MAINTENANCE"
    ENGINEERING = "ENGINEERING"
    ADMIN = "ADMIN"
    PPC = "PPC"
    DISPATCH = "DISPATCH"


class CostCentreType(StrEnum):
    PRODUCTION = "PRODUCTION"
    SERVICE = "SERVICE"
    ADMIN = "ADMIN"
    SALES = "SALES"
    QUALITY = "QUALITY"
    MAINTENANCE = "MAINTENANCE"
    UTILITY = "UTILITY"


class FinancialYearStatus(StrEnum):
    FUTURE = "FUTURE"
    OPEN = "OPEN"
    CLOSING = "CLOSING"
    CLOSED = "CLOSED"


class PeriodModule(StrEnum):
    INVENTORY = "INVENTORY"
    PURCHASE = "PURCHASE"
    SALES = "SALES"
    PRODUCTION = "PRODUCTION"
    PAYROLL = "PAYROLL"
    FINANCE = "FINANCE"


class PeriodStatusValue(StrEnum):
    OPEN = "OPEN"
    CLOSING = "CLOSING"
    CLOSED = "CLOSED"


class WorkCentreType(StrEnum):
    MACHINE = "MACHINE"
    LABOUR = "LABOUR"
    ASSEMBLY = "ASSEMBLY"
    SUBCONTRACT = "SUBCONTRACT"
    INSPECTION = "INSPECTION"


class LineType(StrEnum):
    FORMING = "FORMING"
    WELDING = "WELDING"
    VACUUM = "VACUUM"
    COATING = "COATING"
    PRINTING = "PRINTING"
    ASSEMBLY = "ASSEMBLY"
    PACKING = "PACKING"


class RegistrationType(StrEnum):
    GSTIN = "GSTIN"
    IEC = "IEC"
    FACTORY_LICENCE = "FACTORY_LICENCE"
    PCB_CONSENT = "PCB_CONSENT"
    EPF = "EPF"
    ESI = "ESI"
    PT = "PT"
    UDYAM = "UDYAM"
    ISO_9001 = "ISO_9001"
    ISO_14001 = "ISO_14001"
    BIS = "BIS"
    FSSAI = "FSSAI"
    LEGAL_METROLOGY = "LEGAL_METROLOGY"
    TRADE_LICENCE = "TRADE_LICENCE"


class ValuationMethod(StrEnum):
    WEIGHTED_AVG = "WEIGHTED_AVG"
    FIFO = "FIFO"
    STANDARD = "STANDARD"


class ItemType(StrEnum):
    RAW_MATERIAL = "RAW_MATERIAL"
    FINISHED_GOODS = "FINISHED_GOODS"
    WIP = "WIP"
    CONSUMABLE = "CONSUMABLE"
    PACKING = "PACKING"
    SPARE = "SPARE"


class StockStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    QUARANTINE = "QUARANTINE"
    BLOCKED = "BLOCKED"
    REJECTED = "REJECTED"
    IN_TRANSIT = "IN_TRANSIT"
    AT_SUBCONTRACTOR = "AT_SUBCONTRACTOR"
    EXPIRED = "EXPIRED"
    SAMPLE = "SAMPLE"


class MovementDirection(StrEnum):
    IN = "IN"
    OUT = "OUT"


class CountType(StrEnum):
    CYCLE = "CYCLE"
    FULL = "FULL"


class CountStatus(StrEnum):
    COUNTING = "COUNTING"      # created, blind entry in progress
    COUNTED = "COUNTED"        # submitted, variances visible, awaiting approval
    POSTED = "POSTED"          # approved, reconciling movements posted, immutable
    CANCELLED = "CANCELLED"


class RateType(StrEnum):
    BUYING = "BUYING"
    SELLING = "SELLING"
    AVERAGE = "AVERAGE"
    CUSTOMS = "CUSTOMS"


# ─────────────────────────── Numbering (V0 §11) ─────────────────────────────
class ResetFrequency(StrEnum):
    NEVER = "NEVER"
    YEARLY = "YEARLY"
    FINANCIAL_YEARLY = "FINANCIAL_YEARLY"
    MONTHLY = "MONTHLY"
    DAILY = "DAILY"


class AllocateOn(StrEnum):
    DRAFT = "DRAFT"
    APPROVAL = "APPROVAL"


class AllocationStatus(StrEnum):
    ALLOCATED = "ALLOCATED"
    CONSUMED = "CONSUMED"
    VOIDED = "VOIDED"


# ─────────────────────────── Workflow (Ch 4) ────────────────────────────────
class ApproverType(StrEnum):
    ROLE = "ROLE"
    USER = "USER"
    DEPARTMENT_HEAD = "DEPARTMENT_HEAD"
    REPORTING_MANAGER = "REPORTING_MANAGER"
    COST_CENTRE_OWNER = "COST_CENTRE_OWNER"
    PLANT_HEAD = "PLANT_HEAD"
    DYNAMIC_EXPRESSION = "DYNAMIC_EXPRESSION"


class ApprovalMode(StrEnum):
    ANY_ONE = "ANY_ONE"
    ALL = "ALL"
    QUORUM_N = "QUORUM_N"


class EscalationAction(StrEnum):
    NOTIFY_ONLY = "NOTIFY_ONLY"
    NOTIFY_MANAGER = "NOTIFY_MANAGER"
    REASSIGN_TO_ESCALATION_TARGET = "REASSIGN_TO_ESCALATION_TARGET"
    AUTO_APPROVE = "AUTO_APPROVE"
    AUTO_REJECT = "AUTO_REJECT"


class WorkflowInstanceStatus(StrEnum):
    IN_PROGRESS = "IN_PROGRESS"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RETURNED = "RETURNED"
    RECALLED = "RECALLED"
    CANCELLED = "CANCELLED"
    AUTO_APPROVED = "AUTO_APPROVED"


class WorkflowTaskStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RETURNED = "RETURNED"
    REASSIGNED = "REASSIGNED"
    SKIPPED = "SKIPPED"
    EXPIRED = "EXPIRED"
    AUTO_APPROVED = "AUTO_APPROVED"
    CANCELLED = "CANCELLED"
    INFO_REQUESTED = "INFO_REQUESTED"


class WorkflowEventType(StrEnum):
    SUBMITTED = "SUBMITTED"
    ASSIGNED = "ASSIGNED"
    VIEWED = "VIEWED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RETURNED = "RETURNED"
    REASSIGNED = "REASSIGNED"
    ESCALATED = "ESCALATED"
    REMINDED = "REMINDED"
    RECALLED = "RECALLED"
    CANCELLED = "CANCELLED"
    INFO_REQUESTED = "INFO_REQUESTED"
    INFO_PROVIDED = "INFO_PROVIDED"
    AUTO_APPROVED = "AUTO_APPROVED"
    LEVEL_SKIPPED = "LEVEL_SKIPPED"
    LEVEL_COMPLETED = "LEVEL_COMPLETED"


class ConditionType(StrEnum):
    AMOUNT_BAND = "AMOUNT_BAND"
    EXPRESSION = "EXPRESSION"
    ALWAYS = "ALWAYS"


# ─────────────────────────── Notification (Ch 6) ────────────────────────────
class NotificationChannel(StrEnum):
    IN_APP = "IN_APP"
    EMAIL = "EMAIL"
    SMS = "SMS"
    WHATSAPP = "WHATSAPP"
    PUSH = "PUSH"


class NotificationUrgency(StrEnum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class DeliveryStatus(StrEnum):
    QUEUED = "QUEUED"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    READ = "READ"
    FAILED = "FAILED"
    BOUNCED = "BOUNCED"
    SUPPRESSED = "SUPPRESSED"


class RecipientRule(StrEnum):
    USER = "USER"
    ROLE = "ROLE"
    DOCUMENT_CREATOR = "DOCUMENT_CREATOR"
    CURRENT_APPROVER = "CURRENT_APPROVER"
    NEXT_APPROVER = "NEXT_APPROVER"
    SUPPLIER_CONTACT = "SUPPLIER_CONTACT"
    CUSTOMER_CONTACT = "CUSTOMER_CONTACT"
    DEPARTMENT_HEAD = "DEPARTMENT_HEAD"
    REPORTING_MANAGER = "REPORTING_MANAGER"
    MACHINE_OWNER = "MACHINE_OWNER"
    ITEM_PLANNER = "ITEM_PLANNER"
    PLANT_HEAD = "PLANT_HEAD"


# ─────────────────────────── Events / outbox ────────────────────────────────
class OutboxStatus(StrEnum):
    PENDING = "PENDING"
    DISPATCHED = "DISPATCHED"
    FAILED = "FAILED"
    DEAD = "DEAD"


# ─────────────────────────── Jobs ───────────────────────────────────────────
class JobStatus(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


# ─────────────────────────── Attachments / barcode ──────────────────────────
class AttachmentStatus(StrEnum):
    PENDING_UPLOAD = "PENDING_UPLOAD"
    SCANNING = "SCANNING"
    AVAILABLE = "AVAILABLE"
    INFECTED = "INFECTED"
    FAILED = "FAILED"


class CommentVisibility(StrEnum):
    INTERNAL = "INTERNAL"
    EXTERNAL = "EXTERNAL"


class BarcodeSymbology(StrEnum):
    CODE128 = "CODE128"
    CODE39 = "CODE39"
    EAN13 = "EAN13"
    QR = "QR"
    DATAMATRIX = "DATAMATRIX"
    GS1_128 = "GS1_128"
