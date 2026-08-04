# Volume 3 · Chapter 6 — Purchase Order

**Area code:** `POR`
Numbering: `PURCHASE_ORDER` → `PO/{FY}/{SEQ:5}`, `allocate_on = APPROVAL`;
amendment `{PO_NO}-R{REV}` (Vol 1 Ch 3 §3.5)

---

## 6.1 Purpose

The purchase order is the **only** document in this module that creates a legal and financial
commitment. Everything before it is preparation; everything after it is consequence.

Because of that, three properties are non-negotiable:

1. **A PO exists in the outside world only after approval and release.** Draft and
   pending-approval POs are internal. The document number is allocated at approval
   (`allocate_on = APPROVAL`), never at draft, so an abandoned draft cannot leave a hole in a
   supplier-visible sequence.
2. **What was approved is what was sent.** The released PDF is generated from the approved
   revision, hashed, and stored. A later amendment produces a new revision with its own
   approval and its own document — never a silent edit to a released order.
3. **Every downstream quantity ties back to it.** Receipt, inspection, return, invoice and
   payment are all measured against PO lines and schedules. If the PO is wrong, everything
   downstream is wrong, which is why the approval chain terminates here.

## 6.2 PO types

| Type | Purpose | Distinguishing behaviour |
|---|---|---|
| `STANDARD` | One-off purchase of goods | Quantity, rate and delivery date fixed; GRN expected |
| `BLANKET` / `RATE_CONTRACT` | Agreed rate and total volume over a validity period | No delivery obligation until a call-off; tracks consumed vs balance value/quantity; no GRN directly against it |
| `SCHEDULING_AGREEMENT` | Blanket plus a firm delivery schedule | Schedule lines with dates and quantities; releases are firm or forecast |
| `CALL_OFF` / `RELEASE_ORDER` | Draws down a blanket or rate contract | Inherits rate and terms; validated against remaining balance; short approval chain |
| `SUBCONTRACT` | Job work — coating, printing, buffing | Carries the material to be issued (BOM), expected return quantity, process loss %, job-work charges instead of material rate; drives challan issue and reconciliation |
| `IMPORT` | Foreign supplier | Foreign currency, Incoterm, port of loading/discharge, LC or advance milestones, customs and landed-cost components, longer expediting |
| `SERVICE` | Services, AMC, transport, manpower | No material receipt; performance confirmed by a service entry sheet; may be value-based rather than quantity-based |
| `CAPITAL` | Plant, machinery, moulds, dies | Milestone-based payment schedule, installation and commissioning acceptance, asset capitalisation reference |
| `RETURNABLE` | Material sent out and expected back (tools, moulds, fixtures) | Non-valued movement with a return obligation and ageing |

**V3-POR-BR-001 (M)** PO type is fixed at creation and MUST NOT be changed afterwards. A wrong
type is cancelled and re-raised — its numbering series, approval matrix, tax treatment, receipt
behaviour and accounting all differ.

## 6.3 Status flow

```
                       ┌─────────┐
             ┌────────►│  DRAFT  │◄──── return for correction ──────┐
             │         └────┬────┘                                  │
             │       submit │                                       │
      reopen │              ▼                                       │
             │   ┌────────────────────┐  reject   ┌──────────┐      │
             │   │ PENDING_APPROVAL   ├──────────►│ REJECTED ├──────┘
             │   └────────┬───────────┘           └──────────┘
             │            │ all levels approved
             │            ▼
             │      ┌───────────┐   number allocated, PDF generated + hashed
             │      │ APPROVED  │
             │      └─────┬─────┘
             │            │ release (dispatch to supplier)
             │            ▼
             │      ┌───────────┐  supplier acknowledges
             │      │ RELEASED  ├───────────────► ACKNOWLEDGED (sub-state, not a status)
             │      └─────┬─────┘
             │            │ first GRN
             │            ▼
             │   ┌──────────────────────┐        ┌──────────┐
             │   │ PARTIALLY_RECEIVED   │◄──────►│ ON_HOLD  │  (delivery suspended)
             │   └─────────┬────────────┘        └──────────┘
             │             │ all lines received within tolerance
             │             ▼
             │      ┌─────────────┐
             │      │  RECEIVED   │
             │      └──────┬──────┘
             │             │ all invoices matched and posted
             │             ▼
             │      ┌─────────────┐   reopen (privileged, audited)
             │      │   CLOSED    │
             │      └─────────────┘
             │
             └── amend ──► revision R(n+1) re-enters PENDING_APPROVAL, prior revision → AMENDED

   RELEASED / PARTIALLY_RECEIVED ── short-close (reason) ──► SHORT_CLOSED
   APPROVED / RELEASED with no receipt ── cancel (reason) ──► CANCELLED
```

