# Volume 4 · Chapter 7 — Batch, Serial & Traceability

**Area code:** `BAT`
Prerequisite: [Vol 0](../volume-00-foundation.md) §15 (barcode) · [Ch 2](02-stock-model-and-enquiry.md)
Numbering: `BATCH` → `B{YY}{MM}{DD}{SEQ:3}` (daily reset) · serials per §7.4

---

## 7.1 Purpose

Traceability is the reason a customer audit passes and the reason a recall costs one day of
production instead of one month. It is not a report bolted on afterwards; it is a property of
every movement posted in Chapters 3 to 6.

**V4-BAT-FR-001 (M)** For any finished bottle the system MUST answer, in one query: which heat of
steel it was drawn from, which mill test certificate covers that heat, which supplier and GRN
brought it in, which coating batch was applied, which machine, shift and operator made it, which
inspection released it and which invoice and carton dispatched it. And the reverse: given a heat
number, every bottle, carton and customer that contains it.

## 7.2 What is tracked, and how

| Item class | Tracking | Identity source |
|---|---|---|
| SS coil / sheet | **Batch = one coil = one heat** | Supplier heat number recorded as the batch's supplier reference; internal batch number from the numbering engine |
| Components (silicone, inserts, lids) | Batch per supplier lot | Supplier lot number |
| Consumables (powder, ink, thinner) | Batch **with expiry** | Supplier batch + expiry from the certificate of analysis |
| Packing material | Batch optional; artwork revision mandatory | Artwork version |
| Semi-finished (shells, bodies) | Batch per production lot, inheriting parent batches | Production order + date |
| Finished bottles | Batch per production lot **and serial per piece** | Batch from production; serial generated at FG receipt |
| Scrap | Batch optional | Source document |

| Ref | Pri | Requirement |
|---|---|---|
| **V4-BAT-FR-002** | M | Batch tracking is an item-master attribute. Where it is on, no movement of that item can be posted without a batch — receipt, issue, transfer, adjustment or count. There is no bypass permission. |
| **V4-BAT-FR-003** | M | A batch record carries: internal batch number, supplier batch/heat number, item, manufacturing date, receipt date, expiry date, quantity received, quantity remaining, status, QC status and result reference, supplier, source document, and attachments (MTC, COA, food-grade certificate). |
| **V4-BAT-FR-004** | M | For steel, the batch additionally carries grade, thickness, width, coil weight, and the MTC number and its verification state. |
| **V4-BAT-FR-005** | M | Batch status: `ACTIVE`, `QUARANTINE`, `BLOCKED`, `EXPIRED`, `CONSUMED`, `RECALLED`. Blocking a batch blocks it **everywhere it exists**, in every warehouse, immediately — not bin by bin. |

## 7.3 Shelf life and FEFO

| Ref | Pri | Requirement |
|---|---|---|
| **V4-BAT-FR-006** | M | Shelf-life items carry an expiry date on every batch, mandatory at receipt, and derived from manufacturing date + shelf-life days where the supplier gives only the former. |
| **V4-BAT-FR-007** | M | Picking for shelf-life items is FEFO, enforced (Ch 1 §1.5, Ch 4). |
| **V4-BAT-FR-008** | M | A scheduled job sets batches to `EXPIRED` at end of day on the expiry date. Expired stock is not issuable, not in ATP, still valued, and proposed for write-off (Ch 6). |
| **V4-BAT-FR-009** | M | Near-expiry alerting at configurable lead times per item class (default 30 and 7 days), to Stores, Production Planning and Purchase, with the quantity and value at risk. |
| **V4-BAT-FR-010** | S | **Expiry extension** on the basis of a re-test is possible only with `INVENTORY.BATCH.EXTEND_EXPIRY`, a QC re-test reference, a new expiry date and a mandatory reason; it is reported and audited. |

## 7.4 Serial numbers

| Ref | Pri | Requirement |
|---|---|---|
| **V4-BAT-FR-011** | M | Serial-managed items receive one serial per unit at FG receipt. Serials are generated from a configurable pattern (default `{SKU}{YYMM}{SEQ:5}`) or accepted from an external source, and are unique across the company for all time. |
| **V4-BAT-FR-012** | M | A serial record holds: serial, item, batch, production order, manufacture date, current status, current location, carton/pallet, sales document, customer, dispatch date, warranty start and end, and service history references (Vol 2/10). |
| **V4-BAT-FR-013** | M | Serial status: `IN_STOCK`, `ALLOCATED`, `DISPATCHED`, `SOLD`, `RETURNED`, `SCRAPPED`, `IN_SERVICE`. Every transition is a movement or a document, never a manual edit. |
| **V4-BAT-FR-014** | M | Movements of serial-managed items name the individual serials. Quantity-only postings are refused. |
| **V4-BAT-FR-015** | M | Serial lookup by scan returns the full history in one screen — the warranty desk's primary tool. |
| **V4-BAT-FR-016** | S | Serial ranges are entered as ranges (`…00001–…01152`) but stored individually, so a split of the range later is a non-event. |

## 7.5 Genealogy

