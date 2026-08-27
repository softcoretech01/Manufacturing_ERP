"""Create sys_security_policy_doc — persistence for the Security policy screen.

The screen currently keeps its settings in browser-local storage seeded from a
mock. This table gives it a real home: one JSON policy document per company,
optimistically versioned. Additive and idempotent.

    python scripts/create_security_policy_table.py          # dry run
    python scripts/create_security_policy_table.py --apply  # create the table
"""

from __future__ import annotations

import sys

import pymysql

DDL = """
CREATE TABLE IF NOT EXISTS `sys_security_policy_doc` (
  `Id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `CompanyUid` VARCHAR(64)     NOT NULL DEFAULT 'DEFAULT',
  `PolicyJson` LONGTEXT        NOT NULL,
  `Version`    INT             NOT NULL DEFAULT 1,
  `UpdatedBy`  VARCHAR(64)     NULL,
  `UpdatedAt`  DATETIME(6)     NOT NULL,
  UNIQUE KEY `uk_company` (`CompanyUid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
"""


def load_env(path: str = ".env") -> dict[str, str]:
    env: dict[str, str] = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def main() -> int:
    apply = "--apply" in sys.argv
    env = load_env()
    conn = pymysql.connect(
        host=env["DB_HOST"], port=int(env["DB_PORT"]),
        user=env["DB_USER"], password=env["DB_PASSWORD"],
        database="admin_erp", autocommit=False,
    )
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA='admin_erp' AND TABLE_NAME='sys_security_policy_doc'"
    )
    exists = cur.fetchone()[0] > 0
    if apply:
        cur.execute(DDL)
        conn.commit()
    conn.close()
    tag = "APPLIED" if apply else "DRY RUN"
    print(f"=== sys_security_policy_doc : {tag} ===")
    print("already existed" if exists else "created" if apply else "would be created")
    if not apply:
        print("\nRe-run with --apply to create the table.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
