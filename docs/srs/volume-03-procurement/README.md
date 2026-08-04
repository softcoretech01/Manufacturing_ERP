# Volume 3 — Procurement & Supplier Management

**Stainless Steel Water Bottle Manufacturing ERP**
Functional Requirements Document · Version 0.1 (draft) · 2026-07-29

> **Prerequisites, not repeated here:**
> [Volume 0 — Foundation](../volume-00-foundation.md) (data standards §7, API standards §8,
> security §9, **standard transaction document pattern §10**, numbering §11, audit §12,
> notification §13, reporting §14, barcode §15, **UI archetypes §16**, events §18, NFRs §19)
> and [Volume 1 — Core Framework](../volume-01-core-framework/) (IAM, org structure,
> numbering engine, **workflow & approval engine**, audit, notification, master data).
>
> Everything Volume 0 §10.2 mandates for a transaction document — attachments, comments,
> workflow, audit, events, print, export, amendment, cancellation, optimistic lock, tags/UDFs,
> document flow, activity timeline — is assumed present on **every** document in this volume
> and is not restated per document.

---

## Reading map — the requested FRD sections and where they live

| # | FRD section requested | Where |
|---|---|---|
| 1 | Business Analysis | This file, §1 |
| 2 | Process Flow | This file, §2 |
| 3 | Menu Structure | This file, §3 |
| 4 | Screen List | This file, §4 |
| 5 | Functional Specifications | Chapters 1–8 |
| 6 | Screen-wise Fields | Chapters 1–8 (field tables per screen) |
| 7 | Status Flow | Chapters 1–8 (state machine per document) |
| 8 | Approval Workflow | [Chapter 8 — Approval Center](08-approval-center.md) |
| 9 | Business Rules | Chapters 1–8 (`BR` rows) + [Ch 8](08-approval-center.md) |
| 10 | Validations | Chapters 1–8 (validation tables) |
| 11 | Dashboard Design | [Chapter 9 — Dashboard & Reports](09-dashboard-and-reports.md) §9.1 |
| 12 | Reports | [Chapter 9](09-dashboard-and-reports.md) §9.2 |
| 13 | User Roles & Permissions | [Chapter 10 — Permissions & Roles](10-permissions-and-roles.md) |
| 14 | Database Entities | [Chapter 11 — Data Model](11-data-model.md) |
| 15 | API Requirements | [Chapter 12 — API, Events & Integration](12-api-events-and-integration.md) |
| 16 | UI/UX Recommendations | [Chapter 13 — UI/UX, Mobile & Acceptance](13-uiux-and-acceptance.md) |

## Chapters

| Ch | Area code | Title | Covers |
|---|---|---|---|
| — | `PRC` | This file | Business analysis, process flow, menu, screen list, actors, scope |
| 1 | `SUP` | [Supplier Management](01-supplier-management.md) | Onboarding, approval, categorisation, documents & compliance expiry, evaluation & rating, blacklist, supplier portal |
| 2 | `PRQ` | [Purchase Requisition](02-purchase-requisition.md) | Manual PR, MRP-generated PR, reorder PR, consolidation, budget check, PR lifecycle |
| 3 | `RFQ` | [Request for Quotation](03-request-for-quotation.md) | Single/multi-vendor RFQ, sealed-bid, e-mail & portal dispatch, expiry, revision, cancellation |
| 4 | `SQT` | [Vendor Quotations](04-vendor-quotations.md) | Manual entry, portal submission, price/tax/freight/terms capture, validity, revision, no-quote |
| 5 | `CMP` | [Quotation Comparison & Vendor Selection](05-quotation-comparison.md) | Landed-cost normalisation, weighted scoring, recommendation engine, split award, negotiation rounds |
| 6 | `POR` | [Purchase Order](06-purchase-order.md) | Standard/blanket/rate-contract/subcontract/import PO, schedule lines, split, amendment, short-close, cancellation |
| 7 | `GRN` `PRT` `PIV` | [Receipt, Return & Invoice Verification](07-receipt-return-and-invoice.md) | Gate entry, GRN, tolerance, inspection hook, batch/heat traceability, purchase return, debit note, 3-way match |
| 8 | `APR` | [Approval Center](08-approval-center.md) | Procurement approval matrices, delegation, escalation, send-back, auto-approval, unified inbox |
| 9 | `DSH` `RPT` | [Dashboard & Reports](09-dashboard-and-reports.md) | KPI definitions, widget catalogue, report catalogue with columns and filters |
| 10 | — | [Permissions & Roles](10-permissions-and-roles.md) | Permission catalogue, role × permission matrix, data scope, field-level security, SoD |
| 11 | — | [Data Model](11-data-model.md) | All tables, keys, indexes, relationships, ER diagram |
| 12 | — | [API, Events & Integration](12-api-events-and-integration.md) | Endpoint catalogue, payload shapes, events published/subscribed, integrations |
| 13 | — | [UI/UX, Mobile & Acceptance](13-uiux-and-acceptance.md) | UX principles, wireframe conventions, mobile scope, NFRs, acceptance criteria |

---

## Module objective

**V3-PRC-FR-001 (M)** Convert a validated material requirement into received, inspected,
priced and payable material, with every step authorised by a configured approver, every price
justified against a comparable alternative, and every receipt traceable to a heat number and a
supplier invoice.

Three outcomes define success for this module:

1. **No unauthorised commitment.** A supplier can hold the company liable only for a released
   PO that passed its full approval chain at the exact version released.
2. **No blind price.** Every rate on a PO is traceable to a rate contract, a compared
   quotation, or an explicit, justified, audited override.
3. **No untraceable material.** Every receipt of SS coil, silicone, coating chemical or ink
   carries its batch/heat number, its test certificate and its supplier, forward to the
   dispatched carton.

## In scope

