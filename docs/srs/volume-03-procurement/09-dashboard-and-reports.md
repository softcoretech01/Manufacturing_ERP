# Volume 3 · Chapter 9 — Dashboard & Reports

**Area codes:** `DSH` · `RPT`
Prerequisite: [Vol 0](../volume-00-foundation.md) §14 (reporting and export standard),
§16.2 F/G (dashboard and report-viewer archetypes). The report **engine** and the dashboard
**designer** are Volume 1 Ch 8 / Volume 11; this chapter defines procurement's content.

---

## 9.1 Dashboard Design

### 9.1.1 Principle — one dashboard, four audiences

A single procurement dashboard that shows a director the same thing it shows a buyer is useless
to both. The dashboard is **one screen with a role-driven default layout**, personalisable per
user (Vol 0 V0-UIR-014).

| Audience | What they need to decide | Default layout |
|---|---|---|
| **Purchase Executive / Buyer** | What do I do next, and what is late? | Action queues first: my approvals, PRs to source, RFQs closing, quotes to review, overdue POs, blocked invoices. Charts below. |
| **Purchase Manager / Head** | Is the function performing, and where is it stuck? | Funnel and cycle times first, then exceptions (emergency, single-source, price variance), then supplier performance, then spend. |
| **Factory / Finance Manager** | Is material coming, and is money controlled? | Order book vs need dates, commitment vs budget, GRIR ageing, MSME exposure, rejection rate. |
| **Director / MD** | Is spend under control and are the controls working? | Spend trend and category mix, savings, budget vs actual, exception register (emergency, override, self-approval, single-source), top suppliers, risk. |

**V3-DSH-FR-001 (M)** Every widget MUST drill through to the underlying list or report **with
its filters carried across** (Vol 0 V0-UIR-014). A number that cannot be opened is not a KPI,
it is decoration.

**V3-DSH-FR-002 (M)** Every widget respects the user's data scope (company, branch, plant,
cost centre) and permissions. A plant-scoped buyer's "pending approvals" count and a director's
are computed from the same query with different scopes, never from a pre-aggregated table that
ignores scope.

**V3-DSH-FR-003 (M)** Widget refresh: action-queue widgets are live (≤ 60 s cache), analytical
widgets may be cached up to 15 minutes, and every widget shows its as-of timestamp. Month-end
comparatives are computed from committed data only.

