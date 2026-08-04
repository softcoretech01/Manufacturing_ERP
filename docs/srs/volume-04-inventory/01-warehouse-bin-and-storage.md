# Volume 4 · Chapter 1 — Warehouse, Zone & Bin

**Area code:** `WHS`
Prerequisite: [Vol 1 Ch 2 — Organisation Structure](../volume-01-core-framework/02-organization-structure.md)
(owns the warehouse and bin **master tables**) · [Vol 0](../volume-00-foundation.md) §15 (barcode)

---

## 1.1 Purpose

Volume 1 defines *what a warehouse record is*. This chapter defines *how it behaves when
material moves*: which locations may hold which stock, how an address is formed, how a bin is
chosen for put-away and for picking, and what a full or blocked bin does to a movement.

A location model that stops at "warehouse" is the single most common reason a plant's stock is
accurate on paper and unfindable in reality (pain P-09).

## 1.2 The storage hierarchy

```
Company
 └── Plant / Branch
      └── Warehouse            (RM-01, WIP-01, FG-01, PKG-01, QTN-01, REJ-01, SCR-01, SUB-01, TRN-01)
           └── Zone            (Coil Yard, Rack Area A, Bulk Zone, Pallet Zone, Staging)
                └── Bin        (A-01-1-1  =  aisle-rack-level-position)
                     └── Stock (item × batch × serial × status)
```

| Ref | Pri | Requirement |
|---|---|---|
| **V4-WHS-FR-001** | M | Four levels — plant, warehouse, zone, bin — of which zone and bin are optional per warehouse. A non-bin-managed warehouse behaves as a single implicit bin so that the ledger schema never varies. |
| **V4-WHS-FR-002** | M | Warehouse **type** drives default behaviour: `RAW_MATERIAL`, `WIP`, `FINISHED_GOODS`, `PACKING_MATERIAL`, `CONSUMABLE`, `SPARES`, `QUARANTINE`, `REJECT`, `SCRAP`, `SUBCONTRACTOR`, `TRANSIT`, `DEPOT`, `SAMPLE`. |
| **V4-WHS-FR-003** | M | `QUARANTINE`, `REJECT`, `TRANSIT` and `SUBCONTRACTOR` warehouses are **system-managed**: stock enters and leaves them only through a posting from another document, never through a manual issue or receipt. |
| **V4-WHS-FR-004** | M | Per warehouse: bin-managed (y/n), batch mandatory (y/n), serial mandatory (y/n), negative stock allowed (y/n, default no), valuation method, default put-away strategy, default pick strategy, storekeeper, cost centre, and whether it is included in ATP. |
| **V4-WHS-FR-005** | M | Item-to-warehouse **eligibility**: an item category may be restricted to named warehouses, so packing film cannot be received into the coil yard. Violation is an error at posting, not a warning. |
| **V4-WHS-FR-006** | M | Every bin has a unique, printable, scannable address within its warehouse and a barcode per Vol 0 §15 (`v1|LOC|{WH}|{ZONE}|{BIN}`). |
| **V4-WHS-FR-007** | M | **Bulk bin generation**: generate a rack structure from a pattern (aisles × racks × levels × positions) with a preview and a duplicate check, so a 700-bin store is set up once rather than typed. |
| **V4-WHS-FR-008** | S | Bin capacity by weight (kg), volume (m³) and/or pallet positions, with utilisation shown as a percentage and used by the put-away strategy. |

## 1.3 Bin attributes and status

| Field | Type | Notes |
|---|---|---|
| Zone | FK | Grouping for pick sequencing and access rules |
| Bin code | string | Unique within warehouse; the printed address |
| Bin type | enum | `RACK`, `PALLET`, `BULK`, `COIL_STAND`, `FLOOR`, `SHELF`, `BIN_BOX`, `TANK`, `STAGING` |
| Max weight (kg) | decimal(18,4) | Enforced on put-away when known |
| Max volume (m³) | decimal(12,3) | Optional |
| Pick sequence | int | Ascending order in which a picker walks the store |
| Fixed item | FK item, nullable | A dedicated bin refuses other items |
| Mixing allowed | bool | Whether two items, or two batches of one item, may share the bin |
| Status | enum | `AVAILABLE`, `FULL`, `BLOCKED`, `UNDER_COUNT`, `DAMAGED`, `INACTIVE` |
| Temperature / hazard class | enum | For chemicals and coating powder |

