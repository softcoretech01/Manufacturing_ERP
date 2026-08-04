# Volume 4 — Inventory & Warehouse Management

**Stainless Steel Water Bottle Manufacturing ERP**
Functional Requirements Document · Version 0.1 (draft) · 2026-07-29

> **Prerequisites, not repeated here:**
> [Volume 0 — Foundation](../volume-00-foundation.md) (data standards §7, API standards §8,
> security §9, **standard transaction document pattern §10**, numbering §11, audit §12,
> notification §13, reporting §14, **barcode §15**, UI archetypes §16, events §18, NFRs §19)
> and [Volume 1 — Core Framework](../volume-01-core-framework/) (IAM, org structure — which
> owns the **warehouse and bin master tables** — numbering engine, workflow & approval engine,
> audit, notification, master data).
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
| 5 | Functional Specifications | Chapters 1–10 |
| 6 | Screen-wise Fields | Chapters 1–10 (field tables per screen) |
| 7 | Status Flow | Chapters 3–8 (state machine per document) |
| 8 | Approval Workflow | [Chapter 11](11-permissions-and-roles.md) §11.5 |
| 9 | Business Rules | Chapters 1–10 (`BR` rows) |
| 10 | Validations | Chapters 1–10 (validation tables) |
| 11 | Dashboard Design | [Chapter 14](14-dashboard-reports-and-uiux.md) §14.1 |
| 12 | Reports | [Chapter 14](14-dashboard-reports-and-uiux.md) §14.2 |
| 13 | User Roles & Permissions | [Chapter 11](11-permissions-and-roles.md) |
| 14 | Database Entities | [Chapter 12](12-data-model.md) |
| 15 | API Requirements | [Chapter 13](13-api-events-and-integration.md) |
| 16 | UI/UX Recommendations | [Chapter 14](14-dashboard-reports-and-uiux.md) §14.4 |

## Chapters

| Ch | Area code | Title | Covers |
|---|---|---|---|
| — | `INV` | This file | Business analysis, process flow, menu, screen list, actors, scope |
| 1 | `WHS` | [Warehouse, Zone & Bin](01-warehouse-bin-and-storage.md) | Warehouse types, storage hierarchy, bin master, capacity, put-away & pick strategies, bin blocking, warehouse map |
| 2 | `STK` | [Stock Model & Enquiry](02-stock-model-and-enquiry.md) | The stock balance model, stock statuses, buckets, the stock ledger, enquiry and drill-down screens, negative-stock policy |
| 3 | `RCP` | [Receipts & Put-away](03-receipts-and-putaway.md) | Posting from GRN, production receipt, subcontract receipt, sales return, quarantine and QC release, put-away, labelling |
| 4 | `ISS` | [Material Issue & Return](04-material-issue-and-return.md) | Issue to production order / cost centre / project, picking, kitting, backflush, over-issue control, return to store |
| 5 | `TRF` | [Stock Transfer](05-stock-transfer.md) | Bin-to-bin, warehouse-to-warehouse, inter-plant with goods-in-transit, subcontract challan movement, gate pass |
| 6 | `ADJ` | [Adjustment, Scrap & Write-off](06-adjustments-scrap-and-write-off.md) | Quantity and value adjustment, reason codes, scrap, damage, write-off, revaluation, approval and SoD |
| 7 | `BAT` | [Batch, Serial & Traceability](07-batch-serial-and-traceability.md) | Batch/lot/heat, serial numbers, shelf life & FEFO, MTC linkage, genealogy, forward/backward trace, recall |
| 8 | `CNT` | [Cycle Count & Physical Verification](08-cycle-count-and-verification.md) | ABC-driven count plan, blind count, recount, variance approval, full stocktake, count freeze |
| 9 | `VAL` | [Valuation, Ageing & Costing](09-valuation-and-ageing.md) | Weighted average / FIFO / standard, landed cost, revaluation, ageing, slow & non-moving, provisioning, GL interface |
| 10 | `RPL` | [Replenishment & Availability](10-replenishment-and-availability.md) | Min/max, reorder level, safety stock, ABC-XYZ, reservation & allocation, ATP, shortage list |
| 11 | — | [Permissions, Roles & Workflow](11-permissions-and-roles.md) | Permission catalogue, role matrix, data scope, field security, SoD, approval matrices |
| 12 | — | [Data Model](12-data-model.md) | All tables, keys, indexes, relationships, ER diagram, the ledger design |
| 13 | — | [API, Events & Integration](13-api-events-and-integration.md) | Endpoint catalogue, payload shapes, events published/subscribed, WMS/scanner/weighbridge integration |
| 14 | — | [Dashboard, Reports, Mobile & UI/UX](14-dashboard-reports-and-uiux.md) | KPI definitions, widget catalogue, report catalogue, mobile scope, UX rules, acceptance criteria |

---

## Module objective

**V4-INV-FR-001 (M)** Maintain, at every moment, a quantity and a value for every item in every
storage location — provable against a physical count, traceable to the document that created it
and to the heat or batch it came from, and available to planning, production, sales and finance
through one authoritative balance rather than four private opinions.

Four outcomes define success:

