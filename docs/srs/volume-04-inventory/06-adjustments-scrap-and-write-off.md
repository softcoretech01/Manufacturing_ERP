# Volume 4 · Chapter 6 — Adjustment, Scrap & Write-off

**Area code:** `ADJ`
Prerequisite: [Ch 2](02-stock-model-and-enquiry.md) · [Ch 11](11-permissions-and-roles.md) (SoD)
Numbering: `STOCK_ADJUSTMENT` → `ADJ/{FY}/{SEQ:4}` · `SCRAP_NOTE` → `{PLANT}/SCR/{FY}/{SEQ:4}` ·
`WRITE_OFF` → `WO/{FY}/{SEQ:4}`

---

## 6.1 Purpose

An adjustment is an admission that the system and the shelf disagree. It is therefore the most
abused document in any ERP and the one that needs the tightest controls: a reason, a maker who is
not the checker, an approval scaled to value, and a report that nobody can quietly avoid.

**V4-ADJ-FR-001 (M)** Stock quantity may be changed outside a business document **only** through
an adjustment, a count variance (Ch 8), a scrap note or a write-off — each with a mandatory
reason code, an approval and a valued ledger entry. There is no other path, for any role,
including administrators.

## 6.2 Document types

| Document | Purpose | Movement | Value treatment |
|---|---|---|---|
| **Stock adjustment** | Correct a quantity error found outside a count | `401` / `402` | Adjustment account (Vol 9) |
| **Count variance** | Post the difference found by a count (Ch 8) | `403` / `404` | Variance account |
| **Scrap note** | Material physically destroyed or degraded to scrap value | `405` out; optional `401` in of a scrap item at NRV | Scrap expense / recovery |
| **Write-off** | Expired, obsolete or unrecoverable stock removed | `406` | Provision or expense |
| **Revaluation** | Value changes, quantity does not (Ch 9) | `601` | Revaluation account |

## 6.3 Status flow

```
   ┌─────────┐ submit  ┌──────────────────┐ approve  ┌──────────┐  post   ┌────────┐
   │  DRAFT  ├────────►│ PENDING_APPROVAL ├─────────►│ APPROVED ├────────►│ POSTED │
   └────┬────┘         └────────┬─────────┘          └────┬─────┘         └────────┘
        │ delete (soft)         │ reject                  │ cancel (before posting)
        │                       ▼                         ▼
        │                 ┌──────────┐             ┌───────────┐
        └────────────────►│ REJECTED │             │ CANCELLED │
                          └──────────┘             └───────────┘
   POSTED is terminal. A wrong posting is corrected by an opposite adjustment that
   references it — never by editing, deleting or reversing in place.
```

## 6.4 Functional requirements

| Ref | Pri | Requirement |
|---|---|---|
| **V4-ADJ-FR-002** | M | Adjustment lines are location-specific: item, warehouse, bin, batch, serial, current system quantity (shown, read-only), physical quantity or the delta, and the resulting quantity. The system quantity is captured **at document creation** and re-verified at posting; if it changed in between, posting is refused and the document must be refreshed. |
| **V4-ADJ-FR-003** | M | A reason code from `mst_reason_code` scoped to the document type is mandatory per line, plus free-text where the reason is configured to require it. Reason codes are grouped by root cause: `WEIGHMENT_DIFFERENCE`, `MEASUREMENT_ERROR`, `DATA_ENTRY_ERROR`, `PILFERAGE`, `SPILLAGE`, `EVAPORATION`, `DAMAGE_IN_HANDLING`, `RECEIPT_ERROR`, `ISSUE_ERROR`, `SYSTEM_MIGRATION`, `OTHER`. |
| **V4-ADJ-FR-004** | M | Approval is by **absolute value** of the adjustment, configured per company (Ch 11 §11.5). The default seed: ≤ ₹10,000 Stores In-charge; ≤ ₹1,00,000 Materials Manager; ≤ ₹5,00,000 Factory Head; above that, Director, with Finance as a parallel approver above ₹1,00,000. |
| **V4-ADJ-FR-005** | M | **Segregation of duties**: the raiser of an adjustment may never approve it, irrespective of role or value (seeded SoD rule `sod-05`). Where the raiser is the only holder of the approving role, the workflow escalates and records why. |
| **V4-ADJ-FR-006** | M | Adjustments are valued at the item's current valuation rate; the user cannot enter a rate. A value-only correction is a revaluation (Ch 9), which is a different document and a different permission. |
| **V4-ADJ-FR-007** | M | **Scrap notes** capture the source (production rejection, handling damage, expiry, machine trial), the responsible cost centre, and whether a saleable scrap item is generated. Where it is, the scrap item is received into the scrap warehouse at net realisable value in the same posting. |
| **V4-ADJ-FR-008** | M | **Write-off** requires a proposal listing the candidate stock with age, last movement date, provision already held (Ch 9) and the proposed accounting treatment, and carries a higher approval level than an adjustment of the same value. |
| **V4-ADJ-FR-009** | M | Expired batches are proposed for write-off automatically by a scheduled job; they are never written off automatically. |
| **V4-ADJ-FR-010** | M | Every adjustment, scrap and write-off is included in the **adjustment ratio** KPI (absolute adjustment value ÷ closing stock value) reported monthly to the Factory Head and Finance, broken down by reason code. |
| **V4-ADJ-FR-011** | S | Bulk adjustment by Excel import for cutover and for post-stocktake corrections, with a row-level validation report and the same approval path — a bulk file does not bypass the gate. |

