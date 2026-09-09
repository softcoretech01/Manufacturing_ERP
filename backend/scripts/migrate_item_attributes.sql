-- ============================================================================
--  Populate the five bottle attributes on ERP_Master.Item
--  from evidence already present in the live, approved bills of material.
--
--  Scope  : 10 attribute cells on 5 items. Nothing else.
--  Safety : every statement is guarded so it touches exactly one item code and
--           only a currently empty cell. Running it twice changes nothing the
--           second time.
--
--  Representation: the five columns are VARCHAR/INT with no foreign key. We
--  store the MASTER CODE (COL-0002, LID-0002, GRD-0001) rather than the label,
--  so a rename in the master cannot silently detach the item. CapacityMl is
--  int(11) and stays a plain number, matching admin_erp.BottleCapacity.NominalMl.
--
--  NOT touched by this migration:
--    ITM-0004            -- inactive test row, its three values are invalid
--    BottleModel         -- no authoritative evidence for any item
--    FG-SS-500-BLU       -- its only BOM contradicts its own identity
--    FG-SS-1000-STL      -- Colour and SteelGrade need business confirmation
--    SF-BODY-1000        -- SteelGrade needs business confirmation
--  Nothing outside ERP_Master.Item is read or written. No BOM, routing, MPS,
--  costing, engineering document, item code, type, UOM, category or delete flag
--  is modified.
-- ============================================================================

START TRANSACTION;

-- ── FG-SS-750-BLK ───────────────────────────────────────────────────────────
-- Capacity  : code and name both state 750 ml; default BOM consumes SF-BODY-750;
--             admin_erp.BottleCapacity CAP-0003 NominalMl = 750.
-- Colour    : ACTIVE BOM rev 3 issues CON-PWD-BLK "Powder Coating - Matte Black
--             RAL 9005". COL-0002 is the only colour row carrying RalCode RAL 9005.
-- LidType   : BOM consumes SF-LID-ASSY-SS, a stainless screw cap assembly.
--             LID-0002 is the only row with ClosureType = SCREW.
-- SteelGrade: SF-BODY-750 is drawn from RM-SS304-050 "SS 304 Coil 0.50 mm".
--             Its only other steel input, CMP-DISC-BOT-73, is also SS 304.
UPDATE ERP_Master.Item
   SET CapacityMl = 750
 WHERE Code = 'FG-SS-750-BLK' AND IsDeleted = 0 AND CapacityMl IS NULL;

UPDATE ERP_Master.Item
   SET Colour = 'COL-0002'
 WHERE Code = 'FG-SS-750-BLK' AND IsDeleted = 0
   AND (Colour IS NULL OR Colour = '');

UPDATE ERP_Master.Item
   SET LidType = 'LID-0002'
 WHERE Code = 'FG-SS-750-BLK' AND IsDeleted = 0
   AND (LidType IS NULL OR LidType = '');

UPDATE ERP_Master.Item
   SET SteelGrade = 'GRD-0001'
 WHERE Code = 'FG-SS-750-BLK' AND IsDeleted = 0
   AND (SteelGrade IS NULL OR SteelGrade = '');

-- ── FG-SS-1000-STL ──────────────────────────────────────────────────────────
-- Capacity : code and name state 1000 ml; BOM consumes SF-BODY-1000;
--            CAP-0004 NominalMl = 1000.
-- LidType  : BOM consumes CMP-LID-SIPPER "Sipper Cap Assembly".
--            LID-0004 is the only row with ClosureType = SIPPER.
-- Colour and SteelGrade are deliberately absent -- see the confirmation report.
UPDATE ERP_Master.Item
   SET CapacityMl = 1000
 WHERE Code = 'FG-SS-1000-STL' AND IsDeleted = 0 AND CapacityMl IS NULL;

UPDATE ERP_Master.Item
   SET LidType = 'LID-0004'
 WHERE Code = 'FG-SS-1000-STL' AND IsDeleted = 0
   AND (LidType IS NULL OR LidType = '');

-- ── SF-BODY-750 ─────────────────────────────────────────────────────────────
-- Capacity  : code and name state 750 ml; it is the shell the 750 flask consumes.
-- SteelGrade: ACTIVE BOM rev 2 draws RM-SS304-050 "SS 304 Coil 0.50 mm x 400 mm".
--             Every steel input in the structure is SS 304, so the grade is
--             unambiguous at product level.
UPDATE ERP_Master.Item
   SET CapacityMl = 750
 WHERE Code = 'SF-BODY-750' AND IsDeleted = 0 AND CapacityMl IS NULL;

UPDATE ERP_Master.Item
   SET SteelGrade = 'GRD-0001'
 WHERE Code = 'SF-BODY-750' AND IsDeleted = 0
   AND (SteelGrade IS NULL OR SteelGrade = '');

-- ── SF-BODY-1000 ────────────────────────────────────────────────────────────
-- Capacity only. SteelGrade is withheld: the structure draws an SS 316 coil but
-- also consumes an SS 304 bottom disc, so the product-level grade is not proven.
UPDATE ERP_Master.Item
   SET CapacityMl = 1000
 WHERE Code = 'SF-BODY-1000' AND IsDeleted = 0 AND CapacityMl IS NULL;

-- ── SF-LID-ASSY-SS ──────────────────────────────────────────────────────────
-- LidType: the item's own name and its BOM component CMP-LID-SCR-SS both state a
--          stainless screw cap. LID-0002 is the only ClosureType = SCREW row and
--          its Material = STAINLESS agrees.
-- No capacity: a lid assembly has no fill volume.
UPDATE ERP_Master.Item
   SET LidType = 'LID-0002'
 WHERE Code = 'SF-LID-ASSY-SS' AND IsDeleted = 0
   AND (LidType IS NULL OR LidType = '');

COMMIT;

-- ============================================================================
--  REVERSAL
--  Clears only the exact 10 cells this migration sets, and only where the value
--  is still the one written here. A later manual correction is therefore never
--  discarded by the rollback.
-- ============================================================================
-- START TRANSACTION;
-- UPDATE ERP_Master.Item SET CapacityMl = NULL WHERE Code = 'FG-SS-750-BLK'  AND CapacityMl = 750;
-- UPDATE ERP_Master.Item SET Colour     = NULL WHERE Code = 'FG-SS-750-BLK'  AND Colour     = 'COL-0002';
-- UPDATE ERP_Master.Item SET LidType    = NULL WHERE Code = 'FG-SS-750-BLK'  AND LidType    = 'LID-0002';
-- UPDATE ERP_Master.Item SET SteelGrade = NULL WHERE Code = 'FG-SS-750-BLK'  AND SteelGrade = 'GRD-0001';
-- UPDATE ERP_Master.Item SET CapacityMl = NULL WHERE Code = 'FG-SS-1000-STL' AND CapacityMl = 1000;
-- UPDATE ERP_Master.Item SET LidType    = NULL WHERE Code = 'FG-SS-1000-STL' AND LidType    = 'LID-0004';
-- UPDATE ERP_Master.Item SET CapacityMl = NULL WHERE Code = 'SF-BODY-750'    AND CapacityMl = 750;
-- UPDATE ERP_Master.Item SET SteelGrade = NULL WHERE Code = 'SF-BODY-750'    AND SteelGrade = 'GRD-0001';
-- UPDATE ERP_Master.Item SET CapacityMl = NULL WHERE Code = 'SF-BODY-1000'   AND CapacityMl = 1000;
-- UPDATE ERP_Master.Item SET LidType    = NULL WHERE Code = 'SF-LID-ASSY-SS' AND LidType    = 'LID-0002';
-- COMMIT;
