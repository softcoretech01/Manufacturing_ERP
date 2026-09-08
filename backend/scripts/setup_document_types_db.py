"""Create and seed ERP_Product.DocumentType -- the document-type master.

Document types used to be a hardcoded array in the React page
(`pages/engineering/Documents.tsx`), duplicated again in `pages/admin/Attachments.tsx`
and `lib/platformFlow.ts`. Adding a type meant a code change and a frontend build,
and the API accepted any string at all. This makes it configurable master data
(CLAUDE.md section 5.1) and lets the write path validate against it.

Two deliberate schema choices:

* `utf8mb4_general_ci`, matching EngineeringDocument -- the two tables are joined on
  their code columns, and a collation mismatch here would raise "Illegal mix of
  collations" exactly as EngineeringOperation/EngineeringWorkCentre already do.
* `IsActive TINYINT(1)`, not `BIT(1)` as the older setup scripts use. The driver
  returns BIT(1) as ``b'\\x00'``, and ``bool(b'\\x00')`` is True, so every retired
  row would read as active.

Idempotent: re-running leaves existing rows untouched.

Run:  python -m scripts.setup_document_types_db
      python -m scripts.setup_document_types_db --with-fk   # also add the FK
"""

from __future__ import annotations

import argparse
import asyncio
import os

import pymysql
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "ssberp")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ssberp")
DB_NAME = "ERP_Product"

SEED_USER = "system-seed"

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS DocumentType (
    Id            INT AUTO_INCREMENT PRIMARY KEY,
    Code          VARCHAR(50)  NOT NULL,
    Name          VARCHAR(150) NOT NULL,
    Description   VARCHAR(500) NULL,
    RetentionRule VARCHAR(150) NULL,
    IsVersioned   TINYINT(1)   NOT NULL DEFAULT 0,
    SortOrder     INT          NOT NULL DEFAULT 0,
    IsActive      TINYINT(1)   NOT NULL DEFAULT 1,
    CreatedBy     VARCHAR(100) NOT NULL,
    CreatedDate   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ModifiedBy    VARCHAR(100) NULL,
    ModifiedDate  DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_documenttype_code (Code),
    KEY ix_documenttype_active (IsActive, SortOrder)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
"""

# (Code, Name, Description, RetentionRule, IsVersioned, SortOrder)
# Order and labels are exactly what the React page hardcoded, so the dropdown does
# not change appearance. Retention/versioned come from the admin attachment policy
# (pages/admin/Attachments.tsx) where the two lists already agreed on a code.
SEED = [
    ("CAD_DRAWING", "CAD drawing",
     "Native CAD source file (DWG, SLDPRT).", "Superseded + 7 years", 1, 10),
    ("MODEL_3D", "3D model",
     "Neutral 3D exchange format (STEP, IGES).", "Superseded + 7 years", 1, 20),
    ("PDF_DRAWING", "PDF drawing",
     "Released drawing issued to the shop floor or a supplier.", "Superseded + 7 years", 1, 30),
    ("SOP", "Standard operating procedure",
     "Controlled procedure governing how an operation is performed.",
     "Superseded + 3 years", 1, 40),
    ("WORK_INSTRUCTION", "Work instruction",
     "Step-level instruction issued against a routing operation.",
     "Superseded + 3 years", 1, 50),
    ("CUSTOMER_SPEC", "Customer specification",
     "Specification supplied by the customer for a product.", "Contract term + 7 years", 1, 60),
    ("CERTIFICATE", "Certificate",
     "Test or material certificate evidencing conformity.", "8 years (statutory)", 0, 70),
    ("DATASHEET", "Datasheet",
     "Manufacturer or supplier datasheet for a component.", "Superseded + 3 years", 0, 80),
    ("IMAGE", "Image",
     "Photograph or rendered image of the product.", "3 years", 0, 90),
]

ADD_FK = """
ALTER TABLE EngineeringDocument
  ADD CONSTRAINT fk_engdoc_doctype
  FOREIGN KEY (DocType) REFERENCES DocumentType (Code)
  ON UPDATE CASCADE ON DELETE RESTRICT
"""


async def setup(with_fk: bool) -> None:
    conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                           password=DB_PASSWORD, autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
            cur.execute(f"USE {DB_NAME}")
            cur.execute(CREATE_TABLE)
            print("Table DocumentType is present.")

            cur.execute("SELECT Code FROM DocumentType")
            existing = {r[0] for r in cur.fetchall()}

            inserted = 0
            for code, name, desc, retention, versioned, order in SEED:
                if code in existing:
                    continue
                cur.execute(
                    "INSERT INTO DocumentType"
                    " (Code, Name, Description, RetentionRule, IsVersioned,"
                    "  SortOrder, IsActive, CreatedBy)"
                    " VALUES (%s, %s, %s, %s, %s, %s, 1, %s)",
                    (code, name, desc, retention, versioned, order, SEED_USER),
                )
                inserted += 1
            print(f"Seeded {inserted} type(s), {len(SEED) - inserted} already present.")

            # Any type already used by a document but missing from the master would
            # break the FK, so surface it rather than failing halfway.
            cur.execute("SELECT DISTINCT DocType FROM EngineeringDocument")
            used = {r[0] for r in cur.fetchall() if r[0]}
            cur.execute("SELECT Code FROM DocumentType")
            mastered = {r[0] for r in cur.fetchall()}
            orphans = sorted(used - mastered)
            if orphans:
                print("WARNING: documents reference types with no master row: "
                      + ", ".join(orphans))

            if with_fk:
                if orphans:
                    print("Refusing to add the foreign key while orphans exist.")
                    return
                cur.execute(
                    "SELECT COUNT(*) FROM information_schema.table_constraints"
                    " WHERE table_schema = %s AND table_name = 'EngineeringDocument'"
                    "   AND constraint_name = 'fk_engdoc_doctype'", (DB_NAME,))
                if cur.fetchone()[0]:
                    print("Foreign key fk_engdoc_doctype already exists.")
                else:
                    cur.execute(ADD_FK)
                    print("Added foreign key fk_engdoc_doctype.")

            cur.execute("SELECT Code, Name, IsActive FROM DocumentType ORDER BY SortOrder")
            print("\nDocumentType master:")
            for code, name, active in cur.fetchall():
                print(f"  {code:<18} {name:<32} active={bool(active)}")
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--with-fk", action="store_true",
                        help="also add the EngineeringDocument.DocType foreign key")
    args = parser.parse_args()
    asyncio.run(setup(args.with_fk))
