import asyncio
from app.core.database import session_scope
from app.modules.iam.application.auth_service import authenticate

async def test():
    async with session_scope() as session:
        try:
            from sqlalchemy import select
            from app.modules.iam.infrastructure.models import SysUser
            user = (await session.execute(select(SysUser).where(SysUser.login_id == 'admin'))).scalar_one_or_none()
            if not user:
                print("No admin user found")
                return
            
            from app.modules.iam.application.auth_service import _company_scope, _load_company, _audit_login, _issue_tokens
            company_ids = await _company_scope(session, user.id)
            
            default_id = (
                user.default_company_id
                if user.default_company_id in company_ids
                else next(iter(company_ids))
            )
            from app.modules.organisation.infrastructure.models import SysCompany
            company = (
                await session.execute(select(SysCompany).where(SysCompany.id == default_id))
            ).scalar_one()
            
            from app.core.enums import AuditAction
            _audit_login(
                session,
                company_id=company.id,
                user_id=user.id,
                user_name=user.full_name,
                action=AuditAction.LOGIN,
                ip="127.0.0.1",
            )
            
            tokens = await _issue_tokens(session, user, company, ip="127.0.0.1")
            print("TOKENS:", tokens)
            
            print("SUCCESS")
        except Exception as e:
            import traceback
            traceback.print_exc()

asyncio.run(test())
