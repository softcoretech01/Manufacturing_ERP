# Pydantic Schemas for Customer Master (V0-API-002)
# File: backend/app/schemas/customer.py

from __future__ import annotations

import re
from datetime import date as DateVal, datetime
from typing import Any
from pydantic import BaseModel, Field, field_validator


class AddressSchema(BaseModel):
    type: str = Field(..., max_length=20, description="Address type: REGISTERED | BILLING | SHIPPING | WORKS")
    label: str = Field(..., max_length=50, description="Address label/nickname")
    line1: str = Field(..., max_length=150, description="Street address line 1")
    line2: str | None = Field(None, max_length=150, description="Street address line 2")
    city: str = Field(..., max_length=50, description="City")
    state: str = Field(..., max_length=50, description="State/Province")
    stateCode: str | None = Field(None, max_length=10, description="2-digit state code")
    pincode: str = Field(..., max_length=10, description="Postal / Pin code")
    country: str = Field("India", max_length=50, description="Country name")
    gstin: str | None = Field(None, max_length=15, description="Location-specific GSTIN")
    isDefault: bool = Field(False, description="Is default address for type")
    isActive: bool = Field(True, description="Is address active")


class ContactPersonSchema(BaseModel):
    name: str = Field(..., max_length=100, description="Full name of contact person")
    designation: str = Field(..., max_length=50, description="Job title / Designation")
    department: str = Field(..., max_length=50, description="Department name")
    email: str = Field(..., max_length=100, description="Email address")
    mobile: str = Field(..., description="10-digit mobile number")
    landline: str | None = Field(None, max_length=20, description="Optional landline")
    isPrimary: bool = Field(False, description="Is primary contact for customer")
    purpose: str = Field(..., max_length=20, description="Purpose: COMMERCIAL | TECHNICAL | QUALITY | ACCOUNTS | LOGISTICS")
    isActive: bool = Field(True, description="Is contact person active")

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        # Strip common formatting characters (+91, spaces, hyphens) to validate numeric digits
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        if len(digits) != 10:
            raise ValueError("Mobile phone number must contain exactly 10 numeric digits")
        return digits


class BankAccountSchema(BaseModel):
    bankName: str = Field(..., max_length=100, description="Name of bank")
    branchName: str = Field(..., max_length=100, description="Branch location name")
    accountNumber: str = Field(..., max_length=50, description="Bank account number")
    ifsc: str = Field(..., max_length=20, description="IFSC code")
    accountType: str = Field("CURRENT", max_length=20, description="CURRENT | SAVINGS | CC | OD")
    swift: str | None = Field(None, max_length=20, description="SWIFT code (overseas)")
    currency: str = Field("INR", max_length=3, description="Currency of bank account")
    isPrimary: bool = Field(False, description="Is primary bank account")
    isVerified: bool = Field(False, description="Has bank account been penny-drop verified")


class ComplianceDocSchema(BaseModel):
    type: str = Field(..., max_length=100, description="Document certificate type name")
    documentNo: str = Field(..., max_length=50, description="Document or certificate number")
    issuedBy: str = Field(..., max_length=100, description="Issuing authority")
    validFrom: DateVal = Field(..., description="Validity start date")
    validTo: DateVal | None = Field(None, description="Validity end date (null if perpetual)")
    status: str = Field(..., max_length=20, description="VALID | EXPIRING | EXPIRED | MISSING")
    fileName: str | None = Field(None, max_length=150, description="S3 file path key name")


class RevisionChangeSchema(BaseModel):
    field: str = Field(..., description="FieldName that changed")
    old: str | None = Field(None, description="Old value of field")
    new: str | None = Field(None, description="New value of field")


class RevisionEntrySchema(BaseModel):
    revision: int = Field(..., description="Sequential revision increment")
    at: datetime | str = Field(..., description="Timestamp of revision commit")
    by: str = Field(..., max_length=100, description="User who revised")
    reason: str = Field(..., max_length=250, description="Editing justification reason")
    changes: list[RevisionChangeSchema] = Field(default_factory=list, description="Array of specific changes")
    approvedBy: str | None = Field(None, max_length=100, description="Approving manager name")


class WhereUsedEntrySchema(BaseModel):
    module: str = Field(..., max_length=50, description="ERP module name")
    documentType: str = Field(..., max_length=50, description="Transaction document name")
    documentNo: str = Field(..., max_length=50, description="Document sequence number")
    status: str = Field(..., max_length=20, description="Transaction status")
    date: DateVal | str = Field(..., description="Document date")
    isOpen: bool = Field(False, description="Is transaction currently open/pending")


