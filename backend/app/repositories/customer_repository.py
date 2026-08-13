# Async Repository interacting with Stored Procedure SpCustomer (V0-REP-001)
# File: backend/app/repositories/customer_repository.py

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import new_uid
from app.schemas.customer import CustomerCreateSchema, CustomerUpdateSchema


class CustomerRepository:
    """Customer repository executing all operations through stored procedure SpCustomer."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_all_customers(self) -> list[dict[str, Any]]:
        # Action: 'LIST'
        stmt = text("""
            CALL SpCustomer(
                'LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.session.execute(stmt)
        rows = result.mappings().all()
        
        customers = []
        for row in rows:
            customers.append(self._parse_row(row))
        return customers

    async def get_customer_by_id(self, id: int) -> dict[str, Any] | None:
        # Action: 'READ'
        stmt = text("""
            CALL SpCustomer(
                'READ', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        result = await self.session.execute(stmt, {"id": id})
        row = result.mappings().first()
        if not row:
            return None
        return self._parse_row(row)

    async def create_customer(self, schema: CustomerCreateSchema, user_id: str) -> dict[str, Any]:
        # Action: 'CREATE'
        code = schema.code
        if not code:
            code = await self._generate_next_code()

        # Serialize list fields to JSON string inputs for Stored Procedure
        addresses_json = json.dumps([a.model_dump(mode='json') for a in schema.addresses])
        contacts_json = json.dumps([c.model_dump(mode='json') for c in schema.contacts])
        bank_accounts_json = json.dumps([b.model_dump(mode='json') for b in schema.bankAccounts])
        compliance_docs_json = json.dumps([d.model_dump(mode='json') for d in schema.complianceDocs])
        revisions_json = json.dumps([r.model_dump(mode='json') for r in schema.revisions])
        where_used_json = json.dumps([w.model_dump(mode='json') for w in schema.whereUsed])

        stmt = text("""
            CALL SpCustomer(
                'CREATE', NULL, :code, :name, :shortName, :description, :status, :effectiveFrom, :effectiveTo, :revision,
                :companyUid, :branchUid, :attachmentCount, :commentCount, :usageCount, :legalName, :customerType,
                :customerGroup, :category, :gstin, :gstRegistrationType, :pan, :currency, :priceListCode,
                :paymentTermsCode, :creditDays, :creditLimit, :creditUsed, :creditHold, :territory, :salesPerson,
                :outstandingAmount, :overdueAmount, 1, :userIdentifier, :addressesJson, :contactsJson, :bankAccountsJson,
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
            "customerType": schema.customerType,
            "customerGroup": schema.group,
            "category": schema.category,
            "gstin": schema.gstin,
            "gstRegistrationType": schema.gstRegistrationType,
            "pan": schema.pan,
            "currency": schema.currency,
            "priceListCode": schema.priceListCode,
            "paymentTermsCode": schema.paymentTermsCode,
            "creditDays": schema.creditDays,
            "creditLimit": schema.creditLimit,
            "creditUsed": schema.creditUsed,
            "creditHold": 1 if schema.creditHold else 0,
            "territory": schema.territory,
            "salesPerson": schema.salesPerson,
            "outstandingAmount": schema.outstandingAmount,
            "overdueAmount": schema.overdueAmount,
            "userIdentifier": user_id,
            "addressesJson": addresses_json,
            "contactsJson": contacts_json,
            "bankAccountsJson": bank_accounts_json,
            "complianceDocsJson": compliance_docs_json,
            "revisionsJson": revisions_json,
            "whereUsedJson": where_used_json
        }

        await self.session.execute(stmt, params)
        # Fetch the generated Id (We might need to parse the NewCustomerId from the result if we want the correct object, or query by Code)
        stmt_id = text("SELECT Id FROM Customer WHERE Code = :code")
        result = await self.session.execute(stmt_id, {"code": code})
        new_id = result.scalar()
        
        customer = await self.get_customer_by_id(new_id)
        if not customer:
            raise RuntimeError("Failed to retrieve customer after creation")
        return customer

    async def update_customer(self, id: int, schema: CustomerUpdateSchema, user_id: str) -> dict[str, Any]:
        # Action: 'UPDATE'
        addresses_json = json.dumps([a.model_dump(mode='json') for a in schema.addresses])
        contacts_json = json.dumps([c.model_dump(mode='json') for c in schema.contacts])
        bank_accounts_json = json.dumps([b.model_dump(mode='json') for b in schema.bankAccounts])
        compliance_docs_json = json.dumps([d.model_dump(mode='json') for d in schema.complianceDocs])
        revisions_json = json.dumps([r.model_dump(mode='json') for r in schema.revisions])
        where_used_json = json.dumps([w.model_dump(mode='json') for w in schema.whereUsed])

        stmt = text("""
            CALL SpCustomer(
                'UPDATE', :id, :code, :name, :shortName, :description, :status, :effectiveFrom, :effectiveTo, :revision,
                :companyUid, :branchUid, :attachmentCount, :commentCount, :usageCount, :legalName, :customerType,
                :customerGroup, :category, :gstin, :gstRegistrationType, :pan, :currency, :priceListCode,
                :paymentTermsCode, :creditDays, :creditLimit, :creditUsed, :creditHold, :territory, :salesPerson,
                :outstandingAmount, :overdueAmount, :version, :userIdentifier, :addressesJson, :contactsJson, :bankAccountsJson,
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
            "effectiveFrom": schema.effectiveFrom or datetime.now(),
            "effectiveTo": schema.effectiveTo,
            "revision": schema.revision + 1,  # Increment revision on update
            "companyUid": schema.companyUid,
            "branchUid": schema.branchUid,
            "attachmentCount": schema.attachmentCount,
            "commentCount": schema.commentCount,
            "usageCount": schema.usageCount,
            "legalName": schema.legalName,
            "customerType": schema.customerType,
            "customerGroup": schema.group,
            "category": schema.category,
            "gstin": schema.gstin,
            "gstRegistrationType": schema.gstRegistrationType,
            "pan": schema.pan,
            "currency": schema.currency,
            "priceListCode": schema.priceListCode,
            "paymentTermsCode": schema.paymentTermsCode,
            "creditDays": schema.creditDays,
            "creditLimit": schema.creditLimit,
            "creditUsed": schema.creditUsed,
            "creditHold": 1 if schema.creditHold else 0,
            "territory": schema.territory,
            "salesPerson": schema.salesPerson,
            "outstandingAmount": schema.outstandingAmount,
            "overdueAmount": schema.overdueAmount,
            "version": schema.version,
            "userIdentifier": user_id,
            "addressesJson": addresses_json,
            "contactsJson": contacts_json,
            "bankAccountsJson": bank_accounts_json,
            "complianceDocsJson": compliance_docs_json,
            "revisionsJson": revisions_json,
            "whereUsedJson": where_used_json
        }

        try:
            await self.session.execute(stmt, params)
        except Exception as e:
            if "CONCURRENT_MODIFICATION_OR_NOT_FOUND" in str(e):
                from app.core.errors import ConcurrentModificationError
                raise ConcurrentModificationError("Customer was modified by another user or does not exist")
            raise e

        customer = await self.get_customer_by_id(id)
        if not customer:
            raise RuntimeError("Failed to retrieve customer after update")
        return customer

    async def delete_customer(self, id: int, user_id: str) -> bool:
        # Action: 'DELETE'
        stmt = text("""
            CALL SpCustomer(
                'DELETE', :id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :userIdentifier, NULL, NULL, NULL, NULL, NULL, NULL
            )
        """)
        await self.session.execute(stmt, {"id": id, "userIdentifier": user_id})
        return True

    async def _generate_next_code(self) -> str:
        stmt = text("SELECT Code FROM Customer ORDER BY Id DESC LIMIT 1")
        result = await self.session.execute(stmt)
        row = result.fetchone()
        if not row:
            return "CUS-00001"
        
        last_code = row[0]
        match = re.match(r"CUS-(\d+)", last_code)
        if match:
            num = int(match.group(1)) + 1
            return f"CUS-{num:05d}"
        
        return f"CUS-{new_uid()[:8]}"

    def _parse_row(self, row: dict[str, Any] | Any) -> dict[str, Any]:
        d = dict(row)
        
        # Parse sub-collections from JSON strings
        for field in ["AddressesJson", "ContactsJson", "BankAccountsJson", "ComplianceDocsJson", "RevisionsJson", "WhereUsedJson"]:
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

        # Remap group
        group_val = d.pop("CustomerGroup", None)
        d["group"] = group_val or ""
        
        # Boolean cast
        d["creditHold"] = bool(d.get("CreditHold", False))

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
            "CustomerType": "customerType",
            "Category": "category",
            "Gstin": "gstin",
            "GstRegistrationType": "gstRegistrationType",
            "Pan": "pan",
            "Currency": "currency",
            "PriceListCode": "priceListCode",
            "PaymentTermsCode": "paymentTermsCode",
            "CreditDays": "creditDays",
            "CreditLimit": "creditLimit",
            "CreditUsed": "creditUsed",
            "CreditHold": "creditHold",
            "Territory": "territory",
            "SalesPerson": "salesPerson",
            "OutstandingAmount": "outstandingAmount",
            "OverdueAmount": "overdueAmount",
            "Version": "version",
            "CreatedBy": "createdBy",
            "CreatedDate": "createdDate",
            "ModifiedBy": "modifiedBy",
            "ModifiedDate": "modifiedDate"
        }

        final_dict = {}
        for db_key, schema_key in mappings.items():
            if db_key in d:
                final_dict[schema_key] = d[db_key]

        # Copy parsed arrays
        for list_key in ["addresses", "contacts", "bankAccounts", "complianceDocs", "revisions", "whereUsed", "group"]:
            if list_key in d:
                final_dict[list_key] = d[list_key]

        return final_dict