### 9.1.2 Layout — Purchase Manager default

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Procurement Dashboard   [Plant: All ▼][Period: Aug-2026 ▼][Category: All ▼]  ⟳ 09:42   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────┐┌───────────┐┌───────────┐┌───────────┐┌───────────┐┌────────────────────┐│
│ │ PR raised ││ Pending   ││ RFQ       ││ Quotes    ││ Pending   ││ PO released        ││
│ │           ││ PR approv ││ awaiting  ││ to review ││ PO approv ││                    ││
│ │   184     ││    23     ││ response  ││    11     ││    9      ││   ₹4.82 Cr         ││
│ │ ₹6.4 Cr   ││ ₹1.2 Cr   ││    14     ││           ││ ₹1.8 Cr   ││   162 orders       ││
│ │ ▲12% MoM  ││ 🔴 3 > 3d ││ 🟡 4 close││ 🟡 2 exp  ││ 🔴 2 > 2d ││   ▲8% MoM          ││
│ │           ││           ││ today     ││ in 3 d    ││           ││                    ││
│ └───────────┘└───────────┘└───────────┘└───────────┘└───────────┘└────────────────────┘│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Procurement funnel — Aug-2026 ──────────┐ ┌─ Cycle time (median working days) ─────┐│
│ │ PR approved      184 ████████████████████│ │ PR submit → approve      1.4 d  ▼ 0.3  ││
│ │ Sourced          171 ██████████████████░ │ │ PR approve → PO release  3.8 d  ▲ 0.6 ⚠││
│ │ RFQ issued        96 ██████████░░░░░░░░░ │ │ RFQ issue → quotes in    4.2 d  ▬      ││
│ │ Quotes received  241 (2.5 per RFQ)       │ │ Comparison → award       1.1 d  ▼ 0.2  ││
│ │ Awarded           88 █████████░░░░░░░░░░ │ │ PO release → first GRN  18.6 d  ▲ 1.2  ││
│ │ PO released      162 ████████████████░░░ │ │ GRN → invoice posted     9.4 d  ▼ 1.8  ││
│ │ Received (lines) 214 ██████████████████░ │ │ Target: PR→PO ≤ 3 d (SC-6)  ✖ missing  ││
│ └──────────────────────────────────────────┘ └────────────────────────────────────────┘│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Monthly procurement cost & purchase trend ────────────────────────────────────────┐ │
│ │ ₹ Cr                                                                                │ │
│ │ 6 ┤                                        ╭──●  actual                             │ │
│ │ 4 ┤        ╭──●───●───╮      ╭───●────●───╯     ┄┄○ budget                          │ │
│ │ 2 ┤ ●──●──╯            ╰──●─╯                                                       │ │
│ │ 0 ┼────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────                      │ │
│ │   Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  Jan  Feb  Mar                        │ │
│ │ ── RM ── Packaging ── Consumables ── MRO ── Subcontract  (stacked toggle)            │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────┬─────────────────────────────────────────────────────┤
│ ┌─ Supplier performance ────────┐ │ ┌─ Budget vs actual by cost centre ──────────────┐│
│ │ Supplier      │Gr│OTIF│Rej%│Δ │ │ │ CC-PROD-01  ████████████████░░░░  71%  ₹1.71/2.4││
│ │ Jindal Stain. │A │ 86%│0.7%│▲ │ │ │ CC-PACK-01  ██████████████████░░  88%  ₹0.44/0.5││
│ │ Viraj Profile │B │ 91%│0.9%│▲ │ │ │ CC-MAINT-01 ██████████░░░░░░░░░░  52%  ₹0.21/0.4││
│ │ Elasto Poly   │A │ 94%│0.3%│▬ │ │ │ CC-QC-01    ████████████████████  103% ⚠₹0.31/0.3││
│ │ CoatTech      │B │ 79%│2.1%│▼ │ │ │ Committed but unspent  ₹1.24 Cr                 ││
│ │ Shah Alloys   │C │ 71%│4.8%│▼⚠│ │ └────────────────────────────────────────────────┘│
│ └───────────────────────────────┘ │ ┌─ Lead time analysis (days, promised vs actual) ─┐│
│ ┌─ Top vendors by spend (Pareto) ┐ │ │ SS coil      21 promised │ 24.3 actual  ▲3.3 ⚠ ││
│ │ Jindal      ████████████ 31%   │ │ │ Silicone     14 │ 13.1  ▼0.9                   ││
│ │ Viraj       ████████ 22%       │ │ │ Coating      10 │ 11.8  ▲1.8                   ││
│ │ Elasto      █████ 13%          │ │ │ Cartons       7 │  7.2  ▬                      ││
│ │ CoatTech    ███ 9%   ── 80% ─┤ │ │ │ Overall      15.4│ 17.1  ▲1.7                  ││
│ │ Others      ██████ 25%         │ │ └─────────────────────────────────────────────────┘│
│ └────────────────────────────────┘ │                                                    │
├────────────────────────────────────┴─────────────────────────────────────────────────────┤
│ ┌─ Exceptions this period ──────────────────┐ ┌─ Recent activity ────────────────────┐ │
│ │ 🔴 Emergency PO ratio      7.2% (max 5%)  │ │ 09:31 PO/…/00356 approved L1 R.Kannan│ │
│ │ 🔴 Aged rejections > 30 d  4 · ₹3.1 L     │ │ 09:18 GRN/…/00891 submitted K.Ravi   │ │
│ │ 🟡 Single-source awards    9 · ₹42.6 L    │ │ 08:56 CMP/…/0044 award submitted     │ │
│ │ 🟡 Price overrides used    3 · ₹18.2 L    │ │ 08:40 SQ/…/0234 received — Viraj     │ │
│ │ 🟡 Budget overrides        1 · ₹4.8 L     │ │ 08:22 RFQ/…/0087 reminder sent ×2    │ │
│ │ 🟢 Self-approvals          0              │ │ 08:05 INV/VP/8841 blocked — price    │ │
│ │ 🟡 Invoices blocked        6 · ₹31.4 L    │ │ 07:58 Supplier SUP/00119 submitted   │ │
│ │ 🟢 MSME breaches           0              │ │                        [ View all ▸ ]│ │
│ └───────────────────────────────────────────┘ └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.1.3 Widget catalogue

Each widget is registered with an id, a permission, a default role placement, a refresh class
and a drill-through target.