class CustomerBaseSchema(BaseModel):
    name: str = Field(..., max_length=150, description="Trade display name")
    shortName: str = Field(..., max_length=50, description="Short name / alias")
    description: str | None = Field(None, description="General details / notes")
    legalName: str = Field(..., max_length=150, description="Tax registered legal name")
    customerType: str = Field(..., max_length=20, description="DOMESTIC | EXPORT | OEM | DISTRIBUTOR | RETAIL | ECOMMERCE")
    group: str = Field(..., max_length=50, description="Customer group classification")
    category: str = Field("Standard", max_length=50, description="Customer category")
    gstin: str | None = Field(None, max_length=15, description="15-character GSTIN")
    gstRegistrationType: str = Field("UNREGISTERED", max_length=20, description="REGULAR | COMPOSITION | UNREGISTERED | SEZ | OVERSEAS")
    pan: str | None = Field(None, max_length=10, description="10-character PAN")
    currency: str = Field("INR", max_length=3, description="Billing currency code")
    priceListCode: str = Field(..., max_length=50, description="Assigned price list code")
    paymentTermsCode: str = Field(..., max_length=50, description="Assigned payment terms code")
    creditDays: int = Field(0, description="Standard payment delay in days")
    creditLimit: float = Field(0.00, description="Total credit limit amount allowed")
    creditUsed: float = Field(0.00, description="Current credit exposure / balance")
    creditHold: bool = Field(False, description="Is customer placed on credit hold")
    territory: str = Field(..., max_length=100, description="Sales territory/geography")
    salesPerson: str = Field(..., max_length=100, description="Account owner sales manager")
    outstandingAmount: float = Field(0.00, description="Total unpaid invoices amount")
    overdueAmount: float = Field(0.00, description="Past-due unpaid invoices amount")
    status: str = Field("DRAFT", max_length=20, description="ACTIVE | INACTIVE | DRAFT | PENDING_APPROVAL")
    effectiveFrom: datetime | None = Field(None, description="Start date of record validity")
    effectiveTo: datetime | None = Field(None, description="End date of record validity")
    companyUid: str = Field("cmp-01", max_length=26, description="Multi-tenant Company Uid")
    branchUid: str | None = Field(None, max_length=26, description="Optional Branch Uid")
    attachmentCount: int = Field(0, description="Attached documents count")
    commentCount: int = Field(0, description="User comments count")
    usageCount: int = Field(0, description="Document references count")


class CustomerCreateSchema(CustomerBaseSchema):
    code: str | None = Field(None, max_length=50, description="Optional manual code (auto-generated if null)")
    addresses: list[AddressSchema] = Field(default_factory=list)
    contacts: list[ContactPersonSchema] = Field(default_factory=list)
    bankAccounts: list[BankAccountSchema] = Field(default_factory=list)
    complianceDocs: list[ComplianceDocSchema] = Field(default_factory=list)
    revisions: list[RevisionEntrySchema] = Field(default_factory=list)
    whereUsed: list[WhereUsedEntrySchema] = Field(default_factory=list)


class CustomerUpdateSchema(CustomerBaseSchema):
    code: str = Field(..., max_length=50, description="Customer code (read-only / immutable)")
    revision: int = Field(..., description="Last known revision number")
    version: int = Field(..., description="Optimistic locking version number")
    addresses: list[AddressSchema] = Field(default_factory=list)
    contacts: list[ContactPersonSchema] = Field(default_factory=list)
    bankAccounts: list[BankAccountSchema] = Field(default_factory=list)
    complianceDocs: list[ComplianceDocSchema] = Field(default_factory=list)
    revisions: list[RevisionEntrySchema] = Field(default_factory=list)
    whereUsed: list[WhereUsedEntrySchema] = Field(default_factory=list)


class CustomerResponseSchema(CustomerBaseSchema):
    id: int = Field(..., description="Customer internal database Id")
    code: str = Field(..., max_length=50, description="Customer unique sequence code")
    revision: int = Field(..., description="Current revision number")
    version: int = Field(..., description="Current optimistic lock version number")
    createdBy: str = Field(..., max_length=100)
    createdDate: datetime
    modifiedBy: str = Field(..., max_length=100)
    modifiedDate: datetime
    addresses: list[AddressSchema] = Field(default_factory=list)
    contacts: list[ContactPersonSchema] = Field(default_factory=list)
    bankAccounts: list[BankAccountSchema] = Field(default_factory=list)
    complianceDocs: list[ComplianceDocSchema] = Field(default_factory=list)
    revisions: list[RevisionEntrySchema] = Field(default_factory=list)
    whereUsed: list[WhereUsedEntrySchema] = Field(default_factory=list)
