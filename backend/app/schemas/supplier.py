# Pydantic Schemas for Supplier Master
# File: backend/app/schemas/supplier.py

from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field, field_validator

class SupplierAddressSchema(BaseModel):
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
    isDefault: bool = Field(False)
    isActive: bool = Field(True)

class SupplierContactSchema(BaseModel):
    name: str = Field(..., max_length=100)
    designation: str = Field(..., max_length=50)
    department: str = Field(..., max_length=50)
    email: str = Field(..., max_length=100)
    mobile: str = Field(..., max_length=20)
    landline: str | None = Field(None, max_length=20)
    isPrimary: bool = Field(False)
    purpose: str = Field(..., max_length=20)
    isActive: bool = Field(True)

class SupplierBankAccountSchema(BaseModel):
    bankName: str = Field(..., max_length=100)
    branchName: str = Field(..., max_length=100)
    accountNumber: str = Field(..., max_length=50)
    ifsc: str = Field(..., max_length=20)
    accountType: str = Field(..., max_length=20)
    swift: str | None = Field(None, max_length=20)
    currency: str = Field("INR", max_length=3)
    isPrimary: bool = Field(False)
    isVerified: bool = Field(False)

class SupplierComplianceDocSchema(BaseModel):
    type: str = Field(..., max_length=50)
    documentNo: str = Field(..., max_length=50)
    issuedBy: str = Field(..., max_length=100)
    validFrom: datetime
    validTo: datetime | None = None
    status: str | None = Field(None, max_length=20)
    fileName: str | None = Field(None, max_length=255)

class SupplierRevisionEntrySchema(BaseModel):
    revision: int
    at: datetime
    by: str = Field(..., max_length=100)
    reason: str
    changes: list[Any] = Field(default_factory=list)
    approvedBy: str | None = Field(None, max_length=100)

class SupplierWhereUsedEntrySchema(BaseModel):
    module: str = Field(..., max_length=50)
    documentType: str = Field(..., max_length=50)
    documentNo: str = Field(..., max_length=50)
    status: str = Field(..., max_length=20)
    date: datetime
    isOpen: bool = Field(False)

class SupplierBaseSchema(BaseModel):
    name: str = Field(..., max_length=150)
    shortName: str = Field(..., max_length=50)
    description: str | None = None
    status: str = Field(..., max_length=20)
    effectiveFrom: datetime
    effectiveTo: datetime | None = None
    companyUid: str = Field(..., max_length=26)
    branchUid: str | None = Field(None, max_length=26)
    attachmentCount: int = Field(0)
    commentCount: int = Field(0)
    usageCount: int = Field(0)
    legalName: str = Field(..., max_length=150)
    vendorType: str = Field(..., max_length=20)
    category: str = Field(..., max_length=50)
    gstin: str | None = Field(None, max_length=15)
    gstRegistrationType: str = Field(..., max_length=20)
    pan: str | None = Field(None, max_length=10)
    msmeNumber: str | None = Field(None, max_length=50)
    msmeCategory: str | None = Field(None, max_length=20)
    currency: str = Field("INR", max_length=3)
    paymentTermsCode: str = Field(..., max_length=50)
    creditDays: int = Field(0)
    creditLimit: float = Field(0.00)
    rating: int = Field(0)
    ratingGrade: str = Field("C", max_length=1)
    onTimeDeliveryPct: float = Field(0.00)
    qualityAcceptancePct: float = Field(0.00)
    isBlacklisted: bool = Field(False)
    blacklistReason: str | None = None
    isApprovedVendor: bool = Field(False)
    suppliedCategories: list[str] | None = Field(default_factory=list)

class SupplierCreateSchema(SupplierBaseSchema):
    code: str | None = Field(None, max_length=50)
    revision: int = Field(1)
    addresses: list[SupplierAddressSchema] = Field(default_factory=list)
    contacts: list[SupplierContactSchema] = Field(default_factory=list)
    bankAccounts: list[SupplierBankAccountSchema] = Field(default_factory=list)
    complianceDocs: list[SupplierComplianceDocSchema] = Field(default_factory=list)
    revisions: list[SupplierRevisionEntrySchema] = Field(default_factory=list)
    whereUsed: list[SupplierWhereUsedEntrySchema] = Field(default_factory=list)

class SupplierUpdateSchema(SupplierBaseSchema):
    code: str = Field(..., max_length=50)
    revision: int = Field(...)
    version: int = Field(...)
    addresses: list[SupplierAddressSchema] = Field(default_factory=list)
    contacts: list[SupplierContactSchema] = Field(default_factory=list)
    bankAccounts: list[SupplierBankAccountSchema] = Field(default_factory=list)
    complianceDocs: list[SupplierComplianceDocSchema] = Field(default_factory=list)
    revisions: list[SupplierRevisionEntrySchema] = Field(default_factory=list)
    whereUsed: list[SupplierWhereUsedEntrySchema] = Field(default_factory=list)

class SupplierResponseSchema(SupplierBaseSchema):
    id: int
    code: str = Field(..., max_length=50)
    revision: int
    version: int
    createdBy: str = Field(..., max_length=100)
    createdDate: datetime
    modifiedBy: str = Field(..., max_length=100)
    modifiedDate: datetime
    addresses: list[SupplierAddressSchema] = Field(default_factory=list)
    contacts: list[SupplierContactSchema] = Field(default_factory=list)
    bankAccounts: list[SupplierBankAccountSchema] = Field(default_factory=list)
    complianceDocs: list[SupplierComplianceDocSchema] = Field(default_factory=list)
    revisions: list[SupplierRevisionEntrySchema] = Field(default_factory=list)
    whereUsed: list[SupplierWhereUsedEntrySchema] = Field(default_factory=list)
