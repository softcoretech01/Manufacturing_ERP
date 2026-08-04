# Volume 3 · Chapter 7 — Goods Receipt, Purchase Return & Invoice Verification

**Area codes:** `GRN` (gate entry & goods receipt) · `PRT` (purchase return & debit note) ·
`PIV` (supplier invoice verification)
Numbering: `GRN` → `{PLANT}/GRN/{FY}/{SEQ:5}` (gapless, allocate on approval) ·
`PURCHASE_RETURN` → `{PLANT}/PRT/{FY}/{SEQ:4}` (statutory, gapless) ·
`DEBIT_NOTE` → `DN/{FY}/{SEQ:4}` (statutory, gapless)

---

# Part A — Gate Entry & Goods Receipt (`GRN`)

## 7.1 Purpose

The GRN is where a commercial promise becomes physical stock and a financial liability. It is
the point at which quantity, quality, identity and cost are all fixed, and the point at which
almost every downstream dispute originates.

Four things this design insists on:

1. **Security records inward separately from stores.** Gate entry is created by security from
   the vehicle and documents; the GRN is created by stores from the physical count. A single
   person doing both is how unauthorised inward happens.
2. **Identity is captured at receipt or never.** Heat number, batch, lot, manufacturing and
   expiry dates, and the mill test certificate must be recorded at the GRN line. Retrofitting
   traceability is impossible.
3. **Receipt is not acceptance.** Quantity received, quantity accepted and quantity rejected
   are three different numbers. Stock and liability follow acceptance, not arrival.
4. **Tolerance is a policy, not a favour.** Over-receipt, under-receipt and short-supply are
   decided by configured tolerances with explicit authority to exceed them.

## 7.2 Receipt flow

```
  Supplier despatch (+ ASN, invoice, e-way bill, LR)
            │
            ▼
   ┌──────────────────┐  security: vehicle, driver, documents, gross weight,
   │   GATE ENTRY     │  e-way bill validity, PO reference, photo
   │  (S-GRN-02)      │  → gate pass number, vehicle allowed in
   └────────┬─────────┘
            │  unloading at stores
            ▼
   ┌──────────────────┐  stores: physical count / net weight, packing condition,
   │      GRN         │  batch & heat capture, MTC attachment, tolerance check
   │  (S-GRN-05)      │
   └────────┬─────────┘
            │  ⛿ GRN approval (Store In-charge)
            ▼
   ┌──────────────────────────────────┐
   │ Inspection required?             │
   └───┬──────────────────────────┬───┘
      no                         yes
       │                          ▼
       │              ┌────────────────────────┐  Vol 7 raises an inspection lot;
       │              │  QUARANTINE / UNDER_    │  material is physically and
       │              │  INSPECTION             │  systemically segregated
       │              └───────────┬────────────┘
       │                          │ QC decision
       │        ┌─────────────────┼──────────────────┬───────────────────┐
       │        ▼                 ▼                  ▼                   ▼
       │   ACCEPTED         ACCEPTED WITH      REJECTED           RE-INSPECTION
       │                    DEVIATION          (full or part)     after rework/sort
       │        │            (concession,           │
       │        │             with approval)        │
       ▼        ▼                 │                 ▼
   ┌───────────────────────┐      │        ┌──────────────────┐
   │ PUT-AWAY → STOCK IN   │◄─────┘        │ REJECTION STORE  │
   │ (Vol 4 posts stock &  │               │ (segregated bin) │
   │  valuation; GRIR      │               └────────┬─────────┘
   │  accrual in Vol 9)    │                        │
   └───────────────────────┘                 PURCHASE RETURN
                                             + DEBIT NOTE
```

## 7.3 Gate entry

| Ref | Pri | Requirement |
|---|---|---|
| **V3-GRN-FR-001** | M | Gate entry captures: date/time in, vehicle number, transporter, driver name and mobile, LR/consignment number and date, supplier, PO reference(s), supplier invoice/challan number and date, e-way bill number with validity, declared quantity/packages, gross weight, seal number, photographs, and the security officer. |
| **V3-GRN-FR-002** | M | Where an ASN exists (Ch 6 V3-POR-FR-030), gate entry is pre-filled from it by scanning the ASN barcode or entering the PO number. |
| **V3-GRN-FR-003** | M | The e-way bill number MUST be validated for format and, where the integration is available, for validity and vehicle match. An expired e-way bill is flagged and requires a supervisor acknowledgement to allow entry. |
| **V3-GRN-FR-004** | M | Weighbridge integration (`S-GRN-03`): gross weight on entry, tare weight on exit, net weight computed. Manual entry is permitted with a reason when the bridge is unavailable, and manual entries are reported. |
| **V3-GRN-FR-005** | M | Gate entry produces a printed **gate pass** with a barcode/QR. Stores create a GRN by scanning it. Gate entries with no GRN after a configurable period are reported as pending inward. |
| **V3-GRN-FR-006** | M | Gate entry MUST be permitted for material with **no PO** only when flagged as such (`RETURNABLE_IN`, `SAMPLE`, `SUBCONTRACT_RETURN`, `CUSTOMER_SUPPLIED`, `WITHOUT_PO_EXCEPTION`), with a reason and the receiving department named. Without-PO exceptions are reported daily to the Purchase Head. |
| **V3-GRN-FR-007** | M | Gate exit is recorded for the vehicle, with tare weight and exit time, closing the gate entry. Open gate entries beyond a threshold are escalated. |

## 7.4 GRN status flow

```
  ┌────────┐ submit  ┌──────────────────┐ approve ┌──────────┐
  │ DRAFT  ├────────►│ PENDING_APPROVAL ├────────►│ APPROVED │  number allocated (gapless)
  └───┬────┘         └────────┬─────────┘         └────┬─────┘
      │ ▲                     │ reject                 │
      │ └── return ───────────┘                        │ inspection required?
      │                                    ┌───────────┴──────────┐
      │                                   no                     yes
      │                                    │                      ▼
      │                                    │            ┌───────────────────┐
      │                                    │            │ UNDER_INSPECTION  │
      │                                    │            └─────────┬─────────┘
      │                                    │                      │ QC posts result
      │                                    ▼                      ▼
      │                            ┌────────────────────────────────────┐
      │                            │  INSPECTED  (accepted / partially  │
      │                            │  accepted / rejected quantities)   │
      │                            └───────────────┬────────────────────┘
      │                                            │ put-away
      │                                            ▼
      │                                    ┌──────────────┐
      │                                    │  COMPLETED   │  stock posted (Vol 4)
      │                                    └──────┬───────┘
      │                                           │ invoice matched & posted
      │                                           ▼
      │                                    ┌──────────────┐
      │                                    │   CLOSED     │
      │                                    └──────────────┘
      │
      └── cancel (before stock posting, reason mandatory) ──► CANCELLED
          reverse (after stock posting, privileged, creates a reversal GRN) ──► REVERSED
```

