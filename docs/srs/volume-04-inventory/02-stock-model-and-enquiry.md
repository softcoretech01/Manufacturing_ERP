# Volume 4 · Chapter 2 — Stock Model & Enquiry

**Area code:** `STK`
Prerequisite: [Vol 0](../volume-00-foundation.md) §7 (numeric types) · [Ch 1](01-warehouse-bin-and-storage.md)

---

## 2.1 Purpose

This chapter defines the one thing the rest of the volume depends on: **what a stock balance is,
where it comes from, and what questions it must answer**. Every other chapter posts into this
model; no chapter is allowed to keep its own.

## 2.2 The identity of a stock balance

A balance is keyed by six things. Anything less loses information the business needs.

```
company × plant × warehouse × bin × item × batch × serial × stock_status  →  quantity
```

| Ref | Pri | Requirement |
|---|---|---|
| **V4-STK-FR-001** | M | The stock balance table is keyed on company, warehouse, bin, item, batch, serial and stock status. Non-bin-managed warehouses use the implicit bin; non-batch items use a null batch; the key shape never changes. |
| **V4-STK-FR-002** | M | Quantity is `DECIMAL(18,6)` in the item's **base UOM**. Alternate-UOM quantities are derived for display, never stored as the authority. |
| **V4-STK-FR-003** | M | Value is held at the valuation level configured for the item (Ch 9) — normally item × plant, optionally item × warehouse — and never at bin level. Moving material between bins must never change its value. |
| **V4-STK-FR-004** | M | The balance is updated in the **same database transaction** as the ledger row that caused it. A balance that can drift from its ledger is a defect, not a tuning problem. |
| **V4-STK-FR-005** | M | Every balance row is reproducible by replaying the ledger. A nightly job MUST verify a sample and raise an alert on any mismatch. |

### 2.2.1 Stock status

Status is an attribute of the stock, not of the location — the same bin may hold available and
blocked material of the same item.

| Status | Meaning | Pickable | In ATP | In valuation |
|---|---|---|---|---|
| `AVAILABLE` | Free to use | Yes | Yes | Yes |
| `QUARANTINE` | Awaiting inspection | No | No | Yes |
| `BLOCKED` | Held by QC or stores with a reason | No | No | Yes |
| `REJECTED` | Failed inspection, awaiting return or scrap | No | No | Yes (until disposed) |
| `IN_TRANSIT` | Dispatched, not yet received | No | No | Yes (at the sending plant) |
| `AT_SUBCONTRACTOR` | With a job worker | No | No | Yes |
| `RESERVED` | Not a status — see §2.4; reservation is a soft claim on `AVAILABLE` | — | — | — |
| `EXPIRED` | Past shelf life | No | No | Yes (pending write-off) |
| `SAMPLE` | Drawn for testing / display | No | No | Yes |

**V4-STK-BR-001 (M)** Status transitions are movements (types `501`, `502`) and are ledgered.
Status is never patched directly on a balance row.

## 2.3 The stock ledger

| Ref | Pri | Requirement |
|---|---|---|
| **V4-STK-FR-006** | M | Every quantity or value change writes an **append-only** ledger row: movement type, direction, quantity, rate, value, running balance quantity and value at that location, document type and number, line reference, batch, serial, status before/after, posted-by, posted-at (UTC), business date and correlation id. |
| **V4-STK-FR-007** | M | The ledger is never updated or deleted. A correction is a new, opposite entry referencing the original — including for cancellations. The application DB user has no UPDATE or DELETE privilege on the ledger table. |
| **V4-STK-FR-008** | M | Ledger entries carry the **business date** (plant-local) separately from the posting timestamp (UTC), and a back-dated posting is permitted only into an open period and only with `INVENTORY.RECEIPT.POST` plus a reason. |
| **V4-STK-FR-009** | M | The **bin card** view of the ledger — one item, one location, chronological, with a running balance — is a first-class screen (`S-STK-03`), because it is what an auditor asks for. |
| **V4-STK-FR-010** | M | Ledger queries MUST be answerable for any historical date: "what was the stock of item X in warehouse Y on 31-Mar" is a supported query, not a restore-from-backup exercise. |

**V4-STK-BR-002 (M)** The running balance stored on a ledger row is the balance **after** that
movement at that exact location key, computed under the row lock that produced it — not
recomputed later by a report.

## 2.4 Buckets — what "stock" means to each asker

A single on-hand number answers nobody's question. The model MUST expose these buckets, all
derived from the balance and open documents:

| Bucket | Definition |
|---|---|
| On hand | Σ quantity, all statuses, at the location |
| Available | On hand where status = `AVAILABLE` |
| Reserved | Σ open reservations against available stock (Ch 10) |
| Free / unreserved | Available − reserved |
| On order | Open purchase-order quantity not yet received (from Vol 3) |
| In transit | Dispatched on an inter-plant transfer, not yet received |
| At subcontractor | Issued on a job-work challan, not yet returned |
| Quarantine | Awaiting QC decision |
| Blocked / rejected | Held or failed |
| WIP | Issued to open production orders, not yet consumed or returned (from Vol 6) |
| ATP | Free + expected receipts within the horizon − committed demand (Ch 10) |
| Coverage days | Free ÷ average daily consumption over the configured window |

