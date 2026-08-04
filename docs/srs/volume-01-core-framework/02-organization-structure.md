# Volume 1 · Chapter 2 — Organisation Structure

**Area code:** `ORG`
Prerequisite: [Volume 0](../volume-00-foundation.md) §7.6 (Multi-tenancy and data scoping)

---

## 2.1 Objective and scope

Define the organisational skeleton on which every transaction is posted: legal entity,
registered place of business, manufacturing site, storage location, and the financial calendar
that governs when postings are permitted.

**In scope:** company, branch, plant, production line, work centre placement, warehouse, zone,
bin, department, cost centre, profit centre, financial year and accounting period control,
currency and exchange rates, and the location hierarchy.

**Out of scope:** machine master (Ch 7), chart of accounts (Vol 9), employee-to-department
assignment (Vol 10).

---

## 2.2 The hierarchy

```
INSTALLATION
   │
   └── COMPANY  (legal entity · own books · own PAN · own GSTIN(s) · own FY)
         │      e.g. "SSB Industries Pvt Ltd", "SSB Exports LLP"
         │
         ├── BRANCH  (registered place of business · state · GSTIN)
         │     │     e.g. "Chennai HO", "Coimbatore Depot", "Delhi Sales Office"
         │     │
         │     ├── PLANT  (manufacturing site · factory licence · pollution consent)
         │     │     │    e.g. "Plant 1 — Sriperumbudur", "Plant 2 — Hosur"
         │     │     │
         │     │     ├── PRODUCTION LINE   e.g. "Line A — 500ml/750ml", "Line B — 1L"
         │     │     │     └── WORK CENTRE  e.g. "Deep Draw Press 1", "Vacuum Station 2"
         │     │     │           └── MACHINE  (Ch 7 master, placed here)
         │     │     │
         │     │     └── DEPARTMENT (shop) e.g. "Press Shop", "Welding", "Coating"
         │     │
         │     └── WAREHOUSE  (physical or logical store)
         │           │        e.g. "RM Store", "WIP Store", "FG Store", "Reject Store",
         │           │             "Scrap Yard", "Job-work (subcontractor) Store"
         │           │
         │           └── ZONE   e.g. "Coil Yard", "Rack Area A", "Cold Zone"
         │                 └── BIN / LOCATION  e.g. "A-01-03-02"  (aisle-rack-level-position)
         │
         ├── DEPARTMENT  (organisational, for cost and approval routing)
         ├── COST CENTRE  (where cost is incurred)
         └── PROFIT CENTRE (where margin is measured)
```

**V1-ORG-BR-001 (M)** Every transactional document MUST carry `company_id`. Documents with a
physical or fiscal location MUST additionally carry `branch_id`; manufacturing documents MUST
carry `plant_id`; stock movements MUST carry `warehouse_id` and, where bin management is
enabled, `bin_id`.

---

## 2.3 Company

### Functional requirements

| Ref | Pri | Requirement |
|---|---|---|
| **V1-ORG-FR-001** | M | Support multiple companies in one installation, each with independent books, document series, masters where scoped, and financial calendar. |
| **V1-ORG-FR-002** | M | Company record MUST capture: code, legal name, trade name, incorporation type, CIN, PAN, TAN, registered address, correspondence address, contact details, logo, letterhead, digital signature image, base currency, financial year start month, timezone, locale, and default decimal precisions. |
| **V1-ORG-FR-003** | M | Statutory registrations MUST be capturable as a repeating set: GSTIN (per state), IEC, factory licence, pollution board consent, ESI, EPF, professional tax, MSME/Udyam, ISO certificates — each with number, issuing authority, valid from/to, and attachment. |
| **V1-ORG-FR-004** | M | Registration expiry MUST raise reminders at 90, 60, 30 and 7 days before validity end. |
| **V1-ORG-FR-005** | M | A guided **Company Setup Wizard** MUST walk a new company through: company details → statutory registrations → financial year → branches → plants → warehouses → departments → cost centres → document series → roles and users → opening balances. Each step validates before proceeding; the wizard is resumable. |
| **V1-ORG-FR-006** | M | Company-level parameters (Ch 8) MUST be settable per company and MUST override installation defaults. |
| **V1-ORG-FR-007** | S | Company logo, letterhead and signature are used automatically by all print templates. |

### Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V1-ORG-BR-002** | M | Company code is immutable after the first transaction is posted. |
| **V1-ORG-BR-003** | M | Base currency is immutable after the first financial transaction. Changing it would invalidate every posted amount. |
| **V1-ORG-BR-004** | M | Financial year start month is immutable after the first financial year is created. |
| **V1-ORG-BR-005** | M | PAN MUST match `[A-Z]{5}[0-9]{4}[A-Z]{1}`. GSTIN MUST match `[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}` **and** its embedded PAN (chars 3–12) MUST equal the company/branch PAN, **and** its state code (chars 1–2) MUST equal the address state's GST code. All three checks are mandatory — the format check alone catches almost nothing. |
| **V1-ORG-BR-006** | M | A company MUST NOT be deactivated while it holds any open financial year or any non-closed transaction. |
| **V1-ORG-BR-007** | M | Inter-company transactions post as an arm's-length sale and purchase with matching documents (V0-BR-010), never as a transfer. |

