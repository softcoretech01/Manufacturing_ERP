# Volume 3 · Chapter 13 — UI/UX Recommendations, Mobile & Acceptance

Prerequisite: [Vol 0](../volume-00-foundation.md) §16 (UI standard and the seven screen
archetypes), §17 (mobile standard), §19 (NFRs). Those rules bind here and are not repeated —
this chapter states what procurement adds and where it deliberately differs.

---

## 13.1 UI/UX principles for this module

Procurement has three distinct user populations with incompatible needs, and a single design
language that ignores that will fail one of them.

| Population | Where they work | What the design must give them |
|---|---|---|
| **Buyers** (Purchase Exec/Manager) | Desk, dual monitor, all day, high volume | Density, keyboard operation, side-by-side comparison, bulk actions, saved views. They will use the system for six hours a day and every extra click is multiplied by 200. |
| **Approvers** (managers, directors) | Between meetings, often on a phone | Context over content. They need to know what is unusual in ten seconds, not read a 40-field form. |
| **Stores & security** | Standing, gloved, noisy, sometimes offline | Scan-first, large targets, minimal typing, tolerant of interruption, works with one hand. |

**V3-PRC-UIR-003 (M)** The same document renders differently for these populations. A GRN on a
buyer's screen is a data grid; on a store operator's tablet it is a scan-and-count flow. This
is a **different presentation of one document**, not a different document and not a different
data model.

### 13.1.1 Design rules specific to procurement

| Ref | Pri | Rule |
|---|---|---|
| **V3-PRC-UIR-004** | M | **Never ask for a number the system knows.** Stock, open PO quantity, last purchase rate, contract rate, lead time, MOQ and budget position are shown at the point of entry, not looked up by the user in another screen. |
| **V3-PRC-UIR-005** | M | **Warnings carry their justification field.** Any soft warning that may be overridden (price variance, budget, duplicate demand, over-receipt) captures the justification inline and stores it against the document (Vol 0 V0-UIR-010). A warning that can be clicked past without a trace is not a control. |
| **V3-PRC-UIR-006** | M | **Blocking errors name the fix.** "Quantity 7,150 KG is not a multiple of 500 KG. Nearest valid: 7,000 or 7,500" with clickable values — never "Invalid quantity". |
| **V3-PRC-UIR-007** | M | **Money is never rendered by a component that does not know the currency and the company locale.** All amounts go through the shared formatter: Indian grouping for INR (`12,45,678.00`), the currency code shown on any non-base-currency value, and negative amounts in parentheses or with an explicit minus plus colour — never colour alone. |
| **V3-PRC-UIR-008** | M | **Quantity always shows its UOM, and dual-UOM items always show both**, with the conversion basis available on hover/tap. "8,240" alone is how a KG becomes a piece. |
| **V3-PRC-UIR-009** | M | **Rate visibility is a first-class layout concern, not a hidden column.** Screens that a non-rate role will use (GRN, put-away, expediting) are laid out so that removing the rate columns leaves a sensible screen, not a gap. |
| **V3-PRC-UIR-010** | M | **Document flow is always one click away.** From any procurement document, the upstream and downstream chain (PR → RFQ → quote → comparison → PO → GRN → invoice → payment) is reachable with status at each node. |
| **V3-PRC-UIR-011** | M | **Status is never colour alone** (WCAG 2.1 AA, V0-UIR-019). Every badge carries text; ageing indicators carry both a colour and a number of days. |
| **V3-PRC-UIR-012** | S | **Comparison is the one screen permitted to break the archetypes.** A matrix of vendors × criteria is neither a list nor a form; it gets a bespoke layout with frozen row headers, horizontal scroll for vendors, and a breakdown drawer. An ADR records this exception. |

### 13.1.2 Keyboard operation

Beyond the global shortcuts (V0-UIR-016), procurement adds:

