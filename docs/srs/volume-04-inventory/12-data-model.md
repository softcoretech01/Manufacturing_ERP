# Volume 4 · Chapter 12 — Data Model

Prefix: `inv_` (Vol 0 §7.2)
Every table carries the **standard column block** (Vol 0 V0-DR-002) — `id`, `uid`, `company_id`,
`version`, `created_*`, `updated_*`, `deleted_*`, `deleted_key` — shown below as `<std>` and never
repeated. Every line table carries `line_no` with `UNIQUE (parent_id, line_no, deleted_key)`.
Types follow Vol 0 §7.4: quantity and rate `DECIMAL(18,6)`, amount `DECIMAL(18,2)`, percentage
`DECIMAL(9,4)`, weight `DECIMAL(18,4)`, timestamps `DATETIME(6)` UTC, business dates `DATE`.

---

## 12.1 Entity map

```
  mst_item (Vol 1)     org_warehouse (Vol 1)          org_bin (Vol 1)
        │                     │                             │
        └──────────┬──────────┴──────────────┬──────────────┘
                   │                         │
             inv_stock_balance ◄────────────►inv_stock_ledger        (the two core tables)
                   │  ▲                              ▲
                   │  │                              │ every movement
                   │  └── inv_stock_reservation      │
                   │                                 │
        ┌──────────┴───────────┬─────────────────────┴──────────┬──────────────────┐
        │                      │                                │                  │
  inv_batch ──1..n──► inv_batch_attachment            inv_serial               inv_valuation_layer
        │  └──1..n──► inv_batch_genealogy (parent ↔ child)                     (FIFO layers)
        │
   Documents (all carry the Vol 0 §10 governance envelope)
        │
   inv_putaway ──────────1..n──► inv_putaway_item
   inv_receipt ──────────1..n──► inv_receipt_item ──1..n──► inv_receipt_item_serial
   inv_requisition ──────1..n──► inv_requisition_item
   inv_material_issue ───1..n──► inv_material_issue_item ──1..n──► inv_issue_item_serial
        └──1..n──► inv_pick_list ──1..n──► inv_pick_list_item
   inv_material_return ──1..n──► inv_material_return_item
   inv_transfer ─────────1..n──► inv_transfer_item ──1..n──► inv_transfer_receipt_item
        └──1..n──► inv_jobwork_challan ──1..n──► inv_jobwork_challan_item
                        └──1..n──► inv_jobwork_reconciliation
   inv_adjustment ───────1..n──► inv_adjustment_item
   inv_scrap_note ───────1..n──► inv_scrap_note_item
   inv_write_off ────────1..n──► inv_write_off_item
   inv_revaluation ──────1..n──► inv_revaluation_item
   inv_count ────────────1..n──► inv_count_item ──1..n──► inv_count_item_pass
        └──1..n──► inv_count_freeze

  Configuration
   inv_movement_type · inv_parameter · inv_putaway_strategy · inv_pick_strategy
   inv_item_warehouse (reorder, min/max, ABC/XYZ, fixed bin, valuation method)
   inv_reason_code_map (→ mst_reason_code) · inv_landed_cost_component · inv_count_plan
```

External references, never joined in a write path (CLAUDE.md §3.3): `mst_item`, `mst_uom`,
`mst_reason_code`, `org_warehouse`, `org_bin`, `org_plant`, `org_cost_centre`, `prc_grn`,
`prd_production_order`, `sls_sales_order`, `qc_inspection`. Each is reached through the owning
module's application service or a read-only query interface.

## 12.2 The two core tables

### `inv_stock_balance` — one row per location key

