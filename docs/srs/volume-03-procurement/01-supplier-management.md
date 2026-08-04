# Volume 3 · Chapter 1 — Supplier Management

**Area code:** `SUP`
Prerequisite: [Vol 0](../volume-00-foundation.md) §10 · [Vol 1 Ch 7](../volume-01-core-framework/07-master-data.md)
(business-partner master) · [Vol 1 Ch 4](../volume-01-core-framework/04-workflow-and-approvals.md)

---

## 1.1 Objective

The supplier master is owned by MDM (Vol 1 Ch 7). What this chapter owns is the **process**
that turns an unknown company into a supplier the plant is permitted to buy from, keeps that
permission current, and withdraws it when performance or compliance fails.

**V3-SUP-FR-001 (M)** A supplier record MUST progress through explicit qualification states.
Buying is permitted only in the `APPROVED` state, only for the item categories the supplier is
qualified for, and only while all mandatory compliance documents are unexpired.

## 1.2 Supplier lifecycle

```
   ┌────────────┐  register (self-service or buyer-entered)
   │ PROSPECT   │
   └─────┬──────┘
         │ submit for qualification
         ▼
   ┌────────────┐  documents, bank, compliance, capability captured
   │ REGISTERED │
   └─────┬──────┘
         │ start qualification
         ▼
   ┌────────────────┐   parallel: Purchase screening · Quality audit (if critical)
   │ UNDER_         │            · Finance credit/bank check · Compliance check
   │ QUALIFICATION  │
   └─────┬──────┬───┘
         │      │ fail
         │      ▼
         │  ┌──────────┐
         │  │ REJECTED │──► may re-register after cooling-off period
         │  └──────────┘
         │ pass
         ▼
   ┌──────────────┐  provisional: limited value / limited period / 100% inspection
   │ APPROVED_    │
   │ PROVISIONAL  │
   └─────┬────────┘
         │ N successful GRNs with rating ≥ threshold
         ▼
   ┌────────────┐   hold (temporary, reversible)    ┌──────────┐
   │ APPROVED   │◄─────────────────────────────────►│ ON_HOLD  │
   └─────┬──────┘   release                          └──────────┘
         │ blacklist (permanent, needs Director)
         ▼
   ┌─────────────┐
   │ BLACKLISTED │──► reinstate (Director + reason, audited)
   └─────────────┘
                     ┌──────────────┐
   APPROVED ────────►│ INACTIVE     │  no transactions for N months, or voluntarily dormant
                     └──────────────┘
```

| State | Can receive RFQ | Can receive PO | Can be paid | Editable |
|---|---|---|---|---|
| `PROSPECT` | No | No | No | Yes |
| `REGISTERED` | No | No | No | Yes |
| `UNDER_QUALIFICATION` | No | No | No | Restricted |
| `APPROVED_PROVISIONAL` | Yes | Yes, within provisional limit | Yes | Restricted, audited |
| `APPROVED` | Yes | Yes | Yes | Restricted, audited |
| `ON_HOLD` | No | No — existing POs continue unless also held | Yes | Restricted |
| `BLACKLISTED` | No | No | Only pre-existing dues, with approval | No |
| `REJECTED` | No | No | No | No |
| `INACTIVE` | No | No | Yes | Yes (reactivation) |

**V3-SUP-BR-001 (M)** Buying from a supplier not in `APPROVED` or `APPROVED_PROVISIONAL` is
blocked at PO submission, not at PO release. A buyer must not be able to spend effort on a PO
that cannot be released.

**V3-SUP-BR-002 (M)** `APPROVED_PROVISIONAL` carries a value ceiling, a validity period and a
mandatory 100%-inspection flag. Exceeding any of them blocks the PO with a message naming the
provisional limit.

## 1.3 Functional requirements — onboarding and qualification

