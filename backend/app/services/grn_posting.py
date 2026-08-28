"""GRN posting — the bridge that turns a received document into real stock.

This is the one authoritative stock-posting path for procurement. A GRN posts
inventory here and nowhere else, so stock can never be double-counted:

    validate PO  →  validate lines  →  post IN movements  →  roll quantities
    back onto the PO  →  mark the GRN POSTED

Everything runs inside the caller's request session, so the whole sequence is a
single transaction: if any step raises, the GRN, the stock ledger and the PO
roll back together and no half-received document survives.

Two deliberate decisions are encoded here:

* **Only accepted quantity becomes stock.** Rejected quantity is recorded on the
  GRN and rolled onto the PO line's ``RejectedQty``, but never enters the ledger —
  it stays with the supplier pending a debit note. Accepted quantity lands at the
  item's ``default_receipt_status`` (AVAILABLE, or QUARANTINE when the item is
  inspection-gated), which is what that master field exists for.
* **The two item masters are bridged, not merged.** Procurement picks items from
  the ``Item`` master (integer id, no ULID); stock is keyed on ``mst_item`` (ULID).
  ``_resolve_item`` matches on item code and provisions the inventory item from
  the procurement master on first receipt, so receiving never fails for an item
  the buyer could legitimately order. See :meth:`_resolve_item`.

Cross-schema note: procurement tables live in the ``ERP_Procurement`` database and
carry no ``company_id``, so the targeted UPDATEs below are schema-qualified and
bound by document id. They are deliberately narrow — column-level updates of
received/rejected quantities — never the destructive ``UPDATE`` SP action, which
rewrites a document and deletes its lines.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.enums import ItemType, MovementDirection, StockStatus
from app.core.errors import NotFoundError, ValidationFailedError
from app.modules.inventory.application.stock_service import StockService
from app.modules.masters.application.item_service import ItemService
from app.modules.masters.infrastructure.models import MstItem
from app.modules.organisation.infrastructure.models import SysWarehouse

# PO states a GRN may be raised against. Approval happens on the PO — an
# unapproved order can never be received.
RECEIVABLE_PO_STATUSES = ("APPROVED", "RELEASED", "PARTIALLY_RECEIVED")

# The procurement Item master uses its own type vocabulary; map it onto the
# inventory ItemType enum, defaulting to RAW_MATERIAL for anything unrecognised.
_ITEM_TYPE_MAP = {
    "RAW_MATERIAL": ItemType.RAW_MATERIAL.value,
    "FINISHED": ItemType.FINISHED_GOODS.value,
    "FINISHED_GOODS": ItemType.FINISHED_GOODS.value,
    "SEMI_FINISHED": ItemType.WIP.value,
    "WIP": ItemType.WIP.value,
    "CONSUMABLE": ItemType.CONSUMABLE.value,
    "PACKING": ItemType.PACKING.value,
    "SPARE": ItemType.SPARE.value,
}


def _d(value: Any) -> Decimal:
    """Payload numbers arrive as float/str/None; quantities must be exact."""
    if value in (None, "", "null"):
        return Decimal("0")
    return Decimal(str(value))


class GrnPostingService:
    def __init__(self, session: AsyncSession, ctx: TenantContext) -> None:
        self.session = session
        self.ctx = ctx
        self.stock = StockService(session, ctx)
        self.items = ItemService(session, ctx)

    # ─── resolution ──────────────────────────────────────────────────────────
    async def _resolve_item(self, item_code: str, item_name: str, uom: str) -> MstItem:
        """Find the inventory item for a procurement item code, provisioning it
        from the procurement Item master when it does not exist yet.

        The two masters are separate tables with independent keys; item code is
        the only shared business identifier, so it is the bridge.
        """
        code = (item_code or "").strip().upper()
        if not code:
            raise ValidationFailedError("A GRN line has no item code and cannot be received.")

        existing = (
            await self.session.execute(
                text(
                    "SELECT uid FROM mst_item "
                    "WHERE company_id = :cid AND code = :code AND deleted_at IS NULL LIMIT 1"
                ),
                {"cid": self.ctx.company_id, "code": code},
            )
        ).fetchone()
        if existing:
            return await self.stock._item(existing[0])

        # Not in inventory yet — provision it from the procurement Item master.
        src = (
            await self.session.execute(
                text(
                    "SELECT Code, Name, ItemType, BaseUom, HsnCode, IsBatchTracked, "
                    "       RequiresIncomingInspection, StandardCost, ReorderLevel "
                    "  FROM Item WHERE Code = :code AND IFNULL(IsDeleted, 0) = 0 LIMIT 1"
                ),
                {"code": code},
            )
        ).fetchone()

        if src is not None:
            inspection_gated = bool(src[6])
            data = {
                "code": code,
                "name": src[1] or item_name or code,
                "item_type": _ITEM_TYPE_MAP.get(
                    (src[2] or "").upper(), ItemType.RAW_MATERIAL.value
                ),
                "base_uom": src[3] or uom or "NOS",
                "hsn_code": src[4],
                "is_batch_tracked": bool(src[5]),
                "standard_rate": src[7],
                "reorder_level": src[8],
                "default_receipt_status": (
                    StockStatus.QUARANTINE.value
                    if inspection_gated
                    else StockStatus.AVAILABLE.value
                ),
            }
        else:
            # No row in either master — fall back to the GRN line itself so a
            # legitimate receipt is never blocked by master-data drift.
            data = {
                "code": code,
                "name": item_name or code,
                "item_type": ItemType.RAW_MATERIAL.value,
                "base_uom": uom or "NOS",
                "default_receipt_status": StockStatus.AVAILABLE.value,
            }

        return await self.items.create(data)

    async def _resolve_warehouse(self, warehouse: str) -> SysWarehouse:
        """GRN carries a warehouse code or name; stock posting needs the row."""
        key = (warehouse or "").strip()
        if not key:
            raise ValidationFailedError(
                "This GRN has no store/warehouse, so the goods cannot be placed into stock."
            )
        row = (
            await self.session.execute(
                text(
                    "SELECT uid FROM sys_warehouse "
                    " WHERE company_id = :cid AND deleted_at IS NULL "
                    "   AND (code = :key OR name = :key) LIMIT 1"
                ),
                {"cid": self.ctx.company_id, "key": key},
            )
        ).fetchone()
        if row is None:
            raise NotFoundError(
                f"Store '{key}' is not a known warehouse. Select a valid store on the GRN."
            )
        wh = (
            await self.session.execute(
                text("SELECT id, code, is_active FROM sys_warehouse WHERE uid = :u"),
                {"u": row[0]},
            )
        ).fetchone()
        if not wh[2]:
            raise ValidationFailedError(f"Store '{wh[1]}' is inactive.")
        return wh  # (id, code, is_active)

    # ─── PO state ────────────────────────────────────────────────────────────
    async def _po_or_error(self, po_no: str) -> Any:
        row = (
            await self.session.execute(
                text(
                    "SELECT Id, DocNo, Status FROM ERP_Procurement.PurchaseOrder "
                    " WHERE DocNo = :po AND IFNULL(IsDeleted, 0) = 0 LIMIT 1"
                ),
                {"po": po_no},
            )
        ).fetchone()
        if row is None:
            raise NotFoundError(f"Purchase order '{po_no}' was not found.")
        if row[2] not in RECEIVABLE_PO_STATUSES:
            raise ValidationFailedError(
                f"Purchase order {row[1]} is {row[2]}. Only an approved or released "
                f"order can be received — send it through the Approvals screen first."
            )
        return row

    async def _po_lines(self, po_id: int) -> dict[str, dict[str, Any]]:
        rows = (
            await self.session.execute(
                text(
                    "SELECT Id, ItemCode, Qty, IFNULL(ReceivedQty,0), IFNULL(RejectedQty,0) "
                    "  FROM ERP_Procurement.PurchaseOrderLine WHERE PurchaseOrderId = :po"
                ),
                {"po": po_id},
            )
        ).fetchall()
        return {
            str(r[1]).upper(): {
                "id": r[0],
                "ordered": _d(r[2]),
                "received": _d(r[3]),
                "rejected": _d(r[4]),
            }
            for r in rows
        }

    # ─── validation (V4 receiving rules) ─────────────────────────────────────
    def _validate_lines(self, lines: list[dict], po_lines: dict[str, dict]) -> None:
        if not lines:
            raise ValidationFailedError("A GRN must have at least one item line.")
        errors: list[dict[str, str]] = []
        for idx, ln in enumerate(lines, start=1):
            code = str(ln.get("itemCode") or "").upper()
            received, accepted, rejected = (
                _d(ln.get("receivedQty")),
                _d(ln.get("acceptedQty")),
                _d(ln.get("rejectedQty")),
            )
            label = ln.get("itemName") or code or f"line {idx}"

            if min(received, accepted, rejected) < 0:
                errors.append({"field": f"lines.{idx}", "code": "negative",
                               "message": f"{label}: quantities cannot be negative."})
                continue
            if received == 0:
                errors.append({"field": f"lines.{idx}", "code": "zero_received",
                               "message": f"{label}: received quantity must be greater than zero."})
                continue
            if accepted + rejected != received:
                errors.append({"field": f"lines.{idx}", "code": "split_mismatch",
                               "message": (f"{label}: accepted ({accepted}) plus rejected ({rejected}) "
                                           f"must equal received ({received}).")})
            po_line = po_lines.get(code)
            if po_line is None:
                errors.append({"field": f"lines.{idx}", "code": "not_on_po",
                               "message": f"{label}: this item is not on the purchase order."})
                continue
            remaining = po_line["ordered"] - po_line["received"]
            if received > remaining:
                errors.append({"field": f"lines.{idx}", "code": "over_receipt",
                               "message": (f"{label}: received {received} but only {remaining} "
                                           f"remains on the order.")})
        if errors:
            raise ValidationFailedError(
                "This GRN cannot be posted — please correct the quantities.", errors=errors
            )

    # ─── posting ─────────────────────────────────────────────────────────────
    async def post(self, grn: dict[str, Any]) -> dict[str, Any]:
        """Post a GRN: move accepted stock in and roll quantities onto the PO.

        Idempotent by document state — a GRN already POSTED is refused, so a
        double-submit or a retried request can never duplicate stock.
        """
        grn_id = grn.get("uid")
        doc_no = grn.get("docNo") or ""

        if str(grn.get("status") or "").upper() == "POSTED" and grn.get("_alreadyPersisted"):
            raise ValidationFailedError(
                f"GRN {doc_no} is already posted to inventory. It cannot be posted twice."
            )

        po = await self._po_or_error(str(grn.get("poNo") or ""))
        po_id, po_doc_no = po[0], po[1]
        po_lines = await self._po_lines(po_id)

        lines = grn.get("lines") or []
        self._validate_lines(lines, po_lines)

        wh = await self._resolve_warehouse(str(grn.get("warehouse") or ""))
        warehouse_id, warehouse_code = wh[0], wh[1]

        posted: list[dict[str, Any]] = []
        for ln in lines:
            code = str(ln.get("itemCode") or "").upper()
            accepted = _d(ln.get("acceptedQty"))
            rejected = _d(ln.get("rejectedQty"))
            batch_no = str(ln.get("batchNo") or "").strip()

            item = await self._resolve_item(code, str(ln.get("itemName") or ""), str(ln.get("uom") or ""))

            if item.is_batch_tracked and not batch_no:
                raise ValidationFailedError(
                    f"{item.name} is batch-tracked — enter a batch/lot number before posting.",
                    errors=[{"field": "batchNo", "code": "required",
                             "message": f"Batch/lot is mandatory for {item.code}."}],
                )

            # Only accepted quantity becomes stock; rejected stays with the supplier.
            if accepted > 0:
                led = await self.stock.post_movement(
                    item=item,
                    warehouse_id=warehouse_id,
                    direction=MovementDirection.IN.value,
                    quantity=accepted,
                    rate=_d(ln.get("rate")),
                    movement_type="GRN",
                    stock_status=item.default_receipt_status,
                    batch_no=batch_no,
                    document_type="GRN",
                    document_no=doc_no,
                    line_ref=code,
                    remarks=f"GRN {doc_no} against {po_doc_no}",
                )
                posted.append({
                    "itemCode": item.code,
                    "quantity": float(led.quantity),
                    "stockStatus": item.default_receipt_status,
                    "balanceAfter": float(led.balance_qty_after),
                })

            # Roll both quantities back onto the ordered line.
            await self.session.execute(
                text(
                    "UPDATE ERP_Procurement.PurchaseOrderLine "
                    "   SET ReceivedQty = IFNULL(ReceivedQty,0) + :acc, "
                    "       RejectedQty = IFNULL(RejectedQty,0) + :rej, "
                    "       ModifiedBy = :by, ModifiedDate = CURRENT_TIMESTAMP "
                    " WHERE Id = :id"
                ),
                {"acc": float(accepted), "rej": float(rejected),
                 "by": self.ctx.user_name or "System", "id": po_lines[code]["id"]},
            )

        po_status = await self._refresh_po_receipt_state(po_id)

        if grn_id:
            await self.session.execute(
                text(
                    "CALL ERP_Procurement.SpManageGrn('SET_STATUS', :id, :payload)"
                ),
                {"id": grn_id,
                 "payload": json.dumps({"status": "POSTED",
                                        "modifiedBy": self.ctx.user_name or "System"})},
            )

        return {
            "grnNo": doc_no,
            "poNo": po_doc_no,
            "poStatus": po_status,
            "warehouse": warehouse_code,
            "movements": posted,
        }

    async def _refresh_po_receipt_state(self, po_id: int) -> str:
        """Recompute received percentage and drive the PO's receiving status."""
        totals = (
            await self.session.execute(
                text(
                    "SELECT IFNULL(SUM(Qty),0), IFNULL(SUM(IFNULL(ReceivedQty,0)),0) "
                    "  FROM ERP_Procurement.PurchaseOrderLine WHERE PurchaseOrderId = :po"
                ),
                {"po": po_id},
            )
        ).fetchone()
        ordered, received = _d(totals[0]), _d(totals[1])
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
        return status
