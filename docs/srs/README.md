# Software Requirements Specification — Master Index

**Product:** Stainless Steel Water Bottle Manufacturing ERP
**Document set version:** 0.3 (draft)
**Last updated:** 2026-07-29

---

## 1. How this document set is organised

The SRS is deliberately **not** a single monolithic document. It is split into a foundation
volume plus eleven domain volumes, so that each stays focused, independently reviewable, and
comfortably inside an AI model's working context.

**Read Volume 0 first.** Every other volume assumes it and does not repeat it. Volume 0 owns
all cross-cutting standards — data types, API contracts, security model, document lifecycle,
audit, numbering, notifications, barcode formats, UI archetypes, and non-functional
requirements. A domain volume specifies only what is *specific to that domain*.

| Vol | Title | Covers | Status |
|---|---|---|---|
| **0** | [Foundation & Cross-Cutting Standards](volume-00-foundation.md) | Architecture, data standards, API standards, security, common document patterns, numbering, audit, notifications, reporting, barcode, UI/UX, mobile, integration, NFRs, glossary | 🟢 Draft complete |
| **1** | [Core Framework](volume-01-core-framework/) | Identity & access, organisation structure, document numbering, workflow & approvals, audit & compliance, notifications, **all master data**, system administration | 🟢 Draft complete |
| **2** | CRM & Sales | Lead → Opportunity → Quotation → Sales Order → Invoice → Collection, complaints, feedback, customer ledger | ⚪ Not started |
| **3** | [Procurement & Supplier Management](volume-03-procurement/) | Supplier onboarding & rating, PR → RFQ → Supplier quote → Comparison → PO → GRN → Purchase return → Invoice verification, rate contracts, subcontracting, supplier portal | 🟢 Draft complete |
| **4** | [Inventory & Warehouse Management](volume-04-inventory/) | Warehouse/bin, stock model & ledger, receipts & put-away, issues, transfers & job work, adjustments, batch/lot/serial & traceability, cycle count, valuation & ageing, replenishment | 🟢 Draft complete |
| **5** | Product Engineering, BOM & Production Planning | Product versions, drawings, BOM (multi-level/alternate), routing, cost sheet, ECN, forecast, MPS, MRP, capacity planning | ⚪ Not started |
| **6** | Shop Floor Execution & Manufacturing | Production order, work order, operations, material issue/return, production entry, WIP, rework, scrap, downtime, FG receipt | ⚪ Not started |
| **7** | Quality Management | Incoming/in-process/final QC, inspection plans, sampling, defect capture, NCR, CAPA, certificates, quality dashboard | ⚪ Not started |
| **8** | Packing, Dispatch & Logistics | Packing order, carton/pallet/container, labels, dispatch planning, vehicle, challan, e-way bill, POD, freight | ⚪ Not started |
| **9** | Finance & Accounting | COA, vouchers, AR/AP, bank/cash, GST, TDS, cost centres, budget, assets/depreciation, TB, BS, P&L, cash flow | ⚪ Not started |
| **10** | HRMS & Asset Management | Employee, attendance, leave, shift, payroll, loans, claims, travel, performance, training; asset lifecycle | ⚪ Not started |
| **11** | Reports, Dashboards, Mobile App & Integrations | Report catalogue, report engine, role dashboards, mobile app spec, integration/event catalogue | ⚪ Not started |

Status legend: ⚪ Not started · 🟡 In progress · 🟢 Draft complete · 🔵 In review · ✅ Approved

---

## 2. Volume dependency graph

```
                          ┌──────────────────────────┐
                          │  Vol 0  Foundation       │
                          │  (standards, patterns)   │
                          └────────────┬─────────────┘
                                       │  required by all
                          ┌────────────▼─────────────┐
                          │  Vol 1  Core Framework   │
                          │  IAM · Org · Workflow ·  │
                          │  Numbering · Audit ·     │
                          │  Notification · MASTERS  │
                          └──┬────┬────┬────┬────┬───┘
             ┌───────────────┘    │    │    │    └──────────────┐
             │                    │    │    │                   │
      ┌──────▼──────┐      ┌──────▼──┐ │ ┌──▼────────┐   ┌──────▼──────┐
      │ Vol 2       │      │ Vol 3   │ │ │ Vol 5     │   │ Vol 10      │
      │ CRM & Sales │      │ Procure │ │ │ Eng/BOM/  │   │ HRMS &      │
      └──┬───────┬──┘      └────┬────┘ │ │ Planning  │   │ Assets      │
         │       │              │      │ └──┬────────┘   └──────┬──────┘
         │       │        ┌─────▼──────▼────▼──┐                │
         │       │        │ Vol 4  Inventory   │                │
         │       │        │ & Warehouse        │                │
         │       │        └─────┬──────────┬───┘                │
         │       │              │          │                    │
         │       │        ┌─────▼──────┐   │                    │
         │       │        │ Vol 6      │◄──┘                    │
         │       │        │ Shop Floor │                        │
         │       │        └─────┬──────┘                        │
         │       │              │                               │
         │       │        ┌─────▼──────┐                        │
         │       │        │ Vol 7  QC  │                        │
         │       │        └─────┬──────┘                        │
         │       │              │                               │
         │       │        ┌─────▼──────────┐                    │
         │       └───────►│ Vol 8  Packing │                    │
         │                │ & Dispatch     │                    │
         │                └─────┬──────────┘                    │
         │                      │                               │
         └──────────┬───────────┴───────────────────────────────┘
                    │
             ┌──────▼──────────────┐
             │ Vol 9  Finance      │
             └──────┬──────────────┘
                    │
             ┌──────▼───────────────────────────────┐
             │ Vol 11  Reports · Dashboards ·       │
             │ Mobile · Integrations                │
             └──────────────────────────────────────┘
```

