# Volume 3 · Chapter 4 — Vendor Quotations

**Area code:** `SQT`
Numbering series: `SUPPLIER_QUOTATION` → `SQ/{FY}/{SEQ:4}` (Vol 1 Ch 3 §3.5)

---

## 4.1 Purpose

A vendor quotation is the supplier's binding commercial offer, captured in a **structured**
form so that it can be compared arithmetically rather than read. The single design principle
of this chapter:

**V3-SQT-FR-001 (M)** A quotation MUST be stored as structured, computable data — rate, tax,
discount, freight, packing, insurance, lead time, validity, terms — never as a PDF the buyer
reads and retypes. A PDF is an attachment and evidence; it is not the record.

The corollary is that every field the comparison engine needs (Ch 5) has to be captured here,
including the ones vendors habitually leave vague: whether the rate includes freight, whether
tax is extra, what the payment terms actually are, and how long the price holds.

## 4.2 Capture routes

```
   ┌──────────────────────────────┐
   │ Vendor submits on the portal │──► lands in Portal Inbox (S-SQT-04)
   │ (S-SUP-12, from the RFQ link)│      buyer reviews → ACCEPT → becomes a quotation
   └──────────────────────────────┘
   ┌──────────────────────────────┐
   │ Vendor e-mails a PDF/Excel   │──► buyer enters it (S-SQT-02), attaches the original
   └──────────────────────────────┘
   ┌──────────────────────────────┐
   │ Vendor sends a structured    │──► import via the published Excel template with
   │ Excel using our template     │    row-level validation and an error report
   └──────────────────────────────┘
   ┌──────────────────────────────┐
   │ Verbal / phone (MRO, urgent) │──► buyer enters, flagged `VERBAL`, requires written
   └──────────────────────────────┘    confirmation before award above a threshold
   ┌──────────────────────────────┐
   │ Unsolicited / market enquiry │──► standalone quotation, no RFQ link, flagged
   └──────────────────────────────┘
```

**V3-SQT-BR-001 (M)** Every quotation records its `capture_source` (`PORTAL`, `MANUAL_ENTRY`,
`EXCEL_IMPORT`, `VERBAL`, `EMAIL_PARSE`) and, for anything other than `PORTAL`, requires the
vendor's original document as an attachment before it can be used in an approved comparison.
The buyer's word for a price is not evidence.

## 4.3 Status flow

```
  Portal route:                          Manual route:
  ┌──────────┐                           ┌────────┐
  │ SUBMITTED│ (vendor)                  │ DRAFT  │ (buyer)
  └────┬─────┘                           └───┬────┘
       │ buyer reviews                       │ complete
       ▼                                     ▼
  ┌──────────┐   reject with reason     ┌──────────┐
  │ UNDER_   ├─────────────────────────►│ RECEIVED │◄────────────┘
  │ REVIEW   │  (returned to vendor)    └────┬─────┘
  └────┬─────┘                                │
       │ accept                               │
       └──────────────────────────────────────┤
                                              │
              ┌───────────────────────────────┼──────────────────────────┐
              │                               │                          │
              ▼                               ▼                          ▼
       ┌─────────────┐                 ┌────────────┐            ┌─────────────┐
       │ UNDER_      │                 │ SUPERSEDED │            │  EXPIRED    │
       │ COMPARISON  │                 │ (revision  │            │ (validity   │
       └──────┬──────┘                 │  R(n+1) or │            │  date past) │
              │                        │  RFQ corrig)│           └─────────────┘
     ┌────────┴────────┐               └────────────┘
     ▼                 ▼
┌──────────┐   ┌──────────────┐        ┌───────────┐        ┌──────────┐
│ AWARDED  │   │ NOT_AWARDED  │        │ REGRETTED │        │ CANCELLED│
│ (full or │   │ (with reason)│        │ (vendor   │        │ (withdrawn
│  partial)│   └──────────────┘        │  declined)│        │  by vendor)
└──────────┘                           └───────────┘        └──────────┘
```