| Ref | Pri | Rule |
|---|---|---|
| **V4-WHS-BR-001** | M | A bin's status governs movements: `BLOCKED`, `DAMAGED` and `INACTIVE` accept no put-away and no pick; `UNDER_COUNT` accepts neither until the count is posted (Ch 8 freeze); `FULL` accepts no put-away but permits picking. |
| **V4-WHS-BR-002** | M | A bin may not be deactivated or deleted while it holds stock. The message names the item and quantity blocking it. |
| **V4-WHS-BR-003** | M | A bin belongs to exactly one warehouse. Two warehouses sharing a physical rack must be modelled as two bins. |
| **V4-WHS-BR-004** | M | When `mixing_allowed = false`, a put-away into a bin holding a different item or a different batch is refused with the occupant named. |
| **V4-WHS-BR-005** | M | A `fixed_item` bin refuses any other item, including during a transfer or a count adjustment. |
| **V4-WHS-BR-006** | S | Capacity breach on put-away is a warning by default and an error when the warehouse is configured `enforce_capacity = true`. |

## 1.4 Put-away strategies

Applied in order by the put-away proposal (Ch 3 §3.5); the operator may override with
`INVENTORY.PUTAWAY.OVERRIDE_BIN`, and the override is recorded.

| Strategy | Behaviour | Typical use |
|---|---|---|
| `FIXED_BIN` | Item's dedicated bin from the item × warehouse record | Fast-moving components |
| `NEAREST_EMPTY` | Lowest pick-sequence empty bin in the eligible zone | General rack storage |
| `CONSOLIDATE` | Bin already holding the same item and batch, with capacity | Reduce fragmentation |
| `ZONE_RULE` | Zone chosen by item class, hazard or temperature, then nearest empty | Chemicals, coating powder |
| `BULK_FIRST` | Bulk/floor bin above a quantity threshold, rack below it | Cartons, coils |
| `MANUAL` | Operator chooses; system validates only | Non-standard receipts |

## 1.5 Pick strategies

| Strategy | Behaviour | Typical use |
|---|---|---|
| `FEFO` | Earliest expiry first | Shelf-life consumables — **mandatory** where the item has an expiry |
| `FIFO` | Earliest receipt/batch first | Steel coil, components |
| `LIFO` | Latest first | Rare; only where physically stacked and permitted |
| `FIXED_BIN` | From the item's dedicated bin | Fast movers |
| `NEAREST_BIN` | Lowest pick sequence with sufficient quantity | Small parts |
| `SINGLE_BIN` | Refuse a split pick; require one bin to cover the line | Where split lots are unacceptable |

| Ref | Pri | Rule |
|---|---|---|
| **V4-WHS-BR-007** | M | Where an item has an expiry date, `FEFO` is enforced regardless of the warehouse default. Overriding it requires `INVENTORY.MATERIAL_ISSUE.OVERRIDE_FEFO`, a reason, and it is reported. |
| **V4-WHS-BR-008** | M | A pick proposal MUST NOT propose a bin whose stock status is not `AVAILABLE`, whose bin status blocks picking, or whose batch is blocked or expired. |
| **V4-WHS-BR-009** | S | Where a pick must split across bins, the proposal minimises the number of bins first and the walking distance second. |

## 1.6 Screens

