# Volume 4 · Chapter 5 — Stock Transfer

**Area code:** `TRF`
Prerequisite: [Ch 1](01-warehouse-bin-and-storage.md) · [Ch 2](02-stock-model-and-enquiry.md)
Numbering: `STOCK_TRANSFER` → `ST/{FY}/{SEQ:5}` · `JOBWORK_CHALLAN` → `{PLANT}/JW/{FY}/{SEQ:4}`
(statutory, gapless) · `DELIVERY_CHALLAN` → `{PLANT}/DC/{FY}/{SEQ:5}` (statutory, gapless)

---

## 5.1 Purpose

Four physically different things share one document family, and conflating them is the usual
design error:

| Transfer type | Crosses | Ownership | Value effect | Statutory document |
|---|---|---|---|---|
| **Bin transfer** | Bins in one warehouse | none | none | none |
| **Warehouse transfer** | Warehouses in one plant | none | none (unless valuation is per warehouse) | none |
| **Inter-plant / depot transfer** | Plants, possibly GSTINs | none | moves through goods-in-transit; may be a taxable supply | delivery challan / tax invoice + e-way bill |
| **Job-work issue & return** | To a third party's premises | stays with us | location change only; processing cost added on return | job-work challan + e-way bill, Sec 143 window |

**V4-TRF-FR-001 (M)** All four are the same document type with a `transfer_type` discriminator
that drives numbering series, approval matrix, statutory fields, the two-step or one-step posting,
and the reconciliation obligation.

## 5.2 Status flow

```
                ┌─────────┐  submit   ┌──────────────────┐  approve   ┌──────────┐
                │  DRAFT  ├──────────►│ PENDING_APPROVAL ├───────────►│ APPROVED │
                └────┬────┘           └────────┬─────────┘            └────┬─────┘
                     │                         │ reject                    │
                     │                         ▼                           │ dispatch
                     │                   ┌──────────┐                      ▼
                     │                   │ REJECTED │            ┌──────────────────┐
                     │                   └──────────┘            │ IN_TRANSIT       │ (movement 303)
                     │                                           │ stock at neither │
                     │                                           │ end, in GIT      │
                     │                                           └────┬─────────┬───┘
   one-step (bin / same-plant warehouse transfer)                     │         │ short / damaged
   posts straight to COMPLETED on approval ─────────────────┐         │ receive │ on arrival
                                                            │         ▼         ▼
                                                     ┌──────▼──────┐ ┌──────────────────┐
                                                     │ COMPLETED   │ │ PARTIALLY_       │
                                                     │ (movement   │ │ RECEIVED         │
                                                     │  301/302/304)│ └────────┬─────────┘
                                                     └─────────────┘          │ balance received
                                                                              ▼ or short-closed
                                                                       ┌─────────────┐
                                                                       │ CLOSED      │
                                                                       └─────────────┘
   CANCELLED: possible before dispatch only. After dispatch the correction is a return transfer.
```

## 5.3 Functional requirements — bin and warehouse transfer

| Ref | Pri | Requirement |
|---|---|---|
| **V4-TRF-FR-002** | M | Bin transfer moves quantity of a specific item, batch and status from one bin to another in the same warehouse: one document, movement `301`, no value effect, no approval by default. |
| **V4-TRF-FR-003** | M | Warehouse transfer within a plant posts `302` in one step, but is subject to approval where the destination is a controlled warehouse (reject, scrap, sample) or where the value exceeds a configured threshold. |
| **V4-TRF-FR-004** | M | Batch and status travel with the stock. A transfer never changes batch identity, expiry, or QC status — a status change is a separate movement (`501`/`502`) with its own authority. |
| **V4-TRF-FR-005** | M | Mobile bin transfer: scan source bin → scan batch label → quantity → scan destination bin → confirm. This is the highest-frequency store transaction and must be doable one-handed. |
| **V4-TRF-FR-006** | S | **Bulk re-slotting**: move all contents of one bin to another (rack repair, re-organisation) as a single document with line-level detail preserved. |

## 5.4 Functional requirements — inter-plant transfer