| Status | Meaning | Usable in comparison |
|---|---|---|
| `DRAFT` | Buyer is entering it | No |
| `SUBMITTED` | Vendor submitted on the portal, awaiting buyer review | No |
| `UNDER_REVIEW` | Buyer checking completeness/compliance | No |
| `RECEIVED` | Accepted as a valid offer | Yes |
| `UNDER_COMPARISON` | Included in an active comparison | Yes |
| `AWARDED` / `PARTIALLY_AWARDED` | Won all or part of the business | — |
| `NOT_AWARDED` | Lost, with a reason code | — |
| `SUPERSEDED` | Replaced by a revision or invalidated by an RFQ corrigendum | No |
| `EXPIRED` | Validity date passed | No — revalidation required |
| `REGRETTED` | Vendor formally declined to quote, with a reason | No |
| `CANCELLED` | Withdrawn by the vendor before award | No |

**V3-SQT-BR-002 (M)** An `EXPIRED` quotation MUST NOT be awarded. Using it requires the vendor
to confirm revalidation, which creates revision R(n+1) with a new validity date — a
buyer-entered extension of a vendor's validity is not permitted.

## 4.4 Functional requirements

### 4.4.1 Content captured

| Ref | Pri | Requirement |
|---|---|---|
| **V3-SQT-FR-002** | M | Header: vendor, vendor's quotation reference and date, RFQ reference and revision, currency, exchange rate (for FC), validity date, payment terms, delivery terms/Incoterm, freight basis and amount, packing basis and amount, insurance, warranty, inspection offer, price basis (inclusive/exclusive of tax and freight), and remarks. |
| **V3-SQT-FR-003** | M | Line: item/description, offered specification (with a **deviation flag** when it differs from the RFQ specification), quantity offered, UOM, basic rate, discount (% or absolute), tax code and rate, HSN, lead time in days, MOQ, order multiple/pack size, country of origin, brand/make offered, and line remarks. |
| **V3-SQT-FR-004** | M | **Price-break / slab pricing** per line: quantity bands with rates, so the comparison engine can evaluate the consolidated quantity at the right slab rather than at the quoted single rate. |
| **V3-SQT-FR-005** | M | **Charges** at header and line level with an explicit apportionment basis (`VALUE`, `WEIGHT`, `QUANTITY`, `EQUAL`) — freight, packing, forwarding, insurance, loading, testing/inspection charges, and for imports: FOB/CIF component, ocean/air freight, customs duty estimate, CHA, port charges. All flow into landed cost (Ch 5 §5.3). |
| **V3-SQT-FR-006** | M | Tax computation follows Vol 0 §10.4 exactly. GST is determined from the supplier's state vs the place of supply; the quotation shows CGST/SGST or IGST accordingly, plus cess where applicable, and flags ITC eligibility per line. |
| **V3-SQT-FR-007** | M | **Payment terms** captured structurally, not as text: advance %, days from invoice/GRN/dispatch, retention %, milestone schedule, LC/BG requirement, early-payment discount % and days. The comparison engine converts these to a cost-of-money adjustment. |
| **V3-SQT-FR-008** | M | **Validity**: `valid_until` date is mandatory. The system computes days remaining, warns at a configurable threshold, and auto-expires by scheduled job. |
| **V3-SQT-FR-009** | M | Attachments: the vendor's original quotation, technical datasheet, test certificate, sample photograph, compliance declaration, price-list page. Attachments are typed so the comparison can require specific types before award. |
| **V3-SQT-FR-010** | M | **Deviations register** — where the vendor's offer differs from the RFQ (specification, quantity, delivery date, payment terms, warranty, T&C), each deviation is captured as a discrete row with the RFQ value, the offered value, and a buyer disposition (`ACCEPTED`, `NOT_ACCEPTED`, `NEGOTIATE`). Unaddressed deviations block award. |
| **V3-SQT-FR-011** | M | **Regret capture** (`S-SQT-06`): a vendor may formally decline with a reason (`NO_CAPACITY`, `RAW_MATERIAL_UNAVAILABLE`, `PRICE_NOT_VIABLE`, `NOT_OUR_PRODUCT`, `PAYMENT_TERMS`, `OTHER`). A regret is a response for rating purposes; silence is not. |
| **V3-SQT-FR-012** | S | Sample submission register (`S-SQT-07`): sample received date, quantity, sample QC reference and result, decision. For new vendors and new components, award may be configured to require a passed sample. |

### 4.4.2 Portal submission and review

