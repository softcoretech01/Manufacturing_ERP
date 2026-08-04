# Volume 3 · Chapter 11 — Data Model

Prefix: `prc_` (Vol 0 §7.2)
Every table carries the **standard column block** (Vol 0 V0-DR-002) — `id`, `uid`,
`company_id`, `version`, `created_*`, `updated_*`, `deleted_*`, `deleted_key` — shown below as
`<std>` and never repeated. Every line table carries `line_no` with
`UNIQUE (parent_id, line_no, deleted_key)` (V0-DR-004). Types follow Vol 0 §7.4: quantity and
rate `DECIMAL(18,6)`, amount `DECIMAL(18,2)`, percentage `DECIMAL(9,4)`, exchange rate
`DECIMAL(18,8)`, weight `DECIMAL(18,4)`, timestamps `DATETIME(6)` UTC, business dates `DATE`.

---

## 11.1 Entity map

```
                                    mst_supplier (Vol 1 MDM)
                                          │ 1
                        ┌─────────────────┼──────────────────┬──────────────────┐
                        │ 1..n            │ 1..n             │ 1..n             │ 1..n
              prc_supplier_extension  prc_supplier_document  prc_supplier_      prc_supplier_
                        │              (compliance/expiry)   contact_portal     evaluation
                        │ 1..n                                                        │ 1..n
                 prc_supplier_qualification                                   prc_supplier_
                        │                                                     evaluation_line
                        │
                 prc_approved_vendor_list ────────── mst_item (Vol 1 MDM)
                        │                                  │
   ┌────────────────────┴──────────────────────────────────┴──────────────────────────────┐
   │                                                                                       │
prc_purchase_requisition ──1..n──► prc_purchase_requisition_item                           │
   │                                        │                                              │
   │                                        │ n..m (prc_pr_po_link)                        │
   ▼                                        ▼                                              │
prc_rfq ──1..n──► prc_rfq_item              │                                              │
   │  └──1..n──► prc_rfq_vendor ──1..n──► prc_rfq_dispatch_log                             │
   │                    │                                                                  │
   ▼                    ▼                                                                  │
prc_supplier_quotation ──1..n──► prc_supplier_quotation_item ──1..n──► prc_quotation_       │
   │  ├──1..n──► prc_quotation_charge                                   price_break        │
   │  ├──1..n──► prc_quotation_deviation                                                    │
   │  └──1..n──► prc_quotation_revision (chain)                                             │
   ▼                                                                                       │
prc_comparison ──1..n──► prc_comparison_quotation                                          │
   │            ──1..n──► prc_comparison_line ──1..n──► prc_comparison_line_vendor          │
   │            ──1..n──► prc_comparison_award                                              │
   │            ──1..n──► prc_negotiation_round                                             │
   ▼                                                                                       │
prc_purchase_order ◄──────────────────────────────────────────────────────────────────────┘
   ├──1..n──► prc_purchase_order_item ──1..n──► prc_po_schedule_line
   │              └──1..n──► prc_po_item_subcontract_material
   ├──1..n──► prc_po_charge
   ├──1..n──► prc_po_payment_milestone
   ├──1..n──► prc_po_revision (header snapshot per revision)
   ├──1..n──► prc_po_acknowledgement
   ├──1..n──► prc_po_followup            (expediting log)
   └──1..n──► prc_pr_po_link             (n..m to PR items)
   │
   ├── prc_rate_contract ──1..n──► prc_rate_contract_item ──1..n──► prc_rate_contract_price_band
   │        └──1..n──► prc_rate_contract_consumption
   │
   ▼
prc_gate_entry ──1..n──► prc_gate_entry_item
   │
   ▼
prc_grn ──1..n──► prc_grn_item ──1..n──► prc_grn_item_batch
   │        └──1..n──► prc_grn_charge (landed cost at receipt)
   │
   ├──► prc_purchase_return ──1..n──► prc_purchase_return_item
   ├──► prc_debit_note ──1..n──► prc_debit_note_item
   └──► prc_supplier_invoice ──1..n──► prc_supplier_invoice_item
                │                              │
                ├──1..n──► prc_invoice_match_exception
                └──1..n──► prc_invoice_grn_link (n..m invoice item ↔ GRN item)

  Configuration / supporting
   prc_evaluation_criteria · prc_evaluation_criteria_weight · prc_terms_template
   prc_rfq_template · prc_parameter · prc_landed_cost_component · prc_jobwork_challan_link
```

External references (never joined in a write path — CLAUDE.md §3.3): `mst_supplier`,
`mst_item`, `mst_uom`, `mst_tax_code`, `mst_hsn`, `mst_currency`, `mst_reason_code`,
`sys_company`, `sys_branch`, `sys_plant`, `sys_warehouse`, `sys_bin`, `sys_cost_centre`,
`sys_department`, `iam_user`, `core_workflow_instance`, `core_attachment`, `core_comment`,
`core_number_series`, `core_document_link`, `core_audit_log`, `core_event_outbox`.

---

## 11.2 Supplier management

```sql
prc_supplier_extension                    -- procurement-owned attributes of a supplier
  <std>
  supplier_id           BIGINT UNSIGNED NOT NULL,        -- → mst_supplier
  qualification_status  VARCHAR(30) NOT NULL,            -- PROSPECT|REGISTERED|UNDER_QUALIFICATION|
                                                         -- APPROVED_PROVISIONAL|APPROVED|ON_HOLD|
                                                         -- BLACKLISTED|REJECTED|INACTIVE
  supply_categories     JSON NOT NULL,                   -- ['RAW_MATERIAL','PACKAGING',...]
  criticality           VARCHAR(20) NOT NULL,            -- CRITICAL|IMPORTANT|ROUTINE
  spend_segment         VARCHAR(20) NULL,                -- STRATEGIC|BOTTLENECK|LEVERAGE|ROUTINE
  is_import             TINYINT(1) NOT NULL DEFAULT 0,
  is_msme               TINYINT(1) NOT NULL DEFAULT 0,
  udyam_number          VARCHAR(30) NULL,
  msme_classification   VARCHAR(20) NULL,                -- MICRO|SMALL|MEDIUM
  msme_valid_to         DATE NULL,
  registration_type     VARCHAR(20) NOT NULL,            -- REGULAR|COMPOSITION|UNREGISTERED|SEZ|
                                                         -- OVERSEAS|GOVT
  default_lead_time_days SMALLINT UNSIGNED NULL,
  default_payment_terms_id BIGINT UNSIGNED NULL,
  credit_days           SMALLINT UNSIGNED NULL,
  advance_pct           DECIMAL(9,4) NULL,
  default_incoterm      VARCHAR(10) NULL,
  price_basis           VARCHAR(20) NULL,                -- SPOT|CONTRACT|INDEX_LINKED
  buyer_user_id         BIGINT UNSIGNED NULL,            -- portfolio owner
  provisional_limit_amount DECIMAL(18,2) NULL,
  provisional_valid_to  DATE NULL,
  provisional_consumed_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  requires_100pct_inspection TINYINT(1) NOT NULL DEFAULT 0,
  hold_reason_code      VARCHAR(50) NULL,
  hold_from_date        DATE NULL, hold_to_date DATE NULL,
  blacklist_reason      VARCHAR(1000) NULL,
  blacklisted_at        DATETIME(6) NULL, blacklisted_by BIGINT UNSIGNED NULL,
  current_rating        DECIMAL(5,2) NULL,
  current_grade         CHAR(1) NULL,                    -- A|B|C|D
  rating_as_of          DATE NULL,
  related_party_flag    TINYINT(1) NOT NULL DEFAULT 0,
  related_party_note    VARCHAR(500) NULL,
  is_single_source_any  TINYINT(1) NOT NULL DEFAULT 0,   -- derived, maintained by job
  first_transaction_date DATE NULL, last_transaction_date DATE NULL,
  UNIQUE KEY uk_prc_supplier_extension (company_id, supplier_id, deleted_key),
  KEY ix_supext_status (company_id, qualification_status, criticality),
  KEY ix_supext_buyer (company_id, buyer_user_id)

prc_supplier_document                     -- compliance register with expiry
  <std>
  supplier_id           BIGINT UNSIGNED NOT NULL,
  document_type_code    VARCHAR(50) NOT NULL,            -- GST_CERT|PAN|ISO_9001|ISO_14001|
                                                         -- FOOD_GRADE|MSME|BANK_PROOF|LUT|IEC|
                                                         -- FACTORY_LICENCE|POLLUTION|COC|OTHER
  document_number       VARCHAR(100) NULL,
  issuing_authority     VARCHAR(200) NULL,
  issue_date            DATE NULL,
  expiry_date           DATE NULL,
  is_mandatory          TINYINT(1) NOT NULL DEFAULT 0,
  attachment_uid        CHAR(26) NULL,                   -- → core_attachment
  verified_by           BIGINT UNSIGNED NULL, verified_at DATETIME(6) NULL,
  status                VARCHAR(20) NOT NULL,            -- PENDING|VERIFIED|EXPIRED|REJECTED
  KEY ix_supdoc_expiry (company_id, expiry_date, is_mandatory, status),
  KEY ix_supdoc_supplier (company_id, supplier_id, document_type_code)

prc_supplier_qualification                -- one row per qualification cycle
  <std>
  supplier_id           BIGINT UNSIGNED NOT NULL,
  cycle_no              SMALLINT UNSIGNED NOT NULL,
  checklist_template_id BIGINT UNSIGNED NULL,
  total_score           DECIMAL(9,4) NULL,
  pass_mark             DECIMAL(9,4) NULL,
  audit_type            VARCHAR(20) NULL,                -- DESK|ONSITE|VIRTUAL|NONE
  audited_by            BIGINT UNSIGNED NULL, audit_date DATE NULL,
  outcome               VARCHAR(30) NULL,                -- APPROVED|PROVISIONAL|REJECTED
  workflow_instance_id  BIGINT UNSIGNED NULL,
  responses             JSON NULL,                       -- [{question_id, answer, score, evidence_uid}]
  remarks               VARCHAR(2000) NULL,
  UNIQUE KEY uk_supqual (company_id, supplier_id, cycle_no, deleted_key)

prc_approved_vendor_list
  <std>
  supplier_id           BIGINT UNSIGNED NOT NULL,
  item_id               BIGINT UNSIGNED NULL,            -- item OR category, not both null
  item_category_id      BIGINT UNSIGNED NULL,
  rank_no               TINYINT UNSIGNED NOT NULL DEFAULT 1,
  approved_on           DATE NOT NULL,
  approved_by           BIGINT UNSIGNED NOT NULL,
  approval_reference    VARCHAR(200) NULL,
  customer_approval_ref VARCHAR(200) NULL,
  valid_from            DATE NOT NULL, valid_to DATE NULL,
  lead_time_days        SMALLINT UNSIGNED NULL,
  moq_quantity          DECIMAL(18,6) NULL,
  order_multiple        DECIMAL(18,6) NULL,
  pack_size             DECIMAL(18,6) NULL,
  price_basis           VARCHAR(20) NULL,
  inspection_requirement VARCHAR(20) NOT NULL DEFAULT 'SAMPLING', -- 100_PCT|SAMPLING|SKIP_LOT|
                                                                  -- MTC_ONLY|NONE
  qualification_test_ref VARCHAR(200) NULL,
  qualification_valid_to DATE NULL,
  monthly_capacity      DECIMAL(18,6) NULL,
  is_provisional        TINYINT(1) NOT NULL DEFAULT 0,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_avl (company_id, supplier_id, item_id, item_category_id, deleted_key),
  KEY ix_avl_item (company_id, item_id, is_active, rank_no),
  KEY ix_avl_validity (company_id, valid_to, qualification_valid_to)

prc_supplier_evaluation                   -- period scorecard header
  <std>
  supplier_id           BIGINT UNSIGNED NOT NULL,
  period_from           DATE NOT NULL, period_to DATE NOT NULL,
  quality_score         DECIMAL(5,2) NULL,
  delivery_score        DECIMAL(5,2) NULL,
  price_score           DECIMAL(5,2) NULL,
  responsiveness_score  DECIMAL(5,2) NULL,
  compliance_score      DECIMAL(5,2) NULL,
  computed_score        DECIMAL(5,2) NOT NULL,
  manual_score          DECIMAL(5,2) NULL,
  manual_justification  VARCHAR(1000) NULL,
  grade                 CHAR(1) NOT NULL,
  previous_grade        CHAR(1) NULL,
  weight_set_json       JSON NOT NULL,                   -- snapshot of weights used
  published_at          DATETIME(6) NULL,
  UNIQUE KEY uk_supeval (company_id, supplier_id, period_from, period_to, deleted_key),
  KEY ix_supeval_grade (company_id, grade, period_to)

prc_supplier_evaluation_line              -- drill-through evidence
  <std>
  evaluation_id         BIGINT UNSIGNED NOT NULL,
  component             VARCHAR(30) NOT NULL,            -- QUALITY|DELIVERY|PRICE|RESPONSE|COMPLIANCE
  source_entity_type    VARCHAR(50) NOT NULL,            -- prc_grn_item|prc_po_schedule_line|…
  source_entity_id      BIGINT UNSIGNED NOT NULL,
  source_document_no    VARCHAR(50) NULL,
  metric_value          DECIMAL(18,6) NULL,
  contribution          DECIMAL(9,4) NULL,
  KEY ix_supevalline (evaluation_id, component)

prc_supplier_portal_user
  <std>
  supplier_id           BIGINT UNSIGNED NOT NULL,
  contact_name          VARCHAR(150) NOT NULL,
  email                 VARCHAR(255) NOT NULL,
  mobile                VARCHAR(20) NULL,
  role                  VARCHAR(30) NOT NULL,            -- SALES|ACCOUNTS|LOGISTICS|QUALITY|ADMIN
  invited_by            BIGINT UNSIGNED NULL, invited_at DATETIME(6) NULL,
  activated_at          DATETIME(6) NULL,
  last_login_at         DATETIME(6) NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'INVITED', -- INVITED|ACTIVE|SUSPENDED|REVOKED
  UNIQUE KEY uk_portaluser (company_id, supplier_id, email, deleted_key)
```