| Ref | Pri | Requirement |
|---|---|---|
| **V4-TRF-FR-007** | M | Inter-plant and depot transfers are **two-step**: dispatch posts `303` (source stock ↓, goods-in-transit ↑), receipt posts `304` (GIT ↓, destination stock ↑). A single-step "teleport" posting is not permitted. |
| **V4-TRF-FR-008** | M | Goods-in-transit is a real, valued location belonging to the **sending** plant until receipt, and appears in that plant's valuation and in the GIT register with an age. |
| **V4-TRF-FR-009** | M | Dispatch captures vehicle number, transporter, driver, LR number, expected arrival date, and — above the statutory threshold — the e-way bill number and validity (Vol 8 supplies the e-way bill integration; this module stores and validates presence). |
| **V4-TRF-FR-010** | M | Where source and destination are **distinct persons** for GST (different GSTIN), the transfer document must carry taxable value and tax lines and produce a tax invoice rather than a delivery challan. The determination is made from the branch master, never typed. |
| **V4-TRF-FR-011** | M | Receipt at the destination records received quantity per line and batch, and any **short, excess or damaged** quantity with a reason code. Short quantity remains in GIT until it is either received, written off (Ch 6) or claimed from the transporter. |
| **V4-TRF-FR-012** | M | GIT ageing beyond a configurable threshold (default 7 days) escalates to the Materials Manager and appears on a standing register. Nothing sits in transit silently. |
| **V4-TRF-FR-013** | S | Transfer suggestion: where one plant is below reorder and another holds surplus, the replenishment workbench (Ch 10) proposes a transfer instead of a purchase, with the decision recorded either way. |

## 5.5 Functional requirements — job work (subcontracting)

| Ref | Pri | Requirement |
|---|---|---|
| **V4-TRF-FR-014** | M | Material issued to a job worker moves to that vendor's `SUBCONTRACTOR` warehouse under a **job-work challan** with statutory gapless numbering. Ownership does not change; the stock remains in company valuation. |
| **V4-TRF-FR-015** | M | The challan records the subcontract PO (Vol 3), the process, the expected return quantity per BOM with the agreed **process-loss percentage**, and the expected return date. |
| **V4-TRF-FR-016** | M | Job-work receipt (Ch 3, `S-RCP-08`) receives the processed item, consumes the issued material per BOM against the challan, and posts the difference against the agreed loss tolerance; exceeding the tolerance requires approval and a reason. |
| **V4-TRF-FR-017** | M | Scrap and by-product returned by the job worker is received at NRV into the scrap warehouse and reconciled against the expected loss. |
| **V4-TRF-FR-018** | M | **Challan-wise reconciliation** is maintained continuously: issued, received, consumed, scrap returned, balance pending, days outstanding, and days remaining in the statutory window. |
| **V4-TRF-FR-019** | M | Challans approaching the statutory return window (default alert at 300 days for inputs) escalate to Purchase and Finance; those exceeding it are reported for tax treatment. |
| **V4-TRF-FR-020** | M | An ITC-04 data extract is produced for a period from the challan register without manual compilation. |

## 5.6 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V4-TRF-BR-001** | M | Source and destination must differ. A transfer to the same bin is refused. |
| **V4-TRF-BR-002** | M | Free stock at the source must cover the transfer at the moment of dispatch, not at the moment of drafting. |
| **V4-TRF-BR-003** | M | Quarantined, blocked, rejected and expired stock may be transferred **only** to a warehouse of a matching controlled type (quarantine → reject, reject → scrap), never into a production or FG store. |
| **V4-TRF-BR-004** | M | Reserved stock cannot be transferred out of the reserving location without releasing the reservation first. |
| **V4-TRF-BR-005** | M | Receipt quantity at the destination may not exceed the dispatched quantity for that line and batch. |
| **V4-TRF-BR-006** | M | An in-transit transfer cannot be cancelled. The material physically exists somewhere; the correction is a return transfer or a write-off with a reason. |
| **V4-TRF-BR-007** | M | Job-work receipt quantity beyond the issued quantity net of the agreed loss requires approval — material cannot be created at a vendor. |
| **V4-TRF-BR-008** | M | Movement out of the premises always produces a statutory challan number from the numbering engine. A transfer that leaves the gate without one is not possible. |
| **V4-TRF-BR-009** | S | Where an e-way bill is required by value, dispatch is blocked until its number is recorded (configurable per company, default block). |