1. **One balance.** There is exactly one stock figure per item × warehouse × bin × batch ×
   status, derived from an append-only ledger. No screen computes its own.
2. **No unexplained movement.** Every change in that balance is a posted document with a type,
   a reason, an actor and an approval trail. Stock never simply changes.
3. **Traceable both ways.** From a dispatched carton back to the SS coil heat number and its
   mill test certificate, and forward from a suspect heat to every carton that contains it — in
   minutes, not days.
4. **Believable value.** Closing stock value reconciles to the general ledger to the rupee, and
   the movement between two closing values is explainable line by line.

## In scope

Warehouse, zone and bin structure and strategies · the stock balance and stock ledger model ·
goods receipt posting and put-away · quarantine and QC release · material issue, picking,
kitting, backflush and return · bin, warehouse and inter-plant transfers with goods-in-transit ·
subcontract (job-work) stock at vendor · stock adjustment, scrap, damage and write-off ·
batch/lot/heat and serial management, shelf life, FEFO and full genealogy · cycle counting and
physical verification · valuation (weighted average, FIFO, standard), landed cost, revaluation,
ageing, non-moving and provisioning · reorder, min/max, safety stock, reservation, allocation
and available-to-promise · inventory dashboards, reports and the scan-driven mobile store app.

## Out of scope (and where it lives)

| Item | Owner |
|---|---|
| Warehouse / bin **master table definition** and generic master behaviour | Vol 1 Ch 2 (Organisation Structure). This volume adds the operational strategies, capacity model and the movement rules that use them. |
| Item master, UOM and conversions, item valuation-method attribute, ABC class attribute | Vol 1 Ch 7 (MDM) |
| Purchase order, GRN document, supplier invoice, purchase return **document** | Vol 3 — GRN approval **emits an event**; this volume posts the stock |
| Incoming, in-process and final inspection execution, sampling, defect capture, NCR | Vol 7 — this volume holds the material in `QUARANTINE` and reacts to the QC decision |
| BOM, routing, MRP net-requirement calculation | Vol 5 — this volume supplies on-hand, reserved, in-transit and ATP as MRP inputs |
| Production order, operation confirmation, WIP progression, FG declaration | Vol 6 — this volume posts the resulting material movements |
| Packing, carton/pallet build, dispatch, e-way bill, delivery challan | Vol 8 — this volume issues the stock against the dispatch document |
| Inventory **GL posting**, stock account determination, period close, costing run | Vol 9 — this volume produces the valued movement; finance posts it |
| Fixed assets, spare capitalisation, tools issued as assets | Vol 10 |
| Approval **engine**, numbering **engine**, notification **engine** | Vol 1 — this volume supplies configuration and context |

---

## 1. Business Analysis

### 1.1 What inventory actually is in this business

A vacuum-flask plant does not hold one kind of stock. It holds seven, and each behaves
differently enough that a single generic "stock item" model fails within a month.

| # | Stock class | Examples | Distinguishing behaviour |
|---|---|---|---|
| 1 | **Steel coil / sheet** | SS 201, 304, 316 in 0.4–0.8 mm | Bought and stocked by **weight**, consumed by **piece**. Held on coil stands, one coil is one batch = one **heat number** with a mill test certificate. Partial coils return to store with a residual weight. Physical count is a weighment, not a tally. |
| 2 | **Components** | Silicone rings, lid bodies, PP inserts, getters | High count, low value, bin-managed, batch-tracked for food-contact compliance. Counting is by weight-per-piece or by standard pack, never one by one. |
| 3 | **Consumables — shelf-life bound** | Powder coat, inks, thinner, flux, adhesives | Batch **and expiry** mandatory. Issue must be FEFO. Expired stock must be blocked automatically, not by memory. |
| 4 | **Packing material** | Inner box, 5-ply carton, sleeve, label, poly bag | Customer- and artwork-specific; obsolete instantly when artwork changes. Bulky, low value, high stock-out impact on dispatch. |
| 5 | **WIP / semi-finished** | Drawn shells, welded bodies, assembled un-coated bottles | Lives between operations, often on the shop floor rather than in a store. Valued at accumulated cost. Must be visible without being physically in a warehouse. |
| 6 | **Finished goods** | Vacuum flasks by model × capacity × colour × lid | SKU-level, **serial-tracked** for warranty, held in FG store and depots, allocated against sales orders, subject to ageing and shelf presentation. |
| 7 | **Material at third parties** | Coating, printing, buffing job work; tooling at vendor; goods with depots | Legally ours, physically elsewhere. Must appear in stock and in valuation, be reconciled against challans, and age against the statutory job-work window. |

**V4-INV-BR-001 (M)** The stock model MUST support all seven classes through one ledger and one
balance table, differentiated by item attributes and location type — **not** by seven parallel
stock tables. A design that special-cases WIP or job-work stock outside the main ledger cannot
produce a reconcilable closing stock value.

### 1.2 Where inventory goes wrong without a system — the as-is pain register