| Status | Supplier-visible | Editable | Receipt allowed | Invoice allowed |
|---|---|---|---|---|
| `DRAFT` | No | Yes | No | No |
| `PENDING_APPROVAL` | No | No | No | No |
| `APPROVED` | No | Amend only | No | No |
| `RELEASED` | Yes | Amend only | Yes | Yes (advance only) |
| `PARTIALLY_RECEIVED` | Yes | Amend only | Yes | Yes |
| `RECEIVED` | Yes | No | Only excess with permission | Yes |
| `SHORT_CLOSED` | Yes | No | No | Yes, for received quantity |
| `ON_HOLD` | Yes | No | No | No |
| `CLOSED` | Yes | No | No | No |
| `CANCELLED` | Yes | No | No | No |
| `AMENDED` | — | No | No | No |

**V3-POR-BR-002 (M)** Header status is derived from line and schedule status, never set
directly. A PO with three lines, one fully received and two open, is `PARTIALLY_RECEIVED`.

## 6.4 Functional requirements

### 6.4.1 Creation

| Ref | Pri | Requirement |
|---|---|---|
| **V3-POR-FR-001** | M | A PO MAY be created from: an approved comparison/award (the normal path), an approved PR or PR-line set directly (where comparison is exempt — Ch 5 V3-CMP-BR-007), a rate contract call-off, a previous PO (copy), a supplier's catalogue/price list, or blank with justification. The origin is recorded and reported. |
| **V3-POR-FR-002** | M | Creation from an award MUST carry across: vendor, item, specification, awarded quantity, rate at the awarded slab, discount, taxes, charges with their apportionment basis, payment terms, delivery terms, warranty, lead time → promised date, and the quotation and comparison references. Re-keying any of these is a defect. |
| **V3-POR-FR-003** | M | **Split into multiple POs**: one award may generate several POs — by vendor (always), and optionally by plant, delivery location, currency, budget/cost centre, project, or delivery date window. The split is proposed by the system and confirmed by the buyer; PR-line traceability is preserved across the split. |
| **V3-POR-FR-004** | M | **Merge**: several PR lines and several award lines for the same vendor and plant may be combined into one PO. The many-to-many PR-line ↔ PO-line link with quantities is mandatory. |
| **V3-POR-FR-005** | M | Line fields: item or free-text, specification (defaulting from the PR/RFQ, editable with the change highlighted), ordered quantity, UOM (with dual-UOM alternate quantity), rate, discount, tax code, HSN, promised delivery date, delivery location/warehouse, cost centre, budget line, inspection requirement, packing instruction, item-level terms, and PR/quotation references. |
| **V3-POR-FR-006** | M | **Delivery schedules per line** (`S-POR-05`): a line may have several dated delivery instalments with quantities. Receipt, expediting and OTIF are measured against the schedule line, not the header. |
| **V3-POR-FR-007** | M | Header charges (freight, insurance, packing, loading, other) with apportionment basis (`VALUE` / `WEIGHT` / `QUANTITY` / `EQUAL`), each flagged as vendor-borne or buyer-borne, and each with its own tax treatment and, where applicable, reverse-charge determination (e.g. GTA freight). |
| **V3-POR-FR-008** | M | Tax computation strictly per Vol 0 §10.4, with GST determined from the supplier's registered state vs the place of supply (the delivery location), reverse charge for unregistered/GTA/import-of-service, and ITC eligibility flagged per line. |
| **V3-POR-FR-009** | M | **TDS 194Q / TCS 206C(1H)** determination per supplier per financial year against the statutory threshold, computed at PO time as an indication and finalised at invoice verification. Both MUST NOT apply simultaneously. |
| **V3-POR-FR-010** | M | Terms & conditions from the versioned library, printed on the PO with the exact version referenced; ad-hoc additional terms permitted per PO and included in the approval context. |
| **V3-POR-FR-011** | M | Advance/milestone payment schedule per PO where terms require it: percentage or amount, trigger (on order, on dispatch, on receipt, on installation, on acceptance), due date rule, and the linkage that lets Finance release the advance without re-keying. |
| **V3-POR-FR-012** | M | **Budget commitment**: on approval the PO consumes committed budget for its cost centre × account × period; on amendment, short-close or cancellation, the commitment adjusts. Budget control at PO is `BLOCK` by default (assumption A3-06), overridable only with `PROCUREMENT.PO.OVERRIDE_BUDGET` and a reason. |
| **V3-POR-FR-013** | M | Price-variance control: the rate on every line is compared to the rate contract, the awarded quotation rate, and the last purchase price. Variance beyond configurable thresholds is a warning requiring justification, and above a hard threshold blocks submission without `PROCUREMENT.PO.OVERRIDE_PRICE`. |