---

## 11.3 Purchase requisition

```sql
prc_purchase_requisition
  <std>
  branch_id             BIGINT UNSIGNED NULL,
  plant_id              BIGINT UNSIGNED NOT NULL,
  pr_number             VARCHAR(50) NULL,                -- allocated at DRAFT
  revision_no           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  pr_date               DATE NOT NULL,
  department_id         BIGINT UNSIGNED NOT NULL,
  requester_user_id     BIGINT UNSIGNED NOT NULL,
  cost_centre_id        BIGINT UNSIGNED NOT NULL,
  procurement_type      VARCHAR(30) NOT NULL,            -- DIRECT_MATERIAL|PACKAGING|CONSUMABLE|
                                                         -- SUBCONTRACT|MRO|CAPITAL|SERVICE|IMPORT
  source_type           VARCHAR(20) NOT NULL,            -- MANUAL|MRP|REORDER|PRODUCTION|
                                                         -- MAINTENANCE|PROJECT|CAPEX|SERVICE
  source_reference      VARCHAR(100) NULL,
  urgency               VARCHAR(20) NOT NULL DEFAULT 'ROUTINE', -- ROUTINE|URGENT|EMERGENCY
  emergency_reason_code VARCHAR(50) NULL,
  justification         VARCHAR(2000) NULL,
  required_by_date      DATE NOT NULL,
  delivery_warehouse_id BIGINT UNSIGNED NULL,
  project_id            BIGINT UNSIGNED NULL,
  budget_line_id        BIGINT UNSIGNED NULL,
  currency_code         CHAR(3) NOT NULL DEFAULT 'INR',
  estimated_total       DECIMAL(18,2) NOT NULL DEFAULT 0, -- server-computed
  status                VARCHAR(30) NOT NULL,            -- see Ch 2 §2.3
  workflow_instance_id  BIGINT UNSIGNED NULL,
  submitted_at          DATETIME(6) NULL, approved_at DATETIME(6) NULL,
  cancel_reason_code    VARCHAR(50) NULL, cancelled_at DATETIME(6) NULL,
  short_close_reason_code VARCHAR(50) NULL,
  superseded_by_id      BIGINT UNSIGNED NULL,            -- amendment chain
  remarks               VARCHAR(2000) NULL,
  UNIQUE KEY uk_pr_number (company_id, pr_number, revision_no, deleted_key),
  KEY ix_pr_status (company_id, plant_id, status, pr_date),
  KEY ix_pr_requester (company_id, requester_user_id, status),
  KEY ix_pr_sourcing (company_id, status, required_by_date)

prc_purchase_requisition_item
  <std>
  purchase_requisition_id BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  item_id               BIGINT UNSIGNED NULL,
  is_free_text          TINYINT(1) NOT NULL DEFAULT 0,
  description           VARCHAR(500) NULL,
  specification         TEXT NULL,
  quantity              DECIMAL(18,6) NOT NULL,
  uom_id                BIGINT UNSIGNED NOT NULL,
  alt_quantity          DECIMAL(18,6) NULL,
  alt_uom_id            BIGINT UNSIGNED NULL,
  conversion_basis      VARCHAR(200) NULL,               -- e.g. 'SS304 0.5mm × 400mm → 0.500 kg/pc'
  required_by_date      DATE NOT NULL,
  delivery_warehouse_id BIGINT UNSIGNED NULL,
  cost_centre_id        BIGINT UNSIGNED NOT NULL,
  account_id            BIGINT UNSIGNED NULL,
  estimated_rate        DECIMAL(18,6) NULL,
  estimated_rate_source VARCHAR(30) NULL,                -- CONTRACT|LAST_PURCHASE|STANDARD|MANUAL
  estimated_value       DECIMAL(18,2) NOT NULL DEFAULT 0,
  suggested_supplier_id BIGINT UNSIGNED NULL,
  rate_contract_id      BIGINT UNSIGNED NULL,
  sourcing_decision     VARCHAR(30) NULL,                -- RATE_CONTRACT_CALL_OFF|RFQ|DIRECT_PO|
                                                         -- STOCK_TRANSFER|SUBCONTRACT|DEFER
  sourcing_decision_reason VARCHAR(500) NULL,
  ordered_quantity      DECIMAL(18,6) NOT NULL DEFAULT 0,
  received_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  short_closed_quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
  line_status           VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  stock_snapshot        JSON NULL,                        -- stock, in-transit, open PO, cover days
                                                          -- at submission — for the audit trail
  warnings_acknowledged JSON NULL,                        -- [{code, text, ack_by, ack_at}]
  remarks               VARCHAR(1000) NULL,
  UNIQUE KEY uk_pr_item (purchase_requisition_id, line_no, deleted_key),
  KEY ix_pr_item_item (company_id, item_id, line_status),
  CONSTRAINT ck_pr_item_qty CHECK (quantity > 0)
```

---

## 11.4 RFQ