---

## 2.4 Branch

| Ref | Pri | Requirement |
|---|---|---|
| **V1-ORG-FR-008** | M | A branch is a registered place of business, carrying its own address, state, GSTIN, and branch type (`HEAD_OFFICE`, `FACTORY`, `DEPOT`, `SALES_OFFICE`, `WAREHOUSE_ONLY`, `SERVICE_CENTRE`). |
| **V1-ORG-FR-009** | M | Each branch declares whether it is a **separate GST registration**. If yes, it gets its own GSTIN and its own statutory document series; stock movements between two such branches are **stock transfers with tax implications** (branch transfer under GST), not simple internal moves. |
| **V1-ORG-FR-010** | M | Branch-level configuration: default warehouse, default cost centre, working days, holiday calendar, and contact person. |

| Ref | Pri | Rule |
|---|---|---|
| **V1-ORG-BR-008** | M | A GSTIN MUST be unique across the installation. Two branches MUST NOT share a GSTIN. |
| **V1-ORG-BR-009** | M | A branch's state MUST match its GSTIN state code. |
| **V1-ORG-BR-010** | M | Transfers between branches with different GSTINs MUST generate a tax invoice / delivery challan with the applicable GST treatment and an e-way bill where the value threshold is crossed. Silent stock transfer between different GSTINs is a compliance defect and MUST be blocked. |

---

## 2.5 Plant

| Ref | Pri | Requirement |
|---|---|---|
| **V1-ORG-FR-011** | M | A plant is a manufacturing site belonging to one branch, with: code, name, address, factory licence number and validity, pollution consent, plant head (user), working calendar, shift pattern, and default warehouses (RM issue-from, WIP, FG receive-to, scrap). |
| **V1-ORG-FR-012** | M | Plant capacity attributes: number of production lines, installed capacity (bottles/day by capacity class), and operating hours per shift. |
| **V1-ORG-FR-013** | M | Production lines belong to a plant, carrying: code, name, line type, capable bottle capacity range, capable operations, standard cycle time, and status (`RUNNING`, `IDLE`, `MAINTENANCE`, `DECOMMISSIONED`). |
| **V1-ORG-FR-014** | M | Work centres belong to a production line or directly to a plant (for shared resources like coating booths), and are the unit against which routings and capacity are planned (Vol 5). |
| **V1-ORG-FR-015** | M | A plant-level **calendar** MUST define working days, holidays, planned shutdown periods and shift patterns, and MUST drive all capacity and due-date calculations. |

| Ref | Pri | Rule |
|---|---|---|
| **V1-ORG-BR-011** | M | Production orders, work orders, material issues and production confirmations MUST be plant-scoped. A user without that plant in scope cannot see or post them. |
| **V1-ORG-BR-012** | M | A plant MUST NOT be deactivated with open production orders or non-zero stock in its warehouses. |
| **V1-ORG-BR-013** | M | Where a plant belongs to a branch with a distinct GSTIN, all its stock is legally held under that GSTIN — reflected in stock reports grouped by GSTIN for return reconciliation. |

---

## 2.6 Warehouse, zone and bin

| Ref | Pri | Requirement |
|---|---|---|
| **V1-ORG-FR-016** | M | Warehouse types MUST include: `RAW_MATERIAL`, `WIP`, `FINISHED_GOODS`, `PACKING_MATERIAL`, `CONSUMABLE_SPARES`, `QUARANTINE`, `REJECT`, `SCRAP`, `SUBCONTRACTOR` (goods lying with a job-worker), `TRANSIT` (goods in inter-branch movement), `RETURN`. |
| **V1-ORG-FR-017** | M | Each warehouse declares: bin management enabled (yes/no), batch tracking mandatory (yes/no), negative stock allowed (yes/no), default valuation method, storekeeper (user), and physical address if different from the plant. |
| **V1-ORG-FR-018** | M | Where bin management is enabled, a zone → bin hierarchy MUST be maintained, with bin attributes: code, zone, bin type (`FLOOR`, `RACK`, `PALLET`, `SHELF`, `COIL_STAND`, `BULK`), capacity (weight and volume), permitted item categories, pick sequence, and status (`AVAILABLE`, `BLOCKED`, `FULL`). |
| **V1-ORG-FR-019** | M | Bulk bin creation from a pattern (e.g. aisles A–F × racks 01–10 × levels 1–4 × positions 1–3) with a preview before commit. Creating 720 bins by hand is not acceptable. |
| **V1-ORG-FR-020** | M | Every bin MUST be barcode-labelled per V0 §15, and the label MUST be printable from the bin master. |
| **V1-ORG-FR-021** | M | `TRANSIT` and `SUBCONTRACTOR` warehouses MUST be system-managed: postings into them come only from transfer and subcontract documents, never from manual entry. |