| Ref | Pri | Requirement |
|---|---|---|
| **V3-SUP-FR-002** | M | Suppliers MAY be created by a buyer (`S-SUP-03`) or self-register through a public, token-invited form (`S-SUP-04`). Both land in `REGISTERED` and follow the identical qualification path. |
| **V3-SUP-FR-003** | M | Duplicate prevention MUST run on GSTIN, PAN, bank account number, e-mail domain and fuzzy name at the point of entry, and MUST show the potential duplicates with their status before allowing creation. |
| **V3-SUP-FR-004** | M | Qualification is a workflow (Vol 1 Ch 4) with **parallel** levels: commercial screening (Purchase), quality/system audit (QC — only when the supplier is being qualified for a critical or food-contact category), financial check (Finance), and statutory/compliance check. All parallel levels must complete before approval. |
| **V3-SUP-FR-005** | M | A qualification **checklist** per supplier category (`S-SUP-05`) with scored questions, evidence attachment per question, an auditor, an audit date and a total score. Categories, questions and pass marks are master data. |
| **V3-SUP-FR-006** | M | Supplier categorisation MUST be captured on multiple independent axes: supply category (raw material / component / consumable / packaging / job work / MRO / capital / service / transporter), criticality (`CRITICAL` / `IMPORTANT` / `ROUTINE`), spend segment (§1.4 of the README), and geography (domestic / import / SEZ). |
| **V3-SUP-FR-007** | M | Capture per supplier: legal name, trade name, constitution, registered and plant addresses, contacts by function (sales / accounts / logistics / quality / escalation), GSTIN(s) per state with validation and status, PAN, MSME/Udyam number with classification and validity, TAN, IEC (for import), bank accounts with IFSC and cancelled-cheque proof, payment terms, credit days, currency, Incoterm default, lead time by item, and transporter preference. |
| **V3-SUP-FR-008** | M | **Bank-account changes** MUST require a separate approval by Finance with proof attachment, MUST notify the previous contact e-mail, and MUST place a configurable cooling period before the new account can receive a payment. Vendor bank fraud is the most common procurement fraud vector. |
| **V3-SUP-FR-009** | M | A compliance **document register** per supplier (`S-SUP-06`): document type, number, issuing authority, issue date, expiry date, file, verified-by, verified-on. Mandatory document types are configurable per supplier category. Expiry drives alerts at 60/30/7 days and, on expiry of a **mandatory** document, blocks new PO release for that supplier. |
| **V3-SUP-FR-010** | M | An **Approved Vendor List** (`S-SUP-07`) — the item (or item category) × supplier qualification matrix, carrying: approval date, approval reference, valid-to, provisional flag, agreed lead time, MOQ, pack size, price basis, and the customer approval reference where a customer has approved a specific source. |
| **V3-SUP-FR-011** | M | For food-contact and coating materials, the AVL entry MUST reference the qualifying test report and its validity. An expired qualification blocks a PO for that item from that supplier even if the supplier is otherwise `APPROVED`. |
| **V3-SUP-FR-012** | S | Supplier **capacity declaration** per item — monthly capacity, current commitment, tooling held, and alternate-source availability — used by the comparison engine's capacity criterion and by planning risk reports. |
| **V3-SUP-FR-013** | S | Related-party and conflict-of-interest declaration, with a flag that surfaces in every approval decision context for that supplier. |

## 1.4 Functional requirements — evaluation and rating

| Ref | Pri | Requirement |
|---|---|---|
| **V3-SUP-FR-014** | M | Supplier rating MUST be computed automatically from transaction data on a configurable period (default monthly, rolling 12 months), not entered by opinion. |
| **V3-SUP-FR-015** | M | The default scoring model, weights configurable per supplier category: |