| # | Pain | Consequence | Answered by |
|---|---|---|---|
| P-01 | Stock register maintained in a spreadsheet, updated a day late | Planning works off yesterday's figures; shortages found at the machine | `V4-STK-FR-004` — balance updated in the same transaction as the movement |
| P-02 | Material issued on a verbal request, recorded later or never | Consumption unexplained; BOM variance meaningless | `V4-ISS-FR-001` — no issue without a document and an authorised requisition |
| P-03 | Coil issued to the press, part returned, residual never recorded | Phantom stock; the next job starts short | `V4-ISS-FR-014` — mandatory return of unconsumed balance with residual weight |
| P-04 | Two heats of SS mixed in one bin | Customer audit fails; recall scope becomes the whole month | `V4-BAT-BR-002` — batch-managed items keep batch identity at bin level |
| P-05 | Rejected material stays in the same rack as good material | Rejected steel reaches a customer bottle | `V4-RCP-FR-009` — QC status is a stock attribute; blocked stock cannot be picked |
| P-06 | Coating powder used past its shelf life | Coating failure, whole batch of bottles rejected | `V4-BAT-FR-011` — expiry blocks issue; FEFO is enforced, not advised |
| P-07 | Annual stocktake finds a 6% variance, adjusted in one entry | The variance is absorbed, never explained; the same gap recurs | `V4-CNT-FR-012` — variance requires reason code, approval and root-cause classification |
| P-08 | Job-work material sent out and not reconciled | Company material lost; GST liability under Sec 143 | `V4-TRF-FR-018` — challan-wise reconciliation with statutory ageing |
| P-09 | Stock exists but nobody can find it | Re-purchase of material already held | `V4-WHS-FR-006` — bin-level addressing with put-away discipline |
| P-10 | Negative stock permitted "to keep production going" | Valuation becomes meaningless | `V4-STK-BR-006` — negative stock blocked by default; exception is per-warehouse, logged and reported |
| P-11 | Valuation method applied inconsistently between plants | Closing stock does not reconcile with the GL | `V4-VAL-BR-001` — method is an item × plant attribute, applied by the ledger, never by a report |
| P-12 | Slow and dead stock invisible until the auditor asks | Working capital locked in obsolete artwork cartons | `V4-VAL-FR-016` — ageing and non-moving analysis with automatic provisioning |
| P-13 | Reorder levels set once in 2019 and never revised | Stock-outs on fast movers, excess on slow | `V4-RPL-FR-006` — levels recalculated from consumption, reviewed periodically |
| P-14 | Sales promises stock that is already committed elsewhere | Order accepted, dispatch missed | `V4-RPL-FR-012` — reservation and ATP, not raw on-hand, is what sales sees |
| P-15 | Same physical rack used by two warehouses in the system | Counting reconciles to nothing | `V4-WHS-BR-003` — a bin belongs to exactly one warehouse |

### 1.3 Characteristics of this product that shape the inventory design

| Characteristic | Inventory design consequence |
|---|---|
| SS stocked by **weight**, consumed by **piece** | Every balance carries base-UOM quantity plus, where the item is dual-UOM, an alternate quantity and the conversion basis (grade × thickness × width). Both are shown; the base UOM is what the ledger stores. |
| One coil = one **heat number** = one batch, with an MTC | Batch is mandatory for steel; receipt splits by heat; the MTC document is attached to the **batch**, not to the GRN, so it survives the receipt document. |
| Partial coil returns | Issue and return must handle a **residual quantity** with a weighment reference, and the batch must remain identified through the return. |
| Coating and printing are **subcontracted** | A vendor location is a stock location. Material at a subcontractor is company stock, valued, aged against the job-work window and reconciled challan-wise. |
| Shelf-life consumables | Expiry date on the batch, FEFO picking, automatic block on expiry, near-expiry alerting and a disposal route. |
| Finished bottles are **serial-tracked** | Serial generated at FG receipt, held against the batch, carried to the carton and to the invoice, and used for warranty lookup. |
| Artwork-specific packaging | Packing items carry a customer/artwork reference and become obsolete on artwork change — obsolescence is a first-class stock status, not a comment. |
| Multi-plant with a depot | Inter-plant movement is a two-step posting through **goods in transit**, never a single instantaneous move. |
| Seasonal FG peaks | FG ageing, depot stock visibility and allocation priority matter more than raw-material turns in Q1/Q2. |

### 1.4 Statutory context (India) that this module must respect

| Area | Requirement in this module |
|---|---|
| **Job work (Sec 143 / ITC-04)** | Challan-wise issue and receipt of material at a job worker, with the 1-year (inputs) / 3-year (capital goods) return window tracked and reported; ITC-04 data extract |
| **E-way bill** | Required for stock transfers above the threshold value, including inter-plant and job-work movement; the number and validity are captured on the transfer/challan |
| **Delivery / job-work challan** | Statutory, gapless numbering (Vol 1 Ch 3); a movement out of the premises always has a challan |
| **Closing stock valuation (AS-2 / Ind AS-2)** | Lower of cost and net realisable value; cost formula (weighted average or FIFO) applied consistently; provision for obsolescence disclosed |
| **GST on stock transfer between distinct persons** | Branch/state transfer between separate GSTINs is a taxable supply — the transfer document must be able to carry tax |
| **Excise-era style stock records** | Not applicable, but customer/ISO audits expect a bin-card equivalent — satisfied by the stock ledger per item × location |

