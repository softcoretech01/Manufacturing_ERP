from app.repositories.engineering_product_repository import EngineeringProductRepository
import json

class EngineeringProductService:
    def __init__(self, repository: EngineeringProductRepository):
        self.repository = repository

    async def get_all_products(self) -> list[dict]:
        return await self.repository.get_all_products()

    async def get_next_code(self) -> dict:
        return await self.repository.get_next_code()

    async def create_product(self, data: dict, user_id: str) -> dict:
        data['createdBy'] = user_id
        if 'uid' in data:
            data.pop('uid')
        if 'id' in data:
            data.pop('id')
        # serialize
        payload = json.dumps(data)
        product_id, code = await self.repository.create_product(payload)
        data['uid'] = product_id
        data['code'] = code
        return data

    async def update_product(self, uid: str, data: dict, user_id: str) -> dict:
        data['id'] = uid
        if 'uid' in data:
            data.pop('uid')
        data['modifiedBy'] = user_id
        payload = json.dumps(data)
        await self.repository.update_product(payload)
        data['uid'] = uid
        return data

    async def delete_product(self, uid: str) -> None:
        data = {'id': uid}
        payload = json.dumps(data)
        await self.repository.delete_product(payload)
