# Volume 4 · Chapter 3 — Receipts & Put-away

**Area code:** `RCP`
Prerequisite: [Vol 3 Ch 7](../volume-03-procurement/07-receipt-return-and-invoice.md) (GRN document) ·
[Ch 1](01-warehouse-bin-and-storage.md) · [Ch 2](02-stock-model-and-enquiry.md)
Numbering series: `PUTAWAY` → `PUT/{FY}/{SEQ:5}` · `PRODUCTION_RECEIPT` → `{PLANT}/PRC/{FY}/{SEQ:5}`

---

## 3.1 Purpose

Material becomes stock here. This chapter owns everything between "a document says material
arrived" and "the material is addressable, statused and countable in a bin".

**V4-RCP-FR-001 (M)** Inventory does **not** create the GRN. Procurement owns the GRN document
and its approval; on `procurement.grn.approved` this module posts the stock. Inventory must never
call procurement's repository, and procurement must never write to the stock ledger
(CLAUDE.md §3.3).

## 3.2 Receipt sources

| Source | Event / trigger | Movement | Default status |
|---|---|---|---|
| Purchase receipt | `procurement.grn.approved` (Vol 3) | `101` | `QUARANTINE` if inspection required, else `AVAILABLE` |
| Production receipt (FG / SF) | `production.entry.confirmed` (Vol 6) or manual `S-RCP-06` | `103` | `QUARANTINE` if final inspection required |
| Sales return | `sales.return.approved` (Vol 2) | `104` | `QUARANTINE` always — a returned bottle is inspected |
| Job-work receipt | `S-RCP-08`, against an open challan (Ch 5) | `105` | `QUARANTINE` if inspection required |
| Inter-plant transfer receipt | Transfer receipt (Ch 5) | `304` | Status carried from the sending plant |
| Count / adjustment increase | Ch 6, Ch 8 | `401`/`403` | `AVAILABLE` |
| Scrap generation | Ch 6 | `401` at NRV into `SCR-01` | `AVAILABLE` |
| Opening balance (cutover) | Migration | `401` with a migration reason | As migrated |

## 3.3 Status flow of a receipt posting

```
      ┌──────────────┐   inspection not required (item/config)
      │  RECEIVED    ├────────────────────────────────────────┐
      └──────┬───────┘                                        │
             │ inspection required                            │
             ▼                                                ▼
      ┌──────────────┐   QC accept        ┌──────────────────────┐
      │ QUARANTINE   ├───────────────────►│  AVAILABLE (put-away │
      │              │                    │  pending)            │
      └──┬────────┬──┘                    └───────────┬──────────┘
         │        │ QC reject                         │ put-away confirmed
         │        ▼                                   ▼
         │  ┌──────────────┐              ┌──────────────────────┐
         │  │  REJECTED    │              │  IN BIN (addressable)│
         │  └──────┬───────┘              └──────────────────────┘
         │         │ purchase return (Vol 3) / scrap (Ch 6)
         │         ▼
         │   removed from stock
         │
         └──► QC accept under deviation → AVAILABLE, batch flagged `DEVIATION`
```

## 3.4 Functional requirements — posting

| Ref | Pri | Requirement |
|---|---|---|
| **V4-RCP-FR-002** | M | The posting is **line-and-batch level**: one GRN line receiving three heats of coil produces three batches, three ledger rows and three labels. |
| **V4-RCP-FR-003** | M | Receipt quantity, rate and value come from the source document; this module never re-prices a receipt. Landed-cost components arriving later adjust value through movement `602` (Ch 9). |
| **V4-RCP-FR-004** | M | Inspection requirement is resolved per item × supplier × warehouse from the item master and QC configuration (Vol 7). The resolved decision and its source are stored on the receipt so a later configuration change never rewrites history. |
| **V4-RCP-FR-005** | M | Receipt of a batch-managed item without a batch number is refused. Where the supplier's heat/lot number is known it becomes the batch's supplier reference; the internal batch number always comes from the numbering engine (`BATCH`). |
| **V4-RCP-FR-006** | M | Receipt of a serial-managed item generates or accepts serials for the full quantity; the count of serials MUST equal the received quantity. |
| **V4-RCP-FR-007** | M | Cancelling the source GRN emits `procurement.grn.cancelled`, which posts a reversing `102` movement. If any of the received quantity has already moved on, the reversal is refused and the correction must be an adjustment with a reason (Ch 6). |
| **V4-RCP-FR-008** | M | A receipt posts to the warehouse named on the source document; where that warehouse requires bin management, the stock lands in the warehouse's **receiving/staging bin** until put-away confirms a storage bin. |