**V4-INV-BR-002 (M)** Job-work windows, e-way bill thresholds and tax treatment for transfers
are effective-dated master data behind the `statutory/` adapter (CLAUDE.md §9.7). No threshold
appears in inventory business logic.

### 1.5 Baseline KPI set the module must be able to prove

| KPI | Definition | Target |
|---|---|---|
| Inventory accuracy | Bins counted with zero variance ÷ bins counted | ≥ 98% |
| Value accuracy | Absolute variance value ÷ counted value | ≤ 0.5% |
| Stock-out incidents | Item × day where a required issue could not be met from stock | trended down |
| Inventory turns | Annualised consumption value ÷ average stock value, by class | RM ≥ 8, FG ≥ 6 |
| Days of cover | On-hand ÷ average daily consumption, by item class | RM 15–25 days |
| Non-moving stock | Value with no movement in 90 / 180 / 365 days | ≤ 5% of total value |
| Ageing beyond 180 days | Value share of stock older than 180 days | ≤ 8% |
| Put-away cycle time | GRN approval → put-away confirmed | ≤ 4 working hours |
| Issue cycle time | Requisition approved → material issued | ≤ 2 hours routine |
| Adjustment ratio | Absolute adjustment value ÷ closing value | ≤ 0.3%, trended |
| Job-work stock ageing | Value at vendor beyond 180 days / beyond the statutory window | zero beyond window |
| GL reconciliation gap | Stock ledger value − GL stock account balance | ₹0 at period close |

Every KPI is computed from the ledger, drills through to the movement list that produced it, and
is exposed as a dashboard widget (Ch 14). None is entered manually.

---

## 2. Process Flow

### 2.1 Level 0 — material through the plant

```
   INWARD                 STORAGE              CONSUMPTION            OUTPUT              SETTLEMENT
 ┌──────────┐          ┌────────────┐        ┌─────────────┐      ┌────────────┐      ┌─────────────┐
 │ GRN      │          │ Put-away   │        │ Issue to    │      │ FG receipt │      │ Valuation   │
 │ (Vol 3)  │─────────►│ Quarantine │───────►│ production  │─────►│ from prod. │─────►│ Ageing      │
 │ Prod. rcpt│  stock  │ QC release │ picked │ Backflush   │ made │ Serialise  │      │ Provision   │
 │ Sales rtn│   in     │ Bin/batch  │        │ Return      │      │ Put-away   │      │ GL posting  │
 │ Jobwork  │          │ Transfer   │        │ Scrap       │      │ Allocate   │      │ (Vol 9)     │
 └──────────┘          └────────────┘        └─────────────┘      └────────────┘      └─────────────┘
       │                     │                      │                    │                    │
       └─────────────────────┴──── STOCK LEDGER (append-only) ───────────┴────────────────────┘
                                      │
                    ┌─────────────────┴──────────────────┐
                    │ Balance · Reservation · ATP · Trace │
                    └────────────────────────────────────┘
```

### 2.2 Level 1 — receipt to consumption with control gates

Control gates are marked `⛿`. A gate is never removed; where speed is needed it is configured to
auto-post within a limit (Ch 11).