**V3-GRN-BR-001 (M)** Once stock is posted, a GRN MUST NOT be cancelled or edited. Correction
is by a **reversal GRN** that reverses the stock and the accrual, referencing the original, with
a reason and an approval. Silent editing of a posted receipt is a control failure and an
inventory-valuation error.

## 7.5 GRN functional requirements

### 7.5.1 Receipt against a PO

| Ref | Pri | Requirement |
|---|---|---|
| **V3-GRN-FR-008** | M | A GRN is created against one PO (default) or several POs of the same supplier and plant, pulling open schedule lines with ordered, already-received and pending quantities shown. Lines with nothing pending are hidden by default. |
| **V3-GRN-FR-009** | M | **Partial receipt** is normal: receive any quantity ≤ pending. The PO line and schedule line update to `PARTIALLY_RECEIVED`, and the balance stays open until received, short-closed or cancelled. |
| **V3-GRN-FR-010** | M | **Excess receipt** is controlled by an over-receipt tolerance % configured at item, supplier and company level (most specific wins). Within tolerance → accepted, flagged. Beyond tolerance → blocked unless the user holds `PROCUREMENT.GRN.ACCEPT_EXCESS`, which requires a reason and raises an approval; otherwise the excess must be recorded as `RETURNED_AT_GATE` and never enters stock. |
| **V3-GRN-FR-011** | M | **Under-receipt / short supply** beyond the under-tolerance requires a disposition: keep the balance open, short-close the line, or record a shortage claim against the supplier (feeding a debit note where the invoice covers the full quantity). |
| **V3-GRN-FR-012** | M | Every line captures: received quantity, UOM (with dual-UOM alternate — weight and pieces for SS), packing condition, and — where applicable — **batch/lot number, heat number, manufacturing date, expiry/shelf-life date, country of origin, and the test certificate reference**. |
| **V3-GRN-FR-013** | M | A single PO line MUST be splittable into several receipt sub-lines when one delivery contains several batches or heats (`S-GRN-06`). Each sub-line has its own batch identity, quantity, certificate and, after inspection, its own accept/reject result. |
| **V3-GRN-FR-014** | M | **Weight-to-piece conversion** for SS coil/sheet: the GRN records the received weight, the grade, thickness, width and coil identity, and computes the equivalent piece/blank count using the item's conversion basis. Both figures are stored; inventory holds both. |
| **V3-GRN-FR-015** | M | **Barcode/QR** support per Vol 0 §15: scan the gate pass to open the GRN, scan the item barcode to select a line, scan or print batch labels, and print bin/put-away labels. Mobile scan-first GRN entry is specified in Ch 13. |
| **V3-GRN-FR-016** | M | **Warehouse and bin selection** per line, defaulted from the PO delivery warehouse and the item's default bin, overridable within the user's scope. Inspection-required items default to the quarantine location. |
| **V3-GRN-FR-017** | M | Landed-cost components known at receipt (freight paid by us, unloading, inspection charges) may be captured on the GRN and apportioned to lines, feeding inventory valuation (Vol 4) and later reconciled against the actual invoices (§7.13). |
| **V3-GRN-FR-018** | M | GRN against a **subcontract** PO receives the finished/processed item, consumes the issued material at standard per the BOM, records the actual process loss, and updates the challan reconciliation (Ch 6 §6.4.3). |
| **V3-GRN-FR-019** | M | GRN for **imports** references the Bill of Entry, and customs duty, CHA, port and freight charges are apportioned to the landed cost. Receipt without a BOE is permitted only into a bonded/pending location, configurable. |
| **V3-GRN-FR-020** | S | **Service entry sheet** for service POs: performance period, quantity/value confirmed, confirming authority, and supporting evidence. It is the match document in place of a GRN. |

### 7.5.2 Inspection interface

| Ref | Pri | Requirement |
|---|---|---|
| **V3-GRN-FR-021** | M | Inspection requirement per line resolves from: PO line → AVL entry → item master → company default. Values: `100%`, `SAMPLING` (AQL plan from Vol 7), `SKIP_LOT`, `MTC_ONLY`, `NONE`. |
| **V3-GRN-FR-022** | M | On GRN approval, an **inspection lot** is raised in Quality (Vol 7) per line/sub-line requiring inspection, and the material is placed in a quarantine location. It MUST NOT be available to production. |
| **V3-GRN-FR-023** | M | QC posts back, per lot: accepted quantity, rejected quantity, quantity accepted under deviation/concession, defect codes, inspector, and the report reference. This module reflects those quantities on the GRN line; it does not perform the inspection. |
| **V3-GRN-FR-024** | M | **Acceptance under deviation** requires an approval (Quality Head plus, above a configurable value, Factory Head) and records the concession reason. It may carry a price-concession claim, which generates a debit-note proposal. |
| **V3-GRN-FR-025** | M | Only **accepted** quantity moves to unrestricted stock. Rejected quantity moves to the rejection location and becomes the input to a purchase return. Quantity pending inspection stays in quarantine and is visible as such. |
| **V3-GRN-FR-026** | M | Ageing of material pending inspection is tracked and escalated; ageing of rejected material awaiting return is tracked, escalated, and above a threshold blocks further receipt from that supplier (V3-PRT-FR-004). |
| **V3-GRN-FR-027** | M | Missing or invalid **MTC / test certificate** on a line whose item requires one blocks acceptance regardless of physical inspection. |

### 7.5.3 Posting

