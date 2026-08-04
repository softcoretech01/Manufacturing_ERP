# Volume 0 — Foundation & Cross-Cutting Standards

**Stainless Steel Water Bottle Manufacturing ERP**
Version 0.1 (draft) · 2026-07-28

> This volume defines everything that is true across the whole product. Volumes 1–11 specify
> only what is unique to their domain and assume this volume without restating it. If a
> domain volume contradicts this one, this one wins unless the contradiction is explicitly
> flagged as a domain exception.

---

## Table of contents

1. [Purpose, scope and audience](#1-purpose-scope-and-audience)
2. [Business context](#2-business-context)
3. [Product vision and success criteria](#3-product-vision-and-success-criteria)
4. [Stakeholders and the global role catalogue](#4-stakeholders-and-the-global-role-catalogue)
5. [System architecture](#5-system-architecture)
6. [Technology stack and rationale](#6-technology-stack-and-rationale)
7. [Data architecture standards](#7-data-architecture-standards)
8. [API standards](#8-api-standards)
9. [Security standards](#9-security-standards)
10. [The standard transaction document pattern](#10-the-standard-transaction-document-pattern)
11. [Document numbering standard](#11-document-numbering-standard)
12. [Audit and compliance standard](#12-audit-and-compliance-standard)
13. [Notification standard](#13-notification-standard)
14. [Reporting and export standard](#14-reporting-and-export-standard)
15. [Barcode and QR code standard](#15-barcode-and-qr-code-standard)
16. [UI/UX standard and screen archetypes](#16-uiux-standard-and-screen-archetypes)
17. [Mobile application standard](#17-mobile-application-standard)
18. [Integration and event standard](#18-integration-and-event-standard)
19. [Non-functional requirements](#19-non-functional-requirements)
20. [Environments, configuration and deployment](#20-environments-configuration-and-deployment)
21. [Glossary](#21-glossary)
22. [Assumptions and open questions](#22-assumptions-and-open-questions)

---

## 1. Purpose, scope and audience

### 1.1 Purpose

This document set specifies a complete, enterprise-grade ERP for a stainless steel vacuum
flask / water bottle manufacturer, covering the full order-to-cash and procure-to-pay cycles
plus manufacturing execution, quality, maintenance, logistics, finance, HR and analytics.

### 1.2 Scope

**In scope:** all twenty functional modules listed in the client scope document, delivered as
a single web application with a companion shop-floor mobile app, supporting multiple
companies, branches, plants and warehouses under one deployment.

**Explicitly out of scope for release 1** (recorded so it is not re-litigated):

| Out of scope | Rationale |
|---|---|
| Machine-level IoT/SCADA/PLC direct data capture | Event hooks are specified (§18) so it can be added without redesign, but no driver work in R1 |
| Full WMS with automated storage/retrieval (ASRS) | Bin-level manual warehousing only |
| Statutory payroll filing (ECR/Form 24Q e-filing) | Payroll computes and generates files; filing is manual |
| Multi-country statutory compliance | Indian GST/TDS only. Framework is pluggable (`statutory/` adapter) |
| Customer-facing eCommerce storefront | Integration events published; storefront not built |
| Advanced planning & scheduling (finite-capacity optimiser) | Rough-cut and finite capacity planning yes; optimisation engine no |

### 1.3 Audience

Product owners and department heads (Sections 1–4, and their own domain volume), solution
architects and developers (all sections), QA (Sections 7–19 plus domain volumes), and
infrastructure/DevOps (Sections 19–20).

---

## 2. Business context

### 2.1 The product being manufactured

A stainless steel vacuum-insulated water bottle is a multi-component assembly, and the ERP's
data model must reflect that from day one:

```
                    FINISHED BOTTLE (SKU)
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   OUTER BODY          INNER BODY            LID ASSEMBLY
   (SS 201/304)        (SS 304/316)               │
        │                   │            ┌────────┼────────┐
   SS coil → cut →     SS coil → cut →   │        │        │
   deep draw →         deep draw →    Lid body  Silicone  Plastic
   form → neck →       form → neck      (SS/PP)   ring    insert
   thread roll              │
        └─────────┬─────────┘
                  │
        Inner + Outer assembled
                  │
          BOTTOM WELDING (laser/TIG)
                  │
       VACUUM DRAWING + GETTER + SEAL
                  │
            LEAK / VACUUM TEST
                  │
              POLISHING / BUFFING
                  │
        POWDER COATING or PAINTING → CURING
                  │
        PRINTING (pad / screen / UV) or LASER LOGO
                  │
              FINAL ASSEMBLY
                  │
          FINAL QC + TEMPERATURE RETENTION TEST
                  │
    PACKING (inner box → carton → pallet)
                  │
             FINISHED GOODS STORE
```

### 2.2 Characteristics that drive the design

These are the things about this business that a generic ERP gets wrong, and that the data
model must handle natively:

| Characteristic | Design consequence |
|---|---|
| **Variant explosion.** One bottle model × capacity × colour × lid type × branding = hundreds of SKUs from a few base bodies. | Product master needs a **variant/attribute model**, not one flat SKU list. Capacity, colour, lid type and finish are first-class master dimensions (Vol 1 §7). BOMs are defined at base-body level with variant overlays (Vol 5). |
| **Two-stage identity.** A body is generic until it is coated/printed; then it belongs to one customer's branding. | WIP tracking must support **generic semi-finished stock** that is committed to a customer only at the coating/printing operation. Allocation and reservation logic (Vol 4) must handle late differentiation. |
| **Vacuum quality is destructive to test at 100%.** | Quality module needs **sampling plans (AQL)** for temperature-retention, and **100% inspection** for leak/vacuum. Both patterns are first-class (Vol 7). |
| **Yield loss is real and stage-specific.** Deep drawing scraps, welding scraps, coating rejects. | BOM/routing must carry **operation-wise yield % and scrap %**, and costing must absorb them (Vol 5). Scrap SS has recoverable value — scrap is an inventory item, not a write-off. |
| **SS raw material is bought by weight, consumed by piece.** Coil → sheet → circle/blank. | Dual UOM with **weight↔piece conversion driven by grade, thickness, diameter** and a computed blank weight. Inventory must hold both (Vol 4). Coil-to-blank nesting yield affects material planning. |
| **Steel price volatility.** | Purchase pricing needs **rate contracts with validity and price escalation clauses**; costing needs both standard and moving-average valuation (Vol 4, Vol 9). |
| **Batch/heat-number traceability is a customer audit requirement.** | Full **forward and backward traceability**: heat number → coil → blank → body → bottle → carton → invoice → customer. Non-negotiable (Vol 4 batch/lot, Vol 8 packing). |
| **Export orders** with container-level packing and pre-shipment inspection. | Packing hierarchy goes to **container** level; dispatch supports export documentation (Vol 8). |
| **Seasonal demand**, heavy in summer and gifting season. | Forecasting and MPS must support **seasonality factors** and campaign-driven demand (Vol 5). |
| **Job work / subcontracting** for coating and printing is common. | Subcontract PO, material sent on challan, subcontract GRN with material reconciliation — required, not optional (Vol 3, Vol 4). |

### 2.3 End-to-end business process

```
 CUSTOMER                SALES              PLANNING           PROCUREMENT
    │                      │                   │                    │
 Enquiry ─────────────► Lead                   │                    │
    │                   Opportunity            │                    │
    │ ◄──────────────── Quotation              │                    │
 PO issued ──────────► Sales Order ──────► Demand ──► MRP ──► Purchase Requisition
                          │                   │                    │
                          │                MPS/Prod                RFQ
                          │                Schedule                 │
                          │                   │              Supplier Quotation
                          │                   │                     │
                          │                   │              Comparison + Approval
                          │                   │                     │
                          │                   │              Purchase Order ──► SUPPLIER
                          │                   │                                    │
 STORES  ◄──────────────────────────────────────────────────── Material Despatch ──┘
    │
  GRN ──► Incoming QC ──► Accept ──► Raw Material Store
    │           └──────► Reject ──► Debit Note / Return to Supplier
    │
    ▼
 PRODUCTION
    │
 Production Order ──► Work Order (per operation) ──► Material Issue
    │                                                     │
    │                                        Cutting → Drawing → Forming →
    │                                        Necking → Threading → Welding →
    │                                        Vacuum → Leak Test → Polishing
    │                                                     │
    │                                              In-process QC
    │                                                     │
    │                                        Coating/Painting → Printing/Laser
    │                                                     │
    │                                              Assembly → Final QC
    ▼                                                     │
 PACKING ◄────────────────────────────────────────────────┘
    │
 Inner box → Carton → Pallet → Barcode/Label ──► Finished Goods Store
    │
    ▼
 DISPATCH
    │
 Dispatch Plan ──► Vehicle ──► Loading ──► Delivery Challan ──► E-Way Bill ──► Shipment
    │                                                                            │
    │                                                                     Delivery + POD
    ▼
 FINANCE
    │
 Sales Invoice ──► Receivable ──► Collection ──► Customer Ledger
 Purchase Invoice ──► 3-way match (PO/GRN/Invoice) ──► Payable ──► Payment
    │
 GST returns · TDS · Costing · Trial Balance · P&L · Balance Sheet
```

---

## 3. Product vision and success criteria

**V0-BR-001 (M)** The system MUST be the single source of truth for stock, cost and order
status. Where a parallel spreadsheet survives go-live, that is a specification defect.

Measurable success criteria for release 1:

| # | Criterion | Target |
|---|---|---|
| SC-1 | Inventory record accuracy vs physical count | ≥ 98% |
| SC-2 | Time from customer PO to confirmed Sales Order | ≤ 4 working hours |
| SC-3 | Time to close a month-end | ≤ 5 working days |
| SC-4 | Full backward traceability of any dispatched carton to heat number | ≤ 2 minutes, self-service |
| SC-5 | Shop-floor production entry latency (operation done → visible in ERP) | ≤ 2 minutes |
| SC-6 | Purchase requisition to PO cycle time | ≤ 3 working days |
| SC-7 | Concurrent named users supported without degradation | 250 |
| SC-8 | Manual re-keying of data between modules | Zero |

---

## 4. Stakeholders and the global role catalogue

### 4.1 Role catalogue

Roles are **configurable** (Vol 1 §1) — this catalogue is the seeded default, not a hard-coded
list. Every role is a named bundle of permissions plus a data scope.

| Role code | Role | Primary scope | Key capabilities |
|---|---|---|---|
| `SYS_ADMIN` | System Administrator | All companies | Configuration, users, roles, workflow, numbering, parameters. **No** transactional posting rights by default. |
| `MD` | Managing Director | Group (all companies) | Read-all, group MIS dashboard, top-tier approvals |
| `CEO` | Chief Executive Officer | Company | Read-all within company, strategic dashboards, high-value approvals |
| `CFO` | Chief Financial Officer | Company | Finance full, budget approval, payment release |
| `FACTORY_HEAD` | Factory / Works Head | Plant | Production, quality, maintenance, stores oversight; production approvals |
| `SALES_HEAD` | Sales Head | Company | CRM/Sales full, quotation and discount approval, credit-limit override request |
| `SALES_EXEC` | Sales Executive | Own customers | Lead, opportunity, visit, quotation (draft), sales order (draft) |
| `PURCH_HEAD` | Purchase Head | Company | Procurement full, PO approval, supplier approval, rate contract |
| `PURCH_EXEC` | Purchase Executive | Company | RFQ, supplier quote entry, comparison, PO draft |
| `STORE_HEAD` | Stores In-charge | Plant/Warehouse | GRN, issues, transfers, adjustments (approval), cycle count |
| `STORE_OPR` | Store Operator | Warehouse | GRN entry, material issue/receipt, bin transfer, scanning |
| `PPC` | Production Planning & Control | Plant | Forecast, MPS, MRP, production order, schedule |
| `PROD_MGR` | Production Manager | Plant | Work orders, allocation, production confirmation, rework/scrap approval |
| `SHIFT_SUP` | Shift Supervisor | Line/Shift | Production entry, downtime entry, manpower allocation |
| `OPERATOR` | Machine Operator | Machine | Mobile production entry, downtime report, material request |
| `QC_HEAD` | Quality Head | Plant | QC approval, NCR/CAPA closure, quality certificate release, inspection plan |
| `QC_INSP` | Quality Inspector | Plant | Incoming/in-process/final inspection entry, defect capture |
| `MAINT_HEAD` | Maintenance Head | Plant | PM schedule, breakdown closure, spares approval |
| `TECHNICIAN` | Maintenance Technician | Plant | Breakdown entry/attend, PM checklist execution |
| `PACK_SUP` | Packing Supervisor | Plant | Packing order, carton/pallet build, label printing |
| `DISPATCH` | Dispatch Executive | Plant | Dispatch plan, loading, challan, e-way bill, POD |
| `ACCOUNTS` | Accounts Executive | Company | Vouchers, invoices, receipts, payments, reconciliation |
| `HR` | HR Executive | Company | Employee, attendance, leave, payroll processing |
| `AUDITOR` | Internal Auditor | Company | **Read-only across all modules**, full audit-log access, no write anywhere |
| `SUPPLIER_PORTAL` | Supplier (external) | Own supplier record | RFQ response, PO acknowledgement, ASN, invoice upload |
| `CUSTOMER_PORTAL` | Customer (external) | Own customer record | Order status, dispatch tracking, ledger, complaint |

**V0-BR-002 (M)** `AUDITOR` and external portal roles MUST NOT be grantable any write
permission on internal transactional entities. This is enforced by a permission blacklist on
the role type, not by convention.

**V0-BR-003 (M)** No single role may both create and approve the same document instance. Even
where a user holds both permissions, the workflow engine MUST reject self-approval unless the
company parameter `ALLOW_SELF_APPROVAL` is explicitly enabled for that document type (default
off) — see Vol 1 §4.

### 4.2 Segregation of duties matrix (minimum)

| Conflicting pair | Rule |
|---|---|
| Create PO / Approve PO | Never the same user on the same PO |
| Create supplier / Approve supplier | Never the same user |
| GRN entry / QC approval | Different users |
| Payment voucher entry / Payment release | Different users |
| Stock adjustment entry / Adjustment approval | Different users |
| Employee master edit / Payroll approval | Different users |

---

## 5. System architecture

### 5.1 Logical architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                          │
│  React SPA (desktop/tablet)   React Native app   Supplier & Customer portals  │
│  Label printers (ZPL)         Barcode scanners   Weighing scales (serial)     │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ HTTPS / REST + WebSocket
┌───────────────────────────────▼──────────────────────────────────────────────┐
│                          API GATEWAY / EDGE                                   │
│  TLS termination · rate limiting · WAF · request id · gzip/brotli             │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────────┐
│                    ERP APPLICATION (FastAPI, modular monolith)                │
│                                                                               │
│  ┌────────────────────────── CORE / PLATFORM ──────────────────────────────┐ │
│  │ Auth & Session │ RBAC & Scope │ Tenant Context │ Workflow Engine        │ │
│  │ Numbering      │ Audit        │ Notification   │ Attachment / DMS       │ │
│  │ Event Bus (outbox) │ Job Runner │ Export Engine │ Print/Template Engine │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌───────────────────────── DOMAIN MODULES ────────────────────────────────┐ │
│  │ masters │ crm │ procurement │ inventory │ engineering │ planning        │ │
│  │ production │ quality │ maintenance │ packing │ dispatch │ sales         │ │
│  │ finance │ hrms │ assets │ dms │ reporting                               │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
└───────┬──────────────────────┬───────────────────┬───────────────────┬───────┘
        │                      │                   │                   │
┌───────▼──────┐      ┌────────▼──────┐   ┌────────▼───────┐  ┌────────▼──────┐
│  MySQL 8     │      │  Redis        │   │ S3 / MinIO     │  │ Celery workers│
│  (primary +  │      │  cache, locks │   │ documents,     │  │ MRP, reports, │
│   read       │      │  queues,      │   │ drawings,      │  │ payroll,      │
│   replica)   │      │  rate limits  │   │ photos, labels │  │ notifications │
└──────────────┘      └───────────────┘   └────────────────┘  └───────────────┘
        │
┌───────▼──────────────────────────────────────────────────────────────────────┐
│  EXTERNAL: GST/IRP (e-invoice) · NIC (e-way bill) · SMS · WhatsApp Business · │
│  SMTP · Payment gateway · Bank statement feed · Courier/transporter APIs      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**V0-NFR-001 (M)** The application MUST be deployable as a modular monolith in a single
process, and MUST NOT require inter-service network calls for any core transaction. Module
boundaries are enforced in code (import rules), not by the network — so that a future
extraction to services is possible without a rewrite, but is not paid for up front.

### 5.2 Layering within a module

```
   ┌──────────────────────────────────────────────────┐
   │  api/          FastAPI routers, Pydantic schemas │  ← HTTP concerns only
   ├──────────────────────────────────────────────────┤
   │  application/  Use-case services, orchestration, │  ← transactions start here
   │                permission checks, event emission │
   ├──────────────────────────────────────────────────┤
   │  domain/       Entities, value objects, domain   │  ← pure Python, no I/O,
   │                services, invariants, state       │    fully unit-testable
   │                machines, domain events           │
   ├──────────────────────────────────────────────────┤
   │  infrastructure/ SQLAlchemy models, repositories,│  ← implements domain ports
   │                external adapters                 │
   └──────────────────────────────────────────────────┘
```

**V0-NFR-002 (M)** The `domain` layer MUST NOT import FastAPI, SQLAlchemy, or any other
module's package. CI MUST fail the build on violation.

**V0-NFR-003 (M)** A database transaction MUST begin and end within a single application
service method. Routers MUST NOT manage transactions; repositories MUST NOT commit.

### 5.3 Deployment topology (on-premise reference)

```
                    ┌──────────────┐
     Internet ─────►│  Reverse     │
     (portals,      │  proxy /     │
      mobile)       │  Nginx + TLS │
                    └──────┬───────┘
                           │
      Factory LAN ─────────┤
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
  ┌─────▼─────┐     ┌──────▼─────┐    ┌───────▼──────┐
  │ App node 1│     │ App node 2 │    │ Worker node  │
  │ (uvicorn) │     │ (uvicorn)  │    │ (celery)     │
  └─────┬─────┘     └──────┬─────┘    └───────┬──────┘
        └──────────┬───────┴──────────────────┘
                   │
        ┌──────────▼─────────┐      ┌───────────────┐
        │ MySQL primary      │─────►│ MySQL replica │
        │ (InnoDB, binlog)   │      │ (reports)     │
        └──────────┬─────────┘      └───────────────┘
                   │
        ┌──────────▼─────────┐      ┌───────────────┐
        │ Redis              │      │ MinIO         │
        └────────────────────┘      └───────────────┘
```

**V0-NFR-004 (M)** The system MUST continue to accept shop-floor production, material issue
and GRN entries when the internet link is down. Only external statutory calls (e-invoice,
e-way bill), outbound email/SMS/WhatsApp and portal access may degrade. Those are queued and
retried.

---

## 6. Technology stack and rationale

| Concern | Choice | Why this, here |
|---|---|---|
| RDBMS | **MySQL 8.0+**, InnoDB, `utf8mb4_0900_ai_ci` | Client-specified. 8.0 is the floor because the design relies on CTEs (multi-level BOM explosion), window functions (inventory ageing, running balances), generated columns (soft-delete unique keys), `CHECK` constraints and native JSON. |
| Backend | **Python 3.12 + FastAPI** | Client specified Python. FastAPI chosen over Django for: native async (needed for statutory API calls and long report streaming), Pydantic-generated OpenAPI (the API contract is a deliverable), and clean separation from the ORM — Django's fat-model convention fights the DDD layering in §5.2. **Assumption — see §22.** |
| ORM | **SQLAlchemy 2.0** typed + **Alembic** | Repository pattern support, explicit unit-of-work, and the raw-SQL escape hatch that reporting and MRP need. |
| Contracts | **Pydantic v2** | Single definition drives validation, serialisation and OpenAPI. |
| Background work | **Celery + Redis**, `celery beat` | MRP runs, month-end, payroll, bulk imports, large exports, notification fan-out, statutory retries. |
| Cache / lock | **Redis 7** | Session revocation lists, permission cache, distributed locks for numbering and stock posting, rate limiting. |
| Files | **S3-compatible (MinIO on-prem)** | Drawings, QC photos, PODs, labels, generated PDFs. Never store binaries in MySQL. |
| Web | **React 18 + TypeScript + Vite + Tailwind CSS** | Client-specified. TypeScript is mandatory — an ERP domain model this large is not safely maintainable in untyped JS. |
| Web data layer | **TanStack Query** | Caching, background refetch, optimistic updates, and offline-ish resilience on the factory LAN. |
| Web tables | **TanStack Table** (virtualised) | Stock ledgers and production reports routinely exceed 50k rows in a view. |
| Mobile | **React Native (Expo)** | Camera-based barcode/QR scanning, offline SQLite queue, and shared TypeScript domain types with web. A PWA cannot reliably drive hardware scanners or survive factory dead-zones. **Assumption — see §22.** |
| PDF | **WeasyPrint** (HTML+CSS → PDF) | Templates are HTML, so the same template engine serves screen preview and print. |
| Excel | **openpyxl** / **xlsxwriter** | xlsxwriter for large streaming exports, openpyxl for template-based imports. |
| Labels | **Direct ZPL/EPL generation** | Barcode labels go to Zebra/TSC printers as raw ZPL over TCP 9100 — never as a PDF a browser must render, which breaks alignment on thermal stock. |
| Logging | **structlog** → JSON | Correlation id on every line. |
| Tracing/metrics | **OpenTelemetry + Prometheus** | Required to meet the latency NFRs in §19. |

---

## 7. Data architecture standards

### 7.1 Naming conventions

**V0-DR-001 (M)** All identifiers are `snake_case`, lower case, ASCII.

| Object | Convention | Example |
|---|---|---|
| Table | `<prefix>_<singular_entity>` | `mst_customer`, `prc_purchase_order` |
| Child/line table | `<parent_table>_item` / `_line` | `prc_purchase_order_item` |
| Primary key | `id` | |
| Public identifier | `uid` | |
| Foreign key | `<referenced_singular>_id` | `customer_id`, `warehouse_id` |
| Index | `ix_<table>_<cols>` | `ix_grn_supplier_id_grn_date` |
| Unique index | `uk_<table>_<cols>` | `uk_customer_code` |
| Foreign key constraint | `fk_<table>_<ref_table>` | `fk_po_item_product` |
| Check constraint | `ck_<table>_<rule>` | `ck_po_item_qty_positive` |
| Boolean column | `is_` / `has_` prefix | `is_active`, `has_batch` |
| Date column | `_date` suffix | `po_date`, `due_date` |
| Timestamp column | `_at` suffix | `approved_at` |
| Enum column | stored as `VARCHAR(30)` + `CHECK` | `status`, `document_type` |

### 7.2 Table prefixes

| Prefix | Domain | Volume |
|---|---|---|
| `core_` | Platform services (audit, attachment, comment, workflow, numbering, notification, event, job) | 1 |
| `sys_` | System administration & organisation structure | 1 |
| `iam_` | Identity & access | 1 |
| `mst_` | Master data | 1 |
| `crm_` | CRM | 2 |
| `sal_` | Sales | 2 |
| `prc_` | Procurement | 3 |
| `inv_` | Inventory & warehouse | 4 |
| `eng_` | Product engineering & BOM | 5 |
| `pln_` | Production planning | 5 |
| `prd_` | Shop floor production | 6 |
| `qcm_` | Quality management | 7 |
| `mnt_` | Maintenance | (Vol 6 annex) |
| `pkg_` | Packing | 8 |
| `dsp_` | Dispatch & logistics | 8 |
| `fin_` | Finance & accounting | 9 |
| `hrm_` | HRMS | 10 |
| `ast_` | Asset management | 10 |
| `dms_` | Document management | 11 |
| `rpt_` | Reporting metadata & saved views | 11 |

### 7.3 Standard columns

**V0-DR-002 (M)** Every business table MUST carry the standard column block:

```sql
id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
uid         CHAR(26)        NOT NULL COMMENT 'ULID - public identifier',
company_id  BIGINT UNSIGNED NOT NULL,
version     INT UNSIGNED    NOT NULL DEFAULT 1,
created_at  DATETIME(6)     NOT NULL,
created_by  BIGINT UNSIGNED NOT NULL,
updated_at  DATETIME(6)     NOT NULL,
updated_by  BIGINT UNSIGNED NOT NULL,
deleted_at  DATETIME(6)     NULL,
deleted_by  BIGINT UNSIGNED NULL,
deleted_key DATETIME(6) GENERATED ALWAYS AS (IFNULL(deleted_at,'1970-01-01 00:00:00')) STORED,
PRIMARY KEY (id),
UNIQUE KEY uk_<table>_uid (uid)
```

Exceptions: `core_audit_log` and `core_event_outbox` are append-only and omit
`updated_*`/`deleted_*`. Globally shared reference tables (`mst_country`, `mst_state`,
`mst_currency`, `mst_hsn`, `mst_uom`) omit `company_id`.

**V0-DR-003 (M)** `uid` is a **ULID** (26-char Crockford base32). Rationale: sortable by
creation time (so it clusters well as a secondary index), collision-free when generated
offline on a mobile device, and safe to expose in URLs without leaking row counts.

**V0-DR-004 (M)** Line/item tables MUST also carry `line_no INT UNSIGNED NOT NULL` and a
unique key on `(parent_id, line_no, deleted_key)`. Line numbers are stable across amendments;
a deleted line's number is not reused within the same document.

### 7.4 Data types

**V0-DR-005 (M)** Use exactly these types for these concepts:

| Concept | MySQL type | Notes |
|---|---|---|
| Quantity | `DECIMAL(18,6)` | Never float. Display precision is per-UOM (Vol 1 §7). |
| Rate / unit price | `DECIMAL(18,6)` | |
| Amount / value | `DECIMAL(18,2)` | |
| Percentage | `DECIMAL(9,4)` | Stored as `18.0000` for 18%, not `0.18`. |
| Exchange rate | `DECIMAL(18,8)` | |
| Weight (kg) | `DECIMAL(18,4)` | |
| Dimension (mm) | `DECIMAL(12,3)` | |
| Temperature (°C) | `DECIMAL(6,2)` | |
| Code | `VARCHAR(50)` | |
| Name / description | `VARCHAR(255)` | |
| Long text / remarks | `TEXT` | |
| Status / enum | `VARCHAR(30)` + `CHECK` | Human-readable in the DB; no magic integers. |
| Boolean | `TINYINT(1)` | `0`/`1` only. |
| Timestamp | `DATETIME(6)` | **UTC always.** |
| Business date | `DATE` | Plant-local. |
| Flexible attributes | `JSON` | Only for genuinely open-ended data (device payloads, form-builder responses). Never for queryable business fields. |

**V0-BR-004 (M)** Monetary rounding is **half-up**, applied once, at the declared scale of the
target field, at the moment of persistence. Intermediate calculations retain full precision.
Line-level rounding differences MUST be absorbed into a `round_off` field at document header
level, never silently dropped.

**V0-BR-005 (M)** Every monetary column that can hold a foreign-currency value MUST be
accompanied by `currency_code`, `exchange_rate`, and a base-currency twin column
(`*_base`). Reports and ledgers work in base currency; documents display transaction currency.

### 7.5 Soft delete

**V0-DR-006 (M)** No transactional or master row is ever hard-deleted. Deletion sets
`deleted_at`, `deleted_by`. All reads filter `deleted_at IS NULL` by default, applied
centrally in the repository base class.

**V0-DR-007 (M)** Every unique business key MUST include `deleted_key` so that a soft-deleted
row does not permanently occupy its code:

```sql
UNIQUE KEY uk_mst_customer_code (company_id, code, deleted_key)
```

**V0-BR-006 (M)** A record MUST NOT be deletable (soft or otherwise) if it is referenced by
any non-cancelled transaction. The system MUST show a "where used" list instead of a generic
error. Records that cannot be deleted may be **deactivated**, which blocks new references but
preserves existing ones.

**V0-BR-007 (M)** Approved financial and inventory-affecting documents (invoice, GRN, issue,
voucher, production confirmation) MUST NOT be deletable at all — only cancelled or reversed,
with a reason code, generating a compensating entry.

### 7.6 Multi-tenancy and data scoping

```
   Company (legal entity, own books, own GSTIN)
      └── Branch (registered place of business, own GSTIN if different state)
            └── Plant (manufacturing site)
                  └── Production Line
                        └── Machine / Work Centre
            └── Warehouse (store)
                  └── Zone
                        └── Bin / Rack location
```

**V0-DR-008 (M)** `company_id` is mandatory on every tenant-scoped table and is enforced by
the repository layer on **both** read and write. MySQL has no row-level security, so this is
an application-level control and MUST be covered by an automated test per module proving that
a request in Company A's context returns zero rows from Company B.

**V0-BR-008 (M)** Data scope is resolved per user as a set of permitted company, branch, plant
and warehouse ids. Every list query intersects with that set. A user with no explicit scope
inherits their primary branch only — never "all".

**V0-BR-009 (M)** Cross-company reads are possible only with the `SYSTEM.CROSS_COMPANY_READ`
permission, only for reporting endpoints, and every such request is written to the audit log
with the companies accessed.

**V0-BR-010 (M)** Inter-company transactions (Company A's plant supplying Company B) MUST be
modelled as a real sale and a real purchase with matching documents — never as a stock
transfer. This preserves each company's statutory books.

### 7.7 Indexing and performance standards

**V0-DR-009 (M)** Every table MUST have, at minimum: PK on `id`, unique on `uid`, and an index
whose leading column is `company_id` for every access path used by a list screen.

**V0-DR-010 (M)** Transactional documents MUST index `(company_id, <document_date>, status)`
and `(company_id, document_no)`.

**V0-DR-011 (M)** Foreign keys are declared with `ON DELETE RESTRICT ON UPDATE CASCADE`.
Cascading deletes are forbidden — soft delete makes them meaningless and dangerous.

**V0-DR-012 (S)** Tables projected to exceed 50 million rows (`inv_stock_ledger`,
`core_audit_log`, `prd_production_entry`, `hrm_attendance`) MUST be range-partitioned by
month on their business date, with an automated partition-maintenance job.

**V0-DR-013 (M)** No query in a request path may scan more than 100,000 rows. Any list
endpoint MUST enforce a maximum page size (default 50, max 200) and MUST reject an unbounded
request. Exports above that limit run as background jobs.

### 7.8 Stock and ledger integrity

**V0-BR-011 (M)** `inv_stock_ledger` is **append-only and immutable**. Stock is never updated
in place. A correction is a new, opposite-signed entry referencing the original. Current stock
is a maintained balance table (`inv_stock_balance`) that MUST be reconcilable to the ledger by
a scheduled integrity job; any divergence raises a `CRITICAL` alert.

**V0-BR-012 (M)** Every stock movement MUST record: item, warehouse, bin, batch/lot, serial
(if serialised), quantity (signed), UOM, rate, value, movement type, source document type +
id + line, posting date, and posting timestamp.

**V0-BR-013 (M)** Negative stock is **rejected by default**. A company parameter may permit it
per warehouse for specific movement types; where permitted, every negative-stock event raises
an exception report entry.

**V0-BR-014 (M)** Postings into a **closed financial period** are rejected. Period close is
per module (inventory, purchase, sales, finance) and per company, with a documented reopen
procedure requiring `FINANCE.PERIOD.REOPEN` and an audit reason.

### 7.9 Concurrency

**V0-DR-014 (M)** All updates use optimistic locking on `version`. `version` increments on
every successful update. Mismatch returns `409` (see §8.7).

**V0-DR-015 (M)** Operations that must serialise — document number allocation, stock posting
against the same item+warehouse+batch, and financial period close — MUST take a Redis
distributed lock keyed to the contended resource, with a bounded wait (default 5 s) and an
explicit timeout error. Application-level locks are used in preference to long database
transactions.

**V0-DR-016 (M)** Database transactions MUST NOT span an external HTTP call. Statutory API
calls (e-invoice, e-way bill) happen **after** commit, driven by the outbox, and their result
is written back in a separate transaction.

---

## 8. API standards

### 8.1 Shape

**V0-IR-001 (M)** All APIs are REST over HTTPS, JSON, under `/api/v1`.

**V0-IR-002 (M)** Resources are plural nouns; identifiers in paths are always `uid`:

```
GET    /api/v1/purchase-orders                 list
POST   /api/v1/purchase-orders                 create (draft)
GET    /api/v1/purchase-orders/{uid}           read
PATCH  /api/v1/purchase-orders/{uid}           partial update
DELETE /api/v1/purchase-orders/{uid}           soft delete (draft only)
GET    /api/v1/purchase-orders/{uid}/items     sub-collection
```

**V0-IR-003 (M)** State transitions are POST sub-resources, never a PATCH on `status`:

```
POST /api/v1/purchase-orders/{uid}/submit
POST /api/v1/purchase-orders/{uid}/approve      body: { comments }
POST /api/v1/purchase-orders/{uid}/reject       body: { reason_code, comments }  (both required)
POST /api/v1/purchase-orders/{uid}/cancel       body: { reason_code, comments }
POST /api/v1/purchase-orders/{uid}/amend        → creates next revision, returns new uid
POST /api/v1/purchase-orders/{uid}/hold
POST /api/v1/purchase-orders/{uid}/close
```

Rationale: a transition is a business operation with its own permission, validation, side
effects and audit entry. Exposing it as a field update makes all four impossible to enforce.

**V0-IR-004 (M)** Every endpoint declares exactly one required permission via a FastAPI
dependency. An endpoint with no declared permission fails the build.

### 8.2 Versioning

**V0-IR-005 (M)** `/api/v1` is stable. Additive changes (new optional field, new endpoint, new
enum value **that clients are told to tolerate**) do not bump the version. Removing a field,
renaming, changing a type, or tightening validation requires `/api/v2` and a documented
6-month deprecation window with `Sunset` and `Deprecation` headers on v1.

### 8.3 Requests

**V0-IR-006 (M)** Required headers on every authenticated request:

| Header | Purpose |
|---|---|
| `Authorization: Bearer <jwt>` | Access token |
| `X-Company-Id` | Active company (ULID). Must be in the user's scope. |
| `X-Correlation-Id` | Client-supplied trace id; server generates if absent and always echoes |
| `Idempotency-Key` | Required on POST that creates or transitions a document |
| `If-Match` | Required on PATCH/PUT — carries the row `version` |

### 8.4 List responses

**V0-IR-007 (M)** Collections are enveloped; single resources are not:

```json
{
  "data": [ { "uid": "01J8…", "document_no": "PO/25-26/00042", "…": "…" } ],
  "meta": {
    "page": 1,
    "page_size": 50,
    "total": 1284,
    "total_pages": 26,
    "next_cursor": "eyJpZCI6MTIzfQ",
    "sort": "-po_date",
    "applied_filters": { "status": ["APPROVED"], "supplier_uid": "01J7…" }
  }
}
```

**V0-IR-008 (M)** High-volume collections (stock ledger, audit log, attendance, production
entries) MUST offer cursor pagination. Master lists MAY use offset pagination.

### 8.5 Filtering, sorting, field selection

**V0-IR-009 (M)** Filtering uses a whitelisted grammar; unknown fields or operators return
`400`, never a silently ignored filter:

```
?status=APPROVED,PARTIALLY_RECEIVED          in-list
?po_date__gte=2026-04-01&po_date__lte=2026-06-30
?supplier_uid=01J7…
?total_amount__gt=100000
?q=coil                                       full-text over the resource's declared search fields
?sort=-po_date,document_no                    '-' = descending
?fields=uid,document_no,po_date,total_amount  sparse fieldset
?include=supplier,items                       expand relations (whitelisted, depth 1)
```

Operators: `__eq __ne __gt __gte __lt __lte __in __nin __like __null __between`.
User input is **never** concatenated into SQL; the grammar maps to bound parameters.

### 8.6 Errors

**V0-IR-010 (M)** All errors use RFC 9457 `application/problem+json`:

```json
{
  "type": "https://erp.example.com/problems/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "3 fields failed validation",
  "instance": "/api/v1/purchase-orders",
  "correlation_id": "01J8XYZ…",
  "errors": [
    { "field": "items[0].quantity", "code": "must_be_positive", "message": "Quantity must be greater than zero" },
    { "field": "supplier_uid",      "code": "not_found",        "message": "Supplier not found or not active" },
    { "field": "items[2].rate",     "code": "exceeds_limit",    "message": "Rate exceeds last purchase rate by 24% (limit 15%)" }
  ]
}
```

**V0-IR-011 (M)** Standard problem types and status codes:

| Status | `type` slug | When |
|---|---|---|
| 400 | `malformed-request` | Unparseable body, bad filter grammar |
| 401 | `unauthenticated` | Missing/expired/invalid token |
| 403 | `forbidden` | Authenticated but lacks permission or data scope |
| 404 | `not-found` | Not found **or** outside the caller's scope (never distinguish — that leaks existence) |
| 409 | `concurrent-modification` | `version` mismatch; response includes current server state |
| 409 | `invalid-state-transition` | e.g. approving an already-cancelled document |
| 409 | `business-rule-violation` | Credit limit, negative stock, closed period, etc. Includes `rule_code`. |
| 422 | `validation-failed` | Field-level validation |
| 423 | `record-locked` | Another user holds an edit lock |
| 429 | `rate-limited` | Includes `Retry-After` |
| 503 | `dependency-unavailable` | Statutory/SMS/e-way bill gateway down; the operation is queued |

**V0-BR-015 (M)** Business-rule errors MUST carry a stable `rule_code` that maps to a
requirement id in this SRS, so support can trace any rejection to its specification.

### 8.7 Concurrency and idempotency

**V0-IR-012 (M)** `PATCH` without `If-Match` → `428 Precondition Required`. `If-Match` with a
stale version → `409 concurrent-modification`, with the current representation in the body so
the client can render a diff rather than silently discarding the user's work.

**V0-IR-013 (M)** `Idempotency-Key` is stored with the request fingerprint and the response for
24 hours. A replay with the same key and same fingerprint returns the stored response. Same
key with a *different* fingerprint returns `409 idempotency-key-reuse`. This is what makes
mobile retries over a flaky factory network safe.

### 8.8 Bulk and long-running operations

**V0-IR-014 (M)** Bulk endpoints accept up to 500 items and return per-item results with an
overall partial-success status:

```
POST /api/v1/purchase-orders/bulk-approve
→ 207 Multi-Status
{ "data": [ { "uid": "…", "status": "success" },
            { "uid": "…", "status": "error", "error": { "type": "…", "detail": "…" } } ],
  "meta": { "succeeded": 48, "failed": 2 } }
```

**V0-IR-015 (M)** Any operation that may exceed 5 seconds (MRP run, period close, payroll,
bulk import, export > 5,000 rows, BOM cost roll-up) MUST return `202 Accepted` with a job uid,
and progress MUST be observable:

```
GET /api/v1/jobs/{uid}
→ { "uid":"…", "type":"MRP_RUN", "status":"RUNNING", "progress_pct":42,
    "started_at":"…", "message":"Exploding BOM level 3 of 5",
    "result_url": null, "error": null }
```

### 8.9 File upload/download

**V0-IR-016 (M)** Uploads use pre-signed URLs — the file never transits the API process.
`POST /api/v1/attachments/presign` returns an upload URL and an attachment uid; the client
uploads directly to object storage, then confirms with
`POST /api/v1/attachments/{uid}/confirm`.

**V0-IR-017 (M)** Every upload is validated for MIME type against a per-entity whitelist,
size limit (default 25 MB, drawings 100 MB), and MUST be virus-scanned before the attachment
becomes visible. Downloads are served via short-lived (5 min) pre-signed URLs, and every
download is audited.

### 8.10 Rate limiting

**V0-IR-018 (M)** Default limits: 1,000 req/min per user, 100 req/min per IP for unauthenticated
endpoints, 10 login attempts per 15 min per account. Portal (supplier/customer) users get
200 req/min. Limits are configurable per company. Responses carry `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

## 9. Security standards

### 9.1 Authentication

**V0-NFR-005 (M)** Passwords are hashed with **Argon2id** (memory 64 MB, iterations 3,
parallelism 4). Never MD5/SHA/bcrypt-with-low-cost.

**V0-NFR-006 (M)** Access tokens are JWT RS256, TTL 15 minutes, carrying only `sub`, `company_id`,
`session_id`, `iat`, `exp`, `jti`. **Permissions are NOT in the token** — they are resolved
server-side from a Redis-cached snapshot, so a permission revocation takes effect within
60 seconds rather than at next token expiry.

**V0-NFR-007 (M)** Refresh tokens are opaque, DB-backed, single-use with rotation, TTL 12 hours
(configurable). Reuse of a consumed refresh token invalidates the entire session family and
raises a security alert — that pattern means the token was stolen.

**V0-NFR-008 (M)** MFA (TOTP) MUST be supported and MUST be enforceable per role. It is
mandatory by default for `SYS_ADMIN`, `CFO`, and any role holding a payment-release permission.

**V0-NFR-009 (S)** SSO via SAML 2.0 / OIDC MUST be supported for corporate identity providers.

**V0-BR-016 (M)** Account lockout after 5 consecutive failures within 15 minutes, for 30
minutes, with an alert to the security contact. Lockout state is never revealed to the caller
by a distinct message — the response is identical to a bad password, to prevent account
enumeration.

**V0-BR-017 (M)** Shop-floor kiosk/shared terminals MUST support a short-PIN or badge-scan
login bound to a device registration, with a 5-minute idle auto-lock. A shared terminal MUST
still attribute every transaction to an individual operator — never to a generic "shopfloor"
account.

### 9.2 Authorization

**V0-NFR-010 (M)** Three enforcement layers, all mandatory, all server-side:

```
  1. ACTION   →  Does this user hold PROCUREMENT.PO.APPROVE ?
  2. SCOPE    →  Is this PO's (company, branch, plant, warehouse) inside the user's data scope?
                 Plus row-level rules: "own records only", "own team", "own cost centre"
  3. FIELD    →  Which fields may this user SEE?  Which may they EDIT?
                 e.g. STORE_OPR sees a PO's items and quantities but not rate/amount/supplier terms
```

**V0-NFR-011 (M)** Field-level masking is applied during serialisation, not in the UI. A masked
field is omitted from the payload entirely (not sent as `null`, which is ambiguous), and the
response declares `meta.masked_fields` so the UI can show a "restricted" indicator.

**V0-NFR-012 (M)** Permission strings are `<MODULE>.<ENTITY>.<ACTION>`. Actions:
`VIEW · CREATE · EDIT · DELETE · SUBMIT · APPROVE · REJECT · CANCEL · AMEND · CLOSE · REOPEN · PRINT · EXPORT · IMPORT · POST · REVERSE`.
Wildcards (`PROCUREMENT.*.VIEW`) are permitted in role definitions but are expanded and stored
explicitly at grant time, so an audit of "who can approve POs" is a simple query.

### 9.3 Data protection

**V0-NFR-013 (M)** TLS 1.2+ in transit, everywhere, including internal service→DB where
supported. HSTS on all web endpoints.

**V0-NFR-014 (M)** At rest: MySQL InnoDB tablespace encryption; object storage
server-side encryption. Additionally, these columns are **application-level encrypted**
(AES-256-GCM, key from a KMS/vault, never in config files) because DB-level encryption does
not protect against a compromised DB read:

- Employee: PAN, Aadhaar, bank account number, salary components
- Supplier/Customer: bank account number, IFSC
- Any stored API credential, SMTP password, WhatsApp token, GSP credential

**V0-NFR-015 (M)** PII is **masked by default** in list views, exports and logs. Aadhaar shows
as `XXXX XXXX 1234`. Unmasking is a distinct permission and every unmask is audited with the
field and reason.

**V0-NFR-016 (M)** Secrets are never committed, never in environment files checked into VCS,
and never logged. Configuration comes from environment variables populated by a secret store.

### 9.4 Application security

**V0-NFR-017 (M)** OWASP Top 10 controls are mandatory:

| Risk | Control |
|---|---|
| Injection | Parameterised queries only. The filter grammar (§8.5) never builds SQL from user strings. |
| Broken access control | Every endpoint has a declared permission + object-level scope check. Tested per endpoint. |
| IDOR | ULIDs, plus a mandatory scope check on every object fetch. Out-of-scope returns 404, not 403. |
| XSS | React escapes by default; `dangerouslySetInnerHTML` is banned by lint rule. Strict CSP. |
| CSRF | Bearer tokens in `Authorization` header only — never cookies for the API. |
| SSRF | Outbound webhook/integration URLs validated against an allowlist; private IP ranges blocked. |
| Deserialisation | Pydantic strict mode; no `pickle` on untrusted input. |
| Components | `pip-audit` + `npm audit` in CI; build fails on High/Critical. |
| Logging/monitoring | Security events → dedicated stream with alerting. |
| SSRF/file upload | MIME sniffing (not trusting the declared type), extension allowlist, virus scan, files served from a separate origin. |

**V0-NFR-018 (M)** Security headers on all responses: `Content-Security-Policy`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy`.

---

## 10. The standard transaction document pattern

This section is the single most reused part of the SRS. Every transactional document in
Volumes 2–11 implements it. Domain volumes specify only their **deviations** from it.

### 10.1 Canonical lifecycle

```
                    ┌──────────┐
                    │  DRAFT   │◄──────────────────┐
                    └────┬─────┘                   │
                    submit│                        │ reopen (privileged)
                         ▼                         │
             ┌────────────────────┐  reject   ┌────┴─────┐
             │ PENDING_APPROVAL   ├──────────►│ REJECTED │
             └────────┬───────────┘           └──────────┘
                approve│
                       ▼
                 ┌──────────┐   hold      ┌──────────┐
                 │ APPROVED ├────────────►│ ON_HOLD  │
                 └────┬─────┘◄────release─└──────────┘
                      │
          ┌───────────┼────────────┐
          │           │            │
     execution   amend│       cancel│
          │           ▼            ▼
          │      ┌─────────┐  ┌───────────┐
          │      │ AMENDED │  │ CANCELLED │
          │      │ (rev n+1│  └───────────┘
          │      │  DRAFT) │
          │      └─────────┘
          ▼
  ┌────────────────┐        ┌───────────┐        ┌────────┐
  │ IN_PROGRESS /  ├───────►│ COMPLETED ├───────►│ CLOSED │
  │ PARTIALLY_*    │        └───────────┘        └────────┘
  └────────────────┘                                  ▲
          │                    short-close            │
          └───────────────────────────────────────────┘
```

| Status | Meaning | Editable | Reversible |
|---|---|---|---|
| `DRAFT` | Being prepared | Yes, fully | n/a |
| `PENDING_APPROVAL` | In workflow | No (recall to draft) | Recall |
| `APPROVED` | Authorised, effective | No — amend only | Cancel |
| `REJECTED` | Refused with reason | Reopen to draft | — |
| `ON_HOLD` | Temporarily suspended | No | Release |
| `IN_PROGRESS` / `PARTIALLY_RECEIVED` / `PARTIALLY_DELIVERED` | Partially executed | No | Short-close |
| `COMPLETED` | Fully executed | No | — |
| `CLOSED` | Financially/operationally closed | No | Reopen (privileged, audited) |
| `CANCELLED` | Voided with reason | No | — |
| `AMENDED` | Superseded by a later revision | No | — |

**V0-BR-018 (M)** Status transitions MUST be validated by an explicit state machine registered
per document type. An invalid transition returns `409 invalid-state-transition` naming the
current status and the allowed transitions.

**V0-BR-019 (M)** Amendment creates a **new revision record**, does not mutate the approved one.
The prior revision moves to `AMENDED` and remains fully retrievable. Revision numbering is
`R0, R1, R2…`; the document number is unchanged and the revision is a separate field. A diff
view between any two revisions is mandatory.

**V0-BR-020 (M)** Amendment of a partially executed document MUST NOT permit reducing a
quantity below what has already been executed against that line.

**V0-BR-021 (M)** Cancellation requires a reason code from `mst_reason_code` scoped to that
document type, plus free-text comments when the reason is flagged `requires_comment`. A
document with downstream execution (GRN against PO, dispatch against SO) cannot be cancelled —
it must be short-closed.

**V0-BR-022 (M)** Short-close closes the remaining open quantity with a reason, releases
reservations and commitments, and is a separate permission from cancel.

### 10.2 Mandatory capabilities per document

**V0-FR-001 (M)** Every transaction document MUST provide all of:

| # | Capability | Implementation |
|---|---|---|
| 1 | Configurable document number | `core_number_series` (§11) |
| 2 | Attachments | `core_attachment` — polymorphic `(entity_type, entity_id)` |
| 3 | Comment / remarks thread with @mention | `core_comment` — same polymorphic key |
| 4 | Approval workflow | `core_workflow_instance` (Vol 1 §4) |
| 5 | Full audit trail | `core_audit_log` (§12) |
| 6 | Domain events on every state change | `core_event_outbox` (§18) |
| 7 | Print / PDF from a configurable template | Template engine (§14.4) |
| 8 | Export (Excel / PDF / CSV) | Export engine (§14) |
| 9 | Amendment with revision history and diff | §10.1 |
| 10 | Cancellation with mandatory reason code | §10.1 |
| 11 | Optimistic locking | `version` column (§7.9) |
| 12 | Tags and user-defined fields | `core_tag`, `core_udf_value` |
| 13 | Related-document navigation ("document flow") | `core_document_link` |
| 14 | Activity timeline | Derived from audit + workflow + comments |

**V0-FR-002 (M)** `core_document_link` records the traceability graph — quotation → sales order
→ production order → work order → packing → challan → invoice, and PR → RFQ → quote → PO → GRN
→ invoice → payment. A "document flow" view MUST be reachable from any document, showing
upstream and downstream documents with status.

### 10.3 Header/line structure

**V0-DR-017 (M)** Documents follow a header + line structure. The header carries party, dates,
currency, totals, status, workflow and audit; lines carry item, quantity, rate, tax, and
line-level references. Financial totals on the header are **derived and stored**, recomputed
on every line change inside the same transaction, and validated by a nightly integrity job.

### 10.4 Standard tax computation

**V0-BR-023 (M)** Tax is computed per line, then summarised per tax code at the header. Indian
GST rules: intra-state → CGST + SGST; inter-state → IGST; union territory → CGST + UTGST. The
determination uses **place of supply vs supplier state**, not the billing address, per GST law.
Reverse charge, TCS on sale of goods (206C(1H)), and TDS on purchase (194Q) are configurable
and mutually exclusive per transaction — the system MUST prevent both applying simultaneously.

**V0-BR-024 (M)** Standard line calculation sequence, applied in this exact order:

```
1.  gross_amount        = quantity × rate
2.  discount_amount     = discount_pct applied to gross, or absolute discount
3.  taxable_before_charges = gross_amount − discount_amount
4.  + line-apportioned header charges (freight, insurance, packing) — apportioned by
      value, weight, or quantity per the charge's configured basis
5.  − line-apportioned header discount
6.  taxable_amount      = result of 3–5
7.  tax_amount          = Σ over applicable tax components of (taxable_amount × rate)
                          (cess and compensation cess computed on their declared base)
8.  line_total          = taxable_amount + tax_amount
9.  header round_off    = round(Σ line_total) − Σ line_total
10. grand_total         = Σ line_total + round_off
```

Every one of these steps MUST be independently unit-tested with worked examples supplied in
the domain volume.

---

## 11. Document numbering standard

**V0-FR-003 (M)** Every document number comes from the configurable numbering engine. No
module may implement its own sequence.

### 11.1 Series definition

A series is defined per **(company, branch, document type, financial year)** with an optional
additional discriminator (e.g. plant, warehouse, or transaction sub-type such as
`GST_INVOICE` vs `DELIVERY_CHALLAN`).

```
Format string tokens:
  {PREFIX}    literal configured prefix        e.g. "PO"
  {COMPANY}   company short code               e.g. "SSB"
  {BRANCH}    branch short code                e.g. "CHN"
  {PLANT}     plant short code                 e.g. "P1"
  {DOCTYPE}   document type short code         e.g. "PO"
  {FY}        financial year                   e.g. "25-26"
  {FYYY}      FY start 4-digit                 e.g. "2025"
  {YY} {YYYY} calendar year
  {MM}        month  {DD} day
  {SEQ:n}     zero-padded sequence, width n    e.g. {SEQ:5} → 00042
  {SUFFIX}    literal suffix
  {SEP}       configured separator (default "/")
```

Examples:

| Document | Format | Result |
|---|---|---|
| Purchase Order | `{PREFIX}{SEP}{FY}{SEP}{SEQ:5}` | `PO/25-26/00042` |
| GRN | `{PLANT}{SEP}{PREFIX}{SEP}{FY}{SEP}{SEQ:5}` | `P1/GRN/25-26/00317` |
| Tax Invoice | `{BRANCH}{PREFIX}{FY}{SEQ:4}` | `CHNINV25-2600189` |
| Production Order | `{PREFIX}{SEP}{YY}{MM}{SEP}{SEQ:4}` | `PRD/2607/0128` |
| Batch | `{PREFIX}{YY}{MM}{DD}{SEQ:3}` | `B260728014` |

### 11.2 Rules

**V0-BR-025 (M)** Numbers are allocated under a distributed lock and MUST be gapless within a
series for statutory documents (tax invoice, credit note, debit note, e-way bill, delivery
challan). For those, the number is allocated **at approval/posting time, not at draft
creation**, because a gap in an invoice series is a GST compliance defect.

**V0-BR-026 (M)** For non-statutory documents (PR, RFQ, production order, work order), the
number may be allocated at draft creation and gaps are acceptable. This is a per-document-type
configuration (`allocate_on: DRAFT | APPROVAL`).

**V0-BR-027 (M)** A used number is never reused, even if the document is cancelled. Cancelled
statutory documents retain their number and appear in returns as cancelled.

**V0-BR-028 (M)** Series reset behaviour is configurable: `NEVER | YEARLY | FINANCIAL_YEARLY |
MONTHLY | DAILY`. Financial-year series MUST roll over automatically at the configured FY
start, and the system MUST warn 30 days before a series exhausts its sequence width.

**V0-BR-029 (M)** Manual override of a document number requires the
`SYSTEM.NUMBERING.OVERRIDE` permission, is blocked for statutory series, must be unique, and
is audited.

### 11.3 Data model

```sql
core_number_series
  id, uid, company_id, branch_id NULL, plant_id NULL,
  document_type       VARCHAR(50)   -- 'PURCHASE_ORDER', 'GRN', 'TAX_INVOICE', …
  sub_type            VARCHAR(50) NULL
  series_name         VARCHAR(100)
  format_string       VARCHAR(200)
  prefix              VARCHAR(20) NULL
  suffix              VARCHAR(20) NULL
  separator           VARCHAR(5) DEFAULT '/'
  start_number        BIGINT UNSIGNED DEFAULT 1
  current_number      BIGINT UNSIGNED DEFAULT 0
  increment_by        INT UNSIGNED DEFAULT 1
  padding_width       TINYINT UNSIGNED DEFAULT 5
  reset_frequency     VARCHAR(20)   -- NEVER|YEARLY|FINANCIAL_YEARLY|MONTHLY|DAILY
  last_reset_on       DATE NULL
  financial_year_id   BIGINT UNSIGNED NULL
  allocate_on         VARCHAR(20)   -- DRAFT | APPROVAL
  is_gapless          TINYINT(1) DEFAULT 0
  is_statutory        TINYINT(1) DEFAULT 0
  is_default          TINYINT(1) DEFAULT 0
  is_active           TINYINT(1) DEFAULT 1
  valid_from          DATE, valid_to DATE NULL
  <standard columns>
  UNIQUE KEY uk_series (company_id, branch_id, plant_id, document_type, sub_type,
                        financial_year_id, deleted_key)

core_number_allocation      -- audit of every number issued (gapless proof)
  id, uid, series_id, allocated_number BIGINT, formatted_number VARCHAR(100),
  entity_type VARCHAR(50), entity_id BIGINT NULL, allocated_at DATETIME(6),
  allocated_by BIGINT, status VARCHAR(20)  -- ALLOCATED | CONSUMED | VOIDED
  UNIQUE KEY uk_alloc (series_id, allocated_number)
```

---

## 12. Audit and compliance standard

**V0-FR-004 (M)** Every create, update, submit, approve, reject, cancel, amend, close, reopen,
delete, print, export, login, logout, failed-login, permission-change and configuration-change
is written to `core_audit_log`.

### 12.1 Data model

```sql
core_audit_log                                   -- APPEND ONLY
  id           BIGINT UNSIGNED AUTO_INCREMENT PK
  uid          CHAR(26) NOT NULL
  company_id   BIGINT UNSIGNED NOT NULL
  entity_type  VARCHAR(80)  NOT NULL     -- 'prc_purchase_order'
  entity_id    BIGINT UNSIGNED NULL
  entity_uid   CHAR(26) NULL
  document_no  VARCHAR(100) NULL         -- denormalised: survives even if row is purged
  action       VARCHAR(30)  NOT NULL     -- CREATE|UPDATE|DELETE|SUBMIT|APPROVE|REJECT|
                                         -- CANCEL|AMEND|CLOSE|REOPEN|PRINT|EXPORT|
                                         -- LOGIN|LOGOUT|LOGIN_FAILED|PERMISSION_CHANGE|
                                         -- CONFIG_CHANGE|UNMASK|DOWNLOAD
  changes      JSON NULL                 -- [{field, old, new}] — CHANGED FIELDS ONLY
  reason_code  VARCHAR(50) NULL
  comments     TEXT NULL
  user_id      BIGINT UNSIGNED NOT NULL
  user_name    VARCHAR(150) NOT NULL     -- denormalised snapshot
  role_code    VARCHAR(50) NULL
  ip_address   VARCHAR(45) NULL
  user_agent   VARCHAR(500) NULL
  channel      VARCHAR(20)               -- WEB|MOBILE|API|PORTAL|SYSTEM|IMPORT|JOB
  correlation_id CHAR(26) NULL
  created_at   DATETIME(6) NOT NULL
  KEY ix_audit_entity (company_id, entity_type, entity_id, created_at)
  KEY ix_audit_user   (company_id, user_id, created_at)
  KEY ix_audit_action (company_id, action, created_at)
  KEY ix_audit_doc    (company_id, document_no)
  -- PARTITION BY RANGE on created_at, monthly
```

### 12.2 Rules

**V0-BR-030 (M)** Audit rows are immutable. The application database user MUST NOT hold
`UPDATE` or `DELETE` privilege on `core_audit_log`. Enforced at the MySQL grant level, not by
application discipline.

**V0-BR-031 (M)** `changes` records only fields that actually changed, with before and after
values. Unchanged fields are omitted — a full row snapshot per update makes the log unusable
and unaffordable.

**V0-BR-032 (M)** Secrets, passwords, tokens and full bank/card numbers MUST NOT appear in
`changes`. Such fields are recorded as `{"field":"password","old":"***","new":"***"}`.

**V0-BR-033 (M)** Audit retention is 8 years minimum (Indian statutory books retention),
configurable upward. Rows older than the online window (default 24 months) are moved to cold
archive storage but MUST remain queryable through the same UI with a latency warning.

**V0-BR-034 (M)** The audit viewer supports filtering by entity, document number, user, action,
date range and correlation id, and MUST reconstruct the full change history of any document as
a timeline. Audit log access requires `SYSTEM.AUDIT.VIEW`; viewing other users' actions
requires `SYSTEM.AUDIT.VIEW_ALL`.

**V0-BR-035 (M)** Reading the audit log is itself audited when it covers other users' activity.

---

## 13. Notification standard

**V0-FR-005 (M)** A single notification framework serves all modules across in-app, email,
SMS, WhatsApp and mobile push. Modules raise **events**; they never call a mail library.

### 13.1 Architecture

```
Domain event ──► Notification rule matcher ──► Recipient resolver ──► Template renderer
                        │                            │                       │
                 (event type,               (role, user, dynamic:      (per channel,
                  conditions,                requester/approver/        per language)
                  company)                   supplier contact/
                                             customer contact)
                                                     │
                                                     ▼
                                       Channel dispatcher (Celery)
                        ┌──────────┬──────────┬──────────┬──────────┐
                        ▼          ▼          ▼          ▼          ▼
                     In-app     Email       SMS      WhatsApp     Push
                        │          │          │          │          │
                        └──────────┴──────────┴──────────┴──────────┘
                                        │
                             Delivery status tracking + retry
```

### 13.2 Rules

**V0-BR-036 (M)** Notification rules are configurable per company without code: event type,
optional condition expression, recipient rule, channel set, template, and an active flag.

**V0-BR-037 (M)** Recipients may be resolved statically (a named user or role) or dynamically
(`DOCUMENT_CREATOR`, `CURRENT_APPROVER`, `NEXT_APPROVER`, `SUPPLIER_CONTACT`,
`CUSTOMER_CONTACT`, `DEPARTMENT_HEAD`, `REPORTING_MANAGER`, `MACHINE_OWNER`,
`ITEM_PLANNER`).

**V0-BR-038 (M)** Templates support variable substitution, are versioned, previewable with
sample data, and exist per channel and per language. A template referencing an undefined
variable fails validation at save time, not at send time.

**V0-BR-039 (M)** Every send attempt is logged with status
(`QUEUED|SENT|DELIVERED|READ|FAILED|BOUNCED`), provider message id, and error. Failures retry
with exponential backoff (1 m, 5 m, 15 m, 1 h, 4 h) up to 5 attempts, then raise an alert.

**V0-BR-040 (M)** Users control their own preferences per notification category and channel,
except **mandatory** categories (approval requests assigned to them, security alerts, statutory
deadlines) which cannot be disabled.

**V0-BR-041 (M)** Digest mode: users may opt to receive non-urgent notifications as a
scheduled digest (hourly/daily) instead of individually. Urgent categories bypass digesting.

**V0-BR-042 (M)** WhatsApp messages MUST use pre-approved Business API templates; the system
MUST track template approval status and MUST NOT attempt to send with an unapproved template.

**V0-BR-043 (M)** Quiet hours are configurable per company; SMS/WhatsApp/push suppressed during
quiet hours except for categories marked `CRITICAL` (machine breakdown, safety, security).

### 13.3 Standard notification catalogue (framework-level)

| Event category | Default channels | Urgency |
|---|---|---|
| Approval pending — assigned to you | In-app, Email, Push | High |
| Approval approved / rejected | In-app, Email | Normal |
| Approval escalation (SLA breach) | In-app, Email, SMS | High |
| Delegation started / ended | In-app, Email | Normal |
| Document cancelled | In-app, Email | Normal |
| Reorder level breached | In-app, Email | High |
| Stock-out / negative stock | In-app, Email, SMS | Critical |
| Machine breakdown reported | In-app, Push, SMS | Critical |
| QC rejection above threshold | In-app, Email, SMS | High |
| Order due date at risk | In-app, Email | High |
| Payment / receipt overdue | In-app, Email | Normal |
| Statutory deadline (GSTR, TDS) | In-app, Email | High |
| Security: new device login, password change, MFA reset | Email, SMS | Critical |
| Batch/job failure (MRP, payroll, e-invoice) | In-app, Email | High |
| Document expiry (licence, AMC, calibration, insurance) | In-app, Email | Normal |

---

## 14. Reporting and export standard

**V0-FR-006 (M)** Every transaction in the system has, at minimum, these report variants:

| Variant | Content |
|---|---|
| **Summary** | Aggregated by the natural grouping dimension (party, item, period, plant) |
| **Detail** | Line-level, every field, with drill-through to the source document |
| **Pending** | Open/unexecuted balance — what is outstanding and by how much |
| **Ageing** | Bucketed by age: 0–30, 31–60, 61–90, 91–180, >180 days (buckets configurable) |
| **Exception** | Violations, overrides, negative stock, rate variance, delayed, unapproved |
| **MIS** | Management view with trend, comparison to plan/budget/last period, and variance % |
| **Pivot** | User-configurable cross-tab with drag-and-drop dimensions and measures |

### 14.1 Common capabilities

**V0-RPT-001 (M)** Every report MUST support: date-range and company/branch/plant/warehouse
filters, multi-select on all dimension filters, column chooser, sorting, grouping with
subtotals, drill-down to source document, saved views (private and shared), and scheduled
delivery by email on a cron expression.

**V0-RPT-002 (M)** Export formats: **Excel (.xlsx)** with formatting, freeze panes and
auto-filter; **PDF** with company letterhead, filters printed in the header, and page
numbering; **CSV** raw; and **Print** view. Exports respect the caller's field-level
permissions — a masked field is masked in the export.

**V0-RPT-003 (M)** Every export is audited (report, filters, row count, format, user).

**V0-RPT-004 (M)** Exports over 5,000 rows run as a background job and are delivered as a
download link, not a blocking response.

**V0-RPT-005 (M)** Reports run against the **read replica** where one exists, never against
the primary, and are subject to a query timeout (default 60 s) after which the user is offered
the background-job path.

**V0-RPT-006 (M)** Every report displays: report name, filters applied, generated-at timestamp
with timezone, generated-by user, and page numbers. A printed report without its filter
context is unusable as evidence.

**V0-BR-044 (M)** Financial and statutory reports MUST be reproducible: running the same report
for the same past period MUST return identical figures regardless of when it is run, unless a
back-dated entry was legitimately posted — in which case the report MUST indicate that
back-dated entries exist in the period.

### 14.2 Report engine

**V0-RPT-007 (S)** A metadata-driven report builder allows an administrator to define a new
report (data source view, dimensions, measures, filters, default layout) without code, subject
to `SYSTEM.REPORT.DESIGN`. Generated reports inherit all standard capabilities above.

### 14.3 Print templates

**V0-RPT-008 (M)** Print templates are HTML+CSS, versioned, per company and per document type,
editable in-app by an administrator with a live preview against a sample document. Templates
support company letterhead, digital signature image, terms and conditions blocks, QR codes,
and multi-language.

**V0-BR-045 (M)** Statutory documents (tax invoice, credit note, debit note, delivery challan,
e-way bill) MUST have their mandatory-field layouts locked — an administrator may restyle them
but MUST NOT remove a statutorily required field. Template validation enforces the required
field set per document type.

---

## 15. Barcode and QR code standard

**V0-FR-007 (M)** Barcode and QR identification is used end to end. Scanning is a first-class
input method on every stock-touching screen, not an add-on.

### 15.1 Symbology by object

| Object | Symbology | Encoded payload | Label |
|---|---|---|---|
| Raw material lot (SS coil) | Code 128 + QR | `RM|{item_code}|{lot_no}|{heat_no}|{grade}|{thickness}|{width}|{weight_kg}|{grn_no}` | Coil tag, weatherproof |
| Raw material bin/pallet | Code 128 | `LOC|{warehouse}|{zone}|{bin}` | Rack label |
| Blank / cut piece batch | QR | `WIP|{item_code}|{batch_no}|{qty}|{parent_lot}` | Bin card |
| WIP travel card (per production order) | QR | `PO|{production_order_no}|{operation_seq}` | Job card |
| Semi-finished body | QR | `SF|{item_code}|{batch_no}|{prod_order_no}|{op_seq}` | Trolley/bin card |
| Finished bottle (serialised SKUs only) | QR / DataMatrix | `FG|{sku}|{serial_no}|{batch_no}|{mfg_date}` | On-product or on inner box |
| Inner box | Code 128 + QR | `IB|{sku}|{batch_no}|{qty}|{box_no}` | Box label |
| Carton | GS1-128 / SSCC-18 | GS1 AIs: `(00)`SSCC `(01)`GTIN `(10)`batch `(11)`mfg date `(37)`count | Carton label |
| Pallet | GS1-128 / SSCC-18 | SSCC + contained carton list | Pallet placard |
| Container (export) | QR | `CN|{container_no}|{seal_no}|{shipment_no}` | Container manifest |
| Dispatch / challan | QR | Verifiable URL: `https://…/verify/{challan_uid}` | Challan print |
| Tax invoice | QR | **GST e-invoice signed QR (IRN payload) — statutory format, unmodifiable** | Invoice print |
| Asset / machine | Code 128 + QR | `AST|{asset_code}` | Asset plate |
| Employee ID | Code 128 | `EMP|{employee_code}` | ID card |
| Tool / die | QR | `TL|{tool_code}|{last_service_date}` | Tool tag |

### 15.2 Rules

**V0-BR-046 (M)** Payloads use `|` as separator and begin with a **2–3 character type prefix**
so a single scan input box can route the scan to the correct handler without the user
selecting a mode. This is the single biggest usability factor on a shop floor.

**V0-BR-047 (M)** QR payloads carry a version prefix (`v1|`) so the format can evolve without
breaking previously printed labels. Printed labels live for years; the parser MUST support
every version ever issued.

**V0-BR-048 (M)** Every scannable code MUST be resolvable to its object by a single API call:
`GET /api/v1/scan/resolve?code=<raw>` returns `{ object_type, uid, summary, allowed_actions }`.
The client renders context-appropriate actions from `allowed_actions` — the server decides
what the user may do with the scanned object, never the client.

**V0-BR-049 (M)** Labels print to thermal printers as **native ZPL/EPL** over TCP 9100 or via a
local print agent. PDF-to-thermal is not acceptable — it breaks alignment and barcode density.
Label templates are configurable per company, per object type, per label stock size.

**V0-BR-050 (M)** A reprint of any label is audited with reason, and the reprinted label is
visually marked `REPRINT` where the object is a controlled item (batch, carton, pallet), to
prevent duplicate goods movements from a duplicated label.

**V0-BR-051 (M)** GS1 identifiers (GTIN, SSCC) are only used where the company holds a valid
GS1 prefix; the prefix is company master configuration. Where absent, internal formats are used
and the system MUST NOT emit an invalid GS1 structure.

**V0-BR-052 (M)** Scanning MUST be idempotent and MUST reject a duplicate scan of the same
unique object into the same document with a clear message ("Carton CTN000123 already added to
this loading sheet"), rather than silently adding a second line.

---

## 16. UI/UX standard and screen archetypes

### 16.1 Global layout

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ☰  SSB ERP     [Company ▼] [Branch ▼] [Plant ▼] [FY 25-26 ▼]   🔍 Global search        │
│                                              🔔 12   ✔ 5 approvals   👤 Ravi K ▼       │
├──────────────┬─────────────────────────────────────────────────────────────────────────┤
│              │  Home ▸ Procurement ▸ Purchase Orders ▸ PO/25-26/00042      ⭐ 🕘 ❓     │
│  ▸ Dashboard ├─────────────────────────────────────────────────────────────────────────┤
│  ▾ CRM       │                                                                          │
│    Leads     │                                                                          │
│    Quotes    │                        PAGE CONTENT                                      │
│  ▾ Procure   │                                                                          │
│    Indent    │                                                                          │
│    RFQ       │                                                                          │
│    PO        │                                                                          │
│  ▸ Inventory │                                                                          │
│  ▸ Production│                                                                          │
│  ▸ Quality   │                                                                          │
│  ▸ Dispatch  │                                                                          │
│  ▸ Finance   │                                                                          │
│  ▸ Reports   │                                                                          │
│  ▸ Setup     │                                                                          │
└──────────────┴─────────────────────────────────────────────────────────────────────────┘
```

**V0-UIR-001 (M)** The company/branch/plant/FY context selector is always visible and always
governs what the screen shows. Changing it reloads context and warns about unsaved work.

**V0-UIR-002 (M)** Global search (`Ctrl+/`) searches across document numbers, party names, item
codes and batch numbers, scoped by permission, and supports a scanned barcode as input.

**V0-UIR-003 (M)** The approvals counter in the header is a live count of items awaiting the
user's action, and is the single entry point to a unified approvals inbox spanning all modules.

### 16.2 Screen archetypes

Every screen in the product is one of seven archetypes. Do not invent an eighth without an ADR.

#### A. List / Grid screen

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Purchase Orders                                       [ + New PO ]  [Import] [⋮]      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Search…      [Status ▼] [Supplier ▼] [Date range ▼] [More filters ▼]  [Saved: All▼] │
│ Applied: Status = Pending Approval, Approved  ✕      [Clear all]      ⚙ Columns  ⟳     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [ ] │ PO No.        │ Date      │ Supplier      │ Value      │ Status   │ Due   │ ⋮    │
│ [x] │ PO/25-26/0042 │ 12-Jul-26 │ Jindal Steel  │ 12,45,000  │ ⚑Approved│ 20-Jul│ ⋮    │
│ [x] │ PO/25-26/0041 │ 11-Jul-26 │ Suraj Poly    │  1,08,500  │ ⚑Pending │ 25-Jul│ ⋮    │
│ [ ] │ PO/25-26/0040 │ 10-Jul-26 │ Coat Tech     │    89,200  │ ⚑Partial │ 18-Jul│ ⋮    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2 selected  →  [Approve] [Reject] [Print] [Export ▼] [Cancel]              ✕ Clear      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Showing 1–50 of 1,284      [◀ Prev] 1 2 3 … 26 [Next ▶]     Rows: [50 ▼]               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**V0-UIR-004 (M)** Every list screen provides: server-side search/filter/sort, column chooser
with persistence per user, saved views (private + shared), row selection with a bulk-action
bar, inline row actions menu, export, and keyboard navigation (arrows to move, `Enter` to open,
`Space` to select).

**V0-UIR-005 (M)** Applied filters are always displayed as removable chips. A user must never
be confused about why a record is missing from a list.

#### B. Form / Entry screen (header + lines)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Purchase Order — New                            [Save Draft] [Submit for Approval]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Document ─────────────────────────┐ ┌─ Supplier ──────────────────────────────────┐ │
│ │ PO No.    (auto)                   │ │ Supplier *  🔍 Jindal Steel Ltd             │ │
│ │ PO Date * [12-Jul-2026 ▼]          │ │ Contact     Mr. A. Sharma  · 98xxxxxx12     │ │
│ │ Type *    (•) Standard ( ) Blanket │ │ GSTIN       33AABCJ1234K1ZP                 │ │
│ │           ( ) Subcontract          │ │ Payment     30 days from invoice            │ │
│ │ Plant *   [Plant 1 ▼]              │ │ Credit      ₹50,00,000 · Used ₹12,40,000    │ │
│ │ Ref PR    PR/25-26/00311           │ │ Rating      ★★★★☆  4.2  · On-time 92%       │ │
│ └────────────────────────────────────┘ └─────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Items (3)   │ Charges │ Terms │ Attachments (2) │ Comments │ Approvals │ History       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ # │ Item          │ Spec         │ Qty    │ UOM│ Rate   │ Disc│ Tax  │ Amount    │ ⋮   │
│ 1 │ SS304 Coil    │ 0.5mm×400mm  │ 5,000  │ KG │ 245.00 │  2% │18%GST│ 14,15,700 │ ⋮   │
│ 2 │ Silicone Ring │ 68mm food gr │ 20,000 │ NOS│   3.20 │   - │18%GST│    75,520 │ ⋮   │
│ 3 │ Carton 5-ply  │ 400×300×250  │  1,200 │ NOS│  38.00 │   - │12%GST│    51,072 │ ⋮   │
│   │ [+ Add line]  [Import from Excel]  [Copy from PR]                               │   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                             Taxable      13,58,300                     │
│                                             CGST+SGST     1,84,000                     │
│                                             Freight          20,000                    │
│                                             Round off            −8                    │
│                                             GRAND TOTAL   15,62,292                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ Line 1 rate is 24% above last purchase rate (₹198.00 on 02-Jun-26). Justification    │
│   required.                                                       [ Add justification ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**V0-UIR-006 (M)** Header/line documents use this layout: header cards on top, tabbed sections
(Items, Charges, Terms, Attachments, Comments, Approvals, History), an always-visible totals
panel, and a validation/warning strip at the bottom.

**V0-UIR-007 (M)** Line grids support keyboard-only entry: `Tab`/`Shift+Tab` between cells,
`Enter` to commit and create the next line, `Ctrl+D` to duplicate the previous line,
`Ctrl+Delete` to remove. Data-entry staff will not use a mouse and the design must not require
one.

**V0-UIR-008 (M)** Validation is inline and immediate at field level; blocking errors are
summarised at the bottom with links that focus the offending field. Never show only a toast
for a validation failure on a 40-field form.

**V0-UIR-009 (M)** Drafts autosave every 30 seconds and on blur. Navigating away with unsaved
changes prompts. A crashed session restores the draft.

**V0-UIR-010 (M)** Warnings (soft) and errors (hard) are visually distinct. A warning that
requires justification captures that justification and stores it against the document — this is
the mechanism by which price-variance and credit-limit overrides become auditable.

#### C. Detail / View screen

**V0-UIR-011 (M)** Read-only view with status badge, action bar driven by `allowed_actions`
from the server, tabbed detail, right-hand rail showing approval progress, document flow
(upstream/downstream links), and an activity timeline merging audit entries, workflow events
and comments.

#### D. Wizard

**V0-UIR-012 (M)** Multi-step processes (MRP run, period close, payroll, physical count,
company setup) use a stepper with explicit validation per step, back navigation without data
loss, and a final confirmation summary before commit.

#### E. Board / Kanban

**V0-UIR-013 (S)** Used for opportunity pipeline, production order status, maintenance jobs,
and NCR/CAPA tracking. Drag between columns triggers the corresponding state transition and
its full validation — a drag is not a shortcut around the state machine.

#### F. Dashboard

**V0-UIR-014 (M)** Widget grid, drag-to-rearrange, per-role default layout, per-user
customisation, each widget drilling through to its source list or report with the same filters
carried across.

#### G. Report viewer

**V0-UIR-015 (M)** Filter panel, results grid with grouping/subtotals, chart toggle where
meaningful, export bar, and save-view/schedule actions.

### 16.3 Interaction standards

**V0-UIR-016 (M)** Keyboard shortcuts, globally consistent:

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `Ctrl+S` | Save draft | | `Ctrl+/` | Global search |
| `Ctrl+Enter` | Submit | | `Alt+N` | New record |
| `Esc` | Cancel / close dialog | | `F2` | Edit current |
| `Ctrl+P` | Print | | `Alt+←` | Back |
| `F9` | Open scanner input | | `?` | Shortcut help |

**V0-UIR-017 (M)** Destructive or irreversible actions (cancel, reject, delete, post, close
period) require an explicit confirmation dialog that names the object and, where mandated,
captures a reason code. No destructive action fires from a single unconfirmed click.

**V0-UIR-018 (M)** All dates display per the user's configured format (default `dd-MMM-yyyy`) —
never ambiguous `dd/mm` vs `mm/dd`. All amounts display in the Indian numbering system
(`12,45,678.00`) when the base currency is INR, per the company's locale setting.

**V0-UIR-019 (M)** Status is never conveyed by colour alone. Every status badge carries text
and, where space allows, an icon (WCAG 2.1 AA).

**V0-UIR-020 (M)** Loading states use skeletons, not spinners, on list and detail screens.
Any action exceeding 400 ms shows progress; exceeding 5 s moves to the background-job pattern
(§8.8) with a notification on completion.

### 16.4 Responsive and device standards

**V0-UIR-021 (M)** Breakpoints: desktop ≥1280 px (primary), tablet 768–1279 px (supervisor
and QC screens must be fully usable), mobile <768 px (web is read-only/approval-only; data
entry is the native app's job).

**V0-UIR-022 (M)** Shop-floor and store screens MUST be usable on a 10" tablet with gloves:
minimum 44×44 px touch targets, minimum 16 px body text, high contrast, and no hover-dependent
interactions.

**V0-UIR-023 (M)** Browser support: last two major versions of Chrome, Edge and Firefox. IE is
not supported.

### 16.5 Design tokens

**V0-UIR-024 (M)** Colour, spacing, radius and typography are defined once as Tailwind theme
tokens. Semantic status colours are fixed product-wide:

| Semantic | Use |
|---|---|
| `draft` (slate) | Draft, not yet submitted |
| `pending` (amber) | Awaiting approval / action |
| `success` (emerald) | Approved, completed, passed, in-tolerance |
| `progress` (blue) | In progress, partially executed |
| `danger` (red) | Rejected, failed, cancelled, out-of-tolerance, overdue |
| `neutral` (grey) | Closed, inactive, superseded |
| `warning` (orange) | Hold, at-risk, near-threshold |

---

## 17. Mobile application standard

**V0-FR-008 (M)** The mobile app targets shop-floor, stores, quality, dispatch and approvals —
not full ERP data entry. Its design constraint is that the factory floor has poor connectivity,
gloved hands, and users who will not tolerate more than a few taps per transaction.

### 17.1 Scope

| Function | Offline-capable |
|---|---|
| Material receipt (GRN entry against PO, by scan) | Yes — queue |
| Material issue / return to production | Yes — queue |
| Bin-to-bin stock transfer | Yes — queue |
| Production entry / operation confirmation | Yes — queue |
| Downtime and breakdown reporting | Yes — queue |
| QC inspection entry with photo capture | Yes — queue |
| Packing: carton/pallet build by scan | Yes — queue |
| Dispatch loading confirmation and POD capture | Yes — queue |
| Attendance punch (with geofence) | Yes — queue |
| Approvals inbox and approve/reject | **No — online only** |
| Stock enquiry, order status, dashboards | No — online only (cached read) |
| Notifications | Push |

**V0-BR-053 (M)** Approvals MUST NOT be performed offline. An approval is an authorisation
against server-side state (budget, credit limit, stock) that cannot be validated on a stale
local cache.

### 17.2 Offline and sync

**V0-BR-054 (M)** Offline-capable transactions are written to a local SQLite outbox with a
client-generated ULID, then synced when connectivity returns. The ULID doubles as the
`Idempotency-Key`, so a retried sync can never create a duplicate.

**V0-BR-055 (M)** Sync is FIFO per device and stops at the first hard failure for that entity
chain, so dependent transactions cannot be applied out of order. The user is shown a clear
queue with per-item status and a resolution path for rejected items.

**V0-BR-056 (M)** Reference data (items, warehouses, bins, open POs/production orders, active
employees) is cached locally with a delta-sync endpoint and a configurable TTL (default 4
hours). The app warns when cached master data is stale.

**V0-BR-057 (M)** Conflicts are surfaced to the user with both versions and an explicit
resolution choice. The app MUST NOT silently overwrite server state.

**V0-BR-058 (M)** The offline queue is encrypted at rest on the device, and is purged on
logout or after a configurable retention (default 7 days) once successfully synced.

### 17.3 Device and UX

**V0-UIR-025 (M)** Scan-first design: every transaction screen opens with the camera/hardware
scanner active. Manual entry is the fallback, never the default path.

**V0-UIR-026 (M)** Support hardware scanners (HID keyboard-wedge and Bluetooth SPP) in addition
to camera scanning. On rugged devices the hardware trigger MUST work.

**V0-UIR-027 (M)** Large touch targets, single-hand operation, high-contrast theme readable
under factory lighting, and audible + haptic scan confirmation (a worker in ear defenders needs
the haptic; a worker looking at the product needs the audio).

**V0-NFR-019 (M)** App works on Android 10+ and iOS 15+. Android is the primary target for
shop floor (rugged device availability).

**V0-NFR-020 (M)** Mobile sessions require re-authentication every 12 hours; biometric unlock
supported for the interim.

---

## 18. Integration and event standard

### 18.1 Domain events

**V0-IR-019 (M)** Every module publishes domain events via a **transactional outbox** —
the event row is written in the same database transaction as the state change, then dispatched
asynchronously. This guarantees no lost events and no phantom events.

```sql
core_event_outbox                              -- APPEND ONLY
  id, uid, company_id,
  event_name      VARCHAR(100)   -- 'procurement.purchase_order.approved'
  event_version   SMALLINT DEFAULT 1
  aggregate_type  VARCHAR(80)
  aggregate_id    BIGINT UNSIGNED
  aggregate_uid   CHAR(26)
  payload         JSON
  occurred_at     DATETIME(6)
  occurred_by     BIGINT UNSIGNED
  correlation_id  CHAR(26)
  status          VARCHAR(20)    -- PENDING|DISPATCHED|FAILED|DEAD
  attempts        INT DEFAULT 0
  last_error      TEXT NULL
  dispatched_at   DATETIME(6) NULL
  KEY ix_outbox_pending (status, occurred_at)
```

**V0-IR-020 (M)** Event names are `<module>.<aggregate>.<past_tense_verb>`, lower snake case.
Payloads are additive-only within a version; a breaking change increments `event_version` and
both versions are published for one release cycle.

**V0-IR-021 (M)** Event payloads carry identifiers and the changed business facts — never the
full entity. Consumers fetch detail via API. This keeps payloads stable and prevents the event
schema from becoming a second, unmaintained copy of the domain model.

### 18.2 Core event catalogue (extract — each volume extends it)

| Event | Emitted when | Notable consumers |
|---|---|---|
| `procurement.purchase_order.approved` | PO approved | Inventory (expected receipts), Finance (commitment), Notification, Supplier portal |
| `procurement.grn.approved` | GRN accepted after QC | Inventory (stock in), Finance (GRIR), Vendor rating |
| `quality.inspection.rejected` | QC rejects a lot | Procurement (debit note), Production (hold), Notification |
| `inventory.stock.posted` | Any stock movement | Costing, Planning (net requirement), Dashboards |
| `inventory.reorder_level.breached` | Balance < reorder point | Procurement (auto-PR), Notification |
| `sales.sales_order.confirmed` | SO approved | Planning (demand), Inventory (reservation), Finance (credit) |
| `production.production_order.released` | PO released to shop floor | Inventory (material reservation), Planning (capacity) |
| `production.operation.completed` | Operation confirmed | WIP, Next operation, Costing, Dashboard |
| `production.finished_goods.received` | FG receipt | Inventory, Sales (fulfilment), Costing |
| `packing.carton.packed` | Carton closed | Dispatch (ready stock), Traceability |
| `dispatch.shipment.delivered` | POD captured | Sales (invoice trigger), Finance (revenue), CRM |
| `finance.invoice.posted` | Sales invoice posted | GST, AR, Customer ledger, e-invoice job |
| `maintenance.breakdown.reported` | Breakdown logged | Production (capacity), Planning (reschedule), Notification |
| `workflow.approval.requested` | Any approval raised | Notification, Mobile push |
| `workflow.approval.escalated` | SLA breached | Notification, Escalation chain |
| `iam.permission.changed` | Role/permission modified | Permission cache invalidation, Security audit |

### 18.3 Outbound webhooks

**V0-IR-022 (M)** Companies may register webhook endpoints per event type, with a shared
secret. Deliveries are HMAC-SHA256 signed (`X-ERP-Signature`), retried with exponential backoff
(5 attempts), and every delivery attempt is logged. Endpoint URLs are validated against SSRF
(no private ranges, no redirects to private ranges).

**V0-IR-023 (M)** Webhook subscriptions, delivery history and manual replay are exposed in the
admin UI. A dead-lettered event MUST be replayable without a developer.

### 18.4 Inbound integrations

**V0-IR-024 (M)** External systems authenticate with scoped API keys (not user credentials).
API keys carry: company, permission set, IP allowlist, expiry, and rate limit. Every API-key
call is audited with the key identity.

**V0-IR-025 (M)** Standard inbound integration points for release 1:

| Integration | Direction | Notes |
|---|---|---|
| GST e-invoice (IRP via GSP) | Out/In | IRN + signed QR returned and stored against the invoice |
| E-way bill (NIC via GSP) | Out/In | EWB number, validity, part-B vehicle update, cancellation |
| GSTR-1 / GSTR-3B data | Out | Return-ready JSON export |
| Bank statement | In | MT940/CSV import for reconciliation |
| Payment gateway | Out/In | Customer portal payments |
| SMS gateway | Out | Provider-agnostic adapter |
| WhatsApp Business API | Out/In | Template messages, delivery receipts |
| SMTP / email | Out/In | Send + bounce handling |
| Transporter / courier tracking | Out/In | Shipment status polling |
| Weighing scale | In | Serial/TCP capture on GRN and dispatch weighment |
| Label printer | Out | Raw ZPL over TCP 9100 |
| Biometric attendance device | In | Punch pull for HRMS |
| Tally / external accounting | Out | XML/JSON voucher export, if the client retains Tally |

**V0-IR-026 (M)** Every external adapter sits behind an interface with a **mock implementation**
so the whole system is testable and demonstrable without live statutory or gateway credentials.

**V0-IR-027 (M)** External call failures MUST NOT roll back a committed business transaction.
An invoice is posted whether or not the IRP responded; IRN generation is a retried background
job with its own visible status, and the invoice shows `IRN pending`.

---

## 19. Non-functional requirements

### 19.1 Performance

| Ref | Requirement | Target |
|---|---|---|
| **V0-NFR-021 (M)** | Page interactive (P95), typical list screen | ≤ 2.0 s |
| **V0-NFR-022 (M)** | API response, simple read (P95) | ≤ 300 ms |
| **V0-NFR-023 (M)** | API response, document save with 50 lines (P95) | ≤ 1.5 s |
| **V0-NFR-024 (M)** | Barcode scan → resolved response (P95) | ≤ 500 ms |
| **V0-NFR-025 (M)** | Stock enquiry across 50,000 SKUs (P95) | ≤ 1.0 s |
| **V0-NFR-026 (M)** | Report < 10,000 rows (P95) | ≤ 5 s |
| **V0-NFR-027 (M)** | MRP run, 5,000 items × 5 BOM levels | ≤ 10 min |
| **V0-NFR-028 (M)** | Multi-level BOM explosion, 10 levels | ≤ 3 s |
| **V0-NFR-029 (M)** | Month-end financial close batch | ≤ 30 min |
| **V0-NFR-030 (M)** | Payroll for 1,000 employees | ≤ 15 min |
| **V0-NFR-031 (M)** | Login to dashboard rendered | ≤ 3 s |

### 19.2 Scalability

| Ref | Dimension | Release-1 target | Design headroom |
|---|---|---|---|
| **V0-NFR-032 (M)** | Named users | 500 | 2,000 |
| **V0-NFR-033 (M)** | Concurrent active users | 250 | 1,000 |
| **V0-NFR-034 (M)** | Companies / branches / plants | 5 / 20 / 10 | 25 / 100 / 50 |
| **V0-NFR-035 (M)** | SKUs (incl. variants) | 50,000 | 250,000 |
| **V0-NFR-036 (M)** | Stock ledger rows/year | 10 million | 50 million |
| **V0-NFR-037 (M)** | Production entries/day | 20,000 | 100,000 |
| **V0-NFR-038 (M)** | Documents/day (all types) | 5,000 | 25,000 |
| **V0-NFR-039 (M)** | Attachment storage | 2 TB | 20 TB |

**V0-NFR-040 (M)** The application tier MUST be stateless so it scales horizontally. Session
state lives in Redis; no sticky sessions; no in-process caches that affect correctness.

### 19.3 Availability, backup and recovery

| Ref | Requirement |
|---|---|
| **V0-NFR-041 (M)** | Availability ≥ 99.5% during plant operating hours (configurable, e.g. 06:00–23:00 IST, 6 days) |
| **V0-NFR-042 (M)** | **RPO ≤ 15 minutes** — full nightly backup + binlog shipping every 15 min |
| **V0-NFR-043 (M)** | **RTO ≤ 4 hours** for full restore |
| **V0-NFR-044 (M)** | Backups are automated, encrypted, off-site replicated, and **restore-tested monthly**. An untested backup is not a backup. |
| **V0-NFR-045 (M)** | Backup retention: daily 30 days, weekly 12 weeks, monthly 24 months, yearly 8 years |
| **V0-NFR-046 (M)** | Planned maintenance windows are announced in-app 48 h ahead and fall outside plant operating hours |
| **V0-NFR-047 (M)** | Zero-downtime deployment: rolling restart, backward-compatible migrations, no destructive DDL in a release that the previous version cannot tolerate |
| **V0-NFR-048 (M)** | Graceful degradation: if Redis is unavailable, the system serves requests with reduced caching rather than failing; if object storage is unavailable, transactions proceed and attachments queue |

### 19.4 Usability, accessibility, localisation

| Ref | Requirement |
|---|---|
| **V0-NFR-049 (M)** | A trained operator completes a routine transaction (material issue, production entry) in ≤ 60 seconds |
| **V0-NFR-050 (M)** | WCAG 2.1 Level AA |
| **V0-NFR-051 (M)** | Full keyboard operability on all data-entry screens |
| **V0-NFR-052 (M)** | UI strings externalised for i18n from day one; English (India) at launch, Hindi and Tamil next — shop-floor screens are the priority for translation |
| **V0-NFR-053 (M)** | Per-user timezone, date format, number format; company-level base timezone for business dates |
| **V0-NFR-054 (M)** | Context-sensitive help on every screen and inline field help on non-obvious fields |

### 19.5 Maintainability and observability

| Ref | Requirement |
|---|---|
| **V0-NFR-055 (M)** | Structured JSON logs with correlation id on every line |
| **V0-NFR-056 (M)** | Distributed tracing (OpenTelemetry) across API → DB → worker → external call |
| **V0-NFR-057 (M)** | Metrics: request rate/latency/error by endpoint, queue depth, job duration, DB pool utilisation, cache hit ratio |
| **V0-NFR-058 (M)** | Health endpoints: `/health/live`, `/health/ready` (checks DB, Redis, object storage, broker) |
| **V0-NFR-059 (M)** | Alerting on: error rate > 1%, P95 latency > 2× target, queue depth > 1,000, failed job, stock-ledger reconciliation mismatch, backup failure, certificate expiry |
| **V0-NFR-060 (M)** | Test coverage ≥ 85% on domain/application layers, ≥ 70% overall |
| **V0-NFR-061 (M)** | OpenAPI spec generated, committed, and diffed on every build |

### 19.6 Data retention and archival

| Data | Online | Archive | Total |
|---|---|---|---|
| Transactional documents | 3 years | 5 years | 8 years |
| Stock ledger | 2 years | 6 years | 8 years |
| Audit log | 2 years | 6 years | 8 years |
| Financial books | 8 years | — | 8 years (statutory) |
| Attachments/drawings | Current + 2 revisions online | All revisions | Permanent |
| QC records | 3 years | 5 years | 8 years |
| Batch traceability records | **Permanent** | — | Permanent |
| Notification logs | 90 days | 1 year | 1 year |
| Session/security logs | 90 days | 1 year | 1 year |

**V0-NFR-062 (M)** Archived data remains queryable through the same UI, with a clear
"archived — slower" indicator. Archival must never mean "gone".

---

## 20. Environments, configuration and deployment

**V0-NFR-063 (M)** Four environments: `dev`, `test` (QA), `uat` (client acceptance, refreshed
from a masked production copy), `prod`.

**V0-NFR-064 (M)** UAT and lower environments MUST use **masked** production data. Real
customer PII, employee PAN/Aadhaar/salary, and bank details are never copied unmasked to a
non-production environment.

**V0-NFR-065 (M)** All configuration is environment-variable driven; no environment-specific
code branches. Secrets from a secret store, never from a repo.

**V0-NFR-066 (M)** Deployment is containerised (Docker), orchestrated by Docker Compose
(on-prem single-node) or Kubernetes (cloud/multi-node). Same image across all environments.

**V0-NFR-067 (M)** Database migrations are versioned (Alembic), forward-only in production, run
as an explicit pre-deploy step, and every migration is reviewed for lock duration against
production row counts.

**V0-NFR-068 (M)** A seed dataset is maintained for: country/state/city, currencies, UOM, HSN
codes with GST rates, default roles and permissions, default document series, default reason
codes, and a demo company with realistic bottle-manufacturing master data. Every developer and
demo starts from the same seed.

---

## 21. Glossary

| Term | Meaning |
|---|---|
| **AQL** | Acceptable Quality Level — statistical sampling standard (IS 2500 / ISO 2859) used for batch acceptance |
| **ASN** | Advance Shipping Notice — supplier's notice of despatch, received before goods |
| **Blank** | Circular disc cut from SS sheet/coil, the input to deep drawing |
| **BOM** | Bill of Materials — the component structure of a product |
| **CAPA** | Corrective and Preventive Action |
| **Deep drawing** | Press operation forming a flat blank into a seamless cup/body |
| **Getter** | Chemical absorber placed in the vacuum cavity to maintain vacuum over life |
| **GRN** | Goods Receipt Note |
| **GRIR** | Goods Received / Invoice Received clearing account |
| **GSP** | GST Suvidha Provider — authorised intermediary for e-invoice/e-way bill APIs |
| **Heat number** | Steel mill's melt batch identifier; the root of material traceability |
| **HSN** | Harmonised System of Nomenclature — goods classification code for GST |
| **IRN** | Invoice Reference Number — returned by the GST Invoice Registration Portal |
| **Job work** | Subcontracting an operation (typically coating/printing) to an external processor |
| **Lot / Batch** | A quantity produced or received under uniform conditions, tracked as a unit |
| **MPS** | Master Production Schedule |
| **MRP** | Material Requirements Planning |
| **NCR** | Non-Conformance Report |
| **Necking** | Reducing the diameter of the bottle's open end to form the mouth |
| **PPC** | Production Planning & Control |
| **PR / Indent** | Purchase Requisition — internal request to buy |
| **RFQ** | Request For Quotation |
| **Routing** | The ordered sequence of operations, work centres and standard times to make an item |
| **SSCC** | Serial Shipping Container Code — GS1 18-digit logistics unit identifier |
| **Thread rolling** | Forming the screw thread on the bottle neck without cutting metal |
| **UOM** | Unit of Measure |
| **WIP** | Work In Progress |
| **Yield %** | Good output ÷ input, per operation |
| **ZPL** | Zebra Programming Language — native thermal label printer command language |

---

## 22. Assumptions and open questions

### 22.1 Assumptions made in this volume

| # | Assumption | Impact if wrong | Owner to confirm |
|---|---|---|---|
| A-01 | **FastAPI** is acceptable as the Python framework (client said "Python", not a framework) | Moderate — layering and API standards survive a switch to Django/DRF; the router and dependency-injection sections change | Client / architect |
| A-02 | **React Native (Expo)** for mobile, not a PWA | High — offline/scanner requirements in §17 assume native | Client |
| A-03 | Deployment is **on-premise** at the plant with an internet link, not cloud-only | Moderate — affects §5.3 and §19.3 | Client IT |
| A-04 | Base currency is **INR**; statutory scope is **India only** in release 1 | High if export entity has a foreign subsidiary | Client finance |
| A-05 | Financial year is **April–March** | Low — configurable, but seed data assumes it | Client finance |
| A-06 | E-invoice and e-way bill are accessed via a **GSP**, not direct IRP integration | Moderate — adapter differs | Client finance |
| A-07 | Finished bottles are **not individually serialised** by default; serialisation is per-SKU configurable | Moderate — affects FG barcode volume and packing screens | Client production |
| A-08 | Company holds (or will obtain) a **GS1 prefix** for export carton labelling | Low — internal formats used otherwise | Client logistics |
| A-09 | Costing method is **weighted-average** for raw material, **standard costing with variance** for finished goods | High for Vol 9 | Client finance |
| A-10 | Existing systems (Tally, spreadsheets) require **data migration**, not live two-way integration | High — a live Tally sync is a different project | Client |

### 22.2 Open questions

These block or shape later volumes and need client answers. Tracked live in
[open-questions.md](open-questions.md).

| # | Question | Blocks |
|---|---|---|
| Q-01 | How many legal entities, branches and plants at go-live? Do any branches have separate GSTINs? | Vol 1 org structure, Vol 9 GST |
| Q-02 | Is subcontracting (job-work coating/printing) in scope for release 1? | Vol 3, Vol 4, Vol 6 — significant scope |
| Q-03 | Costing method — weighted average, FIFO, or standard with variance? Per item category? | Vol 4, Vol 9 |
| Q-04 | Is there an existing chart of accounts to import, or is one to be designed? | Vol 9 |
| Q-05 | Are finished bottles serialised individually, or tracked at batch level only? | Vol 4, Vol 7, Vol 8 |
| Q-06 | Which machines can realistically provide automated counters, and via what interface? | Vol 6 — scope of manual entry |
| Q-07 | Payroll: statutory components applicable (PF, ESI, PT by state, LWF)? Existing payroll system to retire? | Vol 10 |
| Q-08 | Are there export orders requiring pre-shipment inspection certificates and specific documentation sets? | Vol 8 |
| Q-09 | Current transporter/courier partners and whether they expose tracking APIs | Vol 8 |
| Q-10 | Data migration scope — how many years of history, which entities, from which systems? | Migration plan (separate) |
| Q-11 | Is a customer/supplier portal in release 1 or deferred? | Vol 2, Vol 3 |
| Q-12 | Quality standards to comply with — ISO 9001, BIS, FSSAI (food contact), LFGB/FDA for export? | Vol 7 — drives certificate and test requirements |

---

**Revision history**

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-07-28 | Engineering | Initial draft |
