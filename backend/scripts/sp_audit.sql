DELIMITER //

DROP PROCEDURE IF EXISTS SpManageAuditEntry//

CREATE PROCEDURE SpManageAuditEntry(
    IN p_Action VARCHAR(50),
    IN p_Uid VARCHAR(50),
    IN p_EntityType VARCHAR(100),
    IN p_EntityLabel VARCHAR(255),
    IN p_DocumentNo VARCHAR(100),
    IN p_EntryAction VARCHAR(50),
    IN p_Changes JSON,
    IN p_ReasonCode VARCHAR(100),
    IN p_Comments TEXT,
    IN p_UserName VARCHAR(100),
    IN p_RoleCode VARCHAR(50),
    IN p_IpAddress VARCHAR(100),
    IN p_UserAgent VARCHAR(255),
    IN p_Channel VARCHAR(100),
    IN p_CorrelationId VARCHAR(100),
    IN p_At DATETIME,
    IN p_UserId VARCHAR(100)
)
BEGIN
    IF p_Action = 'INSERT' THEN
        INSERT INTO AuditEntry (
            Uid, EntityType, EntityLabel, DocumentNo, Action,
            Changes, ReasonCode, Comments, UserName, RoleCode,
            IpAddress, UserAgent, Channel, CorrelationId, At,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        ) VALUES (
            p_Uid, p_EntityType, p_EntityLabel, p_DocumentNo, p_EntryAction,
            p_Changes, p_ReasonCode, p_Comments, p_UserName, p_RoleCode,
            p_IpAddress, p_UserAgent, p_Channel, p_CorrelationId, p_At,
            p_UserId, NOW(), p_UserId, NOW()
        );
        SELECT LAST_INSERT_ID() AS InsertedId;
    ELSEIF p_Action = 'SELECT_ALL' THEN
        SELECT 
            Uid, EntityType, EntityLabel, DocumentNo, Action,
            Changes, ReasonCode, Comments, UserName, RoleCode,
            IpAddress, UserAgent, Channel, CorrelationId, At,
            CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
        FROM AuditEntry
        ORDER BY At DESC;
    END IF;
END //

DELIMITER ;