| Ref | Pri | Requirement |
|---|---|---|
| **V3-GRN-FR-028** | M | Stock posting is performed by Inventory (Vol 4) on the `procurement.grn.approved` / `procurement.grn.inspected` events. This module MUST NOT write stock tables directly (CLAUDE.md §3.3). |
| **V3-GRN-FR-029** | M | The GRN transmits, per line: item, batch/heat, quantity in stocking UOM and alternate UOM, warehouse, bin, valuation rate (PO rate + apportioned landed cost, in base currency at the stamped rate), and the traceability keys. |
| **V3-GRN-FR-030** | M | Finance (Vol 9) accrues the **GRIR** (goods-received-not-invoiced) liability on the same event. GRIR is cleared at invoice verification (§7.13), and the open GRIR balance is reconciled monthly (`S-PIV-04`). |
| **V3-GRN-FR-031** | M | The GRN updates the supplier's OTIF and quality statistics, feeding the rating engine (Ch 1 §1.4). |

## 7.6 GRN business rules

| Ref | Pri | Rule |
|---|---|---|
| **V3-GRN-BR-002** | M | A GRN MUST reference a `RELEASED` / `PARTIALLY_RECEIVED` PO. Receipt against a `DRAFT`, `PENDING_APPROVAL`, `ON_HOLD`, `CANCELLED` or `SHORT_CLOSED` PO is blocked. |
| **V3-GRN-BR-003** | M | Batch/heat number is mandatory for every item flagged batch-managed. SS raw material, silicone, coating chemicals and inks are batch-managed by default. A GRN line for such an item without a batch cannot be saved. |
| **V3-GRN-BR-004** | M | Expiry-managed items MUST carry a manufacturing and an expiry date, and MUST have at least the configured minimum shelf life remaining on receipt (default 75%); below it, receipt requires an approval with a reason. |
| **V3-GRN-BR-005** | M | Received quantity ≤ pending quantity + over-tolerance. The system computes and displays pending quantity at the schedule-line level, not the header. |
| **V3-GRN-BR-006** | M | GRN date MUST NOT be earlier than the PO release date, MUST be within an open financial period, and MUST NOT be in the future. Back-dating within an open period requires `PROCUREMENT.GRN.EDIT` plus a reason and is reported. |
| **V3-GRN-BR-007** | M | The GRN creator MUST NOT be the GRN approver, and MUST NOT be the QC inspector for the same lot (Vol 0 §4.2). |
| **V3-GRN-BR-008** | M | Rate on a GRN is taken from the PO and is **not editable**. A rate difference is an invoice-verification matter (§7.13), never a receipt matter. |
| **V3-GRN-BR-009** | M | The GRN series is gapless and allocated at approval. A cancelled GRN retains its number permanently (Vol 1 V1-NUM-BR-006). |
| **V3-GRN-BR-010** | M | For SS raw material, the heat number and the mill test certificate are mandatory, and the certificate must be attached to the line, not the header, because one receipt may contain several heats. |
| **V3-GRN-BR-011** | M | Quantity accepted + quantity rejected + quantity pending inspection MUST always equal quantity received, per line, at all times. This invariant is asserted after every posting and by a nightly integrity job. |
| **V3-GRN-BR-012** | M | A GRN line whose supplier is on hold or blacklisted at receipt time is permitted (the material is physically here) but is flagged and requires an approval before stock posting. |
| **V3-GRN-BR-013** | M | Excess accepted beyond tolerance MUST create the corresponding PO amendment or be recorded as an unordered-receipt exception; unrecorded excess stock is prohibited. |
| **V3-GRN-BR-014** | S | Repeated short supply on the same PO line beyond a configurable count raises a supplier performance flag and a task to the buyer. |

## 7.7 GRN validations

| # | Validation | Trigger | Severity |
|---|---|---|---|
| 1 | PO valid, released, not held/cancelled, supplier matches gate entry | Create | Error |
| 2 | At least one line with quantity > 0 | Submit | Error |
| 3 | Received ≤ pending + over-tolerance | Line save | Error / permission-gated override |
| 4 | Batch/heat present for batch-managed items | Line save | Error |
| 5 | Manufacturing/expiry dates present and shelf life ≥ minimum | Line save | Error / approval |
| 6 | MTC or test certificate attached where required | Submit | Error |
| 7 | Dual-UOM conversion consistent (weight ↔ pieces within tolerance) | Line save | Warning; error beyond a wider band |
| 8 | Warehouse/bin valid, in scope, and appropriate to the inspection state | Line save | Error |
| 9 | GRN date in an open period, not future, ≥ PO release date | Save | Error |
| 10 | Gate entry referenced and open (when gate entry is enforced) | Create | Error |
| 11 | Supplier invoice number + date captured, and not duplicated for the supplier | Save | Error on duplicate |
| 12 | E-way bill present where the value exceeds the statutory threshold | Save | Warning |
| 13 | Accepted + rejected + pending = received | Any posting | Error (system invariant) |
| 14 | Reversal GRN references a posted GRN and does not exceed its quantities | Save | Error |
| 15 | Serial numbers, where serial-managed, are unique and count-matched | Line save | Error |
| 16 | Optimistic lock version | Save | 409 |

## 7.8 GRN screens

