# Volume 4 · Chapter 8 — Cycle Count & Physical Verification

**Area code:** `CNT`
Prerequisite: [Ch 2](02-stock-model-and-enquiry.md) · [Ch 6](06-adjustments-scrap-and-write-off.md)
Numbering: `CYCLE_COUNT` → `CC/{FY}/{SEQ:4}` · `PHYSICAL_VERIFICATION` → `PV/{FY}/{SEQ:3}`

---

## 8.1 Purpose

Counting is how the ledger earns the right to be believed. The design goal is not "an annual
stocktake screen" — it is a continuous count programme that finds errors while they are still
explainable, and a variance process that forces a root cause instead of an absorbing entry
(pain P-07).

**V4-CNT-FR-001 (M)** Counting is a **document-driven, blind, two-pass** process: the system
never shows the expected quantity to the counter, a variance beyond tolerance requires a recount
by a different person, and posting a variance requires a reason code, a root-cause class and an
approval scaled to value.

## 8.2 Count programme

| Ref | Pri | Requirement |
|---|---|---|
| **V4-CNT-FR-002** | M | **Count plan** generated from ABC class (Ch 10) with configurable frequency per class — default A: monthly, B: quarterly, C: half-yearly, plus event triggers below. |
| **V4-CNT-FR-003** | M | Event-triggered counts, generated automatically: stock reaching zero, a negative-stock exception, three adjustments on one location in 90 days (Ch 6), a bin reopened after blocking, an item flagged by a customer complaint, and any item on a recall. |
| **V4-CNT-FR-004** | M | A count may be scoped by warehouse, zone, bin range, item class, item, batch, ABC class or a saved selection, and is assigned to a named counter and a due date. |
| **V4-CNT-FR-005** | M | **Coverage tracking**: the plan reports what percentage of items and of stock value has been counted in the period, per warehouse, so gaps are visible before the year end. |
| **V4-CNT-FR-006** | S | Counting workload is levelled — the plan spreads counts across working days rather than dropping a month's worth on the last Friday. |

## 8.3 Counting

| Ref | Pri | Requirement |
|---|---|---|
| **V4-CNT-FR-007** | M | Count sheets are **blind**: the counter sees location, item and UOM, never the system quantity. A sheet that shows the expected figure is not a count. |
| **V4-CNT-FR-008** | M | Counting is possible on paper (printed sheet, keyed later) and on the scanner (scan bin → scan item/batch → enter quantity). Both produce the same document. |
| **V4-CNT-FR-009** | M | Batch- and serial-managed items are counted at batch and serial level. A quantity-only count of a serial item is not accepted. |
| **V4-CNT-FR-010** | M | **Found stock** — material in a bin that the system does not expect — is recordable as a new count line, not discarded. |
| **V4-CNT-FR-011** | M | **Recount**: any line whose variance exceeds the item's tolerance is automatically flagged for a second count, which MUST be performed by a different user. The second count's result is what posts. |
| **V4-CNT-FR-012** | M | Every posted variance carries a reason code **and** a root-cause class: `RECEIPT_ERROR`, `ISSUE_ERROR`, `PUT_AWAY_ERROR`, `WEIGHMENT`, `UOM_CONVERSION`, `PILFERAGE`, `DAMAGE_UNREPORTED`, `SYSTEM_TIMING`, `UNKNOWN`. The share of `UNKNOWN` is itself a reported metric. |
| **V4-CNT-FR-013** | M | Variance approval is by absolute value, with the same SoD rule as adjustments: the counter never approves their own variance. |
| **V4-CNT-FR-014** | M | Posting a count writes movements `403`/`404` per line, valued at the item's current valuation rate, and closes the count. |

## 8.4 Physical verification (full stocktake)

| Ref | Pri | Requirement |
|---|---|---|
| **V4-CNT-FR-015** | M | A full physical verification covers one or more warehouses at a cut-off instant, with a control panel showing progress by zone, counted value vs expected value, open recounts and unapproved variances. |
| **V4-CNT-FR-016** | M | **Freeze**: during a full verification the covered locations are frozen — no issue, receipt, transfer, adjustment or put-away may post against them. Documents raised during the freeze queue and post after it lifts, in the order raised. |
| **V4-CNT-FR-017** | M | Movements that cannot wait (an urgent issue during the count) are possible only with `INVENTORY.CYCLE_COUNT.FREEZE` override, are recorded as **count-period movements**, and are reconciled into the count result explicitly. |
| **V4-CNT-FR-018** | M | The verification produces a signed-off statement per warehouse: opening book value, counted value, variance value, variance %, lines counted, lines with variance, and the approval trail — the document the statutory auditor asks for. |
| **V4-CNT-FR-019** | S | Counts may be conducted by external auditors given a scoped, time-limited login that can enter counts but see neither system quantities nor values. |