```sql
CREATE TABLE inv_stock_balance (
  <std>,
  plant_id            BIGINT UNSIGNED NOT NULL,
  warehouse_id        BIGINT UNSIGNED NOT NULL,
  bin_id              BIGINT UNSIGNED NULL,          -- NULL = non-bin-managed warehouse
  item_id             BIGINT UNSIGNED NOT NULL,
  batch_id            BIGINT UNSIGNED NULL,          -- NULL = non-batch item
  stock_status        ENUM('AVAILABLE','QUARANTINE','BLOCKED','REJECTED','IN_TRANSIT',
                           'AT_SUBCONTRACTOR','EXPIRED','SAMPLE') NOT NULL,
  quantity            DECIMAL(18,6) NOT NULL DEFAULT 0,
  reserved_quantity   DECIMAL(18,6) NOT NULL DEFAULT 0,   -- Σ open reservations, maintained
  allocated_quantity  DECIMAL(18,6) NOT NULL DEFAULT 0,   -- hard picks in progress
  alt_quantity        DECIMAL(18,6) NULL,                 -- dual-UOM display quantity
  alt_uom_id          BIGINT UNSIGNED NULL,
  last_movement_at    DATETIME(6) NULL,
  last_count_at       DATETIME(6) NULL,
  -- value is NOT held here; see inv_valuation (12.3)
  UNIQUE KEY uk_balance (company_id, warehouse_id, bin_id, item_id, batch_id,
                         stock_status, deleted_key),
  KEY ix_balance_item   (company_id, item_id, plant_id, stock_status),
  KEY ix_balance_wh     (company_id, warehouse_id, item_id),
  KEY ix_balance_batch  (company_id, batch_id),
  KEY ix_balance_nonzero(company_id, item_id, quantity)
) ENGINE=InnoDB;
```

**V4-INV-DR-001 (M)** A balance row is created on first movement and never deleted, even at zero
quantity — a zero row carries `last_movement_at` and `last_count_at`, which the count plan and the
non-moving analysis both need.

**V4-INV-DR-002 (M)** `reserved_quantity` and `allocated_quantity` are **maintained** columns kept
in step with `inv_stock_reservation` in the same transaction, not computed on read. The nightly
consistency job verifies them.

### `inv_stock_ledger` — append-only, the system of record

```sql
CREATE TABLE inv_stock_ledger (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uid                 CHAR(26) NOT NULL,
  company_id          BIGINT UNSIGNED NOT NULL,
  plant_id            BIGINT UNSIGNED NOT NULL,
  warehouse_id        BIGINT UNSIGNED NOT NULL,
  bin_id              BIGINT UNSIGNED NULL,
  item_id             BIGINT UNSIGNED NOT NULL,
  batch_id            BIGINT UNSIGNED NULL,
  serial_id           BIGINT UNSIGNED NULL,
  stock_status_from   VARCHAR(20) NULL,
  stock_status_to     VARCHAR(20) NOT NULL,
  movement_type_code  CHAR(3) NOT NULL,              -- 101 … 602, see inv_movement_type
  direction           ENUM('IN','OUT','STATUS','VALUE') NOT NULL,
  quantity            DECIMAL(18,6) NOT NULL,        -- always positive; direction carries the sign
  alt_quantity        DECIMAL(18,6) NULL,
  uom_conversion      DECIMAL(18,8) NULL,            -- factor used at THIS movement
  rate                DECIMAL(18,6) NULL,            -- valuation rate applied
  value               DECIMAL(18,2) NULL,
  running_quantity    DECIMAL(18,6) NOT NULL,        -- balance at this location AFTER the movement
  running_value       DECIMAL(18,2) NULL,
  source_module       VARCHAR(24) NOT NULL,          -- INVENTORY | PROCUREMENT | PRODUCTION | …
  source_doc_type     VARCHAR(32) NOT NULL,
  source_doc_id       BIGINT UNSIGNED NOT NULL,
  source_doc_no       VARCHAR(40) NOT NULL,
  source_line_id      BIGINT UNSIGNED NULL,
  reverses_ledger_id  BIGINT UNSIGNED NULL,          -- correcting entries point at the original
  reason_code_id      BIGINT UNSIGNED NULL,
  business_date       DATE NOT NULL,
  posted_at           DATETIME(6) NOT NULL,
  posted_by           BIGINT UNSIGNED NOT NULL,
  correlation_id      CHAR(26) NOT NULL,
  idempotency_key     VARCHAR(64) NULL,
  UNIQUE KEY uk_ledger_idem (company_id, idempotency_key),
  KEY ix_ledger_loc   (company_id, warehouse_id, item_id, batch_id, posted_at),
  KEY ix_ledger_item  (company_id, item_id, business_date),
  KEY ix_ledger_doc   (company_id, source_doc_type, source_doc_id),
  KEY ix_ledger_batch (company_id, batch_id, posted_at),
  KEY ix_ledger_date  (company_id, business_date, movement_type_code)
) ENGINE=InnoDB
  PARTITION BY RANGE (TO_DAYS(business_date)) ( … yearly partitions … );
```

