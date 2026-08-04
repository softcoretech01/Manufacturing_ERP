# Volume 4 · Chapter 9 — Valuation, Ageing & Costing

**Area code:** `VAL`
Prerequisite: [Ch 2](02-stock-model-and-enquiry.md) · Vol 9 (GL, account determination, period close)
Numbering: `REVALUATION` → `RVL/{FY}/{SEQ:4}`

---

## 9.1 Purpose

Quantity accuracy makes production work. **Value** accuracy makes the balance sheet true. This
chapter defines how a rate is attached to every movement, how closing stock is computed, and how
that figure reconciles to the general ledger — to the rupee, at every period close.

**V4-VAL-FR-001 (M)** The stock ledger is the single source of inventory value. Finance does not
maintain a parallel stock valuation; it posts what this ledger produces (Vol 9 owns the accounting
entry, this module owns the valued movement).

## 9.2 Valuation methods

| Method | Behaviour | Typical use here |
|---|---|---|
| `WEIGHTED_AVG` (moving average) | Rate recomputed on every receipt: `(existing value + receipt value) ÷ (existing qty + receipt qty)`. Issues at the current average. | Default for raw material, components, consumables, packing |
| `FIFO` | Value held in receipt layers; issues consume the oldest layer first. | Optional for steel where the client wants layer visibility |
| `STANDARD` | Fixed standard cost per item, revised on a controlled cycle; every receipt and issue posts a purchase-price / production variance. | Finished goods, semi-finished |
| `SPECIFIC` | Rate carried by the individual batch or serial. | Capital spares, imported components with distinct landed costs |

| Ref | Pri | Rule |
|---|---|---|
| **V4-VAL-BR-001** | M | The method is an attribute of item × plant (defaulting from the item master and the warehouse), applied by the ledger. A report may never apply a different method than the one the ledger used. |
| **V4-VAL-BR-002** | M | Changing an item's valuation method is effective from a period start only, requires `INVENTORY.VALUATION.REVALUE` plus Finance approval, and generates a revaluation entry that reconciles the old basis to the new. Mid-period changes are refused. |
| **V4-VAL-BR-003** | M | Rates are `DECIMAL(18,6)`; values `DECIMAL(18,2)`, rounded half-up once at persistence. Rounding differences are posted to a configured rounding account, never silently absorbed. |
| **V4-VAL-BR-004** | M | Under `WEIGHTED_AVG`, the recomputation happens under the same lock as the balance update, so two concurrent receipts cannot both compute from the same pre-state. |
| **V4-VAL-BR-005** | M | Issues never change the average rate. Only receipts, revaluations and landed-cost apportionments do. |
| **V4-VAL-BR-006** | M | Where a balance is negative (permitted exception, Ch 2), issues are valued at the last known rate and the resulting value distortion is flagged in the valuation report until the balance is restored. |

## 9.3 Landed cost

| Ref | Pri | Requirement |
|---|---|---|
| **V4-VAL-FR-002** | M | Cost components beyond the basic rate — freight, insurance, customs duty (BCD, SWS, IGST where non-creditable), CHA charges, loading/unloading, inspection charges — are apportioned into stock value through movement `602`. |
| **V4-VAL-FR-003** | M | Apportionment bases are configurable per component: by value, by quantity, by weight, or by volume. The chosen basis is stored on the apportionment document. |
| **V4-VAL-FR-004** | M | Components arriving **after** the material has been partly or fully consumed apportion only to the remaining stock, with the balance posted to a price-difference account. The split is shown before posting, not discovered afterwards. |
| **V4-VAL-FR-005** | M | Creditable taxes (GST input credit) are never part of stock value; non-creditable taxes always are. The determination comes from the tax master and the item's ITC eligibility (Vol 3/9). |
| **V4-VAL-FR-006** | S | An imported consignment shows a landed-cost sheet: FOB, freight, insurance, assessable value, duty, CHA, and the resulting per-unit landed rate against the PO rate. |

## 9.4 Revaluation

| Ref | Pri | Requirement |
|---|---|---|
| **V4-VAL-FR-007** | M | Revaluation changes value without changing quantity (movement `601`), per item × warehouse × batch, with a mandatory reason: standard-cost revision, NRV write-down, valuation-method change, opening-balance correction, or landed-cost catch-up. |
| **V4-VAL-FR-008** | M | Revaluation requires `INVENTORY.VALUATION.REVALUE` to raise and `INVENTORY.VALUATION.APPROVE_REVALUATION` to approve; the two permissions may not be held by the same user for the same document (SoD). |
| **V4-VAL-FR-009** | M | **NRV test (AS-2 / Ind AS-2)**: stock is carried at the lower of cost and net realisable value. A periodic job compares carrying value to NRV — from the current selling price less estimated cost to sell for FG, and from the replacement price for RM — and proposes write-downs. |
| **V4-VAL-FR-010** | M | Standard-cost revision for FG/SF revalues the on-hand stock in one controlled document per revision cycle and reports the variance to Finance. |

## 9.5 Ageing, slow-moving and provisioning