| # | Widget | Type | Permission | Drill-through |
|---|---|---|---|---|
| W-01 | Total PR (count, value, MoM) | Stat tile | `PR.VIEW` | PR list, period-filtered |
| W-02 | Pending PR approval (count, value, oldest) | Stat tile + alert | `PR.VIEW` | Approval inbox |
| W-03 | RFQ awaiting response (count, closing today) | Stat tile | `RFQ.VIEW` | RFQ list |
| W-04 | Quotations to review / expiring | Stat tile | `QUOTATION.VIEW` | Portal inbox |
| W-05 | Pending PO approval (count, value, oldest) | Stat tile + alert | `PO.VIEW` | Approval inbox |
| W-06 | Approved / released PO (count, value, MoM) | Stat tile | `PO.VIEW` | PO list |
| W-07 | Procurement funnel | Horizontal bar | `REPORT.VIEW` | Each stage → its list |
| W-08 | Cycle time panel | Table with trend arrows | `REPORT.VIEW` | Cycle-time report |
| W-09 | Monthly procurement cost & trend | Line/stacked area | `REPORT.VIEW_COST` | Purchase analysis |
| W-10 | Spend by category | Donut | `REPORT.VIEW_COST` | Purchase analysis by category |
| W-11 | Top vendors by spend (Pareto) | Bar + cumulative line | `REPORT.VIEW_COST` | Supplier spend analysis |
| W-12 | Supplier performance table | Table | `SUPPLIER.VIEW` | Supplier scorecard |
| W-13 | Supplier rating distribution (A/B/C/D) | Stacked bar | `SUPPLIER.VIEW` | Supplier list by grade |
| W-14 | Lead-time analysis (promised vs actual) | Grouped bar | `REPORT.VIEW` | Lead-time report |
| W-15 | Budget vs actual by cost centre | Progress bars | `REPORT.VIEW_COST` | Budget report |
| W-16 | Open order book (value, ageing) | Stat + bar | `PO.VIEW` | Open PO report |
| W-17 | Overdue deliveries (lines, value, worst) | Table + alert | `PO.VIEW` | Expediting workbench |
| W-18 | Receipts today / MTD | Stat tile | `GRN.VIEW` | GRN list |
| W-19 | Pending inspection (qty, value, oldest) | Stat tile + alert | `GRN.VIEW` | Pending inspection board |
| W-20 | Rejection rate trend | Line | `GRN.VIEW` | Rejection analysis |
| W-21 | Rejected material awaiting return (value, age) | Stat + alert | `RETURN.VIEW` | Rejected ageing report |
| W-22 | Invoices blocked (count, value, by exception type) | Stat + bar | `INVOICE.VIEW` | Match exception report |
| W-23 | GRIR ageing (RNI / IRN) | Bar | `INVOICE.VIEW` | GRIR reconciliation |
| W-24 | MSME payments due in 7 days | Stat + alert | `INVOICE.VIEW` | MSME compliance report |
| W-25 | Savings realised vs target | Gauge + trend | `REPORT.VIEW_COST` | Negotiation savings report |
| W-26 | Price variance vs contract / LPP | Bar by item | `REPORT.VIEW_COST` | Price variance report |
| W-27 | Spend under contract % | Gauge | `REPORT.VIEW_COST` | Contract utilisation |
| W-28 | Rate contract utilisation & expiry | Table + alert | `RATE_CONTRACT.VIEW` | Contract list |
| W-29 | Exceptions panel | Alert list | `REPORT.VIEW` | Each → its exception report |
| W-30 | Compliance-document expiry | Alert list | `SUPPLIER.VIEW` | Document expiry report |
| W-31 | Subcontract challan ageing | Stat + alert | `SUBCONTRACT.VIEW` | Reconciliation report |
| W-32 | Recent activity feed | Timeline | authenticated | The referenced document |
| W-33 | My action queue (personal) | Task list | authenticated | Each item |
| W-34 | Approver bottleneck (median TAT by approver) | Bar | `REPORT.VIEW` | Approver performance |
| W-35 | Single-source risk items | List + alert | `AVL.VIEW` | Single-source report |

**V3-DSH-BR-001 (M)** Cost and rate widgets (W-09, W-10, W-11, W-15, W-25, W-26, W-27) require
`PROCUREMENT.REPORT.VIEW_COST`. A storekeeper's dashboard shows quantities and dates, not
values (field-level security, Ch 10).

### 9.1.4 KPI definitions