Supplier lifecycle · purchase requisition · RFQ · supplier quotation · comparison and vendor
selection · purchase order (standard, blanket, rate contract, subcontract/job work, import,
service, capital) · schedule lines and call-offs · gate entry · goods receipt · receipt
tolerance and over/short handling · purchase return and debit note · supplier invoice
verification and 3-way match · supplier evaluation and rating · supplier portal · procurement
approval configuration · procurement dashboards and reports.

## Out of scope (and where it lives)

| Item | Owner |
|---|---|
| Supplier master **table definition** and generic master behaviour | Vol 1 Ch 7 (MDM). This volume adds procurement-specific extensions and the onboarding workflow. |
| Item master, UOM, UOM conversion, HSN, tax master | Vol 1 Ch 7 |
| Stock posting, valuation, bin/put-away, batch ledger | Vol 4 — GRN **emits an event**; inventory posts |
| Incoming inspection execution, sampling plan, defect capture, NCR/CAPA | Vol 7 — GRN raises the inspection lot; QC decides |
| MRP run, net requirement calculation, planned order | Vol 5 — MRP **creates PRs** in this module |
| Vendor invoice **accounting entry**, payment, TDS deposit, GST return | Vol 9 — this module verifies and matches; finance posts and pays |
| Approval **engine** | Vol 1 Ch 4 — this volume supplies the configuration and the decision context |
| Landed-cost **allocation to inventory value** | Vol 4 / Vol 9 — this module captures the cost components |

---

## 1. Business Analysis

### 1.1 What procurement actually is in this business

A stainless steel vacuum bottle plant does not have one procurement process. It has six, and
an ERP that models only the first one fails in the first month.

| # | Procurement type | Typical items | Distinguishing behaviour |
|---|---|---|---|
| 1 | **Direct material — strategic** | SS 201/304/316 coil and sheet | Bought by weight, consumed by piece. Price moves with LME/domestic index. Heat number + Mill Test Certificate mandatory. Long lead time, MOQ by coil width. Rate contract with escalation clause is the norm, not spot buying. |
| 2 | **Direct material — components** | Silicone rings, plastic inserts, lid bodies, getters | Food-contact compliance certificates required. Tooling owned by us, held at vendor. Moderate lead time, batch traceability required. |
| 3 | **Direct material — consumable/bottleneck** | Powder coating, paint, inks, thinner, fluxes | Quality-critical and shelf-life-bound. Batch + expiry mandatory. Small number of qualified sources. |
| 4 | **Packaging** | Inner box, 5-ply carton, pallet, label, poly bag | Artwork/branding-specific, so customer-linked. High volume, low value, high stock-out impact. |
| 5 | **Subcontract / job work** | Coating, printing, laser marking, buffing | Material issued out on challan and reconciled. Job work charges, not material price. GST job-work rules, 143/challan return timelines. |
| 6 | **Indirect — MRO, capital, services** | Die/punch spares, press consumables, machines, AMC, transport | Cost-centre and budget driven, not BOM driven. Capital needs capex authorisation, not a normal PR. |

**V3-PRC-BR-001 (M)** The PR, RFQ, PO and GRN documents MUST carry a `procurement_type`
discriminator (`DIRECT_MATERIAL`, `PACKAGING`, `CONSUMABLE`, `SUBCONTRACT`, `MRO`, `CAPITAL`,
`SERVICE`, `IMPORT`) that drives numbering series, approval matrix, mandatory-field rules,
inspection requirement and account determination. A single undifferentiated "purchase" flow is
a specification defect.

### 1.2 Where procurement goes wrong without a system — the as-is pain register

Each row is a real failure mode in this industry and the requirement that answers it.

| # | Pain | Consequence | Answered by |
|---|---|---|---|
| P-01 | Requirements arrive by WhatsApp / verbal / a note to the buyer | No audit of who asked for what; unbudgeted spend | `V3-PRQ-FR-001` — no PO without a PR reference except configured exception types |
| P-02 | Buyer places PO on a familiar vendor without comparison | Price leakage of 5–15% on steel | `V3-CMP-BR-004` — comparison mandatory above a configurable value unless under rate contract |
| P-03 | Steel bought at spot when a rate contract existed | Contract volume commitments missed, higher price | `V3-POR-FR-014` — rate-contract call-off is proposed automatically; deviation needs justification |
| P-04 | PO amended verbally after issue ("send 6 tonnes, not 5") | Receipt exceeds order; invoice cannot be matched | `V3-POR-FR-022` — amendment is a revision with its own approval; verbal changes cannot exist |
| P-05 | Material accepted at gate without weighment or MTC | Untraceable heat, rejected customer audit | `V3-GRN-BR-003`, `V3-GRN-BR-010` |
| P-06 | Rejected material stays in the plant for months | Working capital locked, statutory return window missed | `V3-PRT-FR-004` — rejection ages, escalates and blocks further receipt from that vendor at a threshold |
| P-07 | Invoice paid on a receipt that never happened | Direct cash loss | `V3-PIV-BR-001` — 3-way match, no manual bypass without a named approver and reason |
| P-08 | Vendor performance judged by memory | Bad vendors kept, good ones squeezed | `V3-SUP-FR-014` — scored automatically from GRN, QC and invoice data |
| P-09 | Emergency purchases become the normal path | Approvals bypassed by habit | `V3-PRQ-BR-011` — emergency PR requires post-facto justification and appears on a standing exception report |
| P-10 | Vendor compliance documents (GST, MSME, ISO, food-grade) expire silently | Input credit denied, food-safety audit failure | `V3-SUP-FR-009` — document expiry blocks new PO release |
| P-11 | MSME vendor invoices paid beyond 45 days | Section 43B(h) disallowance of the expense | `V3-SUP-BR-008`, `V3-PIV-FR-012` — MSME flag drives a hard due-date and an alert |
| P-12 | Job-work material sent out and never reconciled | Loss of company material, GST liability | `V3-POR-FR-018` — subcontract challan reconciliation with an ageing report |
| P-13 | Same item, three item codes, three vendors, three prices | Comparison impossible, stock split | Vol 1 Ch 7 item master + `V3-CMP-FR-002` normalises to item + spec |
| P-14 | Freight, insurance and customs invisible until the invoice | "Cheapest" quote is actually the dearest | `V3-CMP-FR-005` — comparison is on **landed cost**, never on basic rate |

