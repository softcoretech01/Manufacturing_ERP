# Volume 4 · Chapter 13 — API, Events & Integration

Prerequisite: [Vol 0](../volume-00-foundation.md) §8 (API standards) and §18 (events)
Base path `/api/v1`. Public identifiers are always ULIDs (`uid`); `id` is never exposed.
Every mutating request accepts `Idempotency-Key`. Errors are RFC 9457 `application/problem+json`.

---

## 13.1 Endpoint catalogue

Every row declares the permission the endpoint enforces server-side. An endpoint without one
fails CI (CLAUDE.md §5.4).

### Stock and ledger

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/inventory/stock` | `INVENTORY.STOCK.VIEW` | Filter: item, warehouse, bin, batch, status, class, `hide_zero`; cursor paginated |
| GET | `/inventory/stock/{item_uid}` | `INVENTORY.STOCK.VIEW` | Item 360: all locations, batches, buckets, coverage |
| GET | `/inventory/stock/availability` | `INVENTORY.STOCK.VIEW` | Buckets: on hand, free, reserved, ATP for a date |
| GET | `/inventory/stock/as-on` | `INVENTORY.STOCK.VIEW` | Historical balance for a date, from the ledger |
| GET | `/inventory/ledger` | `INVENTORY.LEDGER.VIEW` | Bin card; filters item, warehouse, bin, batch, date range, movement type |
| GET | `/inventory/bins/{bin_uid}/contents` | `INVENTORY.STOCK.VIEW` | — |
| GET | `/inventory/stock/negative-exceptions` | `INVENTORY.STOCK.VIEW` | — |
| POST | `/inventory/stock/export` | `INVENTORY.STOCK.EXPORT` | `202 Accepted` + job uid for large extracts |

### Receipts and put-away

| Method | Path | Permission |
|---|---|---|
| GET | `/inventory/receipts` · `/inventory/receipts/{uid}` | `INVENTORY.RECEIPT.VIEW` |
| POST | `/inventory/receipts` | `INVENTORY.RECEIPT.CREATE` (non-GRN sources only) |
| POST | `/inventory/receipts/{uid}/post` | `INVENTORY.RECEIPT.POST` |
| POST | `/inventory/receipts/{uid}/cancel` | `INVENTORY.RECEIPT.CANCEL` |
| GET | `/inventory/putaways` · `/inventory/putaways/{uid}` | `INVENTORY.PUTAWAY.VIEW` |
| GET | `/inventory/putaways/pending` | `INVENTORY.PUTAWAY.VIEW` |
| POST | `/inventory/putaways/{uid}/propose` | `INVENTORY.PUTAWAY.VIEW` — returns bin proposals with reasons |
| POST | `/inventory/putaways/{uid}/confirm` | `INVENTORY.PUTAWAY.CONFIRM` |
| GET | `/inventory/quarantine` | `INVENTORY.QC_HOLD.VIEW` |
| POST | `/inventory/quarantine/{uid}/release` · `/block` | `INVENTORY.QC_HOLD.RELEASE` / `.BLOCK` |

### Issues, returns, transfers

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/inventory/requisitions` | `INVENTORY.REQUISITION.VIEW` / `.CREATE` |
| POST | `/inventory/requisitions/{uid}/submit` · `/approve` · `/reject` · `/cancel` | `.SUBMIT` / `.APPROVE` / `.APPROVE` / `.CANCEL` |
| GET/POST | `/inventory/material-issues` | `INVENTORY.MATERIAL_ISSUE.VIEW` / `.CREATE` |
| POST | `/inventory/material-issues/{uid}/resolve-picks` | `.VIEW` — returns bin/batch proposals |
| POST | `/inventory/material-issues/{uid}/post` | `.POST` |
| POST | `/inventory/material-issues/{uid}/cancel` | `.CANCEL` |
| GET/POST | `/inventory/pick-lists` · `/pick-lists/{uid}/confirm` | `.VIEW` / `.POST` |
| GET/POST | `/inventory/material-returns` · `/{uid}/post` | `INVENTORY.MATERIAL_RETURN.VIEW` / `.POST` |
| GET/POST | `/inventory/transfers` | `INVENTORY.TRANSFER.VIEW` / `.CREATE` |
| POST | `/inventory/transfers/{uid}/submit` · `/approve` · `/dispatch` · `/receive` · `/cancel` | `.SUBMIT` / `.APPROVE` / `.DISPATCH` / `.RECEIVE` / `.CANCEL` |
| GET | `/inventory/goods-in-transit` | `INVENTORY.TRANSFER.VIEW` |
| GET/POST | `/inventory/jobwork-challans` · `/{uid}/receive` | `INVENTORY.SUBCONTRACT.VIEW` / `.RECEIVE` |
| GET | `/inventory/jobwork-challans/reconciliation` | `INVENTORY.SUBCONTRACT.RECONCILE` |
| GET | `/inventory/jobwork-challans/itc04` | `INVENTORY.SUBCONTRACT.RECONCILE` |