Every KPI has one definition, computed one way, everywhere it appears.

| KPI | Formula | Period basis | Target |
|---|---|---|---|
| PR approval TAT | median(working hours from submit to final approval) | Documents finally approved in the period | ≤ 24 h |
| PR → PO cycle time | median(working days from PR final approval to PO release) | POs released in the period | ≤ 3 d |
| RFQ response rate | responded vendor-RFQs ÷ invited vendor-RFQs | RFQs closed in the period | ≥ 70% |
| Quotation turnaround | median(days from RFQ dispatch to quotation received) | Quotations received | ≤ 5 d |
| PO approval TAT | median(working hours submit → final approval) | POs approved | ≤ 48 h |
| PO acknowledgement % | POs acknowledged within N days ÷ POs released | POs released | ≥ 95% |
| Supplier OTIF | schedule lines received in full within (promised ± tolerance) ÷ lines due | Lines due in the period | ≥ 90% |
| Lead time actual | mean(GRN date − PO release date) by item category | GRNs in the period | vs promised |
| Incoming rejection rate | rejected qty ÷ received qty | GRN lines inspected | ≤ 1% |
| Purchase price variance | Σ((PO rate − reference rate) × qty) ÷ Σ(reference rate × qty); reference = contract → LPP | POs released | ≤ ±3% |
| Savings realised | Σ((pre-negotiation landed cost − awarded landed cost) × awarded qty) | Awards approved | vs annual target |
| Spend under contract | value ordered against contracts ÷ total ordered value | POs released | ≥ 70% direct material |
| Emergency PO ratio | emergency PO value ÷ total PO value | POs released | ≤ 5% |
| Single-source spend | value on items with one valid AVL entry ÷ total | POs released | trended |
| First-pass match rate | invoices auto-matched ÷ invoices received | Invoices received | ≥ 95% |
| GRIR ageing | open received-not-invoiced value by age bucket | As-of date | < 30 d |
| MSME compliance | MSME invoices paid within 45 d ÷ MSME invoices due | Invoices due | 100% |
| Cost of poor quality | (return value + debit notes + rework claims) ÷ purchase value | Period | ≤ 0.5% |
| Budget utilisation | (consumed + committed) ÷ budget by cost centre | Period to date | ≤ plan |
| Open order book | Σ(pending qty × rate) on released POs | As-of date | — |
| Approval bottleneck | median TAT per approver vs their SLA | Decisions in the period | ≤ SLA |

## 9.2 Reports

### 9.2.1 Standard capabilities (all reports)

Per Vol 0 §14.1, every report in this catalogue provides: parameterised filters with saved
filter sets, column chooser, grouping with subtotals, sorting, drill-through to the source
document, export to Excel/PDF/CSV, scheduling with e-mail delivery, and a print layout with the
company header, parameters used, generated-by and generated-at.

**V3-RPT-BR-001 (M)** Every report is tenant-scoped and data-scoped. A plant-scoped user running
the Purchase Order Register sees their plant only, and the report header states the scope
applied — so nobody mistakes a scoped total for a company total.

**V3-RPT-BR-002 (M)** Reports that expose rate, value or margin require
`PROCUREMENT.REPORT.VIEW_COST` in addition to `PROCUREMENT.REPORT.VIEW`.

**V3-RPT-BR-003 (M)** Long-running reports follow the background-job pattern (Vol 0 §8.8):
`202 Accepted` with a job uid, notification on completion, and a downloadable artefact retained
per the retention policy.

### 9.2.2 Group 1 — Requisition & sourcing

| # | Report | Key columns | Key filters |
|---|---|---|---|
| R-01 | **Purchase Requisition Register** | PR no., date, revision, dept, requester, cost centre, urgency, source, item, qty, UOM, need-by, est. rate/value, status, approver, approval date, ordered qty, PO refs, ageing | Date range, plant, dept, cost centre, status, urgency, source, item, requester |
| R-02 | **Pending PR** | PR no., date, requester, value, current level, current approver, days pending, SLA status, ageing bucket | Approver, level, dept, age bucket, overdue only |
| R-03 | **PR Ageing & Unsourced** | PR no., approval date, days since approval, item, qty, need-by, days to need date, sourcing decision, buyer | Buyer, days unsourced, need-date risk |
| R-04 | **PR → PO Conversion & Cycle Time** | PR no., approval date, PO no., release date, working days, category, buyer, sourcing route | Period, category, buyer, route |
| R-05 | **Emergency PR/PO Exception** | Doc no., date, requester, value, reason code, justification, approver, whether written quote existed | Period, dept, requester, reason |
| R-06 | **Department-wise Requisition Analysis** | Dept, count, value, % of total, avg approval TAT, rejection %, emergency % | Period, plant |
| R-07 | **PR vs Budget** | Cost centre, account, budget, consumed, committed, requisitioned, available, % utilised, breaches | Period, cost centre, plant |
| R-08 | **Rejected/Returned PR Analysis** | Reason code, count, value, dept, requester, approver, top free-text themes | Period, reason, dept |

