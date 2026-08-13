import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import SessionLocal
from app.utils.audit_logger import log_audit_entry
from app.services.audit_service import AuditService

async def test_audit():
    async with SessionLocal() as session:
        # Create a log entry manually
        print("Logging test entry...")
        await log_audit_entry(
            db=session,
            entity_type="TestEntity",
            entity_label="Test Label",
            document_no="TEST-001",
            action="LOGIN",
            changes=[{"field": "status", "old": "Offline", "new": "Online"}],
            user_name="Tester",
            role_code="QA"
        )
        print("Entry logged successfully!")

        # Fetch entries
        print("Fetching entries...")
        service = AuditService(session)
        entries = await service.get_all_audit_entries()
        print(f"Found {len(entries)} entries.")
        if len(entries) > 0:
            print(f"Latest entry action: {entries[0]['action']}")

if __name__ == "__main__":
    asyncio.run(test_audit())