## 5.7 Screens

### S-TRF-03 · Inter-plant transfer — dispatch

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Stock Transfer — ST/26-27/00412              [Save draft] [Submit] [Dispatch & print]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Route ─────────────────────────────────┐ ┌─ Transport ──────────────────────────────┐│
│ │ Type *  ( ) Bin  ( ) Warehouse          │ │ Vehicle *   [TN 38 BQ 4471            ]  ││
│ │         (•) Inter-plant  ( ) Job work   │ │ Transporter [SRT Roadways ▼]             ││
│ │ From *  [Chennai U1 · FG-01 ▼]          │ │ LR / GC no  [SRT/26/119284            ]  ││
│ │ To *    [Coimbatore Depot · FG-02 ▼]    │ │ Expected    [31-Jul-2026]  Distance 512km││
│ │ Reason  [Depot replenishment ▼]         │ │ E-way bill* [3412 8877 4415] valid 3 d   ││
│ │ ⓘ Same GSTIN (33AABCS1429B1Z5) → delivery challan, no tax                             ││
│ └─────────────────────────────────────────┘ └──────────────────────────────────────────┘│
├──┬─────────────────────┬────────────┬──────────┬───────────┬───────────────┬────────────┤
│ #│ Item                │ From bin   │ Batch    │ Available │ Transfer qty  │ Value      │
├──┼─────────────────────┼────────────┼──────────┼───────────┼───────────────┼────────────┤
│ 1│ FG-SS-750-BLK   NOS │ P-A-01     │ B2606033 │     1,152 │        1,152  │ 4,75,545   │
│  │ ⓘ 48 cartons · serials 750BLK260600001–01152 · allocated to none                      │
│ 2│ FG-SS-1000-STL  NOS │ P-A-04     │ B2607008 │       640 │          480  │ 2,86,176   │
│  │ ⚠ 160 NOS reserved for SO/26-27/00219 — excluded from the transferable quantity       │
├──┴─────────────────────┴────────────┴──────────┴───────────┴───────────────┴────────────┤
│ 2 lines · 1,632 NOS · ₹7,61,721 · 68 cartons · 1 pallet                                  │
│ Approval: Stores In-charge → Materials Manager (value > ₹5 L)     [Submit for approval]  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-TRF-07 · Job-work reconciliation

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Job-work Stock & Challan Reconciliation      Vendor [Coat Tech Industries ▼]  [ITC-04 ▼] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ At vendor: ₹21.4 L · 6 open challans · oldest 118 days · statutory window 365 days        │
├──────────────┬──────────┬────────────┬─────────┬─────────┬────────┬────────┬────────────┤
│ Challan      │ Date     │ Item       │ Issued  │ Received│ Scrap  │ Balance│ Days / Due │
├──────────────┼──────────┼────────────┼─────────┼─────────┼────────┼────────┼────────────┤
│ P1/JW/26-27/…│ 02-Apr-26│ SF-BODY-750│  12,000 │  11,640 │    240 │    120 │ 118 · ok   │
│  ⓘ loss 2.0% agreed · actual 2.0% ✔                                                      │
│ P1/JW/26-27/…│ 18-May-26│ SF-BODY-750│   8,000 │   7,600 │    120 │    280 │  72 · ok   │
│  ⚠ loss 1.5% agreed · actual 3.5% — 160 NOS unexplained, approval pending                │
│ P1/JW/25-26/…│ 22-Aug-25│ SF-BODY-500│   6,000 │   5,100 │     90 │    810 │ 341 ⛔ 24 d │
│  ⛔ statutory window closes 22-Aug-2026 — tax liability if not returned                   │
├──────────────┴──────────┴────────────┴─────────┴─────────┴────────┴────────┴────────────┤
│ [Follow up] [Extend expected date] [Raise shortage claim] [Write off with approval]      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-TRF-01 Transfer List | Views: pending approval, in transit, overdue in transit, job-work open, completed today. |
| S-TRF-02 Bin Transfer | Two-field form optimised for the scanner; no approval by default. |
| S-TRF-04 Transfer Receipt | At the destination: received / short / damaged per line and batch with reason codes. |
| S-TRF-05 Goods in Transit | Value and age by route, with the ageing escalation state visible. |
| S-TRF-06 Job-work Challan Issue | Subcontract PO reference, process, expected return quantity and loss %, expected date. |
| S-TRF-08 Mobile Bin Transfer | Ch 14. |