### 9.2.3 Group 2 — RFQ & quotations

| # | Report | Key columns | Key filters |
|---|---|---|---|
| R-09 | **RFQ Register** | RFQ no., date, revision, title, type, buyer, items, est. value, vendors invited, responded, due date, status, award ref, cycle days | Period, buyer, type, status, category |
| R-10 | **RFQ Response Analysis** | Vendor, RFQs invited, responded, regretted, no response, response %, avg turnaround days, win count, win % | Period, vendor, category |
| R-11 | **Quotation Register** | Quote no., date, vendor, RFQ ref, item, qty, rate, landed rate, validity, status, award result | Period, vendor, item, status |
| R-12 | **Quotation Comparison Report** | Full comparative statement per comparison: requirement, vendors, normalised landed cost, criterion scores, recommendation, selection, deviation reason, savings, approver chain | Comparison, period, buyer |
| R-13 | **Price History / Rate Trend** | Item, vendor, date, source doc, rate, landed rate, qty, % change vs previous, index value | Item, vendor, period |
| R-14 | **Negotiation Savings** | Comparison, item, vendor, rounds, initial landed cost, final landed cost, saving ₹ and %, buyer | Period, buyer, category |
| R-15 | **Single-vendor / Short-vendor Exception** | RFQ/PO, value, reason code, justification, approver | Period, reason |
| R-16 | **Quotation Validity Expiry** | Quote no., vendor, item, valid until, days left, in-comparison flag | Days-to-expiry |

### 9.2.4 Group 3 — Purchase order

| # | Report | Key columns | Key filters |
|---|---|---|---|
| R-17 | **Purchase Order Register** | PO no., date, revision, type, supplier, item, qty, UOM, rate, taxable, tax, total, delivery date, status, buyer, PR/comparison refs, approval date | Period, supplier, item, type, status, buyer, plant, value band |
| R-18 | **Pending PO Approval** | PO no., value, supplier, current level, approver, days pending, SLA, blocking exceptions | Approver, level, age |
| R-19 | **Open PO / Order Book** | PO no., line, item, ordered, received, pending qty and value, promised date, days overdue, supplier, ageing bucket | Supplier, item, plant, overdue only, ageing |
| R-20 | **Overdue Delivery / Expediting** | PO line, item, pending qty, promised date, days late, supplier, last follow-up, acknowledgement status, production impact | Days late, supplier, buyer, criticality |
| R-21 | **PO Amendment Register** | PO no., revision, date, changed fields, old vs new, value delta, reason, approver | Period, supplier, change type |
| R-22 | **PO Cancellation & Short-close** | Doc, date, value cancelled/closed, reason code, approver, PR impact | Period, reason |
| R-23 | **Rate Contract Utilisation** | Contract, supplier, item, validity, committed qty/value, consumed, balance, % used, run rate, projected at expiry, price basis, current derived rate | Supplier, item, expiry window |
| R-24 | **Contract vs Spot Analysis** | Item, contract value, spot value, % under contract, price differential, missed-saving estimate | Period, category |
| R-25 | **Item Purchase History** | Item, date, PO, supplier, qty, rate, landed rate, GRN, accepted, rejected, invoice, paid rate | Item, period, supplier |
| R-26 | **Purchase Analysis** | By category / item / supplier / plant / cost centre / month: qty, value, % of total, YoY and MoM change | Any dimension, period |
| R-27 | **Cost Analysis / Landed Cost** | Item, basic, discount, freight, packing, duty, other, non-creditable tax, landed cost, % components, vs standard cost | Item, period, supplier |
| R-28 | **Price Variance** | Item, PO rate, contract rate, LPP, standard cost, variance ₹ and %, justification, approver | Item, period, variance threshold |
| R-29 | **Purchase Commitment vs Budget** | Cost centre, budget, committed (open PO), consumed (invoiced), available, forecast breach | Period, cost centre |
| R-30 | **Split-PO / Limit Exception** | Supplier, item, window, POs aggregated, combined value, approval band applied vs band implied | Period, supplier |
| R-31 | **Subcontract Challan Ageing & Reconciliation** | Challan, PO, item, issued, returned, balance, days out, statutory due date, loss actual vs permitted | Supplier, days out, overdue only |
| R-32 | **Import PO Tracking** | PO, supplier, Incoterm, currency, FC value, INR value, ETD, ETA, BOE, duty, landed cost, status | Period, supplier, status |