```sql
prc_rfq
  <std>
  plant_id              BIGINT UNSIGNED NOT NULL,
  rfq_number            VARCHAR(50) NULL,
  revision_no           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  rfq_date              DATE NOT NULL,
  title                 VARCHAR(200) NOT NULL,
  rfq_type              VARCHAR(30) NOT NULL,            -- SINGLE_VENDOR|MULTI_VENDOR|SEALED_BID|
                                                         -- REVERSE_AUCTION|RATE_CONTRACT_RFQ|
                                                         -- TECHNO_COMMERCIAL
  procurement_type      VARCHAR(30) NOT NULL,
  buyer_user_id         BIGINT UNSIGNED NOT NULL,
  due_at                DATETIME(6) NOT NULL,
  quote_validity_days   SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  late_policy           VARCHAR(20) NOT NULL DEFAULT 'BLOCK', -- BLOCK|ACCEPT_WITH_FLAG
  currency_code         CHAR(3) NOT NULL DEFAULT 'INR',
  target_amount         DECIMAL(18,2) NULL,              -- INTERNAL ONLY — never dispatched
  estimated_value       DECIMAL(18,2) NULL,
  payment_terms_id      BIGINT UNSIGNED NULL,
  delivery_terms        VARCHAR(50) NULL, incoterm VARCHAR(10) NULL,
  freight_basis         VARCHAR(20) NULL, packing_basis VARCHAR(20) NULL,
  warranty_expectation  VARCHAR(200) NULL,
  inspection_requirement VARCHAR(20) NULL,
  price_basis           VARCHAR(50) NULL,
  sample_required       TINYINT(1) NOT NULL DEFAULT 0, sample_quantity DECIMAL(18,6) NULL,
  terms_template_id     BIGINT UNSIGNED NULL, terms_version SMALLINT UNSIGNED NULL,
  instructions          TEXT NULL,
  min_vendor_policy     TINYINT UNSIGNED NULL,
  short_vendor_reason_code VARCHAR(50) NULL,
  sealed_opened_at      DATETIME(6) NULL,
  sealed_opened_by_1    BIGINT UNSIGNED NULL, sealed_opened_by_2 BIGINT UNSIGNED NULL,
  status                VARCHAR(30) NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NULL,
  cancel_reason_code    VARCHAR(50) NULL,
  no_award_reason_code  VARCHAR(50) NULL,
  amendment_summary     VARCHAR(2000) NULL,
  UNIQUE KEY uk_rfq_number (company_id, rfq_number, revision_no, deleted_key),
  KEY ix_rfq_status (company_id, status, due_at),
  KEY ix_rfq_buyer (company_id, buyer_user_id, status)

prc_rfq_item
  <std>
  rfq_id                BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  lot_no                SMALLINT UNSIGNED NULL,
  item_id               BIGINT UNSIGNED NULL,
  description           VARCHAR(500) NULL,
  specification         TEXT NOT NULL,
  quantity              DECIMAL(18,6) NOT NULL,
  uom_id                BIGINT UNSIGNED NOT NULL,
  required_by_date      DATE NOT NULL,
  delivery_warehouse_id BIGINT UNSIGNED NULL,
  packing_requirement   VARCHAR(500) NULL,
  target_rate           DECIMAL(18,6) NULL,              -- INTERNAL ONLY
  purchase_requisition_item_id BIGINT UNSIGNED NULL,
  pr_quantity_consumed  DECIMAL(18,6) NULL,
  UNIQUE KEY uk_rfq_item (rfq_id, line_no, deleted_key),
  KEY ix_rfq_item_pr (purchase_requisition_item_id)

prc_rfq_vendor
  <std>
  rfq_id                BIGINT UNSIGNED NOT NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  lot_no                SMALLINT UNSIGNED NULL,
  contact_email         VARCHAR(255) NULL,
  portal_user_id        BIGINT UNSIGNED NULL,
  response_token_hash   CHAR(64) NULL,                   -- unique expiring link
  token_expires_at      DATETIME(6) NULL,
  is_avl_qualified      TINYINT(1) NOT NULL DEFAULT 1,
  non_avl_justification VARCHAR(500) NULL,
  response_status       VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING|VIEWED|RESPONDED|
                                                                -- REGRETTED|NO_RESPONSE
  regret_reason_code    VARCHAR(50) NULL,
  reminder_count        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_reminded_at      DATETIME(6) NULL,
  UNIQUE KEY uk_rfq_vendor (rfq_id, supplier_id, lot_no, deleted_key),
  KEY ix_rfqvendor_supplier (company_id, supplier_id, response_status)

prc_rfq_dispatch_log                      -- append-only per send attempt
  <std>
  rfq_id                BIGINT UNSIGNED NOT NULL,
  rfq_vendor_id         BIGINT UNSIGNED NOT NULL,
  revision_no           SMALLINT UNSIGNED NOT NULL,
  channel               VARCHAR(20) NOT NULL,            -- EMAIL|PORTAL|MANUAL_PDF
  recipient             VARCHAR(255) NULL,
  message_id            VARCHAR(255) NULL,
  artefact_uid          CHAR(26) NULL,                   -- the exact PDF sent
  artefact_hash         CHAR(64) NULL,
  sent_at               DATETIME(6) NULL,
  delivered_at          DATETIME(6) NULL,
  opened_at             DATETIME(6) NULL,
  bounced_at            DATETIME(6) NULL, bounce_reason VARCHAR(500) NULL,
  KEY ix_rfqdisp (rfq_id, rfq_vendor_id, revision_no)
```

---

## 11.5 Supplier quotation

```sql
prc_supplier_quotation
  <std>
  quotation_number      VARCHAR(50) NULL,
  revision_no           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  parent_quotation_id   BIGINT UNSIGNED NULL,            -- revision chain
  rfq_id                BIGINT UNSIGNED NULL,
  rfq_revision_no       SMALLINT UNSIGNED NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  supplier_ref_number   VARCHAR(100) NOT NULL,
  supplier_ref_date     DATE NOT NULL,
  capture_source        VARCHAR(20) NOT NULL,            -- PORTAL|MANUAL_ENTRY|EXCEL_IMPORT|
                                                         -- VERBAL|EMAIL_PARSE
  received_at           DATETIME(6) NOT NULL,
  received_by           BIGINT UNSIGNED NOT NULL,
  is_late               TINYINT(1) NOT NULL DEFAULT 0,
  is_unsolicited        TINYINT(1) NOT NULL DEFAULT 0,
  valid_until           DATE NOT NULL,
  currency_code         CHAR(3) NOT NULL,
  exchange_rate         DECIMAL(18,8) NOT NULL DEFAULT 1,
  exchange_rate_date    DATE NULL, exchange_rate_source VARCHAR(50) NULL,
  payment_advance_pct   DECIMAL(9,4) NULL,
  payment_days          SMALLINT UNSIGNED NULL,
  payment_basis         VARCHAR(20) NULL,                -- INVOICE|GRN|DISPATCH
  retention_pct         DECIMAL(9,4) NULL,
  early_pay_discount_pct DECIMAL(9,4) NULL, early_pay_days SMALLINT UNSIGNED NULL,
  delivery_terms        VARCHAR(50) NULL, incoterm VARCHAR(10) NULL,
  warranty_months       SMALLINT UNSIGNED NULL,
  inspection_offer      VARCHAR(20) NULL,
  price_basis           VARCHAR(50) NULL,                -- TAX_EXTRA|TAX_INCLUSIVE|FREIGHT_INCLUSIVE…
  basic_amount          DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount_amount       DECIMAL(18,2) NOT NULL DEFAULT 0,
  charges_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  taxable_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax_amount            DECIMAL(18,2) NOT NULL DEFAULT 0,
  round_off             DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_amount          DECIMAL(18,2) NOT NULL DEFAULT 0,
  supplier_stated_total DECIMAL(18,2) NULL,              -- for discrepancy detection
  discrepancy_amount    DECIMAL(18,2) NULL,
  discrepancy_resolution VARCHAR(500) NULL,
  is_sealed             TINYINT(1) NOT NULL DEFAULT 0,
  sealed_payload        VARBINARY(8000) NULL,            -- encrypted rates until opening
  status                VARCHAR(30) NOT NULL,
  negotiation_round     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  revision_reason       VARCHAR(30) NULL,
  regret_reason_code    VARCHAR(50) NULL,
  not_awarded_reason_code VARCHAR(50) NULL,
  remarks               TEXT NULL,
  UNIQUE KEY uk_quotation_no (company_id, quotation_number, revision_no, deleted_key),
  UNIQUE KEY uk_quotation_active (company_id, rfq_id, supplier_id, revision_no, deleted_key),
  KEY ix_quot_supplier (company_id, supplier_id, status, valid_until),
  KEY ix_quot_rfq (rfq_id, status)

prc_supplier_quotation_item
  <std>
  supplier_quotation_id BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  rfq_item_id           BIGINT UNSIGNED NULL,
  item_id               BIGINT UNSIGNED NULL,
  description           VARCHAR(500) NULL,
  offered_specification TEXT NULL,
  has_deviation         TINYINT(1) NOT NULL DEFAULT 0,
  is_not_quoted         TINYINT(1) NOT NULL DEFAULT 0,
  quantity              DECIMAL(18,6) NOT NULL DEFAULT 0,
  uom_id                BIGINT UNSIGNED NULL,
  basic_rate            DECIMAL(18,6) NOT NULL DEFAULT 0,
  discount_pct          DECIMAL(9,4) NULL, discount_amount DECIMAL(18,2) NULL,
  hsn_code              VARCHAR(10) NULL,
  tax_code_id           BIGINT UNSIGNED NULL, tax_rate DECIMAL(9,4) NULL,
  tax_amount            DECIMAL(18,2) NOT NULL DEFAULT 0,
  taxable_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_total            DECIMAL(18,2) NOT NULL DEFAULT 0,
  lead_time_days        SMALLINT UNSIGNED NULL,
  moq_quantity          DECIMAL(18,6) NULL, order_multiple DECIMAL(18,6) NULL,
  country_of_origin_id  BIGINT UNSIGNED NULL,
  brand_make            VARCHAR(200) NULL,
  landed_unit_cost      DECIMAL(18,6) NULL,              -- computed by the comparison engine
  landed_cost_breakup   JSON NULL,                       -- step-wise, for the drawer
  remarks               VARCHAR(1000) NULL,
  UNIQUE KEY uk_quot_item (supplier_quotation_id, line_no, deleted_key)

prc_quotation_price_break
  <std>
  supplier_quotation_item_id BIGINT UNSIGNED NOT NULL,
  from_quantity         DECIMAL(18,6) NOT NULL,
  to_quantity           DECIMAL(18,6) NULL,
  rate                  DECIMAL(18,6) NOT NULL,
  KEY ix_pricebreak (supplier_quotation_item_id, from_quantity)

prc_quotation_charge
  <std>
  supplier_quotation_id BIGINT UNSIGNED NOT NULL,
  supplier_quotation_item_id BIGINT UNSIGNED NULL,       -- null = header charge
  charge_type           VARCHAR(30) NOT NULL,            -- FREIGHT|PACKING|INSURANCE|LOADING|
                                                         -- FORWARDING|INSPECTION|CUSTOMS_DUTY|
                                                         -- SWS|PORT|CHA|OCEAN_FREIGHT|OTHER
  is_included_in_rate   TINYINT(1) NOT NULL DEFAULT 0,
  amount                DECIMAL(18,2) NOT NULL DEFAULT 0,
  apportion_basis       VARCHAR(20) NOT NULL DEFAULT 'VALUE', -- VALUE|WEIGHT|QUANTITY|EQUAL
  tax_code_id           BIGINT UNSIGNED NULL,
  is_reverse_charge     TINYINT(1) NOT NULL DEFAULT 0,
  KEY ix_quotcharge (supplier_quotation_id, charge_type)

prc_quotation_deviation
  <std>
  supplier_quotation_id BIGINT UNSIGNED NOT NULL,
  supplier_quotation_item_id BIGINT UNSIGNED NULL,
  deviation_type        VARCHAR(30) NOT NULL,            -- SPECIFICATION|QUANTITY|DELIVERY|
                                                         -- PAYMENT|WARRANTY|TERMS|OTHER
  rfq_value             VARCHAR(500) NULL,
  offered_value         VARCHAR(500) NULL,
  disposition           VARCHAR(20) NULL,                -- ACCEPTED|NOT_ACCEPTED|NEGOTIATE
  disposition_by        BIGINT UNSIGNED NULL, disposition_at DATETIME(6) NULL,
  disposition_remarks   VARCHAR(1000) NULL,
  KEY ix_quotdev (supplier_quotation_id, disposition)
```