```
                        SS 304 coil · heat 4471 · GRN P1/GRN/26-27/00318 · Jindal · MTC 4471/2606
                                    │  batch B2606-H4471
                                    ▼  issued 1,250 KG to PRD/2607/0114 (OP-20 deep draw)
                        SF-BODY-750 · batch B2607014 · 4,980 pcs
                                    │        │
        powder coat B2604011 ───────┤        │ issued to job work JW/26-27/0118 (Coat Tech)
        (exp 18-Aug-26)             ▼        ▼
                        FG-SS-750-BLK · batch B2607021 · 4,860 pcs
                                    │  serials 750BLK260700001 … 04860
                                    ▼  inspected QC/26-27/00841 · released
                        Carton CTN260011284 … (40 cartons × 24)
                                    │
                                    ▼  invoice CHN/INV/26-27/00918 · Metro Retail · 31-Jul-26
```

| Ref | Pri | Requirement |
|---|---|---|
| **V4-BAT-FR-017** | M | Every consumption records the **parent batch(es)** against the produced batch, forming a genealogy graph that survives across job work, rework and repacking. |
| **V4-BAT-FR-018** | M | **Backward trace** from a serial, carton, invoice or customer returns every input batch, supplier, GRN, MTC and inspection at every level. |
| **V4-BAT-FR-019** | M | **Forward trace** from a heat number, supplier batch or GRN returns every semi-finished batch, finished batch, serial, carton, invoice and customer produced from it. |
| **V4-BAT-FR-020** | M | Both directions MUST return within 5 seconds for a genealogy of up to 5 levels and 50,000 serials (Vol 0 NFR). Traceability that takes an analyst a day is not traceability. |
| **V4-BAT-FR-021** | M | **Recall**: from a trace result, block every affected batch and serial still in stock, list what has been dispatched with customer and invoice, generate the customer notification list, and record the recall as a document with its own approval. |
| **V4-BAT-FR-022** | S | Rework and repacking preserve genealogy: a repacked carton keeps the serials it contains; a reworked bottle keeps its original parents plus the rework consumption. |

## 7.6 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V4-BAT-BR-001** | M | Internal batch numbers are unique per item per company and never reused, including after the batch is fully consumed. |
| **V4-BAT-BR-002** | M | Batch identity is preserved at bin level. Two batches in one bin remain two balance rows; the bin's mixing rule decides whether that is allowed at all (Ch 1). |
| **V4-BAT-BR-003** | M | Blocking a batch blocks it in every location within the same transaction, and cancels or flags any reservation held against it, notifying the holder. |
| **V4-BAT-BR-004** | M | MTC / COA attachments belong to the batch and are immutable once the batch has been consumed anywhere. |
| **V4-BAT-BR-005** | M | A batch cannot be deleted. A batch created in error is blocked with a reason and its stock adjusted out (Ch 6). |
| **V4-BAT-BR-006** | M | Expiry may only be extended forward, never backward, and only with a QC re-test reference. |
| **V4-BAT-BR-007** | M | A serial may exist in exactly one location and one status at a time. A duplicate serial anywhere in the company is a hard error at posting. |
| **V4-BAT-BR-008** | M | Genealogy links are written in the same transaction as the consumption that creates them. A nightly rebuild job is not an acceptable substitute. |
| **V4-BAT-BR-009** | M | Where a batch-managed item is received without a supplier batch number, the internal batch is still created and the missing supplier reference is flagged on the receipt exception report — the absence is recorded, not papered over. |

## 7.7 Screens

### S-BAT-02 · Batch detail & genealogy

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Batch B2606-H4471 · RM-SS304-050 · SS 304 Coil 0.50 mm        ⚑ ACTIVE   [Block] [⋮]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Supplier heat 4471 · Jindal Stainless · GRN P1/GRN/26-27/00318 · 02-Jun-2026             │
│ Grade SS 304 · 0.50 mm × 400 mm · coil weight 9,600 KG · MTC 4471/2606 ✔ verified 📎     │
│ Received 9,600 · consumed 8,868 · adjusted −32 · remaining 700 KG · no expiry             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Stock (2) │ Movements (14) │ Genealogy │ Documents (3) │ Quality │ Audit                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  GENEALOGY — forward from this batch                                                     │
│                                                                                          │
│  B2606-H4471 (9,600 KG)                                                                  │
│   ├─ PRD/2607/0114 · 1,250 KG ──► SF-BODY-750 B2607014 (4,980 pcs)                       │
│   │                                 ├─ JW/26-27/0118 Coat Tech ──► coated 4,860          │
│   │                                 └─ PRD/2607/0119 ──► FG-SS-750-BLK B2607021           │
│   │                                        ├─ serials 750BLK260700001–04860              │
│   │                                        ├─ 40 cartons CTN260011284–11323              │
│   │                                        └─ invoice CHN/INV/26-27/00918 Metro Retail   │
│   ├─ PRD/2606/0098 · 3,400 KG ──► SF-BODY-500 B2606022 (13,220 pcs)  … 3 more levels     │
│   └─ PRD/2607/0121 · 4,218 KG ──► SF-BODY-750 B2607031 (16,540 pcs)  … 2 more levels     │
│                                                                                          │
│  Reach: 3 production orders · 4 finished batches · 34,208 units · 11 customers            │
│                     [Expand all] [Export trace pack] [Start recall from this batch]       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-BAT-01 Batch Register | Filter by item, supplier, status, expiry window, QC state; columns include remaining quantity, age, value (permission-gated). |
| S-BAT-03 Serial Register | Scan-to-find; warranty state, customer, dispatch document, service history. |
| S-BAT-04 Trace | One screen, two directions, one input (serial, batch, heat, GRN, carton, invoice); exports an auditor-ready trace pack as PDF. |
| S-BAT-05 Expiry Register | Expired, expiring in 7 / 30 / 90 days, with quantity and value at risk and the proposed action. |

