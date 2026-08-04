# Volume 3 · Chapter 12 — API, Events & Integration

Prerequisite: [Vol 0](../volume-00-foundation.md) §8 (API standards) and §18 (events and
integration). Those rules are assumed here and not repeated: base path `/api/v1`, plural
resource nouns, **`uid` (ULID) in every URL and payload — never `id`**, enveloped list
responses `{data, meta}`, RFC 9457 `application/problem+json` errors, `Idempotency-Key` on
every mutation, `If-Match` for optimistic locking, `X-Correlation-Id` on every response,
`202 Accepted` + job uid for long-running work, `207 Multi-Status` for bulk.

---

## 12.1 API conventions specific to this module

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PRC-IR-001** | M | State transitions are **sub-resources**, never a `status` field in a PATCH. `POST /purchase-orders/{uid}/approve` is the only way a PO becomes approved. A client that can PATCH `status` can bypass the state machine, so the field is read-only in every schema. |
| **V3-PRC-IR-002** | M | Every endpoint declares its permission as a dependency; an endpoint without one fails CI (CLAUDE.md §5.4). The permission is documented in the OpenAPI operation's `x-permission` extension so the RBAC test suite can enumerate it. |
| **V3-PRC-IR-003** | M | Filtering uses the whitelisted query grammar (Vol 0 §8.5). Free-text filter strings never reach SQL. Each list endpoint publishes its filterable and sortable field set in OpenAPI. |
| **V3-PRC-IR-004** | M | Money and quantity are serialised as **strings** in JSON to avoid float rounding in JavaScript clients, with the scale fixed per Vol 0 §7.4. |
| **V3-PRC-IR-005** | M | Field-level security is applied in the response serialiser: a restricted field is **absent**, not null (Ch 10 V3-PRC-BR-007). Clients must treat absence as "not permitted", and the OpenAPI schema marks such fields as conditionally present. |
| **V3-PRC-IR-006** | M | Every document detail response includes `allowed_actions[]`, computed server-side from state machine + permission + data scope. The UI renders its action bar from this and never infers it. |
| **V3-PRC-IR-007** | M | Every document detail response includes `document_flow` — upstream and downstream linked documents with uid, number, type and status — from `core_document_link`. |
| **V3-PRC-IR-008** | M | Supplier-portal endpoints live under `/api/v1/portal/…`, authenticate an external principal bound to one supplier, and are rate-limited separately. No internal endpoint is reachable by a portal principal. |

---

## 12.2 Endpoint catalogue

`✱` = accepts `Idempotency-Key`. `⚑` = emits a domain event. Permissions are shown without the
`PROCUREMENT.` prefix.