### S-GRN-05 · GRN Create against PO

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Goods Receipt — New         Gate pass GP/25-26/01187 🔍   [Save Draft] [Submit] [⋮]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Receipt ──────────────────────────┐ ┌─ Supplier & documents ──────────────────────┐ │
│ │ GRN No. (on approval)              │ │ Supplier  Viraj Profiles Ltd                │ │
│ │ Date *  [26-Aug-2026] [14:35]      │ │ PO *      PO/25-26/00356 (released 05-Aug)  │ │
│ │ Plant * Plant 1  Store * RM Store  │ │ Invoice * [VP/2026/8841 ] [24-Aug-2026]     │ │
│ │ Received by  K. Ravi (Store Opr)   │ │ LR/DC     [TN-LR-99120  ] [24-Aug-2026]     │ │
│ │ Vehicle TN-70-BK-4412              │ │ E-way bill[391029384756 ] valid to 28-Aug ✔ │ │
│ │ Gross 18,420 kg · Tare 10,180 kg   │ │ Vehicle in 26-Aug 13:50 · Weighed ✔         │ │
│ │ Net 8,240 kg                       │ │                                              │ │
│ └────────────────────────────────────┘ └─────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Lines(1) │ Batches │ Charges │ Attachments(2) │ Comments │ Approvals │ History          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ #│ Item / PO line          │ Ordered│ Prev rcvd│ Pending│ Receiving │ UOM│ Store/Bin   │
│ 1│ SS304 Coil 0.5×400 2B   │  7,000 │        0 │  7,000 │ [ 8,240 ] │ KG │ QUARANTINE  │
│  │ Schedule 26-Aug 4,000 KG                                                            │
│  │ ⚠ Receiving 8,240 KG against schedule 4,000 KG (+106%). Over-tolerance is 2%.       │
│  │   [ Apply to next schedule (3,000) ] [ Record excess 1,240 KG ] [ Return at gate ]  │
│  │ Equivalent pieces 16,480 blanks (0.5 mm × 400 mm × SS304, 0.500 kg/blank)           │
│  │ Inspection: 100% + MTC 3.1 required   Certificate 📎 MTC-JSL-2026-4471.pdf          │
│  │ ▾ Batches / heats (3)                                     [ + Split batch ]         │
│  │   ├ Heat H-24418  coil C-9912  3,120 kg  MTC ✔  Origin India  Mfg 12-Aug-26        │
│  │   ├ Heat H-24419  coil C-9913  2,980 kg  MTC ✔  Origin India  Mfg 12-Aug-26        │
│  │   └ Heat H-24422  coil C-9917  2,140 kg  MTC ⚠ missing        Mfg 14-Aug-26        │
│  │     ⚠ Heat H-24422 cannot be accepted without its mill test certificate            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Received 8,240 kg · Σ batches 8,240 ✔ · Net weight matches ✔                            │
│ ⚠ 2 blocking issues: excess quantity disposition, missing MTC for heat H-24422          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Field table — GRN header

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| GRN number | string | auto | Gapless, allocated at approval |
| GRN date & time | datetime | Yes | Open period, not future |
| Plant / store | FK | Yes | User scope |
| Gate entry reference | FK | Cond. | Mandatory where gate entry is enforced |
| Supplier | FK | derived | From the PO; must match the gate entry |
| PO reference(s) | FK[] | Yes | Same supplier and plant |
| Supplier invoice no. & date | string / date | Yes | Duplicate-checked per supplier per FY |
| LR / consignment no. & date | string / date | No | — |
| E-way bill no. & validity | string / date | Cond. | Above the statutory value threshold |
| Vehicle / transporter / driver | string / FK | Cond. | From gate entry |
| Gross / tare / net weight | decimal(18,4) | Cond. | From weighbridge |
| Received by | FK user | auto | — |
| Receipt type | enum | Yes | `PO_RECEIPT` / `SUBCONTRACT_RETURN` / `SAMPLE` / `RETURNABLE_IN` / `FREE_SUPPLY` / `REVERSAL` |
| Landed-cost components | composite[] | No | With apportionment basis |
| Status / workflow | enum / FK | auto | §7.4 |
| Remarks | text | No | — |

### Field table — GRN line / batch sub-line

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| PO line + schedule line | FK | Yes | Determines pending quantity |
| Item / description / specification | FK / text | derived | From the PO; not editable |
| Ordered / previously received / pending | decimal | derived | Computed live |
| Received quantity | decimal(18,6) | Yes | ≤ pending + tolerance |
| UOM / alternate quantity + UOM | FK / decimal | Yes | Dual UOM computed and stored |
| Batch / lot number | string | Cond. | Mandatory for batch-managed items |
| Heat number / coil number | string | Cond. | Mandatory for SS raw material |
| Manufacturing / expiry date | date | Cond. | Mandatory for shelf-life items |
| Country of origin | FK | Cond. | Mandatory for imports and food-contact items |
| Test certificate reference + attachment | string / file | Cond. | Mandatory per item flag |
| Serial numbers | string[] | Cond. | Serial-managed items; count must equal quantity |
| Warehouse / bin | FK | Yes | Quarantine when inspection is required |
| Inspection requirement | enum | derived | §7.5.2 |
| Accepted / rejected / under-deviation / pending-inspection quantity | decimal | derived | Posted by QC; invariant per V3-GRN-BR-011 |
| Rejection reason / defect codes | FK[] | Cond. | From QC |
| Rate / landed rate | decimal(18,6) | derived | From the PO plus apportioned landed cost; not editable |
| Packing condition | enum | No | `OK` / `DAMAGED` / `WET` / `TAMPERED` — drives a claim |
| Line remarks | text | No | — |

### Other screens

| Screen | Notes |
|---|---|
| S-GRN-01/02 Gate Entry List & Create | Security-facing, minimal fields, camera capture, weighbridge button, prints a barcoded gate pass. Kiosk-friendly, large targets. |
| S-GRN-03 Weighbridge Capture | Live reading, capture gross/tare, manual fallback with reason, links to gate entry. |
| S-GRN-04 GRN List | Views: Pending approval, Under inspection, Awaiting put-away, Received not invoiced, Rejected pending return. |
| S-GRN-06 Batch/Heat Split drawer | Add sub-lines, per-batch quantity, certificate, dates; totals reconcile to the line quantity. |
| S-GRN-07 GRN Detail | Right rail: inspection status per batch, document flow, stock posting reference, GRIR status. |
| S-GRN-08 Pending Inspection Board | Kanban by state (Awaiting inspection / In progress / Accepted / Rejected / Deviation pending) with ageing colour and text badges. |
| S-GRN-10 Put-away | Suggested bins by item/batch strategy, scan-to-confirm, partial put-away, prints bin labels. |
| S-GRN-11 Mobile GRN | Ch 13 — scan gate pass → scan item → enter quantity → capture batch → photo → submit. Offline-capable. |

---

# Part B — Purchase Return & Debit Note (`PRT`)

## 7.9 Purpose and scope

Rejected material must leave the plant against a statutory document, and the supplier's
liability must be reduced by the right amount for the right reason. Two documents do this:

