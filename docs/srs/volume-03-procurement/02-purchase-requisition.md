# Volume 3 · Chapter 2 — Purchase Requisition (PR)

**Area code:** `PRQ`
Prerequisite: [Vol 0](../volume-00-foundation.md) §10 · [Vol 1 Ch 4](../volume-01-core-framework/04-workflow-and-approvals.md)
Numbering series: `PURCHASE_REQUISITION` → `PR/{FY}/{SEQ:5}` (Vol 1 Ch 3 §3.5)

---

## 2.1 Purpose

The purchase requisition is the **authorisation to spend attention**, not yet money. It
converts a need — from MRP, a reorder breach, a breakdown, a project, or a person — into a
reviewed, budgeted, prioritised demand that procurement is obliged to source.

Three things the PR must do that a "material request note" does not:

1. **Establish accountability.** Who needs it, for what, charged to which cost centre, by when,
   and who authorised the need. Every rupee of downstream spend traces to this record.
2. **Establish the need date, not the order date.** The need date drives the sourcing method:
   a 45-day need date permits an RFQ cycle; a 3-day need date forces a contract call-off or an
   emergency route, and the system must say so at the point of entry rather than after the
   buyer has wasted a week.
3. **Establish budget position before commitment.** The requester sees budget consumption at
   entry, so an unaffordable request is challenged before four approvers have spent time on it.

**V3-PRQ-FR-001 (M)** No purchase order may be created without a reference to an approved PR
line, except for document types explicitly configured as PR-exempt (default: none for direct
material; configurable for petty MRO below a threshold and for rate-contract call-offs against
an approved annual requirement).

## 2.2 PR origins

```
  ┌──────────────────┐
  │ MRP run (Vol 5)  │──planned purchase orders──►┐
  └──────────────────┘                            │
  ┌──────────────────┐                            │
  │ Reorder level    │──inventory.reorder_level.──►│
  │ breach (Vol 4)   │        breached            │
  └──────────────────┘                            │   ┌──────────────────────────┐
  ┌──────────────────┐                            ├──►│  PR staging / generation │──► PR
  │ Production        │──material shortage────────►│   │  (auto or reviewed)      │
  │ material request │                            │   └──────────────────────────┘
  └──────────────────┘                            │
  ┌──────────────────┐                            │
  │ Maintenance      │──spares request───────────►│
  │ (Vol 10)         │                            │
  └──────────────────┘                            │
  ┌──────────────────┐                            │
  │ Manual / project │───────────────────────────►┘
  │ / capex / service│
  └──────────────────┘
```

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PRQ-FR-002** | M | `source_type` on every PR: `MANUAL`, `MRP`, `REORDER`, `PRODUCTION`, `MAINTENANCE`, `PROJECT`, `CAPEX`, `SERVICE`, `SUBCONTRACT`. It drives numbering sub-type, approval matrix, mandatory fields and default urgency. |
| **V3-PRQ-FR-003** | M | MRP-generated planned orders land in a **staging list** (`S-PRQ-04`), not directly as PRs. The planner reviews, groups, adjusts quantity/date and converts. Auto-conversion without review is permitted only when explicitly enabled per item category, and every auto-created PR is flagged. |
| **V3-PRQ-FR-004** | M | A reorder-breach PR MUST carry the current stock, reorder level, reorder quantity, open PO quantity and coverage in days at the moment of generation, so an approver can see whether it is still needed. |
| **V3-PRQ-FR-005** | M | The system MUST NOT generate a PR for a quantity already covered by an open PO or an open earlier PR for the same item, plant and need window. Duplicate demand suppression is a hard requirement, with the suppressed quantity shown. |

## 2.3 Status flow

