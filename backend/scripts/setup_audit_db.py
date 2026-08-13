import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings

async def setup_audit_db():
    db_url = str(settings.database_url).replace("ERP_Master", "ERP_Product")
    engine = create_async_engine(db_url)
    
    print(f"Connecting to database to setup AuditEntry...")
    async with engine.begin() as conn:
        try:
            # 1. Create AuditEntry table
            create_table_sql = text("""
            CREATE TABLE IF NOT EXISTS AuditEntry (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                Uid VARCHAR(50) UNIQUE NOT NULL,
                EntityType VARCHAR(100) NOT NULL,
                EntityLabel VARCHAR(255) NOT NULL,
                DocumentNo VARCHAR(100) NULL,
                Action VARCHAR(50) NOT NULL,
                Changes JSON NULL,
                ReasonCode VARCHAR(100) NULL,
                Comments TEXT NULL,
                UserName VARCHAR(100) NOT NULL,
                RoleCode VARCHAR(50) NOT NULL,
                IpAddress VARCHAR(100) NOT NULL,
                UserAgent VARCHAR(255) NOT NULL,
                Channel VARCHAR(100) NOT NULL,
                CorrelationId VARCHAR(100) NOT NULL,
                At DATETIME NOT NULL,
                CreatedBy VARCHAR(100),
                CreatedDate DATETIME,
                ModifiedBy VARCHAR(100),
                ModifiedDate DATETIME,
                INDEX idx_AuditEntry_Uid (Uid),
                INDEX idx_AuditEntry_EntityType (EntityType),
                INDEX idx_AuditEntry_Action (Action),
                INDEX idx_AuditEntry_UserName (UserName),
                INDEX idx_AuditEntry_At (At)
            );
            """)
            await conn.execute(create_table_sql)
            print("Table AuditEntry created.")

            # 2. Create Stored Procedure SpManageAuditEntry
            create_sp_sql = text("""
            CREATE PROCEDURE SpManageAuditEntry(
                IN p_Action VARCHAR(50),
                IN p_Uid VARCHAR(50),
                IN p_EntityType VARCHAR(100),
                IN p_EntityLabel VARCHAR(255),
                IN p_DocumentNo VARCHAR(100),
                IN p_EntryAction VARCHAR(50),
                IN p_Changes JSON,
                IN p_ReasonCode VARCHAR(100),
                IN p_Comments TEXT,
                IN p_UserName VARCHAR(100),
                IN p_RoleCode VARCHAR(50),
                IN p_IpAddress VARCHAR(100),
                IN p_UserAgent VARCHAR(255),
                IN p_Channel VARCHAR(100),
                IN p_CorrelationId VARCHAR(100),
                IN p_At DATETIME,
                IN p_UserId VARCHAR(100)
            )
            BEGIN
                IF p_Action = 'INSERT' THEN
                    INSERT INTO AuditEntry (
                        Uid, EntityType, EntityLabel, DocumentNo, Action,
                        Changes, ReasonCode, Comments, UserName, RoleCode,
                        IpAddress, UserAgent, Channel, CorrelationId, At,
                        CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
                    ) VALUES (
                        p_Uid, p_EntityType, p_EntityLabel, p_DocumentNo, p_EntryAction,
                        p_Changes, p_ReasonCode, p_Comments, p_UserName, p_RoleCode,
                        p_IpAddress, p_UserAgent, p_Channel, p_CorrelationId, p_At,
                        p_UserId, NOW(), p_UserId, NOW()
                    );
                    SELECT LAST_INSERT_ID() AS InsertedId;
                ELSEIF p_Action = 'SELECT_ALL' THEN
                    SELECT 
                        Uid, EntityType, EntityLabel, DocumentNo, Action,
                        Changes, ReasonCode, Comments, UserName, RoleCode,
                        IpAddress, UserAgent, Channel, CorrelationId, At,
                        CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
                    FROM AuditEntry
                    ORDER BY At DESC;
                END IF;
            END;
            """)
            
            await conn.execute(text("DROP PROCEDURE IF EXISTS SpManageAuditEntry"))
            await conn.execute(create_sp_sql)
            print("Stored procedure SpManageAuditEntry created.")

        except Exception as e:
            print(f"Error setting up Audit DB: {e}")
            raise
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(setup_audit_db())