| Key | Context | Action |
|---|---|---|
| `Alt+I` | PR / RFQ / PO / GRN line grid | Add item line |
| `Ctrl+D` | Line grid | Duplicate previous line |
| `Ctrl+Shift+D` | GRN line | Split into a new batch/heat sub-line |
| `F4` | Any lookup field | Open the lookup with search focused |
| `F7` | PR / PO line | Show item context panel (stock, open PO, last rate, contract) |
| `F8` | Comparison | Toggle landed-cost breakdown drawer for the focused cell |
| `F9` | GRN / gate entry | Open scanner input (global standard) |
| `Alt+A` | Approval panel | Approve · `Alt+R` Reject · `Alt+B` Send back |
| `Alt+↑/↓` | Approval inbox | Previous / next document without leaving the decision panel |
| `Ctrl+Enter` | Any document | Submit for approval |

**V3-PRC-UIR-013 (M)** A buyer must be able to enter a complete 10-line PO without touching the
mouse, and a store operator must be able to complete a GRN with a scanner and the numeric
keypad only. Both are acceptance-tested end to end.

### 13.1.3 Screen-specific guidance

| Screen | Guidance |
|---|---|
| **PR entry** | The item context strip (stock, cover days, open PO, last rate, contract rate, AVL rank-1 supplier) renders under each line as it is entered, and collapses once acknowledged. Budget panel is always visible, not on a tab. |
| **Consolidation workbench** | Group by item with expandable PR lines; show the price-break gain from consolidating in money, not percentage — buyers act on rupees. |
| **RFQ vendor selection** | Show eligibility as a hard column with the specific blocking reason. Never silently omit an ineligible vendor; a buyer who cannot see why a vendor is missing will phone them. |
| **RFQ dispatch** | Per-vendor preview before sending is mandatory, with the actual artefact. A single "send to all" without preview is how internal target prices leak. |
| **Quotation entry** | Mirror the vendor's document order so the operator's eye moves down the page once. Show the running computed total beside the vendor-stated total, live, so a discrepancy is visible while typing rather than at submit. |
| **Comparison workbench** | Frozen criteria column, vendors as columns, best value in each row visually marked *and* labelled. Landed cost and total score both get an emphasised row. Recommendation panel sits at the bottom, always visible, with the deviation-reason field revealed the moment the user picks a non-recommended vendor. |
| **PO entry** | Header cards for document and supplier, tabbed lines/charges/terms/schedules, always-visible totals, warning strip at the bottom with links that focus the offending field. Supplier card shows rating, OTIF, open exposure and any blocking flag before the buyer invests effort. |
| **Expediting workbench** | Sorted by days-late descending by default; follow-up logging inline (one field, one button) — a buyer chasing 40 lines will not open 40 documents. |
| **Gate entry** | Kiosk layout: 8–10 fields, ≥ 44 px targets, camera capture, weighbridge button, big Save. Designed for a security guard on a wall-mounted tablet at night. |
| **GRN entry** | Scan-first. The pending-quantity column is the anchor. Batch splitting is a drawer, not a modal, so the line totals stay visible and reconcile live. |
| **Pending inspection board** | Kanban with ageing colour **and** a day count; drag triggers the real state transition with full validation (V0-UIR-013). |
| **Invoice verification** | Three-column PO / GRN / invoice with variances highlighted per line and the resolution control adjacent to the exception it resolves — never in a separate dialog that hides the numbers. |
| **Approval decision panel** | Context rail is the primary content, document is secondary. On a laptop the rail is right-hand and fixed; on a phone the context is first and the document is a tap away. |

