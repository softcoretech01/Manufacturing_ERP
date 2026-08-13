import asyncio
import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "ssberp")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ssberp")
DB_NAME = "ERP_Product"

async def setup_db():
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        autocommit=True
    )
    
    try:
        with conn.cursor() as cursor:
            # Create Database if not exists
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
            cursor.execute(f"USE {DB_NAME}")
            
            # Create Table
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS EngineeringOperation (
                Id INT PRIMARY KEY AUTO_INCREMENT,
                Code VARCHAR(50) UNIQUE NOT NULL,
                Name VARCHAR(200) NOT NULL,
                DefaultWorkCentre VARCHAR(50) NOT NULL,
                SetupMinutes DECIMAL(10,2) NOT NULL DEFAULT 0,
                CycleSeconds DECIMAL(10,2) NOT NULL DEFAULT 0,
                Operators INT NOT NULL DEFAULT 1,
                Skill VARCHAR(100) NOT NULL,
                QcCheckpoint BOOLEAN NOT NULL DEFAULT FALSE,
                Instructions VARCHAR(2000),
                IsActive BOOLEAN NOT NULL DEFAULT TRUE,
                CreatedBy VARCHAR(100) NOT NULL,
                CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ModifiedBy VARCHAR(100),
                ModifiedDate DATETIME ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """
            cursor.execute(create_table_sql)
            
            # Create Stored Procedure
            sp_sql = """
            DROP PROCEDURE IF EXISTS SpManageEngineeringOperation;
            """
            cursor.execute(sp_sql)
            
            sp_sql = """
            CREATE PROCEDURE SpManageEngineeringOperation(
                IN p_Action VARCHAR(20),
                IN p_Id INT,
                IN p_Code VARCHAR(50),
                IN p_Name VARCHAR(200),
                IN p_DefaultWorkCentre VARCHAR(50),
                IN p_SetupMinutes DECIMAL(10,2),
                IN p_CycleSeconds DECIMAL(10,2),
                IN p_Operators INT,
                IN p_Skill VARCHAR(100),
                IN p_QcCheckpoint BOOLEAN,
                IN p_Instructions VARCHAR(2000),
                IN p_IsActive BOOLEAN,
                IN p_User VARCHAR(100)
            )
            BEGIN
                IF p_Action = 'INSERT' THEN
                    INSERT INTO EngineeringOperation (
                        Code, Name, DefaultWorkCentre, SetupMinutes, CycleSeconds, 
                        Operators, Skill, QcCheckpoint, Instructions, IsActive, CreatedBy
                    ) VALUES (
                        p_Code, p_Name, p_DefaultWorkCentre, p_SetupMinutes, p_CycleSeconds, 
                        p_Operators, p_Skill, p_QcCheckpoint, p_Instructions, p_IsActive, p_User
                    );
                    SELECT LAST_INSERT_ID() AS InsertedId;
                
                ELSEIF p_Action = 'UPDATE' THEN
                    UPDATE EngineeringOperation 
                    SET 
                        Name = p_Name,
                        DefaultWorkCentre = p_DefaultWorkCentre,
                        SetupMinutes = p_SetupMinutes,
                        CycleSeconds = p_CycleSeconds,
                        Operators = p_Operators,
                        Skill = p_Skill,
                        QcCheckpoint = p_QcCheckpoint,
                        Instructions = p_Instructions,
                        IsActive = p_IsActive,
                        ModifiedBy = p_User,
                        ModifiedDate = CURRENT_TIMESTAMP
                    WHERE Id = p_Id;
                    SELECT p_Id AS UpdatedId;
                    
                ELSEIF p_Action = 'DELETE' THEN
                    -- Soft delete instead of physical delete
                    UPDATE EngineeringOperation 
                    SET IsActive = FALSE, ModifiedBy = p_User, ModifiedDate = CURRENT_TIMESTAMP
                    WHERE Id = p_Id;
                    SELECT p_Id AS DeletedId;
                    
                ELSEIF p_Action = 'SELECT_ALL' THEN
                    SELECT 
                        Id, Code, Name, DefaultWorkCentre, SetupMinutes, CycleSeconds, 
                        Operators, Skill, QcCheckpoint, Instructions, IsActive,
                        CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
                    FROM EngineeringOperation
                    ORDER BY Code ASC;
                END IF;
            END;
            """
            cursor.execute(sp_sql)
            
            print("Database setup completed for EngineeringOperation in ERP_Product.")
            
    finally:
        conn.close()

if __name__ == "__main__":
    asyncio.run(setup_db())
