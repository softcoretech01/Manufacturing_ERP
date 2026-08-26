import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.audit_service import AuditService

async def log_audit_entry(
    db: AsyncSession,
    entity_type: str,
    entity_label: str,
    action: str,
    document_no: Optional[str] = None,
    changes: List[Dict[str, Any]] = [],
    reason_code: Optional[str] = None,
    comments: Optional[str] = None,
    user_name: str = "System",
    role_code: str = "ADMIN",
    ip_address: str = "127.0.0.1",
    user_agent: str = "BackendAPI",
    channel: str = "WEB",
    correlation_id: Optional[str] = None
):
    if correlation_id is None:
        correlation_id = str(uuid.uuid4())
        
    audit_data = {
        "uid": str(uuid.uuid4()),
        "entityType": entity_type,
        "entityLabel": entity_label,
        "documentNo": document_no,
        "action": action,
        "changes": changes,
        "reasonCode": reason_code,
        "comments": comments,
        "userName": user_name,
        "roleCode": role_code,
        "ipAddress": ip_address,
        "userAgent": user_agent,
        "channel": channel,
        "correlationId": correlation_id,
        "at": datetime.utcnow().isoformat()
    }
    
    audit_service = AuditService(db)
    await audit_service.create_audit_entry(audit_data, user_name)