| Ref | Pri | Requirement |
|---|---|---|
| **V4-VAL-FR-011** | M | Ageing is computed from the **receipt date of the batch or FIFO layer**, not from the last movement of the item, and bucketed 0–30, 31–60, 61–90, 91–180, 181–365, > 365 days, with quantity and value in each. |
| **V4-VAL-FR-012** | M | Slow-moving and non-moving analysis by last-issue date (90 / 180 / 365 days) with the value at stake, the reason where known (artwork obsolete, model discontinued, over-purchase, quality hold) and a recommended action. |
| **V4-VAL-FR-013** | M | Provisioning policy is configurable per ageing bucket and item class (e.g. 180–365 days: 25%, > 365 days: 50%, obsolete: 100%). The system **proposes** provisions; Finance approves them; the approved provision is a revaluation, not a hidden report adjustment. |
| **V4-VAL-FR-014** | M | Excess stock analysis: on-hand against average consumption and against the maximum level, showing months of cover and the value of stock beyond the policy maximum. |
| **V4-VAL-FR-015** | S | Obsolescence review workflow: a periodic list circulated to Planning, Purchase, Production and Sales for disposition (use, rework, sell as scrap, return to supplier, write off) with a decision and a deadline per line. |

## 9.6 Period close and GL reconciliation

| Ref | Pri | Requirement |
|---|---|---|
| **V4-VAL-FR-016** | M | **Valuation movement statement** per period and warehouse: opening quantity and value → receipts → issues → transfers → adjustments → revaluations → closing, reconciling arithmetically and drilling to the ledger rows behind each figure. |
| **V4-VAL-FR-017** | M | **GL reconciliation** screen: stock ledger value by account-determination group against the corresponding GL account balances, with the difference itemised by document where any exists. A non-zero difference at close blocks the period close (Vol 9 gate). |
| **V4-VAL-FR-018** | M | Stock in `QUARANTINE`, `REJECTED`, `IN_TRANSIT` and `AT_SUBCONTRACTOR` is included in valuation and shown separately in the closing statement, because the auditor will ask where it physically is. |
| **V4-VAL-FR-019** | M | Once a period is closed, no movement may post into it. A correction posts into the open period referencing the original. |
| **V4-VAL-FR-020** | M | A **stock-as-on-date valuation** for any past date is reproducible from the ledger and must equal the figure reported at that date's close. |

## 9.7 Screens

### S-VAL-02 · Valuation movement

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Valuation Movement — Jul 2026            Plant [Chennai U1 ▼]  Warehouse [All ▼] [Export]│
├──────────────────────┬──────────┬───────────┬───────────┬──────────┬───────────────────┤
│ Group                │ Opening  │ Receipts  │ Issues    │ Adjust   │ Closing           │
├──────────────────────┼──────────┼───────────┼───────────┼──────────┼───────────────────┤
│ Raw material         │  2,41.80 │   1,84.20 │ (1,62.40) │  (0.10)  │  2,63.50 L        │
│ Components           │    62.40 │     41.10 │   (38.90) │  (0.04)  │    64.56 L        │
│ Consumables          │    18.90 │     12.40 │   (11.80) │  (0.02)  │    19.48 L        │
│ Packing              │    32.10 │     22.60 │   (24.10) │     —    │    30.60 L        │
│ WIP                  │    89.40 │   1,62.40 │ (1,71.20) │  (0.14)  │    80.46 L        │
│ Finished goods       │  4,16.20 │   1,71.20 │ (1,58.60) │     —    │  4,28.80 L        │
│ At subcontractor     │    21.40 │     14.80 │   (12.60) │     —    │    23.60 L        │
│ Goods in transit     │    17.20 │      7.60 │    (7.60) │     —    │    17.20 L        │
│ Quarantine / rejected│    14.80 │      9.20 │    (8.40) │     —    │    15.60 L        │
├──────────────────────┼──────────┼───────────┼───────────┼──────────┼───────────────────┤
│ TOTAL                │  9,14.20 │   6,25.50 │ (5,95.60) │  (0.30)  │  9,43.80 L        │
├──────────────────────┴──────────┴───────────┴───────────┴──────────┴───────────────────┤
│ GL stock accounts ₹9,43.80 L · difference ₹0 ✔          [Drill to ledger] [Reconcile GL] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-STK-06 / S-VAL-01 · Ageing & non-moving

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Stock Ageing & Non-moving          As on 29-Jul-2026 · value in ₹ lakh · [Provision ▼]  │
├──────────────────┬────────┬────────┬────────┬────────┬─────────┬────────┬──────────────┤
│ Class            │ 0–30   │ 31–60  │ 61–90  │ 91–180 │ 181–365 │ >365   │ Provision    │
├──────────────────┼────────┼────────┼────────┼────────┼─────────┼────────┼──────────────┤
│ Raw material     │ 148.20 │  62.40 │  31.20 │  18.40 │    3.30 │   0.00 │ ₹0.83 L      │
│ Components       │  28.40 │  18.20 │  11.10 │   5.20 │    1.40 │   0.26 │ ₹0.48 L      │
│ Consumables      │  11.20 │   4.80 │   2.10 │   0.90 │    0.48 │   0.00 │ ₹0.12 L      │
│ Packing ⚠        │  12.40 │   6.20 │   4.10 │   3.60 │    2.90 │   1.40 │ ₹2.13 L      │
│   ⓘ ₹4.30 L is artwork-obsolete (Metro Retail 2024 design) — 100% provision proposed     │
│ Finished goods   │ 214.60 │ 118.40 │  62.10 │  28.40 │    5.30 │   0.00 │ ₹1.33 L      │
├──────────────────┼────────┼────────┼────────┼────────┼─────────┼────────┼──────────────┤
│ TOTAL            │ 414.80 │ 210.00 │ 110.60 │  56.50 │   13.38 │   1.66 │ ₹4.89 L      │
├──────────────────┴────────┴────────┴────────┴────────┴─────────┴────────┴──────────────┤
│ Non-moving > 180 d: ₹15.04 L (1.6% of stock) · target ≤ 5%                               │
│ 14 items · top: PKG-CTN-MTR-24 ₹4.30 L · CMP-LID-OLD ₹2.18 L                             │
│                    [Propose provision] [Send for obsolescence review] [Export]            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-VAL-01 Stock Valuation | By item, warehouse, class, batch; method and rate shown per line; permission-gated. |
| S-VAL-03 Landed Cost Apportionment | Components, basis, per-line allocation, consumed-vs-remaining split before posting. |
| S-VAL-04 GL Reconciliation | Group vs GL account with itemised differences and drill-through. |
| S-ADJ-05 Revaluation | Item/batch selection, old and new value, reason, approval, resulting ledger rows. |