**V4-STK-BR-003 (M)** Sales and planning screens show **free** and **ATP**, never raw on-hand.
Showing on-hand where a commitment exists is how a promised order becomes a missed dispatch
(pain P-14).

## 2.5 Negative stock

| Ref | Pri | Rule |
|---|---|---|
| **V4-STK-BR-004** | M | Negative stock is refused by default at every location, for every movement. |
| **V4-STK-BR-005** | M | It may be enabled per warehouse (never per user, never per document) by a company administrator, with an effective date and a reason recorded in the audit log. |
| **V4-STK-BR-006** | M | Where enabled, every posting that drives a balance below zero is written to a **negative-stock exception register** (`S-STK-07`) with the item, location, quantity, document and actor; the register is reviewed weekly and the entries must be cleared by a receipt or a count. |
| **V4-STK-BR-007** | M | Negative stock is never permitted for batch- or serial-managed items, in any warehouse, under any configuration. A batch that does not physically exist cannot be issued. |
| **V4-STK-BR-008** | M | Valuation of a negative balance uses the last known moving-average rate and is flagged in the valuation report as an estimate. |

## 2.6 Rounding, precision and UOM

| Ref | Pri | Rule |
|---|---|---|
| **V4-STK-BR-009** | M | Quantity is stored at `DECIMAL(18,6)` and rounded **once**, half-up, at the item's declared decimal precision, at the point of persistence (CLAUDE.md §4.4). |
| **V4-STK-BR-010** | M | A dual-UOM item stores base-UOM quantity and, where the conversion is not a constant (SS coil: kg ↔ nos depends on grade × thickness × width × blank size), the conversion factor **used at that movement** is stored on the ledger row. Recomputing history with today's factor is forbidden. |
| **V4-STK-BR-011** | M | UOM conversion factors come from the item master (Vol 1 Ch 7). This module never defines its own. |

## 2.7 Screens

### S-STK-01 · Stock Enquiry

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Stock Enquiry                          [Columns] [Save view ▼] [Export ▼] [⟳]           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 item / batch / bin      Plant [All ▼] Warehouse [All ▼] Class [All ▼] Status [All ▼] │
│ [x] Hide zero balances   [ ] Show value   [ ] Include subcontractor & transit            │
│ Applied: Warehouse: RM-01 ✕   Class: Raw material ✕                        Clear all     │
├──────────────────┬──────┬─────────┬─────────┬────────┬────────┬────────┬────────┬───────┤
│ Item             │ UOM  │ On hand │ Free    │ Reserv │ Quaran │ On ord │ Cover  │ Value │
├──────────────────┼──────┼─────────┼─────────┼────────┼────────┼────────┼────────┼───────┤
│ RM-SS304-050 ▸   │ KG   │  12,140 │   9,140 │  3,000 │  1,200 │ 20,000 │ 11 d ⚠ │ 28.9L │
│   RM-01 · CY-01 · B2606-H4471 (heat 4471) exp — · 8,900 · AVAILABLE                     │
│   RM-01 · CY-03 · B2607-H4488 (heat 4488) exp — · 2,040 · AVAILABLE                     │
│   QTN-01 · —     · B2607-H4501 (heat 4501)        · 1,200 · QUARANTINE  ⓘ IQC pending    │
│ RM-SS316-060     │ KG   │   3,420 │   3,420 │      0 │      0 │      0 │  6 d ⛔│ 14.1L │
│ CMP-LID-SCR-SS   │ NOS  │  42,800 │  38,300 │  4,500 │      0 │ 30,000 │ 24 d   │ 16.5L │
│ CON-PWD-BLK      │ KG   │   1,240 │   1,090 │    150 │      0 │    400 │ 18 d   │  3.9L │
│   ⚠ 90 KG expiring in 21 days (batch B2604011)                                          │
├──────────────────┴──────┴─────────┴─────────┴────────┴────────┴────────┴────────┴───────┤
│ 4 items · on-hand value ₹63.4 L · below reorder 2 · expiring < 30 d 1                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-STK-03 · Stock ledger / bin card

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Bin Card — RM-SS304-050 · SS 304 Coil 0.50 mm       RM-01 · all bins   01-Apr → 29-Jul   │
├──────────┬───────────────┬──────┬─────────┬─────────┬─────────┬──────────┬──────────────┤
│ Date     │ Document      │ Type │ In      │ Out     │ Balance │ Rate     │ Batch / bin  │
├──────────┼───────────────┼──────┼─────────┼─────────┼─────────┼──────────┼──────────────┤
│ 02-Jun-26│ P1/GRN/26-27/…│ 101  │  9,600  │       — │  11,740 │  244.20  │ B2606-H4471  │
│ 03-Jun-26│ PUT/26-27/0881│ 301  │      —  │       — │  11,740 │       —  │ → CY-01      │
│ 06-Jun-26│ P1/MI/26-27/…│ 201  │      —  │   2,400 │   9,340 │  241.85  │ B2606-H4471  │
│ 09-Jun-26│ P1/MR/26-27/…│ 201− │    180  │       — │   9,520 │  241.85  │ residual coil│
│ 28-Jun-26│ CC/26-27/0042 │ 404  │      —  │      12 │   9,508 │  241.85  │ count variance│
│ 12-Jul-26│ P1/GRN/26-27/…│ 101  │  2,640  │       — │  12,148 │  247.10  │ B2607-H4488  │
│ 24-Jul-26│ P1/MI/26-27/…│ 201  │      —  │       8 │  12,140 │  243.02  │ B2606-H4471  │
├──────────┴───────────────┴──────┴─────────┴─────────┴─────────┴──────────┴──────────────┤
│ Opening 2,140 · received 12,240 · issued 2,228 · adjusted −12 · closing 12,140 KG        │
│ Moving average ₹243.02/kg · closing value ₹29,50,262                    [Export] [Print] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-STK-02 Item Stock 360 | One item, every location, batches, serials, open documents, consumption trend, reorder position, last 20 movements. The screen a planner lives in. |
| S-STK-04 Bin Contents | One bin, everything in it, with age in bin and last movement. |
| S-STK-05 Reservations | Ch 10. |
| S-STK-06 Stock Ageing | Ch 9. |
| S-STK-07 Negative-stock Register | Exceptions with clearing status; an item cannot leave the register without a receipt or a count. |

