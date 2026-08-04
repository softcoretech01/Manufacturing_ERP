# Volume 4 · Chapter 14 — Dashboard, Reports, Mobile & UI/UX

Prerequisite: [Vol 0](../volume-00-foundation.md) §14 (reporting), §16 (UI archetypes),
§15 (barcode) · CLAUDE.md §7 (frontend rules)

---

## 14.1 Dashboard

**V4-INV-UIR-002 (M)** The dashboard is **role-adaptive**: the same route renders a different
widget set per role, from the widget catalogue below, filtered by permission. A storekeeper does
not see value widgets; a CFO does not see the put-away queue.

### Widget catalogue

| # | Widget | Definition | Drill-through | Roles |
|---|---|---|---|---|
| W-01 | Stock value | Closing value by class, with month-on-month delta | Valuation | Manager, Finance |
| W-02 | Stock accuracy | Bins counted with zero variance ÷ counted, rolling 90 days | Count variance | All |
| W-03 | Items below reorder | Count and value of the gap | Reorder workbench | Stores, Planning, Purchase |
| W-04 | Stock-out today | Items with free = 0 and open demand | Shortage list | Planning, Production |
| W-05 | Pending put-away | Lines and oldest age in hours | Put-away board | Stores |
| W-06 | Quarantine ageing | Lots and value awaiting QC, oldest age | Quarantine list | Stores, Quality |
| W-07 | Goods in transit | Value and oldest age by route | GIT register | Stores, Finance |
| W-08 | Stock at subcontractor | Value, open challans, oldest, statutory risk | Job-work reconciliation | Stores, Purchase, Finance |
| W-09 | Non-moving stock | Value > 180 days with no movement, % of total | Non-moving analysis | Manager, Finance |
| W-10 | Ageing profile | Stacked bars by bucket and class | Ageing report | Manager, Finance |
| W-11 | Expiry watch | Quantity and value expiring in 7 / 30 days | Expiry register | Stores, Quality, Planning |
| W-12 | Adjustment ratio | Absolute adjustment value ÷ closing value, trended | Adjustment register | Manager, Finance |
| W-13 | Inventory turns | Annualised consumption ÷ average stock, by class | Valuation movement | Manager, Finance |
| W-14 | Days of cover | Distribution across items, with the tail highlighted | Stock enquiry | Planning |
| W-15 | Movement volume | Receipts, issues, transfers by day, last 30 days | Ledger | Stores |
| W-16 | Warehouse occupancy | % bins occupied per warehouse | Warehouse map | Stores |
| W-17 | Count coverage | % of items and value counted this period vs plan | Count plan | Stores, Audit |
| W-18 | Top consumption | Top 10 items by issued value this month | Consumption analysis | Planning, Costing |
| W-19 | Reservation pressure | Reserved ÷ available for FG, top items | Reservations | Sales, Planning |
| W-20 | Open exceptions | Negative stock, unposted counts, failed events | Respective registers | Stores, Admin |

### Storekeeper dashboard (default layout)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Inventory — RM-01, PKG-01 (my warehouses)          Chennai U1 · FY 26-27 · 29-Jul-2026   │
├──────────────────┬──────────────────┬──────────────────┬────────────────────────────────┤
│ PENDING PUT-AWAY │ AWAITING QC      │ ISSUES TODAY     │ COUNTS DUE                     │
│        7         │        4         │        23        │        3                       │
│ oldest 3 h 10 m ⚠│ oldest 2 d ⚠     │ 2 over-issue     │ 1 overdue ⛔                   │
├──────────────────┴──────────────────┴──────────────────┴────────────────────────────────┤
│ NEEDS ATTENTION                                                                          │
│  ▸ 3 items below reorder — RM-SS316-060 (6 d cover), PKG-CTN-24 (4 d) …    [Reorder]     │
│  ▸ 90 KG powder coat expires in 21 days (B2604011)                        [Expiry]      │
│  ▸ 2 bins blocked with stock — A-01-2-1, CY-06                            [Bins]        │
│  ▸ 1 negative-stock exception uncleared since 26-Jul                      [Exceptions]  │
├──────────────────────────────────────────┬───────────────────────────────────────────────┤
│ MOVEMENT — LAST 14 DAYS                  │ WAREHOUSE OCCUPANCY                           │
│  receipts ▇▇▇▅▅▇▃▅▇▇▅▃▇▅                 │  RM-01  ████████████░░░░  72%                 │
│  issues   ▅▇▇▇▅▇▇▅▇▇▇▅▇▇                 │  PKG-01 ██████████████░░  84% ⚠               │
│  transfers ▃▃▅▃▃▅▃▃▅▃▃▃▅▃                │  FG-01  █████████░░░░░░░  61%                 │
├──────────────────────────────────────────┴───────────────────────────────────────────────┤
│ STOCK ACCURACY (rolling 90 d)  98.2% ▲0.4    COUNT COVERAGE  A 100% · B 72% · C 41%      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