```
  Quality          35%   = 100 − (rejected qty ÷ received qty × 100), floored at 0
                          − penalty per QC-raised NCR
                          − penalty per line received without a valid test certificate
  Delivery         30%   = OTIF% = lines received in full within (promised_date ± tolerance)
                                   ÷ lines due
                          − penalty per short supply requiring re-scheduling
  Price            15%   = 100 − (weighted PPV vs benchmark, capped)
                          + credit for holding price through a contract period
  Responsiveness   10%   = f(RFQ response rate, quote turnaround, PO acknowledgement time,
                             expediting reply time)
  Compliance       10%   = document validity + invoice accuracy (1st-pass match rate)
                          + e-invoice/GST filing status
  ────────────────────────────────────────────────────────────────────────────────────
  Grade:  A ≥ 85 · B 70–84 · C 55–69 · D < 55
```

| Ref | Pri | Requirement |
|---|---|---|
| **V3-SUP-FR-016** | M | Every score MUST be **drillable** to the exact documents that produced it. A supplier disputing a score must be answerable with a document list, not an assertion. |
| **V3-SUP-FR-017** | M | A manual **qualitative** override is permitted per period with mandatory justification, is recorded separately from the computed score, and both are shown. The computed score is never overwritten. |
| **V3-SUP-FR-018** | S | Grade transitions trigger actions: D-grade for two consecutive periods raises an automatic hold proposal; A-grade for four periods proposes preferred-supplier status. Proposals go to the Purchase Head, never auto-execute. |
| **V3-SUP-FR-019** | S | Supplier scorecard is publishable to the supplier portal and e-mailable as a PDF, with a corrective-action request and response loop. |
| **V3-SUP-FR-020** | C | Supplier development plan — actions, owners, target dates, follow-up — attached to a scorecard. |

## 1.5 Functional requirements — hold, blacklist, portal

| Ref | Pri | Requirement |
|---|---|---|
| **V3-SUP-FR-021** | M | **Hold** is reversible, requires a reason code and a duration, blocks new RFQ and PO, and optionally blocks payment. Existing open POs continue unless individually held. |
| **V3-SUP-FR-022** | M | **Blacklist** requires Director-level approval, a permanent reason record, and cancels or short-closes all open POs after explicit confirmation per document — never silently. |
| **V3-SUP-FR-023** | M | Supplier portal access (`S-SUP-11…15`) is invitation-based, per contact, with its own credentials, MFA, and a scope limited to that supplier's own records. Portal users MUST NOT hold any internal permission (Vol 0 V0-BR-002). |
| **V3-SUP-FR-024** | M | Portal capabilities at release 1: view and respond to RFQ, view PO and acknowledge, submit ASN, upload invoice with documents, view payment status, renew compliance documents, view scorecard, raise a query. |
| **V3-SUP-FR-025** | S | Portal activity (login, view, download, submit) is logged and visible to the buyer on the Supplier 360 screen — useful when a supplier claims never to have received an RFQ. |

## 1.6 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V3-SUP-BR-003** | M | The user who creates a supplier MUST NOT be an approver on that supplier's qualification (Vol 0 §4.2 SoD). |
| **V3-SUP-BR-004** | M | GSTIN MUST be structurally valid, MUST match the PAN embedded in it, and MUST be verified against the GST portal status where the integration is available. A cancelled GSTIN blocks new PO release. |
| **V3-SUP-BR-005** | M | A supplier without a valid GSTIN may be transacted with only when explicitly flagged `UNREGISTERED`, which forces reverse-charge determination on every PO and invoice. |
| **V3-SUP-BR-006** | M | Two supplier records MUST NOT share a GSTIN, or a PAN + bank-account combination, unless one is explicitly linked as a branch of the other. |
| **V3-SUP-BR-007** | M | A supplier may not be deactivated or blacklisted while open POs, un-invoiced GRNs, unreconciled job-work challans or unpaid invoices exist, unless each is explicitly dispositioned in the same action. |
| **V3-SUP-BR-008** | M | MSME classification drives the payment due date: `min(agreed_credit_days, 45)` from the date of acceptance of goods, with acceptance defined as inspection clearance, not GRN date. This is a statutory constraint (Sec 43B(h)) and MUST NOT be overridable per transaction. |
| **V3-SUP-BR-009** | M | Bank details are field-level restricted (Vol 0 §9.2): visible only to `PROCUREMENT.SUPPLIER.VIEW_BANK` holders, masked otherwise, and every unmask is audited. |
| **V3-SUP-BR-010** | M | A supplier's rating, hold status, open dues and compliance expiry MUST be shown in the approval decision context of every PR, PO and invoice involving that supplier (Vol 1 V1-WFL-FR-019). |
| **V3-SUP-BR-011** | M | Self-registered suppliers cannot be self-approved; the invitation token identifies the inviting buyer, who is then excluded from the approval chain. |
| **V3-SUP-BR-012** | S | An item flagged `SINGLE_SOURCE` MUST appear on the single-source risk report with the date it became single-source, and any PO on it carries a standing risk note in the approval context. |