```
 SUPPLIER        SECURITY / STORES        QUALITY            STORES              PRODUCTION       FINANCE
    │                   │                   │                   │                    │              │
 Material ─────► Gate entry (Vol 3)         │                   │                    │              │
    │            weighment · e-way bill     │                   │                    │              │
    │                   │                   │                   │                    │              │
    │            GOODS RECEIPT NOTE ⛿ (Vol 3 approval)          │                    │              │
    │                   │                                       │                    │              │
    │                   └── event procurement.grn.approved ──►  STOCK RECEIPT (this volume)         │
    │                                                           │  status = QUARANTINE              │
    │                                                           ▼                                   │
    │                                       INCOMING INSPECTION (Vol 7)                             │
    │                                        ┌──────┴───────┐                                       │
    │                                    accepted        rejected                                   │
    │                                        │               │                                      │
    │                                        ▼               ▼                                      │
    │                                  QC RELEASE      BLOCK / move to REJECT store                 │
    │                                  status=AVAILABLE       │                                      │
    │                                        │                └──► Purchase return (Vol 3)           │
    │                                        ▼                                                       │
    │                                  PUT-AWAY ⛿ (bin assignment, label print)                     │
    │                                        │                                                       │
    │                                        ▼                                                       │
    │                                  ── ON HAND, addressable ──                                    │
    │                                        │                                                       │
    │                          ┌─────────────┼──────────────┬─────────────────┐                     │
    │                          ▼             ▼              ▼                 ▼                      │
    │                   MATERIAL ISSUE   TRANSFER      CYCLE COUNT       ADJUSTMENT ⛿               │
    │                   (to prod. order) (bin/WH/plant) (blind count)    (reason + approval)         │
    │                          │             │              │                 │                      │
    │                          ▼             ▼              ▼                 ▼                      │
    │                   consumed at     goods in       variance ⛿       valued movement ─────────►  │
    │                   operation        transit       approval               │              GL (Vol 9)
    │                          │                                              │                      │
    │                          ▼                                              │                      │
    │                   FG RECEIPT (Vol 6) ──► serialise ──► put-away ──► allocate to SO (Vol 2/8)   │
    └────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Movement-type catalogue

Every posting in this module is one of these movement types. The type decides the accounts, the
approval, the direction and whether value moves with quantity.

| Code | Movement | Direction | Source document | Value effect |
|---|---|---|---|---|
| `101` | Goods receipt against PO | + | GRN (Vol 3) | Stock ↑ / GRIR ↑ |
| `102` | GRN reversal | − | GRN cancellation | reverse of 101 |
| `103` | Receipt from production | + | Production entry (Vol 6) | Stock ↑ / WIP ↓ |
| `104` | Receipt of sales return | + | Sales return (Vol 2) | Stock ↑ / COGS ↓ |
| `105` | Receipt from job worker | + | Job-work receipt | Stock ↑ / job-work stock ↓ + processing cost |
| `201` | Issue to production order | − | Material issue | Stock ↓ / WIP ↑ |
| `202` | Issue to cost centre / consumption | − | Material issue | Stock ↓ / expense ↑ |
| `203` | Issue to job worker | − | Job-work challan | location change only, no value change |
| `204` | Issue for dispatch | − | Delivery challan (Vol 8) | Stock ↓ / COGS ↑ |
| `205` | Issue for sample / free | − | Material issue | Stock ↓ / expense ↑ |
| `301` | Bin-to-bin transfer | ± | Stock transfer | none |
| `302` | Warehouse-to-warehouse transfer | ± | Stock transfer | none (same plant) |
| `303` | Inter-plant transfer — dispatch | − | Stock transfer | Stock ↓ / goods-in-transit ↑ |
| `304` | Inter-plant transfer — receipt | + | Stock transfer receipt | Goods-in-transit ↓ / stock ↑ |
| `401` | Adjustment increase | + | Stock adjustment | Stock ↑ / adjustment account |
| `402` | Adjustment decrease | − | Stock adjustment | Stock ↓ / adjustment account |
| `403` | Count variance increase | + | Cycle count / stocktake | Stock ↑ / variance account |
| `404` | Count variance decrease | − | Cycle count / stocktake | Stock ↓ / variance account |
| `405` | Scrap | − | Scrap note | Stock ↓ / scrap expense; scrap item may be received back at NRV |
| `406` | Write-off (damage, expiry, obsolescence) | − | Write-off | Stock ↓ / provision or expense |
| `501` | Status change — quarantine → available | ◇ | QC release | none |
| `502` | Status change — available → blocked | ◇ | QC / stores block | none |
| `601` | Revaluation | ◇ value only | Revaluation document | value ± |
| `602` | Landed-cost apportionment | ◇ value only | Invoice / BOE (Vol 3/9) | value ↑ |

**V4-INV-BR-003 (M)** The movement-type table is **configuration**, not code. Adding a movement
type must not require a deployment; adding one that posts to the GL requires an account
determination row (Vol 9) before it can be used.

### 2.4 Where inventory touches other modules

```
   Vol 3 Procurement ──grn.approved────────► stock receipt        reorder.breached ──► Vol 3 PR
   Vol 7 Quality ─────inspection.completed─► QC release/block     stock.posted ──────► Vol 9 Finance
   Vol 6 Production ──order.released───────► reservation          issue.posted ──────► Vol 6 WIP
   Vol 6 Production ──entry.confirmed──────► FG receipt/backflush stock.balance ─────► Vol 5 MRP
   Vol 2 Sales ───────order.confirmed──────► allocation           atp.query ─────────► Vol 2 Sales
   Vol 8 Dispatch ────challan.approved─────► issue for dispatch   batch.trace ───────► Vol 7 Quality
   Vol 1 MDM ─────────item, warehouse, bin─► all                  count.variance ────► Vol 9 Finance