### Field table — batch

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| Batch number | string | auto | Numbering engine; unique per item |
| Supplier batch / heat | string | Cond. | Mandatory for purchased batch items where the supplier provides it; absence flagged |
| Item | FK | Yes | Batch-managed |
| Manufacturing date | date | Cond. | Mandatory for shelf-life items |
| Expiry date | date | Cond. | Mandatory for shelf-life items; > receipt date |
| Received quantity | decimal(18,6) | derived | From the receipt |
| Remaining quantity | decimal(18,6) | derived | Σ balances across locations |
| Status | enum | derived | §7.2 |
| QC status / inspection ref | enum / FK | derived | From Vol 7 |
| Supplier, source document | FK | derived | — |
| Grade / thickness / width / coil weight | mixed | Cond. | Steel items |
| MTC number / verified | string / bool | Cond. | Steel items; verification is a QC action |
| Attachments | list | Cond. | MTC, COA, food-grade certificate |
| Block reason | FK reason code | Cond. | Mandatory when blocking |

## 7.8 Validations

| # | Validation | Trigger | Severity |
|---|---|---|---|
| 1 | Batch present for a batch-managed item on any movement | Post | Error |
| 2 | Batch belongs to the item being moved | Post | Error |
| 3 | Batch not blocked, expired or recalled for an issue | Post | Error |
| 4 | Expiry date present and after the receipt date | Receipt | Error |
| 5 | Remaining shelf life ≥ item minimum | Receipt | Warning + acknowledgement |
| 6 | Serial count equals quantity | Post | Error |
| 7 | Serial unique across the company | Post | Error |
| 8 | Serial in the stated location and status | Issue / transfer | Error |
| 9 | Expiry extension has a QC re-test reference and a later date | Save | Error |
| 10 | MTC attachment present for steel batches before QC release | QC release | Error |
| 11 | Genealogy parent exists and is not the child (no cycles) | Post | Error |
| 12 | Blocking a batch with open reservations | Block | Warning + notification |

## 7.9 Notifications

| Trigger | Recipient | Channel | Urgency |
|---|---|---|---|
| Batch blocked | Stores, Production, Planning, holders of reservations | In-app, e-mail | High |
| Batch expiring in 30 / 7 days | Stores, Planning, Purchase | In-app, e-mail | Normal / High |
| Batch expired | Stores, Finance | In-app, e-mail | High |
| Expiry extended | Quality Head, Finance | In-app, e-mail | High |
| MTC missing at QC release | Quality Head, Purchase | In-app | High |
| Recall initiated | Plant Head, Quality Head, Sales Head, Customer Service | In-app, e-mail, SMS | Critical |
| Trace pack exported | Quality Head (log only) | — | — |

## 7.10 Reports contributed

Batch Register · Batch Balance & Ageing · Expiry & Near-expiry · Expiry Extension Log ·
Serial Register · Warranty Lookup · Forward Trace Pack · Backward Trace Pack · Recall Impact
Analysis · Missing MTC / COA Exceptions · Genealogy Depth Audit.

## 7.11 Audit trail

Batch creation with its source, every attribute change, MTC upload and verification, block and
unblock with reason and the locations affected, expiry extension with re-test reference and
approver, serial generation ranges, serial status transitions with the document that caused them,
every trace and trace-pack export with the requester and the search key, and the full recall
record with its approval.

## 7.12 Acceptance criteria (extract)

- A receipt of SS coil without a batch number cannot be posted.
- Blocking batch `B2606-H4471` makes it unissuable in every warehouse within the same
  transaction, and every reservation holder is notified.
- Scanning a finished bottle's serial returns the heat number, MTC, coating batch, production
  order, shift, inspection, carton, invoice and customer in one screen.
- Given heat 4471, the forward trace lists 3 production orders, 4 finished batches, 34,208 units
  and 11 customers, and completes in under 5 seconds.
- A shelf-life item picks the earliest-expiry batch, and an expired batch never appears in a pick
  proposal or in ATP.
- Extending an expiry without a QC re-test reference is refused.
- The same serial cannot exist in two warehouses; the second posting fails.

---

**Next:** [Chapter 8 — Cycle Count & Physical Verification](08-cycle-count-and-verification.md)