### 1.3 Characteristics of this product that shape the procurement design

| Characteristic | Procurement design consequence |
|---|---|
| SS bought by **weight**, consumed by **piece** | PR/PO/GRN carry dual UOM with a grade + thickness + width driven conversion. Ordering in KG, receiving in KG, planning in NOS. Rate may be per KG while the requirement is per NOS. |
| Coil geometry constrains order quantity | PO quantity is rounded to a **coil/lot multiple** per supplier and width; MOQ and pack-size rules are supplier + item specific. |
| **Heat number / MTC** is a customer audit requirement | GRN line splits into as many batches as heats received. MTC is a mandatory attachment for SS lines. No MTC → the lot cannot clear incoming QC. |
| Steel **price volatility** | Rate contracts with validity, price basis (index/formula), escalation clause and re-negotiation trigger. Last-purchase-price variance is a first-class control on PR, PO and comparison. |
| **Food-contact** materials (inner body, silicone, lid insert) | Vendor must hold valid food-grade certification, tracked with expiry; material must be received with a batch-linked test report. |
| **Coating and printing are subcontracted** | Full job-work cycle: material issue challan, expected return quantity with process loss %, job-work GRN, reconciliation, ageing against statutory return period. |
| **Tooling owned by us, held at vendor** | Vendor-held asset register linked from the supplier record; PO for a component references the tool. |
| Seasonal demand peaks (summer, gifting) | Procurement calendar and lead-time buffers change by season; PR urgency and expediting are first-class, not exceptions. |
| **Imports** of SS coil and specialised components | PO in foreign currency, exchange-rate handling, BOE, customs duty, CHA and freight as landed-cost components, longer lead-time and LC/payment-term handling. |

### 1.4 Spend segmentation used by the recommendation engine

The comparison engine's default weightings are seeded per category using a Kraljic-style
segmentation, because the right answer for SS coil is not the right answer for cartons.

| Segment | Items | Default scoring bias |
|---|---|---|
| **Strategic** (high value, high risk) | SS 304/316 coil, vacuum getter | Price 40 · Quality 25 · Delivery 20 · Relationship/capacity 15 |
| **Bottleneck** (low value, high risk) | Coating powder, food-grade silicone, inks | Quality 40 · Delivery 30 · Price 20 · Compliance 10 |
| **Leverage** (high value, low risk) | SS 201 coil, cartons, plastic parts | Price 55 · Delivery 25 · Quality 20 |
| **Routine** (low value, low risk) | MRO, stationery, fasteners | Price 40 · Delivery 40 · Quality 20 — favour catalogue/rate contract, minimise process cost |

**V3-PRC-FR-002 (M)** These weightings are **master data**, editable per item category and per
company, versioned and effective-dated. They MUST NOT be hard-coded.

### 1.5 Statutory context (India) that this module must respect

