from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.repositories.engineering_product_repository import EngineeringProductRepository
from app.services.engineering_product_service import EngineeringProductService
from app.schemas.engineering_product import EngProductSchema
from app.utils.audit_logger import log_audit_entry

router = APIRouter(tags=["Engineering Products"])

def get_service(db: AsyncSession = Depends(get_session)) -> EngineeringProductService:
    repository = EngineeringProductRepository(db)
    return EngineeringProductService(repository)

@router.get("", response_model=list[EngProductSchema])
async def get_all_products(service: EngineeringProductService = Depends(get_service)):
    return await service.get_all_products()

@router.get("/next-code")
async def get_next_code(service: EngineeringProductService = Depends(get_service)):
    return await service.get_next_code()

@router.post("", response_model=EngProductSchema)
async def create_product(
    product: EngProductSchema,
    service: EngineeringProductService = Depends(get_service)
):
    user_id = "System" # Or pull from auth context
    # exclude_none ensures we pass None correctly if we need, but for JSON it is fine.
    data = product.model_dump(mode='json')
    result = await service.create_product(data, user_id)
    
    await log_audit_entry(
        db=service.repository.session,
        entity_type="EngineeringProduct",
        entity_label=result.get("name", "Unknown"),
        documentNo=result.get("code"),
        action="CREATE",
        changes=[{"field": "all", "old": None, "new": "Created"}]
    )
    return result

@router.put("/{product_uid}", response_model=EngProductSchema)
async def update_product(
    product_uid: str,
    product: EngProductSchema,
    service: EngineeringProductService = Depends(get_service)
):
    user_id = "System"
    data = product.model_dump(mode='json')
    result = await service.update_product(product_uid, data, user_id)
    
    await log_audit_entry(
        db=service.repository.session,
        entity_type="EngineeringProduct",
        entity_label=result.get("name", "Unknown"),
        documentNo=result.get("code"),
        action="UPDATE",
        changes=[{"field": "all", "old": "Previous", "new": "Updated"}]
    )
    return result

@router.delete("/{product_uid}", status_code=204)
async def delete_product(
    product_uid: str,
    service: EngineeringProductService = Depends(get_service)
):
    await service.delete_product(product_uid)
    await log_audit_entry(
        db=service.repository.session,
        entity_type="EngineeringProduct",
        entity_label=product_uid,
        action="DELETE",
        changes=[{"field": "uid", "old": product_uid, "new": None}]
    )
    return None