## 1.7 Validations

| Field / action | Validation | Severity |
|---|---|---|
| GSTIN | 15 chars, checksum, state code matches address state, PAN segment matches PAN field | Error |
| PAN | 10 chars, structure, 4th char = `C`/`P`/`F`/`H`/`A`/`T` consistent with constitution | Error |
| Udyam number | Format `UDYAM-XX-00-0000000`; classification present when number present | Error |
| Bank account + IFSC | IFSC format and bank/branch lookup; account number length per bank | Error |
| Bank change | Proof attachment mandatory; approval mandatory; cooling period enforced | Error |
| E-mail / mobile | Format; uniqueness within supplier contacts | Error |
| Mandatory documents | All document types flagged mandatory for the category are present and unexpired | Error at approval |
| Document expiry | Any mandatory document expiring within 30 days | Warning; blocking on actual expiry |
| Credit days | ≤ 45 when MSME flag set | Error |
| Duplicate check | GSTIN / PAN / bank / fuzzy name ≥ 85% similarity | Warning with forced acknowledgement |
| Category qualification | AVL entry exists and is valid for the item being ordered | Error at PO submit |
| Provisional limit | Cumulative PO value in the provisional window ≤ ceiling | Error at PO submit |
| Blacklist | Any transaction attempt on a blacklisted supplier | Error, always |

## 1.8 Screens

### S-SUP-02 · Supplier 360 Detail

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Jindal Stainless Ltd  (SUP/00042)      ⚑ APPROVED   Grade A · 87    [Hold][⋮ Actions]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Category  Raw Material · CRITICAL · Strategic    GSTIN 33AABCJ1234K1ZP  ✔ Active        │
│ Since     14-Mar-2021                            MSME  No                               │
│ Terms     30 days from invoice · INR · Ex-works  Buyer S. Ramesh                        │
├─ Rating ───────────────────────────────────────┬─ Alerts ──────────────────────────────┤
│  Quality      ████████████████████░  92         │ ⚠ ISO 9001 expires in 22 days         │
│  Delivery     ██████████████████░░░  86         │ ⚠ Rate 24% above last PO on SS304     │
│  Price        ████████████████░░░░░  79         │ ⓘ Rate contract RC/25-26/004 ends     │
│  Response     ███████████████████░░  88         │   31-Aug-2026 — 62% consumed          │
│  Compliance   ████████████████████░  95         │ ⓘ Single source for SS316 grade       │
│  OVERALL      ████████████████████░  87  Grade A│                                        │
├────────────────────────────────────────────────┴───────────────────────────────────────┤
│ Overview │ Contacts │ Addresses │ Bank │ Documents(7) │ AVL(12) │ Contracts(2) │        │
│ Transactions │ Scorecards │ Portal activity │ Comments │ Audit                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  12-month transaction summary                                                           │
│  RFQs sent 34 · quoted 29 (85%) · won 18       PO value ₹8.42 Cr · lines 214            │
│  GRN lines 198 · OTIF 86% · rejected qty 0.7%  Debit notes 3 · ₹1,24,000                │
│  Invoices 96 · 1st-pass match 91% · avg pay 28 d                                        │
│  Open: PO ₹1.24 Cr (14 lines, 3 overdue) · GRN not invoiced ₹18.4 L · payable ₹42.1 L   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [ New RFQ ] [ New PO ] [ Evaluate ] [ Request documents ] [ Send scorecard ]           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-SUP-03 · Supplier Onboarding Wizard — steps and fields

