from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import pymysql

from app.core.config import settings

router = APIRouter(prefix="/dispatch/pods", tags=["dispatch-pods"])

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

class PodBase(BaseModel):
    shipmentNo: str
    challanNo: str
    customer: str
    destination: str
    deliveredOn: Optional[str] = None
    deliveredAtTime: Optional[str] = None
    receiverName: Optional[str] = None
    receiverDesignation: Optional[str] = None
    dispatchedQty: int
    receivedQty: int = 0
    shortQty: int = 0
    damagedQty: int = 0
    capturedBy: Optional[str] = None
    capturedVia: Optional[str] = None
    signatureCaptured: bool = False
    photoCaptured: bool = False
    gpsLatitude: Optional[float] = None
    gpsLongitude: Optional[float] = None
    status: str
    remarks: Optional[str] = None

class PodCreate(PodBase):
    pass

class PodUpdate(PodBase):
    pass

def map_db_to_schema(db_pod: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": db_pod["Id"],
        "uid": db_pod["Id"],
        "docNo": db_pod["DocNo"],
        "shipmentNo": db_pod["ShipmentNo"],
        "challanNo": db_pod["ChallanNo"],
        "customer": db_pod["Customer"],
        "destination": db_pod["Destination"],
        "deliveredOn": db_pod["DeliveredOn"].isoformat() if db_pod["DeliveredOn"] else None,
        "deliveredAtTime": db_pod["DeliveredAtTime"],
        "receiverName": db_pod["ReceiverName"],
        "receiverDesignation": db_pod["ReceiverDesignation"],
        "dispatchedQty": db_pod["DispatchedQty"],
        "receivedQty": db_pod["ReceivedQty"],
        "shortQty": db_pod["ShortQty"],
        "damagedQty": db_pod["DamagedQty"],
        "capturedBy": db_pod["CapturedBy"],
        "capturedVia": db_pod["CapturedVia"],
        "signatureCaptured": bool(db_pod["SignatureCaptured"]),
        "photoCaptured": bool(db_pod["PhotoCaptured"]),
        "gpsLatitude": float(db_pod["GpsLatitude"]) if db_pod["GpsLatitude"] is not None else None,
        "gpsLongitude": float(db_pod["GpsLongitude"]) if db_pod["GpsLongitude"] is not None else None,
        "status": db_pod["Status"],
        "remarks": db_pod["Remarks"]
    }

@router.get("")
def get_all_pods():
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.callproc("SpManagePod", [
                "GET_ALL", 0, None, None, None, None, None, None, None, None, None,
                0, 0, 0, 0, None, None, False, False, None, None, None, None, "system"
            ])
            results = cursor.fetchall()
            return [map_db_to_schema(row) for row in results]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("")
def create_pod(pod: PodCreate):
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.callproc("SpManagePod", [
                "CREATE", 0, None, pod.shipmentNo, pod.challanNo, pod.customer, pod.destination,
                pod.deliveredOn, pod.deliveredAtTime, pod.receiverName, pod.receiverDesignation,
                pod.dispatchedQty, pod.receivedQty, pod.shortQty, pod.damagedQty, pod.capturedBy,
                pod.capturedVia, pod.signatureCaptured, pod.photoCaptured, pod.gpsLatitude, pod.gpsLongitude,
                pod.status, pod.remarks, "system"
            ])
            result = cursor.fetchone()
            return map_db_to_schema(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{id}")
def update_pod(id: int, pod: PodUpdate):
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.callproc("SpManagePod", [
                "UPDATE", id, None, pod.shipmentNo, pod.challanNo, pod.customer, pod.destination,
                pod.deliveredOn, pod.deliveredAtTime, pod.receiverName, pod.receiverDesignation,
                pod.dispatchedQty, pod.receivedQty, pod.shortQty, pod.damagedQty, pod.capturedBy,
                pod.capturedVia, pod.signatureCaptured, pod.photoCaptured, pod.gpsLatitude, pod.gpsLongitude,
                pod.status, pod.remarks, "system"
            ])
            result = cursor.fetchone()
            if not result:
                raise HTTPException(status_code=404, detail="Pod not found")
            return map_db_to_schema(result)
    except pymysql.MySQLError as e:
        if e.args[0] in [1062, 3819, 4025]:
            raise HTTPException(status_code=400, detail=e.args[1])
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{id}")
def delete_pod(id: int):
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.callproc("SpManagePod", [
                "DELETE", id, None, None, None, None, None, None, None, None, None,
                0, 0, 0, 0, None, None, False, False, None, None, None, None, "system"
            ])
            return {"message": "Pod deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