```

---

## 3. Menu Structure

**V4-INV-UIR-001 (M)** Menu items are generated from the effective permission set, not filtered
client-side. A user without `INVENTORY.VALUATION.VIEW` does not see the valuation group at all —
this is also how the storekeeper is kept away from stock **value** while still working with
stock **quantity**.

```
INVENTORY & STORES
│
├── 1. Dashboard                                        [INVENTORY.DASHBOARD.VIEW]
│
├── 2. Stock
│      ├── Stock Enquiry                                item × warehouse × bin × batch
│      ├── Stock Ledger / Bin Card                      every movement, drillable
│      ├── Batch & Serial Enquiry                       with genealogy
│      ├── Reservations & Allocations                   who has committed what
│      └── Stock Ageing                                 bucketed by receipt date
│
├── 3. Receipts
│      ├── Pending Put-away                             received, not yet binned
│      ├── Goods Receipt Postings                       from GRN, production, returns, job work
│      ├── Quarantine & QC Hold                         awaiting inspection decision
│      └── Label Printing                               batch, bin and pallet labels
│
├── 4. Issues
│      ├── Material Requisitions                        shop-floor demand awaiting issue
│      ├── Material Issue                               against production order / cost centre
│      ├── Pick Lists                                   wave picking, bin sequence
│      ├── Material Return to Store                     unconsumed and residual
│      └── Consumption Analysis                         issued vs BOM standard
│
├── 5. Transfers
│      ├── Bin Transfer                                 within a warehouse
│      ├── Warehouse Transfer                           within a plant
│      ├── Inter-plant Transfer                         with goods-in-transit
│      ├── Goods in Transit                             dispatched, not received
│      └── Subcontract Stock                            material at job worker, challan ageing
│
├── 6. Adjustments
│      ├── Stock Adjustment                             quantity ±, reason coded
│      ├── Scrap & Damage                               with disposal route
│      ├── Write-off                                    expiry, obsolescence
│      └── Revaluation                                  value-only movement
│
├── 7. Counting
│      ├── Count Plan                                   ABC-driven schedule
│      ├── Cycle Count Sheets                           blind count, recount
│      ├── Physical Verification                        full stocktake with freeze
│      └── Variance Approval                            reason, root cause, posting
│
├── 8. Planning & Replenishment
│      ├── Reorder & Min/Max                            levels, coverage, breach list
│      ├── Shortage List                                demand vs availability
│      ├── ABC-XYZ Classification                       value × volatility
│      └── Slow & Non-moving                            ageing, provisioning proposal
│
├── 9. Valuation                                        [INVENTORY.VALUATION.VIEW]
│      ├── Stock Valuation                              by item, warehouse, class
│      ├── Valuation Movement                           opening → receipts → issues → closing
│      ├── Landed Cost                                  apportioned components
│      └── GL Reconciliation                            ledger vs stock account
│
├── 10. Reports                                         see Ch 14 §14.2 — 26 reports in 6 groups
│
└── 11. Settings                                        [INVENTORY.SETTINGS.*]
       ├── Inventory Parameters                         negative stock, tolerances, rounding
       ├── Warehouse & Bin Setup                        → Vol 1 Ch 2, filtered
       ├── Put-away & Pick Strategies                   per warehouse and item class
       ├── Movement Types & Accounts                    with Vol 9 account determination
       ├── Reason Codes                                 adjustment, scrap, return, variance
       ├── Count Plan Configuration                     ABC frequency, tolerance
       └── Label Templates                              → Vol 0 §15 barcode formats