### 12.2.1 Supplier management

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/suppliers` | `SUPPLIER.VIEW` | Procurement view; filters: status, category, criticality, grade, buyer, expiring-documents |
| POST ✱⚑ | `/suppliers` | `SUPPLIER.CREATE` | Creates in `REGISTERED`; runs duplicate check and returns matches in `meta.duplicates` |
| GET | `/suppliers/{uid}` | `SUPPLIER.VIEW` | Supplier 360 aggregate; bank block omitted without `VIEW_BANK` |
| PATCH | `/suppliers/{uid}` | `SUPPLIER.EDIT` | `If-Match` required |
| POST ✱ | `/suppliers/{uid}/submit-qualification` | `SUPPLIER.SUBMIT` | Starts the parallel workflow |
| POST ✱⚑ | `/suppliers/{uid}/approve` · `/reject` | `SUPPLIER.APPROVE` | Task-based; reason required on reject |
| POST ✱⚑ | `/suppliers/{uid}/hold` · `/release-hold` | `SUPPLIER.HOLD` | Reason code + duration |
| POST ✱⚑ | `/suppliers/{uid}/blacklist` · `/reinstate` | `SUPPLIER.BLACKLIST` · `.REINSTATE` | Returns open-exposure disposition list |
| GET/POST/PATCH | `/suppliers/{uid}/documents` | `SUPPLIER.VIEW` / `.EDIT` | Compliance register |
| GET | `/suppliers/{uid}/bank-accounts` | `SUPPLIER.VIEW_BANK` | Masked otherwise; unmask audited |
| POST ✱⚑ | `/suppliers/{uid}/bank-accounts` | `SUPPLIER.EDIT_BANK` | Raises the bank-change workflow |
| GET | `/suppliers/{uid}/evaluations` · `/evaluations/{uid}` | `SUPPLIER.VIEW` | Scorecards with drill-through |
| POST ✱⚑ | `/supplier-evaluations/run` | `SUPPLIER.RATE` | `202` + job uid — batch period rating |
| GET/POST/PATCH/DELETE | `/approved-vendor-list` · `/{uid}` | `AVL.VIEW` / `.EDIT` | Item × supplier matrix |
| GET | `/suppliers/{uid}/transactions` | `SUPPLIER.VIEW` | Rolled-up RFQ/PO/GRN/invoice summary |
| POST ✱ | `/suppliers/{uid}/portal-users` · `/invite` | `SUPPLIER.PORTAL_MANAGE` | Invitation token |
| POST ✱ | `/suppliers/import` | `SUPPLIER.IMPORT` | `202` + job uid; row-level error report |

### 12.2.2 Purchase requisition

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/purchase-requisitions` | `PR.VIEW` | Scope-filtered; `?scope=mine\|department\|all` |
| POST ✱⚑ | `/purchase-requisitions` | `PR.CREATE` | Returns budget and stock context in `meta` |
| GET | `/purchase-requisitions/{uid}` | `PR.VIEW` | Includes `allowed_actions`, `document_flow` |
| PATCH | `/purchase-requisitions/{uid}` | `PR.EDIT` | Draft only; `If-Match` |
| DELETE | `/purchase-requisitions/{uid}` | `PR.DELETE` | **Soft delete, draft only** |
| POST ✱⚑ | `/purchase-requisitions/{uid}/submit` | `PR.SUBMIT` | Runs all validations; returns the resolved approval route |
| POST ✱⚑ | `/purchase-requisitions/{uid}/recall` | originator | Level 1 untouched only |
| POST ✱⚑ | `/purchase-requisitions/{uid}/cancel` · `/short-close` | `PR.CANCEL` · `.SHORT_CLOSE` | Reason code required |
| POST ✱⚑ | `/purchase-requisitions/{uid}/amend` | `PR.AMEND` | Creates R(n+1) draft |
| GET | `/purchase-requisitions/{uid}/revisions` · `/revisions/{n}/diff` | `PR.VIEW` | — |
| POST | `/purchase-requisitions/{uid}/budget-check` | `PR.VIEW` | Idempotent read-model call |
| PATCH | `/purchase-requisition-items/{uid}/sourcing-decision` | `PR.SET_SOURCING` | — |
| GET | `/purchase-requisitions/consolidation` | `PR.CONSOLIDATE` | Grouped open lines with price-break analysis |
| POST ✱ | `/purchase-requisitions/consolidation/to-rfq` · `/to-purchase-order` | `RFQ.CREATE` · `PO.CREATE` | Creates the downstream draft with links |
| GET | `/planned-orders` | `PR.CREATE` | MRP staging (read from Vol 5's service) |
| POST ✱⚑ | `/planned-orders/convert` | `PR.CREATE` | Bulk → `207` |
| POST ✱ | `/purchase-requisitions/import` | `PR.CREATE` | `202` + job uid |
| GET | `/purchase-requisitions/{uid}/print` | `PR.PRINT` | PDF |

### 12.2.3 RFQ

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET/POST ✱⚑ | `/rfqs` | `RFQ.VIEW` / `.CREATE` | — |
| GET/PATCH/DELETE | `/rfqs/{uid}` | `RFQ.VIEW` / `.EDIT` / `.DELETE` | Draft-only edit/delete |
| POST ✱ | `/rfqs/{uid}/vendors` · DELETE `/vendors/{uid}` | `RFQ.EDIT` | Eligibility validated; ineligible returns 422 with per-vendor reasons |
| GET | `/rfqs/{uid}/eligible-vendors` | `RFQ.EDIT` | AVL suggestions with rating, last rate, status |
| POST ✱⚑ | `/rfqs/{uid}/submit` | `RFQ.SUBMIT` | Only when approval is configured on |
| POST ✱⚑ | `/rfqs/{uid}/dispatch` | `RFQ.DISPATCH` | `202` + job uid; per-vendor result; content check runs first |
| GET | `/rfqs/{uid}/dispatch-log` | `RFQ.VIEW` | Sent/delivered/opened/responded per vendor |
| POST ✱ | `/rfqs/{uid}/remind` | `RFQ.DISPATCH` | Optional `vendor_uids[]` |
| POST ✱⚑ | `/rfqs/{uid}/amend` (corrigendum) | `RFQ.AMEND` | Change summary required; supersedes quotations |
| POST ✱⚑ | `/rfqs/{uid}/extend` | `RFQ.EXTEND` | Reason + acknowledgement when quotes exist |
| POST ✱⚑ | `/rfqs/{uid}/close` · `/close-no-award` | `RFQ.EDIT` | Reason required for no-award |
| POST ✱⚑ | `/rfqs/{uid}/cancel` | `RFQ.CANCEL` | Reason code; notifies all vendors |
| POST ✱ | `/rfqs/{uid}/open-sealed` | `RFQ.OPEN_SEALED` | **Two authorised principals required**; second call completes it |
| GET | `/rfqs/{uid}/print` · `/preview/{vendor_uid}` | `RFQ.PRINT` | Per-vendor artefact preview |
| GET/POST | `/rfq-templates` · `/{uid}` | `RFQ.VIEW` / `.CREATE` | — |

### 12.2.4 Quotations

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET/POST ✱ | `/supplier-quotations` | `QUOTATION.VIEW` / `.CREATE` | Rate fields absent without `VIEW_RATES` |
| GET/PATCH/DELETE | `/supplier-quotations/{uid}` | `QUOTATION.VIEW` / `.EDIT` | Edit blocked once `RECEIVED` |
| POST ✱⚑ | `/supplier-quotations/{uid}/mark-received` | `QUOTATION.CREATE` | Runs arithmetic reconciliation |
| GET | `/supplier-quotations/portal-inbox` | `QUOTATION.ACCEPT_PORTAL` | Completeness check per submission |
| POST ✱⚑ | `/supplier-quotations/{uid}/accept` · `/return` · `/reject` | `QUOTATION.ACCEPT_PORTAL` · `.RETURN_PORTAL` | — |
| POST ✱⚑ | `/supplier-quotations/{uid}/revise` | `QUOTATION.REVISE` | Creates R(n+1), supersedes prior |
| GET | `/supplier-quotations/{uid}/revisions` · `/diff` | `QUOTATION.VIEW` | — |
| POST ✱ | `/supplier-quotations/{uid}/deviations/{uid}/dispose` | `QUOTATION.EDIT` | Accept / not accept / negotiate |
| POST ✱⚑ | `/supplier-quotations/{uid}/regret` | `QUOTATION.CREATE` | Reason code |
| POST ✱ | `/supplier-quotations/import` | `QUOTATION.CREATE` | Excel template; `202` + job uid |
| GET | `/items/{uid}/price-history` | `QUOTATION.VIEW_RATES` | Rate trend across quotes, POs and invoices |

### 12.2.5 Comparison and award

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET/POST ✱ | `/comparisons` | `COMPARISON.VIEW` / `.CREATE` | Create snapshots criteria and quotation revisions |
| GET | `/comparisons/{uid}` | `COMPARISON.VIEW` | Full matrix with landed-cost breakups |
| POST | `/comparisons/{uid}/recompute` | `COMPARISON.EDIT` | Re-runs normalisation and scoring |
| POST | `/comparisons/{uid}/simulate` | `COMPARISON.EDIT` | What-if weights/exclusions; **does not persist** unless `save=true` |
| GET | `/comparisons/{uid}/recommendation` | `COMPARISON.VIEW` | Ranked list + rationale + risk notes |
| POST ✱ | `/comparisons/{uid}/award` | `COMPARISON.AWARD` | Split allocation; validates MOQ, capacity, max share |
| POST ✱⚑ | `/comparisons/{uid}/submit` | `COMPARISON.SUBMIT` | Generates and attaches the statement PDF |
| POST ✱⚑ | `/comparisons/{uid}/approve` · `/reject` | `COMPARISON.APPROVE` | Task-based |
| POST ✱⚑ | `/comparisons/{uid}/negotiations` | `QUOTATION.NEGOTIATE` | Round to one or more vendors |
| GET | `/comparisons/{uid}/negotiations` | `COMPARISON.VIEW` | Rounds with savings |
| POST ✱⚑ | `/comparisons/{uid}/convert-to-po` | `PO.CREATE` | Returns the created PO drafts (one per vendor/split) |
| GET | `/comparisons/{uid}/statement` | `COMPARISON.PRINT` | The frozen PDF artefact |
| GET/POST/PATCH | `/evaluation-criteria` · `/evaluation-weight-sets` | `COMPARISON.CONFIGURE_WEIGHTS` | Versioned, effective-dated |

### 12.2.6 Purchase order

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET/POST ✱⚑ | `/purchase-orders` | `PO.VIEW` / `.CREATE` | `?source=comparison\|requisition\|contract\|copy` |
| GET/PATCH/DELETE | `/purchase-orders/{uid}` | `PO.VIEW` / `.EDIT` / `.DELETE` | Draft only; rates absent without `VIEW_RATES` |
| POST ✱⚑ | `/purchase-orders/{uid}/submit` | `PO.SUBMIT` | Full validation incl. supplier transactability, budget, split detection |
| POST ✱⚑ | `/purchase-orders/{uid}/approve` · `/reject` | `PO.APPROVE` | Task-based; number allocated on final approval |
| POST ✱⚑ | `/purchase-orders/{uid}/release` | `PO.RELEASE` | Generates + hashes the artefact, dispatches; `202` + job uid |
| POST ✱ | `/purchase-orders/{uid}/resend` | `PO.RELEASE` | Re-sends the **stored** artefact |
| POST ✱⚑ | `/purchase-orders/{uid}/amend` | `PO.AMEND` | R(n+1) draft with the change reason |
| GET | `/purchase-orders/{uid}/revisions` · `/revisions/{n}/diff` | `PO.VIEW` | — |
| POST ✱⚑ | `/purchase-orders/{uid}/hold` · `/release-hold` | `PO.HOLD` | Reason code |
| POST ✱⚑ | `/purchase-orders/{uid}/cancel` · `/short-close` | `PO.CANCEL` · `.SHORT_CLOSE` | Blocked when receipts exist (cancel) |
| POST ✱⚑ | `/purchase-orders/{uid}/close` · `/reopen` | `PO.EDIT` · `.REOPEN` | Reopen is privileged and audited |
| GET/POST | `/purchase-order-items/{uid}/schedules` | `PO.VIEW` / `.EDIT` | Schedule lines |
| GET | `/purchase-orders/open` | `PO.VIEW` | Expediting feed: overdue and due-soon schedule lines |
| POST ✱ | `/purchase-orders/{uid}/followups` | `PO.VIEW` | Expediting log entry |
| POST ✱⚑ | `/purchase-orders/{uid}/acknowledge` | portal or `PO.EDIT` | Supplier acknowledgement / date-change proposal |
| POST | `/purchase-orders/{uid}/acknowledgements/{uid}/respond` | `PO.EDIT` | Accept (→ amendment) or reject |
| GET | `/purchase-orders/{uid}/print` | `PO.PRINT` | Stored artefact, never re-rendered |
| GET/POST ✱⚑ | `/rate-contracts` · `/{uid}` | `RATE_CONTRACT.*` | Incl. `/consumption`, `/derive-rate?as_of=` |
| POST ✱⚑ | `/rate-contracts/{uid}/call-off` | `PO.CREATE` | Validates validity, balance, MOQ |
| GET | `/purchase-orders/{uid}/subcontract-reconciliation` | `SUBCONTRACT.RECONCILE` | Issued vs returned vs loss |
| GET | `/subcontract-challans` | `SUBCONTRACT.VIEW` | Ageing against the statutory window |
| GET | `/subcontract-challans/itc04-extract` | `SUBCONTRACT.VIEW` | `202` + job uid |

### 12.2.7 Gate entry, GRN

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET/POST ✱⚑ | `/gate-entries` | `GATE_ENTRY.VIEW` / `.CREATE` | Barcode gate pass returned |
| GET/PATCH | `/gate-entries/{uid}` | `GATE_ENTRY.VIEW` / `.EDIT` | — |
| POST ✱ | `/gate-entries/{uid}/weigh` | `GATE_ENTRY.EDIT` | Device or manual with reason |
| POST ✱ | `/gate-entries/{uid}/exit` · `/cancel` | `GATE_ENTRY.EDIT` · `.CANCEL` | — |
| GET | `/gate-entries/{uid}/print` | `GATE_ENTRY.PRINT` | Gate pass with barcode |
| GET/POST ✱⚑ | `/goods-receipts` | `GRN.VIEW` / `.CREATE` | `?from_gate_entry=` or `?from_po=` |
| GET/PATCH/DELETE | `/goods-receipts/{uid}` | `GRN.VIEW` / `.EDIT` / `.DELETE` | Draft only |
| GET | `/purchase-orders/{uid}/pending-receipt` | `GRN.CREATE` | Open schedule lines with pending quantity |
| POST ✱ | `/goods-receipt-items/{uid}/batches` | `GRN.EDIT` | Batch/heat split; totals reconciled |
| POST ✱⚑ | `/goods-receipts/{uid}/submit` | `GRN.SUBMIT` | Tolerance, batch, MTC validations |
| POST ✱⚑ | `/goods-receipts/{uid}/approve` · `/reject` | `GRN.APPROVE` | Number allocated (gapless) on approval; raises inspection lots |
| POST ✱ | `/goods-receipt-items/{uid}/accept-excess` | `GRN.ACCEPT_EXCESS` | Reason required |
| POST ✱⚑ | `/goods-receipt-items/{uid}/inspection-result` | Vol 7 service principal | Accepted / rejected / deviation quantities + defects |
| POST ✱ | `/goods-receipt-items/{uid}/accept-deviation` | `GRN.ACCEPT_DEVIATION` | Concession reason; may propose a debit note |
| POST ✱⚑ | `/goods-receipts/{uid}/putaway` | `GRN.PUTAWAY` | Bin assignment; completes the GRN |
| POST ✱⚑ | `/goods-receipts/{uid}/reverse` | `GRN.REVERSE` | Creates a reversal GRN |
| POST ✱ | `/goods-receipts/{uid}/cancel` | `GRN.CANCEL` | Pre-posting only |
| PATCH | `/goods-receipt-item-batches/{uid}` | `GRN.EDIT_BATCH_POSTED` | Post-posting batch correction; reason mandatory, audited |
| GET | `/goods-receipts/pending-inspection` | `GRN.VIEW` | Board feed with ageing |
| GET | `/traceability/batch/{batch_or_heat}` | `GRN.VIEW` | Forward and backward chain |
| GET | `/goods-receipts/{uid}/print` | `GRN.PRINT` | — |

### 12.2.8 Return, debit note, invoice

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET/POST ✱⚑ | `/purchase-returns` | `RETURN.VIEW` / `.CREATE` | From GRN rejected quantities |
| GET/PATCH | `/purchase-returns/{uid}` | `RETURN.VIEW` / `.EDIT` | — |
| POST ✱⚑ | `/purchase-returns/{uid}/submit` · `/approve` · `/reject` | `RETURN.*` | — |
| POST ✱⚑ | `/purchase-returns/{uid}/dispatch` | `RETURN.DISPATCH` | Generates the e-way bill where required |
| GET/POST ✱⚑ | `/debit-notes` · `/{uid}` | `DEBIT_NOTE.*` | Types per Ch 7 §7.10 |
| POST | `/debit-notes/compute-ld` | `DEBIT_NOTE.CREATE` | LD proposal from the PO clause and actual dates |
| POST ✱⚑ | `/debit-notes/{uid}/submit` · `/approve` · `/reject` · `/cancel` | `DEBIT_NOTE.*` | — |
| GET/POST ✱⚑ | `/supplier-invoices` | `INVOICE.VIEW` / `.CREATE` | Duplicate check on (supplier, number, FY) |
| GET/PATCH | `/supplier-invoices/{uid}` | `INVOICE.VIEW` / `.EDIT` | — |
| POST ✱ | `/supplier-invoices/{uid}/match` | `INVOICE.MATCH` | Runs the 3-way match; returns exceptions |
| GET | `/supplier-invoices/{uid}/match-result` | `INVOICE.VIEW` | Side-by-side PO/GRN/invoice |
| POST ✱ | `/invoice-match-exceptions/{uid}/resolve` | `INVOICE.RESOLVE_EXCEPTION` | Resolution + note; may create a debit note |
| POST ✱⚑ | `/supplier-invoices/{uid}/submit` · `/approve` · `/reject` | `INVOICE.*` | Approval hands off to Finance |
| POST ✱ | `/supplier-invoices/{uid}/apportion-landed-cost` | `INVOICE.MATCH` | Third-party freight/customs → GRN lines |
| GET | `/grir/reconciliation` | `INVOICE.VIEW` | RNI / IRN by supplier, PO, age |
| GET | `/supplier-invoices/purchase-register` | `REPORT.VIEW_COST` | GSTR-2B matching extract; `202` + job uid |

### 12.2.9 Approval, dashboard, reports, settings

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/approvals/inbox?module=procurement` | authenticated | Vol 1 engine, module-filtered |
| POST | `/approvals/tasks/{uid}/approve` · `/reject` · `/return` · `/reassign` · `/request-info` | assignee | Vol 1 Ch 4 |
| POST | `/approvals/tasks/{uid}/approve-with-condition` | assignee | **Procurement extension** — creates a tracked condition |
| POST | `/approvals/tasks/{uid}/partial-approve` | assignee | **Procurement extension** — splits the document |
| GET | `/approvals/conditions` · POST `/{uid}/close` | assignee / owner | Condition register |
| POST | `/approvals/bulk-approve` | assignee | `207 Multi-Status` |
| GET | `/procurement/dashboard?widgets=…` | `DASHBOARD.VIEW` | Batched widget fetch; per-widget scope and cache class |
| GET | `/procurement/dashboard/widgets/{code}/drill` | widget's permission | Returns the list query the widget aggregates |
| GET | `/procurement/reports` · `/{code}/run` · `/{code}/schedule` | `REPORT.VIEW` · `.SCHEDULE` | `202` + job uid for heavy reports |
| GET | `/jobs/{uid}` | authenticated | Vol 0 §8.8 |
| GET/PATCH | `/procurement/parameters` | `SETTINGS.VIEW` / `.EDIT` | Effective-dated |
| GET/POST/PATCH | `/procurement/terms-templates` · `/print-templates` | `SETTINGS.EDIT_TEMPLATE` | Versioned |
| GET/POST | `/procurement/reason-codes` | `SETTINGS.EDIT_REASON_CODE` | Scoped per document type |

### 12.2.10 Supplier portal

| Method | Endpoint | Principal | Notes |
|---|---|---|---|
| GET | `/portal/profile` · PATCH | supplier | Own record; changes to bank/statutory raise internal approval |
| GET/POST | `/portal/documents` | supplier | Renew compliance documents |
| GET | `/portal/rfqs` · `/rfqs/{uid}` | supplier | Only RFQs they were invited to |
| POST ✱ | `/portal/rfqs/{uid}/quotation` (draft) · `/submit` | supplier | Returns the acknowledgement PDF + hash |
| POST | `/portal/rfqs/{uid}/regret` | supplier | Reason code |
| GET | `/portal/purchase-orders` · `/{uid}` | supplier | Released POs only |
| POST ✱⚑ | `/portal/purchase-orders/{uid}/acknowledge` | supplier | May propose a revised date |
| POST ✱⚑ | `/portal/asn` | supplier | Advance shipping notice with batch/heat data |
| POST ✱ | `/portal/invoices` | supplier | Upload with PDF and e-invoice JSON |
| GET | `/portal/invoices/{uid}/status` | supplier | Match and payment status |
| GET | `/portal/debit-notes` · POST `/{uid}/acknowledge` · `/dispute` | supplier | — |
| GET | `/portal/scorecards` | supplier | Published scorecards only |

---

## 12.3 Representative payloads

### Create a purchase order from an award

```http
POST /api/v1/purchase-orders
Idempotency-Key: 01J9F3K2QW8ZP4X7NB6M2VHT3E
Content-Type: application/json
```
```json
{
  "source": "comparison",
  "comparison_uid": "01J8Z9Q3M4N5P6R7S8T9V0W1X2",
  "supplier_uid": "01J7A2B3C4D5E6F7G8H9J0K1L2",
  "po_type": "STANDARD",
  "procurement_type": "DIRECT_MATERIAL",
  "po_date": "2026-08-05",
  "plant_uid": "01J5PLANT000000000000001",
  "currency_code": "INR",
  "items": [
    {
      "item_uid": "01J6ITEM0000000000SS304C5",
      "specification": "0.5±0.02 × 400mm, 2B finish, EN10204 3.1 MTC required",
      "ordered_quantity": "7000.000000",
      "uom_code": "KG",
      "rate": "248.000000",
      "discount_pct": "0.5000",
      "tax_code": "IGST18",
      "promised_date": "2026-08-26",
      "delivery_warehouse_uid": "01J5WH00000000000000RM01",
      "cost_centre_uid": "01J5CC000000000000PROD01",
      "inspection_requirement": "100_PCT",
      "price_variance_justification": "Index revision effective 15-Aug per JSW circular",
      "schedules": [
        { "scheduled_date": "2026-08-26", "scheduled_quantity": "4000.000000" },
        { "scheduled_date": "2026-09-05", "scheduled_quantity": "3000.000000" }
      ],
      "requisition_links": [
        { "requisition_item_uid": "01J8PR0000000000000000311", "quantity": "4000.000000" },
        { "requisition_item_uid": "01J8PR0000000000000000318", "quantity": "3000.000000" }
      ]
    }
  ],
  "charges": [
    { "charge_type": "INSURANCE", "borne_by": "BUYER", "amount": "4200.00",
      "apportion_basis": "VALUE", "is_landed_cost": true }
  ]
}
```

`201 Created` returns the draft with server-computed totals, **no `po_number`** (allocated at
approval), the resolved `approval_route`, and any warnings requiring justification:

```json
{
  "uid": "01J9PO00000000000000DRAFT",
  "po_number": null,
  "revision_no": 0,
  "status": "DRAFT",
  "version": 1,
  "totals": { "taxable_amount": "1731380.00", "igst_amount": "311648.40",
              "round_off": "-0.40", "total_amount": "2043028.00" },
  "approval_route": [
    { "level": 1, "name": "Purchase Manager", "sla_hours": 12 },
    { "level": 2, "name": "Finance Verification", "sla_hours": 24 },
    { "level": 3, "name": "Factory Manager", "sla_hours": 24 },
    { "level": 4, "name": "Director", "sla_hours": 48 }
  ],
  "warnings": [
    { "code": "PRICE_ABOVE_CONTRACT", "severity": "WARNING",
      "message": "Rate 248.000000 is 1.85% above rate contract RC/25-26/004 (243.500000)",
      "requires_justification": true, "justification_provided": true },
    { "code": "RELATED_ORDERS_IN_WINDOW", "severity": "INFO",
      "message": "2 other POs to this supplier in the last 7 days totalling 3,860,000.00 "
                 "will be shown to approvers" }
  ],
  "allowed_actions": ["EDIT", "SUBMIT", "DELETE", "PRINT_PREVIEW"]
}
```

### Blocking validation error (RFC 9457)

```json
{
  "type": "https://erp.example.com/problems/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "The purchase order cannot be submitted.",
  "correlation_id": "01J9F3K2QW8ZP4X7NB6M2VHT3E",
  "errors": [
    { "field": "supplier_uid",
      "code": "SUPPLIER_DOCUMENT_EXPIRED",
      "message": "Supplier Jindal Stainless: ISO 9001 certificate expired on 20-Aug-2026." },
    { "field": "items[0].ordered_quantity",
      "code": "ORDER_MULTIPLE_VIOLATION",
      "message": "Quantity 7,150 KG is not a multiple of 500 KG. Nearest valid: 7,000 or 7,500.",
      "meta": { "nearest_lower": "7000.000000", "nearest_upper": "7500.000000" } }
  ]
}
```

### Optimistic-lock conflict

```json
{
  "type": "https://erp.example.com/problems/concurrent-modification",
  "title": "Concurrent modification",
  "status": 409,
  "detail": "This purchase order was changed by another user while you were editing it.",
  "current_version": 4,
  "your_version": 3,
  "changed_fields": ["items[0].rate", "items[0].promised_date"],
  "current_state": { "…": "server state for the UI to diff" }
}
```

### GRN inspection result posted by Quality

```http
POST /api/v1/goods-receipt-items/01J9GRN00000000000ITEM001/inspection-result
```
```json
{
  "inspection_lot_ref": "QCL/25-26/00412",
  "inspected_by_uid": "01J5USER0000000000QCINSP1",
  "batches": [
    { "batch_uid": "01J9GRNB000000000000H24418",
      "accepted_quantity": "3120.000000", "rejected_quantity": "0.000000" },
    { "batch_uid": "01J9GRNB000000000000H24419",
      "accepted_quantity": "2980.000000", "rejected_quantity": "0.000000" },
    { "batch_uid": "01J9GRNB000000000000H24422",
      "accepted_quantity": "0.000000", "rejected_quantity": "2140.000000",
      "defect_codes": ["MTC_MISSING", "THICKNESS_OUT_OF_TOLERANCE"] }
  ]
}
```

---

## 12.4 Domain events published

Names follow `procurement.<aggregate>.<past_tense_verb>` (Vol 0 V0-IR-020). Payloads carry
identifiers and changed business facts only (V0-IR-021).

| Event | Payload (beyond standard envelope) | Primary consumers |
|---|---|---|
| `procurement.supplier.registered` | supplier_uid, categories, criticality | Notification, Workflow |
| `procurement.supplier.approved` | supplier_uid, provisional?, limit, valid_to | MDM, Portal provisioning, Notification |
| `procurement.supplier.held` / `.released` | supplier_uid, reason, from/to date | PO/RFQ guards, Finance, Notification |
| `procurement.supplier.blacklisted` | supplier_uid, reason, open_exposure | PO disposition, Finance, Notification |
| `procurement.supplier.bank_changed` | supplier_uid, approved_by, cooling_until | Finance, Audit, Notification |
| `procurement.supplier.document_expired` | supplier_uid, document_type, expiry | PO release guard, Notification |
| `procurement.supplier.rated` | supplier_uid, period, score, grade, previous_grade | MDM, Comparison engine, Dashboard |
| `procurement.avl.updated` | item_uid, supplier_uid, action, valid_to | Planning, PO guard |
| `procurement.purchase_requisition.submitted` | pr_uid, value, urgency, procurement_type | Workflow, Notification |
| `procurement.purchase_requisition.approved` | pr_uid, items[], value | Sourcing queue, Budget (soft reservation), Notification |
| `procurement.purchase_requisition.rejected` / `.cancelled` / `.short_closed` | pr_uid, reason_code | Budget release, Notification |
| `procurement.rfq.issued` | rfq_uid, vendor_uids[], due_at | Portal, Notification, Supplier responsiveness |
| `procurement.rfq.amended` / `.extended` / `.cancelled` / `.closed` | rfq_uid, revision, reason | Portal, Quotation supersession, Notification |
| `procurement.quotation.submitted` / `.received` / `.revised` / `.expired` / `.regretted` | quotation_uid, supplier_uid, rfq_uid | Comparison, Supplier rating, Notification |
| `procurement.comparison.awarded` | comparison_uid, awards[{supplier_uid, line, qty, rate}], savings | PO creation, Quotation/RFQ status, Vendor rating, Notification |
| `procurement.purchase_order.approved` | po_uid, po_number, supplier_uid, lines[{item, qty, rate, promised_date, warehouse}], total | **Inventory (expected receipts)**, **Finance (commitment)**, Planning, Notification |
| `procurement.purchase_order.released` | po_uid, artefact_hash, recipients[] | Portal, Stores, Notification |
| `procurement.purchase_order.acknowledged` | po_uid, proposed_dates[] | Expediting, Planning |
| `procurement.purchase_order.amended` | po_uid, revision, changed_lines[], value_delta | Inventory, Finance, Portal, Planning |
| `procurement.purchase_order.cancelled` / `.short_closed` | po_uid, lines[], released_commitment | Inventory, Finance, PR release |
| `procurement.purchase_order.closed` | po_uid | Finance (GRIR check), Reporting |
| `procurement.rate_contract.approved` | contract_uid, supplier_uid, items[], validity | Sourcing engine, Planning |
| `procurement.rate_contract.threshold_reached` | contract_uid, pct_consumed | Notification, Buyer task |
| `procurement.subcontract.challan_overdue` | po_uid, challan_ref, due_date, balance | Notification, Finance |
| `procurement.asn.received` | po_uid, supplier_uid, lines[], batches[], eta | Gate entry pre-fill, Planning |
| `procurement.gate_entry.created` | gate_pass, supplier_uid, po_uids[], vehicle | Stores, Buyer, Dashboard |
| `procurement.grn.approved` | grn_uid, grn_number, supplier_uid, lines[{item, qty, batch, warehouse, valuation_rate}] | **Quality (inspection lot)**, **Inventory (quarantine/stock)**, **Finance (GRIR)**, PO update, Supplier OTIF |
| `procurement.grn.inspected` | grn_uid, lines[{accepted, rejected, deviation, defects}] | **Inventory (release/reject)**, Buyer, Supplier rating |
| `procurement.grn.completed` | grn_uid, putaway[] | Inventory, Planning |
| `procurement.grn.reversed` | grn_uid, reversal_uid, reason | Inventory, Finance |
| `procurement.purchase_return.approved` | return_uid, lines[{item, batch, qty}], value | **Inventory (stock out)**, Finance, Portal |
| `procurement.debit_note.approved` | debit_note_uid, supplier_uid, type, amounts, original_invoice | **Finance (AP, GST)**, Portal, Supplier rating |
| `procurement.invoice.received` / `.blocked` / `.rejected` | invoice_uid, supplier_uid, exceptions[] | Notification, Buyer task, Dashboard |
| `procurement.invoice.matched` | invoice_uid, matched_lines[], grn_links[], tds/tcs, due_date | **Finance (AP voucher, GRIR clearing, payment scheduling)** |

**V3-PRC-IR-009 (M)** Every event is written to `core_event_outbox` **inside the same database
transaction** as the state change (Vol 0 V0-IR-019). No procurement service calls another
module's service to produce a side effect on a write path; it emits and returns.

## 12.5 Domain events consumed

| Event | Source | Effect in procurement |
|---|---|---|
| `planning.mrp.completed` | Vol 5 | Planned purchase orders land in the PR staging list |
| `inventory.reorder_level.breached` | Vol 4 | Creates or proposes a reorder PR with the stock snapshot |
| `production.material.shortage_raised` | Vol 6 | Creates an urgent PR |
| `maintenance.spare.requested` | Vol 10 | Creates an MRO PR |
| `quality.inspection.completed` | Vol 7 | Posts accepted/rejected/deviation quantities onto the GRN line |
| `quality.inspection.rejected` | Vol 7 | Raises the purchase-return proposal and updates supplier quality stats |
| `inventory.stock.posted` | Vol 4 | Confirms GRN stock posting; closes the receipt loop |
| `inventory.jobwork_challan.issued` / `.returned` | Vol 4 | Updates subcontract reconciliation and challan ageing |
| `finance.payment.made` | Vol 9 | Updates invoice payment status and MSME compliance stats |
| `finance.budget.updated` | Vol 9 | Refreshes budget availability used at PR and PO |
| `workflow.approval.completed` | Vol 1 | **The only trigger** for a procurement document's post-approval side effects |
| `workflow.approval.rejected` / `.returned` | Vol 1 | Moves the document to `REJECTED` / `DRAFT` |
| `iam.user.deactivated` | Vol 1 | Reassigns buyer portfolios and open approval tasks |
| `mdm.supplier.updated` | Vol 1 | Refreshes cached supplier attributes used in guards |

## 12.6 External integrations

| Integration | Direction | Used by | Notes |
|---|---|---|---|
| **SMTP / e-mail** | Out/In | RFQ dispatch, PO release, reminders, debit notes; inbound bounce handling and invoice attachments | Per-vendor individual sends (Ch 3 V3-RFQ-FR-009); bounces raise buyer alerts |
| **Supplier portal** | Both | RFQ response, PO acknowledgement, ASN, invoice upload, document renewal | Same REST API, external principal scope |
| **GST portal / GSP** — GSTIN validation & status | Out | Supplier onboarding, PO release guard | Cached with a validity window; failure degrades to a warning, never blocks a committed transaction (V0-IR-027) |
| **E-way bill (NIC via GSP)** | Out/In | Gate entry validation (inward), purchase return (outward) | Number, validity, vehicle match |
| **E-invoice / GSTR-2B** | In | Invoice IRN capture and purchase-register reconciliation | Mismatch report, not an auto-block |
| **Weighbridge** | In | Gate entry gross/tare | Serial/TCP adapter with a manual fallback that is reported |
| **Barcode / label printer** | Out | Gate pass, batch labels, bin labels | Raw ZPL over TCP 9100 |
| **Price index feed** | In | Index-linked rate contracts | Configurable source; manual entry fallback with the source recorded |
| **Bank / payment** | Out | Vol 9 owns payment; procurement only supplies the matched liability | — |
| **OCR service** | In | Invoice capture assistance (`S` priority) | Always human-confirmed; OCR output is a suggestion, never a posted value |

**V3-PRC-IR-010 (M)** Every external adapter sits behind an interface with a mock
implementation (V0-IR-026), so the whole procurement flow is demonstrable and testable without
GSP, weighbridge or printer credentials.

**V3-PRC-IR-011 (M)** An external call failure MUST NOT roll back a committed procurement
transaction (V0-IR-027). A PO is approved whether or not the GSTIN status check responded; the
check is a retried background job with a visible status on the supplier record.

## 12.7 Webhooks

Companies may subscribe to any event in §12.4 (Vol 0 §18.3). Seeded useful subscriptions for
integrators: `purchase_order.released`, `purchase_order.amended`, `grn.approved`,
`invoice.matched`, `supplier.approved` — enough for an external supplier system or a
group-level BI tool to stay in step without polling.

## 12.8 Acceptance criteria (extract)

- Every procurement endpoint appears in the generated OpenAPI document with an `x-permission`
  extension, and the committed schema is diffed in CI (CLAUDE.md §8).
- `PATCH /purchase-orders/{uid}` with a `status` field in the body is rejected as an unknown
  field; the only way to change status is the transition sub-resource.
- Submitting the same `Idempotency-Key` twice returns the original response and creates one PO.
- A `PATCH` with a stale `If-Match` returns 409 with `current_version` and `changed_fields`.
- A `STORE_OPR` GET on a PO returns a body with no `rate`, `taxable_amount` or `total_amount`
  keys present.
- Approving a PO writes the `procurement.purchase_order.approved` row to `core_event_outbox` in
  the same transaction; rolling the transaction back leaves no event.
- Inventory receives `procurement.grn.approved` and posts stock; procurement's code contains no
  reference to an inventory model or repository (import-linter assertion).
- A portal principal calling `/api/v1/purchase-orders` (internal path) receives 403; calling
  `/api/v1/portal/purchase-orders` returns only their own supplier's records.
- The e-way bill validation service being down does not prevent a gate entry from being saved;
  the entry records the check as pending.

---

**Next:** [Chapter 13 — UI/UX, Mobile & Acceptance](13-uiux-and-acceptance.md)