```
                 ┌─────────┐
        ┌───────►│  DRAFT  │◄──── return for correction ────┐
        │        └────┬────┘                                │
        │      submit │                                     │
   reopen│             ▼                                    │
        │   ┌────────────────────┐   reject   ┌──────────┐  │
        │   │ PENDING_APPROVAL   ├───────────►│ REJECTED │  │
        │   └────────┬───────────┘            └────┬─────┘  │
        │            │ approve (all levels)        │ reopen │
        │            ▼                             └────────┘
        │      ┌───────────┐
        │      │ APPROVED  │  ← sourcing may begin
        │      └─────┬─────┘
        │            │
        │   ┌────────┴─────────┬──────────────┬─────────────┐
        │   │ RFQ / PO created │              │             │
        │   ▼                  ▼              ▼             ▼
        │ ┌──────────────┐ ┌─────────┐  ┌───────────┐ ┌───────────┐
        │ │ PARTIALLY_   │ │ ON_HOLD │  │ CANCELLED │ │ SHORT_    │
        │ │ ORDERED      │ └────┬────┘  └───────────┘ │ CLOSED    │
        │ └──────┬───────┘   release                  └───────────┘
        │        │ all lines ordered
        │        ▼
        │  ┌───────────┐   all ordered qty received
        │  │ ORDERED   ├──────────────────────────► ┌───────────┐
        │  └───────────┘                            │ CLOSED    │
        │                                           └───────────┘
        └─── amend (approved PR, before full ordering) ──► new revision in DRAFT
```

| Status | Meaning | Editable | Next |
|---|---|---|---|
| `DRAFT` | Being prepared, autosaved | Yes | submit, delete (soft) |
| `PENDING_APPROVAL` | In workflow | No | approve, reject, return, recall |
| `APPROVED` | Authorised to source | No — amend only | RFQ/PO creation, hold, cancel, amend, short-close |
| `REJECTED` | Refused with reason code | No | reopen to `DRAFT` by originator |
| `ON_HOLD` | Sourcing suspended | No | release, cancel |
| `PARTIALLY_ORDERED` | Some lines/quantities on PO | No | continue ordering, short-close |
| `ORDERED` | All quantity on released POs | No | short-close (if PO cancelled), close |
| `SHORT_CLOSED` | Remaining quantity abandoned with reason | No | — |
| `CANCELLED` | Voided with reason, nothing ordered | No | — |
| `CLOSED` | All ordered quantity received | No | reopen (privileged, audited) |
| `AMENDED` | Superseded by revision R(n+1) | No | — |

**V3-PRQ-BR-001 (M)** Line-level status is independent of header status. The header status is
**derived** from its lines: any line partially ordered → `PARTIALLY_ORDERED`; all lines fully
ordered or short-closed → `ORDERED`. The header status is never set directly.

## 2.4 Functional requirements

### 2.4.1 Creation and content

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PRQ-FR-006** | M | Multi-line PR with per-line item, specification, quantity, UOM, required-by date, delivery plant/warehouse, cost centre, account/budget line, and line remarks. |
| **V3-PRQ-FR-007** | M | **Non-stock / free-text lines** MUST be supported for services, one-off MRO and items not yet in the item master, with a mandatory description, estimated rate and account assignment. A free-text line MUST be convertible to a coded item later, and the count of free-text lines is a reported governance metric. |
| **V3-PRQ-FR-008** | M | **Dual UOM** on every stock line: requirement may be expressed in the stocking UOM (NOS) while purchasing happens in the purchase UOM (KG). Both are shown, with the conversion factor and its basis (grade, thickness, width for SS). |
| **V3-PRQ-FR-009** | M | Per line, the system displays without being asked: current stock at the plant, stock in transit, open PO quantity, reserved quantity, available-to-promise, last purchase rate with date and supplier, rate contract rate if any, and average consumption. Requisitioning blind is how over-ordering happens. |
| **V3-PRQ-FR-010** | M | Estimated value per line (`quantity × reference rate`) and PR total, where reference rate = rate contract → last purchase price → standard cost → manual estimate, in that order, with the source shown. The PR total drives the approval matrix. |
| **V3-PRQ-FR-011** | M | **Urgency** classification per PR: `ROUTINE`, `URGENT`, `EMERGENCY`, each with its own approval matrix and SLA. `EMERGENCY` requires a mandatory reason code and free-text justification, and appears on a standing exception report. |
| **V3-PRQ-FR-012** | M | Attachments per header and per line — drawing, specification sheet, sample photo, old part image, breakdown photo, quotation received informally. |
| **V3-PRQ-FR-013** | M | Copy-from: create a PR from a previous PR, from a template, from a BOM shortage list, or by Excel import with a validated template and a row-level error report. |
| **V3-PRQ-FR-014** | S | PR templates for recurring requirements (monthly consumables, packaging for a standing customer), with a schedule that can raise the PR automatically on a calendar. |
| **V3-PRQ-FR-015** | M | **Suggested source** per line: the AVL rank-1 supplier, the applicable rate contract, and the last three purchases with rate, date and supplier — so the sourcing decision starts informed. |

