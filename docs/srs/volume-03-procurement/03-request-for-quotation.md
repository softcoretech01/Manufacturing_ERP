# Volume 3 · Chapter 3 — Request for Quotation (RFQ)

**Area code:** `RFQ`
Numbering series: `RFQ` → `RFQ/{FY}/{SEQ:4}` (Vol 1 Ch 3 §3.5)

---

## 3.1 Purpose

The RFQ is the instrument that makes price competitive and defensible. Its job is to put the
**same** requirement, on the **same** commercial terms, in front of **several** qualified
vendors at the **same** time, and to record who was asked, what they were told, and who
replied — so that the later comparison is between comparable things, and the award can survive
an audit.

**V3-RFQ-FR-001 (M)** An RFQ MUST send an identical scope and identical commercial terms to
every invited vendor. Any change after dispatch is a **corrigendum** that goes to all invited
vendors, extends the due date where configured, and invalidates quotations received against
the superseded version.

## 3.2 RFQ types

| Type | Use | Behaviour |
|---|---|---|
| `SINGLE_VENDOR` | Proprietary item, single source, rate-contract renewal | One vendor; requires a single-source justification reason code |
| `MULTI_VENDOR` (default) | Normal competitive sourcing | ≥ 3 vendors recommended; below the configured minimum requires justification |
| `SEALED_BID` | High-value, capital, tender-like | Quotations are encrypted at rest and unreadable until the opening event, by two authorised users |
| `REVERSE_AUCTION` | Commoditised, repeat, many sources | Phase 2 (`C` priority) — live descending-price round on the portal |
| `RATE_CONTRACT_RFQ` | Annual volume tender for SS coil, packaging | Quantity is indicative; award creates a rate contract, not a PO |
| `TECHNO_COMMERCIAL` | Capital equipment, new component | Two-envelope: technical evaluation first, commercial opened only for technically qualified vendors |

**V3-RFQ-BR-001 (M)** For `SEALED_BID` and `TECHNO_COMMERCIAL`, no user — including a system
administrator — may view a submitted rate before the opening event. Rates are stored encrypted
with the opening event as the key-release trigger, and every access after opening is audited.

## 3.3 Status flow

```
  ┌────────┐  submit    ┌──────────────────┐  approve   ┌──────────┐
  │ DRAFT  ├───────────►│ PENDING_APPROVAL ├───────────►│ APPROVED │
  └───┬────┘            └────────┬─────────┘            └────┬─────┘
      │ ▲                        │ reject                    │ dispatch
      │ │ return                 ▼                           ▼
      │ │                   ┌──────────┐              ┌────────────┐
      │ └───────────────────┤ REJECTED │              │  ISSUED    │  vendors notified
      │                     └──────────┘              └─────┬──────┘
      │                                                     │
      │                          ┌──────────────────────────┼────────────────┐
      │                          │ first quote received     │ due date passed│
      │                          ▼                          ▼                │
      │                  ┌──────────────────┐        ┌──────────────┐        │
      │                  │ PARTIALLY_       │───────►│   CLOSED     │        │
      │                  │ RESPONDED        │        │ (no further  │        │
      │                  └────────┬─────────┘        │  responses)  │        │
      │                           │ all responded    └──────┬───────┘        │
      │                           ▼                         │                │
      │                  ┌──────────────────┐               │                │
      │                  │   RESPONDED      │───────────────┤                │
      │                  └──────────────────┘               │                │
      │                                                     ▼                │
      │                                              ┌─────────────┐         │
      │                                              │  AWARDED    │  comparison completed,
      │                                              └─────────────┘  PO/contract created
      │
      └──── amend (corrigendum) ──► new revision, re-dispatched, DRAFT → APPROVED → ISSUED

  Any state before AWARDED ──cancel with reason──► CANCELLED
  ISSUED / RESPONDED ──no acceptable quote──► CLOSED_NO_AWARD (reason mandatory) → may re-RFQ
```

| Status | Vendors can quote | Editable | Notes |
|---|---|---|---|
| `DRAFT` | No | Yes | Autosaved |
| `PENDING_APPROVAL` | No | No | Only when RFQ approval is configured on (see §3.7) |
| `APPROVED` | No | No | Ready to dispatch |
| `ISSUED` | Yes | Corrigendum only | Due date running |
| `PARTIALLY_RESPONDED` | Yes | Corrigendum only | ≥ 1 but not all invited vendors responded |
| `RESPONDED` | Yes (revisions) | Corrigendum only | All invited vendors responded or regretted |
| `CLOSED` | No | No | Due date passed or manually closed; late quotes blocked or flagged per config |
| `AWARDED` | No | No | Comparison approved and PO/contract created |
| `CLOSED_NO_AWARD` | No | No | Mandatory reason; feeds the re-tender loop |
| `CANCELLED` | No | No | Mandatory reason; all vendors notified |