### 9.2.5 Group 4 — Receipt, quality & return

| # | Report | Key columns | Key filters |
|---|---|---|---|
| R-33 | **GRN Register** | GRN no., date, supplier, PO, item, received, accepted, rejected, pending inspection, batch/heat, store/bin, invoice ref, value | Period, supplier, item, plant, store |
| R-34 | **Gate Entry Register & Pending Inward** | Gate pass, date/time in, vehicle, supplier, PO, declared qty, GRN made?, hours pending, exit time | Date, pending only, without-PO only |
| R-35 | **Receipt vs PO (fulfilment)** | PO line, ordered, received, accepted, short, excess, % fulfilled, on-time flag | Supplier, period, item |
| R-36 | **Pending Inspection Ageing** | GRN, item, batch, qty, value, days in quarantine, inspection type, assigned inspector | Age bucket, plant, item |
| R-37 | **Rejection Analysis** | Supplier, item, defect code, rejected qty, value, % of received, trend vs previous period | Supplier, item, defect, period |
| R-38 | **Batch / Heat Traceability** | Forward: heat → GRN → issue → production order → FG batch → carton → invoice → customer. Backward: any of those → heat, with MTC | Batch, heat, item, doc no. |
| R-39 | **MTC / Test Certificate Compliance** | GRN line, item, batch, certificate present?, number, date, verified by | Period, supplier, missing only |
| R-40 | **Over/Short Receipt Exception** | GRN line, ordered, received, variance %, tolerance, disposition, authoriser | Period, supplier, type |
| R-41 | **Supplier OTIF & Delivery Performance** | Supplier, lines due, on-time, in-full, OTIF %, avg days early/late, trend | Period, supplier, category |
| R-42 | **Purchase Return Register** | Return no., date, supplier, GRN, item, batch, qty, value, reason, disposition, debit note, e-way bill, dispatched date | Period, supplier, reason |
| R-43 | **Rejected Material Ageing** | GRN, item, batch, rejected qty, value, rejection date, days aged, disposition status, blocking flag | Age bucket, supplier |
| R-44 | **Debit Note Register** | DN no., date, supplier, type, source doc, taxable, tax, total, status, acknowledged, adjusted against | Period, supplier, type |
| R-45 | **Replacement Pending** | Return, supplier, item, qty due, expected date, days overdue, replacement GRN | Supplier, overdue only |
| R-46 | **Cost of Poor Quality** | Supplier, returns value, debit notes, rework/sorting cost, LD recovered, total CoPQ, % of purchase value | Period, supplier, category |

### 9.2.6 Group 5 — Invoice & finance interface

| # | Report | Key columns | Key filters |
|---|---|---|---|
| R-47 | **Supplier Invoice Register** | Invoice no., date, supplier, IRN, PO, GRN, taxable, tax breakup, total, TDS/TCS, status, due date, posted date | Period, supplier, status |
| R-48 | **Match Exception Analysis** | Exception type, count, value, supplier, avg days to resolve, resolution taken, approver | Period, type, supplier |
| R-49 | **GRIR Ageing** | Supplier, PO, GRN, received-not-invoiced value, invoiced-not-received value, age bucket, disposition | As-of date, supplier, age |
| R-50 | **TDS / TCS Applicability** | Supplier, PAN, YTD purchases, threshold crossed on, section applied, rate, amount deducted/collected | FY, supplier |
| R-51 | **MSME Payment Compliance** | Supplier, Udyam, invoice, acceptance date, due date (45 d cap), paid date, days taken, breach flag, exposure | Period, breach only |
| R-52 | **Purchase Register for GSTR-2B Reconciliation** | Invoice, supplier GSTIN, IRN, taxable, CGST/SGST/IGST/cess, ITC eligible, 2B match status, mismatch reason | Tax period, match status |
| R-53 | **Advance & Milestone Payment Status** | PO, supplier, milestone, due trigger, amount, paid, balance, adjusted against invoices | Supplier, PO, open only |