---

## 11.6 Comparison and award

```sql
prc_comparison
  <std>
  comparison_number     VARCHAR(50) NULL,
  comparison_date       DATE NOT NULL,
  title                 VARCHAR(200) NULL,
  rfq_id                BIGINT UNSIGNED NULL,
  rfq_revision_no       SMALLINT UNSIGNED NULL,
  buyer_user_id         BIGINT UNSIGNED NOT NULL,
  criteria_set_id       BIGINT UNSIGNED NOT NULL,
  criteria_snapshot     JSON NOT NULL,                   -- weights + scoring functions, FROZEN
  cost_of_capital_pct   DECIMAL(9,4) NULL,
  benchmark_credit_days SMALLINT UNSIGNED NULL,
  total_awarded_amount  DECIMAL(18,2) NULL,
  savings_vs_highest    DECIMAL(18,2) NULL,
  savings_vs_target     DECIMAL(18,2) NULL,
  savings_vs_lpp        DECIMAL(18,2) NULL,
  negotiation_savings   DECIMAL(18,2) NULL,
  recommendation_json   JSON NULL,                       -- vendor split + rationale text
  selection_json        JSON NULL,
  deviation_reason_code VARCHAR(50) NULL,
  deviation_justification VARCHAR(2000) NULL,
  min_quotes_policy     TINYINT UNSIGNED NULL,
  short_quotes_reason_code VARCHAR(50) NULL,
  statement_artefact_uid CHAR(26) NULL, statement_hash CHAR(64) NULL,
  status                VARCHAR(30) NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NULL,
  cancel_reason_code    VARCHAR(50) NULL,
  UNIQUE KEY uk_comparison_no (company_id, comparison_number, deleted_key),
  KEY ix_cmp_status (company_id, status, comparison_date)

prc_comparison_quotation                  -- frozen participation
  <std>
  comparison_id         BIGINT UNSIGNED NOT NULL,
  supplier_quotation_id BIGINT UNSIGNED NOT NULL,
  quotation_revision_no SMALLINT UNSIGNED NOT NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  is_disqualified       TINYINT(1) NOT NULL DEFAULT 0,
  disqualification_reason VARCHAR(500) NULL,
  disqualification_overridden_by BIGINT UNSIGNED NULL,
  total_score           DECIMAL(9,4) NULL,
  overall_rank          SMALLINT UNSIGNED NULL,
  UNIQUE KEY uk_cmpquot (comparison_id, supplier_quotation_id, deleted_key)

prc_comparison_line
  <std>
  comparison_id         BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  item_id               BIGINT UNSIGNED NULL,
  description           VARCHAR(500) NULL,
  required_quantity     DECIMAL(18,6) NOT NULL,
  uom_id                BIGINT UNSIGNED NOT NULL,
  required_by_date      DATE NULL,
  target_rate           DECIMAL(18,6) NULL,
  last_purchase_rate    DECIMAL(18,6) NULL, last_purchase_date DATE NULL,
  contract_rate         DECIMAL(18,6) NULL, rate_contract_id BIGINT UNSIGNED NULL,
  UNIQUE KEY uk_cmp_line (comparison_id, line_no, deleted_key)

prc_comparison_line_vendor                -- the comparison matrix cell
  <std>
  comparison_line_id    BIGINT UNSIGNED NOT NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  supplier_quotation_item_id BIGINT UNSIGNED NULL,
  quoted_rate           DECIMAL(18,6) NULL,
  slab_rate_applied     DECIMAL(18,6) NULL,
  landed_unit_cost      DECIMAL(18,6) NULL,
  landed_extended_cost  DECIMAL(18,2) NULL,
  landed_breakup        JSON NULL,                       -- §5.3 steps 1–11
  lead_time_days        SMALLINT UNSIGNED NULL,
  meets_need_date       TINYINT(1) NULL,
  criterion_scores      JSON NULL,                       -- {criterion_code: raw, weighted}
  total_score           DECIMAL(9,4) NULL,
  cost_rank             SMALLINT UNSIGNED NULL,
  score_rank            SMALLINT UNSIGNED NULL,
  is_disqualified       TINYINT(1) NOT NULL DEFAULT 0,
  disqualification_reason VARCHAR(500) NULL,
  is_abnormally_low     TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_cmp_line_vendor (comparison_line_id, supplier_id, deleted_key),
  KEY ix_cmplv_rank (comparison_line_id, cost_rank)

prc_comparison_award
  <std>
  comparison_id         BIGINT UNSIGNED NOT NULL,
  comparison_line_id    BIGINT UNSIGNED NOT NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  supplier_quotation_item_id BIGINT UNSIGNED NULL,
  awarded_quantity      DECIMAL(18,6) NOT NULL,
  awarded_rate          DECIMAL(18,6) NOT NULL,
  awarded_amount        DECIMAL(18,2) NOT NULL,
  share_pct             DECIMAL(9,4) NULL,
  is_recommended        TINYINT(1) NOT NULL DEFAULT 0,   -- did the engine recommend this?
  purchase_order_item_id BIGINT UNSIGNED NULL,           -- set when converted
  UNIQUE KEY uk_cmp_award (comparison_line_id, supplier_id, deleted_key)

prc_negotiation_round
  <std>
  comparison_id         BIGINT UNSIGNED NOT NULL,
  round_no              TINYINT UNSIGNED NOT NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  requested_at          DATETIME(6) NOT NULL, requested_by BIGINT UNSIGNED NOT NULL,
  target_rate           DECIMAL(18,6) NULL, target_reduction_pct DECIMAL(9,4) NULL,
  terms_sought          VARCHAR(1000) NULL,
  response_due_at       DATETIME(6) NULL,
  responded_at          DATETIME(6) NULL,
  response_quotation_id BIGINT UNSIGNED NULL,
  pre_landed_cost       DECIMAL(18,2) NULL, post_landed_cost DECIMAL(18,2) NULL,
  saving_amount         DECIMAL(18,2) NULL,
  is_bafo               TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_neground (comparison_id, round_no, supplier_id, deleted_key)

prc_evaluation_criteria                   -- master
  <std>
  code                  VARCHAR(50) NOT NULL,
  name                  VARCHAR(200) NOT NULL,
  data_source           VARCHAR(50) NOT NULL,            -- LANDED_COST|LEAD_TIME|QUALITY_RATING|…
  direction             VARCHAR(10) NOT NULL,            -- HIGHER|LOWER
  scoring_function      VARCHAR(30) NOT NULL,            -- RATIO_MIN|RATIO_MAX|LINEAR_DECAY|
                                                         -- DIRECT|STEP|PASS_FAIL
  scoring_params        JSON NULL,
  is_disqualifier       TINYINT(1) NOT NULL DEFAULT 0,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_evalcrit (company_id, code, deleted_key)

prc_evaluation_criteria_weight            -- weight set per category, effective-dated
  <std>
  set_code              VARCHAR(50) NOT NULL,
  set_name              VARCHAR(200) NOT NULL,
  item_category_id      BIGINT UNSIGNED NULL,
  procurement_type      VARCHAR(30) NULL,
  criteria_id           BIGINT UNSIGNED NOT NULL,
  weight_pct            DECIMAL(9,4) NOT NULL,
  valid_from            DATE NOT NULL, valid_to DATE NULL,
  version_no            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uk_evalweight (company_id, set_code, version_no, criteria_id, deleted_key),
  KEY ix_evalweight_lookup (company_id, item_category_id, procurement_type, valid_from)
```

---

## 11.7 Purchase order