## 14.2 Report catalogue

26 reports in 6 groups. Every report: server-side filters, saved views, column chooser,
scheduling, and Excel/PDF/CSV export (Vol 0 §14). Value columns are absent for users without
`INVENTORY.REPORT.VIEW_VALUE`.

### A. Stock position

| # | Report | Key columns | Filters |
|---|---|---|---|
| R-01 | Stock Summary | Item, class, UOM, on hand, free, reserved, quarantine, value | Plant, warehouse, class, item |
| R-02 | Stock Detail (item × warehouse × bin × batch) | + bin, batch, expiry, status, age | + batch, status |
| R-03 | Stock as on Date | As R-01 at a past date | Date, plant, warehouse |
| R-04 | Bin Card / Stock Ledger | Date, document, movement type, in, out, balance, rate | Item, location, date range |
| R-05 | Bin Contents & Occupancy | Bin, item, batch, quantity, utilisation %, last movement | Warehouse, zone |
| R-06 | Negative Stock Exceptions | Item, location, quantity, document, actor, days open | Warehouse |

### B. Movement

| # | Report | Key columns |
|---|---|---|
| R-07 | Receipt Register | Date, source, document, supplier/order, item, batch, quantity, value, status |
| R-08 | Material Issue Register | Date, document, charge, order/cost centre, item, batch, quantity, value |
| R-09 | Consumption vs BOM Variance | Order, item, standard, issued, returned, net, variance %, reason |
| R-10 | Transfer Register | Type, route, item, quantity, dispatched, received, short, GIT age |
| R-11 | Goods in Transit & Ageing | Route, document, value, dispatched on, age, expected on |
| R-12 | Movement Analysis by Type | Movement type, count, quantity, value, by period |

### C. Traceability & quality-linked

| # | Report | Key columns |
|---|---|---|
| R-13 | Batch Register & Balance | Batch, item, supplier heat, received, remaining, expiry, status, QC |
| R-14 | Expiry & Near-expiry | Batch, item, quantity, value, expiry, days left, proposed action |
| R-15 | Serial Register & Warranty | Serial, item, batch, status, customer, dispatch date, warranty end |
| R-16 | Forward / Backward Trace Pack | Full genealogy with documents, MTCs and inspections (PDF pack) |
| R-17 | Quarantine Register & Ageing | Lot, item, batch, quantity, days held, inspection reference |

### D. Counting & control

| # | Report | Key columns |
|---|---|---|
| R-18 | Count Plan & Coverage | Class, planned, counted, coverage %, overdue |
| R-19 | Count Variance | Bin, item, batch, system, counted, variance, value, reason, root cause, counter, approver |
| R-20 | Inventory Accuracy Trend | Period, bins counted, exact, accuracy %, value variance % |
| R-21 | Adjustment & Write-off Register | Document, reason, root cause, quantity, value, raiser, approver |
| R-22 | Scrap Register with Defect Correlation | Order, defect code, item, quantity, book value, recovery, shift |

### E. Valuation & finance

| # | Report | Key columns |
|---|---|---|
| R-23 | Stock Valuation | Item, warehouse, method, quantity, rate, value, batch (optional) |
| R-24 | Valuation Movement | Group, opening, receipts, issues, transfers, adjustments, revaluations, closing |
| R-25 | Ageing & Non-moving with Provision | Class, buckets, non-moving value, provision proposed/approved |
| R-26 | GL Reconciliation | Account group, ledger value, GL balance, difference, itemised documents |

### F. Planning (cross-listed from Ch 10)

Reorder Status & Breach · Shortage List · ABC-XYZ Classification · Reservation & Allocation
Register · Inventory Turns & Days of Cover.

**V4-INV-UIR-003 (M)** Every report is reachable from the KPI it explains. A dashboard number the
user cannot click through to the rows behind it is not acceptable.

## 14.3 Mobile / scanner application