## 3.5 Functional requirements — put-away

| Ref | Pri | Requirement |
|---|---|---|
| **V4-RCP-FR-009** | M | Quarantined stock is not pickable, not in ATP, and cannot be put away into a general storage bin unless the warehouse's quarantine policy is `SEGREGATED_BIN` (physically separate bin, logically quarantined). |
| **V4-RCP-FR-010** | M | The system **proposes** a bin per line using the warehouse put-away strategy (Ch 1 §1.4), showing the reason for the proposal. The operator accepts, or overrides with `INVENTORY.PUTAWAY.OVERRIDE_BIN` and a reason. |
| **V4-RCP-FR-011** | M | Put-away may be **partial and split**: 9,600 kg across four coil stands is four put-away lines against one receipt line, each with its own quantity and bin. |
| **V4-RCP-FR-012** | M | Put-away confirmation prints or reprints the batch label and, where applicable, the pallet/handling-unit label (Vol 0 §15). |
| **V4-RCP-FR-013** | M | A **pending put-away board** (`S-RCP-01`) shows everything received and not yet binned, aged in hours, with the target of ≤ 4 working hours; it escalates on breach. |
| **V4-RCP-FR-014** | M | Put-away is available on the mobile scanner: scan batch label → scan bin → confirm quantity. No keyboard entry required for the normal case. |
| **V4-RCP-FR-015** | S | Cross-docking: where an open production reservation or sales allocation exists for the received material, the proposal offers the staging bin for immediate issue instead of a storage bin, and says why. |

## 3.6 Functional requirements — QC hold and release

| Ref | Pri | Requirement |
|---|---|---|
| **V4-RCP-FR-016** | M | On `quality.inspection.completed` the module moves the lot: accepted → `AVAILABLE` (movement `501`), rejected → `REJECTED` and, per configuration, physically transferred to the reject warehouse; accepted-under-deviation → `AVAILABLE` with the batch flagged and the deviation reference stored. |
| **V4-RCP-FR-017** | M | **Partial decisions** are supported: of 1,200 kg, 900 accepted and 300 rejected creates two outcomes from one quarantine lot with independent traceability. |
| **V4-RCP-FR-018** | M | A manual release without a QC decision requires `INVENTORY.QC_HOLD.RELEASE`, a reason, and notifies the Quality Head. It is listed on a standing exception report. |
| **V4-RCP-FR-019** | M | Quarantine ageing is tracked and escalated: lots held beyond a configurable number of days appear on the quarantine ageing report and notify QC and Stores. |
| **V4-RCP-FR-020** | M | Stock in `QUARANTINE` or `REJECTED` is included in valuation but excluded from availability, so the balance sheet is right while production cannot touch it. |

