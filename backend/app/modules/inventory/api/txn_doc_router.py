from __future__ import annotations

from datetime import date
from typing import Any, List

from fastapi import APIRouter, Depends, Query, Path, status
from sqlalchemy import select, and_, or_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import TenantContext
from app.core.deps import SessionDep, require
from app.core.errors import NotFoundError, ValidationFailedError
from app.modules.inventory.api import txn_doc_schemas as s
from app.modules.inventory.application.txn_doc_service import TxnDocService
from app.modules.inventory.infrastructure.txn_models import InvStockTxn, InvStockTxnLine
from app.modules.organisation.infrastructure.models import SysWarehouse, SysDepartment
from app.modules.iam.infrastructure.models import SysUser

router = APIRouter(tags=["Inventory · Transaction Documents"])

async def _enrich_txn(session: AsyncSession, company_id: int, txn: InvStockTxn) -> dict[str, Any]:
    src_wh_uid, src_wh_code, src_wh_name = None, None, None
    dst_wh_uid, dst_wh_code, dst_wh_name = None, None, None
    dept_code, dept_name = None, None
    posted_by_name = txn.posted_by_name

    if txn.src_warehouse_id:
        src = (
            await session.execute(
                select(SysWarehouse.uid, SysWarehouse.code, SysWarehouse.name)
                .where(SysWarehouse.id == txn.src_warehouse_id)
            )
        ).first()
        if src:
            src_wh_uid, src_wh_code, src_wh_name = src

    if txn.dst_warehouse_id:
        dst = (
            await session.execute(
                select(SysWarehouse.uid, SysWarehouse.code, SysWarehouse.name)
                .where(SysWarehouse.id == txn.dst_warehouse_id)
            )
        ).first()
        if dst:
            dst_wh_uid, dst_wh_code, dst_wh_name = dst

    if txn.department_id:
        dept = (
            await session.execute(
                select(SysDepartment.code, SysDepartment.name)
                .where(SysDepartment.id == txn.department_id)
            )
        ).first()
        if dept:
            dept_code, dept_name = dept

    lines_db = (
        await session.execute(
            select(InvStockTxnLine).where(InvStockTxnLine.txn_id == txn.id)
        )
    ).scalars().all()

    lines_out = []
    for l in lines_db:
        lines_out.append({
            "uid": l.uid,
            "item_id": l.item_id,
            "item_code": l.item_code,
            "item_name": l.item_name,
            "item_type": l.item_type,
            "category": l.category,
            "uom": l.uom,
            "batch_no": l.batch_no,
            "expiry_date": l.expiry_date,
            "mfg_date": l.mfg_date,
            "quantity": float(l.quantity),
            "unit_price": float(l.unit_price),
            "tax_rate": float(l.tax_rate),
            "tax_amount": float(l.tax_amount),
            "line_total": float(l.line_total),
            "remarks": l.remarks
        })

    return {
        "uid": txn.uid,
        "txn_type": txn.txn_type,
        "document_no": txn.document_no,
        "txn_date": txn.txn_date,
        "src_warehouse_uid": src_wh_uid,
        "src_warehouse_code": src_wh_code,
        "src_warehouse_name": src_wh_name,
        "dst_warehouse_uid": dst_wh_uid,
        "dst_warehouse_code": dst_wh_code,
        "dst_warehouse_name": dst_wh_name,
        "department_id": txn.department_id,
        "department_code": dept_code,
        "department_name": dept_name,
        "issued_to": txn.issued_to,
        "reference_type": txn.reference_type,
        "reference_no": txn.reference_no,
        "remarks": txn.remarks,
        "status": txn.status,
        "posted_at": txn.posted_at,
        "posted_by_name": posted_by_name,
        "subtotal": float(txn.subtotal),
        "tax_total": float(txn.tax_total),
        "grand_total": float(txn.grand_total),
        "lines": lines_out,
        "created_at": txn.created_at,
        "updated_at": txn.updated_at
    }