```sql
prc_purchase_order
  <std>
  branch_id             BIGINT UNSIGNED NULL,
  plant_id              BIGINT UNSIGNED NOT NULL,
  po_number             VARCHAR(50) NULL,                -- allocated at APPROVAL
  revision_no           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  parent_po_id          BIGINT UNSIGNED NULL,            -- amendment chain
  po_date               DATE NOT NULL,
  po_type               VARCHAR(30) NOT NULL,            -- STANDARD|BLANKET|RATE_CONTRACT|
                                                         -- SCHEDULING_AGREEMENT|CALL_OFF|
                                                         -- SUBCONTRACT|IMPORT|SERVICE|CAPITAL|
                                                         -- RETURNABLE
  procurement_type      VARCHAR(30) NOT NULL,
  urgency               VARCHAR(20) NOT NULL DEFAULT 'ROUTINE',
  supplier_id           BIGINT UNSIGNED NOT NULL,
  supplier_address_id   BIGINT UNSIGNED NULL,
  supplier_contact_id   BIGINT UNSIGNED NULL,
  supplier_gstin        VARCHAR(15) NULL,
  supplier_state_id     BIGINT UNSIGNED NULL,
  place_of_supply_state_id BIGINT UNSIGNED NOT NULL,
  gst_treatment         VARCHAR(20) NOT NULL,            -- INTRA|INTER|EXPORT|IMPORT|RCM|EXEMPT
  buyer_user_id         BIGINT UNSIGNED NOT NULL,
  comparison_id         BIGINT UNSIGNED NULL,
  rate_contract_id      BIGINT UNSIGNED NULL,
  comparison_exempt_reason_code VARCHAR(50) NULL,
  currency_code         CHAR(3) NOT NULL,
  exchange_rate         DECIMAL(18,8) NOT NULL DEFAULT 1,
  exchange_rate_source  VARCHAR(50) NULL, exchange_rate_stamped_at DATETIME(6) NULL,
  payment_advance_pct   DECIMAL(9,4) NULL, payment_days SMALLINT UNSIGNED NULL,
  payment_basis         VARCHAR(20) NULL, retention_pct DECIMAL(9,4) NULL,
  early_pay_discount_pct DECIMAL(9,4) NULL, early_pay_days SMALLINT UNSIGNED NULL,
  delivery_terms        VARCHAR(50) NULL, incoterm VARCHAR(10) NULL,
  delivery_address_json JSON NULL,
  port_of_loading       VARCHAR(100) NULL, port_of_discharge VARCHAR(100) NULL,
  lc_number             VARCHAR(50) NULL, lc_expiry DATE NULL,
  terms_template_id     BIGINT UNSIGNED NULL, terms_version SMALLINT UNSIGNED NULL,
  special_instructions  TEXT NULL,
  ld_clause_json        JSON NULL,                       -- {rate_pct_per_week, cap_pct, basis}
  basic_amount          DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount_amount       DECIMAL(18,2) NOT NULL DEFAULT 0,
  charges_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  taxable_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  cgst_amount           DECIMAL(18,2) NOT NULL DEFAULT 0,
  sgst_amount           DECIMAL(18,2) NOT NULL DEFAULT 0,
  igst_amount           DECIMAL(18,2) NOT NULL DEFAULT 0,
  cess_amount           DECIMAL(18,2) NOT NULL DEFAULT 0,
  round_off             DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_amount          DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_amount_base     DECIMAL(18,2) NOT NULL DEFAULT 0, -- company currency
  tds_section           VARCHAR(20) NULL, tds_rate DECIMAL(9,4) NULL,
  tcs_section           VARCHAR(20) NULL, tcs_rate DECIMAL(9,4) NULL,
  budget_commitment_ref VARCHAR(50) NULL,
  budget_override_by    BIGINT UNSIGNED NULL, budget_override_reason VARCHAR(1000) NULL,
  price_override_by     BIGINT UNSIGNED NULL, price_override_reason VARCHAR(1000) NULL,
  status                VARCHAR(30) NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NULL,
  approved_at           DATETIME(6) NULL,
  released_at           DATETIME(6) NULL, released_by BIGINT UNSIGNED NULL,
  released_artefact_uid CHAR(26) NULL, released_artefact_hash CHAR(64) NULL,
  acknowledged_at       DATETIME(6) NULL,
  hold_reason_code      VARCHAR(50) NULL, held_at DATETIME(6) NULL,
  cancel_reason_code    VARCHAR(50) NULL, cancelled_at DATETIME(6) NULL,
  short_close_reason_code VARCHAR(50) NULL,
  closed_at             DATETIME(6) NULL,
  amendment_reason      VARCHAR(1000) NULL,
  UNIQUE KEY uk_po_number (company_id, po_number, revision_no, deleted_key),
  KEY ix_po_supplier (company_id, supplier_id, status, po_date),
  KEY ix_po_status (company_id, plant_id, status, po_date),
  KEY ix_po_open (company_id, status, po_type),
  KEY ix_po_contract (company_id, rate_contract_id)

prc_purchase_order_item
  <std>
  purchase_order_id     BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  line_uid              CHAR(26) NOT NULL,               -- stable across revisions
  item_id               BIGINT UNSIGNED NULL,
  is_free_text          TINYINT(1) NOT NULL DEFAULT 0,
  description           VARCHAR(500) NULL,
  specification         TEXT NULL,
  specification_changed TINYINT(1) NOT NULL DEFAULT 0,
  ordered_quantity      DECIMAL(18,6) NOT NULL,
  uom_id                BIGINT UNSIGNED NOT NULL,
  alt_quantity          DECIMAL(18,6) NULL, alt_uom_id BIGINT UNSIGNED NULL,
  conversion_basis      VARCHAR(200) NULL,
  rate                  DECIMAL(18,6) NOT NULL,
  rate_uom_id           BIGINT UNSIGNED NULL,
  discount_pct          DECIMAL(9,4) NULL, discount_amount DECIMAL(18,2) NULL,
  hsn_code              VARCHAR(10) NULL,
  tax_code_id           BIGINT UNSIGNED NULL,
  cgst_rate DECIMAL(9,4) NULL, sgst_rate DECIMAL(9,4) NULL,
  igst_rate DECIMAL(9,4) NULL, cess_rate DECIMAL(9,4) NULL,
  taxable_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax_amount            DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_total            DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_itc_eligible       TINYINT(1) NOT NULL DEFAULT 1,
  itc_block_reason      VARCHAR(100) NULL,
  promised_date         DATE NOT NULL,
  delivery_warehouse_id BIGINT UNSIGNED NULL,
  cost_centre_id        BIGINT UNSIGNED NOT NULL,
  account_id            BIGINT UNSIGNED NULL,
  budget_line_id        BIGINT UNSIGNED NULL,
  inspection_requirement VARCHAR(20) NOT NULL DEFAULT 'SAMPLING',
  over_receipt_tolerance_pct DECIMAL(9,4) NULL,
  under_receipt_tolerance_pct DECIMAL(9,4) NULL,
  supplier_quotation_item_id BIGINT UNSIGNED NULL,
  comparison_award_id   BIGINT UNSIGNED NULL,
  rate_contract_item_id BIGINT UNSIGNED NULL,
  reference_rate        DECIMAL(18,6) NULL, reference_rate_source VARCHAR(30) NULL,
  price_variance_pct    DECIMAL(9,4) NULL, price_variance_justification VARCHAR(1000) NULL,
  received_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  accepted_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  rejected_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  returned_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  invoiced_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  short_closed_quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
  line_status           VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  subcontract_operation_id BIGINT UNSIGNED NULL,
  process_loss_pct      DECIMAL(9,4) NULL,
  scrap_treatment       VARCHAR(20) NULL,                -- RETURN|RETAIN_BY_VENDOR|NA
  remarks               VARCHAR(1000) NULL,
  UNIQUE KEY uk_po_item (purchase_order_id, line_no, deleted_key),
  KEY ix_poitem_item (company_id, item_id, line_status),
  KEY ix_poitem_open (company_id, line_status, promised_date),
  CONSTRAINT ck_po_item_qty CHECK (ordered_quantity > 0)

prc_po_schedule_line
  <std>
  purchase_order_item_id BIGINT UNSIGNED NOT NULL,
  schedule_no           SMALLINT UNSIGNED NOT NULL,
  scheduled_date        DATE NOT NULL,
  scheduled_quantity    DECIMAL(18,6) NOT NULL,
  received_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  is_firm               TINYINT(1) NOT NULL DEFAULT 1,   -- firm vs forecast release
  status                VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  first_receipt_date    DATE NULL,
  is_on_time            TINYINT(1) NULL,                 -- computed at closure, feeds OTIF
  UNIQUE KEY uk_po_sched (purchase_order_item_id, schedule_no, deleted_key),
  KEY ix_sched_due (company_id, status, scheduled_date)

prc_po_charge
  <std>
  purchase_order_id     BIGINT UNSIGNED NOT NULL,
  purchase_order_item_id BIGINT UNSIGNED NULL,
  charge_type           VARCHAR(30) NOT NULL,
  borne_by              VARCHAR(10) NOT NULL,            -- VENDOR|BUYER
  amount                DECIMAL(18,2) NOT NULL DEFAULT 0,
  apportion_basis       VARCHAR(20) NOT NULL DEFAULT 'VALUE',
  tax_code_id           BIGINT UNSIGNED NULL,
  is_reverse_charge     TINYINT(1) NOT NULL DEFAULT 0,
  is_landed_cost        TINYINT(1) NOT NULL DEFAULT 1,   -- adds to inventory value
  KEY ix_pocharge (purchase_order_id)

prc_po_payment_milestone
  <std>
  purchase_order_id     BIGINT UNSIGNED NOT NULL,
  milestone_no          SMALLINT UNSIGNED NOT NULL,
  description           VARCHAR(200) NOT NULL,
  trigger_event         VARCHAR(30) NOT NULL,            -- ON_ORDER|ON_DISPATCH|ON_RECEIPT|
                                                         -- ON_INSTALLATION|ON_ACCEPTANCE|DATE
  trigger_date          DATE NULL,
  percentage            DECIMAL(9,4) NULL, amount DECIMAL(18,2) NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  paid_amount           DECIMAL(18,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_po_milestone (purchase_order_id, milestone_no, deleted_key)

prc_po_item_subcontract_material          -- material to be issued for job work
  <std>
  purchase_order_item_id BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  item_id               BIGINT UNSIGNED NOT NULL,
  quantity_per_unit     DECIMAL(18,6) NOT NULL,
  total_quantity        DECIMAL(18,6) NOT NULL,
  uom_id                BIGINT UNSIGNED NOT NULL,
  permitted_loss_pct    DECIMAL(9,4) NOT NULL DEFAULT 0,
  issued_quantity       DECIMAL(18,6) NOT NULL DEFAULT 0,
  consumed_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  returned_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  balance_at_vendor     DECIMAL(18,6) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_po_subcon_mat (purchase_order_item_id, line_no, deleted_key)

prc_po_acknowledgement
  <std>
  purchase_order_id     BIGINT UNSIGNED NOT NULL,
  revision_no           SMALLINT UNSIGNED NOT NULL,
  acknowledged_at       DATETIME(6) NULL,
  acknowledged_by_contact VARCHAR(200) NULL,
  channel               VARCHAR(20) NULL,                -- PORTAL|EMAIL|MANUAL
  proposed_date_change  JSON NULL,                       -- [{po_item_uid, proposed_date, reason}]
  buyer_response        VARCHAR(20) NULL,                -- ACCEPTED|REJECTED|PENDING
  remarks               VARCHAR(1000) NULL,
  KEY ix_poack (purchase_order_id, revision_no)

prc_po_followup                           -- expediting log
  <std>
  purchase_order_id     BIGINT UNSIGNED NOT NULL,
  purchase_order_item_id BIGINT UNSIGNED NULL,
  followup_at           DATETIME(6) NOT NULL,
  followup_by           BIGINT UNSIGNED NOT NULL,
  channel               VARCHAR(20) NULL,                -- CALL|EMAIL|PORTAL|VISIT
  supplier_response     VARCHAR(1000) NULL,
  revised_promise_date  DATE NULL,
  KEY ix_pofollow (purchase_order_id, followup_at)

prc_pr_po_link                            -- n..m PR item ↔ PO item with quantity
  <std>
  purchase_requisition_item_id BIGINT UNSIGNED NOT NULL,
  purchase_order_item_id BIGINT UNSIGNED NOT NULL,
  linked_quantity       DECIMAL(18,6) NOT NULL,
  UNIQUE KEY uk_pr_po_link (purchase_requisition_item_id, purchase_order_item_id, deleted_key),
  KEY ix_prpolink_po (purchase_order_item_id)
```