## 3.7 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V4-RCP-BR-001** | M | Receipt posting is idempotent per source document line: a re-delivered `grn.approved` event must not double-post. Idempotency is keyed on `(event_id)` and on `(source_doc_uid, source_line_uid, revision)`. |
| **V4-RCP-BR-002** | M | The MTC / test-certificate attachment for a steel batch attaches to the **batch**, not to the GRN, so it survives GRN cancellation and is reachable from any bottle made from that heat. |
| **V4-RCP-BR-003** | M | A receipt into a `SUBCONTRACTOR` or `TRANSIT` warehouse is only ever produced by a transfer or challan document, never by this screen. |
| **V4-RCP-BR-004** | M | Excess receipt beyond the PO tolerance is Vol 3's decision; by the time it reaches this module the quantity is authorised. Inventory does not re-check tolerance and does not silently truncate. |
| **V4-RCP-BR-005** | M | Put-away cannot exceed the quantity received on that line, cannot target a blocked bin, and cannot mix batches into a `mixing_allowed = false` bin. |
| **V4-RCP-BR-006** | M | Expiry date is mandatory at receipt for shelf-life items and MUST be > the receipt date. A near-expiry receipt (remaining shelf life below the item's configured minimum, default 75%) requires acknowledgement with a reason. |
| **V4-RCP-BR-007** | M | For dual-UOM steel, the receipt stores the weighbridge/challan weight in kg **and** the derived piece equivalent with the conversion factor used at that moment. |
| **V4-RCP-BR-008** | S | Where the received quantity differs from the ASN or challan quantity, the difference is shown at posting; it is Vol 3's variance, but the storekeeper must see it before binning. |

## 3.8 Screens

### S-RCP-02 · Put-away entry

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Put-away · PUT/26-27/00881          Against P1/GRN/26-27/00318 · Jindal Stainless      │
│                                        Received 12-Jul-2026 14:20 · aged 2 h 10 m        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Warehouse [RM-01 Raw Material Store ▼]     Strategy: BULK_FIRST     [Auto-propose all]   │
├──┬─────────────────────┬──────────┬─────────┬────────────┬─────────────┬────────────────┤
│ #│ Item / batch        │ Received │ To bin  │ Qty        │ Proposal    │ Status         │
├──┼─────────────────────┼──────────┼─────────┼────────────┼─────────────┼────────────────┤
│ 1│ RM-SS304-050        │ 9,600 KG │ CY-04 🔍│ 4,800.000  │ nearest emp │ ✔ ready        │
│  │ B2607-H4488 heat 4488│         │ CY-05 🔍│ 4,800.000  │ nearest emp │ ✔ ready        │
│  │ ⓘ MTC attached · quarantine (IQC/26-27/00214 pending)                                 │
│ 2│ CMP-LID-SCR-SS      │30,000 NOS│ A-04-2-1│ 30,000.000 │ consolidate │ ⚠ 92% capacity │
│  │ B2607021            │          │         │            │ (same batch)│   [Split]      │
│ 3│ CON-PWD-BLK         │   400 KG │ BLK-03 🔍│   400.000  │ zone: chem  │ ✔ ready        │
│  │ B2607022 exp 10-Jan-27│        │         │            │             │                │
├──┴─────────────────────┴──────────┴─────────┴────────────┴─────────────┴────────────────┤
│ ⚠ Line 2 overrides the proposed bin A-04-1-3 — reason required                           │
│ [ ] Print batch labels on confirm   [ ] Print bin labels                                 │
│                                    [Save draft] [Confirm put-away & print (3 labels)]    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-RCP-01 · Pending put-away board

Archetype E (board), columns: `Received` → `Put-away in progress` → `Awaiting QC` → `Done today`.
Cards show document, supplier/source, item count, total quantity, age in hours, and turn amber at
3 h and red at 4 h. Drag between columns is not permitted — movement happens by confirming the
document, never by moving a card.

### Other screens

| Screen | Notes |
|---|---|
| S-RCP-03 Receipt Posting Detail | The stock view of a GRN: lines, batches, serials, ledger rows created, bins, QC status, linked documents. |
| S-RCP-04 Quarantine & QC Hold | Lots awaiting decision with age, inspection reference, supplier, and a link to the Vol 7 inspection. |
| S-RCP-05 QC Release / Block | Dialog: accept / reject / accept-under-deviation, quantity split, reason code, destination warehouse for rejects. |
| S-RCP-06 Production Receipt | FG/SF declaration when not driven by Vol 6: production order, quantity, batch, serial range, bin. |
| S-RCP-07 Sales Return Receipt | Against the return authorisation; always quarantined; condition grading captured. |
| S-RCP-08 Job-work Receipt | Against an open job-work challan; consumes the issued material per BOM with process-loss tolerance (Ch 5). |
| S-RCP-09 Label Printing | Reprint by batch, bin, pallet or receipt, with a reprint reason and count — reprints are audited because a duplicate label is a traceability hazard. |

### Field table — put-away line

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| Receipt line | FK | Yes | The source line being binned |
| Item | FK | derived | Read-only |
| Batch | FK | Cond. | Mandatory for batch-managed items |
| Serial range | text | Cond. | Serial-managed items |
| Quantity | decimal(18,6) | Yes | > 0, ≤ remaining unbinned quantity |
| From bin | FK | derived | Receiving/staging bin |
| To bin | FK | Yes | Must be available, eligible, within capacity |
| Proposed bin | FK | derived | Stored even when overridden |
| Override reason | FK reason code | Cond. | Mandatory when `to_bin ≠ proposed_bin` |
| Handling unit / pallet | string | No | Created or scanned |
| Label printed | bool | derived | Set on print; reprints counted |

## 3.9 Validations

| # | Validation | Trigger | Severity | Message pattern |
|---|---|---|---|---|
| 1 | Source document approved and not cancelled | Post | Error | — |
| 2 | Batch present for batch-managed item | Post | Error | "Item {code} is batch-managed — batch number is required" |
| 3 | Serial count equals quantity | Post | Error | "48 serials expected, 46 entered" |
| 4 | Expiry date present and future for shelf-life items | Post | Error | — |
| 5 | Remaining shelf life ≥ item minimum | Post | Warning + acknowledgement | "Only 61% of shelf life remains (min 75%)" |
| 6 | Duplicate serial anywhere in the company | Post | Error | "Serial {n} already exists on {doc}" |
| 7 | Put-away quantity ≤ unbinned quantity | Confirm | Error | — |
| 8 | Target bin available, eligible, not blocked | Confirm | Error | "Bin A-01-2-1 is blocked: rack under repair" |
| 9 | Bin capacity | Confirm | Warning or Error per config | "Bin holds 480/500 kg — 300 kg will exceed capacity" |
| 10 | Mixing rule | Confirm | Error | "Bin CY-01 holds batch B2606-H4471; mixing is not allowed" |
| 11 | Override reason present | Confirm | Error | — |
| 12 | Financial period open for the posting date | Post | Error | — |
| 13 | Quarantine release without a QC decision | Release | Warning + permission | — |
| 14 | Reversal when quantity already consumed | Cancel | Error | "1,200 KG of this receipt has been issued — post an adjustment instead" |

## 3.10 Notifications

| Trigger | Recipient | Channel | Urgency |
|---|---|---|---|
| Stock received and awaiting put-away | Store operator queue | In-app, push | Normal |
| Put-away pending > 4 h | Stores In-charge | In-app, e-mail | High |
| Lot quarantined | QC inspector queue | In-app, push | High |
| Quarantine aged beyond threshold | QC Head, Stores In-charge | In-app, e-mail | High |
| QC rejected a lot | Stores, Purchase, Supplier (Vol 3) | In-app, e-mail | High |
| Manual QC release without inspection | Quality Head, Factory Head | In-app, e-mail | High |
| Near-expiry material received | Stores In-charge, Purchase | In-app | Normal |
| Receipt posting failed (event handler error) | System admin, Stores In-charge | In-app, e-mail | High |

## 3.11 Reports contributed

Daily Receipt Register · Receipt by Source (purchase / production / return / job work) ·
Put-away Performance & Ageing · Quarantine Register & Ageing · QC Release Log · Manual Release
Exceptions · Label Print & Reprint Log · Receipt vs Document Variance.

## 3.12 Audit trail

Receipt posting with the source event id, batch and serial creation, expiry acknowledgement text,
bin proposal and any override with reason and both bins, label prints and reprints with the
reason, QC status changes with the inspection reference, manual releases with the approver, and
every reversal with the original ledger row it reverses.

## 3.13 Acceptance criteria (extract)

- A GRN line of 9,600 kg across two heats posts two batches, two ledger rows, and offers two
  labels; the MTC attaches to the batch and is still reachable after the GRN is cancelled.
- Received material appears in on-hand and in valuation immediately, and in free stock only after
  QC release.
- Re-delivering `procurement.grn.approved` for the same GRN posts nothing the second time.
- Put-away of 4,800 + 4,800 kg into two coil stands closes the pending put-away card; a third
  put-away against the same line is refused.
- Overriding the proposed bin without a reason is refused; with a reason, both bins appear in the
  audit log.
- A rejected lot cannot be picked for production, cannot be transferred to a production
  warehouse, and appears in the reject-store balance within the same transaction as the QC
  decision.

---

**Next:** [Chapter 4 — Material Issue & Return](04-material-issue-and-return.md)
