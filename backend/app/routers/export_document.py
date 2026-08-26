from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
import pymysql

from app.core.config import settings
from app.schemas.camel import CamelModel

router = APIRouter(prefix="/dispatch/export-documents", tags=["export-documents"])

def get_db_connection():
    return pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database="ERP_Packing",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )

class ExportDocumentBase(CamelModel):
    export_doc_no: Optional[str] = Field(None, max_length=50)
    export_shipment_no: str = Field(..., max_length=50)
    doc_type: str = Field(..., max_length=50)
    doc_no: Optional[str] = Field(None, max_length=100)
    issued_on: Optional[str] = None
    issued_by: Optional[str] = Field(None, max_length=100)
    file_name: Optional[str] = Field(None, max_length=255)
    is_mandatory: bool = True
    depends_on: Optional[str] = Field(None, max_length=50)
    status: str = Field("MISSING", max_length=30)
    remarks: Optional[str] = None

class ExportDocumentOut(ExportDocumentBase):
    id: int
    uid: str

def to_snake(name: str) -> str:
    import re
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()

def map_row(row):
    if not row: return row
    new_row = {}
    for k, v in row.items():
        if k in ('IssuedOn',) and v is not None:
            new_row[to_snake(k)] = v.isoformat()
        elif k in ('IsMandatory',):
            new_row[to_snake(k)] = bool(v)
        else:
            new_row[to_snake(k)] = v
    new_row['uid'] = str(new_row['id'])
    return new_row

@router.get("", response_model=List[ExportDocumentOut])
def get_export_documents():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageExportDocument", [
            "GET_ALL", 0, None, None, None, None, None, None, 1, None, None, None, "system"
        ])
        rows = cursor.fetchall()
        return [map_row(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.post("", response_model=ExportDocumentOut)
def create_export_document(req: ExportDocumentBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "CREATE",
            0,
            req.export_shipment_no,
            req.doc_type,
            req.doc_no,
            req.issued_on,
            req.issued_by,
            req.file_name,
            req.is_mandatory,
            req.depends_on,
            req.status,
            req.remarks,
            "system"
        )
        cursor.callproc("SpManageExportDocument", args)
        row = cursor.fetchone()
        return map_row(row)
    except pymysql.MySQLError as e:
        if e.args[0] in [1062, 3819, 4025]:
            raise HTTPException(status_code=400, detail=e.args[1])
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.put("/{id}", response_model=ExportDocumentOut)
def update_export_document(id: int, req: ExportDocumentBase):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        args = (
            "UPDATE",
            id,
            req.export_shipment_no,
            req.doc_type,
            req.doc_no,
            req.issued_on,
            req.issued_by,
            req.file_name,
            req.is_mandatory,
            req.depends_on,
            req.status,
            req.remarks,
            "system"
        )
        cursor.callproc("SpManageExportDocument", args)
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        return map_row(row)
    except pymysql.MySQLError as e:
        if e.args[0] in [1062, 3819, 4025]:
            raise HTTPException(status_code=400, detail=e.args[1])
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()

@router.delete("/{id}")
def delete_export_document(id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.callproc("SpManageExportDocument", [
            "DELETE", id, None, None, None, None, None, None, 1, None, None, None, "system"
        ])
        return {"detail": "Deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals(): conn.close()