## 13.2 Print and communication templates

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PRC-UIR-014** | M | Configurable print templates per document: PR, RFQ, PO (per type), amendment, GRN, gate pass, purchase return, debit note, comparison statement, supplier scorecard. Company letterhead, GSTIN, logo, signature block and T&C are template-driven. |
| **V3-PRC-UIR-015** | M | Vendor-facing artefacts (RFQ, PO, amendment, debit note) are **generated once, hashed and stored**. Re-print reproduces the stored artefact (Ch 6 V3-POR-BR-016). Internal documents may re-render. |
| **V3-PRC-UIR-016** | M | Every vendor-facing PDF carries: document number and revision, date, a QR code encoding the document uid for scan-back, the exact T&C version, and a "system-generated, valid without signature" statement where the client's policy allows. |
| **V3-PRC-UIR-017** | M | E-mail templates per event (RFQ invitation, reminder, corrigendum, PO release, amendment, debit note, scorecard) with merge fields, per-company branding, and multi-language where configured. |
| **V3-PRC-UIR-018** | M | A dispatch **content check** runs before any vendor-facing artefact leaves: it asserts the absence of internal target price, budget figures, other vendors' names and internal remarks (Ch 3 V3-RFQ-BR-005). Failure blocks the send. |

## 13.3 Accessibility and localisation

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PRC-UIR-019** | M | WCAG 2.1 AA throughout: semantic HTML, labelled inputs, visible focus rings, 4.5:1 contrast, no colour-only encoding, all interactive elements keyboard-reachable, and screen-reader announcements for async results (approval submitted, dispatch complete, match result). |
| **V3-PRC-UIR-020** | M | Data grids expose row/column headers to assistive technology; the comparison matrix is navigable cell by cell with the vendor and criterion announced. |
| **V3-PRC-UIR-021** | M | Dates display in the user's configured format (default `dd-MMM-yyyy`), never ambiguous numeric formats. Time zones: business dates in plant-local time, timestamps stored UTC and displayed in the user's zone with the zone shown where it matters (RFQ due time). |
| **V3-PRC-UIR-022** | S | Gate entry, GRN and mobile approval screens support Hindi and Tamil labels for shop-floor and security users; buyer and approver screens are English at release 1. |

## 13.4 Mobile application scope

Per Vol 0 §17. Procurement's mobile scope is deliberately narrow — the phone is for **deciding**
and **capturing at the point of physical work**, not for building documents.

### In scope

| Capability | User | Offline |
|---|---|---|
| **Approvals inbox with decision context** — approve, reject, send back, comment, request info, delegate | Approvers | Read cached, actions queue and sync |
| Document view for anything pending on the user | Approvers | Cached |
| **Gate entry** — vehicle, documents, photos, weighbridge reading, e-way bill scan | Security | Yes — queues and syncs |
| **GRN capture** — scan gate pass, scan item, enter quantity, capture batch/heat, photograph MTC, submit | Store operator | Yes — full offline with conflict handling |
| **Put-away** — scan bin, confirm | Store operator | Yes |
| Pending-inspection list and ageing | Store, QC | Read cached |
| **Expediting** — open PO lines, call/WhatsApp the supplier contact, log the follow-up | Buyer | Actions queue |
| Supplier 360 read-only (rating, open orders, contacts) | Buyer, manager | Cached |
| Dashboard exception tiles | Manager | Cached |
| Push notifications for approvals, overdue deliveries, blocked invoices, rejections | All | n/a |

### Explicitly out of scope on mobile

PR/RFQ/PO **creation and editing**, quotation entry, the comparison workbench, invoice
verification, settings, and all analytical reporting. These need a keyboard and a wide screen;
a phone version would be worse in every way than waiting for a desk.

**V3-PRC-UIR-023 (M)** Offline GRN capture uses locally generated ULIDs, so a receipt captured
without a network keeps its identity on sync. Conflicts (the PO changed while offline) are
surfaced to the operator as a review queue, never auto-resolved.

**V3-PRC-UIR-024 (M)** Mobile approval shows the same decision context as the web (Ch 8 §8.4),
condensed but not reduced — the exceptions, variances and supplier flags are the part that must
survive the small screen. If a fact cannot be shown, the approval action is disabled with an
explanation, not enabled with the fact omitted.