| Ref | Pri | Requirement |
|---|---|---|
| **V3-SQT-FR-013** | M | The portal form (`S-SUP-12`) is pre-populated with the RFQ lines and terms; the vendor fills only their offer. The vendor cannot alter the requirement, add lines, or see any other vendor's data. |
| **V3-SQT-FR-014** | M | The vendor may save a draft, return later, and submit once; after submission the form is read-only unless the buyer returns it for correction or the vendor submits a revision. |
| **V3-SQT-FR-015** | M | On submission the vendor receives an acknowledgement e-mail with a PDF of exactly what was submitted, including a hash, so there is no later dispute about content. |
| **V3-SQT-FR-016** | M | The **portal inbox** (`S-SQT-04`) shows submissions awaiting buyer review with a completeness check: missing mandatory fields, missing attachments, unaddressed deviations, expired validity, and tax/arithmetic inconsistencies. The buyer may `ACCEPT`, `RETURN_FOR_CORRECTION` (with a note back to the vendor), or `REJECT` with a reason. |
| **V3-SQT-FR-017** | M | An arithmetic re-computation MUST run on every submitted or imported quotation. Where the vendor's stated total differs from the computed total beyond a tolerance, the difference is shown as a discrepancy and must be resolved before the quotation is `RECEIVED`. The system's computed value governs the comparison. |

### 4.4.3 Revision and negotiation

| Ref | Pri | Requirement |
|---|---|---|
| **V3-SQT-FR-018** | M | Quotation **revisions** (`S-SQT-05`) form a chain R0 → R1 → R2. Each revision records the negotiation round, the reason (`PRICE_NEGOTIATION`, `SPEC_CLARIFICATION`, `VALIDITY_EXTENSION`, `RFQ_CORRIGENDUM`, `VENDOR_INITIATED`), and who requested it. The prior revision becomes `SUPERSEDED` but remains fully visible. |
| **V3-SQT-FR-019** | M | A revision diff (rate, tax, terms, lead time, validity) is mandatory and appears in the comparison as the negotiation trail — "quoted ₹251, negotiated to ₹243.50 over 2 rounds" is the evidence of the buyer's work. |
| **V3-SQT-FR-020** | M | Negotiation requests may be issued to one or several vendors from the comparison screen (Ch 5 §5.6), creating a tracked request with a response due date, without revealing competitors' prices. |
| **V3-SQT-FR-021** | S | Counter-offer capture: the buyer's target/counter rate per line is recorded against the negotiation round so that savings achieved are measurable and reportable. |
| **V3-SQT-FR-022** | M | Only the **latest non-superseded** revision of a quotation participates in a comparison. The comparison stores the exact quotation revision it evaluated, so a later revision does not silently change an approved comparison. |

## 4.5 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V3-SQT-BR-003** | M | A quotation MUST reference an RFQ unless it is explicitly flagged unsolicited/market-enquiry. Unsolicited quotations cannot be awarded directly; they may only seed a new RFQ or be attached to one. |
| **V3-SQT-BR-004** | M | One active (non-superseded) quotation per vendor per RFQ. A second submission is a revision, never a parallel quotation. |
| **V3-SQT-BR-005** | M | Rates are stored at `DECIMAL(18,6)`, amounts at `DECIMAL(18,2)`, and every derived amount is recomputed server-side on save. A client-supplied total is never trusted. |
| **V3-SQT-BR-006** | M | Quoted quantity below the RFQ quantity is permitted (partial offer) and is flagged; the comparison then evaluates a split award. Quoted quantity above the RFQ quantity is ignored for comparison unless the buyer explicitly increases the requirement. |
| **V3-SQT-BR-007** | M | A quotation whose vendor has moved to `ON_HOLD` or `BLACKLISTED` after submission is automatically excluded from comparison with the reason shown; it is not deleted. |
| **V3-SQT-BR-008** | M | Quotation rates are field-level restricted: `PROCUREMENT.QUOTATION.VIEW_RATES` is required to see rate, discount, tax and value. A storekeeper or requester may see that a quotation exists, its vendor and its lead time, but not its price. |
| **V3-SQT-BR-009** | M | For a `SEALED_BID` RFQ, quotation rates remain encrypted and inaccessible until the recorded opening event, including to administrators, and the decryption is audited (Ch 3 V3-RFQ-BR-001). |
| **V3-SQT-BR-010** | M | Changing any rate, tax, charge, term or validity on a `RECEIVED` quotation is only possible through a revision. In-place editing of a received quotation is blocked. |
| **V3-SQT-BR-011** | M | A `VERBAL` quotation above the configured threshold (default ₹50,000) cannot be awarded until the written confirmation is attached and the quotation is re-marked `MANUAL_ENTRY`. |
| **V3-SQT-BR-012** | M | The exchange rate for a foreign-currency quotation is stamped at receipt from the company's rate master for that date and stored on the quotation; the comparison uses the stamped rate, and the rate source and date are shown. |
| **V3-SQT-BR-013** | S | Where the same item is quoted by the same vendor within a short window at materially different rates, the system flags the inconsistency to the buyer with both references. |