## 8.5 Status flow

```
   ┌─────────┐ assign  ┌───────────┐ counting ┌──────────────┐ variance>tol ┌────────────┐
   │ PLANNED ├────────►│ ASSIGNED  ├─────────►│ COUNTED      ├─────────────►│ RECOUNT    │
   └────┬────┘         └───────────┘          └──────┬───────┘              │ REQUIRED   │
        │ cancel                                     │ within tolerance     └─────┬──────┘
        ▼                                            │ or recount done            │ 2nd count
   ┌───────────┐                                     ▼                            │ by another
   │ CANCELLED │                          ┌────────────────────┐◄─────────────────┘  user
   └───────────┘                          │ PENDING_APPROVAL   │
                                          └─────────┬──────────┘
                                                    │ approve
                                                    ▼
                                          ┌────────────────────┐
                                          │ POSTED (403/404)   │
                                          └────────────────────┘
```

## 8.6 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V4-CNT-BR-001** | M | While a count is `ASSIGNED` or `COUNTED` and unposted, the counted locations are frozen for adjustments (Ch 6) and, for a full verification, for all movements. |
| **V4-CNT-BR-002** | M | The counter cannot see the system quantity at any point before entering their count — not in the app, not in the export, not in a tooltip. |
| **V4-CNT-BR-003** | M | A recount is performed by a different user; the system refuses the same user and names the rule. |
| **V4-CNT-BR-004** | M | Tolerance is defined per item class and per value band (e.g. A-class 0.5%, C-class 2%, or an absolute value floor). Within tolerance the variance posts on approval by the Stores In-charge; beyond it, the value-based matrix applies. |
| **V4-CNT-BR-005** | M | A count line for a batch-managed item counts a specific batch. "12,400 pieces of silicone ring" without a batch is not a valid count line for a batch-managed item. |
| **V4-CNT-BR-006** | M | Found stock without an identifiable batch for a batch-managed item is recorded as a quarantined, unidentified-batch line requiring QC disposition — it is never merged into an existing batch. |
| **V4-CNT-BR-007** | M | A count cannot post into a closed financial period. |
| **V4-CNT-BR-008** | M | Posting a count is a single transaction per line group; a partial failure rolls back and reports the failing lines. |
| **V4-CNT-BR-009** | M | Count results are immutable once posted. A subsequent correction is an adjustment (Ch 6) referencing the count. |

## 8.7 Screens

### S-CNT-02 · Blind count sheet

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Count Sheet — CC/26-27/0051      RM-01 · Rack Area A · A-class monthly · due 30-Jul      │
│ Counter: S. Kumar          Pass 1 of 1                        [Save] [Submit count]      │
├──┬────────────┬──────────────────────┬──────────┬──────────┬─────────┬──────────────────┤
│ #│ Bin        │ Item                 │ Batch    │ UOM      │ Counted │ Notes            │
├──┼────────────┼──────────────────────┼──────────┼──────────┼─────────┼──────────────────┤
│ 1│ A-01-1-1   │ CMP-LID-SCR-SS       │ B2607021 │ NOS      │ [12,380]│ 2 boxes opened   │
│ 2│ A-01-1-3   │ CMP-INS-PP-750       │ B2606018 │ NOS      │ [ 8,900]│                  │
│ 3│ A-01-2-1   │ — (bin recorded empty)│ —       │ —        │ [     0]│                  │
│ 4│ A-01-2-2   │ ⊕ Found: CMP-SEAL-68 │ [B?  🔍] │ NOS      │ [ 1,240]│ no label on box  │
│  │            │   ⚠ batch not identified → will be quarantined for QC disposition        │
├──┴────────────┴──────────────────────┴──────────┴──────────┴─────────┴──────────────────┤
│ ⓘ System quantities are hidden until this sheet is submitted.                            │
│ 3 of 24 bins counted · 21 remaining                       [Add found item] [Submit]      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-CNT-03 · Variance & approval

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Count Variance — CC/26-27/0051 · RM-01 Rack Area A       submitted 29-Jul 16:40 S. Kumar │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 24 bins · 21 exact · 3 with variance · net value −₹18,412 · accuracy 87.5%               │
├──┬────────────┬───────────────────┬──────────┬─────────┬────────┬───────┬───────────────┤
│ #│ Bin        │ Item              │ System   │ Counted │ Var    │ Var % │ Value         │
├──┼────────────┼───────────────────┼──────────┼─────────┼────────┼───────┼───────────────┤
│ 1│ A-01-1-1   │ CMP-LID-SCR-SS    │  12,400  │  12,380 │   −20  │ −0.16%│ −₹770  ✔ tol  │
│  │ Reason [Issue error ▼] Root cause [ISSUE_ERROR ▼] Note [Short pick on 24-Jul       ]  │
│ 2│ A-01-1-3   │ CMP-INS-PP-750    │   9,150  │   8,900 │  −250  │ −2.73%│ −₹4,375 ⚠ recount│
│  │ ⛔ Recount required (tolerance 0.5%) — assigned to M. Devi, due 30-Jul 12:00           │
│ 3│ A-01-2-2   │ CMP-SEAL-68 FOUND │       0  │   1,240 │ +1,240 │   —   │ +₹? quarantined│
│  │ ⓘ Unidentified batch — created as quarantined line, QC disposition required            │
├──┴────────────┴───────────────────┴──────────┴─────────┴────────┴───────┴───────────────┤
│ ⚠ 1 line awaiting recount — the count cannot post until it is complete                   │
│ Approval: Stores In-charge → Materials Manager (net value > ₹10,000)                      │
│                                            [Assign recount] [Approve & post] [Reject]     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-CNT-01 Count Plan | Calendar and list of scheduled counts, coverage %, overdue counts, event-triggered counts, assignment and re-assignment. |
| S-CNT-04 Physical Verification Control Panel | Freeze state, progress by zone, counted vs expected value, open recounts, queued documents waiting for the freeze to lift, sign-off. |
| S-CNT-05 Mobile Count | Ch 14; blind by construction, offline-capable, one bin at a time. |

