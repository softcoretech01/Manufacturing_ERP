-- Undo the retirement of DOC-0004 at 20260909T074030Z
UPDATE ERP_Product.EngineeringDocument SET DeletedAt = NULL WHERE Id = 4;  -- DOC-0004
