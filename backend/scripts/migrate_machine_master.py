"""Option B — normalize the Machine master onto integer foreign keys (admin_erp).

Creates MachineGroup; creates normalized ProductionLine + WorkCentre keyed to
sys_plant.id by integer FK; swaps Machine's text columns for FK columns; rewrites
SpMachine to store FKs and JOIN masters on read; adds list procs.

Idempotent + additive. `admin_erp.Machine` is empty, so no backfill is needed.
Binary flags are TINYINT(1) 0/1; business keys are UNIQUE; relationships are FKs.

    python scripts/migrate_machine_master.py          # dry run (reports only)
    python scripts/migrate_machine_master.py --apply  # perform the change

Run from backend/ so it can read .env.
"""
from __future__ import annotations

import sys
import pymysql

DB = "admin_erp"


def env(path: str = ".env") -> dict[str, str]:
    d: dict[str, str] = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            d[k.strip()] = v.strip()
    return d


def main() -> int:
    apply = "--apply" in sys.argv
    e = env()
    conn = pymysql.connect(
        host=e["DB_HOST"], port=int(e["DB_PORT"]),
        user=e["DB_USER"], password=e["DB_PASSWORD"], autocommit=False,
    )
    cur = conn.cursor()
    log: list[str] = []

    def col_exists(table: str, col: str) -> bool:
        cur.execute(
            "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=%s "
            "AND TABLE_NAME=%s AND COLUMN_NAME=%s",
            (DB, table, col),
        )
        return cur.fetchone() is not None

    def fk_exists(table: str, name: str) -> bool:
        cur.execute(
            "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=%s "
            "AND TABLE_NAME=%s AND CONSTRAINT_NAME=%s",
            (DB, table, name),
        )
        return cur.fetchone() is not None

    def table_exists(table: str) -> bool:
        cur.execute(
            "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s",
            (DB, table),
        )
        return cur.fetchone() is not None

    def row_count(table: str) -> int:
        # In dry-run the table may not exist yet; treat as empty (would seed).
        if not table_exists(table):
            return 0
        cur.execute(f"SELECT COUNT(*) FROM `{table}`")
        return int(cur.fetchone()[0])

    def run(sql: str, label: str) -> None:
        log.append(("APPLY " if apply else "PLAN  ") + label)
        if apply:
            cur.execute(sql)

    cur.execute(f"USE `{DB}`")

    # 1) MachineGroup master ------------------------------------------------
    run(
        """CREATE TABLE IF NOT EXISTS MachineGroup (
          Id INT AUTO_INCREMENT PRIMARY KEY,
          Code VARCHAR(50) NOT NULL, Name VARCHAR(150) NOT NULL, Description VARCHAR(255) NULL,
          IsActive TINYINT(1) NOT NULL DEFAULT 1, IsDeleted TINYINT(1) NOT NULL DEFAULT 0,
          CreatedBy VARCHAR(100) NULL, CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ModifiedBy VARCHAR(100) NULL, ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_machinegroup_code (Code)
        ) ENGINE=InnoDB""",
        "create table MachineGroup",
    )
    if row_count("MachineGroup") == 0:
        seed = [("MG-DDP", "Deep Draw Press"), ("MG-CNC", "CNC Machining"),
                ("MG-NECK", "Necking & Curling"), ("MG-POL", "Polishing & Buffing"),
                ("MG-COAT", "Coating & Printing"), ("MG-ASSY", "Assembly"),
                ("MG-LEAK", "Leak & Vacuum Test"), ("MG-PACK", "Packing")]
        log.append(("APPLY " if apply else "PLAN  ") + f"seed MachineGroup ({len(seed)} rows)")
        if apply:
            cur.executemany("INSERT INTO MachineGroup (Code, Name) VALUES (%s,%s)", seed)

    # 2) ProductionLine (FK -> sys_plant.id) --------------------------------
    run(
        """CREATE TABLE IF NOT EXISTS ProductionLine (
          Id INT AUTO_INCREMENT PRIMARY KEY, PlantId BIGINT UNSIGNED NOT NULL,
          Code VARCHAR(50) NOT NULL, Name VARCHAR(150) NOT NULL, LineType VARCHAR(50) NULL,
          RatedOutputPerHour DECIMAL(12,2) NULL,
          IsActive TINYINT(1) NOT NULL DEFAULT 1, IsDeleted TINYINT(1) NOT NULL DEFAULT 0,
          CreatedBy VARCHAR(100) NULL, CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ModifiedBy VARCHAR(100) NULL, ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_line_plant_code (PlantId, Code), KEY ix_line_plant (PlantId),
          CONSTRAINT fk_line_plant FOREIGN KEY (PlantId) REFERENCES sys_plant (id)
        ) ENGINE=InnoDB""",
        "create table ProductionLine",
    )
    if row_count("ProductionLine") == 0:
        lines = [("PL0001", "LN-A", "Line A — 500 ml", "FORMING", 1800),
                 ("PL0001", "LN-B", "Line B — 750 ml", "FORMING", 1500),
                 ("PL0002", "LN-C", "Line C — 1000 ml", "FORMING", 1200)]
        log.append(("APPLY " if apply else "PLAN  ") + f"seed ProductionLine ({len(lines)} rows)")
        if apply:
            for pcode, code, name, lt, r in lines:
                cur.execute("SELECT id FROM sys_plant WHERE code=%s AND deleted_at IS NULL", (pcode,))
                row = cur.fetchone()
                if row:
                    cur.execute(
                        "INSERT INTO ProductionLine (PlantId,Code,Name,LineType,RatedOutputPerHour) VALUES (%s,%s,%s,%s,%s)",
                        (row[0], code, name, lt, r),
                    )

    # 3) WorkCentre (FK -> sys_plant.id, ProductionLine.Id) -----------------
    run(
        """CREATE TABLE IF NOT EXISTS WorkCentre (
          Id INT AUTO_INCREMENT PRIMARY KEY, PlantId BIGINT UNSIGNED NOT NULL, LineId INT NOT NULL,
          Code VARCHAR(50) NOT NULL, Name VARCHAR(150) NOT NULL, Type VARCHAR(50) NULL,
          CapacityPerHour DECIMAL(12,2) NULL, IsBottleneck TINYINT(1) NOT NULL DEFAULT 0,
          IsActive TINYINT(1) NOT NULL DEFAULT 1, IsDeleted TINYINT(1) NOT NULL DEFAULT 0,
          CreatedBy VARCHAR(100) NULL, CreatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ModifiedBy VARCHAR(100) NULL, ModifiedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_wc_line_code (LineId, Code), KEY ix_wc_plant (PlantId), KEY ix_wc_line (LineId),
          CONSTRAINT fk_wc_plant FOREIGN KEY (PlantId) REFERENCES sys_plant (id),
          CONSTRAINT fk_wc_line FOREIGN KEY (LineId) REFERENCES ProductionLine (Id)
        ) ENGINE=InnoDB""",
        "create table WorkCentre",
    )
    if row_count("WorkCentre") == 0:
        wcs = [("LN-A", "WC-01", "Deep Draw", "FORMING"), ("LN-A", "WC-02", "Trimming", "FORMING"),
               ("LN-A", "WC-03", "Assembly", "ASSEMBLY"), ("LN-B", "WC-01", "Deep Draw", "FORMING"),
               ("LN-B", "WC-02", "Polishing", "FINISHING"), ("LN-C", "WC-01", "Deep Draw", "FORMING"),
               ("LN-C", "WC-02", "Leak Test", "QC")]
        log.append(("APPLY " if apply else "PLAN  ") + f"seed WorkCentre ({len(wcs)} rows)")
        if apply:
            for lcode, code, name, typ in wcs:
                cur.execute("SELECT Id, PlantId FROM ProductionLine WHERE Code=%s", (lcode,))
                row = cur.fetchone()
                if row:
                    cur.execute(
                        "INSERT INTO WorkCentre (PlantId,LineId,Code,Name,Type) VALUES (%s,%s,%s,%s,%s)",
                        (row[1], row[0], code, name, typ),
                    )

    # 4) Machine: swap text columns for FK columns --------------------------
    adds = [("PlantId", "BIGINT UNSIGNED", "Name"), ("LineId", "INT", "PlantId"),
            ("WorkCentreId", "INT", "LineId"), ("MachineGroupId", "INT", "WorkCentreId")]
    for col, coltype, after in adds:
        if not col_exists("Machine", col):
            run(f"ALTER TABLE Machine ADD COLUMN {col} {coltype} NULL AFTER {after}", f"Machine add {col}")
    for old in ("PlantUid", "LineCode", "WorkCentreCode", "MachineGroup"):
        if col_exists("Machine", old):
            run(f"ALTER TABLE Machine DROP COLUMN {old}", f"Machine drop {old}")
    fks = [("fk_machine_plant", "PlantId", "sys_plant(id)"),
           ("fk_machine_line", "LineId", "ProductionLine(Id)"),
           ("fk_machine_wc", "WorkCentreId", "WorkCentre(Id)"),
           ("fk_machine_group", "MachineGroupId", "MachineGroup(Id)")]
    for name, col, ref in fks:
        if not fk_exists("Machine", name):
            run(f"ALTER TABLE Machine ADD CONSTRAINT {name} FOREIGN KEY ({col}) REFERENCES {ref}",
                f"Machine add {name}")

    # 5) List procedures for the new masters --------------------------------
    procs = {
        "SpMachineGroup": """CREATE PROCEDURE SpMachineGroup(IN p_Action VARCHAR(20))
BEGIN
  IF p_Action = 'LIST' THEN
    SELECT Id, Code, Name, Description, IsActive, IsDeleted FROM MachineGroup
    WHERE IsDeleted = 0 ORDER BY Name;
  END IF;
END""",
        "SpProductionLineByPlant": """CREATE PROCEDURE SpProductionLineByPlant(IN p_PlantId INT)
BEGIN
  SELECT Id, PlantId, Code, Name, LineType, RatedOutputPerHour, IsActive FROM ProductionLine
  WHERE IsDeleted = 0 AND (p_PlantId IS NULL OR PlantId = p_PlantId) ORDER BY Code;
END""",
        "SpWorkCentreByLine": """CREATE PROCEDURE SpWorkCentreByLine(IN p_LineId INT)
BEGIN
  SELECT Id, PlantId, LineId, Code, Name, Type, CapacityPerHour, IsBottleneck, IsActive FROM WorkCentre
  WHERE IsDeleted = 0 AND (p_LineId IS NULL OR LineId = p_LineId) ORDER BY Code;
END""",
    }
    for name, body in procs.items():
        log.append(("APPLY " if apply else "PLAN  ") + f"(re)create procedure {name}")
        if apply:
            cur.execute(f"DROP PROCEDURE IF EXISTS {name}")
            cur.execute(body)

    # 6) SpMachine rewritten (stores FKs, JOINs masters on read) ------------
    proj = """m.Id, m.Code, m.Name,
           m.MachineGroupId, g.Code AS MachineGroupCode, g.Name AS MachineGroup,
           m.PlantId, p.code AS PlantCode, p.name AS PlantName,
           m.LineId, l.Code AS LineCode, l.Name AS LineName,
           m.WorkCentreId, w.Code AS WorkCentreCode, w.Name AS WorkCentreName,
           m.Manufacturer, m.ModelNumber, m.SerialNumber, m.YearOfManufacture, m.AssetCode,
           m.CapacityPerHour, m.CapacityUom, m.PowerKw, m.OperatorsRequired, m.InstalledOn,
           m.WarrantyUntil, m.PmFrequencyDays, m.LastPmOn, m.NextPmOn, m.Criticality,
           m.CurrentState, m.OeePct, m.Operations, m.Status,
           m.CreatedBy, m.CreatedDate, m.ModifiedBy, m.ModifiedDate"""
    joins = """FROM Machine m
      LEFT JOIN MachineGroup g ON g.Id = m.MachineGroupId
      LEFT JOIN sys_plant p ON p.id = m.PlantId
      LEFT JOIN ProductionLine l ON l.Id = m.LineId
      LEFT JOIN WorkCentre w ON w.Id = m.WorkCentreId"""
    sp_machine = f"""CREATE PROCEDURE SpMachine(
      IN p_Action VARCHAR(20), IN p_Id INT, IN p_Code VARCHAR(50), IN p_Name VARCHAR(150),
      IN p_MachineGroupId INT, IN p_PlantId INT, IN p_LineId INT, IN p_WorkCentreId INT,
      IN p_Manufacturer VARCHAR(150), IN p_ModelNumber VARCHAR(100), IN p_SerialNumber VARCHAR(100),
      IN p_YearOfManufacture INT, IN p_AssetCode VARCHAR(100), IN p_CapacityPerHour DECIMAL(10,2),
      IN p_CapacityUom VARCHAR(20), IN p_PowerKw DECIMAL(10,2), IN p_OperatorsRequired INT,
      IN p_InstalledOn DATE, IN p_WarrantyUntil DATE, IN p_PmFrequencyDays INT, IN p_LastPmOn DATE,
      IN p_NextPmOn DATE, IN p_Criticality VARCHAR(10), IN p_CurrentState VARCHAR(30),
      IN p_OeePct DECIMAL(5,2), IN p_Operations TEXT, IN p_Status VARCHAR(30), IN p_ModifiedBy VARCHAR(100))
BEGIN
  IF p_Action = 'LIST' THEN
    SELECT {proj} {joins} WHERE m.IsDeleted = 0 ORDER BY m.Code ASC;
  ELSEIF p_Action = 'READ' THEN
    SELECT {proj} {joins} WHERE m.Id = p_Id AND m.IsDeleted = 0;
  ELSEIF p_Action = 'CREATE' THEN
    INSERT INTO Machine (Code, Name, MachineGroupId, PlantId, LineId, WorkCentreId,
      Manufacturer, ModelNumber, SerialNumber, YearOfManufacture, AssetCode, CapacityPerHour,
      CapacityUom, PowerKw, OperatorsRequired, InstalledOn, WarrantyUntil, PmFrequencyDays,
      LastPmOn, NextPmOn, Criticality, CurrentState, OeePct, Operations, Status, CreatedBy, ModifiedBy)
    VALUES (p_Code, p_Name, p_MachineGroupId, p_PlantId, p_LineId, p_WorkCentreId,
      p_Manufacturer, p_ModelNumber, p_SerialNumber, p_YearOfManufacture, p_AssetCode, p_CapacityPerHour,
      p_CapacityUom, p_PowerKw, p_OperatorsRequired, p_InstalledOn, p_WarrantyUntil, p_PmFrequencyDays,
      p_LastPmOn, p_NextPmOn, p_Criticality, p_CurrentState, p_OeePct, p_Operations,
      COALESCE(p_Status,'ACTIVE'), p_ModifiedBy, p_ModifiedBy);
    SELECT {proj} {joins} WHERE m.Id = LAST_INSERT_ID();
  ELSEIF p_Action = 'UPDATE' THEN
    UPDATE Machine SET
      Name = COALESCE(p_Name, Name), MachineGroupId = COALESCE(p_MachineGroupId, MachineGroupId),
      PlantId = COALESCE(p_PlantId, PlantId), LineId = COALESCE(p_LineId, LineId),
      WorkCentreId = COALESCE(p_WorkCentreId, WorkCentreId), Manufacturer = COALESCE(p_Manufacturer, Manufacturer),
      ModelNumber = p_ModelNumber, SerialNumber = p_SerialNumber, YearOfManufacture = p_YearOfManufacture,
      AssetCode = p_AssetCode, CapacityPerHour = COALESCE(p_CapacityPerHour, CapacityPerHour),
      CapacityUom = COALESCE(p_CapacityUom, CapacityUom), PowerKw = p_PowerKw,
      OperatorsRequired = COALESCE(p_OperatorsRequired, OperatorsRequired), InstalledOn = p_InstalledOn,
      WarrantyUntil = p_WarrantyUntil, PmFrequencyDays = COALESCE(p_PmFrequencyDays, PmFrequencyDays),
      LastPmOn = p_LastPmOn, NextPmOn = p_NextPmOn, Criticality = COALESCE(p_Criticality, Criticality),
      CurrentState = COALESCE(p_CurrentState, CurrentState), OeePct = COALESCE(p_OeePct, OeePct),
      Operations = p_Operations, Status = COALESCE(p_Status, Status),
      ModifiedBy = p_ModifiedBy, ModifiedDate = CURRENT_TIMESTAMP
    WHERE Id = p_Id AND IsDeleted = 0;
    SELECT {proj} {joins} WHERE m.Id = p_Id AND m.IsDeleted = 0;
  ELSEIF p_Action = 'DELETE' THEN
    UPDATE Machine SET IsDeleted = 1, ModifiedBy = p_ModifiedBy, ModifiedDate = CURRENT_TIMESTAMP WHERE Id = p_Id;
  END IF;
END"""
    log.append(("APPLY " if apply else "PLAN  ") + "(re)create procedure SpMachine")
    if apply:
        cur.execute("DROP PROCEDURE IF EXISTS SpMachine")
        cur.execute(sp_machine)

    if apply:
        conn.commit()
    conn.close()

    print(f"=== Machine master Option B : {'APPLIED' if apply else 'DRY RUN (no writes)'} ===")
    for line in log:
        print("  " + line)
    if not apply:
        print("\nRe-run with --apply to perform these changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