@router.get("/inventory/stock-transactions/returnable-qty")
async def get_returnable_qty(
    session: SessionDep,
    stock_out_no: str = Query(...),
    item_id: int = Query(...),
    batch_no: str = Query(""),
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> Any:
    svc = TxnDocService(session, ctx)
    qty = await svc.get_returnable_qty(stock_out_no, item_id, batch_no)
    return {"returnable_qty": float(qty)}

@router.get("/inventory/stock-transactions/eligible-grns")
async def get_eligible_grns(
    session: SessionDep,
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW"))
) -> Any:
    import json
    from app.modules.inventory.infrastructure.txn_models import InvStockTxn
    from sqlalchemy import select

    query = text("CALL ERP_Procurement.SpManageGrn('READ_ALL', NULL, NULL)")
    result = await session.execute(query)
    row = result.fetchone()
    
    # Get all already posted GRN doc_nos
    posted_grns_query = select(InvStockTxn.reference_no).where(
        InvStockTxn.company_id == ctx.company_id,
        InvStockTxn.txn_type == "STOCK_IN",
        InvStockTxn.reference_type == "GRN",
        InvStockTxn.status == "POSTED",
        InvStockTxn.deleted_at.is_(None)
    )
    posted_grns_result = await session.execute(posted_grns_query)
    posted_grn_nos = {r[0] for r in posted_grns_result.fetchall() if r[0]}
    
    eligible = []
    if row and row[0]:
        all_grns = json.loads(row[0])
        for g in all_grns:
            doc_no = g.get("docNo", "")
            if str(g.get("status")).upper() in ["POSTED", "APPROVED"]:
                eligible.append({
                    "uid": str(g.get("uid", "")),
                    "doc_no": doc_no,
                    "doc_date": g.get("docDate", ""),
                    "supplier_name": g.get("supplierName", ""),
                    "po_no": g.get("poNo", ""),
                    "warehouse": g.get("warehouse", ""),
                    "is_stock_added": doc_no in posted_grn_nos,
                })
    return eligible

@router.get("/inventory/stock-transactions/grn-details/{doc_no}")
async def get_grn_details(
    session: SessionDep,
    doc_no: str = Path(...),
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW"))
) -> Any:
    grn_row = await session.execute(
        text("SELECT Id, PoNo FROM ERP_Procurement.Grn WHERE DocNo = :doc_no LIMIT 1"),
        {"doc_no": doc_no}
    )
    grn = grn_row.fetchone()
    if not grn:
        raise NotFoundError(f"GRN '{doc_no}' not found.")
    
    po_no = grn[1]
    
    po_row = await session.execute(
        text("SELECT Id FROM ERP_Procurement.PurchaseOrder WHERE DocNo = :po_no LIMIT 1"),
        {"po_no": po_no}
    )
    po = po_row.fetchone()
    po_id = po[0] if po else None
    
    lines_query = text(
        "SELECT gl.ItemCode, gl.ItemName, gl.Uom, gl.AcceptedQty, gl.Rate, gl.TaxPct, gl.TaxAmount, gl.BatchNo, gl.MfgDate, gl.ExpiryDate, "
        "       IFNULL(pl.Qty, 0) as poQty, IFNULL(pl.ReceivedQty, 0) as poReceivedQty "
        "  FROM ERP_Procurement.GrnLine gl "
        "  LEFT JOIN ERP_Procurement.PurchaseOrderLine pl ON pl.PurchaseOrderId = :po_id AND pl.ItemCode = gl.ItemCode "
        " WHERE gl.GrnId = :grn_id"
    )
    lines_result = await session.execute(lines_query, {"grn_id": grn[0], "po_id": po_id})
    lines = []
    for l in lines_result.fetchall():
        ordered = float(l[10])
        received = float(l[11])
        remaining = max(0, ordered - received)
        lines.append({
            "itemCode": l[0],
            "itemName": l[1],
            "uom": l[2],
            "grnAcceptedQty": float(l[3] or 0),
            "rate": float(l[4] or 0),
            "taxPct": float(l[5] or 0),
            "taxAmount": float(l[6] or 0),
            "batchNo": l[7],
            "mfgDate": l[8],
            "expiryDate": l[9],
            "poRemainingQty": float(remaining)
        })
        
    return {
        "doc_no": doc_no,
        "po_no": po_no,
        "lines": lines
    }

@router.get("/inventory/stock-transactions", response_model=List[s.StockTxnOut])
async def list_transactions(
    session: SessionDep,
    txn_type: str | None = Query(None),
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    warehouse_uid: str | None = Query(None, alias="warehouse"),
    search: str | None = Query(None),
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> Any:
    stmt = select(InvStockTxn).where(
        InvStockTxn.company_id == ctx.company_id,
        InvStockTxn.deleted_at.is_(None)
    )

    if txn_type:
        stmt = stmt.where(InvStockTxn.txn_type == txn_type.upper())
    if status:
        stmt = stmt.where(InvStockTxn.status == status.upper())
    if date_from:
        stmt = stmt.where(InvStockTxn.txn_date >= date_from)
    if date_to:
        stmt = stmt.where(InvStockTxn.txn_date <= date_to)

    if warehouse_uid:
        wh = await session.execute(
            select(SysWarehouse.id).where(
                SysWarehouse.uid == warehouse_uid,
                SysWarehouse.company_id == ctx.company_id
            )
        )
        wh_id = wh.scalar_one_or_none()
        if wh_id:
            stmt = stmt.where(
                or_(
                    InvStockTxn.src_warehouse_id == wh_id,
                    InvStockTxn.dst_warehouse_id == wh_id
                )
            )

    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                InvStockTxn.document_no.ilike(like),
                InvStockTxn.reference_no.ilike(like),
                InvStockTxn.remarks.ilike(like)
            )
        )

    stmt = stmt.order_by(InvStockTxn.txn_date.desc(), InvStockTxn.id.desc())
    txns = (await session.execute(stmt)).scalars().all()

    enriched = []
    for t in txns:
        enriched.append(await _enrich_txn(session, ctx.company_id, t))
    return enriched

