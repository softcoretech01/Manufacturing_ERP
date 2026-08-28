import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.employee import EmployeeSchema

async def main():
    engine = create_async_engine('mysql+aiomysql://root:Ener9y_Demo%402026@187.127.131.38:3308/admin_erp')
    async with engine.begin() as conn:
        repo = EmployeeRepository(conn)
        res = await repo.get_all()
        if res:
            emp = res[-1]  # Get the latest employee
            schema = EmployeeSchema.model_validate(emp)
            dumped = schema.model_dump()
            print(f"Name: {dumped.get('name')}")
            print(f"createdAt: {dumped.get('createdAt')}")
            print(f"createdDate: {dumped.get('createdDate')}")
        else:
            print("No employees")

if __name__ == "__main__":
    asyncio.run(main())
