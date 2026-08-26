# File: backend/app/repositories/supplier_repository.py

import json
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.supplier import (
    SupplierCreateSchema,
    SupplierUpdateSchema,
)

class SupplierRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all_suppliers(self) -> list[dict[str, Any]]:
        stmt = text("""
            CALL SpSupplier(
                'LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.session.execute(stmt)
        rows = result.mappings().all()

        suppliers = []
        for row in rows:
            suppliers.append(self._parse_row(row))
        return suppliers

    async def get_supplier_by_id(self, id: int) -> dict[str, Any] | None:
        stmt = text("""
            CALL SpSupplier(
                'READ', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.session.execute(stmt, {"id": id})
        row = result.mappings().first()

        if not row:
            return None
        return self._parse_row(row)

    async def _generate_next_code(self) -> str:
        stmt = text("SELECT Code FROM Supplier ORDER BY Id DESC LIMIT 1")
        result = await self.session.execute(stmt)
        last_code = result.scalar()

        if last_code and last_code.startswith("SUP-"):
            try:
                num = int(last_code.split("-")[1])
                return f"SUP-{num + 1:05d}"
            except ValueError:
                pass
        return "SUP-00001"

    def _parse_row(self, row: dict[str, Any] | Any) -> dict[str, Any]:
        d = dict(row)
        
        # Parse sub-collections from JSON strings
        for field in ["AddressesJson", "ContactsJson", "BankAccountsJson", "ComplianceDocsJson", "RevisionsJson", "WhereUsedJson", "SuppliedCategories"]:
            raw_val = d.pop(field, None)
            parsed_key = field.replace("Json", "")
            parsed_key = parsed_key[0].lower() + parsed_key[1:]
            
            if not raw_val:
                d[parsed_key] = []
            elif isinstance(raw_val, str):
                try:
                    d[parsed_key] = json.loads(raw_val)
                except json.JSONDecodeError:
                    d[parsed_key] = []
            elif isinstance(raw_val, (list, dict)):
                d[parsed_key] = raw_val
            else:
                d[parsed_key] = []

        # Boolean casts
        for field in ["IsBlacklisted", "IsApprovedVendor"]:
            d[field] = bool(d.get(field, False))

        # Schema property remapping dictionary (PascalCase DB -> camelCase Schema)
        mappings = {
            "Id": "id",
            "Code": "code",
            "Name": "name",
            "ShortName": "shortName",
            "Description": "description",
            "Status": "status",
            "EffectiveFrom": "effectiveFrom",
            "EffectiveTo": "effectiveTo",
            "Revision": "revision",
            "CompanyUid": "companyUid",
            "BranchUid": "branchUid",
            "AttachmentCount": "attachmentCount",
            "CommentCount": "commentCount",
            "UsageCount": "usageCount",
            "LegalName": "legalName",
            "VendorType": "vendorType",
            "Category": "category",
            "Gstin": "gstin",
            "GstRegistrationType": "gstRegistrationType",
            "Pan": "pan",
            "MsmeNumber": "msmeNumber",
            "MsmeCategory": "msmeCategory",
            "Currency": "currency",
            "PaymentTermsCode": "paymentTermsCode",
            "CreditDays": "creditDays",
            "CreditLimit": "creditLimit",
            "Rating": "rating",
            "RatingGrade": "ratingGrade",
            "OnTimeDeliveryPct": "onTimeDeliveryPct",
            "QualityAcceptancePct": "qualityAcceptancePct",
            "IsBlacklisted": "isBlacklisted",
            "BlacklistReason": "blacklistReason",
            "IsApprovedVendor": "isApprovedVendor",
            "Version": "version",
            "CreatedBy": "createdBy",
            "CreatedDate": "createdDate",
            "ModifiedBy": "modifiedBy",
            "ModifiedDate": "modifiedDate",
        }

        # Remap keys
        result = {}
        for db_key, schema_key in mappings.items():
            if db_key in d:
                result[schema_key] = d[db_key]

        # Copy parsed collections
        result["suppliedCategories"] = d.get("suppliedCategories", [])
        result["addresses"] = d.get("addresses", [])
        result["contacts"] = d.get("contacts", [])
        result["bankAccounts"] = d.get("bankAccounts", [])
        result["complianceDocs"] = d.get("complianceDocs", [])
        result["revisions"] = d.get("revisions", [])
        result["whereUsed"] = d.get("whereUsed", [])

        return result

    async def create_supplier(self, schema: SupplierCreateSchema, user_id: str) -> dict[str, Any]:
        code = schema.code
        if not code:
            code = await self._generate_next_code()

        addresses_json = json.dumps([a.model_dump(mode='json') for a in schema.addresses])
        contacts_json = json.dumps([c.model_dump(mode='json') for c in schema.contacts])
        bank_accounts_json = json.dumps([b.model_dump(mode='json') for b in schema.bankAccounts])
        compliance_docs_json = json.dumps([d.model_dump(mode='json') for d in schema.complianceDocs])
        revisions_json = json.dumps([r.model_dump(mode='json') for r in schema.revisions])
        where_used_json = json.dumps([w.model_dump(mode='json') for w in schema.whereUsed])

        stmt = text("""
            CALL SpSupplier(
                'CREATE', NULL, :code, :name, :shortName, :description, :status, :effectiveFrom, :effectiveTo, :revision,
                :companyUid, :branchUid, :attachmentCount, :commentCount, :usageCount, :legalName, :vendorType, :category,
                :gstin, :gstRegistrationType, :pan, :msmeNumber, :msmeCategory, :currency, :paymentTermsCode,
                :creditDays, :creditLimit, :rating, :ratingGrade, :onTimeDeliveryPct, :qualityAcceptancePct,
                :isBlacklisted, :blacklistReason, :isApprovedVendor, :suppliedCategories,
                1, :userIdentifier, :addressesJson, :contactsJson, :bankAccountsJson,
                :complianceDocsJson, :revisionsJson, :whereUsedJson
            )
        """)

        params = {
            "code": code,
            "name": schema.name,
            "shortName": schema.shortName,
            "description": schema.description or "",
            "status": schema.status,
            "effectiveFrom": schema.effectiveFrom or datetime.now(),
            "effectiveTo": schema.effectiveTo,
            "revision": 1,
            "companyUid": schema.companyUid,
            "branchUid": schema.branchUid,
            "attachmentCount": schema.attachmentCount,
            "commentCount": schema.commentCount,
            "usageCount": schema.usageCount,
            "legalName": schema.legalName,
            "vendorType": schema.vendorType,
            "category": schema.category,
            "gstin": schema.gstin,
            "gstRegistrationType": schema.gstRegistrationType,
            "pan": schema.pan,
            "msmeNumber": schema.msmeNumber,
            "msmeCategory": schema.msmeCategory,
            "currency": schema.currency,
            "paymentTermsCode": schema.paymentTermsCode,
            "creditDays": schema.creditDays,
            "creditLimit": schema.creditLimit,
            "rating": schema.rating,
            "ratingGrade": schema.ratingGrade,
            "onTimeDeliveryPct": schema.onTimeDeliveryPct,
            "qualityAcceptancePct": schema.qualityAcceptancePct,
            "isBlacklisted": 1 if schema.isBlacklisted else 0,
            "blacklistReason": schema.blacklistReason,
            "isApprovedVendor": 1 if schema.isApprovedVendor else 0,
            "suppliedCategories": json.dumps(schema.suppliedCategories) if schema.suppliedCategories else None,
            "userIdentifier": user_id,
            "addressesJson": addresses_json,
            "contactsJson": contacts_json,
            "bankAccountsJson": bank_accounts_json,
            "complianceDocsJson": compliance_docs_json,
            "revisionsJson": revisions_json,
            "whereUsedJson": where_used_json
        }

        await self.session.execute(stmt, params)
        
        stmt_id = text("SELECT Id FROM Supplier WHERE Code = :code")
        result = await self.session.execute(stmt_id, {"code": code})
        new_id = result.scalar()
        
        sup = await self.get_supplier_by_id(new_id)
        if not sup:
            raise RuntimeError("Failed to retrieve supplier after creation")
        return sup

    async def update_supplier(self, id: int, schema: SupplierUpdateSchema, user_id: str) -> dict[str, Any]:
        addresses_json = json.dumps([a.model_dump(mode='json') for a in schema.addresses])
        contacts_json = json.dumps([c.model_dump(mode='json') for c in schema.contacts])
        bank_accounts_json = json.dumps([b.model_dump(mode='json') for b in schema.bankAccounts])
        compliance_docs_json = json.dumps([d.model_dump(mode='json') for d in schema.complianceDocs])
        revisions_json = json.dumps([r.model_dump(mode='json') for r in schema.revisions])
        where_used_json = json.dumps([w.model_dump(mode='json') for w in schema.whereUsed])

        stmt = text("""
            CALL SpSupplier(
                'UPDATE', :id, :code, :name, :shortName, :description, :status, :effectiveFrom, :effectiveTo, :revision,
                :companyUid, :branchUid, :attachmentCount, :commentCount, :usageCount, :legalName, :vendorType, :category,
                :gstin, :gstRegistrationType, :pan, :msmeNumber, :msmeCategory, :currency, :paymentTermsCode,
                :creditDays, :creditLimit, :rating, :ratingGrade, :onTimeDeliveryPct, :qualityAcceptancePct,
                :isBlacklisted, :blacklistReason, :isApprovedVendor, :suppliedCategories,
                :version, :userIdentifier, :addressesJson, :contactsJson, :bankAccountsJson,
                :complianceDocsJson, :revisionsJson, :whereUsedJson
            )
        """)

        params = {
            "id": id,
            "code": schema.code,
            "name": schema.name,
            "shortName": schema.shortName,
            "description": schema.description or "",
            "status": schema.status,
            "effectiveFrom": schema.effectiveFrom,
            "effectiveTo": schema.effectiveTo,
            "revision": schema.revision,
            "companyUid": schema.companyUid,
            "branchUid": schema.branchUid,
            "attachmentCount": schema.attachmentCount,
            "commentCount": schema.commentCount,
            "usageCount": schema.usageCount,
            "legalName": schema.legalName,
            "vendorType": schema.vendorType,
            "category": schema.category,
            "gstin": schema.gstin,
            "gstRegistrationType": schema.gstRegistrationType,
            "pan": schema.pan,
            "msmeNumber": schema.msmeNumber,
            "msmeCategory": schema.msmeCategory,
            "currency": schema.currency,
            "paymentTermsCode": schema.paymentTermsCode,
            "creditDays": schema.creditDays,
            "creditLimit": schema.creditLimit,
            "rating": schema.rating,
            "ratingGrade": schema.ratingGrade,
            "onTimeDeliveryPct": schema.onTimeDeliveryPct,
            "qualityAcceptancePct": schema.qualityAcceptancePct,
            "isBlacklisted": 1 if schema.isBlacklisted else 0,
            "blacklistReason": schema.blacklistReason,
            "isApprovedVendor": 1 if schema.isApprovedVendor else 0,
            "suppliedCategories": json.dumps(schema.suppliedCategories) if schema.suppliedCategories else None,
            "version": schema.version,
            "userIdentifier": user_id,
            "addressesJson": addresses_json,
            "contactsJson": contacts_json,
            "bankAccountsJson": bank_accounts_json,
            "complianceDocsJson": compliance_docs_json,
            "revisionsJson": revisions_json,
            "whereUsedJson": where_used_json
        }

        await self.session.execute(stmt, params)
        
        sup = await self.get_supplier_by_id(id)
        if not sup:
            raise RuntimeError("Failed to retrieve supplier after update")
        return sup

    async def delete_supplier(self, id: int, user_id: str) -> None:
        stmt = text("""
            CALL SpSupplier(
                'DELETE', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :userIdentifier, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        await self.session.execute(stmt, {"id": id, "userIdentifier": user_id})