## 3.4 Functional requirements

### 3.4.1 Creation

| Ref | Pri | Requirement |
|---|---|---|
| **V3-RFQ-FR-002** | M | An RFQ MAY be created from: one approved PR, several approved PRs (consolidation, Ch 2 §2.4.3), an approved PR line subset, a previous RFQ (copy), an RFQ template, or standalone with justification for a market enquiry. |
| **V3-RFQ-FR-003** | M | Line content: item or free-text description, full specification, quantity, UOM, required-by date, delivery location, packing requirement, and drawing/spec attachments. Line-level attachments MUST be individually dispatchable to vendors. |
| **V3-RFQ-FR-004** | M | Header commercial terms sent to every vendor: quotation due date and time, RFQ validity expectation, requested payment terms, delivery terms/Incoterm, freight basis, packing basis, warranty expectation, inspection requirement, price basis (per KG / per piece), currency, sample requirement, applicable T&C set from the library, and instructions to bidders. |
| **V3-RFQ-FR-005** | M | Vendor selection panel (`S-RFQ-03`) proposes vendors from the AVL for each item, ranked by rating, with their last quoted rate, last purchase rate, OTIF and current hold/compliance status. Vendors not on the AVL may be added only with `PROCUREMENT.RFQ.CREATE` plus a justification, and only if `APPROVED` or `APPROVED_PROVISIONAL`. |
| **V3-RFQ-FR-006** | M | Minimum-vendor policy is configurable per procurement type and value band (default: 3 above ₹1,00,000). Falling short requires a reason code (`SINGLE_SOURCE`, `PROPRIETARY`, `EMERGENCY`, `OEM_ONLY`, `CUSTOMER_NOMINATED`) recorded on the RFQ and reported. |
| **V3-RFQ-FR-007** | M | An RFQ MAY be split into **lots**, with vendors invited per lot and awards made per lot. A vendor invited for lot 1 must not see lot 2 content. |
| **V3-RFQ-FR-008** | S | **Should-cost / target price** per line, visible internally only, never dispatched, used by the comparison engine as a benchmark and by the negotiation screen. |
| **V3-RFQ-FR-009** | M | Blind-copy protection: vendor A MUST NOT be able to learn who else was invited. E-mail dispatch is individual, never a shared To/CC list. This is verified by test. |

### 3.4.2 Dispatch

| Ref | Pri | Requirement |
|---|---|---|
| **V3-RFQ-FR-010** | M | Dispatch channels: supplier portal notification, e-mail with a generated PDF plus attachments, and a downloadable PDF for manual sending. All three record a dispatch event per vendor with timestamp, channel, recipient address and message id. |
| **V3-RFQ-FR-011** | M | The dispatch screen (`S-RFQ-05`) previews the exact PDF and e-mail body per vendor before sending and supports a test send to the buyer. |
| **V3-RFQ-FR-012** | M | Each vendor receives a unique, expiring, single-supplier response link. The link opens the portal quotation form pre-filled with the RFQ lines; it never exposes another vendor's data and expires with the RFQ due date. |
| **V3-RFQ-FR-013** | M | Delivery tracking per vendor: `QUEUED`, `SENT`, `DELIVERED`, `BOUNCED`, `OPENED`, `PORTAL_VIEWED`, `RESPONDED`, `REGRETTED`, `NO_RESPONSE`. A bounce raises an alert to the buyer with the contact to correct. |
| **V3-RFQ-FR-014** | M | Automatic reminders to non-responding vendors at configurable offsets before the due date (default 50% and 80% elapsed, plus 24 h before), stopping on response, with a manual "remind now" action. |
| **V3-RFQ-FR-015** | S | Multi-language RFQ documents where the supplier's preferred language is set (English default; Hindi/Tamil for local MRO vendors). |

### 3.4.3 Expiry, revision, cancellation