### 2.4.2 Budget check

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PRQ-FR-016** | M | On save and on submit, the PR MUST evaluate available budget for each line's cost centre × account × period: budget, consumed (invoiced), committed (open PO), requisitioned (approved open PR), and the effect of this PR. |
| **V3-PRQ-FR-017** | M | Budget behaviour is configurable per company and procurement type: `IGNORE`, `WARN`, `BLOCK`. Default: `WARN` at PR, `BLOCK` at PO (assumption A3-06). A `BLOCK` breach may be overridden only by `PROCUREMENT.PO.OVERRIDE_BUDGET` with a reason, which is logged and reported. |
| **V3-PRQ-FR-018** | M | Capex lines MUST reference an approved capital budget line or a capex authorisation reference; without one they cannot be submitted. |

### 2.4.3 Consolidation and sourcing decision

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PRQ-FR-019** | M | A **consolidation workbench** (`S-PRQ-05`) groups approved PR lines across requisitions, departments and plants by item, need-date window and supplier, showing aggregate quantity and the price-break impact of buying together. Output is one RFQ or one PO covering many PR lines. |
| **V3-PRQ-FR-020** | M | Traceability MUST be preserved through consolidation: every PO line records the PR lines it satisfies and the quantity taken from each; every PR line shows the POs against it. A many-to-many link table, not a single reference field. |
| **V3-PRQ-FR-021** | M | A **sourcing decision** per approved PR line (`S-PRQ-07`): `RATE_CONTRACT_CALL_OFF`, `RFQ`, `DIRECT_PO` (with justification), `STOCK_TRANSFER` (available at another plant), `SUBCONTRACT`, `DEFER`. The system proposes the decision and the buyer confirms or overrides with a reason. |
| **V3-PRQ-FR-022** | M | When stock exists at another plant or warehouse in sufficient quantity, the system MUST propose a stock transfer instead of a purchase and record the decision either way. |
| **V3-PRQ-FR-023** | S | Lead-time feasibility check: if `required_by − today < supplier lead time + internal sourcing time`, the PR is flagged infeasible at entry with the earliest achievable date, and the requester must either accept the date or escalate the urgency. |

### 2.4.4 Amendment, cancellation, closure

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PRQ-FR-024** | M | An approved PR may be **amended** into revision R(n+1) while unordered quantity remains. The amendment re-enters approval at a level determined by the magnitude of change (Vol 1 V1-WFL-BR-008). Quantity may not be reduced below the quantity already ordered. |
| **V3-PRQ-FR-025** | M | **Cancellation** requires a reason code, is blocked if any line has a released PO against it, and notifies the originator and all prior approvers. |
| **V3-PRQ-FR-026** | M | **Short-close** closes remaining unordered quantity with a reason, is a separate permission from cancel, and releases any budget commitment. |
| **V3-PRQ-FR-027** | M | Aged approved PRs with no sourcing action for a configurable number of days appear on an ageing report and escalate to the Purchase Head. A PR must not be able to sit unactioned in silence. |