**V4-INV-UIR-004 (M)** The store's primary interface is the scanner, not the desktop. The desktop
screens exist for supervision, exceptions and configuration.

| Screen | Flow | Offline |
|---|---|---|
| Put-away | Scan batch label → scan bin → confirm quantity | Yes |
| Material issue | Scan requisition / production order → scan bin+batch → quantity → confirm | Yes |
| Material return | Scan issue document → scan batch → quantity → condition | Yes |
| Bin transfer | Scan from-bin → scan batch → quantity → scan to-bin | Yes |
| Cycle count | Scan bin → scan item/batch → quantity (blind) | Yes |
| Stock enquiry | Scan item / bin / batch → balances and locations | Read-only cache |
| Label print | Scan batch or bin → reprint with a reason | No |
| Serial lookup | Scan serial → full history | Read-only cache |

| Ref | Pri | Requirement |
|---|---|---|
| **V4-INV-UIR-005** | M | Every transactional screen works offline for a full shift, queues locally, and syncs with an `Idempotency-Key` per transaction. The queue is visible to the operator with a per-item state. |
| **V4-INV-UIR-006** | M | On sync conflict (stock no longer available), the transaction is **rejected with a reason shown to the operator**, never silently dropped and never force-posted. Rejected items stay in the queue for correction. |
| **V4-INV-UIR-007** | M | All targets ≥ 44 px, single-handed operation, high-contrast for poor lighting, and usable with gloves. Numeric entry uses a large keypad, not a text field. |
| **V4-INV-UIR-008** | M | Every scan gives immediate feedback — success/failure sound, vibration and colour — because the operator is not looking at the screen when scanning. |
| **V4-INV-UIR-009** | M | Barcode formats follow Vol 0 §15 (`v1|RM|…`, `v1|LOC|…`, `v1|FG|…`); an unrecognised code shows what was scanned rather than a generic error. |

## 14.4 UI/UX rules for the desktop portal

| Ref | Pri | Requirement |
|---|---|---|
| **V4-INV-UIR-010** | M | Screens use the Vol 0 §16 archetypes. The inventory module introduces no new layout: List, Form, Detail, Board (put-away, warehouse map), Report viewer, Dashboard. |
| **V4-INV-UIR-011** | M | Every list ships with a column chooser, saved views, server-side sort and filter, a bulk-action bar and Excel/PDF/CSV export (CLAUDE.md §7). |
| **V4-INV-UIR-012** | M | Applied filters are always visible as removable chips. Stock lists silently filtered are how people conclude that stock has vanished. |
| **V4-INV-UIR-013** | M | Quantity and value use tabular figures and the shared formatters; quantities show the item's precision, never more. Value columns are **absent** for users without the permission, not blanked. |
| **V4-INV-UIR-014** | M | Status is never encoded by colour alone: every badge carries text (WCAG 2.1 AA, CLAUDE.md §7). |
| **V4-INV-UIR-015** | M | Full keyboard operation on every screen. Store and shop-floor screens must be operable without a mouse. |
| **V4-INV-UIR-016** | M | Every quantity on screen states its bucket. A bare number labelled "stock" is prohibited — it must say on hand, free, reserved or ATP. |
| **V4-INV-UIR-017** | M | Destructive and irreversible actions (post, approve, freeze, block a batch, release a reservation) confirm with the consequence stated in business terms, not "Are you sure?". |
| **V4-INV-UIR-018** | S | Scanned input is accepted anywhere a code is expected on the desktop too, so a wedge scanner works on the supervisor's PC. |

## 14.5 Notifications summary

Consolidated from Chapters 1–10; each is configurable per role and channel in the Vol 1
notification engine, with the defaults shown in each chapter. Critical-urgency events —
stock-out with open demand, batch recall, period close blocked, GL difference — are never
user-disableable.

## 14.6 Acceptance criteria for this chapter

- The dashboard rendered for a Store Operator contains no value widget and no value column, in
  the UI and in the API response.
- Every dashboard number opens the list of rows behind it in one click.
- A scanner disconnected for a full shift posts 40 transactions on reconnect, with duplicates
  impossible and conflicts shown to the operator with the reason.
- Every report exports to Excel, PDF and CSV with the same columns the user is seeing, honouring
  the column chooser and the applied filters.
- Every list screen shows its applied filters as removable chips.
- No screen in this module conveys status by colour alone.
- Every stock figure on every screen is labelled with its bucket.

---

**End of Volume 4.** Index: [README](README.md) · Master index:
[../README.md](../README.md)