---

## 11.8 Rate contract

```sql
prc_rate_contract
  <std>
  contract_number       VARCHAR(50) NOT NULL,
  revision_no           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  contract_date         DATE NOT NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  title                 VARCHAR(200) NULL,
  contract_type         VARCHAR(20) NOT NULL,            -- RATE_CONTRACT|BLANKET|SCHEDULING
  valid_from            DATE NOT NULL, valid_to DATE NOT NULL,
  price_basis           VARCHAR(20) NOT NULL,            -- FIRM|INDEX_LINKED|ESCALATION_CLAUSE
  index_code            VARCHAR(50) NULL,
  index_base_value      DECIMAL(18,6) NULL, index_base_date DATE NULL,
  price_formula         VARCHAR(500) NULL,
  escalation_band_pct   DECIMAL(9,4) NULL,
  revision_frequency    VARCHAR(20) NULL,                -- MONTHLY|QUARTERLY|ON_TRIGGER
  committed_quantity    DECIMAL(18,6) NULL,
  committed_value       DECIMAL(18,2) NULL,
  min_calloff_quantity  DECIMAL(18,6) NULL,
  consumed_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  consumed_value        DECIMAL(18,2) NOT NULL DEFAULT 0,
  payment_terms_id      BIGINT UNSIGNED NULL, delivery_terms VARCHAR(50) NULL,
  ld_clause_json        JSON NULL,
  currency_code         CHAR(3) NOT NULL DEFAULT 'INR',
  status                VARCHAR(30) NOT NULL,            -- DRAFT|PENDING_APPROVAL|ACTIVE|
                                                         -- EXPIRED|CLOSED|CANCELLED
  workflow_instance_id  BIGINT UNSIGNED NULL,
  UNIQUE KEY uk_ratecontract (company_id, contract_number, revision_no, deleted_key),
  KEY ix_rc_supplier (company_id, supplier_id, status, valid_to)

prc_rate_contract_item
  <std>
  rate_contract_id      BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  item_id               BIGINT UNSIGNED NOT NULL,
  specification         TEXT NULL,
  uom_id                BIGINT UNSIGNED NOT NULL,
  agreed_rate           DECIMAL(18,6) NULL,
  current_derived_rate  DECIMAL(18,6) NULL,
  derived_rate_as_of    DATE NULL,
  derivation_json       JSON NULL,
  committed_quantity    DECIMAL(18,6) NULL,
  consumed_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  lead_time_days        SMALLINT UNSIGNED NULL,
  moq_quantity          DECIMAL(18,6) NULL, order_multiple DECIMAL(18,6) NULL,
  UNIQUE KEY uk_rc_item (rate_contract_id, line_no, deleted_key),
  KEY ix_rcitem_item (company_id, item_id)

prc_rate_contract_price_band              -- slab pricing within the contract
  <std>
  rate_contract_item_id BIGINT UNSIGNED NOT NULL,
  from_quantity         DECIMAL(18,6) NOT NULL,
  to_quantity           DECIMAL(18,6) NULL,
  rate                  DECIMAL(18,6) NOT NULL,
  KEY ix_rcband (rate_contract_item_id, from_quantity)

prc_rate_contract_consumption             -- append-only call-off ledger
  <std>
  rate_contract_id      BIGINT UNSIGNED NOT NULL,
  rate_contract_item_id BIGINT UNSIGNED NULL,
  purchase_order_id     BIGINT UNSIGNED NOT NULL,
  purchase_order_item_id BIGINT UNSIGNED NULL,
  quantity              DECIMAL(18,6) NOT NULL,
  amount                DECIMAL(18,2) NOT NULL,
  rate_applied          DECIMAL(18,6) NOT NULL,
  is_reversal           TINYINT(1) NOT NULL DEFAULT 0,   -- cancellation/short-close
  KEY ix_rcconsume (rate_contract_id, created_at)
```

---

## 11.9 Gate entry, GRN

```sql
prc_gate_entry
  <std>
  plant_id              BIGINT UNSIGNED NOT NULL,
  gate_pass_number      VARCHAR(50) NOT NULL,
  entry_at              DATETIME(6) NOT NULL,
  exit_at               DATETIME(6) NULL,
  entry_type            VARCHAR(30) NOT NULL,            -- PO_RECEIPT|SUBCONTRACT_RETURN|SAMPLE|
                                                         -- RETURNABLE_IN|CUSTOMER_SUPPLIED|
                                                         -- WITHOUT_PO_EXCEPTION
  supplier_id           BIGINT UNSIGNED NULL,
  vehicle_number        VARCHAR(30) NULL,
  transporter_name      VARCHAR(200) NULL,
  driver_name           VARCHAR(150) NULL, driver_mobile VARCHAR(20) NULL,
  lr_number             VARCHAR(50) NULL, lr_date DATE NULL,
  supplier_invoice_no   VARCHAR(50) NULL, supplier_invoice_date DATE NULL,
  eway_bill_no          VARCHAR(20) NULL, eway_bill_valid_to DATE NULL,
  eway_bill_verified    TINYINT(1) NULL,
  declared_packages     INT UNSIGNED NULL,
  gross_weight          DECIMAL(18,4) NULL, tare_weight DECIMAL(18,4) NULL,
  net_weight            DECIMAL(18,4) NULL,
  weighbridge_source    VARCHAR(20) NULL,                -- DEVICE|MANUAL
  weighbridge_manual_reason VARCHAR(500) NULL,
  seal_number           VARCHAR(50) NULL,
  security_user_id      BIGINT UNSIGNED NOT NULL,
  without_po_reason     VARCHAR(500) NULL,
  without_po_approved_by BIGINT UNSIGNED NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN|GRN_MADE|CLOSED|CANCELLED
  cancel_reason_code    VARCHAR(50) NULL,
  UNIQUE KEY uk_gatepass (company_id, gate_pass_number, deleted_key),
  KEY ix_gate_open (company_id, plant_id, status, entry_at),
  KEY ix_gate_supplier (company_id, supplier_id, entry_at)

prc_gate_entry_item
  <std>
  gate_entry_id         BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  purchase_order_id     BIGINT UNSIGNED NULL,
  purchase_order_item_id BIGINT UNSIGNED NULL,
  item_id               BIGINT UNSIGNED NULL,
  description           VARCHAR(500) NULL,
  declared_quantity     DECIMAL(18,6) NULL,
  uom_id                BIGINT UNSIGNED NULL,
  UNIQUE KEY uk_gate_item (gate_entry_id, line_no, deleted_key)

prc_grn
  <std>
  plant_id              BIGINT UNSIGNED NOT NULL,
  warehouse_id          BIGINT UNSIGNED NOT NULL,
  grn_number            VARCHAR(50) NULL,                -- gapless, allocated at APPROVAL
  grn_date              DATE NOT NULL,
  grn_at                DATETIME(6) NOT NULL,
  receipt_type          VARCHAR(30) NOT NULL,            -- PO_RECEIPT|SUBCONTRACT_RETURN|SAMPLE|
                                                         -- RETURNABLE_IN|FREE_SUPPLY|REVERSAL
  gate_entry_id         BIGINT UNSIGNED NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  supplier_invoice_no   VARCHAR(50) NULL, supplier_invoice_date DATE NULL,
  lr_number             VARCHAR(50) NULL, lr_date DATE NULL,
  eway_bill_no          VARCHAR(20) NULL,
  vehicle_number        VARCHAR(30) NULL,
  gross_weight          DECIMAL(18,4) NULL, tare_weight DECIMAL(18,4) NULL,
  net_weight            DECIMAL(18,4) NULL,
  bill_of_entry_no      VARCHAR(50) NULL, bill_of_entry_date DATE NULL,
  received_by           BIGINT UNSIGNED NOT NULL,
  reversal_of_grn_id    BIGINT UNSIGNED NULL,
  reversal_reason       VARCHAR(1000) NULL,
  total_value           DECIMAL(18,2) NOT NULL DEFAULT 0,
  landed_cost_amount    DECIMAL(18,2) NOT NULL DEFAULT 0,
  status                VARCHAR(30) NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NULL,
  approved_at           DATETIME(6) NULL,
  stock_posted_at       DATETIME(6) NULL, stock_posting_ref VARCHAR(50) NULL,
  grir_accrual_ref      VARCHAR(50) NULL,
  cancel_reason_code    VARCHAR(50) NULL,
  remarks               VARCHAR(2000) NULL,
  UNIQUE KEY uk_grn_number (company_id, grn_number, deleted_key),
  UNIQUE KEY uk_grn_supplier_invoice (company_id, supplier_id, supplier_invoice_no, deleted_key),
  KEY ix_grn_supplier (company_id, supplier_id, grn_date),
  KEY ix_grn_status (company_id, plant_id, status, grn_date)

prc_grn_item
  <std>
  grn_id                BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  purchase_order_id     BIGINT UNSIGNED NULL,
  purchase_order_item_id BIGINT UNSIGNED NULL,
  po_schedule_line_id   BIGINT UNSIGNED NULL,
  item_id               BIGINT UNSIGNED NULL,
  description           VARCHAR(500) NULL,
  ordered_quantity      DECIMAL(18,6) NULL,
  previously_received   DECIMAL(18,6) NULL,
  received_quantity     DECIMAL(18,6) NOT NULL,
  uom_id                BIGINT UNSIGNED NOT NULL,
  alt_quantity          DECIMAL(18,6) NULL, alt_uom_id BIGINT UNSIGNED NULL,
  conversion_basis      VARCHAR(200) NULL,
  accepted_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  rejected_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  deviation_quantity    DECIMAL(18,6) NOT NULL DEFAULT 0,
  pending_inspection_quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
  returned_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  excess_quantity       DECIMAL(18,6) NOT NULL DEFAULT 0,
  excess_disposition    VARCHAR(30) NULL,                -- ACCEPTED|RETURNED_AT_GATE|
                                                         -- PENDING_AMENDMENT
  excess_approved_by    BIGINT UNSIGNED NULL,
  rate                  DECIMAL(18,6) NULL,
  landed_rate           DECIMAL(18,6) NULL,
  line_value            DECIMAL(18,2) NOT NULL DEFAULT 0,
  warehouse_id          BIGINT UNSIGNED NOT NULL,
  bin_id                BIGINT UNSIGNED NULL,
  inspection_requirement VARCHAR(20) NOT NULL,
  inspection_lot_ref    VARCHAR(50) NULL,                -- Vol 7
  inspection_status     VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  inspected_at          DATETIME(6) NULL,
  packing_condition     VARCHAR(20) NULL,
  deviation_reason      VARCHAR(1000) NULL,
  deviation_approved_by BIGINT UNSIGNED NULL,
  remarks               VARCHAR(1000) NULL,
  UNIQUE KEY uk_grn_item (grn_id, line_no, deleted_key),
  KEY ix_grnitem_po (purchase_order_item_id),
  KEY ix_grnitem_inspection (company_id, inspection_status, created_at),
  CONSTRAINT ck_grn_qty_invariant
    CHECK (accepted_quantity + rejected_quantity + pending_inspection_quantity
           <= received_quantity + 0.000001)

prc_grn_item_batch
  <std>
  grn_item_id           BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  batch_number          VARCHAR(50) NULL,
  heat_number           VARCHAR(50) NULL,
  coil_number           VARCHAR(50) NULL,
  quantity              DECIMAL(18,6) NOT NULL,
  alt_quantity          DECIMAL(18,6) NULL,
  manufacturing_date    DATE NULL, expiry_date DATE NULL,
  shelf_life_pct_remaining DECIMAL(9,4) NULL,
  country_of_origin_id  BIGINT UNSIGNED NULL,
  test_certificate_no   VARCHAR(100) NULL,
  test_certificate_uid  CHAR(26) NULL,                   -- → core_attachment
  certificate_verified_by BIGINT UNSIGNED NULL,
  serial_numbers        JSON NULL,
  accepted_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  rejected_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  defect_codes          JSON NULL,
  bin_id                BIGINT UNSIGNED NULL,
  inventory_batch_ref   VARCHAR(50) NULL,                -- set by Vol 4 on posting
  UNIQUE KEY uk_grn_batch (grn_item_id, line_no, deleted_key),
  KEY ix_grnbatch_heat (company_id, heat_number),
  KEY ix_grnbatch_batch (company_id, batch_number)

prc_grn_charge                            -- landed cost known at receipt
  <std>
  grn_id                BIGINT UNSIGNED NOT NULL,
  charge_type           VARCHAR(30) NOT NULL,
  amount                DECIMAL(18,2) NOT NULL,
  apportion_basis       VARCHAR(20) NOT NULL DEFAULT 'VALUE',
  is_provisional        TINYINT(1) NOT NULL DEFAULT 1,   -- cleared by the actual invoice
  cleared_by_invoice_id BIGINT UNSIGNED NULL,
  KEY ix_grncharge (grn_id, charge_type)
```