## 6.5 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V4-ADJ-BR-001** | M | An adjustment may not drive a balance negative, ever — not even where the warehouse permits negative stock. A negative physical count is impossible and indicates an error elsewhere. |
| **V4-ADJ-BR-002** | M | Serial-managed items adjust by naming individual serials, never by quantity alone. |
| **V4-ADJ-BR-003** | M | An adjustment against a batch keeps the batch identity, expiry and QC status; it cannot be used to move stock between batches. That is a transfer plus a status change, or two adjustments with reasons. |
| **V4-ADJ-BR-004** | M | Adjustments are blocked for locations and items frozen by an in-progress count (Ch 8 §8.6). The count is the correction mechanism during a count. |
| **V4-ADJ-BR-005** | M | The posting date must be in an open financial period; back-dating requires permission and a reason and is reported. |
| **V4-ADJ-BR-006** | M | Once posted, an adjustment is immutable. A correcting adjustment must reference the original document number, and the pair is visible together on the register. |
| **V4-ADJ-BR-007** | M | Scrap generated from a production rejection must reference the production order and, where known, the defect code (Vol 7), so scrap analysis connects to quality data rather than living as an unexplained cost. |
| **V4-ADJ-BR-008** | M | Write-off of stock still under a QC hold or awaiting a supplier return decision is refused until that decision is made — the material may be recoverable from the supplier (Vol 3). |
| **V4-ADJ-BR-009** | S | Repeated adjustments on the same item × bin (default: 3 in 90 days) raise a governance flag on the item and trigger a mandatory cycle count of that location. |

## 6.6 Screens

### S-ADJ-02 · Stock adjustment

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Stock Adjustment — New                        [Save draft] [Submit for approval] [⋮]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Date * [29-Jul-2026]   Plant * [Chennai — Unit 1 ▼]   Warehouse * [RM-01 ▼]              │
│ Category * (•) Quantity correction ( ) Damage ( ) Expiry ( ) Pilferage ( ) Migration     │
│ Reference  [Weighbridge slip WB/26/8841              ]  Attachments (2) 📎                │
├──┬────────────────┬────────────┬──────────┬─────────┬─────────┬────────┬────────────────┤
│ #│ Item           │ Bin        │ Batch    │ System  │ Physical│ Delta  │ Value impact   │
├──┼────────────────┼────────────┼──────────┼─────────┼─────────┼────────┼────────────────┤
│ 1│ RM-SS304-050 KG│ CY-01      │ B2606-H4471│ 8,900 │  8,868  │  −32   │ −₹7,777        │
│  │ Reason * [Weighment difference ▼]  Note [Coil re-weighed at despatch, −0.36%      ]   │
│ 2│ CON-PWD-BLK  KG│ BLK-01     │ B2604011 │   1,090 │  1,082  │   −8   │ −₹2,496        │
│  │ Reason * [Spillage ▼]  Note [Bag torn during handling on 27-Jul                   ]   │
├──┴────────────────┴────────────┴──────────┴─────────┴─────────┴────────┴────────────────┤
│ Net value impact −₹10,273   ⓘ Below ₹10,000 per line but ₹10,273 in total → Materials Mgr│
│ ⚠ You raised this document — you cannot approve it (SoD rule: adjustment entry vs approval)│
│ Approval route: Stores In-charge (M. Lakshmi) → Materials Manager (K. Ravi)               │
│                                                        [Submit for approval]              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-ADJ-03 · Scrap note

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Scrap / Damage Note — New                                     [Save] [Submit]          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Source * (•) Production rejection ( ) Handling damage ( ) Expiry ( ) Machine trial       │
│ Production order [PRD/2607/0114 🔍]  Operation [OP-30 Welding ▼]  Cost centre CC-PRD-02  │
│ Defect code * [WELD-POROSITY ▼] (Vol 7)      Responsible [Shift A ▼]                     │
├──┬────────────────────┬──────────┬──────────┬────────────┬────────────────────────────┬─┤
│ #│ Item scrapped      │ Batch    │ Qty      │ Book value │ Scrap recovered            │ │
├──┼────────────────────┼──────────┼──────────┼────────────┼────────────────────────────┼─┤
│ 1│ SF-BODY-750    NOS │ B2607014 │      184 │ ₹17,737    │ SS scrap 41.4 KG @ ₹92/kg  │ │
│  │                    │          │          │            │ → SCR-01 · ₹3,809 recovery │ │
├──┴────────────────────┴──────────┴──────────┴────────────┴────────────────────────────┴─┤
│ Net scrap cost ₹13,928 · 3.7% of order quantity (tolerance 2.0%) ⚠ exceeds tolerance      │
│ Approval: Production Manager → Factory Head (above tolerance)          [Submit]           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-ADJ-01 Adjustment List | Views: pending my approval, posted this month, by reason code, repeated-location flags, correcting pairs. |
| S-ADJ-04 Write-off Proposal | System-proposed candidates (expired, non-moving beyond policy, obsolete artwork) with age, provision held and recommended treatment; approver may accept per line. |
| S-ADJ-05 Revaluation | Ch 9. |