## 2.5 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V3-PRQ-BR-002** | M | `required_by_date` MUST be ≥ PR date. A past need date is an error, not a warning. |
| **V3-PRQ-BR-003** | M | Quantity > 0 on every line, rounded to the item's decimal precision. Zero-quantity lines cannot be saved. |
| **V3-PRQ-BR-004** | M | The item must be `ACTIVE`, must be purchasable (`is_purchased = true`), and must not be flagged obsolete. An obsolete item with a replacement shows the replacement and blocks the line. |
| **V3-PRQ-BR-005** | M | Cost centre must be active, within the requester's data scope, and valid for the requested plant. |
| **V3-PRQ-BR-006** | M | The requester cannot approve their own PR (Vol 0 V0-BR-003), including when they hold the Department Head role for their own department — in that case the workflow escalates to the next level and records why. |
| **V3-PRQ-BR-007** | M | A PR line that is fully ordered cannot be edited, cancelled or short-closed; only the PO can change. |
| **V3-PRQ-BR-008** | M | Duplicate detection: on submit, the system checks for another open PR for the same item, plant and need-date window (default ± 7 days) and requires acknowledgement with a reason before proceeding. |
| **V3-PRQ-BR-009** | M | The PR estimated value used for approval routing is computed by the server from reference rates at submission time and MUST NOT be user-editable. A requester cannot lower the approval level by typing a lower estimate. |
| **V3-PRQ-BR-010** | M | Changing quantity, item, plant, cost centre or need date after submission restarts the approval workflow from level 1 (Vol 1 V1-WFL-FR-022). Changing only the remarks does not. |
| **V3-PRQ-BR-011** | M | `EMERGENCY` urgency requires a reason code from `mst_reason_code` scoped to PR-emergency plus free text; it compresses the approval chain per configuration but never removes the final authority level, and every emergency PR is listed on the monthly exception report to the Director. |
| **V3-PRQ-BR-012** | M | An approved PR is **not** a commitment. Nothing in inventory, budget-consumed or finance is posted from a PR — only a soft "requisitioned" reservation against budget, released on cancel, short-close or PO creation. |
| **V3-PRQ-BR-013** | M | Free-text (non-coded) lines MUST NOT be permitted for `DIRECT_MATERIAL` procurement type. Raw material always has an item code. |
| **V3-PRQ-BR-014** | S | A PR line whose item has a valid rate contract MUST default the sourcing decision to `RATE_CONTRACT_CALL_OFF`; choosing `RFQ` instead requires a justification recorded on the line. |

## 2.6 Validations

| # | Validation | Trigger | Severity | Message pattern |
|---|---|---|---|---|
| 1 | Mandatory header fields present (date, plant, department, urgency, procurement type) | Save | Error | "Plant is required" |
| 2 | At least one line | Submit | Error | "A requisition must have at least one line" |
| 3 | Item active, purchasable, not obsolete | Line save | Error | "Item {code} is obsolete. Replacement: {code}" |
| 4 | Quantity > 0, within item precision | Line save | Error | — |
| 5 | UOM valid for the item; conversion exists | Line save | Error | "No conversion from NOS to KG for item {code}" |
| 6 | `required_by_date` ≥ document date | Line save | Error | — |
| 7 | Lead-time feasibility | Line save | Warning | "Earliest achievable date is 24-Aug-2026 (lead time 21 d + 3 d sourcing)" |
| 8 | Cost centre active, in scope, valid for plant | Line save | Error | — |
| 9 | Budget available | Save + Submit | Warn or Block per config | "Cost centre CC-PUR: ₹18.4 L available, this PR requires ₹22.1 L" |
| 10 | Capex line has capital budget/authorisation reference | Submit | Error | — |
| 11 | Duplicate open PR for same item/plant/window | Submit | Warning + acknowledgement | "PR/25-26/00302 already requests 4,000 KG of this item for 20-Aug" |
| 12 | Quantity already covered by open PO | Submit | Warning | "3,000 KG already on open PO PO/25-26/00118 due 18-Aug" |
| 13 | Stock available at another plant | Submit | Warning | "2,400 KG available at Plant 2 — consider a stock transfer" |
| 14 | Emergency urgency has reason code + justification | Submit | Error | — |
| 15 | Approval rule exists for the resolved value and type | Submit | Error | "No approval rule configured for Purchase Requisition, MRO, ₹4,20,000" |
| 16 | Free-text line on direct material | Line save | Error | — |
| 17 | Amendment quantity ≥ already-ordered quantity | Amend save | Error | "Line 2: 3,000 KG already ordered; quantity cannot be reduced below it" |
| 18 | Attachment required for capex / free-text above threshold | Submit | Error | — |
| 19 | Optimistic lock version match | Save | 409 Conflict | Vol 0 §7.9 |
| 20 | Financial period open for the PR date | Save | Error | — |