| Ref | Pri | Requirement |
|---|---|---|
| **V3-RFQ-FR-016** | M | Due date and time are enforced against the plant time zone. On expiry the RFQ auto-transitions to `CLOSED` by a scheduled job, and the portal response form becomes read-only. |
| **V3-RFQ-FR-017** | M | Late-submission policy per RFQ: `BLOCK` (default), or `ACCEPT_WITH_FLAG` — accepted but permanently marked late, shown as late in the comparison, and requiring an acknowledgement before it can be awarded. |
| **V3-RFQ-FR-018** | M | **Extension** of the due date is a corrigendum: it requires a reason, notifies all invited vendors, and is recorded in the revision history. Extending after some vendors have quoted requires an explicit acknowledgement that quoted vendors' prices are now known to remain sealed (sealed-bid) or that fairness has been considered (open bid) — the acknowledgement is stored. |
| **V3-RFQ-FR-019** | M | **Corrigendum / amendment** creates revision R(n+1) with a mandatory change summary, re-dispatches to all invited vendors, marks quotations received against the prior revision as `SUPERSEDED`, and requires re-quotation. A diff view of revisions is mandatory. |
| **V3-RFQ-FR-020** | M | **Cancellation** requires a reason code, notifies all invited vendors with the reason category (never the internal note), and is blocked once an award has been approved. |
| **V3-RFQ-FR-021** | M | `CLOSED_NO_AWARD` requires a reason (all quotes above budget, technical non-compliance, requirement withdrawn, insufficient response) and offers a one-click re-RFQ that copies the requirement to a fresh RFQ with a new vendor set. |
| **V3-RFQ-FR-022** | M | If fewer than the configured minimum number of vendors respond by the due date, the system MUST alert the buyer before closure and offer: extend, add vendors, or proceed with justification. Silently proceeding with one quote is not permitted. |

### 3.4.4 Sealed bid and two-envelope

| Ref | Pri | Requirement |
|---|---|---|
| **V3-RFQ-FR-023** | S | Sealed-bid opening (`S-RFQ-09`) requires two authorised users present (dual control), records both identities, timestamps the opening, and only then decrypts and displays rates. The opening record is immutable. |
| **V3-RFQ-FR-024** | S | Two-envelope: technical envelope evaluated against a scored checklist; only vendors marked technically qualified have their commercial envelope opened. Disqualified vendors' commercial envelopes are never opened and are recorded as such. |

## 3.5 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V3-RFQ-BR-002** | M | Only `APPROVED` / `APPROVED_PROVISIONAL` suppliers, not on hold or blacklist, with valid mandatory compliance documents, and qualified for the item on the AVL, may be invited. The system removes ineligible vendors at dispatch time and tells the buyer why. |
| **V3-RFQ-BR-003** | M | RFQ quantity per line MUST NOT exceed the linked approved PR line's unordered quantity, unless the RFQ is explicitly flagged as an indicative-volume enquiry (`RATE_CONTRACT_RFQ`). |
| **V3-RFQ-BR-004** | M | Due date/time MUST be at least the configured minimum notice period ahead (default 48 h; 24 h for `URGENT`; overridable for `EMERGENCY` with a reason). Same-day due dates on high-value RFQs are a competition failure. |
| **V3-RFQ-BR-005** | M | The internal target price, should-cost, budget and any other vendor's quotation MUST NOT appear on any document or portal view sent to a vendor. Enforced by a dispatch-time content check, tested. |
| **V3-RFQ-BR-006** | M | An RFQ cannot move to `AWARDED` except through an approved comparison (Ch 5). A buyer cannot award directly from the RFQ screen. |
| **V3-RFQ-BR-007** | M | Cancelling or amending an RFQ does not delete received quotations; they are retained and marked `SUPERSEDED` or `CANCELLED` for audit and vendor-responsiveness scoring. |
| **V3-RFQ-BR-008** | M | An RFQ line linked to a PR line that is subsequently cancelled or short-closed MUST be flagged, and the buyer must dispose of it (drop the line via corrigendum, or continue with justification). |
| **V3-RFQ-BR-009** | M | Vendor non-response is recorded and feeds the responsiveness component of the supplier rating (Ch 1 §1.4). Repeated non-response beyond a threshold proposes AVL review. |
| **V3-RFQ-BR-010** | S | A vendor invited to an RFQ for an item they are not AVL-qualified for MUST be flagged in the comparison as "not qualified for this item", and awarding to them requires qualification first or an explicit provisional approval. |

## 3.6 Validations

