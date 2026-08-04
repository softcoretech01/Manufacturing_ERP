# Volume 4 · Chapter 10 — Replenishment & Availability

**Area code:** `RPL`
Prerequisite: [Ch 2](02-stock-model-and-enquiry.md) · Vol 5 (MRP) · Vol 3 (purchase requisition)

---

## 10.1 Purpose

Two questions, asked constantly, that inventory alone can answer:

1. **"Do we need to buy or make more?"** — replenishment: reorder levels, safety stock, min/max,
   and the signal that goes to Vol 3 as a purchase requisition or to Vol 5 as demand.
2. **"Can I promise this?"** — availability: what is genuinely free after everything already
   committed, and when the next receipt lands.

Answering the second with raw on-hand is the direct cause of pain P-14. Answering the first with
a level last reviewed in 2019 is pain P-13.

## 10.2 Replenishment parameters

| Parameter | Definition | Source |
|---|---|---|
| Safety stock | Buffer against demand and lead-time variability | Calculated (§10.3) or manual per item × plant |
| Reorder level | Safety stock + (average daily demand × lead time) | Calculated, reviewable |
| Reorder quantity | EOQ, or a fixed lot, or up-to-max | Calculated or manual |
| Minimum level | Below which an urgent signal is raised | Manual, ≥ safety stock |
| Maximum level | Above which stock is excess | Manual or from coverage policy |
| Lead time | Supplier lead time + internal processing | Item × supplier (Vol 3), with actuals fed back |
| Review period | Continuous or periodic | Per item class |
| ABC / XYZ class | Value class × demand-volatility class | Calculated (§10.5) |

| Ref | Pri | Requirement |
|---|---|---|
| **V4-RPL-FR-001** | M | Parameters are held per item × plant × warehouse (where warehouse-level replenishment applies), effective-dated, with the calculation that produced them and the date they were last reviewed. |
| **V4-RPL-FR-002** | M | Manual overrides are permitted, flagged as manual, and require a reason — so a review can tell a calculated level from someone's guess. |
| **V4-RPL-FR-003** | M | Levels are **recalculated** on a schedule (default monthly) from actual consumption and actual lead times; the proposal is reviewed and applied, never applied silently. |
| **V4-RPL-FR-004** | M | Items whose parameters have not been reviewed within the configured window appear on a stale-parameter report. |

## 10.3 Calculations

```
average daily demand (ADD)  = consumption in the review window ÷ working days in the window
demand std deviation  (σd)  = std deviation of daily consumption over the window
lead time (LT), σLT         = mean and std deviation of actual receipt lead times

safety stock  = Z(service level) × √( LT × σd²  +  ADD² × σLT² )
reorder level = (ADD × LT) + safety stock
EOQ           = √( 2 × annual demand × ordering cost ÷ (unit cost × carrying cost %) )
coverage days = free stock ÷ ADD
months of cover (excess test) = on hand ÷ (ADD × 30)
```

| Ref | Pri | Rule |
|---|---|---|
| **V4-RPL-BR-001** | M | Service level Z is configurable per ABC class (default A 98%, B 95%, C 90%) and is master data, not a constant in code. |
| **V4-RPL-BR-002** | M | Consumption used in the calculation excludes one-off abnormal issues flagged as such (trial runs, samples, scrap events), so a single trial does not permanently inflate the buffer. |
| **V4-RPL-BR-003** | M | Lead time uses **actual** receipt performance (PO release → GRN) with the supplier's quoted lead time as a fallback for items with fewer than three receipts. |
| **V4-RPL-BR-004** | M | Reorder quantity respects the item's MOQ, pack size and rounding rule (a coil is not ordered in 37.4 kg). |

## 10.4 Reorder signalling