## 4.6 Validations

| # | Validation | Trigger | Severity |
|---|---|---|---|
| 1 | Vendor is invited on the referenced RFQ | Save | Error (unless unsolicited) |
| 2 | Vendor quotation reference and date present | Save | Error |
| 3 | Validity date ≥ quotation date and ≥ today | Save | Error |
| 4 | Validity ≥ RFQ's expected validity | Save | Warning |
| 5 | Every RFQ line answered, or explicitly marked "not quoted" | Submit | Error |
| 6 | Rate > 0; discount ≤ 100%; tax code valid for the item and the supplier state | Line save | Error |
| 7 | Arithmetic reconciliation: computed total vs vendor-stated total within tolerance (default ₹1) | Submit | Error, showing both |
| 8 | GST type consistent with supplier state vs place of supply | Save | Error |
| 9 | HSN present and valid for taxable lines | Save | Error |
| 10 | Lead time ≤ (required-by − today); else infeasible | Save | Warning, shown in comparison |
| 11 | MOQ ≤ required quantity; else the quantity must rise or the line is flagged | Save | Warning |
| 12 | Specification deviation recorded where offered spec ≠ RFQ spec | Save | Error (must be recorded, may be accepted) |
| 13 | Mandatory attachment present per capture source | Accept | Error |
| 14 | Price-break bands are contiguous and non-overlapping | Save | Error |
| 15 | Payment terms parse into the structured model | Save | Error |
| 16 | Currency matches the RFQ, or a rate is available for conversion | Save | Error |
| 17 | Duplicate active quotation for the same vendor + RFQ | Save | Error — create a revision instead |
| 18 | Late submission against a `BLOCK` RFQ | Portal submit | Error |
| 19 | Optimistic lock version | Save | 409 Conflict |

## 4.7 Approval

**V3-SQT-BR-014 (M)** A quotation is a vendor's document, not ours — it does **not** carry an
internal approval workflow. What is approved is the **comparison and award** (Ch 5) and the
resulting PO (Ch 6). Two acts on a quotation are nevertheless controlled:

| Act | Control |
|---|---|
| Accepting a portal submission into `RECEIVED` | `PROCUREMENT.QUOTATION.ACCEPT_PORTAL`; recorded with reviewer and timestamp |
| Editing a received quotation | Blocked — revision only, `PROCUREMENT.QUOTATION.REVISE` |
| Viewing rates | `PROCUREMENT.QUOTATION.VIEW_RATES` (field-level) |
| Opening a sealed bid | Dual authorisation, `PROCUREMENT.RFQ.OPEN_SEALED` |

## 4.8 Screens

