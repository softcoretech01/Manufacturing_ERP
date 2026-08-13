-- Table: Employee
CREATE TABLE IF NOT EXISTS Employee (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Uid VARCHAR(50) NOT NULL UNIQUE,
    Code VARCHAR(50) NOT NULL,
    Name VARCHAR(150) NOT NULL,
    Designation VARCHAR(100),
    Department VARCHAR(100),
    Grade VARCHAR(20),
    EmploymentType VARCHAR(50),
    DateOfJoining DATETIME,
    DateOfBirth DATETIME,
    Gender VARCHAR(10),
    BloodGroup VARCHAR(10),
    Mobile VARCHAR(15),
    Email VARCHAR(150),
    ReportsTo VARCHAR(100),
    PlantUid VARCHAR(50) NULL,
    CostCentre VARCHAR(50),
    ShiftCode VARCHAR(50),
    Skills JSON,
    PfNumber VARCHAR(50) NULL,
    EsiNumber VARCHAR(50) NULL,
    UanNumber VARCHAR(50) NULL,
    AadhaarMasked VARCHAR(20),
    PanMasked VARCHAR(20),
    BankAccountMasked VARCHAR(50),
    IsShopFloor BIT DEFAULT b'0',
    Status VARCHAR(20) DEFAULT 'ACTIVE',
    Revisions JSON,
    WhereUsed JSON,
    EffectiveFrom DATETIME,
    EffectiveTo DATETIME NULL,
    IsDeleted BIT DEFAULT b'0',
    CreatedBy VARCHAR(100),
    CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy VARCHAR(100),
    ModifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Stored Procedure: SpGetNextEmployeeCode
DROP PROCEDURE IF EXISTS SpGetNextEmployeeCode;
DELIMITER //
CREATE PROCEDURE SpGetNextEmployeeCode()
BEGIN
    DECLARE next_id INT;
    DECLARE next_code VARCHAR(50);
    
    SELECT IFNULL(MAX(Id), 0) + 1 INTO next_id FROM Employee;
    SET next_code = CONCAT('EMP-', LPAD(next_id, 3, '0'));
    
    SELECT next_code AS nextCode;
END //
DELIMITER ;

-- Stored Procedure: SpEmployee
DROP PROCEDURE IF EXISTS SpEmployee;
DELIMITER //

CREATE PROCEDURE SpEmployee (
    IN p_Action VARCHAR(20),
    IN p_Uid VARCHAR(50),
    IN p_Code VARCHAR(50),
    IN p_Name VARCHAR(150),
    IN p_Designation VARCHAR(100),
    IN p_Department VARCHAR(100),
    IN p_Grade VARCHAR(20),
    IN p_EmploymentType VARCHAR(50),
    IN p_DateOfJoining DATETIME,
    IN p_DateOfBirth DATETIME,
    IN p_Gender VARCHAR(10),
    IN p_BloodGroup VARCHAR(10),
    IN p_Mobile VARCHAR(15),
    IN p_Email VARCHAR(150),
    IN p_ReportsTo VARCHAR(100),
    IN p_PlantUid VARCHAR(50),
    IN p_CostCentre VARCHAR(50),
    IN p_ShiftCode VARCHAR(50),
    IN p_Skills JSON,
    IN p_PfNumber VARCHAR(50),
    IN p_EsiNumber VARCHAR(50),
    IN p_UanNumber VARCHAR(50),
    IN p_AadhaarMasked VARCHAR(20),
    IN p_PanMasked VARCHAR(20),
    IN p_BankAccountMasked VARCHAR(50),
    IN p_IsShopFloor BIT,
    IN p_Status VARCHAR(20),
    IN p_Revisions JSON,
    IN p_WhereUsed JSON,
    IN p_EffectiveFrom DATETIME,
    IN p_EffectiveTo DATETIME,
    IN p_ModifiedBy VARCHAR(100)
)
BEGIN
    IF p_Action = 'LIST' THEN
        SELECT *
        FROM Employee
        WHERE IsDeleted = 0;
        
    ELSEIF p_Action = 'READ' THEN
        SELECT *
        FROM Employee
        WHERE Uid = p_Uid AND IsDeleted = 0;
        
    ELSEIF p_Action = 'CREATE' THEN
        INSERT INTO Employee (
            Uid, Code, Name, Designation, Department, Grade, EmploymentType, 
            DateOfJoining, DateOfBirth, Gender, BloodGroup, Mobile, Email, 
            ReportsTo, PlantUid, CostCentre, ShiftCode, Skills, PfNumber, 
            EsiNumber, UanNumber, AadhaarMasked, PanMasked, BankAccountMasked, 
            IsShopFloor, Status, Revisions, WhereUsed, EffectiveFrom, EffectiveTo, 
            CreatedBy, ModifiedBy
        ) VALUES (
            p_Uid, p_Code, p_Name, p_Designation, p_Department, p_Grade, p_EmploymentType,
            p_DateOfJoining, p_DateOfBirth, p_Gender, p_BloodGroup, p_Mobile, p_Email,
            p_ReportsTo, p_PlantUid, p_CostCentre, p_ShiftCode, p_Skills, p_PfNumber,
            p_EsiNumber, p_UanNumber, p_AadhaarMasked, p_PanMasked, p_BankAccountMasked,
            p_IsShopFloor, p_Status, p_Revisions, p_WhereUsed, p_EffectiveFrom, p_EffectiveTo,
            p_ModifiedBy, p_ModifiedBy
        );
        
        SELECT *
        FROM Employee
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'UPDATE' THEN
        UPDATE Employee
        SET 
            Code = p_Code,
            Name = p_Name,
            Designation = p_Designation,
            Department = p_Department,
            Grade = p_Grade,
            EmploymentType = p_EmploymentType,
            DateOfJoining = p_DateOfJoining,
            DateOfBirth = p_DateOfBirth,
            Gender = p_Gender,
            BloodGroup = p_BloodGroup,
            Mobile = p_Mobile,
            Email = p_Email,
            ReportsTo = p_ReportsTo,
            PlantUid = p_PlantUid,
            CostCentre = p_CostCentre,
            ShiftCode = p_ShiftCode,
            Skills = p_Skills,
            PfNumber = p_PfNumber,
            EsiNumber = p_EsiNumber,
            UanNumber = p_UanNumber,
            AadhaarMasked = p_AadhaarMasked,
            PanMasked = p_PanMasked,
            BankAccountMasked = p_BankAccountMasked,
            IsShopFloor = p_IsShopFloor,
            Status = p_Status,
            Revisions = p_Revisions,
            WhereUsed = p_WhereUsed,
            EffectiveFrom = p_EffectiveFrom,
            EffectiveTo = p_EffectiveTo,
            ModifiedBy = p_ModifiedBy
        WHERE Uid = p_Uid AND IsDeleted = 0;
        
        SELECT *
        FROM Employee
        WHERE Uid = p_Uid;
        
    ELSEIF p_Action = 'DELETE' THEN
        UPDATE Employee
        SET 
            IsDeleted = 1,
            ModifiedBy = p_ModifiedBy
        WHERE Uid = p_Uid;
    END IF;
END //
DELIMITER ;