**V4-INV-DR-003 (M)** No `UPDATE` and no `DELETE` on `inv_stock_ledger`. The application database
user is granted `INSERT` and `SELECT` only (CLAUDE.md §5.3 pattern, extended to the ledger). There
is no soft-delete column because there is no deletion.

**V4-INV-DR-004 (M)** The ledger is partitioned by business date and is expected to exceed 10 M
rows within three years; every migration touching it must use an online-DDL pattern (CLAUDE.md
§9.6).

## 12.3 Valuation

```sql
CREATE TABLE inv_valuation (              -- current valuation state per valuation key
  <std>,
  plant_id        BIGINT UNSIGNED NOT NULL,
  warehouse_id    BIGINT UNSIGNED NULL,   -- NULL when valuation level is item × plant
  item_id         BIGINT UNSIGNED NOT NULL,
  batch_id        BIGINT UNSIGNED NULL,   -- only for SPECIFIC valuation
  method          ENUM('WEIGHTED_AVG','FIFO','STANDARD','SPECIFIC') NOT NULL,
  quantity        DECIMAL(18,6) NOT NULL DEFAULT 0,
  value           DECIMAL(18,2) NOT NULL DEFAULT 0,
  rate            DECIMAL(18,6) NOT NULL DEFAULT 0,   -- moving average / standard
  standard_rate   DECIMAL(18,6) NULL,
  effective_from  DATE NOT NULL,
  UNIQUE KEY uk_valuation (company_id, plant_id, warehouse_id, item_id, batch_id, deleted_key),
  KEY ix_valuation_item (company_id, item_id)
) ENGINE=InnoDB;

CREATE TABLE inv_valuation_layer (        -- FIFO layers; one row per receipt layer
  <std>,
  valuation_id    BIGINT UNSIGNED NOT NULL,
  batch_id        BIGINT UNSIGNED NULL,
  received_at     DATETIME(6) NOT NULL,
  quantity_in     DECIMAL(18,6) NOT NULL,
  quantity_left   DECIMAL(18,6) NOT NULL,
  rate            DECIMAL(18,6) NOT NULL,
  source_ledger_id BIGINT UNSIGNED NOT NULL,
  KEY ix_layer_fifo (company_id, valuation_id, received_at, quantity_left)
) ENGINE=InnoDB;
```

**V4-INV-DR-005 (M)** Value lives here, never on `inv_stock_balance`. A bin transfer therefore
cannot change value by construction (V4-STK-FR-003).

## 12.4 Batch, serial and genealogy