| Area | Requirement in this module |
|---|---|
| **GST** | Supplier GSTIN validated and status-checked; place of supply determines CGST+SGST vs IGST on the PO; reverse charge for GTA/unregistered/import of service; ITC eligibility flag per line; blocked credit (Sec 17(5)) items flagged and non-creditable |
| **TDS 194Q vs TCS 206C(1H)** | Mutually exclusive, evaluated per supplier per financial year against the ₹50 lakh threshold; the applicable one is computed and shown at PO and at invoice verification |
| **MSME (Udyam)** | Supplier MSME classification captured with Udyam number and validity; payment due date hard-capped at 45 days (or the agreed shorter term); breach reported for Section 43B(h) |
| **E-way bill (inward)** | Inward e-way bill number captured at gate entry; validity checked against arrival |
| **E-invoice (supplier's)** | Supplier IRN captured at invoice verification and reconcilable against GSTR-2B |
| **GSTR-2B reconciliation** | Purchase register exportable and matchable line-by-line against 2B; mismatch report |
| **Job work (Sec 143 / ITC-04)** | Challan-wise dispatch and return tracking with the statutory return window; ITC-04 data extract |
| **Import** | Bill of Entry, assessable value, BCD, Social Welfare Surcharge, IGST on import, CHA charges, and their allocation to landed cost |
| **Rate contract / purchase agreement** | Retained as a document with validity, not as free text |

**V3-PRC-BR-002 (M)** All statutory rates, thresholds and slabs referenced above are held as
effective-dated master data behind the `statutory/` adapter (CLAUDE.md §9.7). No rate,
threshold or percentage appears in procurement business logic.

### 1.6 Baseline KPI set the module must be able to prove

| KPI | Definition | Target |
|---|---|---|
| PR → PO cycle time | Working hours from PR approval to PO release, by procurement type | ≤ 3 working days (Vol 0 SC-6) |
| PR approval TAT | Working hours from PR submission to final approval | ≤ 24 h routine, ≤ 4 h emergency |
| RFQ response rate | Quotations received ÷ RFQ lines issued | ≥ 70% |
| Purchase price variance (PPV) | (PO rate − reference rate) ÷ reference rate; reference = rate contract, else last purchase price | ≤ ±3% ex-index movement |
| Spend under contract | Value ordered against a rate contract ÷ total ordered value | ≥ 70% for direct material |
| Emergency PO ratio | Value of PO flagged emergency ÷ total PO value | ≤ 5% |
| Supplier OTIF | Lines received in full within the promised date window ÷ lines due | ≥ 90% |
| Incoming rejection rate | Rejected quantity ÷ received quantity, by supplier and item | ≤ 1% |
| Invoice match exception rate | Invoices failing 3-way match on first pass ÷ invoices received | ≤ 5% |
| Single-source spend | Value on items with only one approved supplier | tracked, reduced deliberately |
| MSME payment compliance | MSME invoices paid within 45 days ÷ MSME invoices | 100% |
| Open PO ageing | Value of PO lines overdue beyond promised date | trended, escalated |

Every KPI above is computed from transactional data, is drillable to the document list that
produced it, and is exposed as a dashboard widget (Ch 9) — none is entered manually.

---

## 2. Process Flow

### 2.1 Level 0 — the procurement value chain

```
  DEMAND                SOURCING                 ORDERING              RECEIVING            SETTLEMENT
 ┌────────┐          ┌────────────┐           ┌───────────┐         ┌────────────┐       ┌────────────┐
 │ MRP    │          │ RFQ        │           │ PO        │         │ Gate entry │       │ Invoice    │
 │ Reorder│─────────►│ Quotation  │──────────►│ Amendment │────────►│ GRN        │──────►│ 3-way match│
 │ Manual │   PR     │ Comparison │  award    │ Schedule  │ dispatch│ Inspection │  GRN  │ Debit note │
 │ Project│          │ Negotiation│           │ Release   │         │ Put-away   │       │ Payment→Fin│
 └────────┘          └────────────┘           └───────────┘         └────────────┘       └────────────┘
      │                     │                        │                     │                     │
      └─────────────────────┴────────── SUPPLIER MANAGEMENT ───────────────┴─────────────────────┘
                    (onboarding · qualification · compliance · rating · portal)
```

### 2.2 Level 1 — mainline flow with approval gates

Approval gates are marked `⛿`. **No gate is optional**; where the business wants speed, the
gate is configured to auto-approve within a limit (Ch 8) — it is never removed.

```
 ORIGINATOR        PROCUREMENT           APPROVERS            SUPPLIER          STORES / QC        FINANCE
     │                  │                    │                   │                  │                │
 Material              │                    │                   │                  │                │
 requirement           │                    │                   │                  │                │
 (MRP / reorder /      │                    │                   │                  │                │
  manual / project)    │                    │                   │                  │                │
     │                  │                    │                   │                  │                │
     ├─► PURCHASE REQUISITION (DRAFT)        │                   │                  │                │
     │        │ budget check                 │                   │                  │                │
     │        ▼                              │                   │                  │                │
     │   SUBMIT ──────────────────────► ⛿ PR APPROVAL            │                  │                │
     │                                  Dept Head → Purch Mgr    │                  │                │
     │                                  → Factory Mgr → Director │                  │                │
     │                                       │ approve           │                  │                │
     │                                       ▼                   │                  │                │
     │             ┌──────────── APPROVED PR ────────────┐       │                  │                │
     │             │                                      │       │                  │                │
     │      rate contract exists?                   no contract   │                  │                │
     │             │ yes                                  │       │                  │                │
     │             ▼                                      ▼       │                  │                │
     │      PO call-off (skip RFQ)              RFQ (multi-vendor)│                  │                │
     │             │                                      ├──────►│ RFQ issued      │                │
     │             │                                      │       │ (mail / portal) │                │
     │             │                                      │◄──────┤ Quotation       │                │
     │             │                            VENDOR QUOTATIONS │ submitted       │                │
     │             │                                      │       │                  │                │
     │             │                            QUOTATION COMPARISON                 │                │
     │             │                            (landed cost + score)                │                │
     │             │                                      │       │                  │                │
     │             │                            negotiation round?─┐                 │                │
     │             │                                      │◄───────┘ revised quote   │                │
     │             │                                      ▼                          │                │
     │             │                              ⛿ VENDOR SELECTION APPROVAL        │                │
     │             │                                      │                          │                │
     │             └──────────────┬───────────────────────┘                          │                │
     │                            ▼                                                  │                │
     │                   PURCHASE ORDER (DRAFT)                                      │                │
     │                            │                                                  │                │
     │                       SUBMIT ────────────► ⛿ PO APPROVAL                      │                │
     │                                        Purch Mgr → Finance → Director         │                │
     │                                            │ approve                          │                │
     │                                            ▼                                  │                │
     │                                   PO RELEASED ─────────────►│ acknowledge     │                │
     │                                            │                │ (portal/mail)   │                │
     │                                            │                │                  │                │
     │                                            │                ├─► ASN / dispatch │                │
     │                                            │                │                  │                │
     │                                            │                └─► Material at gate│                │
     │                                            │                                   │                │
     │                                            │                          GATE ENTRY (security)     │
     │                                            │                          weighment · e-way bill    │
     │                                            │                                   │                │
     │                                            │                          GOODS RECEIPT NOTE        │
     │                                            │                          qty · batch/heat · MTC    │
     │                                            │                                   │                │
     │                                            │                          ⛿ GRN APPROVAL            │
     │                                            │                                   │                │
     │                                            │                          INCOMING INSPECTION (Vol 7)│
     │                                            │                            ┌──────┴──────┐         │
     │                                            │                        accepted      rejected      │
     │                                            │                            │              │         │
     │                                            │                    stock in (Vol 4)  PURCHASE RETURN│
     │                                            │                            │         + ⛿ DEBIT NOTE │
     │                                            │                            │              │         │
     │                                            │                            └──────┬───────┘         │
     │                                            │                                   │                │
     │                                            │◄── supplier invoice ──────────────┼───────────────►│
     │                                            │                                   │   INVOICE      │
     │                                            │                                   │   VERIFICATION │
     │                                            │                                   │   3-way match  │
     │                                            │                                   │   ⛿ approval   │
     │                                            │                                   │        │       │
     │                                            │                                   │   POST TO AP   │
     │                                            │                                   │   (Vol 9)      │
     │                                            │                                   │        │       │
     │                                            │                                   │   PAYMENT      │
     └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Process variants

The mainline above is one of six paths. Each variant is a configured deviation, not a
different module.

| Variant | Path | Gate differences |
|---|---|---|
| **V1 Rate-contract call-off** | PR → PO (release order against contract) → GRN → Invoice | RFQ, quotation and comparison skipped. PO approval reduced to one level when the rate matches the contract; full chain if it deviates. |
| **V2 Emergency / breakdown** | PR (emergency) → PO → GRN, post-facto justification | Compressed approval chain configured per `EMERGENCY` priority, with mandatory reason and a standing exception report. Never a *skipped* approval. |
| **V3 Subcontract / job work** | PR (service) → PO (subcontract) → **material issue challan (Vol 4)** → job-work GRN → reconciliation → invoice for job charges | Adds challan reconciliation gate; GRN posts finished component in and consumes issued material per BOM with process-loss tolerance. |
| **V4 Import** | PR → RFQ → PO (FOREIGN currency, Incoterm) → shipping docs → BOE → gate entry → GRN → landed-cost apportionment → invoice | Adds customs/CHA/freight cost components, exchange-rate handling, longer expediting cycle, LC/advance payment milestones. |
| **V5 Capital (capex)** | Capex PR (with justification, payback, budget line) → RFQ → technical + commercial comparison → PO → milestone-based delivery → GRN → asset capitalisation (Vol 10) | Adds technical evaluation as a **parallel** approval level; payment against milestones, not receipt. |
| **V6 Service / AMC** | PR (service) → RFQ → PO (service, no material) → **service entry sheet** → invoice | No GRN; a service entry sheet confirms performance and is the match document. |

### 2.4 Where procurement touches other modules

```
   Vol 5 Planning ──MRP planned order──► PR                    PR ──budget consumption──► Vol 9 Finance
   Vol 4 Inventory ──reorder breach────► PR                    PO ──commitment──────────► Vol 9 Finance
   Vol 6 Production ──material request──► PR                   PO ──expected receipt────► Vol 4 Inventory
   Vol 2 Sales ──customer-specific pack──► PR                  GRN ──stock in───────────► Vol 4 Inventory
   Vol 10 Maintenance ──spares request──► PR                   GRN ──inspection lot─────► Vol 7 Quality
   Vol 1 MDM ──item, supplier, tax──────► all                  GRN ──GRIR accrual───────► Vol 9 Finance
   Vol 1 WFL ──approval engine──────────► all                  Return ──debit note──────► Vol 9 Finance
                                                               Invoice ──AP voucher─────► Vol 9 Finance
                                                               Rating ──supplier score──► Vol 1 MDM
```

---

## 3. Menu Structure

### 3.1 Assessment of the proposed structure

The proposed ten menus are the correct **spine** — Dashboard, PR, RFQ, Vendor Quotations,
Quotation Comparison, PO, GRN, Approval Center, Reports, Settings. Nothing in it should be
removed or reordered.

Three gaps make it unusable in a manufacturing plant as it stands, and one item is
mis-scoped:

| # | Gap | Why it is not optional |
|---|---|---|
| G-1 | **No Supplier Management** | RFQ cannot be issued to an unapproved vendor. Vendor onboarding, qualification, compliance-document expiry, rating and blacklisting are procurement's own process, not a passive master. Without it, P-08 and P-10 in §1.2 have no owner. |
| G-2 | **No Purchase Return / Debit Note** | Incoming inspection will reject material. That material must leave the plant against a document, with a GST debit note, within the statutory window. There is no other module that can raise it. |
| G-3 | **No Invoice Verification** | Without 3-way match inside procurement, Finance pays against a document it cannot validate. This is the single highest-value financial control in the module (P-07). |
| M-1 | **Rate Contract / Blanket PO, Subcontract PO and Import PO** were implicitly folded into "PO" | They are PO *types* with different fields, approvals and follow-on documents. They belong **under** Purchase Order as sub-items, not as new top-level menus. |

Additionally, **Gate Entry** belongs under Goods Receipt as a sub-item — Indian factory
practice separates security's inward gate record from stores' GRN, and the separation is what
makes over-receipt and unauthorised inward detectable.

### 3.2 Recommended menu structure

Twelve primary menus — the original ten in their original order, plus two additions.

```
PROCUREMENT
│
├── 1. Dashboard                                        [PROCUREMENT.DASHBOARD.VIEW]
│
├── 2. Purchase Requisition
│      ├── All Requisitions                             list
│      ├── Create Requisition                           form
│      ├── My Requisitions                              list, scoped to creator
│      ├── Pending My Approval                          → Approval Center, pre-filtered
│      ├── PR from Planning (MRP)                       staged planned orders → PR
│      └── Requisition Consolidation                    multi-PR → single RFQ/PO workbench
│
├── 3. Request for Quotation
│      ├── All RFQs                                     list
│      ├── Create RFQ                                   form (from PR / consolidated / standalone)
│      ├── RFQ Dispatch & Tracking                      who was sent it, who opened, who responded
│      └── RFQ Templates                                reusable terms/annexure sets
│
├── 4. Vendor Quotations
│      ├── All Quotations                               list
│      ├── Enter Quotation                              buyer-side entry
│      ├── Portal Submissions — Inbox                   vendor-submitted, pending acceptance
│      └── Quotation Revisions                          negotiation rounds
│
├── 5. Quotation Comparison
│      ├── Comparison Workbench                         side-by-side, landed cost, scoring
│      ├── Saved Comparisons                            list, with award status
│      └── Award / Vendor Selection                     split award, approval submission
│
├── 6. Purchase Order
│      ├── All Purchase Orders                          list
│      ├── Create PO                                    from quotation / PR / contract / blank
│      ├── Rate Contracts & Blanket Orders          ★   validity, price basis, consumed vs balance
│      ├── Delivery Schedules / Call-offs           ★   schedule lines against blanket orders
│      ├── Subcontract / Job Work Orders            ★   with challan reconciliation
│      ├── Import Orders                            ★   FC, Incoterm, BOE, landed cost
│      ├── PO Amendments                                revision list with diff
│      └── Open PO / Expediting                         overdue lines, follow-up log
│
├── 7. Goods Receipt
│      ├── Gate Entry (Inward)                      ★   security, weighment, e-way bill
│      ├── All GRNs                                     list
│      ├── Create GRN                                   against PO / gate entry / ASN
│      ├── Pending Inspection                           GRN lots awaiting QC (Vol 7)
│      ├── Purchase Return                          ★   rejected material out
│      └── Debit Notes                              ★   rate/qty/rejection debit notes
│
├── 8. Invoice Verification                          ★  NEW MENU
│      ├── Supplier Invoices                            list
│      ├── Enter / Book Invoice                         3-way match workbench
│      ├── Match Exceptions                             blocked invoices with reason
│      └── GRIR Reconciliation                          received-not-invoiced / invoiced-not-received
│
├── 9. Supplier Management                           ★  NEW MENU
│      ├── Suppliers                                    list (procurement view of the master)
│      ├── Supplier Onboarding                          registration → qualification → approval
│      ├── Supplier Evaluation & Rating                 periodic scorecards
│      ├── Compliance & Documents                       GST/MSME/ISO/food-grade, with expiry
│      ├── Approved Vendor List (AVL)                   item × supplier qualification matrix
│      ├── Blacklist / Hold                             with reason and effect on transactions
│      └── Supplier Portal Administration               invitations, access, activity
│
├── 10. Approval Center
│      ├── Pending My Approval                          unified inbox, procurement-filtered
│      ├── My Submitted Documents                       status tracking
│      ├── Delegated to Me / By Me                      delegation register
│      ├── Approval History                             full decision trail
│      └── Approval Matrix (Procurement)                configuration, admin only
│
├── 11. Reports                                         see Ch 9 §9.2 — 24 reports in 6 groups
│
└── 12. Settings                                        [PROCUREMENT.SETTINGS.*]
       ├── Procurement Parameters                       tolerances, thresholds, mandatory flags
       ├── Document Numbering (Procurement)             → Vol 1 Ch 3 series, filtered
       ├── Approval Matrix                              → Vol 1 Ch 4, filtered to procurement
       ├── Evaluation Criteria & Weightings             comparison scoring model
       ├── Terms & Conditions Library                   reusable payment/delivery/warranty terms
       ├── Reason Codes                                 rejection, cancellation, short-close, return
       ├── Print Templates                              PR/RFQ/PO/GRN/Debit note layouts
       ├── Email & Portal Templates                     RFQ invitation, PO despatch, reminders
       └── Integration                                  portal, e-mail, e-way bill, GSTR-2B
```

★ = added or relocated relative to the proposed structure.

**V3-PRC-UIR-001 (M)** Menu items are **permission-driven**. A user without
`PROCUREMENT.RATE_CONTRACT.VIEW` does not see that sub-item at all — the menu is generated
from the effective permission set, not filtered client-side.

**V3-PRC-UIR-002 (M)** Every list sub-item supports saved views (Vol 0 V0-UIR-004), so
"Pending PR", "Overdue PO", "My drafts" are user-created views, not hard-coded menu entries.
The menu MUST NOT grow a new item every time a filter is needed.

---

## 4. Screen List

62 screens. `Archetype` refers to Volume 0 §16.2 (A List · B Form · C Detail · D Wizard ·
E Board · F Dashboard · G Report viewer).

### 4.1 Dashboard

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-PRC-01 | Procurement Dashboard (role-adaptive) | F | Ch 9 |
| S-PRC-02 | KPI Drill-through | A / G | Ch 9 |

### 4.2 Supplier Management

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-SUP-01 | Supplier List (procurement view) | A | Ch 1 |
| S-SUP-02 | Supplier 360 Detail | C | Ch 1 |
| S-SUP-03 | Supplier Onboarding Wizard | D | Ch 1 |
| S-SUP-04 | Supplier Registration (self-service, public) | D | Ch 1 |
| S-SUP-05 | Qualification & Audit Checklist | B | Ch 1 |
| S-SUP-06 | Compliance Document Register | A | Ch 1 |
| S-SUP-07 | Approved Vendor List (item × supplier) | A | Ch 1 |
| S-SUP-08 | Supplier Evaluation Scorecard | B / C | Ch 1 |
| S-SUP-09 | Supplier Rating Dashboard | F | Ch 1 |
| S-SUP-10 | Blacklist / Hold Action | B | Ch 1 |
| S-SUP-11 | Supplier Portal — Home | C | Ch 1 |
| S-SUP-12 | Supplier Portal — RFQ Response | B | Ch 3 |
| S-SUP-13 | Supplier Portal — PO Acknowledgement & ASN | B | Ch 6 |
| S-SUP-14 | Supplier Portal — Invoice Upload | B | Ch 7 |
| S-SUP-15 | Portal Administration & Invitations | A | Ch 1 |

### 4.3 Purchase Requisition

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-PRQ-01 | PR List | A | Ch 2 |
| S-PRQ-02 | PR Create / Edit | B | Ch 2 |
| S-PRQ-03 | PR Detail | C | Ch 2 |
| S-PRQ-04 | PR from Planned Orders (MRP staging) | A → D | Ch 2 |
| S-PRQ-05 | PR Consolidation Workbench | A | Ch 2 |
| S-PRQ-06 | Budget Check Panel | (embedded) | Ch 2 |
| S-PRQ-07 | PR Sourcing Decision (RFQ vs contract vs stock) | B | Ch 2 |
| S-PRQ-08 | PR Amendment / Revision Diff | C | Ch 2 |
| S-PRQ-09 | PR Short-close / Cancel | (dialog) | Ch 2 |

### 4.4 RFQ

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-RFQ-01 | RFQ List | A | Ch 3 |
| S-RFQ-02 | RFQ Create / Edit | B | Ch 3 |
| S-RFQ-03 | RFQ Vendor Selection Panel | (embedded) | Ch 3 |
| S-RFQ-04 | RFQ Detail with Response Tracker | C | Ch 3 |
| S-RFQ-05 | RFQ Dispatch (e-mail / portal preview & send) | D | Ch 3 |
| S-RFQ-06 | RFQ Amendment / Corrigendum | B | Ch 3 |
| S-RFQ-07 | RFQ Cancellation | (dialog) | Ch 3 |
| S-RFQ-08 | RFQ Template Library | A / B | Ch 3 |
| S-RFQ-09 | Sealed-bid Opening | B | Ch 3 |

### 4.5 Vendor Quotations

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-SQT-01 | Quotation List | A | Ch 4 |
| S-SQT-02 | Quotation Entry / Edit | B | Ch 4 |
| S-SQT-03 | Quotation Detail | C | Ch 4 |
| S-SQT-04 | Portal Submission Inbox | A | Ch 4 |
| S-SQT-05 | Quotation Revision / Negotiation Round | B | Ch 4 |
| S-SQT-06 | Regret / No-quote Capture | (dialog) | Ch 4 |
| S-SQT-07 | Quotation Attachment & Sample Register | A | Ch 4 |

### 4.6 Quotation Comparison

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-CMP-01 | Comparison Workbench (matrix) | (bespoke, extends A) | Ch 5 |
| S-CMP-02 | Landed-cost Breakdown (per vendor per line) | (drawer) | Ch 5 |
| S-CMP-03 | Scoring & Weighting Configuration | B | Ch 5 |
| S-CMP-04 | Recommendation Panel | (embedded) | Ch 5 |
| S-CMP-05 | Split Award Allocator | B | Ch 5 |
| S-CMP-06 | Negotiation Round Manager | A | Ch 5 |
| S-CMP-07 | Comparison Statement (print / approval pack) | G | Ch 5 |
| S-CMP-08 | Saved Comparisons List | A | Ch 5 |

### 4.7 Purchase Order

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-POR-01 | PO List | A | Ch 6 |
| S-POR-02 | PO Create / Edit | B | Ch 6 |
| S-POR-03 | PO Detail | C | Ch 6 |
| S-POR-04 | Rate Contract / Blanket Order | B | Ch 6 |
| S-POR-05 | Delivery Schedule / Call-off | B | Ch 6 |
| S-POR-06 | Subcontract PO with BOM & Challan Plan | B | Ch 6 |
| S-POR-07 | Import PO (FC, Incoterm, landed cost) | B | Ch 6 |
| S-POR-08 | PO Amendment & Revision Diff | B / C | Ch 6 |
| S-POR-09 | PO Release & Dispatch to Supplier | D | Ch 6 |
| S-POR-10 | PO Acknowledgement Tracker | A | Ch 6 |
| S-POR-11 | Open PO / Expediting Workbench | A | Ch 6 |
| S-POR-12 | PO Short-close / Cancel | (dialog) | Ch 6 |
| S-POR-13 | Subcontract Challan Reconciliation | A | Ch 6 |

### 4.8 Goods Receipt, Return & Invoice

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-GRN-01 | Gate Entry List | A | Ch 7 |
| S-GRN-02 | Gate Entry Create (security) | B | Ch 7 |
| S-GRN-03 | Weighbridge Capture | B | Ch 7 |
| S-GRN-04 | GRN List | A | Ch 7 |
| S-GRN-05 | GRN Create against PO | B | Ch 7 |
| S-GRN-06 | GRN Line Batch/Heat Split | (drawer) | Ch 7 |
| S-GRN-07 | GRN Detail | C | Ch 7 |
| S-GRN-08 | Pending Inspection Board | E | Ch 7 |
| S-GRN-09 | Inspection Result Posting (from Vol 7) | (embedded) | Ch 7 |
| S-GRN-10 | Put-away / Bin Assignment | B | Ch 7 |
| S-GRN-11 | Mobile GRN (scan-first) | (mobile) | Ch 13 |
| S-PRT-01 | Purchase Return List | A | Ch 7 |
| S-PRT-02 | Purchase Return Create | B | Ch 7 |
| S-PRT-03 | Debit Note List | A | Ch 7 |
| S-PRT-04 | Debit Note Create | B | Ch 7 |
| S-PIV-01 | Supplier Invoice List | A | Ch 7 |
| S-PIV-02 | Invoice Verification Workbench (3-way match) | B | Ch 7 |
| S-PIV-03 | Match Exception Resolution | B | Ch 7 |
| S-PIV-04 | GRIR Reconciliation | G | Ch 7 |
| S-PIV-05 | Landed-cost Apportionment | B | Ch 7 |

### 4.9 Approval Center & Settings

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-APR-01 | Pending My Approval (procurement inbox) | A | Ch 8 |
| S-APR-02 | Approval Decision Panel with context | (embedded) | Ch 8 |
| S-APR-03 | My Submitted Documents | A | Ch 8 |
| S-APR-04 | Delegation Register | A / B | Ch 8 |
| S-APR-05 | Approval History & Audit Trail | G | Ch 8 |
| S-APR-06 | Procurement Approval Matrix | A / B | Ch 8 |
| S-SET-01 | Procurement Parameters | B | Ch 8 |
| S-SET-02 | Evaluation Criteria & Weightings | B | Ch 5 |
| S-SET-03 | Terms & Conditions Library | A / B | Ch 6 |
| S-SET-04 | Reason Code Configuration | A | Ch 8 |
| S-SET-05 | Print & E-mail Template Configuration | B | Ch 13 |

---

## 5. Actors

| Actor | Role code | Responsibility in this module |
|---|---|---|
| Requester / Employee | any | Raises PR for own department; tracks it |
| Department Head | (derived) | First approval of departmental PR; budget owner |
| Purchase Executive | `PURCH_EXEC` | RFQ, quotation entry, comparison, PO draft, expediting, return |
| Purchase Manager / Head | `PURCH_HEAD` | PR and PO approval, vendor selection, rate contract, supplier approval |
| Factory / Works Head | `FACTORY_HEAD` | PR/PO approval above limit, capital and subcontract sign-off |
| Finance Manager / CFO | `CFO`, `ACCOUNTS` | Budget verification, PO financial approval, invoice verification, payment release |
| Director / MD | `MD`, `CEO` | Top-tier approval, capital sanction |
| Store Manager / In-charge | `STORE_HEAD` | Gate entry oversight, GRN approval, put-away, return dispatch |
| Store Operator | `STORE_OPR` | Gate entry, GRN entry, scanning, weighment |
| QC Head / Inspector | `QC_HEAD`, `QC_INSP` | Incoming inspection decision, rejection reason, MTC verification |
| Planner | `PPC` | Generates PR from MRP, confirms need dates, reschedules |
| Supplier (external) | `SUPPLIER_PORTAL` | RFQ response, PO acknowledgement, ASN, invoice upload, document renewal |
| Internal Auditor | `AUDITOR` | Read-only across the module, full audit trail |
| System / Company Admin | `SYS_ADMIN` | Settings, numbering, approval matrix, templates |

---

## 6. Permissions catalogue introduced by this volume

Full role × permission matrix, data scope and field-level rules are in
[Chapter 10](10-permissions-and-roles.md). Summary of the namespaces:

```
PROCUREMENT.DASHBOARD.VIEW | VIEW_ALL_PLANTS
PROCUREMENT.SUPPLIER.      VIEW · CREATE · EDIT · APPROVE · BLACKLIST · RATE · PORTAL_MANAGE · VIEW_BANK
PROCUREMENT.AVL.           VIEW · EDIT · APPROVE
PROCUREMENT.PR.            VIEW · VIEW_ALL · CREATE · EDIT · SUBMIT · APPROVE · REJECT ·
                           CANCEL · SHORT_CLOSE · AMEND · CONSOLIDATE · PRINT · EXPORT
PROCUREMENT.RFQ.           VIEW · CREATE · EDIT · SUBMIT · APPROVE · DISPATCH · AMEND ·
                           CANCEL · OPEN_SEALED · PRINT · EXPORT
PROCUREMENT.QUOTATION.     VIEW · CREATE · EDIT · ACCEPT_PORTAL · REVISE · VIEW_RATES · PRINT · EXPORT
PROCUREMENT.COMPARISON.    VIEW · CREATE · CONFIGURE_WEIGHTS · RECOMMEND · AWARD · APPROVE_AWARD · PRINT
PROCUREMENT.PO.            VIEW · VIEW_ALL · CREATE · EDIT · SUBMIT · APPROVE · REJECT ·
                           RELEASE · AMEND · CANCEL · SHORT_CLOSE · REOPEN · PRINT · EXPORT ·
                           OVERRIDE_PRICE · OVERRIDE_BUDGET
PROCUREMENT.RATE_CONTRACT. VIEW · CREATE · EDIT · APPROVE · CLOSE
PROCUREMENT.SUBCONTRACT.   VIEW · CREATE · APPROVE · RECONCILE
PROCUREMENT.GATE_ENTRY.    VIEW · CREATE · EDIT · CANCEL
PROCUREMENT.GRN.           VIEW · CREATE · EDIT · APPROVE · REJECT · CANCEL · ACCEPT_EXCESS ·
                           REOPEN · PRINT · EXPORT
PROCUREMENT.RETURN.        VIEW · CREATE · APPROVE · DISPATCH · PRINT
PROCUREMENT.DEBIT_NOTE.    VIEW · CREATE · APPROVE · PRINT
PROCUREMENT.INVOICE.       VIEW · CREATE · EDIT · MATCH · APPROVE · RELEASE_BLOCK · PRINT · EXPORT
PROCUREMENT.REPORT.        VIEW · VIEW_COST · EXPORT · SCHEDULE
PROCUREMENT.SETTINGS.      VIEW · EDIT
```

---

## 7. Assumptions

| # | Assumption | Impact if wrong |
|---|---|---|
| A3-01 | The plant operates a security gate that records inward vehicles; gate entry is a real control, not a formality | Gate entry becomes optional configuration |
| A3-02 | Incoming inspection is required for all direct material and consumables, and is skippable only for configured routine/MRO items | Inspection-required default flips |
| A3-03 | Supplier invoices arrive after the GRN in the normal case; invoice-before-receipt is an exception path | Match sequencing changes |
| A3-04 | The company will use a supplier portal for at least RFQ response and PO acknowledgement | Portal chapters become phase 2 |
| A3-05 | Rate contracts are signed for SS coil and major components; spot buying is the exception | Contract-first sourcing logic becomes advisory |
| A3-06 | Budget control is advisory at PR and blocking at PO, configurable per company | Budget gate position changes |
| A3-07 | Job work is done on issued material (Sec 143), not on sale-and-buy-back | Subcontract accounting changes entirely |

## 8. Open questions

Tracked in [../open-questions.md](../open-questions.md).

| # | Question | Chapter |
|---|---|---|
| Q3-01 | Is a supplier portal in scope for release 1, or is e-mail-only RFQ acceptable at go-live? | Ch 1, 3 |
| Q3-02 | What are the current approval limits (₹) per level for PR and PO, per procurement type? | Ch 8 |
| Q3-03 | Are imports in scope for release 1, and in which currencies/Incoterms? | Ch 6 |
| Q3-04 | Is capital procurement handled here or through a separate capex authorisation process? | Ch 2, 6 |
| Q3-05 | Receipt tolerance percentages currently accepted for SS coil (weight) and components (count)? | Ch 7 |
| Q3-06 | Who owns the supplier rating decision — purchase, quality, or a joint committee? | Ch 1 |
| Q3-07 | Is a weighbridge integration available at the gate, and with what protocol? | Ch 7 |
| Q3-08 | Does Finance want invoice **booking** in this module, or only matching with booking in Vol 9? | Ch 7 |
| Q3-09 | Are there existing rate contracts and open POs to migrate at cutover? | Ch 6 |
| Q3-10 | Confirm the MSME payment term policy and whether it overrides negotiated terms | Ch 1, 7 |

---

**Revision history**

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-07-29 | Engineering | Initial draft — full FRD for the Procurement module |