### S-WHS-05 · Warehouse map (utilisation view)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Warehouse Map — RM-01 Raw Material Store           [Zones ▼] [Occupancy ▼] [⟳] [Export] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Capacity 708 bins · occupied 511 (72%) · blocked 6 · under count 12 · empty 179          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ▾ Coil Yard (12 bins · 84% full)                                                        │
│   ┌────────┬────────┬────────┬────────┬────────┬────────┐                               │
│   │ CY-01  │ CY-02  │ CY-03  │ CY-04  │ CY-05  │ CY-06  │  ██ >90%  ▓▓ 60-90%           │
│   │  ██89% │  ▓▓65% │  ██94% │  ░░ 0% │  ▓▓71% │  ⛔blk │  ░░ <60%  ⛔ blocked          │
│   └────────┴────────┴────────┴────────┴────────┴────────┘                               │
│ ▾ Rack Area A (240 bins · 68% full)                                                     │
│   A-01 ██▓▓░░░░▓▓██░░  A-02 ▓▓▓▓██░░░░░░▓▓  A-03 ░░░░░░⛔░░▓▓██                          │
│ ▾ Bulk Zone (18 bins · 77% full)                                                        │
│   BLK-01 ▓▓52%   BLK-02 ██94%   BLK-03 ░░12%   BLK-04 ░░ 0%                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Selected: A-01-1-1 · Silicone ring 68 mm · batch B2607014 · 12,400 NOS · 42% · exp —     │
│           [Bin card] [Transfer out] [Block bin] [Print label] [Count this bin]           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-WHS-01 Warehouse List | Operational view: type, bin-managed, batch/serial mandatory, storekeeper, occupancy %, stock value (permission-gated), open movements. |
| S-WHS-02 Warehouse Detail & Strategies | Tabs: profile · strategies · eligible item categories · bins · stock summary · movements · audit. |
| S-WHS-03 Zone & Bin Structure | Tree with inline counts; bulk actions block/unblock/print labels. |
| S-WHS-04 Bin Create / Bulk Generate | Pattern builder `{AISLE}-{RACK}-{LEVEL}-{POS}` with a live preview of the first and last generated codes and a duplicate report. |
| S-WHS-06 Bin Block / Unblock | Reason code mandatory; shows the stock currently in the bin and what will happen to it. |
| S-WHS-07 Strategy Configuration | Put-away and pick strategy per warehouse with per-item-category overrides and an effective-date. |

## 1.7 Validations

| # | Validation | Trigger | Severity |
|---|---|---|---|
| 1 | Bin code unique within warehouse | Save | Error |
| 2 | Bin code matches the warehouse's address pattern | Save | Warning |
| 3 | Warehouse cannot be marked non-bin-managed while bins hold stock | Save | Error |
| 4 | Deactivating a bin/warehouse holding stock | Save | Error |
| 5 | Fixed item must be eligible for the warehouse | Save | Error |
| 6 | Capacity values positive when entered | Save | Error |
| 7 | Pick sequence unique within zone | Save | Warning |
| 8 | Blocking a bin with open reservations against its stock | Save | Warning + list |
| 9 | Bulk generation would create > 5,000 bins | Generate | Confirmation |
| 10 | Optimistic lock version match | Save | 409 Conflict |

## 1.8 Notifications

| Trigger | Recipient | Channel |
|---|---|---|
| Warehouse occupancy crosses 90% | Stores In-charge | In-app, e-mail |
| Bin blocked / unblocked | Stores In-charge, Materials Manager | In-app |
| Bin blocked while holding stock | Materials Manager | In-app, e-mail |
| Fixed-bin item changed | Stores In-charge | In-app |

## 1.9 Audit trail

Bin and warehouse creation, every attribute change with old and new value, strategy changes with
effective date, block/unblock with reason, bulk generation (parameters and the count created),
label reprints, and every put-away override that ignored the proposed bin — with the proposed
bin, the chosen bin and the operator.

## 1.10 Acceptance criteria (extract)

- Generating aisles A–D × racks 01–10 × levels 1–3 × positions 1–2 creates exactly 240 bins,
  previewed as `A-01-1-1` … `D-10-3-2`, and reports zero duplicates.
- A put-away into `A-01-2-1` (blocked) is refused, naming the block reason.
- A put-away of SS 304 into a bin fixed to silicone rings is refused.
- Deactivating warehouse `RM-01` while 2,140 kg of coil is on hand is refused, naming the item.
- Picking a shelf-life item proposes the earliest-expiry batch even when a nearer bin holds a
  later batch, and overriding it without `OVERRIDE_FEFO` is refused.
- Scanning `v1|LOC|RM-01|Rack Area A|A-01-1-1` on the mobile app opens that bin's contents.

---

**Next:** [Chapter 2 — Stock Model & Enquiry](02-stock-model-and-enquiry.md)
