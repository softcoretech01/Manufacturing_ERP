-- Undo the BOM retirement of 20260909T045913Z
UPDATE ERP_Product.EngineeringBom SET DeletedAt = NULL WHERE Id = 1;  -- BOM-0001
UPDATE ERP_Product.EngineeringBom SET DeletedAt = NULL WHERE Id = 2;  -- BOM-0002