| # | Validation | Trigger | Severity |
|---|---|---|---|
| 1 | At least one line and at least one vendor | Submit / Dispatch | Error |
| 2 | Due date ≥ now + minimum notice period | Save | Error (override with reason for emergency) |
| 3 | Vendor eligibility (status, hold, documents, AVL) | Dispatch | Error, per vendor, listing the reason |
| 4 | Minimum vendor count for the value band | Submit | Warning + mandatory reason code if short |
| 5 | RFQ quantity ≤ PR unordered quantity | Line save | Error |
| 6 | Vendor has a valid e-mail or portal access | Dispatch | Error per vendor |
| 7 | Specification present for every line (item spec or free text) | Submit | Error |
| 8 | Required-by date ≥ due date + minimum supplier lead time | Save | Warning |
| 9 | Attachment virus scan clean, size and type within policy | Upload | Error |
| 10 | Content check — no internal price/budget/target in dispatched artefacts | Dispatch | Error (hard block) |
| 11 | Duplicate active RFQ for the same PR lines | Submit | Warning + acknowledgement |
| 12 | Sealed-bid opening requires two distinct authorised users | Open | Error |
| 13 | Corrigendum has a change summary | Submit | Error |
| 14 | Cancellation reason code present | Cancel | Error |
| 15 | Late quotation against `BLOCK` policy | Portal submit | Error, with the due date stated |

## 3.7 Approval rules

**V3-RFQ-BR-011 (M)** RFQ approval is **configurable, and off by default** for routine
procurement below a threshold — the control point is the PR (need) and the PO (commitment), and
inserting a mandatory approval before every enquiry slows sourcing without adding control.
It MUST be switched on automatically for:

| Condition | Approval |
|---|---|
| Estimated value > configurable threshold (default ₹10,00,000) | L1 Purchase Manager |
| `SINGLE_VENDOR` type, or fewer vendors than the minimum policy | L1 Purchase Manager (justification review) |
| `RATE_CONTRACT_RFQ` (annual volume commitment) | L1 Purchase Manager → L2 Factory Manager |
| Capital procurement type | L1 Purchase Manager → L2 Finance Manager |
| Vendor invited who is not AVL-qualified for the item | L1 Purchase Head |
| Corrigendum extending the due date after quotes were received | L1 Purchase Head |

Dispatch is a separate permission (`PROCUREMENT.RFQ.DISPATCH`) from creation, so an executive
may prepare an RFQ that a manager releases.

## 3.8 Screens