```sql
CREATE TABLE inv_batch (
  <std>,
  batch_no          VARCHAR(40) NOT NULL,          -- from the numbering engine
  item_id           BIGINT UNSIGNED NOT NULL,
  supplier_batch_no VARCHAR(60) NULL,              -- heat number / supplier lot
  supplier_id       BIGINT UNSIGNED NULL,
  manufactured_on   DATE NULL,
  received_on       DATE NULL,
  expires_on        DATE NULL,
  original_expiry   DATE NULL,                     -- retained when extended
  quantity_received DECIMAL(18,6) NOT NULL DEFAULT 0,
  status            ENUM('ACTIVE','QUARANTINE','BLOCKED','EXPIRED','CONSUMED','RECALLED') NOT NULL,
  qc_status         ENUM('PENDING','ACCEPTED','REJECTED','DEVIATION_ACCEPTED','NOT_REQUIRED') NOT NULL,
  qc_inspection_id  BIGINT UNSIGNED NULL,
  block_reason_id   BIGINT UNSIGNED NULL,
  -- steel-specific
  steel_grade       VARCHAR(20) NULL,
  thickness_mm      DECIMAL(12,3) NULL,
  width_mm          DECIMAL(12,3) NULL,
  coil_weight_kg    DECIMAL(18,4) NULL,
  mtc_no            VARCHAR(60) NULL,
  mtc_verified      TINYINT(1) NOT NULL DEFAULT 0,
  source_doc_type   VARCHAR(32) NULL,
  source_doc_no     VARCHAR(40) NULL,
  UNIQUE KEY uk_batch (company_id, item_id, batch_no, deleted_key),
  KEY ix_batch_supplier (company_id, supplier_batch_no),
  KEY ix_batch_expiry   (company_id, expires_on, status)
) ENGINE=InnoDB;

CREATE TABLE inv_serial (
  <std>,
  serial_no        VARCHAR(60) NOT NULL,
  item_id          BIGINT UNSIGNED NOT NULL,
  batch_id         BIGINT UNSIGNED NULL,
  status           ENUM('IN_STOCK','ALLOCATED','DISPATCHED','SOLD','RETURNED','SCRAPPED',
                        'IN_SERVICE') NOT NULL,
  warehouse_id     BIGINT UNSIGNED NULL,
  bin_id           BIGINT UNSIGNED NULL,
  production_order_no VARCHAR(40) NULL,
  manufactured_on  DATE NULL,
  carton_no        VARCHAR(40) NULL,
  sales_doc_no     VARCHAR(40) NULL,
  customer_id      BIGINT UNSIGNED NULL,
  dispatched_on    DATE NULL,
  warranty_from    DATE NULL,
  warranty_to      DATE NULL,
  UNIQUE KEY uk_serial (company_id, serial_no, deleted_key),
  KEY ix_serial_batch (company_id, batch_id),
  KEY ix_serial_status(company_id, item_id, status)
) ENGINE=InnoDB;

CREATE TABLE inv_batch_genealogy (
  <std>,
  parent_batch_id  BIGINT UNSIGNED NOT NULL,
  child_batch_id   BIGINT UNSIGNED NOT NULL,
  quantity_consumed DECIMAL(18,6) NOT NULL,
  source_doc_type  VARCHAR(32) NOT NULL,
  source_doc_no    VARCHAR(40) NOT NULL,
  consumed_at      DATETIME(6) NOT NULL,
  UNIQUE KEY uk_genealogy (company_id, parent_batch_id, child_batch_id, source_doc_no, deleted_key),
  KEY ix_gen_child  (company_id, child_batch_id),
  KEY ix_gen_parent (company_id, parent_batch_id)
) ENGINE=InnoDB;
```

**V4-INV-DR-006 (M)** Genealogy rows are written in the same transaction as the consumption
ledger row that creates them (V4-BAT-BR-008). A cycle check (`parent ≠ child`, and no path from
child back to parent) is enforced before insert.

## 12.5 Reservations

```sql
CREATE TABLE inv_stock_reservation (
  <std>,
  plant_id       BIGINT UNSIGNED NOT NULL,
  warehouse_id   BIGINT UNSIGNED NOT NULL,
  bin_id         BIGINT UNSIGNED NULL,        -- set only when hard-allocated
  item_id        BIGINT UNSIGNED NOT NULL,
  batch_id       BIGINT UNSIGNED NULL,        -- set only when hard-allocated
  quantity       DECIMAL(18,6) NOT NULL,
  consumed_qty   DECIMAL(18,6) NOT NULL DEFAULT 0,
  state          ENUM('RESERVED','ALLOCATED','CONSUMED','RELEASED','EXPIRED') NOT NULL,
  priority       ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  demand_type    ENUM('SALES_ORDER','PRODUCTION_ORDER','TRANSFER','SAMPLE','MANUAL') NOT NULL,
  demand_doc_no  VARCHAR(40) NOT NULL,
  demand_line_id BIGINT UNSIGNED NULL,
  required_on    DATE NOT NULL,
  expires_on     DATE NOT NULL,
  released_by    BIGINT UNSIGNED NULL,
  release_reason_id BIGINT UNSIGNED NULL,
  KEY ix_resv_item  (company_id, item_id, warehouse_id, state),
  KEY ix_resv_demand(company_id, demand_type, demand_doc_no),
  KEY ix_resv_expiry(company_id, state, expires_on)
) ENGINE=InnoDB;
```

## 12.6 Document tables (shape summary)

