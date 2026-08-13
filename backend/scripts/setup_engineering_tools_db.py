import os
import pymysql
from dotenv import load_dotenv
import asyncio

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

            # 1. Create table
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS EngineeringTool (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                Code VARCHAR(50) UNIQUE NOT NULL,
                Name VARCHAR(200) NOT NULL,
                ToolType VARCHAR(50) NOT NULL,
                MachineCode VARCHAR(50) NULL,
                LifeStrokes INT NOT NULL DEFAULT 0,
                UsedStrokes INT NOT NULL DEFAULT 0,
                LastMaintenanceOn DATE NULL,
                NextCalibrationOn DATE NULL,
                ReplacementCost DECIMAL(10,2) NOT NULL DEFAULT 0,
                Location VARCHAR(200) NULL,
                Status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
                IsActive BIT(1) NOT NULL DEFAULT b'1',
                CreatedBy VARCHAR(100),
                CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                ModifiedBy VARCHAR(100),
                ModifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
            """
            cursor.execute(create_table_sql)
            print("Table EngineeringTool created or verified.")

            # 2. Create Stored Procedure
            drop_sp_sql = "DROP PROCEDURE IF EXISTS SpManageEngineeringTool"
            cursor.execute(drop_sp_sql)

            create_sp_sql = """
            CREATE PROCEDURE SpManageEngineeringTool(
                IN p_Action VARCHAR(20),
                IN p_Id INT,
                IN p_Code VARCHAR(50),
                IN p_Name VARCHAR(200),
                IN p_ToolType VARCHAR(50),
                IN p_MachineCode VARCHAR(50),
                IN p_LifeStrokes INT,
                IN p_UsedStrokes INT,
                IN p_LastMaintenanceOn DATE,
                IN p_NextCalibrationOn DATE,
                IN p_ReplacementCost DECIMAL(10,2),
                IN p_Location VARCHAR(200),
                IN p_Status VARCHAR(50),
                IN p_IsActive BIT(1),
                IN p_User VARCHAR(100)
            )
            BEGIN
                IF p_Action = 'INSERT' THEN
                    INSERT INTO EngineeringTool (
                        Code, Name, ToolType, MachineCode, LifeStrokes,
                        UsedStrokes, LastMaintenanceOn, NextCalibrationOn,
                        ReplacementCost, Location, Status, IsActive,
                        CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
                    ) VALUES (
                        p_Code, p_Name, p_ToolType, p_MachineCode, p_LifeStrokes,
                        p_UsedStrokes, p_LastMaintenanceOn, p_NextCalibrationOn,
                        p_ReplacementCost, p_Location, p_Status, p_IsActive,
                        p_User, CURRENT_TIMESTAMP, p_User, CURRENT_TIMESTAMP
                    );
                    SELECT LAST_INSERT_ID() AS InsertedId;
                
                ELSEIF p_Action = 'UPDATE' THEN
                    UPDATE EngineeringTool
                    SET
                        Name = p_Name,
                        ToolType = p_ToolType,
                        MachineCode = p_MachineCode,
                        LifeStrokes = p_LifeStrokes,
                        UsedStrokes = p_UsedStrokes,
                        LastMaintenanceOn = p_LastMaintenanceOn,
                        NextCalibrationOn = p_NextCalibrationOn,
                        ReplacementCost = p_ReplacementCost,
                        Location = p_Location,
                        Status = p_Status,
                        IsActive = p_IsActive,
                        ModifiedBy = p_User,
                        ModifiedDate = CURRENT_TIMESTAMP
                    WHERE Id = p_Id;
                    SELECT p_Id AS UpdatedId;
                    
                ELSEIF p_Action = 'DELETE' THEN
                    UPDATE EngineeringTool
                    SET IsActive = b'0',
                        ModifiedBy = p_User,
                        ModifiedDate = CURRENT_TIMESTAMP
                    WHERE Id = p_Id;
                    SELECT p_Id AS DeletedId;
                    
                ELSEIF p_Action = 'SELECT_ALL' THEN
                    SELECT 
                        Id, Code, Name, ToolType, MachineCode,
                        LifeStrokes, UsedStrokes, LastMaintenanceOn, NextCalibrationOn,
                        ReplacementCost, Location, Status, IsActive,
                        CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
                    FROM EngineeringTool
                    WHERE IsActive = b'1' OR p_IsActive IS NULL;
                END IF;
            END;
            """
            cursor.execute(create_sp_sql)
            print("Stored procedure SpManageEngineeringTool created.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    asyncio.run(setup_db())