---

## 11.10 Purchase return, debit note

```sql
prc_purchase_return
  <std>
  plant_id              BIGINT UNSIGNED NOT NULL,
  return_number         VARCHAR(50) NULL,                -- statutory, gapless
  return_date           DATE NOT NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  reason_code           VARCHAR(50) NOT NULL,
  disposition           VARCHAR(30) NOT NULL,            -- RETURN_TO_SUPPLIER|REPLACEMENT_EXPECTED|
                                                         -- REWORK_AT_SUPPLIER|SCRAP_AT_OUR_END|
                                                         -- USE_AS_IS_WITH_CONCESSION
  transporter_name      VARCHAR(200) NULL, vehicle_number VARCHAR(30) NULL,
  eway_bill_no          VARCHAR(20) NULL, eway_bill_date DATE NULL,
  taxable_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax_amount            DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_amount          DECIMAL(18,2) NOT NULL DEFAULT 0,
  debit_note_id         BIGINT UNSIGNED NULL,
  replacement_due_date  DATE NULL, replacement_received_quantity DECIMAL(18,6) NULL,
  status                VARCHAR(30) NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NULL,
  dispatched_at         DATETIME(6) NULL,
  stock_posted_at       DATETIME(6) NULL,
  cancel_reason_code    VARCHAR(50) NULL,
  UNIQUE KEY uk_return_no (company_id, return_number, deleted_key),
  KEY ix_return_supplier (company_id, supplier_id, return_date, status)

prc_purchase_return_item
  <std>
  purchase_return_id    BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  grn_item_id           BIGINT UNSIGNED NOT NULL,
  grn_item_batch_id     BIGINT UNSIGNED NULL,
  purchase_order_item_id BIGINT UNSIGNED NULL,
  item_id               BIGINT UNSIGNED NOT NULL,
  batch_number          VARCHAR(50) NULL, heat_number VARCHAR(50) NULL,
  quantity              DECIMAL(18,6) NOT NULL,
  uom_id                BIGINT UNSIGNED NOT NULL,
  rate                  DECIMAL(18,6) NOT NULL,
  hsn_code              VARCHAR(10) NULL, tax_code_id BIGINT UNSIGNED NULL,
  taxable_amount        DECIMAL(18,2) NOT NULL,
  tax_amount            DECIMAL(18,2) NOT NULL,
  line_total            DECIMAL(18,2) NOT NULL,
  defect_codes          JSON NULL,
  qc_report_ref         VARCHAR(50) NULL,
  UNIQUE KEY uk_return_item (purchase_return_id, line_no, deleted_key),
  KEY ix_returnitem_grn (grn_item_id)

prc_debit_note
  <std>
  debit_note_number     VARCHAR(50) NULL,                -- statutory, gapless
  debit_note_date       DATE NOT NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  debit_note_type       VARCHAR(30) NOT NULL,            -- GOODS_RETURN|RATE_DIFFERENCE|
                                                         -- SHORT_QUANTITY|QUALITY_PENALTY|
                                                         -- LATE_DELIVERY_LD|FREIGHT_CLAIM|
                                                         -- JOB_WORK_LOSS|OTHER
  purchase_return_id    BIGINT UNSIGNED NULL,
  grn_id                BIGINT UNSIGNED NULL,
  purchase_order_id     BIGINT UNSIGNED NULL,
  supplier_invoice_id   BIGINT UNSIGNED NULL,
  original_invoice_no   VARCHAR(50) NULL, original_invoice_date DATE NULL,
  is_pending_invoice    TINYINT(1) NOT NULL DEFAULT 0,
  reason_code           VARCHAR(50) NOT NULL,
  narration             VARCHAR(2000) NULL,
  taxable_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  cgst_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  sgst_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  igst_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_amount          DECIMAL(18,2) NOT NULL DEFAULT 0,
  ld_calculation_json   JSON NULL,
  status                VARCHAR(30) NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NULL,
  supplier_ack_status   VARCHAR(20) NULL,                -- PENDING|ACKNOWLEDGED|DISPUTED
  supplier_ack_at       DATETIME(6) NULL, dispute_note VARCHAR(2000) NULL,
  finance_posting_ref   VARCHAR(50) NULL,
  UNIQUE KEY uk_debitnote_no (company_id, debit_note_number, deleted_key),
  KEY ix_dn_supplier (company_id, supplier_id, debit_note_date, status)

prc_debit_note_item
  <std>
  debit_note_id         BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  item_id               BIGINT UNSIGNED NULL,
  description           VARCHAR(500) NULL,
  quantity              DECIMAL(18,6) NULL, uom_id BIGINT UNSIGNED NULL,
  rate                  DECIMAL(18,6) NULL,
  hsn_code              VARCHAR(10) NULL, tax_code_id BIGINT UNSIGNED NULL,
  taxable_amount        DECIMAL(18,2) NOT NULL,
  tax_amount            DECIMAL(18,2) NOT NULL,
  line_total            DECIMAL(18,2) NOT NULL,
  source_reference      VARCHAR(200) NULL,
  UNIQUE KEY uk_dn_item (debit_note_id, line_no, deleted_key)
```

---

## 11.11 Supplier invoice and matching

