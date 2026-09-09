-- Undo the restore of ITM-0004 at 20260909T073551Z
UPDATE ERP_Master.Item SET IsDeleted = 1 WHERE Code = 'ITM-0004';