### 6.4.2 Rate contracts, blanket orders and call-offs

| Ref | Pri | Requirement |
|---|---|---|
| **V3-POR-FR-014** | M | A rate contract / blanket order (`S-POR-04`) holds: vendor, item(s) with agreed rate (or price formula), validity period, committed total quantity and/or value, minimum call-off quantity, price-escalation clause, lead time, payment and delivery terms, penalty/LD clause, and a consumption tracker (quantity and value consumed, balance, % consumed, run-rate vs remaining validity). |
| **V3-POR-FR-015** | M | **Price basis** on a rate contract may be `FIRM`, `INDEX_LINKED` (formula against a named index with a base value and revision frequency), or `ESCALATION_CLAUSE` (permitted movement bands with a review trigger). For index-linked contracts the system computes the applicable rate for the call-off date and shows the derivation. |
| **V3-POR-FR-016** | M | A call-off validates against the contract: item covered, within validity, within remaining quantity/value, ≥ minimum call-off quantity, and at the contract rate (deviation requires justification and raises the approval level). |
| **V3-POR-FR-017** | M | Contract alerts: 80% and 95% consumption, 60/30 days to expiry, run-rate projecting over- or under-consumption, and an index movement beyond the escalation band triggering a re-negotiation task. |

### 6.4.3 Subcontracting / job work

| Ref | Pri | Requirement |
|---|---|---|
| **V3-POR-FR-018** | M | A subcontract PO (`S-POR-06`) carries: the finished/semi-finished item to be returned, the job-work operation, the job-work rate (per piece / per kg / per lot), and the **material to be issued** — derived from the BOM for the operation — with quantity per unit, expected process loss/scrap %, and whether scrap returns or is retained by the vendor. |
| **V3-POR-FR-019** | M | Material issue against a subcontract PO happens in Inventory (Vol 4) under a **job-work challan** referencing the PO. This module tracks challan issue, expected return date per the statutory window, actual returns, balance at vendor, and ageing. |
| **V3-POR-FR-020** | M | Job-work **reconciliation** (`S-POR-13`) per PO and per challan: material issued, finished quantity received, material consumed at standard, actual loss, permitted loss, excess loss, scrap returned, scrap retained, and balance still at the vendor. Excess loss beyond tolerance requires a disposition (recover, write off, debit note) with approval. |
| **V3-POR-FR-021** | M | Statutory ageing: challans approaching the return window (default 180 days for inputs, 365 for capital goods — held as configurable statutory master data) raise escalating alerts, and the ITC-04 data extract is available for the period. |

### 6.4.4 Amendment, cancellation, closure, expediting

| Ref | Pri | Requirement |
|---|---|---|
| **V3-POR-FR-022** | M | **Amendment** creates revision R(n+1) in `DRAFT`, re-enters approval at a level determined by the magnitude and nature of the change, and on approval produces a new released document sent to the supplier as an amendment with a change summary. The prior revision moves to `AMENDED` and remains retrievable. A diff view is mandatory. |
| **V3-POR-FR-023** | M | Amendable elements: quantity, rate, delivery date, delivery location, specification, taxes/charges, terms, adding lines, and closing lines. Non-amendable: vendor, company/branch/plant, PO type, currency — these require cancellation and re-issue. |
| **V3-POR-FR-024** | M | Quantity on an amendment MUST NOT be reduced below the quantity already received or already invoiced on that line (Vol 0 V0-BR-020). |
| **V3-POR-FR-025** | M | **Cancellation** requires a reason code, is permitted only when no receipt and no invoice exists against the PO, notifies the supplier, releases budget commitment and expected-receipt records, and returns the linked PR quantity to unordered. |
| **V3-POR-FR-026** | M | **Short-close** closes remaining open quantity on a line or the whole PO with a reason, releases the residual commitment, keeps received quantity intact, and is a distinct permission from cancel. |
| **V3-POR-FR-027** | M | **Hold / release** suspends further receipt and invoicing without cancelling — used for quality disputes, supplier holds and commercial disputes; requires a reason and notifies stores and finance. |
| **V3-POR-FR-028** | M | **Expediting workbench** (`S-POR-11`): all open PO schedule lines with promised date, days to/past due, quantity pending, supplier acknowledgement status, last follow-up date and note, and one-click reminder to the supplier. Every follow-up is logged against the PO. |
| **V3-POR-FR-029** | M | **Acknowledgement**: the supplier confirms the PO on the portal or by e-mail reply, optionally proposing a revised date. A proposed date change is a request the buyer accepts (creating an amendment) or rejects — it never changes the PO silently. Unacknowledged POs beyond a threshold are escalated. |
| **V3-POR-FR-030** | S | **Advance shipping notice (ASN)** from the supplier: despatch date, invoice number, vehicle/LR, quantity per line, batch/heat numbers, and documents. The ASN pre-populates gate entry and GRN. |
| **V3-POR-FR-031** | M | **Release / dispatch** (`S-POR-09`): generate the PDF from the approved revision, hash it, send by portal and/or e-mail to the configured supplier contacts, record the dispatch event, and store the exact artefact sent. Re-sending is permitted and logged; re-generating a *different* document from the same revision is not. |