## 9.8 Validations

| # | Validation | Trigger | Severity | Message pattern |
|---|---|---|---|---|
| 1 | Valuation method change only at period start | Save | Error | "Method may change from 01-Aug-2026" |
| 2 | Revaluation raiser ≠ approver | Approve | Error | — |
| 3 | Apportionment total equals the component value | Post | Error | "Allocated ₹1,24,000 of ₹1,26,400" |
| 4 | Apportionment to consumed quantity routed to price difference | Post | Warning + confirmation | "62% already consumed — ₹78,400 to price difference" |
| 5 | Provision within the configured policy or approved as an exception | Approve | Error | — |
| 6 | Open period for the posting date | Post | Error | — |
| 7 | GL difference zero at close | Period close | Error (blocks close) | "Difference ₹1,240 across 2 documents" |
| 8 | Negative-balance valuation flagged | Report | Warning | — |
| 9 | Standard-cost revision covers every affected item | Post | Error | — |
| 10 | NRV write-down does not increase carrying value | Post | Error | — |

## 9.9 Notifications

| Trigger | Recipient | Channel | Urgency |
|---|---|---|---|
| Revaluation submitted / approved | Finance, Materials Manager | In-app, e-mail | Normal |
| GL reconciliation difference detected | Costing, CFO | In-app, e-mail | High |
| Non-moving stock crosses the target | Materials Manager, CFO | E-mail | Normal |
| Provision proposal ready | Finance | In-app, e-mail | Normal |
| NRV write-down proposed | CFO | In-app, e-mail | High |
| Landed cost apportioned after consumption | Costing | In-app | Normal |
| Period close blocked by an inventory difference | CFO, Materials Manager | In-app, e-mail | Critical |

## 9.10 Reports contributed

Stock Valuation (item / warehouse / class / batch) · Valuation Movement (opening → closing) ·
GL Reconciliation · Stock Ageing · Slow & Non-moving · Excess Stock vs Consumption ·
Provision Register · Landed-cost Sheet · Standard vs Actual Cost Variance · Revaluation Register ·
Stock as on Date · Inventory Turns & Days of Cover.

## 9.11 Audit trail

Every valuation-method change with the approver and effective date, every revaluation with old and
new value, reason, approvers and resulting ledger rows, landed-cost apportionments with the basis
and the consumed/remaining split, provisions with the policy applied and any override, GL
reconciliation runs with their differences, and every value report export with the user, filter
and row count (value data is sensitive and its distribution is tracked).

## 9.12 Acceptance criteria (extract)

- A receipt of 2,640 kg at ₹247.10 against 9,500 kg at ₹242.30 produces a moving-average rate of
  ₹243.35, and the next issue posts at exactly that rate.
- Two concurrent receipts of the same item both post, and the resulting average equals the
  serialised calculation.
- Freight of ₹1,26,400 apportioned by weight across three items allocates to the rupee, with the
  portion relating to consumed quantity posted to price difference and shown before posting.
- Closing stock for July equals opening + receipts − issues ± adjustments ± revaluations, and
  equals the GL stock accounts to the rupee.
- Stock valuation as on 31-Mar-2026, run today, equals the figure reported at that close.
- Ageing buckets are computed from batch receipt dates: a batch received in January still ages,
  even if the item as a whole moved last week.
- A Store Operator cannot open any screen in this chapter, and value columns are absent — not
  blanked — from their exports.

---

**Next:** [Chapter 10 — Replenishment & Availability](10-replenishment-and-availability.md)