### Adjustments, counting, batch, valuation, replenishment

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/inventory/adjustments` · `/{uid}/submit` · `/approve` · `/post` | `INVENTORY.STOCK_ADJUSTMENT.*` |
| GET/POST | `/inventory/scrap-notes` · `/{uid}/approve` | `INVENTORY.SCRAP.*` |
| GET/POST | `/inventory/write-offs` · `/{uid}/approve` | `INVENTORY.WRITE_OFF.*` |
| GET/POST | `/inventory/counts` · `/{uid}/assign` · `/submit` · `/recount` · `/approve` · `/post` | `INVENTORY.CYCLE_COUNT.*` |
| POST | `/inventory/counts/{uid}/freeze` · `/unfreeze` | `INVENTORY.CYCLE_COUNT.FREEZE` |
| GET | `/inventory/batches` · `/batches/{uid}` | `INVENTORY.BATCH.VIEW` |
| POST | `/inventory/batches/{uid}/block` · `/unblock` · `/extend-expiry` | `.BLOCK` / `.BLOCK` / `.EXTEND_EXPIRY` |
| GET | `/inventory/batches/{uid}/genealogy?direction=forward\|backward` | `INVENTORY.BATCH.TRACE` |
| GET | `/inventory/trace?key={serial\|batch\|heat\|grn\|carton\|invoice}` | `INVENTORY.BATCH.TRACE` |
| GET | `/inventory/serials/{serial_no}` | `INVENTORY.SERIAL.VIEW` |
| GET | `/inventory/valuation` · `/valuation/movement` · `/valuation/gl-reconciliation` | `INVENTORY.VALUATION.VIEW` |
| GET/POST | `/inventory/revaluations` · `/{uid}/approve` | `.REVALUE` / `.APPROVE_REVALUATION` |
| GET | `/inventory/ageing` · `/non-moving` | `INVENTORY.VALUATION.VIEW` |
| GET/PATCH | `/inventory/reorder-levels` | `INVENTORY.REORDER.VIEW` / `.EDIT` |
| POST | `/inventory/reorder-levels/recalculate` | `INVENTORY.REORDER.RECALCULATE` — `202` + job uid |
| GET/POST | `/inventory/reservations` · `/{uid}/release` | `INVENTORY.RESERVATION.VIEW` / `.RELEASE` |
| GET | `/inventory/shortages` | `INVENTORY.STOCK.VIEW` |
| GET/PATCH | `/inventory/settings/parameters` · `/strategies` · `/movement-types` | `INVENTORY.SETTINGS.VIEW` / `.EDIT` |

**V4-INV-IR-001 (M)** Long-running operations — level recalculation, ABC classification, full
valuation extract, count-plan generation, large exports — return `202 Accepted` with a job uid
(Vol 0 §8). No inventory endpoint blocks for more than 5 seconds.

## 13.2 Representative payloads

### `POST /inventory/material-issues` (request)

```jsonc
{
  "doc_date": "2026-07-29",
  "plant_uid": "01J8...",
  "from_warehouse_uid": "01J8...",
  "charge_type": "PRODUCTION_ORDER",
  "production_order_no": "PRD/2607/0114",
  "operation_code": "OP-20",
  "requisition_uid": "01J8...",
  "issued_to_employee_uid": "01J8...",
  "lines": [
    {
      "item_uid": "01J8...",
      "quantity": "1250.000000",
      "uom_uid": "01J8...",
      "bin_uid": "01J8...",            // optional — omit to let the strategy resolve
      "batch_uid": "01J8...",          // optional — omit for FEFO/FIFO resolution
      "over_issue_reason_uid": null,
      "remarks": null
    }
  ]
}
```

### `POST /inventory/material-issues/{uid}/post` (response, 200)

```jsonc
{
  "uid": "01J8...", "doc_no": "P1/MI/26-27/004418", "status": "ISSUED",
  "posted_at": "2026-07-29T11:14:22.481Z", "version": 2,
  "total_value": "352918.00",           // absent entirely without INVENTORY.STOCK.VIEW_VALUE
  "lines": [{
    "line_no": 1, "item_code": "RM-SS304-050",
    "quantity": "1250.000000", "uom": "KG",
    "bin_code": "CY-01", "batch_no": "B2606-H4471",
    "rate": "243.020000", "value": "303775.00",
    "ledger_uids": ["01J8..."],
    "resolution": { "strategy": "FIFO", "was_overridden": false }
  }],
  "warnings": []
}
```

### Error — insufficient stock (409)

```jsonc
{
  "type": "https://errors.ssberp.local/inventory/insufficient-stock",
  "title": "Insufficient stock",
  "status": 409,
  "detail": "Bin CY-01, batch B2606-H4471 has 900.000000 KG available; 1250.000000 KG requested.",
  "correlation_id": "01J8...",
  "errors": [{
    "field": "lines[0].quantity",
    "code": "insufficient_stock",
    "available": "900.000000", "requested": "1250.000000",
    "alternatives": [{ "bin_code": "CY-03", "batch_no": "B2607-H4488", "available": "2040.000000" }]
  }]
}
```

**V4-INV-IR-002 (M)** Stock errors return the **alternatives** the caller could use. A scanner
operator told only "not enough stock" walks back to the terminal; one told which bin has it does
not.

### `GET /inventory/stock/availability` (response)

```jsonc
{
  "item_code": "FG-SS-750-BLK", "uom": "NOS", "as_on": "2026-07-29",
  "on_hand": "4860.000000", "available": "4860.000000",
  "reserved": "3708.000000", "allocated": "1152.000000", "free": "0.000000",
  "quarantine": "0.000000", "in_transit": "0.000000", "at_subcontractor": "0.000000",
  "on_order": "0.000000", "coverage_days": 0,
  "atp": [
    { "date": "2026-07-29", "quantity": "0.000000" },
    { "date": "2026-08-06", "quantity": "4860.000000", "source": "PRD/2608/0009" }
  ]
}
```

## 13.3 Events published

Names are `inventory.<entity>.<past-tense-verb>`; payloads are versioned and additive-only
(CLAUDE.md §5.5). All are emitted through the transactional outbox.

| Event | Payload highlights | Consumers |
|---|---|---|
| `inventory.stock.posted` | movement type, item, warehouse, bin, batch, quantity, rate, value, source doc, business date | Vol 9 (GL), Vol 5 (MRP), analytics |
| `inventory.receipt.posted` | receipt uid, source doc, lines with batches and statuses | Vol 3, Vol 7 |
| `inventory.putaway.completed` | receipt uid, bins used, duration | analytics |
| `inventory.quarantine.released` / `.blocked` | batch, quantity, inspection ref, actor | Vol 3, Vol 7 |
| `inventory.issue.posted` | production order, item, batch, quantity, value, cost centre | Vol 6 (WIP), Vol 9 |
| `inventory.return.posted` | issue ref, quantity, condition | Vol 6, Vol 9 |
| `inventory.transfer.dispatched` / `.received` | route, quantities, GIT value, e-way bill | Vol 8, Vol 9 |
| `inventory.subcontract.issued` / `.received` | challan, vendor, quantities, loss vs agreed | Vol 3, Vol 9 |
| `inventory.adjustment.posted` | reason, root cause, value | Vol 9, audit |
| `inventory.scrap.posted` | production order, defect code, value, recovery | Vol 7, Vol 9 |
| `inventory.count.posted` | variance quantity and value, accuracy %, root causes | Vol 9, analytics |
| `inventory.batch.blocked` / `.recalled` | batch, affected locations, reservations cancelled | Vol 6, Vol 7, Vol 8, Vol 2 |
| `inventory.batch.expiring` / `.expired` | batch, item, quantity, value at risk | Vol 3, Vol 5 |
| `inventory.reorder.breached` | item, plant, free, on order, reorder level, ADD, coverage, last rate, suggested qty, transfer alternative | **Vol 3 (creates the PR)**, Vol 5 |
| `inventory.stockout.detected` | item, plant, open demand affected | Vol 2, Vol 5, Vol 6 |
| `inventory.reservation.created` / `.released` / `.expired` | demand doc, quantity, displaced holder | Vol 2, Vol 6 |
| `inventory.valuation.revalued` | item, old/new value, reason | Vol 9 |
| `inventory.serial.dispatched` | serial, customer, invoice, warranty window | Vol 2, Vol 10 |

## 13.4 Events subscribed

| Event | Source | Action taken |
|---|---|---|
| `procurement.grn.approved` | Vol 3 | Post receipt (`101`), create batches, quarantine per configuration |
| `procurement.grn.cancelled` | Vol 3 | Post reversal (`102`) if untouched, else refuse and raise an exception |
| `procurement.po.released` | Vol 3 | Update on-order quantity for ATP and reorder suppression |
| `procurement.landed_cost.finalised` | Vol 3/9 | Apportion into value (`602`) |
| `quality.inspection.completed` | Vol 7 | Release, block or split the quarantined lot (`501`/`502`) |
| `quality.ncr.raised` | Vol 7 | Block the affected batch |
| `production.order.released` | Vol 6 | Create material reservations from the BOM |
| `production.material.requested` | Vol 6 | Create a requisition |
| `production.entry.confirmed` | Vol 6 | Backflush consumption where configured; receive FG/SF (`103`) |
| `production.order.closed` | Vol 6 | Release residual reservations; report unreturned material |
| `sales.order.confirmed` | Vol 2 | Create FG reservation |
| `sales.order.cancelled` | Vol 2 | Release reservation |
| `dispatch.challan.approved` | Vol 8 | Issue for dispatch (`204`), update serial status |
| `sales.return.approved` | Vol 2 | Receive into quarantine (`104`) |
| `finance.period.closed` | Vol 9 | Block postings into the closed period |

**V4-INV-IR-003 (M)** Every subscription handler is **idempotent on the event id** and records the
event id on the resulting ledger rows, so a redelivery is detectable and a missing posting is
traceable to its event.

**V4-INV-IR-004 (M)** A handler that fails permanently (poison message) moves to a dead-letter
queue, raises a Priority-1 alert naming the source document, and never silently drops. Stock that
should exist and does not is the worst failure mode in this module.

## 13.5 External integrations

| Integration | Direction | Protocol | Notes |
|---|---|---|---|
| **Handheld scanners** | Both | REST over Wi-Fi, offline queue | Vol 0 §15 barcode formats; idempotency keys mandatory; conflict resolution in Ch 14 §14.3 |
| **Weighbridge** | In | Serial/TCP bridge or manual entry | Captures gross/tare/net for coil receipt, residual return and scrap; the reading is stored with its source (integrated vs manual) |
| **Label printers** | Out | ZPL/EPL over network or the browser print path | Batch, bin, pallet, handling-unit labels; reprints audited |
| **E-way bill (NIC)** | Both | GSP API (Vol 8 owns the adapter) | This module supplies transfer and challan data and stores the returned number and validity |
| **Third-party WMS / depot** | Both | REST + file, per company | Only where a depot runs its own system; the ERP remains the book of record |
| **IoT tank / silo sensors** | In | MQTT | Phase 2; proposes adjustments, never posts them automatically |
| **Analytics warehouse** | Out | Event stream + nightly extract | Ledger and balance snapshots |

**V4-INV-IR-005 (M)** No external integration may write to `inv_stock_ledger` directly. Every
external input arrives as a document or an event and passes the same validation as a keyboard
entry.

## 13.6 Non-functional requirements specific to this module

| Ref | Pri | Requirement |
|---|---|---|
| **V4-INV-NFR-001** | M | A single-line stock posting completes in ≤ 300 ms at p95 under a load of 20 concurrent store users. |
| **V4-INV-NFR-002** | M | Stock enquiry for a 30,000-item catalogue returns the first page in ≤ 1.5 s at p95. |
| **V4-INV-NFR-003** | M | Genealogy trace to 5 levels over 50,000 serials returns in ≤ 5 s at p95. |
| **V4-INV-NFR-004** | M | The scanner app functions offline for a full shift (8 h) and syncs without data loss or duplication. |
| **V4-INV-NFR-005** | M | The nightly balance-vs-ledger consistency check covers 100% of non-zero balances within the maintenance window. |
| **V4-INV-NFR-006** | M | Ledger rows are retained online for 8 financial years (statutory), archived thereafter but restorable for a trace. |
| **V4-INV-NFR-007** | M | A period-close valuation run for one plant completes in ≤ 10 minutes. |

## 13.7 Acceptance criteria (extract)

- Every endpoint listed in §13.1 declares a permission; the CI check fails the build if one does
  not.
- A stock error response names the alternative bins holding the material.
- Re-delivering `procurement.grn.approved` posts nothing the second time, and the duplicate is
  visible in the event log with the original ledger row referenced.
- A failed `quality.inspection.completed` handler lands in the dead-letter queue with an alert
  naming the inspection and the lot; the stock stays quarantined rather than silently released.
- The scanner posts 40 issues offline over a shift and syncs with exactly 40 ledger rows.
- `GET /inventory/stock/as-on?date=2026-03-31` returns the same figures as the March close.

---

**Next:** [Chapter 14 — Dashboard, Reports, Mobile & UI/UX](14-dashboard-reports-and-uiux.md)