@router.get("/inventory/stock-transactions/{uid}", response_model=s.StockTxnOut)
async def get_transaction(
    session: SessionDep,
    uid: str = Path(...),
    ctx: TenantContext = Depends(require("INVENTORY.STOCK.VIEW")),
) -> Any:
    txn = (
        await session.execute(
            select(InvStockTxn).where(
                InvStockTxn.uid == uid,
                InvStockTxn.company_id == ctx.company_id,
                InvStockTxn.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()

    if not txn:
        raise NotFoundError(f"Transaction document '{uid}' not found.")
    return await _enrich_txn(session, ctx.company_id, txn)

@router.post("/inventory/stock-transactions", response_model=s.StockTxnOut, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    req: s.StockTxnIn,
    session: SessionDep,
    ctx: TenantContext = Depends(require(
        "INVENTORY.ISSUE.POST",
        "INVENTORY.RETURN.POST",
        "INVENTORY.TRANSFER.POST",
        "INVENTORY.ADJUSTMENT.POST"
    )),
) -> Any:
    svc = TxnDocService(session, ctx)
    posted_txn = await svc.create_and_post(req.model_dump())
    return await _enrich_txn(session, ctx.company_id, posted_txn)

@router.put("/inventory/stock-transactions/{uid}", response_model=s.StockTxnOut)
async def update_transaction(
    uid: str,
    req: s.StockTxnIn,
    session: SessionDep,
    ctx: TenantContext = Depends(require(
        "INVENTORY.ISSUE.POST",
        "INVENTORY.RETURN.POST",
        "INVENTORY.TRANSFER.POST",
        "INVENTORY.ADJUSTMENT.POST"
    )),
) -> Any:
    svc = TxnDocService(session, ctx)
    updated = await svc.update_transaction(uid, req.model_dump())
    return await _enrich_txn(session, ctx.company_id, updated)

@router.delete("/inventory/stock-transactions/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_draft_transaction(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require(
        "INVENTORY.ISSUE.POST",
        "INVENTORY.RETURN.POST",
        "INVENTORY.TRANSFER.POST",
        "INVENTORY.ADJUSTMENT.POST"
    )),
) -> None:
    svc = TxnDocService(session, ctx)
    await svc.delete(uid)

@router.post("/inventory/stock-transactions/{uid}/post", response_model=s.StockTxnOut)
async def post_transaction(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require(
        "INVENTORY.ISSUE.POST",
        "INVENTORY.RETURN.POST",
        "INVENTORY.TRANSFER.POST",
        "INVENTORY.ADJUSTMENT.POST"
    )),
) -> Any:
    svc = TxnDocService(session, ctx)
    posted = await svc.post(uid)
    return await _enrich_txn(session, ctx.company_id, posted)

@router.post("/inventory/stock-transactions/{uid}/cancel", response_model=s.StockTxnOut)
async def cancel_transaction(
    uid: str,
    session: SessionDep,
    ctx: TenantContext = Depends(require(
        "INVENTORY.ISSUE.POST",
        "INVENTORY.RETURN.POST",
        "INVENTORY.TRANSFER.POST",
        "INVENTORY.ADJUSTMENT.POST"
    )),
) -> Any:
    svc = TxnDocService(session, ctx)
    cancelled = await svc.cancel(uid)
    return await _enrich_txn(session, ctx.company_id, cancelled)