```sql
prc_supplier_invoice
  <std>
  plant_id              BIGINT UNSIGNED NULL,
  internal_number       VARCHAR(50) NULL,
  supplier_id           BIGINT UNSIGNED NOT NULL,
  supplier_invoice_no   VARCHAR(50) NOT NULL,
  supplier_invoice_date DATE NOT NULL,
  received_at           DATETIME(6) NOT NULL,
  capture_source        VARCHAR(20) NOT NULL,            -- MANUAL|PORTAL|EMAIL_OCR|EINVOICE
  irn                   VARCHAR(64) NULL,
  irn_ack_no            VARCHAR(30) NULL, irn_ack_date DATE NULL,
  invoice_type          VARCHAR(20) NOT NULL,            -- GOODS|SERVICE|LANDED_COST|ADVANCE
  currency_code         CHAR(3) NOT NULL,
  exchange_rate         DECIMAL(18,8) NOT NULL DEFAULT 1,
  gst_treatment         VARCHAR(20) NULL,
  place_of_supply_state_id BIGINT UNSIGNED NULL,
  taxable_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  cgst_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  sgst_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  igst_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  cess_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  charges_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  round_off             DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_amount          DECIMAL(18,2) NOT NULL DEFAULT 0,
  matched_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  held_amount           DECIMAL(18,2) NOT NULL DEFAULT 0,
  tds_section           VARCHAR(20) NULL, tds_rate DECIMAL(9,4) NULL,
  tds_amount            DECIMAL(18,2) NOT NULL DEFAULT 0,
  tcs_section           VARCHAR(20) NULL, tcs_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_rcm                TINYINT(1) NOT NULL DEFAULT 0,
  itc_eligible_amount   DECIMAL(18,2) NOT NULL DEFAULT 0,
  acceptance_date       DATE NULL,                       -- inspection clearance, drives MSME due
  payment_due_date      DATE NULL,
  is_msme_capped        TINYINT(1) NOT NULL DEFAULT 0,
  match_status          VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING|MATCHED|BLOCKED|PARTIAL
  status                VARCHAR(30) NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NULL,
  finance_voucher_ref   VARCHAR(50) NULL, posted_at DATETIME(6) NULL,
  gstr2b_match_status   VARCHAR(20) NULL,
  reject_reason_code    VARCHAR(50) NULL,
  cancel_reason_code    VARCHAR(50) NULL,
  UNIQUE KEY uk_supinv (company_id, supplier_id, supplier_invoice_no, deleted_key),
  KEY ix_inv_status (company_id, status, match_status, payment_due_date),
  KEY ix_inv_supplier (company_id, supplier_id, supplier_invoice_date),
  KEY ix_inv_msme (company_id, is_msme_capped, payment_due_date)

prc_supplier_invoice_item
  <std>
  supplier_invoice_id   BIGINT UNSIGNED NOT NULL,
  line_no               INT UNSIGNED NOT NULL,
  purchase_order_item_id BIGINT UNSIGNED NULL,
  item_id               BIGINT UNSIGNED NULL,
  description           VARCHAR(500) NULL,
  invoiced_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  uom_id                BIGINT UNSIGNED NULL,
  invoiced_rate         DECIMAL(18,6) NOT NULL DEFAULT 0,
  po_rate               DECIMAL(18,6) NULL,
  matched_quantity      DECIMAL(18,6) NOT NULL DEFAULT 0,
  held_quantity         DECIMAL(18,6) NOT NULL DEFAULT 0,
  hsn_code              VARCHAR(10) NULL, tax_code_id BIGINT UNSIGNED NULL,
  taxable_amount        DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax_amount            DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_total            DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_itc_eligible       TINYINT(1) NOT NULL DEFAULT 1,
  quantity_variance     DECIMAL(18,6) NULL, rate_variance_pct DECIMAL(9,4) NULL,
  UNIQUE KEY uk_inv_item (supplier_invoice_id, line_no, deleted_key),
  KEY ix_invitem_po (purchase_order_item_id)

prc_invoice_grn_link                      -- n..m invoice item ↔ GRN item
  <std>
  supplier_invoice_item_id BIGINT UNSIGNED NOT NULL,
  grn_item_id           BIGINT UNSIGNED NOT NULL,
  matched_quantity      DECIMAL(18,6) NOT NULL,
  matched_amount        DECIMAL(18,2) NOT NULL,
  UNIQUE KEY uk_invgrn (supplier_invoice_item_id, grn_item_id, deleted_key),
  KEY ix_invgrn_grn (grn_item_id)

prc_invoice_match_exception
  <std>
  supplier_invoice_id   BIGINT UNSIGNED NOT NULL,
  supplier_invoice_item_id BIGINT UNSIGNED NULL,
  exception_type        VARCHAR(30) NOT NULL,            -- PRICE_VARIANCE|QUANTITY_VARIANCE|
                                                         -- GRN_MISSING|PO_MISSING|TAX_MISMATCH|
                                                         -- HSN_MISMATCH|DUPLICATE_INVOICE|
                                                         -- SUPPLIER_MISMATCH|CURRENCY_MISMATCH|
                                                         -- CHARGES_NOT_ON_PO|EXPIRED_PO|
                                                         -- BLOCKED_SUPPLIER|MSME_TERM_BREACH
  expected_value        VARCHAR(200) NULL,
  actual_value          VARCHAR(200) NULL,
  variance_amount       DECIMAL(18,2) NULL, variance_pct DECIMAL(9,4) NULL,
  tolerance_applied     VARCHAR(100) NULL,
  resolution            VARCHAR(30) NULL,                -- ACCEPT_VARIANCE|DEBIT_NOTE|
                                                         -- REQUEST_CREDIT_NOTE|AMEND_PO|
                                                         -- REVERSE_GRN|REJECT_INVOICE|HOLD_QTY
  resolution_note       VARCHAR(2000) NULL,
  resolved_by           BIGINT UNSIGNED NULL, resolved_at DATETIME(6) NULL,
  approved_by           BIGINT UNSIGNED NULL, approved_at DATETIME(6) NULL,
  related_debit_note_id BIGINT UNSIGNED NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  KEY ix_matchexc (company_id, exception_type, status, created_at),
  KEY ix_matchexc_inv (supplier_invoice_id)
```

---

## 11.12 Configuration and supporting tables

```sql
prc_parameter                             -- module parameters (Ch 8 §8.11)
  <std>
  param_code            VARCHAR(60) NOT NULL,
  scope_level           VARCHAR(20) NOT NULL,            -- COMPANY|PLANT|SUPPLIER|ITEM|CATEGORY
  scope_id              BIGINT UNSIGNED NULL,
  param_value           VARCHAR(500) NOT NULL,
  data_type             VARCHAR(20) NOT NULL,
  valid_from            DATE NOT NULL, valid_to DATE NULL,
  UNIQUE KEY uk_prcparam (company_id, param_code, scope_level, scope_id, valid_from, deleted_key)

prc_terms_template                        -- reusable T&C sets, versioned
  <std>
  code VARCHAR(50) NOT NULL, name VARCHAR(200) NOT NULL,
  document_type VARCHAR(30) NOT NULL,                    -- RFQ|PO|CONTRACT
  version_no SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  content MEDIUMTEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_termstpl (company_id, code, version_no, deleted_key)

prc_rfq_template
  <std>
  code VARCHAR(50) NOT NULL, name VARCHAR(200) NOT NULL,
  item_category_id BIGINT UNSIGNED NULL,
  default_terms_json JSON NULL,
  default_instructions TEXT NULL,
  default_vendor_group JSON NULL,
  terms_template_id BIGINT UNSIGNED NULL,
  UNIQUE KEY uk_rfqtpl (company_id, code, deleted_key)

prc_landed_cost_component                 -- estimation rates for imports/freight
  <std>
  component_code VARCHAR(30) NOT NULL,
  hsn_code VARCHAR(10) NULL, country_id BIGINT UNSIGNED NULL,
  rate_pct DECIMAL(9,4) NULL, rate_amount DECIMAL(18,2) NULL,
  basis VARCHAR(20) NOT NULL,                            -- ASSESSABLE_VALUE|WEIGHT|CONTAINER|FLAT
  valid_from DATE NOT NULL, valid_to DATE NULL,
  UNIQUE KEY uk_landedcost (company_id, component_code, hsn_code, country_id, valid_from,
                            deleted_key)

prc_jobwork_challan_link                  -- bridge to Vol 4 challans
  <std>
  purchase_order_id     BIGINT UNSIGNED NOT NULL,
  purchase_order_item_id BIGINT UNSIGNED NULL,
  challan_reference     VARCHAR(50) NOT NULL,            -- inv_jobwork_challan document no.
  challan_date          DATE NOT NULL,
  item_id               BIGINT UNSIGNED NOT NULL,
  issued_quantity       DECIMAL(18,6) NOT NULL,
  returned_quantity     DECIMAL(18,6) NOT NULL DEFAULT 0,
  balance_quantity      DECIMAL(18,6) NOT NULL DEFAULT 0,
  statutory_due_date    DATE NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  KEY ix_jwlink_due (company_id, status, statutory_due_date),
  KEY ix_jwlink_po (purchase_order_id)
```

---

## 11.13 Indexing and volumetrics

**V3-PRC-DR-001 (M)** Expected 5-year volumes at the client's stated scale, used to size
indexes and to decide partitioning:

| Table | Rows/year (est.) | 5-year | Notes |
|---|---|---|---|
| `prc_purchase_requisition` + items | 3,000 / 12,000 | 60,000 | Offset pagination fine |
| `prc_rfq` + items + vendors | 1,200 / 4,000 / 5,000 | 50,000 | — |
| `prc_supplier_quotation` + items | 3,500 / 12,000 | 78,000 | — |
| `prc_purchase_order` + items | 4,000 / 15,000 | 95,000 | — |
| `prc_po_schedule_line` | 25,000 | 125,000 | Hot table for expediting; covered index on `(company_id, status, scheduled_date)` |
| `prc_grn` + items + batches | 6,000 / 20,000 / 45,000 | 355,000 | Batch table is the largest; partition by year if it exceeds 10M |
| `prc_supplier_invoice` + items | 6,000 / 20,000 | 130,000 | — |
| `prc_invoice_match_exception` | 1,500 | 7,500 | — |
| `prc_rate_contract_consumption` | 3,000 | 15,000 | Append-only ledger |

**V3-PRC-DR-002 (M)** Cursor-based pagination (Vol 0 §8.4) is mandatory for
`prc_grn_item_batch`, `prc_po_schedule_line` and `prc_rate_contract_consumption`; offset
pagination is acceptable elsewhere.

**V3-PRC-DR-003 (M)** Every list screen's default sort and filter combination MUST be covered
by an index, verified by an `EXPLAIN` assertion in the integration test suite (Vol 0 §7.7).

**V3-PRC-DR-004 (M)** Derived quantity columns (`ordered_quantity` on a PR item,
`received_quantity` on a PO item, `consumed_quantity` on a rate contract) are **stored and
maintained transactionally** by the service that changes them, and validated nightly by an
integrity job that recomputes them from source rows and reports any drift. They are stored
because every list screen needs them and recomputing on read does not scale; they are verified
because stored derivations rot.

## 11.14 Referential and integrity rules

| Rule | Enforcement |
|---|---|
| Soft delete only; `deleted_key` companion on every unique business key | Vol 0 §7.5, schema |
| `company_id` on every table and every query | Base repository (CLAUDE.md §4.3) |
| No FK across module boundaries in a write path | Reviewed; cross-module references are stored as id + document number, resolved via the owning module's service |
| Line quantity invariants (`accepted + rejected + pending ≤ received`) | CHECK constraint + service assertion + nightly job |
| PR ordered quantity ≤ PR quantity + tolerance | Service, transaction-scoped, with `SELECT … FOR UPDATE` on the PR item |
| Rate contract consumption ≤ committed | Service, under a Redis lock keyed `ratecontract:{id}` |
| Document numbers unique per company + type | Numbering engine + unique index (Vol 1 V1-NUM-BR-005) |
| Optimistic locking on every update | `version` column, `If-Match` (Vol 0 §7.9) |
| Money never `FLOAT` | Type discipline, CI check |

---

**Next:** [Chapter 12 — API, Events & Integration](12-api-events-and-integration.md)