## 2.7 Approval rules

Configured in the engine (Vol 1 Ch 4); the seeded procurement default is in
[Ch 8 §8.3](08-approval-center.md). Summary for PR:

| Condition | Levels |
|---|---|
| Value ≤ ₹25,000, routine | L1 Department Head *(auto-approve below ₹5,000 configurable)* |
| ₹25,001 – ₹2,00,000 | L1 Department Head → L2 Purchase Manager |
| ₹2,00,001 – ₹10,00,000 | L1 Department Head → L2 Purchase Manager → L3 Factory Manager |
| > ₹10,00,000 | L1 Dept Head → L2 Purchase Mgr → L3 Factory Mgr → L4 Director |
| Capital, any value | L1 Dept Head → L2 Finance Manager → L3 Factory Mgr → L4 Director |
| Emergency, ≤ ₹2,00,000 | L1 Factory Manager only (single level, post-facto review) |
| MRP-generated, within approved plan | L1 Purchase Manager (planning already authorised the demand) |

**V3-PRQ-BR-015 (M)** The approver's decision context (Vol 1 V1-WFL-FR-019) for a PR MUST
include: requester and department, business justification, budget position for the cost
centre, current stock and coverage days, open PO quantity, last purchase rate and date,
whether a rate contract exists, consumption trend, and any duplicate-PR or
stock-available-elsewhere warnings the requester acknowledged.

## 2.8 Screens