## 6.5 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V3-POR-BR-003** | M | A PO MUST NOT be created for a supplier who is not `APPROVED`/`APPROVED_PROVISIONAL`, is on hold or blacklisted, has an expired mandatory document, or is not AVL-qualified for the item. Checked at submit and re-checked at release. |
| **V3-POR-BR-004** | M | The PO document number is allocated at approval, not at draft. Draft POs are identified by their `uid` only. |
| **V3-POR-BR-005** | M | The creator of a PO MUST NOT approve it (Vol 0 §4.2), and the approver of the comparison SHOULD NOT be the sole approver of the resulting PO where the configuration provides an alternative. |
| **V3-POR-BR-006** | M | A released PO MUST NOT be edited. Every change is an amendment with its own approval. There is no "correct the PO" path. |
| **V3-POR-BR-007** | M | Material changes (quantity, rate, item, delivery date beyond tolerance, taxes, terms) restart the approval workflow from level 1; immaterial changes (internal remarks, buyer contact) do not. The material-field set is configured per PO type (Vol 1 V1-WFL-FR-022). |
| **V3-POR-BR-008** | M | Total PO value determines the approval matrix and MUST be server-computed. Splitting a requirement into several POs to stay under an approval limit is detected: POs to the same vendor for the same item within a configurable window are aggregated for matrix evaluation, and the aggregation is shown to the approver. |
| **V3-POR-BR-009** | M | Promised delivery date MUST be ≥ PO date and SHOULD be ≥ PO date + supplier lead time; a shorter date is a warning requiring supplier confirmation. |
| **V3-POR-BR-010** | M | Ordered quantity MUST respect the item–supplier MOQ, order multiple and pack size from the AVL; the system offers the nearest compliant quantity rather than silently rounding. |
| **V3-POR-BR-011** | M | For direct material, ordered quantity across all open POs MUST NOT exceed the linked PR quantity by more than the configured over-order tolerance (default 0%), unless justified. |
| **V3-POR-BR-012** | M | A call-off exceeding the rate contract's remaining quantity or value, or falling outside its validity, is blocked. Extending a contract is an amendment to the contract with its own approval. |
| **V3-POR-BR-013** | M | Currency is fixed at creation. A foreign-currency PO stamps the exchange rate and its source at approval; the rate used for accrual and the rate used at invoice may differ and the difference is a Finance exchange-difference matter, not a PO amendment. |
| **V3-POR-BR-014** | M | Cancelling a PO with any receipt or invoice against it is refused; short-close is the path. |
| **V3-POR-BR-015** | M | Closing a PO requires all lines received-or-short-closed **and** all invoices matched, or an explicit forced close with `PROCUREMENT.PO.REOPEN`-class authority and a reason. GRIR balances must be dispositioned before close. |
| **V3-POR-BR-016** | M | The released PDF is immutable and hashed. Any re-print reproduces the stored artefact; it is never re-rendered from current data, because master data (address, terms, tax rate) may have changed since. |
| **V3-POR-BR-017** | M | Subcontract POs MUST NOT be released unless the BOM for the job-work operation resolves and the material to be issued is available or planned; otherwise the challan cannot be raised and the PO is undeliverable. |
| **V3-POR-BR-018** | S | A PO raised without a comparison where one was required (Ch 5 V3-CMP-BR-007) MUST record the exemption used and appear on the exception report. |

## 6.6 Validations

