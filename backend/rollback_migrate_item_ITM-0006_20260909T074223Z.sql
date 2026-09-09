-- Undo the migration of ITM-0006 at 20260909T074223Z.
-- Drop the foreign key first if it has been added, or this is refused.
DELETE FROM ERP_Master.Item WHERE Code = 'ITM-0006' AND IsDeleted = 1;