Each document header carries the Vol 0 §10 envelope — `doc_no`, `doc_date`, `status`,
`workflow_instance_id`, `revision`, `amended_from_id`, `cancel_reason_id`, `remarks` — plus:

| Table | Header-specific columns | Line-specific columns |
|---|---|---|
| `inv_receipt` | `receipt_type`, `source_module`, `source_doc_no`, `warehouse_id`, `inspection_required`, `inspection_decision_source` | `item_id`, `batch_id`, `quantity`, `rate`, `value`, `stock_status`, `expires_on`, `mtc_no` |
| `inv_putaway` | `receipt_id`, `warehouse_id`, `strategy_code`, `completed_at` | `receipt_item_id`, `batch_id`, `quantity`, `from_bin_id`, `to_bin_id`, `proposed_bin_id`, `override_reason_id`, `handling_unit` |
| `inv_requisition` | `department_id`, `cost_centre_id`, `production_order_no`, `required_on`, `shift_id`, `priority` | `item_id`, `quantity`, `uom_id`, `bom_standard_qty`, `issued_qty`, `line_status` |
| `inv_material_issue` | `charge_type`, `production_order_no`, `operation_code`, `cost_centre_id`, `requisition_id`, `issued_to_employee_id`, `from_warehouse_id`, `total_value` | `item_id`, `bin_id`, `batch_id`, `quantity`, `uom_id`, `uom_conversion`, `rate`, `value`, `bom_standard_qty`, `over_issue_reason_id`, `fefo_override` |
| `inv_material_return` | `issue_id`, `returned_by_employee_id`, `to_warehouse_id` | `issue_item_id`, `batch_id`, `quantity`, `condition`, `weighment_ref`, `to_bin_id` |
| `inv_transfer` | `transfer_type`, `from_plant_id`, `from_warehouse_id`, `to_plant_id`, `to_warehouse_id`, `vehicle_no`, `transporter_id`, `lr_no`, `eway_bill_no`, `eway_valid_to`, `expected_on`, `dispatched_at`, `received_at`, `is_distinct_person`, `taxable_value` | `item_id`, `from_bin_id`, `to_bin_id`, `batch_id`, `quantity`, `received_qty`, `short_qty`, `damage_qty`, `variance_reason_id` |
| `inv_jobwork_challan` | `vendor_id`, `subcontract_po_no`, `process`, `expected_return_on`, `process_loss_pct`, `statutory_due_on` | `item_id`, `batch_id`, `issued_qty`, `expected_return_qty`, `returned_qty`, `scrap_returned_qty`, `balance_qty` |
| `inv_adjustment` | `category`, `warehouse_id`, `reference`, `net_value_impact` | `item_id`, `bin_id`, `batch_id`, `system_qty_at_create`, `physical_qty`, `delta_qty`, `reason_code_id`, `note`, `value_impact` |
| `inv_scrap_note` | `source`, `production_order_no`, `operation_code`, `defect_code`, `cost_centre_id`, `responsible_shift_id` | `item_id`, `batch_id`, `quantity`, `book_value`, `scrap_item_id`, `scrap_quantity`, `nrv_rate` |
| `inv_write_off` | `category`, `provision_held`, `accounting_treatment` | `item_id`, `batch_id`, `quantity`, `value`, `reason_code_id` |
| `inv_revaluation` | `reason`, `basis`, `total_value_change` | `item_id`, `batch_id`, `old_rate`, `new_rate`, `quantity`, `value_change` |
| `inv_count` | `count_type`, `plan_id`, `warehouse_id`, `scope_json`, `counter_user_id`, `due_on`, `freeze_id`, `accuracy_pct`, `net_variance_value` | `bin_id`, `item_id`, `batch_id`, `system_qty`, `counted_qty`, `variance_qty`, `variance_value`, `reason_code_id`, `root_cause`, `is_found_stock` |
| `inv_count_item_pass` | — | `count_item_id`, `pass_no`, `counted_qty`, `counted_by`, `counted_at`, `device_id` |

**V4-INV-DR-007 (M)** `inv_count_item.system_qty` is populated only at submission. Before that it
is `NULL` in the database as well as in the API, so a blind count cannot leak through a query
(V4-CNT-BR-002).

## 12.7 Configuration tables

