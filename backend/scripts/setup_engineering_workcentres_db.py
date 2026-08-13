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
            CREATE TABLE IF NOT EXISTS EngineeringWorkCentre (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                Code VARCHAR(50) UNIQUE NOT NULL,
                Name VARCHAR(150) NOT NULL,
                Plant VARCHAR(150) NOT NULL,
                MachineRatePerHour DECIMAL(10,2) NOT NULL DEFAULT 0,
                LabourRatePerHour DECIMAL(10,2) NOT NULL DEFAULT 0,
                OverheadPct DECIMAL(5,2) NOT NULL DEFAULT 0,
                ShiftPattern VARCHAR(50) NOT NULL,
                HoursPerDay INT NOT NULL DEFAULT 0,
                OeeTargetPct DECIMAL(5,2) NOT NULL DEFAULT 0,
                MachineCodes JSON NULL,
                IsActive BIT(1) NOT NULL DEFAULT b'1',
                CreatedBy VARCHAR(100),
                CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                ModifiedBy VARCHAR(100),
                ModifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
            """
            cursor.execute(create_table_sql)
            print("Table EngineeringWorkCentre created or verified.")

            # 2. Create Stored Procedure
            drop_sp_sql = "DROP PROCEDURE IF EXISTS SpManageEngineeringWorkCentre"
            cursor.execute(drop_sp_sql)

            create_sp_sql = """
            CREATE PROCEDURE SpManageEngineeringWorkCentre(
                IN p_Action VARCHAR(20),
                IN p_Id INT,
                IN p_Code VARCHAR(50),
                IN p_Name VARCHAR(150),
                IN p_Plant VARCHAR(150),
                IN p_MachineRatePerHour DECIMAL(10,2),
                IN p_LabourRatePerHour DECIMAL(10,2),
                IN p_OverheadPct DECIMAL(5,2),
                IN p_ShiftPattern VARCHAR(50),
                IN p_HoursPerDay INT,
                IN p_OeeTargetPct DECIMAL(5,2),
                IN p_MachineCodes JSON,
                IN p_IsActive BIT(1),
                IN p_User VARCHAR(100)
            )
            BEGIN
                IF p_Action = 'INSERT' THEN
                    INSERT INTO EngineeringWorkCentre (
                        Code, Name, Plant, MachineRatePerHour, LabourRatePerHour,
                        OverheadPct, ShiftPattern, HoursPerDay, OeeTargetPct,
                        MachineCodes, IsActive, CreatedBy, CreatedDate,
                        ModifiedBy, ModifiedDate
                    ) VALUES (
                        p_Code, p_Name, p_Plant, p_MachineRatePerHour, p_LabourRatePerHour,
                        p_OverheadPct, p_ShiftPattern, p_HoursPerDay, p_OeeTargetPct,
                        p_MachineCodes, p_IsActive, p_User, CURRENT_TIMESTAMP,
                        p_User, CURRENT_TIMESTAMP
                    );
                    SELECT LAST_INSERT_ID() AS InsertedId;
                
                ELSEIF p_Action = 'UPDATE' THEN
                    UPDATE EngineeringWorkCentre
                    SET
                        Code = p_Code,
                        Name = p_Name,
                        Plant = p_Plant,
                        MachineRatePerHour = p_MachineRatePerHour,
                        LabourRatePerHour = p_LabourRatePerHour,
                        OverheadPct = p_OverheadPct,
                        ShiftPattern = p_ShiftPattern,
                        HoursPerDay = p_HoursPerDay,
                        OeeTargetPct = p_OeeTargetPct,
                        MachineCodes = p_MachineCodes,
                        IsActive = p_IsActive,
                        ModifiedBy = p_User,
                        ModifiedDate = CURRENT_TIMESTAMP
                    WHERE Id = p_Id;
                    SELECT p_Id AS UpdatedId;
                    
                ELSEIF p_Action = 'DELETE' THEN
                    DELETE FROM EngineeringWorkCentre WHERE Id = p_Id;
                    SELECT p_Id AS DeletedId;
                    
                ELSEIF p_Action = 'SELECT_ALL' THEN
                    SELECT 
                        Id, Code, Name, Plant, MachineRatePerHour, LabourRatePerHour,
                        OverheadPct, ShiftPattern, HoursPerDay, OeeTargetPct,
                        MachineCodes, IsActive, CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
                    FROM EngineeringWorkCentre;
                END IF;
            END;
            """
            cursor.execute(create_sp_sql)
            print("Stored procedure SpManageEngineeringWorkCentre created.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    asyncio.run(setup_db())
