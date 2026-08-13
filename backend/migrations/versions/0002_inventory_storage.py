"""inventory storage structure — zones, bins, and the bulk-bin procedure

Revision ID: 0002_inventory_storage
Revises: 0001_initial
Create Date: 2026-08-12

Adds the two levels below a warehouse (SRS Vol 4 Ch 1): `inv_zone` and `inv_bin`.
Both are created from the SQLAlchemy metadata so the DDL matches the models exactly
(same approach as 0001), including the generated `deleted_key` column and the
soft-delete-aware unique keys.

Also creates `sp_generate_bins`, the stored procedure behind bulk bin generation
(V4-WHS-FR-007): given aisle/rack/level/position counts it inserts every
`{AISLE}-{RACK}-{LEVEL}-{POS}` address (e.g. A-01-1-1) in one round-trip, skipping
any that already exist (INSERT IGNORE on the unique key), so re-running is safe.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.models import Base
from app.modules.inventory.infrastructure.models import InvBin, InvZone

revision: str = "0002_inventory_storage"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_SP_GENERATE_BINS = """
CREATE PROCEDURE sp_generate_bins(
    IN p_company_id   BIGINT UNSIGNED,
    IN p_warehouse_id BIGINT UNSIGNED,
    IN p_zone_id      BIGINT UNSIGNED,
    IN p_aisles       INT,
    IN p_racks        INT,
    IN p_levels       INT,
    IN p_positions    INT,
    IN p_bin_type     VARCHAR(30),
    IN p_user_id      BIGINT UNSIGNED
)
BEGIN
    DECLARE a INT DEFAULT 1;
    DECLARE r INT;
    DECLARE l INT;
    DECLARE p INT;
    DECLARE v_code VARCHAR(30);
    DECLARE v_now  DATETIME(6) DEFAULT UTC_TIMESTAMP(6);

    WHILE a <= p_aisles DO
        SET r = 1;
        WHILE r <= p_racks DO
            SET l = 1;
            WHILE l <= p_levels DO
                SET p = 1;
                WHILE p <= p_positions DO
                    SET v_code = CONCAT(CHAR(64 + a), '-', LPAD(r, 2, '0'), '-', l, '-', p);
                    INSERT IGNORE INTO inv_bin
                        (uid, company_id, warehouse_id, zone_id, code, bin_type,
                         pick_sequence, mixing_allowed, status, is_active, version,
                         created_at, created_by, updated_at, updated_by)
                    VALUES
                        (UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 26)),
                         p_company_id, p_warehouse_id, p_zone_id, v_code, p_bin_type,
                         0, 1, 'AVAILABLE', 1, 1,
                         v_now, p_user_id, v_now, p_user_id);
                    SET p = p + 1;
                END WHILE;
                SET l = l + 1;
            END WHILE;
            SET r = r + 1;
        END WHILE;
        SET a = a + 1;
    END WHILE;
END
"""


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, tables=[InvZone.__table__, InvBin.__table__])
    op.execute("DROP PROCEDURE IF EXISTS sp_generate_bins")
    op.execute(_SP_GENERATE_BINS)


def downgrade() -> None:
    op.execute("DROP PROCEDURE IF EXISTS sp_generate_bins")
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, tables=[InvBin.__table__, InvZone.__table__])