| Ref | Pri | Rule |
|---|---|---|
| **V1-ORG-BR-014** | M | A warehouse MUST belong to exactly one branch (for GST) and MAY be linked to a plant (for production). A warehouse with stock MUST NOT be reassigned to another branch. |
| **V1-ORG-BR-015** | M | A warehouse or bin with non-zero stock MUST NOT be deactivated or deleted. The system MUST show the blocking stock. |
| **V1-ORG-BR-016** | M | Where bin management is enabled, every stock movement MUST specify a bin. The system MUST NOT permit warehouse-level-only postings in a bin-managed warehouse. |
| **V1-ORG-BR-017** | M | `QUARANTINE` stock is not available for issue, allocation, reservation or sale. Movement out of quarantine is only via a QC decision document (Vol 7). |
| **V1-ORG-BR-018** | M | Bin codes are unique within a warehouse; warehouse codes are unique within a company. |

---

## 2.7 Department, cost centre, profit centre

| Ref | Pri | Requirement |
|---|---|---|
| **V1-ORG-FR-022** | M | Departments form a hierarchy (parent-child), each with a head (user), a default cost centre, and a plant/branch association. Departments drive approval routing (Ch 4) and HR structure (Vol 10). |
| **V1-ORG-FR-023** | M | Cost centres capture where cost is incurred, typed as `PRODUCTION`, `SERVICE`, `ADMIN`, `SALES`, `QUALITY`, `MAINTENANCE`, `UTILITY`. Each has a hierarchy, an owner, a budget link (Vol 9), and validity dates. |
| **V1-ORG-FR-024** | M | Profit centres capture where margin is measured (product line, market segment, plant), independent of the cost-centre hierarchy. |
| **V1-ORG-FR-025** | M | Every cost-bearing transaction line MUST be assignable to a cost centre, defaulting from the department, warehouse, or item category in that order of precedence. |