### S-RFQ-02 · RFQ Create / Edit

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Request for Quotation — New                    [Save Draft] [Submit] [Preview PDF]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Document ─────────────────────────┐ ┌─ Response ──────────────────────────────────┐ │
│ │ RFQ No.  (auto)                    │ │ Type *     (•) Multi-vendor ( ) Single      │ │
│ │ Date *   [29-Jul-2026]             │ │            ( ) Sealed bid ( ) Techno-comm.  │ │
│ │ Title *  [SS304 coil — Aug 2026 ]  │ │ Due date * [05-Aug-2026] [17:00] IST        │ │
│ │ Plant *  [Plant 1 ▼]               │ │ Quote validity expected [30] days           │ │
│ │ Buyer    S. Ramesh (auto)          │ │ Late quotes (•) Block ( ) Accept + flag     │ │
│ │ PR refs  PR/…/00311, 00318, 00325  │ │ Currency [INR ▼]  Target price [ hidden ]   │ │
│ └────────────────────────────────────┘ └─────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Items(2) │ Vendors(4) │ Terms │ Attachments(3) │ Dispatch │ Responses │ History         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ #│ Item / Description        │ Specification              │ Qty    │UOM│ Need by │ Att. │
│ 1│ SS304 Coil 0.5mm          │ 0.5±0.02 × 400mm, 2B finish│ 11,500 │KG │22-Aug-26│ 📎2  │
│  │                           │ Heat no. + MTC EN10204 3.1 │        │   │         │      │
│ 2│ SS304 Coil 0.6mm          │ 0.6±0.02 × 420mm, 2B finish│  4,000 │KG │28-Aug-26│ 📎1  │
├─ Terms sent to all vendors ────────────────────────────────────────────────────────────┤
│ Payment terms requested [30 days from invoice ▼]  Delivery [Ex-works ▼] Freight [Extra]│
│ Packing [Supplier standard, seaworthy] Warranty [n/a] Inspection [At our works, MTC req]│
│ Price basis [Per KG] Sample [Not required] T&C set [Standard RM Purchase v3 ▼]          │
│ Instructions to bidders                                                                 │
│ [ Quote item-wise. Mention heat/lot availability, minimum order quantity and earliest ] │
│ [ despatch date. Rates to be firm for the validity period.                            ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-RFQ-03 · Vendor Selection Panel

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Invite vendors — SS304 Coil                        Suggested from AVL · 6 eligible      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│[x]│ Vendor            │Grade│ OTIF │ Rej% │ Last rate │ Last buy  │ Status              │
│[x]│ Jindal Stainless  │  A  │  86% │ 0.7% │ 245.00/kg │ 02-Jun-26 │ ✔ Eligible          │
│[x]│ Viraj Profiles    │  B  │  91% │ 1.2% │ 251.00/kg │ 18-May-26 │ ✔ Eligible          │
│[x]│ Shah Alloys       │  B  │  78% │ 2.1% │ 249.50/kg │ 04-Apr-26 │ ✔ Eligible          │
│[x]│ Metal Source Intl │  A  │  94% │ 0.4% │ 258.00/kg │ 12-Mar-26 │ ✔ Eligible          │
│[ ]│ Sunrise Steel     │  C  │  62% │ 4.8% │ 240.00/kg │ 20-Jan-26 │ ⚠ Grade C — 2 periods│
│[ ]│ Prime Metals      │  —  │   —  │   —  │        —  │        —  │ ✖ ISO cert expired  │
│   │ [ + Add vendor not on AVL — requires justification ]                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4 vendors selected · policy minimum for this value band is 3 ✔                          │
│ ⓘ Vendors will not see one another. Each receives a unique response link.               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-RFQ-04 · RFQ Detail with Response Tracker

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ RFQ/25-26/0087 — SS304 coil Aug 2026        ⚑ PARTIALLY RESPONDED  Due in 2 d 4 h      │
│                             [Remind all] [Corrigendum] [Extend] [Compare →] [Cancel]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Vendor            │ Sent       │ Delivered │ Viewed    │ Responded  │ Quote no. │ Value │
│ Jindal Stainless  │ 29-Jul 11:02│ ✔ 11:02  │ ✔ 29-Jul  │ ✔ 31-Jul   │ SQ/…/0231 │28.05 L│
│ Viraj Profiles    │ 29-Jul 11:02│ ✔ 11:03  │ ✔ 30-Jul  │ ✔ 01-Aug   │ SQ/…/0234 │28.62 L│
│ Shah Alloys       │ 29-Jul 11:02│ ✔ 11:02  │ ✔ 29-Jul  │ ⏳ pending  │     —     │   —   │
│                   │             │           │           │ reminded ×2 │           │       │
│ Metal Source Intl │ 29-Jul 11:02│ ✖ bounced │     —     │ ✖ no e-mail │     —     │   —   │
│                   │  ⚠ Fix contact e-mail and re-send                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2 of 4 responded (50%) · policy minimum 3 · ⚠ Closing now would leave 2 comparable quotes│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Field table — RFQ header

| Field | Type | Mandatory | Rule |
|---|---|---|---|
| RFQ number / revision | string / int | auto | Numbering engine; revision increments per corrigendum |
| RFQ date | date | Yes | Open period |
| Title | string(200) | Yes | Appears in vendor communication |
| RFQ type | enum | Yes | §3.2 |
| Procurement type | enum | Yes | Inherited from PR when created from one |
| Plant / delivery location | FK | Yes | Drives place of supply and freight |
| Buyer | FK user | Yes | Owner; default logged-in user |
| PR references | FK[] | Cond. | Mandatory unless standalone-with-justification |
| Due date & time | datetime | Yes | ≥ now + minimum notice; plant time zone |
| Quote validity expected | int days | Yes | Default 30 |
| Late-quote policy | enum | Yes | `BLOCK` default |
| Currency | FK | Yes | Multiple currencies allowed per vendor for imports |
| Target / should-cost | decimal | No | **Internal only** |
| Payment / delivery / freight / packing / warranty terms | FK or text | Yes | From the T&C library |
| Inspection requirement | enum | Yes | `AT_SOURCE` / `AT_OUR_WORKS` / `MTC_ONLY` / `NONE` |
| Sample required | bool + qty | No | Drives a sample register entry on response |
| T&C set | FK | Yes | Versioned; the exact version sent is recorded |
| Instructions to bidders | text | No | Free text, sent verbatim |
| Minimum vendors policy met | derived | — | Blocks or warns per config |
| Short-vendor reason code | FK | Cond. | Mandatory when policy not met |
| Status | enum | auto | §3.3 |

### Other screens

| Screen | Notes |
|---|---|
| S-RFQ-01 RFQ List | Views: Open RFQs, Awaiting response, Closing today, Awaiting comparison, No-award. Columns: responded/invited, days to due, estimated value. |
| S-RFQ-05 Dispatch Wizard | Step 1 vendor confirm → 2 channel & template → 3 per-vendor preview → 4 test send → 5 send with progress and per-vendor result. |
| S-RFQ-06 Corrigendum | Change summary (mandatory), affected lines highlighted, revised due date, notice preview, list of quotations that will be superseded. |
| S-RFQ-08 Template Library | Reusable header terms + instructions + T&C set + default vendor group, per item category. |
| S-RFQ-09 Sealed-bid Opening | Dual-user authentication, opening minutes generated as a PDF, immutable record. |
| S-SUP-12 Portal RFQ Response | Vendor-side: line grid with rate, tax, lead time, MOQ, validity, attachments, regret option, save-draft and submit with confirmation e-mail. |

## 3.9 Notifications

| Trigger | Recipient | Channel |
|---|---|---|
| RFQ dispatched | Each invited vendor (individually) | E-mail, portal |
| RFQ reminder (50% / 80% / 24 h) | Non-responded vendors | E-mail, portal |
| Corrigendum issued | All invited vendors | E-mail, portal |
| Due date extended | All invited vendors | E-mail, portal |
| RFQ cancelled | All invited vendors | E-mail, portal |
| Quotation received | Buyer | In-app, e-mail |
| E-mail bounced | Buyer | In-app, e-mail |
| Due date passed with < minimum responses | Buyer, Purchase Head | In-app, e-mail |
| RFQ closing in 24 h with no response from a vendor | Buyer | In-app |
| Sealed bid ready to open | Both authorised openers | In-app, e-mail |

## 3.10 Reports contributed

RFQ Register · RFQ Response Analysis (invited vs responded vs regretted by vendor) ·
RFQ Ageing & Closure Time · Single-vendor / Short-vendor Exception · Corrigendum Log ·
No-award Analysis · Vendor Responsiveness · RFQ-to-PO Conversion & Cycle Time.

## 3.11 Dashboard KPIs contributed

RFQ pending response · RFQ closing today/this week · response rate % · average RFQ cycle time
(issue → award) · single-vendor RFQ ratio · vendors with zero responses in the period.

## 3.12 Events

| Event | When | Consumers |
|---|---|---|
| `procurement.rfq.created` | RFQ saved as draft | Audit |
| `procurement.rfq.approved` | Approval complete (when configured) | Dispatch enablement, Notification |
| `procurement.rfq.issued` | Dispatched to vendors | Portal, Notification, Supplier responsiveness tracker |
| `procurement.rfq.amended` | Corrigendum issued | Portal, Notification, Quotation supersession |
| `procurement.rfq.extended` | Due date extended | Portal, Notification |
| `procurement.rfq.closed` | Due date passed / manually closed | Comparison enablement, Notification |
| `procurement.rfq.cancelled` | Cancelled | Portal, Notification, PR line release |
| `procurement.rfq.awarded` | Award approved (from Ch 5) | PO creation, Vendor rating, Notification |
| `procurement.rfq.no_response` | Vendor did not respond by due date | Supplier rating |

## 3.13 Acceptance criteria (extract)

- Four vendors invited receive four separate e-mails; no vendor's address appears in another's
  message, verified by inspecting the sent messages.
- An RFQ dispatched with a target price set produces a vendor PDF that contains no target
  price, verified by text extraction in an automated test.
- A vendor whose ISO certificate expired the previous day is removed from the dispatch list and
  the buyer is told which document expired.
- A corrigendum issued after one vendor has quoted marks that quotation `SUPERSEDED`, notifies
  all four vendors, and requires re-quotation before comparison.
- A quotation submitted one minute after the due time on a `BLOCK` RFQ is refused, and the
  refusal is visible to the buyer with the timestamp.
- Closing an RFQ with two of four responses when the policy minimum is three raises the
  pre-closure alert and requires a documented decision.
- A sealed-bid RFQ cannot display any rate before opening, including to a system administrator,
  and the opening requires two distinct authorised users.

---

**Next:** [Chapter 4 — Vendor Quotations](04-vendor-quotations.md)