## 5.8 Validations

| # | Validation | Trigger | Severity | Message pattern |
|---|---|---|---|---|
| 1 | Source ≠ destination | Save | Error | — |
| 2 | Free stock covers the line at dispatch | Dispatch | Error | "FG-01 P-A-01 has 1,152 NOS free; 1,300 requested" |
| 3 | Destination warehouse eligible for the item | Save | Error | — |
| 4 | Controlled-status stock to a permitted destination only | Dispatch | Error | "Rejected stock cannot be transferred to FG-01" |
| 5 | Reserved quantity excluded or reservation released | Dispatch | Error | — |
| 6 | E-way bill present above threshold | Dispatch | Error (configurable) | "Value ₹7.6 L exceeds ₹50,000 — e-way bill number is required" |
| 7 | Distinct-person transfer carries tax lines | Dispatch | Error | — |
| 8 | Receipt quantity ≤ dispatched quantity | Receive | Error | — |
| 9 | Short/damaged quantity has a reason code | Receive | Error | — |
| 10 | Job-work receipt within issued − agreed loss | Receive | Error / approval | "Return exceeds issued quantity net of 2% loss by 160 NOS" |
| 11 | Challan within the statutory window | Receive / report | Warning → escalation | "341 days outstanding; window closes in 24 days" |
| 12 | Cancel attempted after dispatch | Cancel | Error | — |
| 13 | Open period at both ends | Post | Error | — |
| 14 | Optimistic lock on both balance rows | Post | 409 Conflict | — |

## 5.9 Notifications

| Trigger | Recipient | Channel | Urgency |
|---|---|---|---|
| Transfer submitted | Approver | In-app, e-mail | Normal |
| Transfer dispatched | Destination storekeeper | In-app, e-mail | Normal |
| Expected arrival passed, not received | Both storekeepers, Materials Manager | In-app, e-mail | High |
| GIT aged beyond threshold | Materials Manager, Finance | In-app, e-mail | High |
| Short or damaged receipt | Sending storekeeper, Materials Manager, Finance | In-app, e-mail | High |
| Job-work challan due in 30 days | Purchase, Stores | In-app, e-mail | Normal |
| Job-work challan inside statutory window alert | Purchase Head, Finance Head | In-app, e-mail | High |
| Job-work loss beyond agreed tolerance | Production Manager, Purchase Head | In-app, e-mail | High |

## 5.10 Reports contributed

Transfer Register (by type) · Goods in Transit & Ageing · Inter-plant Movement Summary ·
Transfer Short/Damage Analysis · Job-work Stock at Vendor · Challan-wise Reconciliation ·
Job-work Ageing vs Statutory Window · ITC-04 Extract · Bin Transfer Activity (by operator).

## 5.11 Audit trail

Create, submit, approval decisions, dispatch with vehicle/LR/e-way bill, every quantity changed
before dispatch, receipt with short/damage reasons, GIT ageing escalations, job-work loss
approvals, challan extensions with reason and approver, and every statutory document number
allocated (with any gap explained — the series is gapless).

## 5.12 Acceptance criteria (extract)

- Dispatching 1,632 NOS from Chennai leaves Chennai's free stock lower immediately, shows the
  value in goods-in-transit under Chennai, and adds nothing to Coimbatore until receipt.
- Receiving 1,600 of 1,632 leaves 32 in GIT with a mandatory reason, and the transfer stays
  `PARTIALLY_RECEIVED` until they are received, claimed or written off.
- A transfer of rejected material into `FG-01` is refused, naming the status.
- A ₹7.6 L transfer cannot be dispatched without an e-way bill number when the company parameter
  is set to block.
- A job-work receipt of 7,600 against 8,000 issued with a 1.5% agreed loss requires approval for
  the 160-piece excess loss, and the approval is visible on the challan.
- The ITC-04 extract for Q1 lists every open and closed challan with issued, received and pending
  quantities without manual compilation.

---

**Next:** [Chapter 6 — Adjustment, Scrap & Write-off](06-adjustments-scrap-and-write-off.md)