| Document | What it does | GST effect |
|---|---|---|
| **Purchase Return** (goods return / rejection challan) | Physical movement of goods out, reversing the stock | Supply back to the supplier; requires a tax document and, above the threshold, an e-way bill |
| **Debit Note** | Financial claim against the supplier | Reduces payable; reported in GST returns; may exist without a goods movement (rate difference, shortage, quality penalty, freight claim) |

**V3-PRT-BR-001 (M)** A purchase return that reverses stock MUST be accompanied by a debit
note, generated together by default. A debit note MAY exist without a return.

## 7.10 Functional requirements

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PRT-FR-001** | M | A purchase return is created against GRN lines with rejected quantity, or against accepted stock later found defective (with a reason and, above a threshold, an approval). It carries batch/heat identity, so exactly the received batch is returned. |
| **V3-PRT-FR-002** | M | Return reasons come from a configured reason list: `QUALITY_REJECTION`, `SHORT_SUPPLY_ADJUSTMENT`, `WRONG_ITEM`, `DAMAGED_IN_TRANSIT`, `EXCESS_SUPPLY`, `SPECIFICATION_DEVIATION`, `EXPIRY_SHELF_LIFE`, `SAMPLE_RETURN`, `TRIAL_FAILURE`. The reason drives the accounting treatment and whether transit damage is claimed from the transporter instead of the supplier. |
| **V3-PRT-FR-003** | M | Return disposition options: `RETURN_TO_SUPPLIER`, `REPLACEMENT_EXPECTED` (a replacement obligation is tracked and the PO line stays open), `REWORK_AT_SUPPLIER` (returnable-out with an expected return), `SCRAP_AT_OUR_END` (with the supplier's written consent attached), `USE_AS_IS_WITH_CONCESSION` (price reduction rather than physical return). |
| **V3-PRT-FR-004** | M | **Rejection ageing**: rejected material awaiting return is aged from the QC rejection date, escalated at configurable thresholds, and beyond a hard threshold (default 30 days) blocks new GRNs for that supplier until dispositioned. Rejected stock sitting in the plant is working capital and a floor-space cost. |
| **V3-PRT-FR-005** | M | Debit note types: `GOODS_RETURN`, `RATE_DIFFERENCE`, `SHORT_QUANTITY`, `QUALITY_PENALTY`, `LATE_DELIVERY_LD`, `FREIGHT_CLAIM`, `JOB_WORK_LOSS`, `OTHER`. Each has its own account determination and GST treatment. |
| **V3-PRT-FR-006** | M | The debit note computes value from the GRN's landed rate (or the invoice rate where the invoice is already booked), applies the same tax structure as the original supply, and carries the original invoice reference — a statutory requirement for credit/debit note reporting. |
| **V3-PRT-FR-007** | M | **Liquidated damages / late-delivery penalty** may be computed automatically from the PO's LD clause (rate per week, cap %) and the actual vs promised delivery date, proposed as a debit note for the buyer to confirm. |
| **V3-PRT-FR-008** | M | E-way bill generation for the outward movement where the value exceeds the threshold, using the return document as the basis. |
| **V3-PRT-FR-009** | M | Replacement tracking: where the disposition is `REPLACEMENT_EXPECTED`, the system tracks the expected replacement quantity and date, ages it, and reconciles it against the replacement GRN. |
| **V3-PRT-FR-010** | S | Supplier acknowledgement of the debit note is tracked on the portal; disputed debit notes are flagged and go to a resolution queue with the buyer and Finance. |

## 7.11 Business rules and validations

| Ref | Pri | Rule |
|---|---|---|
| **V3-PRT-BR-002** | M | Return quantity MUST NOT exceed the available rejected (or accepted-and-later-rejected) quantity of that batch from that GRN. |
| **V3-PRT-BR-003** | M | Both documents require approval before the goods may physically leave and before the financial claim is raised. Approval levels scale with value (Ch 8 §8.3). |
| **V3-PRT-BR-004** | M | Return and debit note numbers come from statutory, gapless series allocated at approval. Cancellation retains the number and reports the document as cancelled in the GST return. |
| **V3-PRT-BR-005** | M | A debit note MUST reference the original supplier invoice; where the invoice is not yet received, the debit note is held as `PENDING_INVOICE` and released when the invoice is booked, or raised against the GRN with the reference to be completed. |
| **V3-PRT-BR-006** | M | Stock reversal is posted by Inventory (Vol 4) on the return approval event, from the rejection location, at the original receipt's valuation for that batch — not at a current average. |
| **V3-PRT-BR-007** | M | Returning material that has already been consumed in production is refused; the disposition must be a concession or a quality claim without physical return. |
| **V3-PRT-BR-008** | M | Every return and debit note feeds the supplier's quality and cost-of-poor-quality statistics. |

| # | Validation | Severity |
|---|---|---|
| 1 | Source GRN line exists, is approved, and has the claimed rejected quantity available | Error |
| 2 | Batch/heat matches the GRN line's batch | Error |
| 3 | Return quantity > 0 and ≤ available | Error |
| 4 | Reason code and disposition present | Error |
| 5 | Original invoice referenced, or explicitly `PENDING_INVOICE` | Error |
| 6 | Tax structure matches the original supply (CGST+SGST vs IGST) | Error |
| 7 | E-way bill generated where the threshold is exceeded | Error at dispatch |
| 8 | Supplier consent attached for `SCRAP_AT_OUR_END` | Error |
| 9 | LD computation within the PO's cap % | Error |
| 10 | Period open; document date ≥ GRN date | Error |

## 7.12 Return & debit-note screens

| Screen | Notes |
|---|---|
| S-PRT-01 Purchase Return List | Views: Pending approval, Approved awaiting dispatch, Dispatched, Replacement pending, Aged rejections. |
| S-PRT-02 Purchase Return Create | Source GRN picker showing rejected quantities by batch, disposition per line, transport details, e-way bill panel, auto-generated debit-note preview. |
| S-PRT-03 Debit Note List | Views: Pending approval, Sent to supplier, Acknowledged, Disputed, Adjusted against payment. |
| S-PRT-04 Debit Note Create | Type, source (GRN/invoice/PO), value computation with tax breakup, original invoice reference, LD calculator, attachment of QC report. |

---

# Part C — Supplier Invoice Verification (`PIV`)

## 7.13 Purpose

Invoice verification is the financial control that closes the loop. Its job is to answer one
question before any money is committed: **does this invoice correspond to something we ordered
and something we actually received, at the price we agreed?**

**V3-PIV-BR-001 (M)** A supplier invoice MUST NOT be posted to accounts payable without a
successful three-way match — invoice ↔ purchase order ↔ goods receipt (or service entry sheet)
— or an explicit, reasoned, approved exception. There is no path that bypasses this silently.

## 7.14 The match

```
   ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
   │ PURCHASE     │        │ GOODS        │        │ SUPPLIER     │
   │ ORDER        │        │ RECEIPT      │        │ INVOICE      │
   │ what we      │        │ what arrived │        │ what they    │
   │ agreed       │        │ and was      │        │ are charging │
   │              │        │ accepted     │        │              │
   └──────┬───────┘        └──────┬───────┘        └──────┬───────┘
          │                       │                       │
          └───────────┬───────────┴───────────┬───────────┘
                      ▼                       ▼
             QUANTITY MATCH            PRICE MATCH
             invoiced qty ≤            invoice rate =
             accepted qty              PO rate
             (within tolerance)        (within tolerance)
                      │                       │
                      └───────────┬───────────┘
                                  ▼
                        ┌───────────────────┐
                        │  TAX & CHARGES    │  GST type, rate, HSN, freight,
                        │  MATCH            │  TDS/TCS, round-off
                        └─────────┬─────────┘
                                  ▼
                   ┌──────────────────────────────┐
                   │ MATCHED → post to AP (Vol 9) │
                   │ MISMATCH → BLOCKED with a    │
                   │ typed exception + resolution │
                   └──────────────────────────────┘
```

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PIV-FR-001** | M | Invoice capture routes: manual entry, supplier-portal upload, e-mail attachment with OCR assistance (`S` priority), and e-invoice IRN lookup where the supplier issues e-invoices. The IRN, when present, is captured and stored for GSTR-2B reconciliation. |
| **V3-PIV-FR-002** | M | One invoice MAY cover several GRNs and several POs of the same supplier; one GRN MAY be split across several invoices. The match is at line and quantity level, not document level. |
| **V3-PIV-FR-003** | M | Match tolerances are configurable at company, supplier and item level for: quantity (%/absolute), rate (%/absolute), value (absolute, to absorb rounding), and tax (absolute). Within tolerance → auto-matched; outside → blocked with a typed exception. |
| **V3-PIV-FR-004** | M | Exception types, each with its own resolution path and approval: `PRICE_VARIANCE`, `QUANTITY_VARIANCE`, `GRN_MISSING` (invoice before receipt), `PO_MISSING`, `TAX_MISMATCH`, `HSN_MISMATCH`, `DUPLICATE_INVOICE`, `SUPPLIER_MISMATCH`, `CURRENCY_MISMATCH`, `CHARGES_NOT_ON_PO`, `EXPIRED_PO`, `BLOCKED_SUPPLIER`, `MSME_TERM_BREACH`. |
| **V3-PIV-FR-005** | M | Resolution actions: accept the variance (with approval, within an authority limit), raise a debit note for the difference, request a credit note from the supplier, amend the PO (where the price change is legitimate and authorised), reverse and re-do the GRN, or reject the invoice back to the supplier with a reason. |
| **V3-PIV-FR-006** | M | **Duplicate detection** on (supplier, invoice number, financial year) is a hard block, and a fuzzy check on (supplier, amount, date ± 7 days) is a warning. Duplicate payment is the most common leakage in accounts payable. |
| **V3-PIV-FR-007** | M | **Landed-cost invoices** — freight, CHA, customs, insurance from third parties — are captured and apportioned to the related GRN lines, adjusting inventory value (Vol 4) and clearing the provisional landed cost accrued at receipt (`S-PIV-05`). |
| **V3-PIV-FR-008** | M | **TDS 194Q** and **TCS 206C(1H)** are finalised at verification against the supplier's year-to-date turnover, with the applicable section, rate and amount computed and shown; both applying simultaneously is prevented. |
| **V3-PIV-FR-009** | M | **ITC eligibility** is determined per line; blocked-credit lines (Sec 17(5)) are marked non-creditable and their tax is added to cost. The invoice's GST data is written to the purchase register for GSTR-2B matching. |
| **V3-PIV-FR-010** | M | **GRIR reconciliation** (`S-PIV-04`): received-not-invoiced and invoiced-not-received balances by supplier, PO, GRN and age, with drill-through and a disposition action. This is a month-end close requirement, not a report. |
| **V3-PIV-FR-011** | M | On approval, the invoice is handed to Finance (Vol 9) via `procurement.invoice.matched` for the AP voucher, GRIR clearing, TDS entry and payment scheduling. This module does not post accounting entries. |
| **V3-PIV-FR-012** | M | The payment due date is computed from the supplier's structured terms and the acceptance date, hard-capped at 45 days for MSME suppliers (Ch 1 V3-SUP-BR-008), and a breach forecast is raised before, not after, the date passes. |
| **V3-PIV-FR-013** | S | Advance and milestone payments recorded against the PO's payment plan are adjusted automatically against invoices, with the balance advance tracked per PO. |
| **V3-PIV-FR-014** | S | Self-billing / evaluated receipt settlement for named suppliers under a rate contract: the system generates the payable from the GRN without waiting for an invoice, where explicitly agreed and configured. |

## 7.15 Invoice status flow

```
  ┌──────────┐ submit  ┌────────────┐ auto-match ┌──────────┐ approve ┌──────────┐
  │ DRAFT    ├────────►│ UNDER_MATCH├───────────►│ MATCHED  ├────────►│ APPROVED │
  └──────────┘         └─────┬──────┘            └──────────┘         └────┬─────┘
                             │ mismatch                                     │ hand to Finance
                             ▼                                              ▼
                       ┌──────────────┐  resolve                    ┌──────────────┐
                       │  BLOCKED     ├──────────────────────────►  │  POSTED      │
                       │ (typed       │                             │ (AP voucher) │
                       │  exception)  │                             └──────┬───────┘
                       └──────┬───────┘                                    │ paid (Vol 9)
                              │ reject to supplier                         ▼
                              ▼                                     ┌──────────────┐
                       ┌──────────────┐                             │    PAID      │
                       │  REJECTED    │                             └──────────────┘
                       └──────────────┘
     Any state before POSTED ── cancel with reason ──► CANCELLED
```

## 7.16 Invoice business rules

| Ref | Pri | Rule |
|---|---|---|
| **V3-PIV-BR-002** | M | Invoiced quantity per PO line MUST NOT exceed accepted quantity (not received quantity). Material pending inspection is not payable. |
| **V3-PIV-BR-003** | M | Invoice rate is matched against the PO rate at the PO's revision in force at the receipt date, not the current revision. |
| **V3-PIV-BR-004** | M | An invoice for a supplier on payment hold is captured and matched but cannot be released for payment; the hold and its reason are shown. |
| **V3-PIV-BR-005** | M | The user resolving an exception MUST NOT be the user who approves the resolution above the configured value (SoD). |
| **V3-PIV-BR-006** | M | Every exception, its resolution, the resolver, the approver and the reason are retained permanently and reported in the match-exception analysis. |
| **V3-PIV-BR-007** | M | Where a debit note offsets an invoice, the linkage is explicit and the net payable is shown; a debit note MUST NOT be silently netted without a visible link. |
| **V3-PIV-BR-008** | M | GST place-of-supply and tax type on the invoice must match the PO's determination; a mismatch is a blocking exception, because an incorrectly typed tax is unclaimable. |
| **V3-PIV-BR-009** | M | Invoices for a closed PO are blocked; the PO must be reopened with authority, or the invoice rejected. |

## 7.17 Invoice screens

### S-PIV-02 · Invoice Verification Workbench

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Supplier Invoice VP/2026/8841 · Viraj Profiles      ⚑ BLOCKED — 2 exceptions          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Invoice date 24-Aug-2026 · Received 27-Aug · IRN ✔ captured · GSTIN 27AAACV1234M1Z8     │
│ Invoice value ₹20,89,514 · PO PO/25-26/00356 · GRN GRN/25-26/00891                      │
│ Terms 45 days · Due 10-Oct-2026 · MSME No                                               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  MATCH                                                                                  │
│  Line │ Item      │ PO qty │ Accepted│ Invoiced│ PO rate│ Inv rate│ Result              │
│    1  │ SS304 Coil│ 7,000  │  6,100  │  8,240  │ 248.00 │  250.50 │ ✖ QTY + ✖ PRICE     │
│       │           │        │         │         │        │         │                     │
│  ✖ QUANTITY_VARIANCE  invoiced 8,240 KG vs accepted 6,100 KG (+35.1%, tolerance 2%)     │
│     ⓘ 2,140 KG is pending inspection (heat H-24422, MTC missing) and is not yet payable │
│     Resolution [ Hold 2,140 KG for a later invoice ▼ ] → partial match 6,100 KG         │
│  ✖ PRICE_VARIANCE     ₹250.50 vs PO ₹248.00 (+1.01%, tolerance 0.5%) → ₹15,250          │
│     Supplier note: "index revision effective 15-Aug"                                    │
│     Resolution ( ) Accept variance — needs Purchase Head                                │
│                (•) Raise debit note ₹15,250 + tax                                        │
│                ( ) Request credit note   ( ) Amend PO rate   ( ) Reject invoice          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  TAX & STATUTORY                                                                        │
│  IGST 18% claimed ₹3,18,486 · computed on matched value ₹3,11,648 → variance ₹6,838     │
│  HSN 72193 ✔ matches PO · ITC eligible ✔ · Place of supply TN ✔                         │
│  TDS 194Q applicable — YTD purchases ₹1.42 Cr > ₹50 L → 0.1% on ₹15,12,800 = ₹1,513     │
│  TCS 206C(1H) not applicable (194Q takes precedence) ✔                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Matched value ₹15,12,800 + IGST ₹2,72,304 = ₹17,85,104                                 │
│  Debit note proposed DN ₹15,250 + IGST ₹2,745 = ₹17,995                                 │
│  Held for later invoice: 2,140 KG                                                       │
│                       [ Save ] [ Submit resolution for approval ] [ Reject to supplier ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Screen | Notes |
|---|---|
| S-PIV-01 Invoice List | Views: Blocked, Awaiting approval, Due this week, MSME due, Disputed, Posted. |
| S-PIV-03 Exception Resolution | Grouped by exception type with bulk resolution for identical causes; each still individually approved. |
| S-PIV-04 GRIR Reconciliation | Received-not-invoiced and invoiced-not-received by supplier/PO/age, with disposition and month-end sign-off. |
| S-PIV-05 Landed-cost Apportionment | Third-party freight/customs invoices apportioned to GRN lines, clearing the provisional accrual. |
| S-SUP-14 Portal Invoice Upload | Vendor-side: select PO/GRN, enter invoice details, upload PDF and e-invoice JSON, see match status and payment status. |

## 7.18 Approval rules (Parts A–C)

| Document | Condition | Levels |
|---|---|---|
| GRN | Within tolerance, no rejection | L1 Store In-charge *(auto-approve configurable for routine items)* |
| GRN | Excess beyond tolerance | L1 Store In-charge → L2 Purchase Manager |
| GRN | Supplier on hold / blacklisted at receipt | L1 Store In-charge → L2 Purchase Head |
| GRN | Reversal of a posted GRN | L1 Store Head → L2 Finance Manager |
| Acceptance under deviation | Value ≤ threshold | L1 QC Head |
| Acceptance under deviation | Above threshold | L1 QC Head → L2 Factory Manager |
| Purchase return | ≤ ₹1,00,000 | L1 Store Head → L2 Purchase Manager |
| Purchase return | > ₹1,00,000 | + L3 Factory Manager |
| Debit note | ≤ ₹50,000 | L1 Purchase Manager |
| Debit note | > ₹50,000 | L1 Purchase Manager → L2 Finance Manager |
| Debit note | Quality penalty / LD | + QC Head or Purchase Head per type |
| Invoice | Fully matched | L1 Accounts Executive (verification) |
| Invoice | Price variance within authority | L1 Accounts → L2 Purchase Manager |
| Invoice | Price variance above authority, or quantity variance | L1 Accounts → L2 Purchase Head → L3 Finance Manager |
| Invoice | Without PO or without GRN | L1 Accounts → L2 Purchase Head → L3 Finance Manager → L4 Director |

## 7.19 Notifications

| Trigger | Recipient | Channel |
|---|---|---|
| Vehicle at gate against a PO | Stores, buyer | In-app |
| Gate entry with no GRN after N hours | Store Head | In-app, e-mail |
| GRN submitted / approved | Store Head, buyer, requester | In-app |
| Inspection lot raised | QC | In-app, push |
| Inspection completed — accepted / rejected | Stores, buyer, requester | In-app, e-mail |
| Rejection recorded | Buyer, Purchase Head, supplier | In-app, e-mail |
| Rejected material ageing 7 / 15 / 30 days | Buyer, Purchase Head, Store Head | In-app, e-mail |
| Receipt block due to aged rejections | Buyer, Purchase Head, Stores | In-app, e-mail |
| Excess receipt beyond tolerance | Buyer, Purchase Manager | In-app |
| MTC/test certificate missing | Stores, buyer, supplier | In-app, e-mail |
| Purchase return approved / dispatched | Supplier, Finance | E-mail, portal |
| Debit note issued | Supplier, Finance | E-mail, portal |
| Debit note disputed by supplier | Buyer, Finance | In-app, e-mail |
| Invoice blocked with exception | Buyer, Accounts | In-app, e-mail |
| Exception unresolved > N days | Purchase Head, Finance Manager | In-app, e-mail |
| MSME payment due in 7 days | Accounts, Finance Manager | In-app, e-mail |
| MSME term breach forecast | Finance Manager, Director | In-app, e-mail |
| Duplicate invoice detected | Accounts, Finance Manager | In-app |

## 7.20 Reports contributed

GRN Register · Gate Entry Register & Pending Inward · Receipt vs PO (fulfilment) · Pending
Inspection Ageing · Rejection Analysis by supplier / item / defect · Batch & Heat Traceability
(forward and backward) · MTC Compliance · Over/Short Receipt Exception · Supplier OTIF ·
Purchase Return Register · Rejected Material Ageing · Debit Note Register · Replacement Pending ·
LD/Penalty Register · Supplier Invoice Register · Match Exception Analysis (by type, by
supplier, by resolver) · GRIR Ageing (received-not-invoiced / invoiced-not-received) · Landed
Cost Analysis · TDS/TCS Applicability · MSME Payment Compliance · Purchase Register for GSTR-2B
Reconciliation · Cost of Poor Quality (returns + penalties + rework).

## 7.21 Dashboard KPIs contributed

Receipts today / this month (count, value) · pending inspection (quantity, value, oldest) ·
rejection rate % · rejected material awaiting return (value, age) · supplier OTIF % · GRN
pending approval · invoices blocked (count, value) · first-pass match rate % · GRIR open value
and age · MSME payments due in 7 days · average GRN-to-invoice-posting days.

## 7.22 Events

| Event | When | Consumers |
|---|---|---|
| `procurement.gate_entry.created` | Vehicle admitted | Stores, Buyer, Dashboard |
| `procurement.grn.created` | GRN drafted | Audit |
| `procurement.grn.approved` | GRN approved | **Quality (inspection lot)**, **Inventory (quarantine/stock)**, **Finance (GRIR accrual)**, PO update, Supplier OTIF |
| `procurement.grn.inspected` | QC result posted | **Inventory (release from quarantine / move to rejection)**, Buyer, Supplier rating |
| `procurement.grn.completed` | Put-away done | Inventory, Planning (availability) |
| `procurement.grn.reversed` | Reversal posted | Inventory, Finance |
| `procurement.purchase_return.approved` | Return approved | **Inventory (stock out)**, Finance, Supplier portal |
| `procurement.debit_note.approved` | Debit note approved | **Finance (AP adjustment, GST)**, Supplier portal, Supplier rating |
| `procurement.invoice.received` | Invoice captured | Match engine, Dashboard |
| `procurement.invoice.blocked` | Match failed | Notification, Buyer task |
| `procurement.invoice.matched` | Match successful and approved | **Finance (AP voucher, GRIR clearing, TDS)**, Payment scheduling |
| `procurement.invoice.rejected` | Sent back to supplier | Supplier portal, Notification |

## 7.23 Audit trail

Every document in this chapter audits: creation, each field change, batch/heat entry and
correction, tolerance override with the reason and the authorising user, inspection result
posting, deviation acceptance with the concession reason, put-away location changes, GRN
approval and reversal, return disposition, debit-note computation basis, every match exception
with its resolution and approver, tolerance configuration changes, and every print and export.

**V3-GRN-BR-015 (M)** Corrections to a batch or heat number after stock posting are permitted
only through a privileged, reasoned, audited action, because the number is the traceability key
for a customer audit. The old and new values are both retained forever.

## 7.24 Acceptance criteria (extract)

- A GRN of 8,240 KG against a 4,000 KG schedule line with a 2% over-tolerance is blocked and
  offers three explicit dispositions.
- A GRN line split into three heats stores three batches whose quantities sum exactly to the
  line quantity, and rejecting one heat leaves the other two acceptable.
- A heat without an attached MTC cannot be accepted, even by a user with all permissions.
- Accepted + rejected + pending equals received on every line at every point, asserted by the
  nightly integrity job across the whole table.
- Material pending inspection is not visible to production as available stock, verified through
  the inventory availability API.
- An invoice for 8,240 KG when 6,100 KG is accepted is blocked with a `QUANTITY_VARIANCE`
  exception naming the 2,140 KG pending inspection.
- An invoice at ₹250.50 against a PO at ₹248.00 with a 0.5% tolerance is blocked, and the
  debit-note resolution generates a debit note of exactly ₹15,250 plus the same tax structure.
- The same supplier invoice number cannot be entered twice in a financial year.
- An MSME supplier's invoice shows a due date no later than 45 days from acceptance, whatever
  the credit terms say.
- Rejected material aged 31 days blocks the next GRN for that supplier until dispositioned.
- Re-printing a GRN from a closed period reproduces the stored artefact.

---

**Next:** [Chapter 8 — Approval Center](08-approval-center.md)