### 9.2.7 Group 6 — Supplier, approval & governance

| # | Report | Key columns | Key filters |
|---|---|---|---|
| R-54 | **Supplier Master Register** | Code, name, category, criticality, status, GSTIN, MSME, terms, buyer, since, last transaction | Status, category, buyer |
| R-55 | **Supplier Qualification Status** | Supplier, stage, checklist score, audit date, auditor, pending level, days in stage | Stage, category |
| R-56 | **Approved Vendor List** | Item, supplier, rank, valid to, lead time, MOQ, last rate, inspection requirement, single-source flag | Item, supplier, expiring |
| R-57 | **Compliance Document Expiry** | Supplier, document type, number, expiry, days left, mandatory?, blocking effect | Days to expiry, mandatory only |
| R-58 | **Supplier Performance Scorecard** | Supplier, period, quality, delivery, price, responsiveness, compliance, overall, grade, trend, drill list | Period, supplier, grade |
| R-59 | **Supplier Spend Analysis (Pareto)** | Supplier, value, % of total, cumulative %, category mix, orders, avg order value, YoY | Period, category |
| R-60 | **New vs Existing Supplier Spend** | Period, new suppliers, first-order value, share of spend, retention | Period |
| R-61 | **Single-source Risk** | Item, supplier, spend, alternatives available, since when single-source, criticality, mitigation status | Criticality, category |
| R-62 | **Blacklist & Hold Register** | Supplier, action, date, reason, approver, open exposure at the time, reinstated? | Period, action |
| R-63 | **Approval History** | Document, level, approver, action, date, TAT, comment, reason code, revision approved, channel | Document, approver, period |
| R-64 | **Approval Ageing & Approver Performance** | Approver, pending count/value, median TAT, % within SLA, % overdue, escalations | Period, approver, doc type |
| R-65 | **Override & Exception Register** | Type (budget, price, tolerance, self-approval, auto-approval, without-PO, comparison-exempt), document, value, reason, requester, approver | Period, type |
| R-66 | **Audit Trail Extract** | Entity, document, action, user, timestamp, IP, old value, new value, reason, correlation id | Entity, user, period |

### 9.2.8 Scheduled report packs (seeded)

| Pack | Contents | Recipients | Schedule |
|---|---|---|---|
| Daily buyer pack | R-02, R-03, R-16, R-20, R-48 | Buyers | 08:00 daily |
| Daily stores pack | R-34 (pending inward), R-36, R-43 | Store Head | 08:00 daily |
| Weekly management pack | R-19, R-23, R-41, R-58, R-64 | Purchase Head, Factory Head | Monday 09:00 |
| Monthly governance pack | R-05, R-15, R-30, R-51, R-62, R-65 | Director, Auditor, CFO | 1st working day |
| Monthly performance pack | R-26, R-28, R-14, R-46, R-59 | Purchase Head, CFO | 1st working day |
| Month-end close pack | R-49, R-50, R-52, R-53 | Finance Manager, Accounts | Last working day |

## 9.3 Mobile dashboard

Ch 13 §13.4 specifies the mobile app scope. The mobile dashboard carries only: my approvals
(with the decision context and approve/reject/send-back), overdue deliveries, pending
inspection, and blocked invoices — plus the exception panel for managers. Analytical charts are
web-only.

## 9.4 Acceptance criteria (extract)

- Every widget's number equals the row count or sum of its drill-through list, for the same
  filters, verified by an automated test per widget.
- A plant-scoped user and a company-scoped user open the same dashboard and get different,
  correctly scoped numbers from the same widget definitions.
- A user without `REPORT.VIEW_COST` sees the funnel, cycle-time and OTIF widgets and does not
  see spend, price-variance or savings widgets — verified at the API level.
- The Purchase Order Register exported to Excel contains exactly the columns and rows shown on
  screen, including applied filters recorded in the header.
- The batch/heat traceability report resolves a dispatched carton to its SS heat number in under
  2 minutes, self-service (Vol 0 SC-4).
- A report exceeding the interactive threshold returns `202` with a job uid and notifies on
  completion.
- Scheduled packs deliver to the configured recipients with the report attached and the
  parameters stated.

---

**Next:** [Chapter 10 — Permissions & Roles](10-permissions-and-roles.md)