### S-PRQ-02 · PR Create / Edit

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Purchase Requisition — New                  [Save Draft] [Submit for Approval] [⋮]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Document ─────────────────────────┐ ┌─ Requirement ───────────────────────────────┐ │
│ │ PR No.    (auto — PR/25-26/…)      │ │ Type *      (•) Direct material             │ │
│ │ Date *    [29-Jul-2026 ▼]          │ │             ( ) Consumable ( ) MRO          │ │
│ │ Plant *   [Plant 1 — Hosur ▼]      │ │             ( ) Capital ( ) Service         │ │
│ │ Dept *    [Production ▼]           │ │ Source      MRP · Plan run 28-Jul-2026      │ │
│ │ Requester Ravi Kumar (auto)        │ │ Urgency *   (•) Routine ( ) Urgent          │ │
│ │ Cost ctr* [CC-PROD-01 ▼]           │ │             ( ) Emergency                    │ │
│ │ Ref       Prod. plan Aug-2026      │ │ Required by* [22-Aug-2026 ▼]                │ │
│ └────────────────────────────────────┘ └─────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Items (3) │ Budget │ Attachments (1) │ Comments │ Approvals │ History                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ #│ Item / description  │ Spec        │ Qty     │UOM│ Need by  │ Est. rate │ Est. value │
│ 1│ SS304 Coil 0.5mm    │0.5×400 2B   │ 6,000   │KG │22-Aug-26 │  245.00 ⓘ │ 14,70,000  │
│  │  ⓘ Stock 2,140 KG · in transit 0 · open PO 3,000 KG (due 18-Aug) · cover 11 d       │
│  │  ⓘ Last buy ₹245.00 · 02-Jun-26 · Jindal   ⚑ Rate contract RC/25-26/004 ₹243.50/kg  │
│  │  ⚠ 3,000 KG already on open PO — net requirement may be 3,000 KG   [Adjust] [Keep]  │
│ 2│ Silicone ring 68mm  │Food grade   │ 50,000  │NOS│20-Aug-26 │    3.20 ⓘ │  1,60,000  │
│  │  ⓘ Stock 12,400 · cover 8 d · AVL: Elasto Poly (rank 1, lead 14 d)                  │
│ 3│ Powder coat RAL5015 │Epoxy-polyest│    400  │KG │18-Aug-26 │  289.00 ⓘ │  1,15,600  │
│  │  ⚠ Earliest achievable 22-Aug (lead 10 d + 3 d sourcing) — need date is 18-Aug      │
│  │  [+ Add line] [Import Excel] [Copy from PR] [From BOM shortage]                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Budget — CC-PROD-01 · Aug-2026 ────────────────────────────────────────────────────┐│
│ │ Budget 2,40,00,000 │ Consumed 1,42,00,000 │ Committed 38,00,000 │ Available 60,00,000││
│ │ This PR 17,45,600  │ ████████████████████████████████░░░░░░░░  After this PR: 75.3% ││
│ └─────────────────────────────────────────────────────────────────────────────────────┘│
│                                                        ESTIMATED TOTAL   ₹17,45,600     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ 1 warning acknowledged, 1 pending.  Approval route: Dept Head → Purchase Mgr →        │
│   Factory Mgr → Director (4 levels, est. 3 working days)              [ Preview route ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Field table — PR header

| Field | Type | Mandatory | Source / rule |
|---|---|---|---|
| PR number | string | auto | Numbering engine, `allocate_on = DRAFT` |
| Revision | int | auto | `R0` on create; increments on amendment |
| PR date | date | Yes | Default today; must be in an open period |
| Company / Branch / Plant | FK | Yes | From tenant context; plant selectable within scope |
| Department | FK | Yes | Default from requester's employee record |
| Requester | FK user | Yes | Logged-in user; changeable only with `VIEW_ALL` + reason |
| Cost centre | FK | Yes | Validated against plant and requester scope |
| Procurement type | enum | Yes | Drives numbering sub-type, matrix, mandatory fields |
| Source type | enum | Yes | `MANUAL` / `MRP` / `REORDER` / … (read-only when generated) |
| Source reference | string | Cond. | MRP run id, reorder job id, breakdown no., project code |
| Urgency | enum | Yes | `ROUTINE` / `URGENT` / `EMERGENCY` |
| Emergency reason code | FK | Cond. | Mandatory when urgency = `EMERGENCY` |
| Justification | text | Cond. | Mandatory for emergency, capex, free-text above threshold |
| Required-by date | date | Yes | Header default; overridable per line |
| Delivery warehouse | FK | No | Default per plant |
| Project / WBS | FK | Cond. | Mandatory for `PROJECT` and `CAPEX` |
| Budget line | FK | Cond. | Mandatory when budget control is `BLOCK` |
| Estimated total | decimal(18,2) | derived | Server-computed; never user-entered |
| Currency | FK | Yes | Company base by default |
| Status / workflow instance | enum / FK | auto | §2.3 |
| Remarks | text | No | — |

### Field table — PR line

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| Line no. | int | auto | Renumbered on reorder; the immutable key is the line `uid` |
| Item | FK | Cond. | Mandatory unless `is_free_text` |
| Free-text description | text | Cond. | Mandatory when no item; blocked for direct material |
| Specification | text | No | Defaults from item master; overridable, and the override is shown on the RFQ |
| Quantity | decimal(18,6) | Yes | > 0 |
| UOM | FK | Yes | Item's purchase or stock UOM; conversion shown |
| Alternate quantity / UOM | decimal / FK | Cond. | Dual-UOM items — computed, editable, recomputed |
| Required-by date | date | Yes | ≥ document date |
| Delivery plant / warehouse | FK | Yes | Defaults from header |
| Cost centre | FK | Yes | Defaults from header; per-line override allowed |
| Account / expense head | FK | Cond. | Mandatory for non-stock and service lines |
| Estimated rate | decimal(18,6) | derived | Reference-rate chain; editable only with permission, and the edit is flagged |
| Estimated value | decimal(18,2) | derived | qty × rate |
| Suggested supplier | FK | derived | AVL rank 1 |
| Rate contract | FK | derived | Valid contract for item + plant |
| Sourcing decision | enum | Cond. | Set after approval, before sourcing |
| Ordered quantity | decimal | derived | Σ of linked PO line quantities |
| Received quantity | derived | derived | Σ of GRN quantities against those POs |
| Line status | enum | derived | `OPEN` / `PARTIALLY_ORDERED` / `ORDERED` / `SHORT_CLOSED` / `CANCELLED` |
| Line remarks | text | No | Carried to the RFQ and PO if flagged |

### S-PRQ-05 · Consolidation Workbench

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PR Consolidation                    [Create RFQ] [Create PO] [Create Rate-contract call-off]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Filters: Approved PRs · need-by 01-Aug → 31-Aug · Plant 1,2 · Direct material           │
│ Group by [Item ▼]  [x] Show only items with >1 PR   [ ] Include urgent only             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ▾ SS304 Coil 0.5×400 2B                        Total 11,500 KG · est. ₹28,17,500        │
│   [x] PR/25-26/00311 L1 · Production · 6,000 KG · need 22-Aug · Ravi K                  │
│   [x] PR/25-26/00318 L1 · Production · 3,500 KG · need 28-Aug · M. Devi                 │
│   [x] PR/25-26/00325 L2 · Plant 2    · 2,000 KG · need 30-Aug · S. Kumar                │
│   ⓘ Price break at 10 T: ₹241.00/kg (−1.6%). Consolidated saving ≈ ₹28,750              │
│   ⓘ Rate contract RC/25-26/004 covers 8,000 KG of remaining commitment                  │
│ ▾ Silicone ring 68mm food grade                Total 1,20,000 NOS · est. ₹3,84,000       │
│   [x] PR/25-26/00311 L2 · 50,000 NOS · need 20-Aug                                      │
│   [x] PR/25-26/00330 L1 · 70,000 NOS · need 05-Sep                                      │
│   ⚠ Need dates 16 days apart — consider a schedule agreement with two deliveries        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 5 lines selected across 4 PRs · est. ₹32,01,500      [ Proceed → RFQ to 3 vendors ]      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-PRQ-01 PR List | Archetype A. Default saved views: My PRs, Pending my approval, Approved not sourced, Overdue need-date, Emergency PRs. Columns include ordered %, received %, ageing days. |
| S-PRQ-03 PR Detail | Archetype C. Right rail: approval progress, document flow (PR → RFQ → quote → PO → GRN), activity timeline. |
| S-PRQ-04 PR from Planned Orders | MRP staging list with net requirement, existing coverage, suggested date, group-and-convert action. |
| S-PRQ-06 Budget Check Panel | Embedded; also available as a modal from the approval decision panel. |
| S-PRQ-07 Sourcing Decision | Per-line decision with system proposal, reason capture, bulk apply. |
| S-PRQ-08 Amendment Diff | Side-by-side R(n) vs R(n+1) with changed fields highlighted and the reason for amendment. |
| S-PRQ-09 Short-close / Cancel | Dialog with reason code, remaining quantity, downstream impact summary. |

## 2.9 Notifications

| Trigger | Recipient | Channel | Urgency |
|---|---|---|---|
| PR submitted | Level-1 approver | In-app, e-mail, push | High |
| PR approved (final) | Requester, buyer queue | In-app, e-mail | Normal |
| PR rejected / returned | Requester | In-app, e-mail | High |
| Approval SLA 50% / 80% elapsed | Current approver | In-app, e-mail | Normal |
| Approval SLA breached | Approver + escalation target | In-app, e-mail, SMS | High |
| Emergency PR raised | Purchase Head, Factory Head | In-app, e-mail, SMS | High |
| Approved PR unsourced > N days | Buyer, Purchase Head | In-app, e-mail | Normal |
| Need date approaching with no PO | Requester, buyer | In-app, e-mail | High |
| PR line fully ordered | Requester | In-app | Low |
| PR cancelled / short-closed | Requester, prior approvers | In-app, e-mail | Normal |
| Budget breach on submit | Requester, cost-centre owner | In-app | High |

## 2.10 Reports contributed

Purchase Requisition Register · Pending PR (by approver, by age) · PR Ageing · PR to PO
Conversion & Cycle Time · Approved-but-Unsourced PR · Emergency PR Exception ·
Department-wise Requisition Analysis · PR vs Budget · Rejected PR Analysis (by reason) ·
Duplicate-demand Suppression Log. Full column specifications in
[Ch 9 §9.2](09-dashboard-and-reports.md).

## 2.11 Dashboard KPIs contributed

| KPI | Definition | Drill-through |
|---|---|---|
| Total PR (period) | Count and value of PRs created | PR list |
| Pending PR approval | Count, value, and oldest age of PRs in `PENDING_APPROVAL` | Approval inbox |
| PR approval TAT | Median working hours submission → final approval | Approval history |
| Approved not sourced | Count, value, oldest age of `APPROVED` PRs with no RFQ/PO | PR list filtered |
| PR → PO cycle time | Median working days approval → PO release | PO list |
| Emergency PR ratio | Emergency PR value ÷ total PR value | Emergency exception report |
| PR rejection rate | Rejected ÷ submitted, with top reasons | Rejection analysis |
| Need-date risk | PR lines whose need date is inside the remaining lead time | PR list filtered |

## 2.12 Audit trail

Every PR records to `core_audit_log` (Vol 0 §12): create, each field change with old and new
value, line add/edit/delete, submit, each approval decision with approver, comments and reason
code, return, reject, reopen, amendment (with the diff), cancellation with reason, short-close
with reason, sourcing-decision change, budget-warning acknowledgement with the acknowledged
text, duplicate-warning acknowledgement, and every print and export with the recipient.

**V3-PRQ-BR-016 (M)** The audit entry for an approval MUST record the **document revision**
approved. Approving R0 does not authorise R1.

## 2.13 Acceptance criteria (extract)

- A PR of ₹17,45,600 routes through exactly 4 levels; one of ₹18,000 through 1.
- A requester who is also the Department Head of the requesting department is skipped as an
  approver and the workflow escalates, with the reason visible in the history.
- Raising a PR for 6,000 KG when 3,000 KG is already on an open PO shows the warning, and the
  acknowledgement text is retrievable from the audit log 12 months later.
- Editing the quantity of a submitted PR returns it to level 1 and both workflow instances
  remain visible.
- Consolidating three PR lines into one PO leaves each PR line showing its ordered quantity and
  the PO line showing all three PR references with quantities.
- A capex PR without a capital budget reference cannot be submitted.
- An MRP-generated PR carries the plan run reference and cannot have its source type changed.
- Cancelling a PR with a released PO against any line is refused, naming the PO.

---

**Next:** [Chapter 3 — Request for Quotation](03-request-for-quotation.md)