| Step | Fields |
|---|---|
| 1 · Identity | Legal name*, trade name, constitution*, country*, website, referred-by, supply categories* (multi), criticality*, spend segment |
| 2 · Statutory | GSTIN* (per state, multi), registration type*, PAN*, MSME flag + Udyam no. + classification + validity, TAN, IEC, LUT (export), PF/ESI (for manpower services) |
| 3 · Addresses | Registered address*, plant/despatch addresses (multi), state* (drives GST place of supply), pin*, distance for freight |
| 4 · Contacts | Per function: name*, designation, e-mail*, mobile*, phone, portal-access flag; at least one Sales and one Accounts contact required |
| 5 · Commercial | Currency*, payment terms*, credit days*, advance %, Incoterm, freight basis, packing basis, price basis (spot / index / contract), price-escalation clause, warranty terms, default lead time (days)* |
| 6 · Banking | Bank name*, branch, account no.*, IFSC*, account type, beneficiary name*, cancelled cheque/ letter* (attachment), UPI (optional) |
| 7 · Capability | Items/categories offered*, monthly capacity, machines/processes, certifications, major customers, tooling held by us, sample submitted |
| 8 · Documents | Upload against each mandatory document type with number, issue and expiry dates |
| 9 · Declarations | Related-party declaration, code-of-conduct acceptance, anti-bribery, data-protection consent |
| 10 · Review & submit | Full summary, duplicate-check result, workflow preview showing who will approve |

`*` = mandatory. Mandatory set varies by supply category — configured, not hard-coded.

### S-SUP-07 · Approved Vendor List

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Approved Vendor List                     [ + Qualify supplier for item ] [Export] [⋮]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Item…  [Category ▼] [Supplier ▼] [Status ▼] [ ] Show expired  [ ] Single-source only │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Item             │ Supplier        │ Rank│ Lead │ MOQ    │ Last rate │ Valid to │ Status│
│ SS304 Coil 0.5mm │ Jindal Stainless│  1  │ 21 d │ 5 T    │ 245.00/kg │ 31-Mar-27│ ⚑ OK  │
│ SS304 Coil 0.5mm │ Viraj Profiles  │  2  │ 28 d │ 3 T    │ 251.00/kg │ 31-Mar-27│ ⚑ OK  │
│ SS316 Coil 0.6mm │ Jindal Stainless│  1  │ 35 d │ 5 T    │ 412.00/kg │ 31-Mar-27│ ⚠ SINGLE │
│ Silicone ring 68 │ Elasto Poly     │  1  │ 14 d │ 50,000 │   3.20/no │ 12-Aug-26│ ⚠ Food-grade cert expires 22 d │
│ Powder coat RAL  │ CoatTech        │  1  │ 10 d │ 200 kg │ 289.00/kg │ 30-Sep-26│ ⚑ OK  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Field table — AVL entry