```

---

## 4. Screen List

54 screens. `Archetype` refers to Volume 0 §16.2 (A List · B Form · C Detail · D Wizard ·
E Board · F Dashboard · G Report viewer · M Mobile).

### 4.1 Dashboard & stock enquiry

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-INV-01 | Inventory Dashboard (role-adaptive) | F | Ch 14 |
| S-STK-01 | Stock Enquiry (item × location matrix) | A | Ch 2 |
| S-STK-02 | Item Stock 360 (all locations, batches, movements) | C | Ch 2 |
| S-STK-03 | Stock Ledger / Bin Card | A / G | Ch 2 |
| S-STK-04 | Bin Contents Enquiry | A | Ch 1 |
| S-STK-05 | Reservation & Allocation Register | A | Ch 10 |
| S-STK-06 | Stock Ageing | G | Ch 9 |
| S-STK-07 | Negative-stock Exception Register | A | Ch 2 |

### 4.2 Warehouse & bin

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-WHS-01 | Warehouse List (operational view) | A | Ch 1 |
| S-WHS-02 | Warehouse Detail & Strategies | C / B | Ch 1 |
| S-WHS-03 | Zone & Bin Structure | A | Ch 1 |
| S-WHS-04 | Bin Create / Bulk Generate | B / D | Ch 1 |
| S-WHS-05 | Warehouse Map (utilisation heat view) | E | Ch 1 |
| S-WHS-06 | Bin Block / Unblock | (dialog) | Ch 1 |
| S-WHS-07 | Put-away & Pick Strategy Configuration | B | Ch 1 |

### 4.3 Receipts & put-away

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-RCP-01 | Pending Put-away Board | E | Ch 3 |
| S-RCP-02 | Put-away Entry (bin assignment) | B | Ch 3 |
| S-RCP-03 | Stock Receipt Posting Detail | C | Ch 3 |
| S-RCP-04 | Quarantine / QC Hold List | A | Ch 3 |
| S-RCP-05 | QC Release / Block Action | (dialog) | Ch 3 |
| S-RCP-06 | Production Receipt (FG / SF) | B | Ch 3 |
| S-RCP-07 | Sales Return Receipt | B | Ch 3 |
| S-RCP-08 | Job-work Receipt | B | Ch 3 |
| S-RCP-09 | Label Printing (batch / bin / pallet) | B | Ch 3 |
| S-RCP-10 | Mobile Put-away (scan-first) | M | Ch 14 |

### 4.4 Issues & returns

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-ISS-01 | Material Requisition List | A | Ch 4 |
| S-ISS-02 | Material Requisition Create | B | Ch 4 |
| S-ISS-03 | Material Issue List | A | Ch 4 |
| S-ISS-04 | Material Issue Create (against production order) | B | Ch 4 |
| S-ISS-05 | Batch / Bin Picking Panel | (drawer) | Ch 4 |
| S-ISS-06 | Pick List / Wave | A | Ch 4 |
| S-ISS-07 | Kitting / BOM Issue | B | Ch 4 |
| S-ISS-08 | Material Return to Store | B | Ch 4 |
| S-ISS-09 | Consumption vs BOM Analysis | G | Ch 4 |
| S-ISS-10 | Mobile Issue & Return (scan-first) | M | Ch 14 |

### 4.5 Transfers

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-TRF-01 | Transfer List | A | Ch 5 |
| S-TRF-02 | Bin Transfer | B | Ch 5 |
| S-TRF-03 | Warehouse / Inter-plant Transfer | B | Ch 5 |
| S-TRF-04 | Transfer Receipt (at destination) | B | Ch 5 |
| S-TRF-05 | Goods in Transit Register | A | Ch 5 |
| S-TRF-06 | Job-work Challan Issue | B | Ch 5 |
| S-TRF-07 | Job-work Reconciliation & Ageing | A / G | Ch 5 |
| S-TRF-08 | Mobile Bin Transfer | M | Ch 14 |

### 4.6 Adjustments, counting, valuation, planning

| ID | Screen | Archetype | Chapter |
|---|---|---|---|
| S-ADJ-01 | Stock Adjustment List | A | Ch 6 |
| S-ADJ-02 | Stock Adjustment Create | B | Ch 6 |
| S-ADJ-03 | Scrap / Damage Note | B | Ch 6 |
| S-ADJ-04 | Write-off Proposal & Approval | B | Ch 6 |
| S-ADJ-05 | Revaluation | B | Ch 9 |
| S-BAT-01 | Batch Register | A | Ch 7 |
| S-BAT-02 | Batch Detail & Genealogy Tree | C | Ch 7 |
| S-BAT-03 | Serial Register & Warranty Lookup | A | Ch 7 |
| S-BAT-04 | Trace (forward / backward) | C | Ch 7 |
| S-BAT-05 | Expiry & Near-expiry Register | A | Ch 7 |
| S-CNT-01 | Count Plan | A / B | Ch 8 |
| S-CNT-02 | Count Sheet (blind entry) | B | Ch 8 |
| S-CNT-03 | Count Variance & Approval | A / B | Ch 8 |
| S-CNT-04 | Physical Verification Control Panel | C | Ch 8 |
| S-CNT-05 | Mobile Count (scan-first) | M | Ch 14 |
| S-VAL-01 | Stock Valuation Report | G | Ch 9 |
| S-VAL-02 | Valuation Movement (opening → closing) | G | Ch 9 |
| S-VAL-03 | Landed Cost Apportionment | B | Ch 9 |
| S-VAL-04 | GL Reconciliation | G | Ch 9 |
| S-RPL-01 | Reorder & Min/Max Workbench | A | Ch 10 |
| S-RPL-02 | Shortage List | A | Ch 10 |
| S-RPL-03 | ABC-XYZ Classification | G | Ch 10 |
| S-RPL-04 | Slow & Non-moving Analysis | G | Ch 10 |

---

## 5. Actors

| Actor | Role code | Responsibility in this module |
|---|---|---|
| Store Operator | `STORE_OPR` | Put-away, picking, issue, bin transfer, counting — mostly on a scanner |
| Stores In-charge | `STORE_HEAD` | Issue authorisation, transfer approval, count supervision, adjustment raise |
| Warehouse / Materials Manager | `STORE_HEAD`, `FACTORY_HEAD` | Adjustment and write-off approval, strategy configuration, ageing action |
| Production Supervisor | `SHIFT_SUP`, `PROD_MGR` | Raises material requisitions, receives issued material, returns unconsumed |
| Planner | `PPC` | Reads availability, sets reorder levels, reviews shortage and non-moving |
| Quality Inspector / Head | `QC_INSP`, `QC_HEAD` | Releases or blocks quarantined stock; blocks a batch on a defect |
| Buyer | `PURCH_EXEC`, `PURCH_HEAD` | Reads stock and coverage; receives reorder-breach signals |
| Sales / CS | `SALES_*` | Reads ATP and allocation; never posts a movement |
| Accounts / Costing | `ACCOUNTS`, `CFO` | Valuation, revaluation approval, GL reconciliation, provisioning |
| Factory Head | `FACTORY_HEAD` | Approves high-value adjustments, write-offs and count variances |
| Internal Auditor | `AUDITOR` | Read-only across the module including value, full audit trail |
| System / Company Admin | `SYS_ADMIN` | Parameters, movement types, reason codes, label templates |

---

## 6. Permissions catalogue introduced by this volume

Full role × permission matrix, data scope and field rules are in
[Chapter 11](11-permissions-and-roles.md). Namespace summary:

```
INVENTORY.DASHBOARD.        VIEW · VIEW_ALL_PLANTS
INVENTORY.STOCK.            VIEW · VIEW_VALUE · VIEW_ALL_WAREHOUSES · EXPORT
INVENTORY.LEDGER.           VIEW · EXPORT
INVENTORY.PUTAWAY.          VIEW · CREATE · CONFIRM · OVERRIDE_BIN
INVENTORY.RECEIPT.          VIEW · CREATE · POST · CANCEL
INVENTORY.QC_HOLD.          VIEW · RELEASE · BLOCK
INVENTORY.REQUISITION.      VIEW · CREATE · EDIT · SUBMIT · APPROVE · CANCEL
INVENTORY.MATERIAL_ISSUE.   VIEW · CREATE · EDIT · SUBMIT · APPROVE · POST · CANCEL ·
                            OVERRIDE_BOM · OVERRIDE_FEFO · PRINT · EXPORT