| # | Validation | Trigger | Severity |
|---|---|---|---|
| 1 | Supplier transactable (status, hold, documents, AVL, provisional limit) | Submit + Release | Error, naming the failing check |
| 2 | At least one line; every line has item/description, quantity, rate, date | Submit | Error |
| 3 | Quantity > 0; MOQ, order multiple, pack size respected | Line save | Error, with the compliant quantity offered |
| 4 | Rate > 0; rate vs contract / award / last purchase within threshold | Line save | Warning → Error above hard threshold |
| 5 | Promised date ≥ PO date; ≥ PO date + lead time | Line save | Error / Warning |
| 6 | Σ schedule quantities = line quantity | Save | Error |
| 7 | Tax code valid; GST type consistent with place of supply; HSN present | Save | Error |
| 8 | Reverse-charge determination consistent with supplier registration type | Save | Error |
| 9 | TDS 194Q and TCS 206C(1H) not both applicable | Save | Error |
| 10 | Budget availability for each cost centre × account × period | Submit | Block (default) with override permission |
| 11 | PR link: ordered ≤ PR quantity + over-order tolerance | Save | Error |
| 12 | Call-off within contract validity, quantity and value balance | Save | Error |
| 13 | Currency and exchange rate available for the PO date | Save | Error |
| 14 | Approval rule exists for the computed value and PO type | Submit | Error naming the missing configuration |
| 15 | Split-to-avoid-limit aggregation check | Submit | Warning shown to approver, always |
| 16 | Amendment quantity ≥ received and ≥ invoiced quantity | Amend save | Error |
| 17 | Subcontract: BOM resolves, issue material defined, loss % within policy | Submit | Error |
| 18 | Import: Incoterm, port, country of origin, landed-cost components present | Submit | Error |
| 19 | Capital: asset class, capex authorisation, milestone schedule present | Submit | Error |
| 20 | Supplier contact e-mail or portal access exists | Release | Error |
| 21 | Optimistic lock version | Save | 409 Conflict |
| 22 | Financial period open | Save / Approve | Error |

## 6.7 Approval rules

Seeded default (configurable — Ch 8 §8.3):

| Condition | Levels |
|---|---|
| Call-off at contract rate, within balance | L1 Purchase Manager *(auto-approve below a threshold, logged)* |
| ≤ ₹1,00,000 | L1 Purchase Manager |
| ₹1,00,001 – ₹10,00,000 | L1 Purchase Manager → L2 Finance Verification |
| ₹10,00,001 – ₹50,00,000 | L1 Purchase Manager → L2 Finance → L3 Factory Manager → L4 Director |
| > ₹50,00,000 | + L5 Managing Director |
| Capital, any value | L1 Purchase Head → L2 Finance Manager → L3 Factory Manager → L4 Director |
| Subcontract | L1 PPC → L2 Purchase Manager → L3 Factory Manager |
| Import | L1 Purchase Manager → L2 Finance (forex, LC) → L3 Director |
| Rate contract / blanket | L1 Purchase Head → L2 Finance → L3 Director |
| Rate above contract or above last purchase price beyond threshold | +1 level (Factory Manager or Director per band) |
| Emergency | L1 Factory Manager (single level) with post-facto Director review |
| Amendment increasing value > 10% | Full chain for the new value |
| Amendment changing only the delivery date within tolerance | L1 Purchase Manager |

**V3-POR-BR-019 (M)** The PO approval decision context MUST show: supplier rating, hold and
compliance status; budget position after this PO; the comparison and its recommendation-vs-
selection outcome (or the exemption used); rate variance vs contract, award and last purchase
with justification text; stock cover in days for the item; open PO exposure with this supplier;
aggregate value of related POs in the window (split detection); and any advance payment
requested.

## 6.8 Screens