| Ref | Pri | Rule |
|---|---|---|
| **V1-ORG-BR-019** | M | Cost centre hierarchies MUST NOT contain cycles. Validated on save. |
| **V1-ORG-BR-020** | M | A cost centre MUST NOT be deactivated with an open budget or postings in the current financial year. |
| **V1-ORG-BR-021** | M | Cost centre is mandatory on expense postings; a company parameter controls whether it is mandatory on material issues (default: yes for indirect materials, no for BOM-driven production issues, which take the production order's cost centre). |

---

## 2.8 Financial year and period control

| Ref | Pri | Requirement |
|---|---|---|
| **V1-ORG-FR-026** | M | Financial years are defined per company with a code (e.g. `FY25-26`), start date, end date, and status (`FUTURE`, `OPEN`, `CLOSING`, `CLOSED`). |
| **V1-ORG-FR-027** | M | Each financial year contains accounting periods (default monthly, configurable to 4-4-5 or custom), each independently closable. |
| **V1-ORG-FR-028** | M | Period close MUST be **per module**: Inventory, Purchase, Sales, Production, Payroll and Finance close separately and in a configurable dependency order (inventory before finance, always). |
| **V1-ORG-FR-029** | M | Multiple financial years MAY be `OPEN` simultaneously, so that a new year can begin before the previous is closed — a hard operational requirement in Indian practice, where audit closes months after year end. |
| **V1-ORG-FR-030** | M | Year-end MUST support: carry-forward of stock, opening balances, opening document series reset, and re-opening a closed period with `SYSTEM.FINANCIAL_YEAR.REOPEN` plus a recorded reason. |
| **V1-ORG-FR-031** | M | A period-close checklist MUST be presented showing blockers: unapproved documents, GRNs without invoices, invoices without dispatch, unreconciled stock, unposted production confirmations, open physical counts. Closing is blocked until each is resolved or explicitly waived with a reason. |

| Ref | Pri | Rule |
|---|---|---|
| **V1-ORG-BR-022** | M | No posting is permitted into a `CLOSED` period for the closed module. Attempts return `409 business-rule-violation` with `rule_code = V1-ORG-BR-022`. |
| **V1-ORG-BR-023** | M | Back-dated posting into an open but prior period requires the `POST_BACKDATED` permission and is flagged in the audit log and in a Back-dated Postings exception report. |
| **V1-ORG-BR-024** | M | Financial years MUST NOT overlap and MUST be contiguous within a company. |
| **V1-ORG-BR-025** | M | Reopening a closed period MUST be audited with reason, MUST notify the CFO and auditor roles, and MUST re-close before any statutory return for that period is filed. |
| **V1-ORG-BR-026** | M | Document date MUST fall within an open period of an open financial year for the posting module, and MUST NOT be a future date beyond a configurable tolerance (default 0 days for financial documents, 7 days for planning documents). |

---

## 2.9 Currency and exchange rate

| Ref | Pri | Requirement |
|---|---|---|
| **V1-ORG-FR-032** | M | Currency master: ISO code, name, symbol, decimal places, and Indian-format flag. Seeded with ISO 4217. |
| **V1-ORG-FR-033** | M | Exchange rates are maintained per currency pair, per date, per rate type (`BUYING`, `SELLING`, `AVERAGE`, `CUSTOMS`). Customs rate is separately maintained because Indian import duty uses a notified rate, not the market rate. |
| **V1-ORG-FR-034** | M | Rate lookup MUST resolve to the applicable rate as at the document date, using the latest rate on or before that date. A missing rate blocks the transaction with a clear message rather than defaulting to 1. |
| **V1-ORG-FR-035** | S | Optional automated daily rate import from a configured provider, with manual override and an audit of the source. |
| **V1-ORG-FR-036** | M | Foreign-currency documents store transaction amount, currency, rate, and base amount (V0-BR-005). Revaluation of open foreign-currency balances at period end is a Volume 9 process consuming this data. |

---

## 2.10 Data model

```sql
sys_company
  id, uid,
  code VARCHAR(20) NOT NULL, legal_name VARCHAR(200) NOT NULL, trade_name VARCHAR(200),
  entity_type VARCHAR(30),            -- PVT_LTD|LTD|LLP|PARTNERSHIP|PROPRIETORSHIP
  cin VARCHAR(30), pan VARCHAR(10), tan VARCHAR(15),
  base_currency_code VARCHAR(3) NOT NULL,
  fy_start_month TINYINT NOT NULL DEFAULT 4,
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
  locale VARCHAR(10) DEFAULT 'en-IN',
  qty_precision TINYINT DEFAULT 3, rate_precision TINYINT DEFAULT 2,
  amount_precision TINYINT DEFAULT 2,
  logo_url VARCHAR(500), letterhead_url VARCHAR(500), signature_url VARCHAR(500),
  address_line1/2/3 VARCHAR(200), city_id, state_id, country_id, pincode VARCHAR(10),
  phone VARCHAR(30), email VARCHAR(150), website VARCHAR(150),
  is_active TINYINT(1) DEFAULT 1,
  <standard columns, without company_id>
  UNIQUE KEY uk_company_code (code, deleted_key)

sys_company_registration
  id, uid, company_id, branch_id NULL,
  registration_type VARCHAR(40) NOT NULL,   -- GSTIN|IEC|FACTORY_LICENCE|PCB_CONSENT|EPF|
                                            -- ESI|PT|UDYAM|ISO_9001|BIS|FSSAI|LEGAL_METROLOGY
  registration_no VARCHAR(50) NOT NULL,
  issuing_authority VARCHAR(200), state_id BIGINT UNSIGNED NULL,
  valid_from DATE, valid_to DATE NULL, attachment_uid CHAR(26) NULL,
  reminder_days JSON DEFAULT '[90,60,30,7]',
  is_active TINYINT(1) DEFAULT 1,
  <standard columns>
  UNIQUE KEY uk_reg (registration_type, registration_no, deleted_key)

sys_branch
  id, uid, company_id,
  code VARCHAR(20), name VARCHAR(150),
  branch_type VARCHAR(30),          -- HEAD_OFFICE|FACTORY|DEPOT|SALES_OFFICE|WAREHOUSE_ONLY
  gstin VARCHAR(15) NULL, has_separate_gstin TINYINT(1) DEFAULT 0,
  address_line1/2/3, city_id, state_id, country_id, pincode,
  phone, email, contact_person VARCHAR(150),
  default_warehouse_id BIGINT UNSIGNED NULL, default_cost_centre_id BIGINT UNSIGNED NULL,
  holiday_calendar_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) DEFAULT 1,
  <standard columns>
  UNIQUE KEY uk_branch_code (company_id, code, deleted_key)
  UNIQUE KEY uk_branch_gstin (gstin, deleted_key)

sys_plant
  id, uid, company_id, branch_id,
  code VARCHAR(20), name VARCHAR(150),
  plant_head_user_id BIGINT UNSIGNED NULL,
  factory_licence_no VARCHAR(50), factory_licence_valid_to DATE,
  address_line1/2/3, city_id, state_id, pincode,
  default_rm_warehouse_id, default_wip_warehouse_id,
  default_fg_warehouse_id, default_scrap_warehouse_id,
  shift_pattern_id BIGINT UNSIGNED NULL, calendar_id BIGINT UNSIGNED NULL,
  installed_capacity_per_day DECIMAL(18,3) NULL, capacity_uom_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) DEFAULT 1,
  <standard columns>
  UNIQUE KEY uk_plant_code (company_id, code, deleted_key)

sys_production_line
  id, uid, company_id, plant_id,
  code VARCHAR(20), name VARCHAR(150),
  line_type VARCHAR(30),            -- FORMING|WELDING|VACUUM|COATING|PRINTING|ASSEMBLY|PACKING
  min_bottle_capacity_ml INT NULL, max_bottle_capacity_ml INT NULL,
  standard_cycle_time_sec DECIMAL(10,3) NULL,
  rated_output_per_hour DECIMAL(12,3) NULL,
  status VARCHAR(20) DEFAULT 'RUNNING',
  is_active TINYINT(1) DEFAULT 1,
  <standard columns>
  UNIQUE KEY uk_line_code (company_id, plant_id, code, deleted_key)

sys_work_centre
  id, uid, company_id, plant_id, production_line_id NULL,
  code VARCHAR(20), name VARCHAR(150),
  work_centre_type VARCHAR(30),     -- MACHINE|LABOUR|ASSEMBLY|SUBCONTRACT|INSPECTION
  cost_centre_id BIGINT UNSIGNED NULL,
  capacity_uom_id, capacity_per_hour DECIMAL(12,3),
  efficiency_pct DECIMAL(9,4) DEFAULT 100, utilisation_pct DECIMAL(9,4) DEFAULT 85,
  setup_time_min DECIMAL(10,2), queue_time_min DECIMAL(10,2), move_time_min DECIMAL(10,2),
  machine_hour_rate DECIMAL(18,4), labour_hour_rate DECIMAL(18,4),
  is_bottleneck TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  <standard columns>
  UNIQUE KEY uk_wc_code (company_id, code, deleted_key)

sys_warehouse
  id, uid, company_id, branch_id, plant_id NULL,
  code VARCHAR(20), name VARCHAR(150),
  warehouse_type VARCHAR(30) NOT NULL,
  is_bin_managed TINYINT(1) DEFAULT 0,
  is_batch_mandatory TINYINT(1) DEFAULT 0,
  allow_negative_stock TINYINT(1) DEFAULT 0,
  is_system_managed TINYINT(1) DEFAULT 0,     -- TRANSIT / SUBCONTRACTOR
  subcontractor_supplier_id BIGINT UNSIGNED NULL,
  storekeeper_user_id BIGINT UNSIGNED NULL,
  valuation_method VARCHAR(20) DEFAULT 'WEIGHTED_AVG',  -- WEIGHTED_AVG|FIFO|STANDARD
  address_line1/2/3, city_id, state_id, pincode,
  is_active TINYINT(1) DEFAULT 1,
  <standard columns>
  UNIQUE KEY uk_wh_code (company_id, code, deleted_key)

sys_warehouse_zone
  id, uid, company_id, warehouse_id,
  code VARCHAR(20), name VARCHAR(150), zone_type VARCHAR(30),
  temperature_controlled TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1, <standard columns>
  UNIQUE KEY uk_zone (warehouse_id, code, deleted_key)

sys_bin
  id, uid, company_id, warehouse_id, zone_id NULL,
  code VARCHAR(30), name VARCHAR(150),
  bin_type VARCHAR(20),             -- FLOOR|RACK|PALLET|SHELF|COIL_STAND|BULK
  aisle VARCHAR(10), rack VARCHAR(10), level VARCHAR(10), position VARCHAR(10),
  max_weight_kg DECIMAL(18,4) NULL, max_volume_m3 DECIMAL(18,4) NULL,
  permitted_item_category_ids JSON NULL,
  pick_sequence INT UNSIGNED NULL,
  status VARCHAR(20) DEFAULT 'AVAILABLE',   -- AVAILABLE|BLOCKED|FULL
  barcode VARCHAR(100) NULL,
  is_active TINYINT(1) DEFAULT 1, <standard columns>
  UNIQUE KEY uk_bin (warehouse_id, code, deleted_key)
  KEY ix_bin_pick (warehouse_id, pick_sequence)

sys_department
  id, uid, company_id, branch_id NULL, plant_id NULL, parent_id NULL,
  code VARCHAR(20), name VARCHAR(150),
  department_type VARCHAR(30),      -- PRODUCTION|QUALITY|STORES|PURCHASE|SALES|FINANCE|HR|
                                    -- MAINTENANCE|ENGINEERING|ADMIN
  head_user_id BIGINT UNSIGNED NULL, cost_centre_id BIGINT UNSIGNED NULL,
  level TINYINT, path VARCHAR(500),          -- materialised path for fast subtree queries
  is_active TINYINT(1) DEFAULT 1, <standard columns>
  UNIQUE KEY uk_dept_code (company_id, code, deleted_key)

sys_cost_centre
  id, uid, company_id, parent_id NULL,
  code VARCHAR(20), name VARCHAR(150),
  cost_centre_type VARCHAR(30),
  owner_user_id BIGINT UNSIGNED NULL, plant_id NULL, department_id NULL,
  level TINYINT, path VARCHAR(500), is_postable TINYINT(1) DEFAULT 1,
  valid_from DATE, valid_to DATE NULL,
  is_active TINYINT(1) DEFAULT 1, <standard columns>
  UNIQUE KEY uk_cc_code (company_id, code, deleted_key)

sys_profit_centre
  id, uid, company_id, parent_id NULL,
  code VARCHAR(20), name VARCHAR(150), owner_user_id NULL,
  level TINYINT, path VARCHAR(500),
  is_active TINYINT(1) DEFAULT 1, <standard columns>

sys_financial_year
  id, uid, company_id,
  code VARCHAR(20),                 -- 'FY25-26'
  start_date DATE NOT NULL, end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'FUTURE',  -- FUTURE|OPEN|CLOSING|CLOSED
  closed_at DATETIME(6) NULL, closed_by BIGINT UNSIGNED NULL,
  is_current TINYINT(1) DEFAULT 0,
  <standard columns>
  UNIQUE KEY uk_fy_code (company_id, code, deleted_key)

sys_accounting_period
  id, uid, company_id, financial_year_id,
  period_no TINYINT NOT NULL, name VARCHAR(50),
  start_date DATE, end_date DATE,
  <standard columns>
  UNIQUE KEY uk_period (financial_year_id, period_no, deleted_key)

sys_period_status                    -- per module, per period
  id, uid, company_id, accounting_period_id,
  module VARCHAR(30) NOT NULL,      -- INVENTORY|PURCHASE|SALES|PRODUCTION|PAYROLL|FINANCE
  status VARCHAR(20) DEFAULT 'OPEN',-- OPEN|CLOSING|CLOSED
  closed_at DATETIME(6) NULL, closed_by BIGINT UNSIGNED NULL,
  reopened_at DATETIME(6) NULL, reopened_by BIGINT UNSIGNED NULL, reopen_reason TEXT NULL,
  <standard columns>
  UNIQUE KEY uk_period_module (accounting_period_id, module, deleted_key)

mst_currency                          -- global, no company_id
  id, uid, code VARCHAR(3), name VARCHAR(80), symbol VARCHAR(10),
  decimal_places TINYINT DEFAULT 2, use_indian_format TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1, <standard columns without company_id>
  UNIQUE KEY uk_currency (code)

mst_exchange_rate
  id, uid, company_id,
  from_currency_code VARCHAR(3), to_currency_code VARCHAR(3),
  rate_type VARCHAR(20) DEFAULT 'AVERAGE',   -- BUYING|SELLING|AVERAGE|CUSTOMS
  rate DECIMAL(18,8) NOT NULL,
  effective_date DATE NOT NULL,
  source VARCHAR(50) NULL,                   -- MANUAL | provider name
  <standard columns>
  UNIQUE KEY uk_rate (company_id, from_currency_code, to_currency_code, rate_type,
                      effective_date, deleted_key)
  KEY ix_rate_lookup (company_id, from_currency_code, to_currency_code, rate_type,
                      effective_date DESC)
```

---

## 2.11 Screens

### S-ORG-01 · Company Setup Wizard

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Company Setup — SSB Industries Pvt Ltd                              Step 3 of 10      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ①Company ─ ②Statutory ─ ③FinYear ─ ④Branches ─ ⑤Plants ─ ⑥Warehouses ─ ⑦Depts ─       │
│ ⑧Cost Centres ─ ⑨Numbering ─ ⑩Users                                                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Financial Year                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ FY start month *  [April ▼]     ⓘ Cannot be changed after the first FY is created│  │
│  │ Period type    (•) Monthly  ( ) 4-4-5  ( ) Custom                                │  │
│  │                                                                                  │  │
│  │ Financial years to create:                                                       │  │
│  │  ┌──────────┬─────────────┬─────────────┬──────────┬───────────┐                │  │
│  │  │ Code     │ Start       │ End         │ Status   │ Current   │                │  │
│  │  │ FY24-25  │ 01-Apr-2024 │ 31-Mar-2025 │ CLOSED ▼ │ ( )       │                │  │
│  │  │ FY25-26  │ 01-Apr-2025 │ 31-Mar-2026 │ OPEN   ▼ │ ( )       │                │  │
│  │  │ FY26-27  │ 01-Apr-2026 │ 31-Mar-2027 │ OPEN   ▼ │ (•)       │                │  │
│  │  └──────────┴─────────────┴─────────────┴──────────┴───────────┘                │  │
│  │  [ + Add year ]                                                                  │  │
│  │  ⓘ 36 accounting periods will be created automatically.                          │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [ ← Back ]                          [ Save & exit ]              [ Next → ]           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-ORG-02 · Organisation Structure Explorer

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Organisation Structure                    [Tree ▼|Table]  [+ Add ▼]  [Export]         │
├──────────────────────────────────┬─────────────────────────────────────────────────────┤
│ ▾ 🏢 SSB Industries Pvt Ltd      │  Plant 1 — Sriperumbudur                            │
│   ▾ 🏬 Chennai (HO) · 33AABC…1ZP │  ┌────────────────────────────────────────────────┐ │
│     ▾ 🏭 Plant 1 — Sriperumbudur │  │ Code            P1                             │ │
│       ▾ ⚙ Line A — 500/750ml    │  │ Branch          Chennai (HO)                    │ │
│           · Deep Draw Press 1    │  │ Plant head      Mr. S. Balaji                   │ │
│           · Deep Draw Press 2    │  │ Factory licence TN/FAC/2019/4471                │ │
│           · Necking M/c 1        │  │                 valid to 31-Dec-2027  ✔         │ │
│           · Thread Roller 1      │  │ Lines           2   Work centres  18            │ │
│       ▾ ⚙ Line B — 1L           │  │ Installed cap.  22,000 bottles/day               │ │
│           · Deep Draw Press 3    │  │ Shift pattern   3-shift (A/B/C)                 │ │
│       ▾ 🔧 Coating Booth (shared)│  │ Calendar        TN Factory Calendar 2026         │ │
│     ▾ 📦 Warehouses              │  │ Default stores  RM-01 · WIP-01 · FG-01 · SCR-01  │ │
│         · RM-01 Raw Material     │  │ Status          ⚑ Active                         │ │
│         · WIP-01 Work in Progress│  └────────────────────────────────────────────────┘ │
│         · FG-01 Finished Goods   │  [ Edit ]  [ Add line ]  [ Add work centre ]        │
│         · QTN-01 Quarantine      │  [ Deactivate ]  [ View capacity ]                  │
│         · SCR-01 Scrap Yard      │                                                     │
│         · SUB-01 Job-work (Coat) │  Related: 3 open production orders · stock ₹2.4 Cr  │
│   ▸ 🏬 Coimbatore Depot          │                                                     │
│   ▸ 🏬 Delhi Sales Office        │                                                     │
│ ▸ 🏢 SSB Exports LLP             │                                                     │
└──────────────────────────────────┴─────────────────────────────────────────────────────┘
```

### S-ORG-03 · Warehouse & Bin Setup (bulk bin generator)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Warehouse RM-01 (Raw Material Store)                       [Save]                   │
│  Details │ Zones │ Bins │ Stock │ Settings                                             │
├─ Bins ─────────────────────────────────────────────────────────────────────────────────┤
│  [ + Add bin ]  [ ⚡ Bulk generate ]  [ 🖨 Print labels ]  [Import] [Export]            │
│                                                                                        │
│  ┌─ Bulk generate bins ──────────────────────────────────────────────────────────────┐ │
│  │ Zone *        [Rack Area A ▼]         Bin type * [RACK ▼]                        │ │
│  │ Pattern *     [{AISLE}-{RACK}-{LEVEL}-{POS}]                                     │ │
│  │ Aisle    from [A] to [F]         (letters)                                       │ │
│  │ Rack     from [01] to [10]       (numeric, 2 digits)                             │ │
│  │ Level    from [1] to [4]                                                         │ │
│  │ Position from [1] to [3]                                                         │ │
│  │ Max weight per bin [500] kg      Pick sequence start [1000] step [10]            │ │
│  │                                                                                  │ │
│  │ Preview: 720 bins → A-01-1-1, A-01-1-2, A-01-1-3, A-01-2-1 … F-10-4-3            │ │
│  │ ⚠ 12 of these codes already exist and will be skipped.                           │ │
│  │                                        [ Cancel ]  [ Generate 708 bins ]         │ │
│  └──────────────────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [ ]│ Bin       │ Zone        │ Type │ Cap.(kg)│ Pick# │ Current stock      │ Status    │
│ [ ]│ A-01-1-1  │ Rack Area A │ RACK │   500   │ 1000  │ SS304 coil 1,240 kg│ ⚑Available│
│ [ ]│ A-01-1-2  │ Rack Area A │ RACK │   500   │ 1010  │ —                  │ ⚑Available│
│ [ ]│ CY-01     │ Coil Yard   │COIL_S│ 5,000   │  100  │ 4 coils · 8,900 kg │ ⚑Full     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-ORG-04 · Period Close

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Period Close — June 2026 (FY26-27, Period 3)                                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Module status                                                                         │
│  ┌────────────┬──────────┬────────────────┬──────────────────────────────────────────┐ │
│  │ Module     │ Status   │ Closed by/on   │ Action                                   │ │
│  │ Inventory  │ ⚑ CLOSED │ K.Raman 05-Jul │ [Reopen]                                 │ │
│  │ Purchase   │ ⚑ CLOSED │ K.Raman 05-Jul │ [Reopen]                                 │ │
│  │ Sales      │ ⚑ CLOSED │ K.Raman 05-Jul │ [Reopen]                                 │ │
│  │ Production │ ⚑ OPEN   │ —              │ [Close]                                  │ │
│  │ Payroll    │ ⚑ CLOSED │ HR 03-Jul      │ [Reopen]                                 │ │
│  │ Finance    │ ⚑ OPEN   │ —              │ [Close]  ⓘ blocked — see checklist       │ │
│  └────────────┴──────────┴────────────────┴──────────────────────────────────────────┘ │
├─ Pre-close checklist — Finance ────────────────────────────────────────────────────────┤
│  ✔ All GRNs approved                                       0 pending                   │
│  ✘ GRNs without supplier invoice                          14 items   [View] [Waive]    │
│  ✔ All sales invoices posted                               0 pending                   │
│  ✘ Production confirmations unposted                        3 items   [View] [Waive]    │
│  ✔ Stock ledger reconciled to balances                     matched                     │
│  ✔ No open physical count                                  0 open                      │
│  ✘ Unreconciled bank entries                              22 entries [View] [Waive]    │
│  ✔ Foreign currency revaluation posted                     done 30-Jun                 │
│                                                                                        │
│  ⚠ 3 blockers must be resolved or waived (with reason) before Finance can be closed.   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Back-dated postings into this period after close will require POST_BACKDATED and will │
│  appear in the Back-dated Postings exception report.                                   │
│                                              [ Cancel ]      [ Close Finance period ]  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Purpose |
|---|---|
| S-ORG-05 · Company Master | Detail form with Statutory Registrations tab and expiry tracker |
| S-ORG-06 · Branch Master | List + form, GSTIN validation, GST-transfer implications flagged |
| S-ORG-07 · Plant Master | Detail with lines, work centres, calendar, capacity |
| S-ORG-08 · Production Line / Work Centre | Capacity, rates, bottleneck flag |
| S-ORG-09 · Department Master | Tree with head and cost-centre mapping |
| S-ORG-10 · Cost Centre / Profit Centre | Tree, budget link, postable flag |
| S-ORG-11 · Financial Year & Periods | Year list, period grid with per-module status |
| S-ORG-12 · Currency & Exchange Rates | Rate grid by date and type, import, history chart |
| S-ORG-13 · Registration Expiry Dashboard | All statutory registrations across companies by expiry |

---

## 2.12 API

| Method | Endpoint | Permission |
|---|---|---|
| GET/POST/PATCH | `/api/v1/companies` · `/{uid}` | `SYSTEM.COMPANY.*` |
| GET/POST/PATCH/DELETE | `/api/v1/companies/{uid}/registrations` | `SYSTEM.COMPANY.EDIT` |
| GET/POST/PATCH | `/api/v1/branches` · `/{uid}` | `SYSTEM.BRANCH.*` |
| GET/POST/PATCH | `/api/v1/plants` · `/{uid}` | `SYSTEM.PLANT.*` |
| GET/POST/PATCH | `/api/v1/production-lines` · `/work-centres` | `SYSTEM.PLANT.*` |
| GET/POST/PATCH | `/api/v1/warehouses` · `/{uid}` | `SYSTEM.WAREHOUSE.*` |
| GET/POST | `/api/v1/warehouses/{uid}/zones` · `/bins` | `SYSTEM.WAREHOUSE.EDIT` |
| POST | `/api/v1/warehouses/{uid}/bins/bulk-generate` | `SYSTEM.WAREHOUSE.EDIT` |
| POST | `/api/v1/bins/print-labels` | `SYSTEM.WAREHOUSE.VIEW` |
| GET/POST/PATCH | `/api/v1/departments` · `/cost-centres` · `/profit-centres` | `SYSTEM.*` |
| GET/POST | `/api/v1/financial-years` · `/{uid}/periods` | `SYSTEM.FINANCIAL_YEAR.*` |
| GET | `/api/v1/periods/{uid}/close-checklist?module=FINANCE` | `SYSTEM.FINANCIAL_YEAR.CLOSE` |
| POST | `/api/v1/periods/{uid}/close` · `/reopen` | `.CLOSE` / `.REOPEN` |
| GET | `/api/v1/currencies` · `/exchange-rates` | authenticated |
| POST | `/api/v1/exchange-rates` · `/import` | `SYSTEM.PARAMETER.EDIT` |
| GET | `/api/v1/org-structure/tree` | authenticated (scoped) |

---

## 2.13 Events

| Event | When |
|---|---|
| `org.company.created` / `.updated` | Company lifecycle |
| `org.branch.created` / `.updated` / `.deactivated` | |
| `org.plant.created` / `.updated` / `.deactivated` | |
| `org.warehouse.created` / `.deactivated` | Inventory subscribes to initialise balances |
| `org.financial_year.opened` / `.closed` | Numbering series rollover, reporting |
| `org.period.closed` / `.reopened` | Posting guard cache refresh, notification to CFO/auditor |
| `org.registration.expiring` | 90/60/30/7-day reminders |
| `org.exchange_rate.updated` | Revaluation, pricing |

---

## 2.14 Reports

| Report | Content |
|---|---|
| Organisation Structure | Full hierarchy, printable, with codes — the artefact given to auditors |
| Statutory Registration Register | All registrations, validity, expiry status, attachments |
| Warehouse & Bin Master | All bins with capacity, utilisation, and current stock value |
| Bin Utilisation | Occupancy % by zone and bin type |
| Cost Centre Hierarchy | Tree with owners and budget linkage |
| Period Status | Open/closed matrix by module and period, across companies |
| Back-dated Postings | Every posting made into a prior period, with user and reason |
| Period Reopen Log | Every reopen with reason and approver |
| Exchange Rate History | Rate movement by pair and type, with source |

---

## 2.15 Acceptance criteria (extract)

- Creating a branch with a GSTIN whose state code differs from the address state is rejected
  with a specific message naming both.
- A stock transfer between two branches holding different GSTINs generates the required tax
  document and cannot be posted as a plain internal transfer.
- Closing the Finance period is blocked while any listed blocker is unresolved and unwaived;
  every waiver captures a reason and appears in the audit log.
- Posting a document dated into a closed period returns `409` with
  `rule_code = V1-ORG-BR-022`.
- Deactivating a warehouse holding stock is blocked, and the blocking stock is listed.
- Bulk bin generation of 720 bins previews correctly, skips 12 existing codes, and creates
  exactly 708.
- A foreign-currency document with no rate on or before its document date is blocked, not
  defaulted to 1.

---

**Next:** [Chapter 3 — Document Numbering](03-document-numbering.md)
