from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import MovementDirection, StockStatus
from app.core.errors import BusinessRuleViolationError, NotFoundError, ValidationFailedError
from app.core.time import utcnow
from app.modules.inventory.application.stock_service import StockService
from app.modules.inventory.infrastructure.models import (
    InvBin,
    InvStockBalance,
    InvStockLedger,
)
from app.modules.inventory.infrastructure.txn_models import (
    InvBatchMaster,
    InvStockTxn,
    InvStockTxnLine,
)
from app.modules.masters.infrastructure.models import MstItem
from app.modules.numbering.application.service import NumberingService
from app.modules.organisation.infrastructure.models import SysWarehouse, SysDepartment

logger = logging.getLogger(__name__)

class TxnDocService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.stock = StockService(session, ctx)
        self.numbering = NumberingService(session, ctx)

    # ─── Resolution & Provisioning Helpers ────────────────────────────────────

    async def _resolve_item(self, item_id: int) -> tuple[int, MstItem, dict[str, Any]]:
        """Resolves the legacy Item table record, and ensures a matching MstItem
        exists in mst_item table (provisioning on-demand).

        Returns: (legacy_id, MstItem, legacy_item_data_dict)
        """
        # 1. Fetch from legacy Item table
        src = (
            await self.session.execute(
                text(
                    "SELECT Id, Code, Name, ItemType, BaseUom, HsnCode, IsBatchTracked, "
                    "       RequiresIncomingInspection, StandardCost, ReorderLevel, "
                    "       MinStock, MaxStock, Category, Status "
                    "  FROM Item WHERE Id = :id AND IFNULL(IsDeleted, 0) = 0 LIMIT 1"
                ),
                {"id": item_id},
            )
        ).fetchone()

        if src is None:
            raise NotFoundError(f"Item with ID {item_id} not found in the Item Master.")

        legacy_data = {
            "id": src[0],
            "code": src[1],
            "name": src[2],
            "item_type": src[3],
            "base_uom": src[4],
            "hsn_code": src[5],
            "is_batch_tracked": bool(src[6]),
            "requires_incoming_inspection": bool(src[7]),
            "standard_cost": src[8],
            "reorder_level": src[9],
            "min_stock": src[10],
            "max_stock": src[11],
            "category": src[12],
            "status": src[13],
        }

        if legacy_data["status"] != "ACTIVE":
            raise ValidationFailedError(
                f"The selected item '{legacy_data['code']}' is currently inactive in the Item Master."
            )

        # 2. Check if MstItem exists
        mst_item = (
            await self.session.execute(
                select(MstItem).where(
                    MstItem.company_id == self.ctx.company_id,
                    MstItem.code == legacy_data["code"],
                    MstItem.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()

        if mst_item is not None:
            if not mst_item.is_active:
                raise ValidationFailedError(
                    f"The selected item '{legacy_data['code']}' is inactive in the Inventory module."
                )
            return item_id, mst_item, legacy_data

        # 3. Provision if not found
        from app.modules.masters.application.item_service import ItemService
        provision_service = ItemService(self.session, self.ctx)

        # Map to proper ItemType enum
        from app.core.enums import ItemType as EnumItemType
        _ITEM_TYPE_MAP = {
            "RAW_MATERIAL": EnumItemType.RAW_MATERIAL.value,
            "FINISHED_GOOD": EnumItemType.FINISHED_GOODS.value,
            "FINISHED_GOODS": EnumItemType.FINISHED_GOODS.value,
            "SEMI_FINISHED": EnumItemType.WIP.value,
            "PACKAGING": EnumItemType.PACKING.value,
            "SPARES": EnumItemType.SPARE.value,
            "CONSUMABLE": EnumItemType.CONSUMABLE.value,
            "CONSUMABLES": EnumItemType.CONSUMABLE.value,
        }
        item_type_val = _ITEM_TYPE_MAP.get(
            (legacy_data["item_type"] or "").upper(), EnumItemType.RAW_MATERIAL.value
        )

        data = {
            "code": legacy_data["code"],
            "name": legacy_data["name"],
            "item_type": item_type_val,
            "base_uom": legacy_data["base_uom"] or "NOS",
            "hsn_code": legacy_data["hsn_code"],
            "is_batch_tracked": legacy_data["is_batch_tracked"],
            "standard_rate": legacy_data["standard_cost"],
            "reorder_level": legacy_data["reorder_level"],
            "min_level": legacy_data["min_stock"],
            "max_level": legacy_data["max_stock"],
            "default_receipt_status": (
                StockStatus.QUARANTINE.value
                if legacy_data["requires_incoming_inspection"]
                else StockStatus.AVAILABLE.value
            ),
        }
        mst_item = await provision_service.create(data)
        # Flush to generate ID
        await self.session.flush()

        return item_id, mst_item, legacy_data

    async def _resolve_warehouse(self, uid: str | None) -> SysWarehouse | None:
        if not uid:
            return None
        wh = (
            await self.session.execute(
                select(SysWarehouse).where(
                    SysWarehouse.uid == uid,
                    SysWarehouse.company_id == self.ctx.company_id,
                    SysWarehouse.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if wh is None:
            raise NotFoundError(f"Warehouse '{uid}' not found.")
        if not wh.is_active:
            raise ValidationFailedError(f"Warehouse '{wh.code}' is inactive.")
        return wh

    async def _resolve_department(self, id_val: int | None) -> SysDepartment | None:
        if not id_val:
            return None
        dept = (
            await self.session.execute(
                select(SysDepartment).where(
                    SysDepartment.id == id_val,
                    SysDepartment.company_id == self.ctx.company_id,
                    SysDepartment.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if dept is None:
            raise NotFoundError(f"Department ID '{id_val}' not found.")
        return dept

    # ─── CRUD Actions ─────────────────────────────────────────────────────────

    async def create_and_post(self, data: dict[str, Any]) -> InvStockTxn:
        """Atomically create and POST a new stock transaction document."""
        from sqlalchemy import select
        
        # 1. Idempotency Check for GRN
        txn_type = data.get("txn_type", "").upper()
        ref_type = data.get("reference_type")
        ref_no = data.get("reference_no")
        
        if txn_type == "STOCK_IN" and ref_type == "GRN" and ref_no:
            existing = (
                await self.session.execute(
                    select(InvStockTxn).where(
                        InvStockTxn.company_id == self.ctx.company_id,
                        InvStockTxn.txn_type == "STOCK_IN",
                        InvStockTxn.reference_type == "GRN",
                        InvStockTxn.reference_no == ref_no,
                        InvStockTxn.status == "POSTED",
                        InvStockTxn.deleted_at.is_(None)
                    )
                )
            ).scalar_one_or_none()
            if existing:
                raise ValidationFailedError(f"Stock has already been added for this GRN ({ref_no}).")

        async with self.session.begin_nested():
            # 2. Create the document
            txn = await self.create_draft(data)
            # 3. Post the document atomically
            posted_txn = await self.post(txn.uid)
            return posted_txn

    async def create_draft(self, data: dict[str, Any]) -> InvStockTxn:
        """Create a new stock transaction document in DRAFT status."""
        txn_type = data["txn_type"].upper()
        if txn_type not in ("STOCK_IN", "STOCK_OUT", "STOCK_RETURN", "STOCK_TRANSFER", "ADJUSTMENT"):
            raise ValidationFailedError(f"Invalid transaction type: {txn_type}")

        src_wh = await self._resolve_warehouse(data.get("src_warehouse_uid"))
        dst_wh = await self._resolve_warehouse(data.get("dst_warehouse_uid"))
        dept = await self._resolve_department(data.get("department_id"))

        # Validation rule: transfer stores must be different
        if txn_type == "STOCK_TRANSFER" and src_wh and dst_wh and src_wh.id == dst_wh.id:
            raise ValidationFailedError("Source Store and Destination Store cannot be the same.")

        txn = InvStockTxn(
            company_id=self.ctx.company_id,
            txn_type=txn_type,
            status="DRAFT",
            txn_date=data["txn_date"],
            src_warehouse_id=src_wh.id if src_wh else None,
            dst_warehouse_id=dst_wh.id if dst_wh else None,
            department_id=dept.id if dept else None,
            issued_to=data.get("issued_to"),
            reference_type=data.get("reference_type"),
            reference_no=data.get("reference_no"),
            remarks=data.get("remarks"),
            created_by=self.ctx.user_id,
            updated_by=self.ctx.user_id,
            created_at=utcnow(),
            updated_at=utcnow(),
            version=1,
        )
        self.session.add(txn)
        await self.session.flush()

        # Add lines
        await self._save_lines(txn, data.get("lines", []))
        return txn

    async def update_transaction(self, uid: str, data: dict[str, Any]) -> InvStockTxn:
        """Update an existing stock transaction document. If POSTED, handles ledger amendment."""
        txn = (
            await self.session.execute(
                select(InvStockTxn).where(
                    InvStockTxn.uid == uid,
                    InvStockTxn.company_id == self.ctx.company_id,
                    InvStockTxn.deleted_at.is_(None),
                ).with_for_update()
            )
        ).scalar_one_or_none()

        if txn is None:
            raise NotFoundError(f"Transaction document '{uid}' not found.")
        
        # If it's cancelled, block it
        if txn.status == "CANCELLED":
            raise ValidationFailedError("Cannot modify a cancelled transaction.")

        was_posted = (txn.status == "POSTED")

        if was_posted:
            # 1. Reverse the existing ledger impact (same as cancel but without changing document status)
            lines = (
                await self.session.execute(
                    select(InvStockTxnLine).where(InvStockTxnLine.txn_id == txn.id)
                )
            ).scalars().all()
            
            reversal_no = f"{txn.document_no}-AMEND"
            for line in lines:
                item_id, mst_item, legacy_data = await self._resolve_item(line.item_id)
                if txn.txn_type == "STOCK_IN":
                    await self.stock.post_movement(
                        item=mst_item, warehouse_id=txn.dst_warehouse_id or txn.src_warehouse_id,
                        direction=MovementDirection.OUT.value, quantity=Decimal(str(line.quantity)),
                        rate=Decimal(str(line.unit_price)), movement_type="REVERSAL",
                        stock_status=StockStatus.AVAILABLE.value, batch_no=line.batch_no,
                        document_type="GRN", document_no=reversal_no, remarks=f"Amend Reversal of {txn.document_no}"
                    )
                elif txn.txn_type == "STOCK_OUT":
                    await self.stock.post_movement(
                        item=mst_item, warehouse_id=txn.src_warehouse_id,
                        direction=MovementDirection.IN.value, quantity=Decimal(str(line.quantity)),
                        rate=Decimal(str(line.unit_price)), movement_type="REVERSAL",
                        stock_status=StockStatus.AVAILABLE.value, batch_no=line.batch_no,
                        document_type="MATERIAL_ISSUE", document_no=reversal_no, remarks=f"Amend Reversal of {txn.document_no}"
                    )
                elif txn.txn_type == "STOCK_RETURN":
                    await self.stock.post_movement(
                        item=mst_item, warehouse_id=txn.dst_warehouse_id or txn.src_warehouse_id,
                        direction=MovementDirection.OUT.value, quantity=Decimal(str(line.quantity)),
                        rate=Decimal(str(line.unit_price)), movement_type="REVERSAL",
                        stock_status=StockStatus.AVAILABLE.value, batch_no=line.batch_no,
                        document_type="MATERIAL_RETURN", document_no=reversal_no, remarks=f"Amend Reversal of {txn.document_no}"
                    )
                elif txn.txn_type == "STOCK_TRANSFER":
                    await self.stock.post_movement(
                        item=mst_item, warehouse_id=txn.src_warehouse_id,
                        direction=MovementDirection.IN.value, quantity=Decimal(str(line.quantity)),
                        rate=Decimal(str(line.unit_price)), movement_type="REVERSAL",
                        stock_status=StockStatus.AVAILABLE.value, batch_no=line.batch_no,
                        document_type="STOCK_TRANSFER", document_no=reversal_no, remarks=f"Amend Reversal of {txn.document_no}"
                    )
                    await self.stock.post_movement(
                        item=mst_item, warehouse_id=txn.dst_warehouse_id,
                        direction=MovementDirection.OUT.value, quantity=Decimal(str(line.quantity)),
                        rate=Decimal(str(line.unit_price)), movement_type="REVERSAL",
                        stock_status=StockStatus.AVAILABLE.value, batch_no=line.batch_no,
                        document_type="STOCK_TRANSFER", document_no=reversal_no, remarks=f"Amend Reversal of {txn.document_no}"
                    )

        src_wh = await self._resolve_warehouse(data.get("src_warehouse_uid"))
        dst_wh = await self._resolve_warehouse(data.get("dst_warehouse_uid"))
        dept = await self._resolve_department(data.get("department_id"))

        if txn.txn_type == "STOCK_TRANSFER" and src_wh and dst_wh and src_wh.id == dst_wh.id:
            raise ValidationFailedError("Source Store and Destination Store cannot be the same.")

        txn.txn_date = data["txn_date"]
        txn.src_warehouse_id = src_wh.id if src_wh else None
        txn.dst_warehouse_id = dst_wh.id if dst_wh else None
        txn.department_id = dept.id if dept else None
        txn.issued_to = data.get("issued_to")
        txn.reference_type = data.get("reference_type")
        txn.reference_no = data.get("reference_no")
        txn.remarks = data.get("remarks")
        txn.updated_at = utcnow()
        txn.updated_by = self.ctx.user_id

        # Replace lines: clear old, insert new
        await self.session.execute(
            text("DELETE FROM inv_stock_txn_line WHERE txn_id = :tid"),
            {"tid": txn.id},
        )
        await self._save_lines(txn, data.get("lines", []))
        
        if was_posted:
            # Temporarily set to DRAFT so post() will run
            txn.status = "DRAFT"
            await self.session.flush()
            return await self.post(uid)
            
        return txn

    async def _save_lines(self, txn: InvStockTxn, lines_data: list[dict[str, Any]]):
        subtotal = Decimal("0")
        tax_total = Decimal("0")

        for line_data in lines_data:
            item_id, mst_item, legacy_data = await self._resolve_item(line_data["item_id"])

            # Batch validation (removed per user request)
            batch_no = (line_data.get("batch_no") or "").strip()

            qty = Decimal(str(line_data["quantity"]))
            price = Decimal(str(line_data.get("unit_price", 0)))
            tax_rate = Decimal(str(line_data.get("tax_rate", 0)))

            line_total = qty * price
            tax_amount = line_total * (tax_rate / Decimal("100"))
            grand_line = line_total + tax_amount

            subtotal += line_total
            tax_total += tax_amount

            line = InvStockTxnLine(
                company_id=self.ctx.company_id,
                txn_id=txn.id,
                item_id=item_id,
                mst_item_id=mst_item.id,
                item_code=legacy_data["code"],
                item_name=legacy_data["name"],
                item_type=legacy_data["item_type"],
                category=legacy_data["category"] or "",
                uom=legacy_data["base_uom"] or "NOS",
                batch_no=batch_no,
                expiry_date=line_data.get("expiry_date"),
                mfg_date=line_data.get("mfg_date"),
                quantity=float(qty),
                unit_price=float(price),
                tax_rate=float(tax_rate),
                tax_amount=float(tax_amount),
                line_total=float(grand_line),
                remarks=line_data.get("remarks"),
                created_by=self.ctx.user_id,
                updated_by=self.ctx.user_id,
                created_at=utcnow(),
                updated_at=utcnow(),
                version=1,
            )
            self.session.add(line)

        txn.subtotal = float(subtotal)
        txn.tax_total = float(tax_total)
        txn.grand_total = float(subtotal + tax_total)
        await self.session.flush()

    # ─── Post (Commit to Inventory) ───────────────────────────────────────────

    async def post(self, uid: str) -> InvStockTxn:
        """Verify stock rules and post the transaction, updating current stock balances."""
        # Row lock on the transaction to prevent race conditions during parallel calls
        txn = (
            await self.session.execute(
                select(InvStockTxn)
                .where(
                    InvStockTxn.uid == uid,
                    InvStockTxn.company_id == self.ctx.company_id,
                    InvStockTxn.deleted_at.is_(None),
                )
                .with_for_update()
            )
        ).scalar_one_or_none()

        if txn is None:
            raise NotFoundError(f"Transaction document '{uid}' not found.")
        if txn.status != "DRAFT":
            raise ValidationFailedError(f"Transaction document is already {txn.status}.")

        # Retrieve all lines
        lines = (
            await self.session.execute(
                select(InvStockTxnLine).where(InvStockTxnLine.txn_id == txn.id)
            )
        ).scalars().all()

        if not lines:
            raise ValidationFailedError("Cannot post a transaction document with no line items.")

        if not txn.document_no:
            # Allocate document number if not set yet
            doc_type_map = {
                "STOCK_IN": "GRN",
                "STOCK_OUT": "MATERIAL_ISSUE",
                "STOCK_RETURN": "MATERIAL_RETURN",
                "STOCK_TRANSFER": "STOCK_TRANSFER",
                "ADJUSTMENT": "STOCK_ADJUSTMENT",
            }
            num_type = doc_type_map[txn.txn_type]
            # Resolve item code for numbering series labels
            alloc = await self.numbering.allocate(
                document_type=num_type,
                entity_type=num_type,
                entity_label=f"{num_type} Document",
            )
            txn.document_no = alloc["number"]

        for line in lines:
            # Re-fetch item to ensure it's still active
            item_id, mst_item, legacy_data = await self._resolve_item(line.item_id)

            # Store mfg/expiry dates metadata in InvBatchMaster if tracked & batch is entered
            if mst_item.is_batch_tracked and line.batch_no:
                await self._save_batch_metadata(
                    mst_item.id,
                    txn.src_warehouse_id or txn.dst_warehouse_id,
                    line.batch_no,
                    line.mfg_date,
                    line.expiry_date,
                )

            # --- STOCK BALANCES VALIDATION (Hard checking) ---
            req_qty = Decimal(str(line.quantity))
            
            if txn.txn_type in ("STOCK_OUT", "STOCK_TRANSFER"):
                # Must check available stock at source warehouse
                if not txn.src_warehouse_id:
                    raise ValidationFailedError("Source Store is required to post this transaction.")
                
                # Fetch available stock using SELECT FOR UPDATE
                batch_filter = line.batch_no.strip() if line.batch_no else ""
                if batch_filter:
                    # Exact batch match
                    stock_bal = (
                        await self.session.execute(
                            select(InvStockBalance)
                            .where(
                                InvStockBalance.company_id == self.ctx.company_id,
                                InvStockBalance.warehouse_id == txn.src_warehouse_id,
                                InvStockBalance.item_id == mst_item.id,
                                InvStockBalance.batch_no == batch_filter,
                                InvStockBalance.stock_status == "AVAILABLE",
                            )
                            .with_for_update()
                        )
                    ).scalar_one_or_none()
                    avail = Decimal(str(stock_bal.quantity)) if stock_bal else Decimal("0")
                else:
                    # No batch specified — sum across ALL batches for this item+warehouse
                    from sqlalchemy import func as sa_func
                    total_row = (
                        await self.session.execute(
                            select(
                                sa_func.coalesce(sa_func.sum(InvStockBalance.quantity), 0)
                            )
                            .where(
                                InvStockBalance.company_id == self.ctx.company_id,
                                InvStockBalance.warehouse_id == txn.src_warehouse_id,
                                InvStockBalance.item_id == mst_item.id,
                                InvStockBalance.stock_status == "AVAILABLE",
                            )
                        )
                    ).scalar()
                    avail = Decimal(str(total_row))

                if avail < req_qty:
                    raise ValidationFailedError(
                        f"Insufficient stock for '{line.item_code}' in selected store. "
                        f"Available: {avail} {line.uom}. Requested: {req_qty} {line.uom}."
                    )

            if txn.txn_type == "STOCK_RETURN":
                # Validate returned quantity <= returnable quantity
                if not txn.reference_no:
                    raise ValidationFailedError("Reference Stock Out number is required for returns.")
                
                # Calculate returnable qty
                returnable_qty = await self.get_returnable_qty(
                    stock_out_no=txn.reference_no,
                    item_id=line.item_id,
                    batch_no=line.batch_no
                )
                if req_qty > returnable_qty:
                    raise ValidationFailedError(
                        f"Return quantity for item '{line.item_code}' cannot exceed the remaining returnable quantity of {returnable_qty} {line.uom}."
                    )

            if txn.txn_type == "STOCK_IN" and txn.reference_type == "GRN" and txn.reference_no:
                # Validate received quantity against remaining PO quantity
                po_row = await self.session.execute(
                    text("SELECT PoNo FROM ERP_Procurement.Grn WHERE DocNo = :grn_no LIMIT 1"),
                    {"grn_no": txn.reference_no}
                )
                po_no = po_row.scalar()
                if po_no:
                    po_id_row = await self.session.execute(
                        text("SELECT Id FROM ERP_Procurement.PurchaseOrder WHERE DocNo = :po_no LIMIT 1"),
                        {"po_no": po_no}
                    )
                    po_id = po_id_row.scalar()
                    if po_id:
                        po_line = await self.session.execute(
                            text("SELECT Id, Qty, IFNULL(ReceivedQty,0) FROM ERP_Procurement.PurchaseOrderLine WHERE PurchaseOrderId = :po_id AND ItemCode = :code LIMIT 1"),
                            {"po_id": po_id, "code": line.item_code}
                        )
                        po_line_row = po_line.fetchone()
                        if po_line_row:
                            ordered = Decimal(str(po_line_row[1]))
                            received = Decimal(str(po_line_row[2]))
                            remaining = ordered - received
                            if req_qty > remaining:
                                raise ValidationFailedError(
                                    f"Cannot receive {req_qty} units of '{line.item_code}'. Only {remaining} units remain on the Purchase Order."
                                )

            # --- APPLY POSTINGS VIA STOCK ENGINE ---
            if txn.txn_type == "STOCK_OUT":
                batch_filter = line.batch_no.strip() if line.batch_no else ""
                allocations = [(batch_filter, Decimal(str(line.quantity)))] if batch_filter else await self._allocate_fifo_batches(
                    txn.src_warehouse_id, mst_item.id, Decimal(str(line.quantity))
                )
                
                for alloc_batch, alloc_qty in allocations:
                    await self.stock.post_movement(
                        item=mst_item,
                        warehouse_id=txn.src_warehouse_id,
                        direction=MovementDirection.OUT.value,
                        quantity=alloc_qty,
                        rate=Decimal(str(line.unit_price)),
                        movement_type="ISSUE",
                        stock_status=StockStatus.AVAILABLE.value,
                        batch_no=alloc_batch,
                        document_type="MATERIAL_ISSUE",
                        document_no=txn.document_no,
                        remarks=txn.remarks,
                    )
            elif txn.txn_type == "STOCK_IN":
                await self.stock.post_movement(
                    item=mst_item,
                    warehouse_id=txn.dst_warehouse_id or txn.src_warehouse_id,
                    direction=MovementDirection.IN.value,
                    quantity=Decimal(str(line.quantity)),
                    rate=Decimal(str(line.unit_price)),
                    movement_type="RECEIPT",
                    stock_status=StockStatus.AVAILABLE.value,
                    batch_no=line.batch_no,
                    document_type="GRN",
                    document_no=txn.document_no,
                    remarks=txn.remarks,
                )
                if txn.reference_type == "GRN" and txn.reference_no:
                    # Update PO Line quantities
                    po_row = await self.session.execute(
                        text("SELECT PoNo FROM ERP_Procurement.Grn WHERE DocNo = :grn_no LIMIT 1"),
                        {"grn_no": txn.reference_no}
                    )
                    po_no = po_row.scalar()
                    if po_no:
                        po_id_row = await self.session.execute(
                            text("SELECT Id FROM ERP_Procurement.PurchaseOrder WHERE DocNo = :po_no LIMIT 1"),
                            {"po_no": po_no}
                        )
                        po_id = po_id_row.scalar()
                        if po_id:
                            # User requirement: Update ReceivedQty. 
                            await self.session.execute(
                                text(
                                    "UPDATE ERP_Procurement.PurchaseOrderLine "
                                    "   SET ReceivedQty = IFNULL(ReceivedQty,0) + :acc, "
                                    "       ModifiedBy = :by, ModifiedDate = CURRENT_TIMESTAMP "
                                    " WHERE PurchaseOrderId = :po_id AND ItemCode = :code"
                                ),
                                {"acc": float(req_qty), "by": self.ctx.user_name or "System", "po_id": po_id, "code": line.item_code}
                            )
            elif txn.txn_type == "STOCK_RETURN":
                await self.stock.post_movement(
                    item=mst_item,
                    warehouse_id=txn.dst_warehouse_id or txn.src_warehouse_id, # return back to store
                    direction=MovementDirection.IN.value,
                    quantity=Decimal(str(line.quantity)),
                    rate=Decimal(str(line.unit_price)),
                    movement_type="RETURN",
                    stock_status=StockStatus.AVAILABLE.value,
                    batch_no=line.batch_no,
                    document_type="MATERIAL_RETURN",
                    document_no=txn.document_no,
                    remarks=txn.remarks,
                )
            elif txn.txn_type == "STOCK_TRANSFER":
                batch_filter = line.batch_no.strip() if line.batch_no else ""
                allocations = [(batch_filter, Decimal(str(line.quantity)))] if batch_filter else await self._allocate_fifo_batches(
                    txn.src_warehouse_id, mst_item.id, Decimal(str(line.quantity))
                )
                
                for alloc_batch, alloc_qty in allocations:
                    # Post transfer out
                    await self.stock.post_movement(
                        item=mst_item,
                        warehouse_id=txn.src_warehouse_id,
                        direction=MovementDirection.OUT.value,
                        quantity=alloc_qty,
                        rate=Decimal(str(line.unit_price)),
                        movement_type="TRANSFER",
                        stock_status=StockStatus.AVAILABLE.value,
                        batch_no=alloc_batch,
                        document_type="STOCK_TRANSFER",
                        document_no=txn.document_no,
                        remarks=f"Transfer to store ID: {txn.dst_warehouse_id}",
                    )
                    # Post transfer in
                    await self.stock.post_movement(
                        item=mst_item,
                        warehouse_id=txn.dst_warehouse_id,
                        direction=MovementDirection.IN.value,
                        quantity=alloc_qty,
                        rate=Decimal(str(line.unit_price)),
                        movement_type="TRANSFER",
                        stock_status=StockStatus.AVAILABLE.value,
                        batch_no=alloc_batch,
                        document_type="STOCK_TRANSFER",
                        document_no=txn.document_no,
                        remarks=f"Transfer from store ID: {txn.src_warehouse_id}",
                    )
            elif txn.txn_type == "ADJUSTMENT":
                # Supports adjustment (IN/OUT)
                direction = MovementDirection.IN.value if line.quantity > 0 else MovementDirection.OUT.value
                await self.stock.post_movement(
                    item=mst_item,
                    warehouse_id=txn.src_warehouse_id or txn.dst_warehouse_id,
                    direction=direction,
                    quantity=abs(Decimal(str(line.quantity))),
                    rate=Decimal(str(line.unit_price)),
                    movement_type="ADJUSTMENT",
                    stock_status=StockStatus.AVAILABLE.value,
                    batch_no=line.batch_no,
                    document_type="STOCK_ADJUSTMENT",
                    document_no=txn.document_no,
                    remarks=txn.remarks,
                )

        # Mark as posted
        txn.status = "POSTED"
        txn.posted_at = utcnow()
        txn.posted_by = self.ctx.user_id
        txn.posted_by_name = self.ctx.user_name or "System"
        txn.updated_at = utcnow()
        txn.updated_by = self.ctx.user_id

        await self.session.flush()

        # Update PO Status if applicable
        if txn.txn_type == "STOCK_IN" and txn.reference_type == "GRN" and txn.reference_no:
            po_row = await self.session.execute(
                text("SELECT PoNo FROM ERP_Procurement.Grn WHERE DocNo = :grn_no LIMIT 1"),
                {"grn_no": txn.reference_no}
            )
            po_no = po_row.scalar()
            if po_no:
                po_id_row = await self.session.execute(
                    text("SELECT Id FROM ERP_Procurement.PurchaseOrder WHERE DocNo = :po_no LIMIT 1"),
                    {"po_no": po_no}
                )
                po_id = po_id_row.scalar()
                if po_id:
                    totals = (
                        await self.session.execute(
                            text(
                                "SELECT IFNULL(SUM(Qty),0), IFNULL(SUM(IFNULL(ReceivedQty,0)),0) "
                                "  FROM ERP_Procurement.PurchaseOrderLine WHERE PurchaseOrderId = :po"
                            ),
                            {"po": po_id},
                        )
                    ).fetchone()
                    if totals:
                        ordered = Decimal(str(totals[0] if totals[0] else 0))
                        received = Decimal(str(totals[1] if totals[1] else 0))
                        pct = float(received / ordered * 100) if ordered > 0 else 0.0
                        status = "FULLY_RECEIVED" if ordered > 0 and received >= ordered else "PARTIALLY_RECEIVED"

                        await self.session.execute(
                            text(
                                "UPDATE ERP_Procurement.PurchaseOrder "
                                "   SET Status = :st, ReceivedPct = :pct, "
                                "       ModifiedBy = :by, ModifiedDate = CURRENT_TIMESTAMP "
                                " WHERE Id = :id"
                            ),
                            {"st": status, "pct": round(pct, 2),
                             "by": self.ctx.user_name or "System", "id": po_id},
                        )

        return txn

    async def _save_batch_metadata(
        self, mst_item_id: int, wh_id: int | None, batch_no: str, mfg_date: date | None, expiry_date: date | None
    ):
        if not wh_id:
            return
        # Check if already exists
        exists = (
            await self.session.execute(
                select(InvBatchMaster).where(
                    InvBatchMaster.company_id == self.ctx.company_id,
                    InvBatchMaster.mst_item_id == mst_item_id,
                    InvBatchMaster.warehouse_id == wh_id,
                    InvBatchMaster.batch_no == batch_no,
                )
            )
        ).scalar_one_or_none()

        if exists:
            exists.mfg_date = mfg_date
            exists.expiry_date = expiry_date
        else:
            meta = InvBatchMaster(
                company_id=self.ctx.company_id,
                mst_item_id=mst_item_id,
                warehouse_id=wh_id,
                batch_no=batch_no,
                mfg_date=mfg_date,
                expiry_date=expiry_date,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
            self.session.add(meta)

    # ─── Reversal / Cancellation ──────────────────────────────────────────────

    async def cancel(self, uid: str) -> InvStockTxn:
        """Cancel/Reverse an already POSTED transaction document."""
        txn = (
            await self.session.execute(
                select(InvStockTxn)
                .where(
                    InvStockTxn.uid == uid,
                    InvStockTxn.company_id == self.ctx.company_id,
                    InvStockTxn.deleted_at.is_(None),
                )
                .with_for_update()
            )
        ).scalar_one_or_none()

        if txn is None:
            raise NotFoundError(f"Transaction document '{uid}' not found.")
        if txn.status != "POSTED":
            raise ValidationFailedError("Only posted transaction documents can be cancelled.")

        # Re-check numbering
        alloc = await self.numbering.allocate(
            document_type=txn.txn_type,
            entity_type=txn.txn_type,
            entity_label=f"REVERSAL OF {txn.document_no}",
        )
        reversal_no = alloc["number"]

        # Loop lines and reverse
        lines = (
            await self.session.execute(
                select(InvStockTxnLine).where(InvStockTxnLine.txn_id == txn.id)
            )
        ).scalars().all()

        for line in lines:
            item_id, mst_item, legacy_data = await self._resolve_item(line.item_id)

            if txn.txn_type == "STOCK_IN":
                # Original: IN. Reversal: OUT.
                await self.stock.post_movement(
                    item=mst_item,
                    warehouse_id=txn.dst_warehouse_id or txn.src_warehouse_id,
                    direction=MovementDirection.OUT.value,
                    quantity=Decimal(str(line.quantity)),
                    rate=Decimal(str(line.unit_price)),
                    movement_type="REVERSAL",
                    stock_status=StockStatus.AVAILABLE.value,
                    batch_no=line.batch_no,
                    document_type="GRN",
                    document_no=reversal_no,
                    remarks=f"Reversal of {txn.document_no}",
                )
            elif txn.txn_type == "STOCK_OUT":
                # Original: OUT. Reversal: IN.
                await self.stock.post_movement(
                    item=mst_item,
                    warehouse_id=txn.src_warehouse_id,
                    direction=MovementDirection.IN.value,
                    quantity=Decimal(str(line.quantity)),
                    rate=Decimal(str(line.unit_price)),
                    movement_type="REVERSAL",
                    stock_status=StockStatus.AVAILABLE.value,
                    batch_no=line.batch_no,
                    document_type="MATERIAL_ISSUE",
                    document_no=reversal_no,
                    remarks=f"Reversal of {txn.document_no}",
                )
            elif txn.txn_type == "STOCK_RETURN":
                # Original: IN. Reversal: OUT.
                await self.stock.post_movement(
                    item=mst_item,
                    warehouse_id=txn.dst_warehouse_id or txn.src_warehouse_id,
                    direction=MovementDirection.OUT.value,
                    quantity=Decimal(str(line.quantity)),
                    rate=Decimal(str(line.unit_price)),
                    movement_type="REVERSAL",
                    stock_status=StockStatus.AVAILABLE.value,
                    batch_no=line.batch_no,
                    document_type="MATERIAL_RETURN",
                    document_no=reversal_no,
                    remarks=f"Reversal of {txn.document_no}",
                )
            elif txn.txn_type == "STOCK_TRANSFER":
                # Original: From(OUT) → To(IN)
                # Reversal: To(OUT) → From(IN)
                await self.stock.post_movement(
                    item=mst_item,
                    warehouse_id=txn.dst_warehouse_id,
                    direction=MovementDirection.OUT.value,
                    quantity=Decimal(str(line.quantity)),
                    rate=Decimal(str(line.unit_price)),
                    movement_type="REVERSAL",
                    stock_status=StockStatus.AVAILABLE.value,
                    batch_no=line.batch_no,
                    document_type="STOCK_TRANSFER",
                    document_no=reversal_no,
                    remarks=f"Reversal of {txn.document_no}",
                )
                await self.stock.post_movement(
                    item=mst_item,
                    warehouse_id=txn.src_warehouse_id,
                    direction=MovementDirection.IN.value,
                    quantity=Decimal(str(line.quantity)),
                    rate=Decimal(str(line.unit_price)),
                    movement_type="REVERSAL",
                    stock_status=StockStatus.AVAILABLE.value,
                    batch_no=line.batch_no,
                    document_type="STOCK_TRANSFER",
                    document_no=reversal_no,
                    remarks=f"Reversal of {txn.document_no}",
                )

        txn.status = "CANCELLED"
        txn.remarks = f"CANCELLED - Reversal Doc: {reversal_no}. Original Remarks: {txn.remarks or ''}"
        txn.updated_at = utcnow()
        txn.updated_by = self.ctx.user_id

        await self.session.flush()
        return txn

    async def delete(self, uid: str) -> None:
        """Delete a transaction document (DRAFT status only)."""
        txn = (
            await self.session.execute(
                select(InvStockTxn).where(
                    InvStockTxn.uid == uid,
                    InvStockTxn.company_id == self.ctx.company_id,
                    InvStockTxn.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()

        if txn is None:
            raise NotFoundError(f"Transaction document '{uid}' not found.")
        if txn.status != "DRAFT":
            raise ValidationFailedError(
                f"This document is already {txn.status} and cannot be deleted. Use reversal instead."
            )

        # Delete header and lines
        await self.session.execute(
            text("DELETE FROM inv_stock_txn_line WHERE txn_id = :tid"),
            {"tid": txn.id},
        )
        await self.session.execute(
            text("DELETE FROM inv_stock_txn WHERE id = :id"),
            {"id": txn.id},
        )
        await self.session.flush()

    # ─── Returnable Qty Calculation Helper ────────────────────────────────────

    async def _allocate_fifo_batches(self, warehouse_id: int, item_id: int, req_qty: Decimal) -> list[tuple[str, Decimal]]:
        stmt = (
            select(InvStockBalance.batch_no, InvStockBalance.quantity)
            .where(
                InvStockBalance.company_id == self.ctx.company_id,
                InvStockBalance.warehouse_id == warehouse_id,
                InvStockBalance.item_id == item_id,
                InvStockBalance.stock_status == StockStatus.AVAILABLE.value,
                InvStockBalance.quantity > 0
            )
            .order_by(InvStockBalance.created_at)
        )
        rows = (await self.session.execute(stmt)).all()
        
        allocations = []
        rem_qty = req_qty
        for row in rows:
            b_no = row[0]
            b_qty = Decimal(str(row[1]))
            take = min(b_qty, rem_qty)
            if take > 0:
                allocations.append((b_no, take))
                rem_qty -= take
            if rem_qty <= 0:
                break
                
        if rem_qty > 0:
            allocations.append(("", rem_qty))
            
        return allocations


    async def get_returnable_qty(self, stock_out_no: str, item_id: int, batch_no: str) -> Decimal:
        """Calculate the remaining quantity that can be returned for a specific Stock Out transaction line."""
        # Find original Stock Out document
        out_doc = (
            await self.session.execute(
                select(InvStockTxn).where(
                    InvStockTxn.document_no == stock_out_no,
                    InvStockTxn.txn_type == "STOCK_OUT",
                    InvStockTxn.company_id == self.ctx.company_id,
                    InvStockTxn.deleted_at.is_(None)
                )
            )
        ).scalar_one_or_none()

        if not out_doc:
            raise ValidationFailedError(f"Reference Stock Out document '{stock_out_no}' not found or is invalid.")

        # Find line
        line = (
            await self.session.execute(
                select(InvStockTxnLine).where(
                    InvStockTxnLine.txn_id == out_doc.id,
                    InvStockTxnLine.item_id == item_id,
                    InvStockTxnLine.batch_no == batch_no
                )
            )
        ).scalar_one_or_none()

        if not line:
            # Look up item code for better error message
            item = await self.session.get(MstItem, item_id)
            code = item.code if item else str(item_id)
            batch_msg = f" with batch '{batch_no}'" if batch_no else " (without a batch)"
            raise ValidationFailedError(f"Item '{code}'{batch_msg} was not found in Stock Out document '{stock_out_no}'.")

        issued_qty = Decimal(str(line.quantity))

        # Sum up previously returned quantities referencing this Stock Out doc
        ret_sum = (
            await self.session.execute(
                select(text("COALESCE(SUM(l.quantity), 0)"))
                .select_from(text("inv_stock_txn t"))
                .join(text("inv_stock_txn_line l"), text("t.id = l.txn_id"))
                .where(
                    text("t.reference_no = :ref_no AND t.txn_type = 'STOCK_RETURN' AND l.item_id = :item_id AND l.batch_no = :batch AND t.status = 'POSTED'")
                ),
                {"ref_no": stock_out_no, "item_id": item_id, "batch": batch_no}
            )
        ).scalar() or 0

        returnable = issued_qty - Decimal(str(ret_sum))
        return max(returnable, Decimal("0"))