| Table | Purpose | Key columns |
|---|---|---|
| `inv_movement_type` | The catalogue in README §2.3 | `code`, `name`, `direction`, `value_effect`, `requires_approval`, `gl_group`, `is_active` |
| `inv_item_warehouse` | Per item × warehouse operating parameters | `item_id`, `warehouse_id`, `fixed_bin_id`, `min_level`, `reorder_level`, `reorder_qty`, `max_level`, `safety_stock`, `abc_class`, `xyz_class`, `valuation_method`, `is_manual_override`, `override_reason`, `last_reviewed_on` |
| `inv_putaway_strategy` / `inv_pick_strategy` | Strategy per warehouse with item-category overrides | `warehouse_id`, `item_category_id`, `strategy_code`, `effective_from` |
| `inv_count_plan` | ABC frequency, tolerance, coverage targets | `abc_class`, `frequency_days`, `tolerance_pct`, `tolerance_value`, `service_level_z` |
| `inv_parameter` | Company/plant switches | `key`, `value`, `scope`, e.g. `allow_negative_stock`, `allow_self_issue`, `putaway_sla_hours`, `git_ageing_days`, `quarantine_ageing_days`, `enforce_eway_bill` |
| `inv_landed_cost_component` | Components and apportionment bases | `code`, `basis`, `is_creditable`, `gl_account_group` |

## 12.8 Indexing and volume notes

| Table | Expected 3-year volume | Notes |
|---|---|---|
| `inv_stock_ledger` | 40–60 M rows | Partitioned yearly by `business_date`; the hot index is `ix_ledger_loc` |
| `inv_stock_balance` | 150–400 k rows | Small; kept fully cached |
| `inv_serial` | 8–15 M rows | One row per finished bottle; `uk_serial` is the hot lookup |
| `inv_batch` | 200–500 k rows | — |
| `inv_batch_genealogy` | 2–5 M rows | Recursive queries capped at 6 levels with a materialised closure table if the 5-second NFR is at risk |
| `inv_material_issue_item` | 5–10 M rows | — |
| `inv_count_item` | 1–3 M rows | — |

**V4-INV-DR-008 (M)** Trace queries use a recursive CTE over `inv_batch_genealogy`, capped by
depth. If the Vol 0 5-second NFR cannot be met at production volume, a closure table maintained in
the same transaction is the sanctioned fallback — **not** a nightly rebuild.

## 12.9 Referential and consistency rules

| # | Rule |
|---|---|
| DR-1 | Every `inv_stock_ledger` row has a corresponding balance row after its transaction commits |
| DR-2 | `Σ inv_stock_balance.quantity` for a location key = the latest `running_quantity` in the ledger for that key |
| DR-3 | `Σ inv_valuation.value` by group = the GL stock account balance at period close (Ch 9) |
| DR-4 | `inv_stock_balance.reserved_quantity` = `Σ inv_stock_reservation.quantity − consumed_qty` in state `RESERVED`/`ALLOCATED` |
| DR-5 | `inv_batch.quantity_received` ≥ `Σ` balances for that batch, always |
| DR-6 | A serial appears in exactly one balance row |
| DR-7 | No genealogy cycles |
| DR-8 | No ledger row references a document that does not exist |

A nightly consistency job asserts DR-1, DR-2, DR-4, DR-5 and DR-6 on a rolling sample and raises a
Priority-1 alert on any breach. DR-3 is asserted at every period close and blocks it.

## 12.10 Migration and cutover

| Ref | Pri | Requirement |
|---|---|---|
| **V4-INV-DR-009** | M | Opening balances load as movement `401` with reason `SYSTEM_MIGRATION`, dated the cutover date, carrying batch, expiry, serial and rate — so the ledger is complete from day one and the opening value is auditable. |
| **V4-INV-DR-010** | M | The migration template validates item, warehouse, bin, batch and UOM against the masters before any row is posted, and produces a row-level rejection report. Partial loads are permitted; silent skips are not. |
| **V4-INV-DR-011** | M | Post-migration, a full physical verification (Ch 8) is run against the loaded balances before go-live sign-off. |

---

**Next:** [Chapter 13 — API, Events & Integration](13-api-events-and-integration.md)
