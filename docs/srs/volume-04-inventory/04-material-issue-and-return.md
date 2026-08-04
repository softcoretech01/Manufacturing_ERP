# Volume 4 · Chapter 4 — Material Issue & Return

**Area code:** `ISS`
Prerequisite: [Ch 2](02-stock-model-and-enquiry.md) · [Ch 7](07-batch-serial-and-traceability.md)
Numbering: `MATERIAL_REQUISITION` → `{PLANT}/MRQ/{FY}/{SEQ:6}` · `MATERIAL_ISSUE` →
`{PLANT}/MI/{FY}/{SEQ:6}` · `MATERIAL_RETURN` → `{PLANT}/MR/{FY}/{SEQ:5}`

---

## 4.1 Purpose

Issue is where inventory value becomes cost, and where most inventory accuracy is lost. Two
rules carry the whole chapter:

1. **Nothing leaves the store without a document.** A verbal issue recorded later is an
   unrecorded issue (pain P-02).
2. **What went out must be reconciled against what should have gone out.** Issue against a BOM
   standard with a variance, not against a request with a blank cheque.

**V4-ISS-FR-001 (M)** No material issue may be posted without either an approved material
requisition, a released production order, or a document type explicitly configured as
requisition-exempt (default: none for direct material; configurable for shop-floor consumables
below a value threshold).

## 4.2 Document chain

```
  Production order (Vol 6)        Cost centre / project        Dispatch (Vol 8)
  released, BOM exploded          maintenance, admin           delivery challan
            │                            │                            │
            ▼                            ▼                            ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  MATERIAL REQUISITION  (who needs what, when, charged where)  ⛿ approve │
   └───────────────────────────────┬────────────────────────────────────────┘
                                   ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  PICK LIST / WAVE  (bin- and batch-resolved, sequenced for the walk)    │
   └───────────────────────────────┬────────────────────────────────────────┘
                                   ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  MATERIAL ISSUE  (posted: stock ↓, WIP/expense ↑, movement 201/202/205) │
   └───────────────────────────────┬────────────────────────────────────────┘
                                   ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  MATERIAL RETURN  (unconsumed, residual coil, wrong item) → stock ↑     │
   └────────────────────────────────────────────────────────────────────────┘
```

## 4.3 Status flow — material issue

```
   ┌─────────┐  submit   ┌──────────────────┐  approve  ┌───────────┐
   │  DRAFT  ├──────────►│ PENDING_APPROVAL ├──────────►│ APPROVED  │
   └────┬────┘           └────────┬─────────┘           └─────┬─────┘
        │ delete (soft)           │ reject                    │ pick & post
        │                         ▼                           ▼
        │                   ┌──────────┐              ┌────────────────┐
        │                   │ REJECTED │              │ PARTIALLY_     │
        │                   └──────────┘              │ ISSUED         │
        │                                             └───────┬────────┘
        │                                                     │ all lines issued
        │                                                     ▼
        │                                             ┌────────────────┐
        └────────────────────────────────────────────►│ ISSUED         │
                                                      └───────┬────────┘
                                       return posted          │ short-close (reason)
                                              ┌───────────────┴──────────┐
                                              ▼                          ▼
                                       ┌─────────────┐          ┌──────────────┐
                                       │ RETURNED /  │          │ SHORT_CLOSED │
                                       │ ADJUSTED    │          └──────────────┘
                                       └─────────────┘
   CANCELLED is reachable from DRAFT, PENDING_APPROVAL and APPROVED (before any posting),
   always with a reason code. An ISSUED document is never cancelled — it is returned or adjusted.
```

## 4.4 Functional requirements — requisition

| Ref | Pri | Requirement |
|---|---|---|
| **V4-ISS-FR-002** | M | A requisition carries: requesting department/cost centre, production order or work order (where applicable), required-by date and shift, priority, and per line item, quantity, UOM, and the purpose. |
| **V4-ISS-FR-003** | M | Where the requisition references a production order, lines are **defaulted from the BOM** for the order quantity, showing standard quantity, already-issued quantity and the balance — the requester adjusts rather than types from memory. |
| **V4-ISS-FR-004** | M | Each line shows live availability at the issuing warehouse: free quantity, reserved, the batch that FEFO/FIFO would pick, and a shortage flag with the expected receipt date if insufficient. |
| **V4-ISS-FR-005** | M | Requisition approval is configurable by value, item class and cost centre (Ch 11). Routine shop-floor consumables may be configured to auto-approve; the gate exists either way. |
| **V4-ISS-FR-006** | S | Standing requisitions for recurring shift consumption, generated on a schedule and requiring only confirmation. |

## 4.5 Functional requirements — picking and issue