| Field | Type | Rules |
|---|---|---|
| Item / item category | FK | One or the other; item wins over category |
| Supplier | FK | Must be `APPROVED` or `APPROVED_PROVISIONAL` |
| Rank | int | 1 = preferred; unique per item; drives default supplier suggestion |
| Approved on / by / reference | date, FK, text | Qualification document or customer approval reference |
| Valid from / to | date | Expiry blocks PO for that item–supplier pair |
| Lead time (days) | int | Overrides supplier default; used by MRP and by delivery-date validation |
| MOQ, pack size, order multiple | decimal | PO quantity validated and auto-rounded against these |
| Price basis | enum | `SPOT` / `CONTRACT` / `INDEX_LINKED` |
| Last purchase rate / date | derived | Read-only, from PO history |
| Inspection requirement | enum | `100%` / `SAMPLING` / `SKIP_LOT` / `NONE` — feeds the GRN inspection hook |
| Customer approval ref | text | Where the end customer has approved this source |
| Is single source | derived | True when this is the only valid entry for the item |

## 1.9 Notifications

| Trigger | Recipient | Channel |
|---|---|---|
| Supplier registration submitted | Purchase Executive, Purchase Head | In-app, e-mail |
| Qualification level assigned | Assigned approver | In-app, e-mail, push |
| Supplier approved / rejected | Creator, supplier contact | In-app, e-mail |
| Document expiring 60 / 30 / 7 days | Buyer, supplier contact | E-mail, in-app |
| Document expired — supplier blocked | Buyer, Purchase Head, supplier | E-mail, in-app, SMS |
| Bank details change requested | Finance, previous contact e-mail | E-mail (both), in-app |
| Rating grade dropped to C or D | Buyer, Purchase Head, QC Head | In-app, e-mail |
| Supplier placed on hold / blacklisted | Buyer, Stores, Finance, supplier | In-app, e-mail |
| Scorecard published | Supplier contact | E-mail, portal |

## 1.10 Reports contributed

Detailed in [Ch 9 §9.2](09-dashboard-and-reports.md); this chapter contributes:
Supplier Master Register · Supplier Qualification Status · Approved Vendor List ·
Compliance Document Expiry · Supplier Performance Scorecard · Supplier Rating Trend ·
Single-source Risk · Supplier Spend Analysis (Pareto) · New vs Existing Supplier Spend ·
Blacklist & Hold Register · Portal Adoption.

## 1.11 Events

| Event | When | Consumers |
|---|---|---|
| `procurement.supplier.registered` | Registration submitted | Notification, Workflow |
| `procurement.supplier.approved` | Qualification complete | MDM, Notification, Portal provisioning |
| `procurement.supplier.rejected` | Qualification failed | Notification |
| `procurement.supplier.held` / `.released` | Hold applied/removed | PO/RFQ guards, Finance (payment block), Notification |
| `procurement.supplier.blacklisted` | Blacklisted | PO cancellation proposal, Finance, Notification |
| `procurement.supplier.bank_changed` | Bank approved | Finance, Audit, Notification |
| `procurement.supplier.document_expired` | Scheduled job detects expiry | PO release guard, Notification |
| `procurement.supplier.rated` | Period rating computed | MDM (rating on master), Comparison engine, Dashboard |
| `procurement.avl.updated` | AVL entry added/expired | Planning (source of supply), PO guard |

## 1.12 Acceptance criteria (extract)

- A supplier in `REGISTERED` cannot be selected on an RFQ; the lookup does not return them.
- A PO to a supplier whose ISO certificate expired yesterday cannot be released, and the error
  names the document and its expiry date.
- Creating a second supplier with an existing GSTIN is blocked; creating one with a matching
  PAN and bank account raises a duplicate warning that must be acknowledged with a reason.
- The user who created a supplier record is not offered as an approver of its qualification.
- A supplier rating of 87 drills through to the 198 GRN lines and 96 invoices that produced it.
- Changing a supplier's bank account does not take effect until Finance approves it, and the
  old contact e-mail receives a notification at the moment the change is requested.
- An MSME supplier's credit days cannot be saved as 60.
- Blacklisting a supplier with 3 open POs forces an explicit disposition of each of the 3.

---

**Next:** [Chapter 2 — Purchase Requisition](02-purchase-requisition.md)