## 8.8 Validations

| # | Validation | Trigger | Severity | Message pattern |
|---|---|---|---|---|
| 1 | Counted quantity ≥ 0 and within item precision | Entry | Error | — |
| 2 | Every planned line counted or explicitly marked not-found | Submit | Error | "6 lines not counted" |
| 3 | Batch named for batch-managed items | Submit | Error | — |
| 4 | Serials listed for serial-managed items | Submit | Error | — |
| 5 | Recount performed by a different user | Submit recount | Error | "M. Devi must perform the recount; you counted pass 1" |
| 6 | Variance beyond tolerance has a completed recount | Approve | Error | — |
| 7 | Reason code and root-cause class per variance line | Approve | Error | — |
| 8 | Approver ≠ counter | Approve | Error | — |
| 9 | Approval level matches the net absolute variance value | Approve | Error | — |
| 10 | Locations frozen during a full verification | Any movement | Error | "RM-01 is frozen for PV/26-27/002 until 31-Jul 06:00" |
| 11 | Open financial period | Post | Error | — |
| 12 | Found stock of a batch-managed item without an identified batch | Post | Forced to quarantine line | — |
| 13 | Count posting atomicity | Post | Error + rollback | — |

## 8.9 Notifications

| Trigger | Recipient | Channel | Urgency |
|---|---|---|---|
| Count assigned | Counter | In-app, push | Normal |
| Count overdue | Counter, Stores In-charge | In-app, e-mail | High |
| Recount required | Second counter, Stores In-charge | In-app, push | High |
| Variance beyond tolerance | Stores In-charge, Materials Manager | In-app, e-mail | High |
| Variance value above ₹1 L | Factory Head, CFO | In-app, e-mail | High |
| Freeze started / lifted | All store users, Production, Dispatch | In-app, e-mail | High |
| Count posted | Finance, Materials Manager | In-app | Normal |
| Coverage below plan at month end | Materials Manager | E-mail | Normal |

## 8.10 Reports contributed

Count Plan & Coverage · Count Sheet (blind, printable) · Variance Report by Value / Item / Bin /
Counter · Inventory Accuracy Trend · Root-cause Analysis of Variances · Recount Register ·
Physical Verification Statement (per warehouse, auditor pack) · Found-stock Register · Count
Productivity (lines per counter-hour).

## 8.11 Audit trail

Plan generation with its parameters, assignment and re-assignment, each count entry with the
counter, device and timestamp, pass number, the fact that the system quantity was hidden, the
recount and its counter, reason codes and root-cause classes, approvals with the value band,
posting with the ledger row ids, freeze start/end and every override movement during a freeze
with its authoriser.

## 8.12 Acceptance criteria (extract)

- A count sheet never shows the system quantity — including in its Excel export and its printed
  form.
- A −2.73% variance on an A-class item (tolerance 0.5%) cannot post without a recount by a
  different user.
- Approving one's own count is refused with the SoD rule named.
- During a full verification of `RM-01`, an attempted material issue from that warehouse is
  refused with the freeze reference and the expected lift time.
- Posting a count writes movement `404` for each shortage at the current valuation rate, and the
  count's net value equals the sum of those ledger rows.
- Found stock of a batch-managed item with no identifiable batch lands in quarantine, not in the
  nearest existing batch.
- The physical verification statement for a warehouse reconciles book value, counted value and
  variance to the rupee, and lists its approvers.

---

**Next:** [Chapter 9 — Valuation, Ageing & Costing](09-valuation-and-ageing.md)