### S-SQT-02 · Quotation Entry

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Vendor Quotation — New                          [Save Draft] [Mark Received] [⋮]     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Source ───────────────────────────┐ ┌─ Vendor's document ─────────────────────────┐ │
│ │ RFQ *   [RFQ/25-26/0087 ▼] R1      │ │ Vendor *      🔍 Jindal Stainless Ltd       │ │
│ │ Capture (•) Manual ( ) Portal      │ │ Their ref *   [JSL/Q/2026/1184           ]  │ │
│ │         ( ) Excel ( ) Verbal       │ │ Their date *  [31-Jul-2026 ▼]               │ │
│ │ Received on [31-Jul-2026 14:20]    │ │ Valid until * [30-Aug-2026 ▼]  (30 days)    │ │
│ │ Received by S. Ramesh              │ │ Currency [INR ▼]  Ex. rate 1.000000         │ │
│ └────────────────────────────────────┘ └─────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Items(2) │ Charges │ Terms │ Deviations(1) │ Price breaks │ Attachments(1) │ Revisions   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ #│ Item        │ Offered spec  │ Qty    │UOM│ Rate   │Disc│ HSN  │ Tax   │ Amount     │
│ 1│ SS304 Coil  │0.5×400 2B     │ 11,500 │KG │ 243.50 │ 1% │72193 │18%IGST│ 27,72,236  │
│  │  Lead 21 d · MOQ 5,000 KG · Origin India · Make JSL · Heat/MTC ✔                   │
│  │  Price breaks: ≤5,000 → 248.00 · 5,001–10,000 → 245.00 · >10,000 → 243.50          │
│ 2│ SS304 Coil  │0.6×420 2B     │  4,000 │KG │ 246.00 │ 1% │72193 │18%IGST│  9,66,571  │
│  │  Lead 21 d · ⚠ Deviation: offered 2B finish, RFQ asked BA finish                   │
├─ Charges ──────────────────────────────────────────────────────────────────────────────┤
│ Freight   [Extra ▼]  ₹ 42,000  apportion by [Weight ▼]   Insurance [Included ▼]  ₹ 0   │
│ Packing   [Included ▼] ₹ 0     Loading [Extra ▼] ₹ 6,000  apportion by [Value ▼]       │
├─ Terms ────────────────────────────────────────────────────────────────────────────────┤
│ Payment  Advance [0]% · [30] days from [Invoice ▼] · Retention [0]% · Early-pay [2]% / │
│          [10] days      Delivery [Ex-works ▼]   Warranty [Nil]   Inspection [At source]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│                       Basic 37,38,807 │ Discount −37,388 │ Charges 48,000              │
│                       Taxable 37,49,419 │ IGST 18% 6,74,895 │ TOTAL ₹44,24,314          │
│ ⚠ Vendor's stated total ₹44,24,300 differs by ₹14 — resolve before marking Received     │
│                                                    [ Accept computed ] [ Re-check ]     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Field table — quotation header

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| Quotation number / revision | string / int | auto | Internal; distinct from the vendor's reference |
| RFQ reference + revision | FK | Cond. | Mandatory unless unsolicited |
| Vendor | FK | Yes | Must be invited on the RFQ; must be transactable |
| Vendor's reference / date | string / date | Yes | Their document identity |
| Capture source | enum | Yes | §4.2 |
| Received on / by | datetime / FK | auto | Server timestamp; used for late detection |
| Currency / exchange rate / rate date | FK / decimal(18,8) / date | Yes | Stamped, not live |
| Valid until | date | Yes | Drives expiry job |
| Payment terms (structured) | composite | Yes | advance %, days, basis, retention, early-pay |
| Delivery terms / Incoterm | FK | Yes | Drives freight ownership |
| Freight / packing / insurance / other charges | decimal + basis + apportionment | Cond. | Each explicitly "included" or an amount |
| Warranty | text/months | No | — |
| Inspection offer | enum | No | `AT_SOURCE` / `AT_BUYER` / `THIRD_PARTY` / `MTC_ONLY` |
| Price basis | enum | Yes | Inclusive/exclusive of tax; inclusive/exclusive of freight |
| Computed totals | decimal | derived | Server-computed; vendor-stated total stored separately for reconciliation |
| Vendor-stated total | decimal | No | For discrepancy detection |
| Status | enum | auto | §4.3 |
| Regret reason | FK | Cond. | When `REGRETTED` |
| Late flag | bool | derived | Received after the RFQ due datetime |