| Ref | Pri | Requirement |
|---|---|---|
| **V4-ISS-FR-007** | M | The system resolves each line to **bin and batch** using the warehouse pick strategy (Ch 1 §1.5), with FEFO forced where an expiry exists. The proposal is shown with its reason and may be overridden with the appropriate permission and a reason. |
| **V4-ISS-FR-008** | M | A pick list may be generated per requisition, per production order, or as a **wave** covering many requisitions, sequenced by bin pick order so the picker walks the store once. |
| **V4-ISS-FR-009** | M | Issue posts movement `201` (production order), `202` (cost centre / expense), `204` (dispatch, from Vol 8) or `205` (sample/free) with the value taken from the item's valuation method at the moment of posting (Ch 9). |
| **V4-ISS-FR-010** | M | **Partial issue** is normal: a line may be issued across several documents until the requisition line is complete or short-closed with a reason. |
| **V4-ISS-FR-011** | M | **Over-issue control**: issuing more than the BOM standard for the order quantity (plus the item's tolerance) requires `INVENTORY.MATERIAL_ISSUE.OVERRIDE_BOM`, a reason code and a comment; every over-issue is on a standing exception report and feeds the consumption-variance analysis. |
| **V4-ISS-FR-012** | M | **Kitting**: issue an entire BOM kit for a production order in one action, with per-component batch resolution and a single confirmation. |
| **V4-ISS-FR-013** | S | **Backflush**: for configured items (fasteners, adhesives, low-value consumables), consumption is posted automatically at operation confirmation (Vol 6) at BOM standard, with a periodic reconciliation against physical count. Backflush is never used for batch-traced or high-value material. |
| **V4-ISS-FR-014** | M | Scan-first mobile issue: scan the requisition/production order → scan the bin/batch label → enter or scan quantity → confirm. Offline capable, with a queued post and conflict handling (Ch 14). |

## 4.6 Functional requirements — return to store

| Ref | Pri | Requirement |
|---|---|---|
| **V4-ISS-FR-015** | M | Unconsumed material MUST be returnable against the issue document, restoring quantity to the **same batch** and, by default, the same bin, at the rate at which it was issued. |
| **V4-ISS-FR-016** | M | **Residual returns** (part coil, part drum) capture a weighment reference and the residual quantity; the returned batch keeps its identity and its remaining shelf life. |
| **V4-ISS-FR-017** | M | Returned material carries a **condition**: `GOOD` (back to available), `SUSPECT` (quarantine for re-inspection), `DAMAGED` (blocked, routed to scrap/write-off, Ch 6). Condition is mandatory. |
| **V4-ISS-FR-018** | M | Return quantity may not exceed the issued quantity net of prior returns for that issue line and batch. |
| **V4-ISS-FR-019** | M | At production order closure, any material issued and not consumed or returned is reported as a variance and must be explained before the order can be closed (Vol 6 gate, this module supplies the numbers). |

## 4.7 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V4-ISS-BR-001** | M | Issue is refused when free stock at the resolved location/batch is insufficient (Ch 2 §2.5). "Issue anyway" does not exist. |
| **V4-ISS-BR-002** | M | Blocked, quarantined, rejected and expired stock is never issuable, and never appears in a pick proposal. |
| **V4-ISS-BR-003** | M | Issuing against a production order requires the order to be `RELEASED` and not `CLOSED`; the item must appear in that order's BOM unless the line is flagged as an unplanned issue with a reason. |
| **V4-ISS-BR-004** | M | The batch actually issued is recorded on the production order's consumption record and becomes part of the genealogy of what is made from it (Ch 7). Issuing without recording the batch for a batch-managed item is impossible by construction. |
| **V4-ISS-BR-005** | M | The issue rate is the valuation rate at the posting instant, computed by the ledger. It is never entered by the user and never edited afterwards; a correction is a revaluation (Ch 9). |
| **V4-ISS-BR-006** | M | The requester and the issuer may be the same person only where the company parameter `allow_self_issue` is on; otherwise issuing one's own requisition is refused (SoD, Ch 11). |
| **V4-ISS-BR-007** | M | An issue document cannot be edited after posting. Corrections are a return or an adjustment, both with reasons. |
| **V4-ISS-BR-008** | M | Reserved stock (Ch 10) may only be issued against the reservation that holds it, or after the reservation is explicitly released by someone with `INVENTORY.RESERVATION.RELEASE`. |
| **V4-ISS-BR-009** | S | Where the item is dual-UOM, the issue may be entered in either UOM; the ledger stores the base UOM with the conversion factor used. |

## 4.8 Screens

### S-ISS-04 · Material issue against a production order

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Material Issue — New                    [Save draft] [Post issue] [Print pick list]    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Document ──────────────────────┐ ┌─ Charge to ─────────────────────────────────────┐ │
│ │ MI No.   (auto)                 │ │ Type *  (•) Production order ( ) Cost centre    │ │
│ │ Date *   [29-Jul-2026]          │ │ Order * [PRD/2607/0114 🔍] VF750 Black · 5,000  │ │
│ │ Plant *  [Chennai — Unit 1 ▼]   │ │ Operation [OP-20 Deep draw ▼]  Shift [A ▼]      │ │
│ │ From WH* [RM-01 ▼]              │ │ Cost ctr  CC-PRD-01 (from order)                │ │
│ │ Issued to* [T. Ganesh 🔍]       │ │ Requisition P1/MRQ/26-27/004418 · approved      │ │
│ └─────────────────────────────────┘ └─────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Lines (3) │ Batches │ Attachments │ Comments │ Approvals │ History                      │
├──┬────────────────────┬────────┬────────┬────────┬─────────────────────┬────────────────┤
│ #│ Item               │ BOM std│ Issued │ Now    │ Bin · batch (FIFO)  │ Available      │
├──┼────────────────────┼────────┼────────┼────────┼─────────────────────┼────────────────┤
│ 1│ RM-SS304-050    KG │ 2,450  │  1,200 │ 1,250  │ CY-01 · B2606-H4471 │ 8,900 ✔        │
│  │ ⓘ FIFO: oldest heat 4471 received 02-Jun · MTC verified                               │
│ 2│ CMP-LID-SCR-SS NOS │ 5,000  │      0 │ 5,000  │ A-04-2-1 · B2607021 │ 38,300 ✔       │
│ 3│ CON-PWD-BLK     KG │   120  │      0 │   140  │ BLK-01 · B2604011   │ 1,090 ✔        │
│  │ ⚠ 140 exceeds BOM standard 120 by 16.7% (tolerance 5%) — reason required               │
│  │   Reason [Trial run — new nozzle ▼]  Comment [Higher overspray on first 500 pcs   ]   │
│  │ ⓘ FEFO: batch B2604011 expires 18-Aug-2026 (20 days) — issued first                   │
├──┴────────────────────┴────────┴────────┴────────┴─────────────────────┴────────────────┤
│ Value of this issue ₹3,52,918 (hidden for Store Operator)   ⚠ 1 over-issue on this doc   │
│ Approval: auto-approved (within shift consumption limit)          [Post issue & print]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Field table — issue header

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| Issue number | string | auto | Numbering engine, allocate on approval |
| Issue date / time | datetime | Yes | Open period; back-dating needs permission |
| Plant, from warehouse | FK | Yes | Within the user's data scope |
| Charge type | enum | Yes | `PRODUCTION_ORDER` / `COST_CENTRE` / `PROJECT` / `DISPATCH` / `SAMPLE` |
| Production order / work order | FK | Cond. | Required for `PRODUCTION_ORDER`; must be released |
| Operation | FK | No | Where operation-level consumption is tracked |
| Cost centre / expense head | FK | Cond. | Required for `COST_CENTRE` |
| Requisition | FK | Cond. | Per `V4-ISS-FR-001` |
| Issued to (person) | FK employee | Yes | Physical custody |
| Shift | FK | No | Defaults from the time of posting |
| Status | enum | auto | §4.3 |
| Total value | decimal(18,2) | derived | Permission-gated field (Ch 11 §11.4) |

### Field table — issue line

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| Item | FK | Yes | Active, stocked, eligible for the warehouse |
| BOM standard quantity | decimal | derived | For the order quantity; blank for non-order issues |
| Already issued | decimal | derived | Σ prior issues on the order for this item |
| Quantity | decimal(18,6) | Yes | > 0; over-BOM needs permission + reason |
| UOM | FK | Yes | Base or alternate; factor stored |
| Bin | FK | Cond. | Mandatory for bin-managed warehouses |
| Batch | FK | Cond. | Mandatory for batch-managed items; FEFO/FIFO proposed |
| Serial(s) | list | Cond. | Serial-managed items |
| Rate / value | decimal | derived | From valuation; never entered |
| Reason code | FK | Cond. | Over-issue, unplanned issue, strategy override |
| Line remarks | text | No | — |

### Other screens

| Screen | Notes |
|---|---|
| S-ISS-01/02 Requisition list & create | Saved views: my requisitions, pending approval, approved-not-issued, shortage-blocked. |
| S-ISS-03 Issue list | Views: today's issues, by production order, over-issues, unreturned balances. |
| S-ISS-05 Batch/bin picking drawer | Shows every candidate bin/batch with age, expiry, quantity and the strategy's choice highlighted; manual selection records a reason. |
| S-ISS-06 Pick list / wave | Grouped by bin sequence with a printable and a scanner version; supports partial confirmation. |
| S-ISS-07 Kitting | One-click BOM kit issue with per-component resolution and a shortage summary before posting. |
| S-ISS-08 Return to store | Against an issue; condition per line; residual weighment capture. |
| S-ISS-09 Consumption vs BOM | Per production order and per period: standard, issued, returned, net consumed, variance %, top contributors. |

## 4.9 Validations

| # | Validation | Trigger | Severity | Message pattern |
|---|---|---|---|---|
| 1 | Requisition approved and not cancelled | Post | Error | — |
| 2 | Production order released, not closed | Post | Error | "PRD/2607/0114 is CLOSED — reopen it or issue to a cost centre" |
| 3 | Free stock sufficient at the resolved bin/batch | Post | Error | "Bin CY-01 batch B2606-H4471 has 900 KG; 1,250 KG requested" |
| 4 | Stock status is `AVAILABLE` | Post | Error | — |
| 5 | Batch not expired and not blocked | Post | Error | "Batch B2604011 expired 18-Aug-2026" |
| 6 | FEFO honoured or override permitted | Post | Error / permission | "Batch B2605009 expires earlier — FEFO override required" |
| 7 | Quantity ≤ BOM standard + tolerance | Post | Warning → Error without permission | "Exceeds standard by 16.7% (tolerance 5%)" |
| 8 | Item is in the order's BOM | Post | Warning + reason | "Item is not in the BOM of PRD/2607/0114" |
| 9 | Serial numbers exist, are in stock and are unique to this issue | Post | Error | — |
| 10 | Reserved stock issued against its own reservation | Post | Error | "3,000 KG is reserved for SO/26-27/00219" |
| 11 | Self-issue where prohibited | Post | Error | — |
| 12 | Return quantity ≤ issued net of prior returns | Return post | Error | — |
| 13 | Return condition present | Return post | Error | — |
| 14 | Open period | Post | Error | — |
| 15 | Optimistic lock on balance rows | Post | 409 Conflict | — |

## 4.10 Notifications

| Trigger | Recipient | Channel | Urgency |
|---|---|---|---|
| Requisition submitted | Approver | In-app, push | High |
| Requisition approved / rejected | Requester, store queue | In-app | Normal |
| Requisition blocked by shortage | Requester, planner, buyer | In-app, e-mail | High |
| Pick list ready | Store operator | In-app, push | Normal |
| Issue posted | Requester, production supervisor | In-app | Low |
| Over-issue beyond tolerance | Production Manager, Stores In-charge | In-app, e-mail | High |
| FEFO override used | Quality Head, Stores In-charge | In-app, e-mail | High |
| Material issued and unreturned at order closure | Production Manager, Stores In-charge | In-app, e-mail | High |
| Backflush reconciliation variance beyond tolerance | Stores In-charge, Costing | In-app, e-mail | Normal |

## 4.11 Reports contributed

Material Issue Register · Issue by Production Order / Cost Centre / Item · Consumption vs BOM
Variance · Over-issue Exceptions · FEFO Override Log · Return to Store Register · Unreturned
Issued Material · Pick Performance (lines per hour, short picks) · Backflush Reconciliation ·
Shift-wise Consumption.

## 4.12 Audit trail

Requisition create/submit/approve/reject with approver and comments, every pick proposal with the
proposed and chosen bin/batch, over-issue reason and comment text, FEFO/strategy overrides,
posting with the resulting ledger row ids, returns with condition and weighment reference,
short-close with reason, and every value-field view by a user who holds `VIEW_VALUE`.

## 4.13 Acceptance criteria (extract)

- A requisition against a released production order defaults its lines from the BOM with standard
  and already-issued quantities filled in.
- Issuing 140 kg of powder against a 120 kg standard is refused without `OVERRIDE_BOM`; with the
  permission it requires a reason code and appears on the over-issue report the same day.
- The pick proposal for a shelf-life item always names the earliest-expiry available batch, and an
  override without permission is refused.
- Issuing a batch-managed item records the batch on the production order's consumption, and the
  finished bottle's genealogy shows that heat number (Ch 7).
- Returning 180 kg of residual coil restores it to batch `B2606-H4471`, not to a new batch, and at
  the rate it was issued.
- Posting the same mobile issue twice with one `Idempotency-Key` moves the stock once.
- A Store Operator sees quantities but no value anywhere on the screen or in the export.

---

**Next:** [Chapter 5 — Stock Transfer](05-stock-transfer.md)