| Ref | Pri | Requirement |
|---|---|---|
| **V4-RPL-FR-005** | M | A scheduled job evaluates free stock + on order + in transit against the reorder level per item × plant and raises a **reorder breach** signal. |
| **V4-RPL-FR-006** | M | The signal is emitted as the domain event `inventory.reorder.breached`, which Vol 3 turns into a purchase requisition (or Vol 5 into a planned order for made items). Inventory never creates a purchase requisition itself. |
| **V4-RPL-FR-007** | M | Duplicate suppression: no new signal is raised while an open PR, open PO or open production order already covers the shortfall for the same item, plant and need window. The suppressed quantity is recorded and visible. |
| **V4-RPL-FR-008** | M | The signal payload carries the decision context the approver will need: on hand, free, reserved, on order with dates, reorder level, safety stock, ADD, coverage days, last purchase rate and supplier, and whether stock exists at another plant. |
| **V4-RPL-FR-009** | M | Where another plant holds surplus above its own maximum, the workbench proposes a **stock transfer** instead of a purchase, and the decision is recorded either way (see Ch 5 `V4-TRF-FR-013`). |
| **V4-RPL-FR-010** | S | Below the **minimum** level the signal is escalated as urgent, notifying the buyer and the planner directly rather than waiting for the next planning cycle. |

## 10.5 ABC-XYZ classification

| Ref | Pri | Requirement |
|---|---|---|
| **V4-RPL-FR-011** | M | ABC by annual consumption value (default A 70%, B 20%, C 10% of cumulative value), recalculated on a schedule, with the class stored on the item × plant record and used by count frequency (Ch 8), service level and review period. |
| **V4-RPL-FR-012** | S | XYZ by demand volatility (coefficient of variation: X < 0.5 steady, Y 0.5–1.0 variable, Z > 1.0 erratic), combined into a 3 × 3 policy grid — AX items get tight continuous review, CZ items get a simple min/max. |
| **V4-RPL-FR-013** | S | Class changes between runs are reported, because an item moving from C to A is a governance event, not a silent update. |

## 10.6 Reservation, allocation and ATP

| Ref | Pri | Requirement |
|---|---|---|
| **V4-RPL-FR-014** | M | A **reservation** is a soft claim on available stock for a specific demand (sales order, production order, transfer, sample) with a quantity, a required date, a priority and an expiry. It reduces free stock without moving anything. |
| **V4-RPL-FR-015** | M | An **allocation** is a hard claim resolved to batch and bin, created when picking begins. Allocated stock cannot be reserved or picked for anything else. |
| **V4-RPL-FR-016** | M | Reservations expire automatically at their expiry date, releasing the stock and notifying the holder. Perpetual reservations do not exist. |
| **V4-RPL-FR-017** | M | Priority-based release: a higher-priority demand may take reserved stock only through an explicit override by `INVENTORY.RESERVATION.OVERRIDE`, with a reason, and the displaced holder is notified. |
| **V4-RPL-FR-018** | M | **ATP** for a date = free stock + confirmed receipts (open PO, production order, inbound transfer) due on or before that date − confirmed demand due on or before that date. ATP is a query, computed live, never a stored figure. |
| **V4-RPL-FR-019** | M | **CTP** (capable-to-promise) delegates to Vol 5 when ATP is insufficient — the answer becomes "what date can we make it by", and this module supplies the material position that answer depends on. |
| **V4-RPL-FR-020** | M | A **shortage list** shows every demand line that cannot be met from free stock, with the gap, the earliest covering receipt, the affected order and customer, and the days late. |

## 10.7 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V4-RPL-BR-005** | M | Reservations are made against **available** stock only. Quarantined, blocked, expired and in-transit stock cannot be reserved. |
| **V4-RPL-BR-006** | M | Σ reservations for an item × location may never exceed available stock. Over-reservation is refused, not queued. |
| **V4-RPL-BR-007** | M | Releasing another user's reservation requires the override permission and notifies the holder — silently taking someone's stock is the fastest way to make the system untrusted. |
| **V4-RPL-BR-008** | M | ATP excludes stock in warehouses flagged `include_in_atp = false` (quarantine, reject, scrap, sample, subcontractor, transit). |
| **V4-RPL-BR-009** | M | Reorder evaluation runs per plant, not company-wide; a surplus at Hosur does not suppress a Chennai shortage unless a transfer is actually proposed and accepted. |
| **V4-RPL-BR-010** | S | Seasonal profiles may be applied to ADD for FG items (summer and gifting peaks), configured as master data per item group. |