### S-POR-02 · PO Create / Edit

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Purchase Order — New (from award CMP/25-26/0044)   [Save Draft] [Submit] [Preview]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Document ─────────────────────────┐ ┌─ Supplier ──────────────────────────────────┐ │
│ │ PO No.  (on approval)              │ │ Supplier *  🔍 Viraj Profiles Ltd           │ │
│ │ Date *  [05-Aug-2026 ▼]            │ │ Grade B (83) · OTIF 91% · Rej 0.9%          │ │
│ │ Type *  (•) Standard ( ) Blanket   │ │ GSTIN 27AAACV1234M1Z8 · Maharashtra ✔       │ │
│ │         ( ) Call-off ( ) Subcontract│ │ Contact Mr. D. Patil · 98xxxxxx45           │ │
│ │         ( ) Import ( ) Service     │ │ Payment 45 days from invoice · Early 2%/10d │ │
│ │ Plant * [Plant 1 — Hosur ▼]        │ │ Open PO ₹62.4 L · GRN not invoiced ₹8.1 L   │ │
│ │ Buyer   S. Ramesh                  │ │ ⚠ IGST — inter-state (MH → TN)              │ │
│ │ Refs    CMP/…/0044 · SQ/…/0234     │ │                                              │ │
│ │         PR/…/00311,00318,00325     │ │                                              │ │
│ └────────────────────────────────────┘ └─────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Items(1) │ Schedules │ Charges │ Terms │ Payment plan │ Attachments │ Approvals │ History│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ #│ Item       │ Spec         │ Qty   │UOM│ Rate  │Disc│ HSN  │ Tax    │ Amount        │
│ 1│ SS304 Coil │0.5×400 2B    │ 7,000 │KG │248.00 │0.5%│72193 │18% IGST│ 17,27,180     │
│  │ Delivery 26-Aug-2026 · Plant 1 RM Store · Inspection: 100% + MTC 3.1               │
│  │ PR link: PR/…/00311 4,000 KG · PR/…/00318 3,000 KG                                 │
│  │ ⓘ Awarded rate 248.00 · Last purchase 245.00 (+1.2%) · Contract RC/…/004 243.50    │
│  │ ⚠ Rate 1.85% above rate contract RC/25-26/004  [ Justification required ]           │
│  │ Schedules: 26-Aug 4,000 KG · 05-Sep 3,000 KG                        [ Edit ▸ ]     │
├─ Charges ──────────────────────────────────────────────────────────────────────────────┤
│ Freight  [Included in rate ▼]  Insurance [Buyer ▼] ₹4,200 apportion [Value ▼]          │
│ Loading  [Vendor ▼] ₹0                                                                 │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Budget CC-PROD-01 ────────────────────┐  Taxable        17,31,380                  │
│ │ Available 60,00,000 → 42,68,620 after  │  IGST 18%        3,11,648                  │
│ │ ████████████████████░░░░░░░  71.2%     │  Round off             −8                  │
│ └────────────────────────────────────────┘  GRAND TOTAL   ₹20,43,020                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ 1 justification pending. Approval route: Purchase Mgr → Finance → Factory Mgr →       │
│   Director (4 levels).  ⓘ 2 other POs to this supplier this week — combined ₹38.6 L    │
│   will be shown to approvers.                                        [ Preview route ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Field table — PO header

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| PO number / revision | string / int | auto | Allocated at approval; revision on amendment |
| PO date | date | Yes | Open period |
| PO type | enum | Yes | Fixed at creation (V3-POR-BR-001) |
| Procurement type | enum | Yes | Drives matrix, inspection default, account determination |
| Company / branch / plant | FK | Yes | Tenant context |
| Supplier + address + contact | FK | Yes | Transactable check at submit and release |
| Supplier GSTIN / state | derived | — | Drives GST type with the place of supply |
| Place of supply | FK | Yes | Delivery location's state |
| Currency / exchange rate / rate source | FK / decimal(18,8) | Yes | Stamped at approval |
| Buyer | FK user | Yes | Owner |
| Source: comparison / PR / contract / quotation refs | FK[] | Cond. | At least one unless justified standalone |
| Comparison exemption reason | FK | Cond. | When no comparison and one was required |
| Payment terms (structured) | composite | Yes | From supplier/award; overridable with reason |
| Delivery terms / Incoterm | FK | Yes | — |
| Freight / packing / insurance / other charges | composite | No | With basis, apportionment, tax, RCM flag |
| Advance / milestone plan | composite[] | Cond. | Where terms require |
| T&C set + version | FK | Yes | Printed and referenced |
| Special instructions | text | No | Printed |
| Delivery address | composite | Yes | Plant/warehouse or drop-ship |
| Totals (taxable, tax by component, charges, round-off, grand) | decimal | derived | Server-computed |
| Budget commitment reference | FK | derived | Created on approval |
| TDS/TCS indication | composite | derived | §6.4.1 |
| Released PDF hash | char(64) | derived | Set at release |
| Status / revision / workflow instance | enum / int / FK | auto | §6.3 |

### Field table — PO line

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| Line no. / uid | int / ULID | auto | uid is the stable key across revisions |
| Item / free-text description | FK / text | Yes (one) | Free text blocked for direct material |
| Specification | text | Yes | Default from PR/RFQ; edits highlighted and printed |
| Ordered quantity | decimal(18,6) | Yes | > 0, MOQ/multiple validated |
| UOM / alternate quantity + UOM | FK / decimal | Yes | Dual UOM with conversion basis shown |
| Rate / rate UOM | decimal(18,6) | Yes | Variance-checked |
| Discount % or amount | decimal | No | — |
| Tax code / HSN / GST rate | FK | Yes | Item + supplier state derived, overridable with permission |
| ITC eligible | bool | derived | Blocked-credit items flagged |
| Promised delivery date | date | Yes | Per line; schedules may subdivide |
| Delivery warehouse | FK | Yes | Drives put-away and place of supply |
| Cost centre / account / budget line | FK | Yes | — |
| Inspection requirement | enum | Yes | Default from AVL/item; drives the GRN inspection hook |
| Receipt tolerance over/under % | decimal | Yes | Default from item/company parameter |
| PR line links + quantity each | composite[] | Cond. | Many-to-many |
| Quotation line reference | FK | Cond. | From the award |
| Received / accepted / rejected / returned / invoiced quantity | decimal | derived | Maintained by downstream events |
| Line status | enum | derived | `OPEN` / `PARTIALLY_RECEIVED` / `RECEIVED` / `SHORT_CLOSED` / `CANCELLED` |
| Subcontract block | composite | Cond. | Operation, issue-material BOM, loss %, scrap treatment |

### S-POR-04 · Rate Contract / Blanket Order

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Rate Contract RC/25-26/004 — Jindal Stainless · SS304 coil   ⚑ ACTIVE  [Amend][Close]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Validity 01-Apr-2026 → 31-Mar-2027 (245 days left)   Min call-off 5,000 KG              │
│ Price basis  INDEX_LINKED · JSW SS304 domestic index · base 238.00 @ 01-Apr-2026        │
│              formula: base × (index_now ÷ index_base), revised monthly, band ±8%        │
│ Current derived rate ₹243.50/KG  (index +2.31% since base)          [ Show derivation ] │
│ Escalation review trigger: movement > 8% in any month → re-negotiation task              │
├─ Committed volume ─────────────────────────────────────────────────────────────────────┤
│ Quantity  600 T committed │ 372 T called off │ 228 T balance  ████████████░░░░░░ 62%    │
│ Value  ₹14.28 Cr committed │ ₹9.06 Cr consumed │ ₹5.22 Cr balance                       │
│ Run rate 31 T/month · projected consumption at expiry 620 T  ⚠ will exceed by 3.3%      │
├─ Call-offs (14) ───────────────────────────────────────────────────────────────────────┤
│ PO No.        │ Date      │ Qty    │ Rate   │ Received │ Status                         │
│ PO/25-26/00312│ 28-Jul-26 │ 25,000 │ 243.50 │ 25,000   │ Received                       │
│ PO/25-26/00298│ 14-Jul-26 │ 30,000 │ 242.10 │ 30,000   │ Closed                         │
│ …                                                                                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ 80% consumption alert fired 12-Jul-2026 · next review 01-Aug-2026                     │
│                                                          [ New call-off from contract ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-POR-13 · Subcontract Challan Reconciliation

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Job-work reconciliation — PO/25-26/00341 · CoatTech · Powder coating RAL5015            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Challan     │ Issued on │ Item            │ Issued  │ Due back  │ Returned│ Balance│Age │
│ JWC/…/0091  │ 02-Jul-26 │ Bottle body 750 │ 12,000  │ 29-Dec-26 │ 11,760  │   240  │ 27d│
│ JWC/…/0104  │ 18-Jul-26 │ Bottle body 750 │  8,000  │ 14-Jan-27 │  5,000  │ 3,000  │ 11d│
├─ Material reconciliation ──────────────────────────────────────────────────────────────┤
│ Issued 20,000 nos │ Finished received 16,760 │ Standard consumption 16,760              │
│ Permitted loss 2.0% = 342 │ Actual loss 240 ✔ within tolerance                          │
│ Scrap returnable 0 · retained by vendor 0                                               │
│ Balance at vendor 3,000 nos (₹8,64,000 at standard cost)                                │
│ ⓘ Statutory return window 180 days — earliest challan due 29-Dec-2026 (153 days left)   │
│                                        [ ITC-04 extract ] [ Raise debit note for loss ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-POR-01 PO List | Views: Pending approval, Released not acknowledged, Overdue delivery, Partially received, Not invoiced, Closed this month. |
| S-POR-03 PO Detail | Read-only; right rail with approval progress, document flow (PR→RFQ→SQ→CMP→PO→GRN→Invoice), revision history, receipt progress bar per line. |
| S-POR-05 Delivery Schedule | Per-line instalments, drag to reschedule (creates an amendment), OTIF measured per schedule line. |
| S-POR-06 Subcontract PO | Adds the operation, issue-material BOM panel, loss %, scrap treatment, challan plan. |
| S-POR-07 Import PO | Incoterm, ports, country of origin, LC details, estimated landed-cost components by HSN, expected transit. |
| S-POR-08 Amendment Diff | Field-level diff R(n) vs R(n+1), reason, and the resulting approval route. |
| S-POR-09 Release & Dispatch | Preview, recipients, channel, send with per-recipient result; stores the artefact and hash. |
| S-POR-10 Acknowledgement Tracker | Sent / viewed / acknowledged / date-change proposed, with escalation. |
| S-POR-11 Expediting Workbench | Overdue and due-soon schedule lines, follow-up log, bulk reminder, supplier-wise grouping. |
| S-POR-12 Short-close / Cancel | Reason code, remaining quantity, downstream impact (PR release, budget release, expected receipts). |

## 6.9 Notifications

| Trigger | Recipient | Channel |
|---|---|---|
| PO submitted for approval | Level approver | In-app, e-mail, push |
| Approval SLA reminder / breach | Approver, escalation target | In-app, e-mail, SMS |
| PO approved | Buyer | In-app, e-mail |
| PO released | Supplier contacts; Stores; Finance | E-mail, portal, in-app |
| PO not acknowledged within N days | Buyer, supplier | In-app, e-mail |
| Supplier proposes a revised delivery date | Buyer, requester | In-app, e-mail |
| Delivery due in 7 / 3 / 1 days | Buyer, supplier | E-mail, in-app |
| Delivery overdue (daily until resolved) | Buyer, Purchase Head, requester | In-app, e-mail |
| Amendment released | Supplier, Stores, Finance | E-mail, portal |
| PO cancelled / short-closed / held | Supplier, Stores, Finance, requester | E-mail, in-app |
| Rate contract 80% / 95% consumed, or 60/30 days to expiry | Buyer, Purchase Head | In-app, e-mail |
| Index movement beyond escalation band | Buyer, Purchase Head | In-app, e-mail |
| Job-work challan approaching the statutory window | Buyer, Stores, Finance | In-app, e-mail |
| Budget override used | Cost-centre owner, Finance | In-app, e-mail |

## 6.10 Reports contributed

Purchase Order Register · Pending PO Approval · Open PO / Order Book · Overdue Delivery
(expediting) · PO Amendment Register · PO Cancellation & Short-close Analysis · Rate Contract
Utilisation · Contract vs Spot Purchase Analysis · Subcontract Challan Ageing & Reconciliation ·
Import PO Tracking · Purchase Commitment vs Budget · Supplier-wise Order Book · Item Purchase
History · Price Variance (PO rate vs contract/last purchase) · Split-PO Exception ·
Comparison-exempt PO Exception · PO Acknowledgement Compliance.

## 6.11 Dashboard KPIs contributed

Pending PO approval (count, value, oldest) · approved PO value this period · open order book ·
overdue PO lines and value · PO acknowledgement % · average PO approval TAT · spend under
contract % · emergency PO ratio · price variance vs contract · top 10 suppliers by order value ·
commitment vs budget by cost centre.

## 6.12 Events

| Event | When | Consumers |
|---|---|---|
| `procurement.purchase_order.created` | Draft saved | Audit |
| `procurement.purchase_order.submitted` | Sent for approval | Workflow, Notification |
| `procurement.purchase_order.approved` | Final approval | **Inventory (expected receipts)**, **Finance (commitment)**, Numbering, PDF generation, Notification |
| `procurement.purchase_order.released` | Dispatched to supplier | Supplier portal, Notification, Stores |
| `procurement.purchase_order.acknowledged` | Supplier confirmed | Buyer, Expediting |
| `procurement.purchase_order.amended` | Amendment approved | Inventory, Finance, Supplier portal, Notification |
| `procurement.purchase_order.cancelled` | Cancelled | Inventory (release expected receipt), Finance (release commitment), PR (release quantity) |
| `procurement.purchase_order.short_closed` | Short-closed | Inventory, Finance, PR |
| `procurement.purchase_order.held` / `.released_from_hold` | Hold toggled | Stores, Finance |
| `procurement.purchase_order.closed` | Fully received and invoiced | Finance (GRIR clearance check), Reporting |
| `procurement.rate_contract.approved` | Contract approved | Sourcing engine, Planning |
| `procurement.rate_contract.threshold_reached` | 80% / 95% consumed | Notification, Buyer task |
| `procurement.subcontract.challan_overdue` | Statutory window approaching | Notification, Finance |
| `procurement.asn.received` | Supplier ASN submitted | Gate entry pre-fill, Stores, Planning |

## 6.13 Acceptance criteria (extract)

- A PO draft has no document number; the number appears at the moment of final approval and the
  numbering allocation record ties to that PO.
- Editing a released PO is refused; amending it creates R1, routes it for approval per the
  change magnitude, and leaves R0 fully retrievable with its own PDF and hash.
- Amending a line from 7,000 KG to 3,000 KG when 4,000 KG has been received is refused, naming
  the received quantity.
- Two POs raised to the same supplier for the same item within the configured window are shown
  to the approver as an aggregate, and the aggregate determines the approval level.
- A call-off for 8,000 KG against a contract with 5,000 KG balance is blocked.
- An index-linked contract rate for 05-Aug-2026 derives to ₹243.50 and the derivation is
  displayed with the index value and date used.
- Cancelling a PO with one GRN against it is refused; short-closing it leaves the received
  quantity intact and releases the residual commitment and PR quantity.
- Re-printing a PO released in April prints the April artefact, even after the supplier's
  address and the GST rate have changed.
- A subcontract PO whose BOM does not resolve cannot be submitted.
- Approving a PO consumes committed budget; short-closing it releases exactly the unreceived
  portion.

---

**Next:** [Chapter 7 — Receipt, Return & Invoice Verification](07-receipt-return-and-invoice.md)