INVENTORY.MATERIAL_RETURN.  VIEW · CREATE · POST · CANCEL
INVENTORY.TRANSFER.         VIEW · CREATE · EDIT · SUBMIT · APPROVE · DISPATCH · RECEIVE ·
                            CANCEL · PRINT
INVENTORY.SUBCONTRACT.      VIEW · ISSUE · RECEIVE · RECONCILE
INVENTORY.STOCK_ADJUSTMENT. VIEW · CREATE · SUBMIT · APPROVE · POST · CANCEL
INVENTORY.SCRAP.            VIEW · CREATE · APPROVE · DISPOSE
INVENTORY.WRITE_OFF.        VIEW · CREATE · APPROVE
INVENTORY.CYCLE_COUNT.      VIEW · PLAN · COUNT · RECOUNT · APPROVE_VARIANCE · POST · FREEZE
INVENTORY.BATCH.            VIEW · EDIT · BLOCK · EXTEND_EXPIRY · TRACE
INVENTORY.SERIAL.           VIEW · GENERATE · EDIT
INVENTORY.VALUATION.        VIEW · REVALUE · APPROVE_REVALUATION · RECONCILE_GL · EXPORT
INVENTORY.REORDER.          VIEW · EDIT · RECALCULATE
INVENTORY.RESERVATION.      VIEW · CREATE · RELEASE · OVERRIDE
INVENTORY.REPORT.           VIEW · VIEW_VALUE · EXPORT · SCHEDULE
INVENTORY.SETTINGS.         VIEW · EDIT
```

**V4-INV-BR-004 (M)** `INVENTORY.STOCK.VIEW` and `INVENTORY.STOCK.VIEW_VALUE` are separate
permissions. Quantity visibility must not imply value visibility — a storekeeper works the bins
without seeing what the material cost (this is also enforced at field level, Ch 11 §11.4).

---

## 7. Assumptions

| # | Assumption | Impact if wrong |
|---|---|---|
| A4-01 | Bin management is used in the RM, WIP, FG and packing stores; quarantine, reject, scrap and transit locations are not bin-managed | Bin mandatory-ness flips per warehouse |
| A4-02 | Weighted average is the default valuation method, with standard cost for finished goods | Valuation engine default changes; FIFO layers still required |
| A4-03 | Negative stock is never permitted in a production warehouse | The exception flag becomes routine, and valuation needs a deficit-costing rule |
| A4-04 | Incoming material is quarantined by default and released by QC; routine MRO is configured to skip inspection | Default `stock_status` on receipt flips to `AVAILABLE` |
| A4-05 | Finished bottles are serial-tracked at the piece level from FG receipt | Serial handling reduces to carton level, changing warranty lookup |
| A4-06 | Cycle counting replaces the annual full stocktake for A and B items; a full physical verification still runs once a year | Count planning shifts to a single annual event |
| A4-07 | Job work is done on issued material under Sec 143 (not sale and buy-back) | Subcontract stock stops being company stock, and Ch 5 changes entirely |
| A4-08 | The plant has at least one weighbridge whose readings can be captured, manually if not integrated | Coil receipt and residual return capture becomes manual with no cross-check |
| A4-09 | Scanners are Android devices running the mobile app, working offline in the store | Offline queueing and conflict rules become unnecessary |
| A4-10 | Inventory GL posting is real-time per movement, not a periodic batch | The event contract to Vol 9 changes to a batch extract |

## 8. Open questions

Tracked in [../open-questions.md](../open-questions.md).

| # | Question | Chapter |
|---|---|---|
| Q4-01 | Confirm the valuation method per item class — weighted average everywhere, or FIFO for steel? | Ch 9 |
| Q4-02 | Is standard costing used for FG, and who owns the standard-cost revision cycle? | Ch 9 |
| Q4-03 | Which warehouses are genuinely bin-managed today, and what is the existing bin naming convention? | Ch 1 |
| Q4-04 | Is WIP tracked at operation level in a WIP store, or held as a plant-level pool? | Ch 2, Ch 4 |
| Q4-05 | What are the acceptable count-variance tolerances by item class before approval is required? | Ch 8 |
| Q4-06 | Are shop-floor scanners available, and is there an existing device standard? | Ch 14 |
| Q4-07 | Should backflush be automatic at operation confirmation, or an explicit issue for every job? | Ch 4 |
| Q4-08 | Confirm the shelf-life items and their near-expiry alert lead times | Ch 7 |
| Q4-09 | Depot stock — is the Coimbatore depot a warehouse of the same GSTIN or a distinct person? | Ch 5 |
| Q4-10 | Who approves a write-off, and at what value does it escalate to the Director? | Ch 6, Ch 11 |
| Q4-11 | Opening stock migration — what is the cutover approach for batches, serials and values? | Ch 12 |
| Q4-12 | Does Finance want a stock provision policy by ageing bucket, and at what percentages? | Ch 9 |

---

**Revision history**

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-07-29 | Engineering | Initial draft — full FRD for Inventory & Warehouse Management |