**Build order follows this graph.** Nothing downstream of Volume 1 can be implemented until
Volume 1's framework services (auth, RBAC, workflow, numbering, audit, notification,
attachments, events) are working, because every document in every later volume depends on
all seven.

---

## 3. Requirement identifier scheme

Every requirement has a permanent, never-reused identifier:

```
V<volume>-<AREA>-<TYPE>-<nnn>
```

| Part | Meaning | Examples |
|---|---|---|
| `V<n>` | Volume number | `V0`, `V1`, `V6` |
| `AREA` | Area code within the volume | `IAM`, `ORG`, `WFL`, `NUM`, `AUD`, `NTF`, `MDM`, `SYS` |
| `TYPE` | Requirement type | `FR` functional · `BR` business rule · `NFR` non-functional · `DR` data · `IR` integration · `RPT` report · `UIR` UI |
| `nnn` | Zero-padded sequence within `AREA`+`TYPE` | `001` |

Example: `V1-WFL-BR-014` = Volume 1, Workflow area, Business Rule 14.

Identifiers are **immutable**. A requirement that is dropped is marked `[WITHDRAWN]` in place;
its number is never reassigned. A requirement that changes materially gets a new number and
the old one is marked `[SUPERSEDED BY …]`.

### Priority

| Tag | Meaning |
|---|---|
| **M** | Mandatory — go-live blocker |
| **S** | Should have — required within 3 months of go-live |
| **C** | Could have — backlog |
| **W** | Won't have this release — recorded to prevent re-litigation |

### Modal verbs (RFC 2119)

**MUST / MUST NOT** = absolute requirement. **SHOULD** = strong recommendation, deviation
needs justification. **MAY** = optional.

---

## 4. Section template used by every domain volume

Each domain volume (2–11) follows the same structure, so reviewers always know where to look:

1. Module objective and scope (in scope / explicitly out of scope)
2. Business process flow (swimlane / flow diagram)
3. Actors, user roles and responsibilities
4. Functional requirements
5. Business rules and validations
6. Screen-wise UI specification with wireframes and field tables
7. Data model — tables, columns, keys, indexes, relationships
8. Document lifecycle and state machine
9. Approval workflow and approval matrix
10. Permissions catalogue for the module
11. API requirements — endpoint list with methods, permissions, and payload shape
12. Domain events published and subscribed
13. Reports
14. Dashboard widgets contributed
15. Notifications and alerts
16. Barcode / QR usage
17. Mobile app requirements
18. Integration points
19. Audit trail requirements
20. Module-specific non-functional requirements
21. Open questions and assumptions

---

## 5. Conventions used in wireframes

Wireframes are ASCII, deliberately low-fidelity — they fix **information architecture and
field placement**, not visual design. Visual design follows the Tailwind design tokens in
Volume 0 §16.

```
┌─ Panel / card boundary          [ Button ]        (•) Radio selected
│  Vertical rule                  [Primary]         ( ) Radio unselected
├──  Section divider              [x] Checkbox on   [ ] Checkbox off
▼   Dropdown                      ▸ Collapsed       ▾ Expanded
🔍  Search / lookup field         *   Mandatory field
⟳   Refresh                       ⋮   Row action menu
▤   Data grid                     ⚑   Status badge
```

---

## 6. Related documents

| Document | Purpose |
|---|---|
| [../../CLAUDE.md](../../CLAUDE.md) | Implementation guidelines binding on all contributors |
| [open-questions.md](open-questions.md) | Live register of unresolved decisions and assumptions |
| `docs/adr/` | Architecture Decision Records |

---

## 7. Change control

Volumes marked ✅ Approved are baselined. Changes to a baselined volume require a change
entry in that volume's revision history table, with date, author, requirement IDs touched,
and reason. Draft volumes may be edited freely.

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-07-28 | Engineering | Initial index; Volumes 0 and 1 drafted |
| 0.2 | 2026-07-29 | Engineering | Volume 3 (Procurement & Supplier Management) drafted — full FRD in 13 chapters; open-questions register opened |
| 0.3 | 2026-07-29 | Engineering | Volume 4 (Inventory & Warehouse Management) drafted — full FRD in 14 chapters; Q4-01…Q4-14 and assumptions A4-01…A4-10 registered |