## 2.8 Validations

| # | Validation | Trigger | Severity |
|---|---|---|---|
| 1 | Sufficient free quantity at the exact location/batch/status | Any issue posting | Error (unless negative allowed) |
| 2 | Batch mandatory for a batch-managed item | Posting | Error |
| 3 | Serial mandatory and unique for a serial-managed item | Posting | Error |
| 4 | Business date within an open financial period | Posting | Error |
| 5 | Item active and not blocked for movement | Posting | Error |
| 6 | Warehouse and bin active, and eligible for the item | Posting | Error |
| 7 | Quantity > 0 and within item precision | Posting | Error |
| 8 | Balance and ledger agree after posting | Posting (assertion) | Error — transaction rolls back |
| 9 | Back-dated posting into a period with a completed count | Posting | Error |
| 10 | Optimistic lock version match on the balance row | Posting | 409 Conflict, retried once |

## 2.9 Concurrency

**V4-STK-BR-012 (M)** Two simultaneous issues from the same balance row MUST NOT both succeed
against the same quantity. The balance row is locked (`SELECT … FOR UPDATE`) for the shortest
possible span, after all validation and immediately before the ledger insert; locks are always
acquired in a deterministic key order (warehouse, bin, item, batch) so that multi-line documents
cannot deadlock.

**V4-STK-BR-013 (M)** A movement API call is idempotent on `Idempotency-Key` (Vol 0 §8): a
replayed scanner request must not post the material twice. This is a hard requirement, not a
convenience — shop-floor networks drop responses routinely.

## 2.10 Reports contributed

Stock Summary · Stock Detail (item × warehouse × bin × batch) · Bin Card / Stock Ledger ·
Stock as on Date · Movement Analysis by Type · Negative Stock Exceptions · Zero-stock Items ·
Stock by Status (quarantine, blocked, rejected) · Location Utilisation. Columns in
[Ch 14 §14.2](14-dashboard-reports-and-uiux.md).

## 2.11 Audit trail

The ledger **is** the movement audit. In addition, `core_audit_log` records: every enquiry export
with the filter used and the row count, every value-column view by a user (because value is
sensitive), stock-status changes with reason, negative-stock exceptions, and every parameter
change affecting the model (negative-stock flag, precision, valuation level).

## 2.12 Acceptance criteria (extract)

- Issuing 2,400 kg from a bin holding 2,140 kg is refused, naming the shortfall — and remains
  refused for a batch-managed item even if the warehouse allows negative stock.
- Two operators issuing 1,000 kg each from a 1,500 kg bin at the same instant: one succeeds, one
  is refused. Never both.
- Replaying the same scanner issue request with the same `Idempotency-Key` returns the original
  response and posts nothing further.
- "Stock as on 31-Mar-2026" reproduces the closing balance from the ledger and equals the value
  reported to Finance at close.
- Moving 500 kg from bin CY-01 to CY-02 changes no valuation figure anywhere.
- A quarantined receipt does not appear in free stock, in ATP, or in a pick proposal — but does
  appear in the on-hand and in the valuation.

---

**Next:** [Chapter 3 — Receipts & Put-away](03-receipts-and-putaway.md)