### S-SQT-04 · Portal Submission Inbox

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Portal Submissions — awaiting review (5)                        [Bulk accept] ⟳         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Vendor          │ RFQ           │ Submitted   │ Value      │ Completeness              │
│ Jindal Stainless│ RFQ/…/0087 R1 │ 31-Jul 14:12│ 44,24,314  │ ✔ Complete                │
│ Viraj Profiles  │ RFQ/…/0087 R1 │ 01-Aug 09:40│ 45,10,220  │ ⚠ 1 deviation unaddressed │
│ Shah Alloys     │ RFQ/…/0087 R1 │ 04-Aug 17:22│ 44,80,110  │ ✖ LATE (due 05-Aug 17:00 —│
│                 │               │             │            │   within due, accepted)   │
│ Elasto Poly     │ RFQ/…/0091    │ 02-Aug 11:05│  3,78,400  │ ⚠ No test certificate     │
│ CoatTech        │ RFQ/…/0092    │ 03-Aug 16:30│  1,12,900  │ ⚠ Arithmetic diff ₹120    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Selected: Viraj Profiles   [ ✔ Accept ] [ ↩ Return for correction ] [ ✕ Reject ]        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-SQT-01 Quotation List | Views: Awaiting review, Received, Expiring in 7 days, Expired, Not awarded. Rate columns hidden without `VIEW_RATES`. |
| S-SQT-03 Quotation Detail | Read-only view with revision chain, deviation register, attachments, linked RFQ and comparison, award status. |
| S-SQT-05 Revision / Negotiation Round | Side-by-side previous vs new, round number, reason, savings achieved, who requested. |
| S-SQT-06 Regret Capture | Reason code, remarks, optional "may quote next time" flag; recorded as a response for rating. |
| S-SQT-07 Sample Register | Sample received, quantity, QC reference, result, decision, linked to the quotation and AVL qualification. |
| S-SUP-12 Portal Response Form | Vendor-side entry with the same structure, validation and acknowledgement PDF. |

## 4.9 Notifications

| Trigger | Recipient | Channel |
|---|---|---|
| Quotation submitted on the portal | Buyer | In-app, e-mail |
| Quotation accepted / returned / rejected | Vendor contact | E-mail, portal |
| Acknowledgement of submission with PDF + hash | Vendor contact | E-mail |
| Negotiation request issued | Vendor contact | E-mail, portal |
| Negotiation response received | Buyer | In-app, e-mail |
| Quotation expiring in 7 / 3 days while under comparison | Buyer | In-app |
| Quotation expired | Buyer | In-app |
| Arithmetic discrepancy detected | Buyer | In-app |
| Regret received | Buyer | In-app, e-mail |
| Award / non-award decision | Vendor contact | E-mail, portal |

## 4.10 Reports contributed

Quotation Register · Quotation vs RFQ Response Analysis · Price History by Item and Vendor ·
Rate Trend (per item, per vendor, per month, with index overlay) · Negotiation Savings ·
Quotation Validity Expiry · Deviation Register · Regret Analysis · Late Submission Log ·
Unsolicited Quotation Register.

## 4.11 Dashboard KPIs contributed

Quotations pending review · quotations received vs expected · average quotation turnaround
(RFQ issue → quote received) · negotiation savings realised in the period · quotations
expiring this week · rate movement vs previous purchase for the top 10 items by spend.

## 4.12 Events

| Event | When | Consumers |
|---|---|---|
| `procurement.quotation.submitted` | Portal submission | Notification, Buyer inbox |
| `procurement.quotation.received` | Accepted as valid | Comparison enablement, Supplier rating (responsiveness) |
| `procurement.quotation.returned` | Returned for correction | Portal, Notification |
| `procurement.quotation.revised` | Revision created | Comparison invalidation check, Notification |
| `procurement.quotation.expired` | Validity date passed | Comparison guard, Notification |
| `procurement.quotation.regretted` | Vendor declined | Supplier rating, Notification |
| `procurement.quotation.awarded` / `.not_awarded` | Award decision approved | Portal, Notification, PO creation |

## 4.13 Acceptance criteria (extract)

- A quotation entered with basic ₹243.50 × 11,500 KG, 1% discount, ₹42,000 freight apportioned
  by weight and 18% IGST produces exactly the totals in the worked example of §4.8, verified by
  a unit test against Vol 0 §10.4 step order.
- A portal submission whose stated total differs from the computed total by ₹14 cannot be
  accepted until the discrepancy is dispositioned, and the disposition is audited.
- A second submission by the same vendor against the same RFQ is rejected as a duplicate and
  offered as a revision.
- A user without `PROCUREMENT.QUOTATION.VIEW_RATES` sees the quotation, its vendor and its lead
  time, and no rate, discount, tax or value — verified at the API level, not only in the UI.
- A quotation whose validity expired yesterday cannot be selected in a comparison, and the
  comparison screen states why.
- Editing the rate on a `RECEIVED` quotation is refused; creating revision R1 succeeds and R0
  remains retrievable with its own totals.
- A sealed-bid quotation's rate fields return `403` from the API before the recorded opening
  event, for every role including administrator.

---

**Next:** [Chapter 5 — Quotation Comparison & Vendor Selection](05-quotation-comparison.md)