## 10.8 Screens

### S-RPL-01 · Reorder & min/max workbench

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Reorder & Replenishment           Plant [Chennai U1 ▼] Class [All ▼] [Recalculate levels]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 14 items below reorder · 3 below minimum · ₹42.8 L to order · 2 covered by transfer      │
├────────┬──────────────────┬──────┬────────┬────────┬────────┬───────┬───────┬───────────┤
│ ABC/XYZ│ Item             │ Free │ On ord │ Reorder│ Safety │ Cover │ Sugg. │ Action    │
├────────┼──────────────────┼──────┼────────┼────────┼────────┼───────┼───────┼───────────┤
│ A / X  │ RM-SS304-050  KG │ 9,140│ 20,000 │  8,000 │  3,200 │  11 d │     — │ covered ✔ │
│ A / X  │ RM-SS316-060  KG │ 3,420│      0 │  3,000 │  1,200 │   6 d⚠│ 6,000 │ [Raise PR]│
│  ⓘ ADD 570 KG · LT 21 d (actual avg 24 d) · last ₹412/kg Bhansali · MOQ 3,000 · EOQ 5,840│
│ B / Y  │ CMP-LID-SCR-SS NOS│38,300│30,000 │ 20,000 │  8,000 │  24 d │     — │ ok        │
│ B / X  │ CON-PWD-BLK   KG │ 1,090│    400 │    900 │    300 │  18 d │     — │ ok        │
│  ⚠ 90 KG expiring in 21 d — effective cover 16 d                                         │
│ C / Z  │ PKG-CTN-24    NOS│ 1,240│      0 │  2,000 │    800 │   4 d⛔│ 8,000 │ [Raise PR]│
│  ⓘ Hosur holds 6,400 above its maximum → [Propose transfer] instead of purchase           │
├────────┴──────────────────┴──────┴────────┴────────┴────────┴───────┴───────┴───────────┤
│ Selected 2 · [Raise consolidated PR] [Propose transfers] [Override level] [Export]        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-STK-05 · Reservations & allocations

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Reservations & Allocations        Item [FG-SS-750-BLK 🔍]  Warehouse [FG-01 ▼]           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ On hand 4,860 · available 4,860 · reserved 3,708 · allocated 1,152 · free 0 ⚠            │
├──────────────┬────────────┬────────┬──────────┬──────────┬─────────┬────────────────────┤
│ Demand       │ Customer   │ Qty    │ Required │ Priority │ State   │ Expires            │
├──────────────┼────────────┼────────┼──────────┼──────────┼─────────┼────────────────────┤
│ SO/26-27/0219│ Metro Retail│ 1,152 │ 31-Jul-26│ HIGH     │ALLOCATED│ picked, batch B2607021│
│ SO/26-27/0224│ Gift Bazaar│ 2,400  │ 04-Aug-26│ NORMAL   │RESERVED │ 06-Aug-26          │
│ ST/26-27/0412│ Cbe Depot  │ 1,156  │ 02-Aug-26│ NORMAL   │RESERVED │ 05-Aug-26          │
│ PRD/2608/0009│ (internal) │   152  │ 06-Aug-26│ LOW      │RESERVED │ 08-Aug-26          │
├──────────────┴────────────┴────────┴──────────┴──────────┴─────────┴────────────────────┤
│ ⚠ Reserved exceeds available by 0 — next demand cannot be promised before 06-Aug          │
│ ATP: 0 today · 4,860 on 06-Aug (PRD/2608/0009 output)     [Override] [Release] [ATP calc] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-RPL-02 Shortage List | Demand lines that cannot be met, gap, earliest covering receipt, affected customer/order, days late, and the action taken. |
| S-RPL-03 ABC-XYZ | Matrix view with item counts and value share per cell, class-change log, and the policy applied to each cell. |
| S-RPL-04 Slow & Non-moving | Shared with Ch 9; here it drives disposition rather than provisioning. |