### Mobile GRN flow

```
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│  [ 📷 SCAN GATE PASS ]   │   │  PO/25-26/00356          │   │  SS304 Coil 0.5×400      │
│                          │   │  Viraj Profiles          │   │  Pending 7,000 KG        │
│  or enter gate pass no.  │──►│                          │──►│                          │
│  ┌────────────────────┐  │   │  Lines to receive        │   │  Received                │
│  │ GP/25-26/01187     │  │   │  ▸ SS304 Coil  7,000 KG  │   │  ┌────────────────────┐  │
│  └────────────────────┘  │   │                          │   │  │      8,240         │  │
│                          │   │  [ 📷 Scan item ]        │   │  └────────────────────┘  │
│  Recent gate passes      │   │                          │   │  KG   ⚠ over by 106%     │
│  GP/…/01186  10:12       │   │                          │   │                          │
│  GP/…/01185  09:40       │   │                          │   │  [ + Add batch / heat ]  │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
                                                                          │
┌──────────────────────────┐   ┌──────────────────────────┐   ┌───────────▼──────────────┐
│  ✔ Submitted             │   │  Review                  │   │  Batch 1 of 3            │
│  Pending approval by     │   │  8,240 KG · 3 heats      │   │  Heat  [ H-24418      ]  │
│  Store In-charge         │◄──│  ⚠ Excess — disposition  │◄──│  Coil  [ C-9912       ]  │
│                          │   │    required              │   │  Qty   [ 3,120        ]  │
│  [ Next receipt ]        │   │  ⚠ H-24422 MTC missing   │   │  [ 📷 Photograph MTC ]   │
│                          │   │  [ Submit anyway ]       │   │  [ Save & add another ]  │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

## 13.5 Barcode and QR usage

Per Vol 0 §15. Procurement's objects:

| Object | Symbology | Encodes | Printed on |
|---|---|---|---|
| Gate pass | Code 128 | gate entry uid | Gate pass slip |
| PO | QR | PO uid + number + revision | PO PDF (vendor scan-back) |
| GRN | Code 128 | GRN uid | GRN print, put-away sheet |
| Received batch / heat | QR | batch uid + item + heat + GRN | Batch label applied at receipt |
| Bin | Code 128 | bin uid | Bin location label (Vol 4) |
| Job-work challan | QR | challan ref + PO | Challan print |
| Debit note | QR | debit note uid | Debit note PDF |

**V3-PRC-UIR-025 (M)** Every barcode scan in this module resolves through one scan-resolution
service that identifies the object type from the payload and routes to the right action, so a
single scanner input works everywhere (V0-UIR-002).

## 13.6 Module-specific non-functional requirements

Vol 0 §19 sets the baseline. Procurement's specific targets:

| Ref | Pri | Requirement |
|---|---|---|
| **V3-PRC-NFR-001** | M | PR/PO/GRN list screens return the first page in ≤ 1.5 s at p95 with 5 years of data and 20 concurrent buyers. |
| **V3-PRC-NFR-002** | M | The item context strip (stock, open PO, last rate, contract) resolves in ≤ 500 ms at p95; it loads asynchronously and never blocks typing. |
| **V3-PRC-NFR-003** | M | Comparison recomputation for 6 vendors × 20 lines completes in ≤ 2 s at p95, including landed-cost normalisation and scoring. |
| **V3-PRC-NFR-004** | M | Three-way match of an invoice against up to 20 GRN lines completes in ≤ 2 s at p95. |
| **V3-PRC-NFR-005** | M | RFQ dispatch to 20 vendors completes asynchronously within 60 s and reports per-vendor results; the UI is never blocked. |
| **V3-PRC-NFR-006** | M | GRN submission with 10 lines and 30 batches commits in ≤ 3 s at p95, including tolerance and invariant validation. |
| **V3-PRC-NFR-007** | M | Mobile GRN capture works fully offline for at least 8 hours and 200 receipts, syncing within 60 s of connectivity. |
| **V3-PRC-NFR-008** | M | Approval inbox loads in ≤ 1 s at p95; the decision context for a single document in ≤ 1.5 s. |
| **V3-PRC-NFR-009** | M | Concurrency: numbering allocation for GRN (gapless) tolerates 10 simultaneous submissions without a gap or a duplicate, proven by a concurrency test. |
| **V3-PRC-NFR-010** | M | Rate-contract consumption under concurrent call-offs never exceeds the committed balance, proven by a concurrency test on the Redis-locked path. |
| **V3-PRC-NFR-011** | M | Traceability query (heat → dispatched carton, or reverse) returns in ≤ 2 minutes self-service (Vol 0 SC-4), and in ≤ 10 s for a single-hop query. |
| **V3-PRC-NFR-012** | M | Audit retention: all procurement documents and their audit rows are retained for 8 years minimum (statutory), with archived documents remaining queryable. |
| **V3-PRC-NFR-013** | M | Supplier portal is rate-limited independently and its failure MUST NOT degrade internal procurement operations. |

## 13.7 Test data and worked examples

**V3-PRC-NFR-014 (M)** The following worked examples ship as fixtures and are the basis of the
calculation test suite (CLAUDE.md §8 — no financial calculation ships on "looks right"):

| Example | Covers | Source |
|---|---|---|
| WE-01 SS304 coil quotation totals | Vol 0 §10.4 line calculation order, discount, freight apportioned by weight, IGST | Ch 4 §4.8 |
| WE-02 Landed-cost normalisation, 4 vendors | Ch 5 §5.3 steps 1–11, cost of money, quality-cost adjustment, creditable-tax exclusion | Ch 5 §5.9 |
| WE-03 Weighted scoring and split-award recommendation | Ch 5 §5.4, MOQ and slab handling | Ch 5 §5.9 |
| WE-04 Index-linked contract rate derivation | Ch 6 §6.4.2 | Ch 6 §6.8 |
| WE-05 GRN over-receipt with 3 heats, one without MTC | Ch 7 tolerance, batch split, invariant | Ch 7 §7.8 |
| WE-06 Weight ↔ piece conversion for SS blanks | Dual UOM, grade/thickness/width basis | Ch 7 §7.5.1 |
| WE-07 Three-way match with quantity and price variance | Ch 7 §7.14, debit-note generation, TDS 194Q | Ch 7 §7.17 |
| WE-08 Job-work reconciliation with permitted vs excess loss | Ch 6 §6.4.3 | Ch 6 §6.8 |
| WE-09 MSME due-date capping against 60-day terms | Ch 1 V3-SUP-BR-008 | Ch 1 |
| WE-10 LD computation with weekly rate and cap | Ch 7 V3-PRT-FR-007 | Ch 7 |
| WE-11 Approval routing across all seeded bands, incl. split detection | Ch 8 §8.3 | Ch 8 §8.12 |
| WE-12 Supplier rating computation with drill-through | Ch 1 §1.4 | Ch 1 |

## 13.8 Module acceptance criteria — the go-live checklist

Each chapter carries its own extract; these are the module-level gates. All must pass.

### Functional

1. A material requirement flows MRP → PR → approval → RFQ → 3 quotations → comparison → award
   approval → PO → approval → release → gate entry → GRN → inspection → stock → invoice →
   3-way match → hand-off to Finance, with **zero re-keying** at any step (Vol 0 SC-8).
2. Every document in the module implements all fourteen mandatory capabilities of
   Vol 0 §10.2 — verified by a conformance test that enumerates document types and asserts each
   capability.
3. Every state transition is rejected when invalid, with `409 invalid-state-transition` naming
   the current status and the allowed transitions.
4. Every approval matrix in Ch 8 §8.3 routes exactly as specified for boundary values on each
   band, tested at the limit and one rupee either side.
5. No document can be approved by its creator, in any role combination.
6. Every calculation in §13.7 matches its worked example to the last paisa.

### Control and compliance

7. A PO cannot be released to a supplier with an expired mandatory document, and the error names
   the document and its expiry date.
8. An invoice cannot be posted without a successful match or an approved, reasoned exception.
9. Every override (price, budget, tolerance, excess receipt, self-approval, auto-approval,
   without-PO receipt, comparison exemption) appears in the override register in the same
   transaction that used it.
10. Accepted + rejected + pending equals received on every GRN line, asserted across the whole
    table by the nightly integrity job.
11. A dispatched vendor artefact contains no internal target price, budget or competitor name —
    asserted by text extraction in an automated test.
12. Batch/heat traceability resolves both directions within the stated time.
13. MSME payment terms are capped at 45 days and cannot be overridden per transaction.
14. Statutory series (GRN, purchase return, debit note) are gapless under concurrency, and a
    cancelled document retains its number.

### Security

15. Every endpoint returns 403 without its declared permission (test per endpoint).
16. Restricted fields are absent from API responses for restricted roles, not merely hidden.
17. Cross-plant and cross-company access returns 404, disclosing nothing.
18. A supplier-portal principal cannot reach any internal endpoint or any other supplier's data.
19. Sealed-bid rates are unreadable before the recorded dual-authorised opening, including to a
    system administrator.

### Performance and operability

20. All targets in §13.6 met at p95 with 5 years of seeded data.
21. Concurrency tests for gapless numbering and rate-contract consumption pass.
22. Mobile GRN works offline for a full shift and syncs cleanly, including conflict cases.
23. Every external adapter has a working mock; the full flow is demonstrable with no external
    credentials.
24. Every list screen's default sort/filter combination is index-covered, asserted by `EXPLAIN`.

### Coverage

25. `domain/` and `application/` coverage ≥ 85%; module overall ≥ 70% (CLAUDE.md §8).
26. Every module endpoint has an integration test against real MySQL.
27. Each of the tenancy, RBAC and migration up/down gates passes for this module.

---

## 13.9 Implementation sequencing recommendation

Not a requirement — a delivery order that keeps the module usable at every step and matches the
Volume 1 dependency (README §2 build order).

| Phase | Delivers | Usable outcome |
|---|---|---|
| **P1** | Supplier extension, documents, AVL, onboarding workflow | Vendors can be qualified and approved — nothing else can start without this |
| **P2** | PR (manual + consolidation + budget check), approval matrix, PR reports | Demand is captured and authorised; buyers work from a real queue instead of e-mail |
| **P3** | PO (standard), release, acknowledgement, expediting, amendment, cancellation | Legal commitment is controlled — the single biggest risk closed |
| **P4** | Gate entry, GRN, batch/heat, inspection interface, put-away, mobile GRN | Material and traceability are captured; inventory becomes real |
| **P5** | Invoice verification, 3-way match, GRIR, debit note, purchase return | The financial loop closes; leakage stops |
| **P6** | RFQ, quotations, comparison, negotiation, award | Price becomes competitive and defensible |
| **P7** | Rate contracts, call-offs, index pricing, subcontract PO and reconciliation | The SS-coil and job-work realities are handled natively |
| **P8** | Supplier portal, ASN, supplier rating, scorecards | Suppliers self-serve; performance becomes measurable |
| **P9** | Import PO and landed cost, dashboards, full report catalogue | Analytics and imports complete the module |

P3 before P6 is deliberate: a controlled PO on a manually chosen vendor is worth more on day one
than a perfect comparison with no commitment control. The RFQ/comparison chain (P6) then
upgrades the *quality* of a process that is already *controlled*.

---

**End of Volume 3.** Back to the [volume index](README.md) · [SRS master index](../README.md)