## 6.7 Validations

| # | Validation | Trigger | Severity | Message pattern |
|---|---|---|---|---|
| 1 | Reason code present per line | Submit | Error | — |
| 2 | Free-text note present where the reason requires it | Submit | Error | — |
| 3 | Resulting quantity ≥ 0 | Save | Error | "Physical quantity cannot be negative" |
| 4 | System quantity unchanged since creation | Post | Error | "Stock changed since this document was raised — refresh and re-verify" |
| 5 | Location not frozen by an in-progress count | Save / Post | Error | "RM-01 CY-01 is under count CC/26-27/0051" |
| 6 | Approver ≠ raiser | Approve | Error | "Segregation of duties: you raised this document" |
| 7 | Approval level matches the absolute value | Submit | Error | "No approval rule for stock adjustment at ₹6,20,000" |
| 8 | Serial named for serial-managed items | Save | Error | — |
| 9 | Batch belongs to the named item and bin | Save | Error | — |
| 10 | Open financial period | Post | Error | — |
| 11 | Write-off of stock on QC hold or pending supplier return | Submit | Error | — |
| 12 | Scrap from production references an order and defect code | Submit | Error | — |
| 13 | Correcting adjustment references the original document | Save | Error | — |
| 14 | Optimistic lock on balance rows | Post | 409 Conflict | — |

## 6.8 Notifications

| Trigger | Recipient | Channel | Urgency |
|---|---|---|---|
| Adjustment submitted | Approver | In-app, e-mail | Normal |
| Adjustment approved and posted | Raiser, Finance | In-app | Normal |
| Adjustment rejected | Raiser | In-app, e-mail | High |
| Adjustment above ₹1 L posted | Factory Head, CFO | In-app, e-mail | High |
| Pilferage reason used | Factory Head, HR, Security | In-app, e-mail | High |
| Repeated adjustments on one location | Stores In-charge, Materials Manager | In-app | Normal |
| Scrap beyond order tolerance | Production Manager, Quality Head | In-app, e-mail | High |
| Expired stock proposed for write-off | Stores In-charge, Finance | In-app, e-mail | Normal |
| Monthly adjustment ratio above target | Factory Head, CFO | E-mail | Normal |

## 6.9 Reports contributed

Adjustment Register (by reason, by warehouse, by raiser, by approver) · Adjustment Ratio Trend ·
Pilferage & Loss Analysis · Scrap Register with Defect Correlation · Scrap Recovery Value ·
Write-off Register · Expired Stock Register · Repeated-adjustment Locations · Correcting-entry
Log.

## 6.10 Audit trail

Every draft edit with field-level old/new values, submission, each approval decision with
approver, comments and the value band that routed it, posting with the ledger row ids created,
the system quantity captured at creation and re-verified at posting, reason codes and free text,
SoD escalations, bulk-import files with their row counts and rejects, and every correcting entry
linked to its original.

**V4-ADJ-BR-010 (M)** Audit rows for adjustments are retained for the statutory retention period
and are exportable as an auditor pack: document, lines, reasons, approvers, timestamps, and the
resulting ledger entries, in one file.

## 6.11 Acceptance criteria (extract)

- An adjustment cannot be submitted with a blank reason code on any line.
- The raiser cannot approve their own adjustment; the attempt is refused, logged and shown to the
  Materials Manager.
- A ₹6.2 L adjustment routes to the Director and to Finance in parallel; a ₹8,000 one to the
  Stores In-charge only.
- If stock changes between drafting and posting, posting is refused with the new system quantity
  shown.
- Posting a scrap note for 184 rejected bodies removes them from `WIP-01` and creates 41.4 kg of
  SS scrap in `SCR-01` at NRV in the same transaction.
- A posted adjustment cannot be edited or deleted; the correcting document references it and both
  appear together in the register.
- The monthly adjustment ratio report reconciles exactly to the sum of adjustment ledger values
  for the period.

---

**Next:** [Chapter 7 — Batch, Serial & Traceability](07-batch-serial-and-traceability.md)