## 10.9 Validations

| # | Validation | Trigger | Severity | Message pattern |
|---|---|---|---|---|
| 1 | Minimum ≤ reorder ≤ maximum | Save | Error | — |
| 2 | Safety stock ≤ reorder level | Save | Error | — |
| 3 | Manual override has a reason | Save | Error | — |
| 4 | Reorder quantity respects MOQ and pack size | Save / propose | Warning | "Rounded 5,840 → 6,000 KG (MOQ 3,000, pack 1,000)" |
| 5 | Reservation ≤ available at that location | Reserve | Error | "Only 1,152 NOS available; 2,400 requested" |
| 6 | Reservation on non-available status | Reserve | Error | — |
| 7 | Reservation expiry ≥ required date | Reserve | Error | — |
| 8 | Releasing another user's reservation | Release | Permission + notification | — |
| 9 | Duplicate reorder signal suppressed | Job | Info + log | "Suppressed: PO/26-27/00118 covers 20,000 KG due 18-Aug" |
| 10 | Recalculation window has sufficient history | Recalculate | Warning | "Only 22 days of consumption — using supplier lead time" |

## 10.10 Notifications

| Trigger | Recipient | Channel | Urgency |
|---|---|---|---|
| Reorder level breached | Buyer, planner | In-app, e-mail | Normal |
| Minimum level breached | Buyer, planner, Materials Manager | In-app, e-mail, SMS | High |
| Stock-out (free = 0 with open demand) | Planner, Production Manager, Sales | In-app, e-mail | Critical |
| Reservation expiring in 24 h | Holder | In-app | Normal |
| Reservation released by override | Displaced holder | In-app, e-mail | High |
| Shortage affecting a confirmed sales order | Sales, Customer Service, Planner | In-app, e-mail | High |
| Level recalculation proposal ready | Planner, Materials Manager | In-app | Normal |
| ABC class changed | Planner, Materials Manager | In-app | Low |
| Stale parameters (not reviewed in the window) | Materials Manager | E-mail | Normal |

## 10.11 Reports contributed

Reorder Status & Breach · Below-minimum Exceptions · Stock-out Register · Coverage Days by Item ·
Safety Stock vs Actual Buffer Consumption · ABC-XYZ Classification & Change Log ·
Reservation & Allocation Register · Expired Reservations · Shortage List · ATP Simulation ·
Excess Stock vs Maximum · Transfer-instead-of-purchase Savings.

## 10.12 Audit trail

Every parameter change with old and new value, whether calculated or manual, the reason, and the
calculation inputs; every recalculation run with its window and results; reorder signals raised
and suppressed with the suppressing document; reservations created, consumed, expired, released
and overridden with the actor, reason and displaced holder; and every ATP query that resulted in a
customer promise (retained with the answer given, because it will be disputed later).

## 10.13 Acceptance criteria (extract)

- With ADD 570 kg, lead time 21 days and safety stock 1,200 kg, the reorder level computes to
  13,170 kg; changing the service level to 98% raises safety stock and the level accordingly.
- A reorder breach raises exactly one signal, and no further signal while an open PO covers the
  shortfall — with the covering PO named in the suppression log.
- Reserving 2,400 units when 1,152 are available is refused.
- A reservation expires at its date, returns the stock to free, and notifies the holder.
- Taking reserved stock for a higher-priority order requires the override permission and notifies
  the displaced holder.
- ATP for today returns 0 when everything on hand is reserved, and returns the correct future date
  from the open production order.
- Quarantined stock never appears in ATP, in free stock, or in a reservation candidate list.
- The reorder signal payload contains every field the Vol 3 approver needs, so no approver has to
  open the inventory module to decide.

---

**Next:** [Chapter 11 — Permissions, Roles & Workflow](11-permissions-and-roles.md)
