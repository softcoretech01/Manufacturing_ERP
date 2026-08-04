# Volume 3 · Chapter 5 — Quotation Comparison & Vendor Selection

**Area code:** `CMP`

---

## 5.1 Purpose

The comparison is where procurement earns or loses its money, and where an auditor will look
first. Its purpose is not to display three quotations side by side — a spreadsheet does that.
Its purpose is to make quotations **genuinely comparable** and then to make the award decision
**explicit, scored and defensible**.

Three failures this screen exists to prevent:

1. **Comparing incomparable numbers.** ₹243.50 ex-works with freight extra and 30-day credit is
   not cheaper than ₹248.00 delivered with 60-day credit. Comparison MUST be on landed cost
   adjusted for the cost of money.
2. **Price-only awards.** The cheapest coil from a vendor with a 4.8% rejection rate is the most
   expensive coil. Quality, delivery and capacity carry weight, declared in advance.
3. **Undocumented deviation.** Awarding to the second-lowest is often correct — and is only
   defensible if the reason was recorded at the time, not reconstructed afterwards.

**V3-CMP-FR-001 (M)** Every award MUST be traceable to a stored comparison containing the exact
quotation revisions evaluated, the normalisation applied, the criteria and weights in force, the
computed scores, the system recommendation, the actual selection, and — when they differ — a
mandatory deviation justification.

## 5.2 Comparison object model

```
   COMPARISON (header)
   ├── scope: RFQ (one or more) · item set · required quantity per line
   ├── criteria set + weights snapshot   ← copied in, not referenced, so later
   │                                        master changes cannot rewrite history
   ├── participating quotations (vendor × quotation revision, frozen)
   ├── per-line, per-vendor:
   │      normalised landed unit cost · criterion scores · weighted score · rank
   ├── recommendation (system) : vendor(s) + quantity split + rationale
   ├── selection (buyer)       : vendor(s) + quantity split + deviation reason if ≠ recommendation
   ├── negotiation rounds      : requests issued, responses, savings achieved
   └── approval instance       : workflow, decisions, comments
```

**V3-CMP-BR-001 (M)** The criteria, weights and quotation revisions are **snapshotted** into the
comparison at creation. Re-opening a comparison from 2024 must show the 2024 weights and the
2024 rates, not today's.

## 5.3 Normalisation — landed cost

**V3-CMP-FR-002 (M)** Before any scoring, every quotation line is normalised to a comparable
**landed unit cost in company base currency per stocking UOM**:

```
  Step  Component                                          Notes
  ────  ─────────────────────────────────────────────────  ──────────────────────────────
   1    basic_rate × quantity                              at the applicable price-break slab
                                                            for the CONSOLIDATED quantity
   2    − discount (line + apportioned header discount)
   3    + freight (as quoted, or estimated from the        apportioned by the quoted basis
        freight master when the vendor quotes "extra")      (value / weight / quantity)
   4    + packing, forwarding, loading, insurance
   5    + inspection / testing charges
   6    + import components: customs duty, SWS, port,      landed-cost master rates by HSN
        CHA, ocean/air freight, insurance                   where the vendor has not quoted
   7    + non-creditable tax only                          creditable GST is EXCLUDED — it is
                                                            not a cost. Blocked credit
                                                            (Sec 17(5)) and unregistered/RCM
                                                            non-creditable portions ARE costs
   8    + cost of money adjustment                          (company cost of capital %)
        = value × cost_of_capital% × (credit_days_offered − benchmark_credit_days) / 365
        − early-payment discount benefit if the company's policy is to take it
   9    + inventory carrying cost of MOQ excess             where MOQ forces over-buying:
        = (MOQ − requirement) × rate × carrying% × months    configurable, default on
  10    + quality cost adjustment                           = expected reject % (from the
                                                            vendor's 12-month history) ×
                                                            value × rework/return cost factor
  11    ÷ quantity in the stocking UOM                      dual-UOM conversion applied here
        ─────────────────────────────────────────────────
        = LANDED UNIT COST  (the number that is compared)
```

**V3-CMP-BR-002 (M)** Creditable GST MUST NOT be included in landed cost. Including recoverable
tax in a comparison biases the result toward unregistered and composition vendors and is a
straightforward error.

**V3-CMP-BR-003 (M)** Every adjustment in steps 3–10 MUST be individually visible and
switchable in the breakdown drawer (`S-CMP-02`). A buyer must be able to see basic rate,
landed cost, and every step between, and to turn off an adjustment for a what-if with the
change recorded. A black-box number will not be trusted and will be re-done in Excel.

## 5.4 Scoring and the recommendation engine

### 5.4.1 Criteria

| Criterion | Source of the value | Direction | Default scoring |
|---|---|---|---|
| **Landed cost** | §5.3 | Lower better | `100 × (min_cost ÷ this_cost)` |
| **Delivery / lead time** | Quotation lead time vs required-by | Lower better | 100 if it meets the need date, then linear decay; 0 if infeasible |
| **Quality rating** | Supplier rating quality component (Ch 1 §1.4) | Higher better | Direct 0–100 |
| **Vendor overall rating** | Supplier composite rating | Higher better | Direct 0–100 |
| **On-time delivery history** | OTIF % last 12 months | Higher better | Direct |
| **Payment terms** | Structured credit days vs benchmark | Higher better | Normalised across the offers |
| **Warranty** | Months offered vs requested | Higher better | Ratio, capped at 100 |
| **Freight terms** | Delivered vs ex-works, already in cost; scored for risk | Higher better | Delivered scores higher |
| **Past purchase history** | Value transacted, on-time record, dispute count | Higher better | Normalised |
| **Capacity / capability** | Declared capacity vs required quantity | Higher better | Sufficient = 100, partial = ratio |
| **Compliance & certification** | Mandatory documents, food-grade, ISO validity | Pass/score | Missing mandatory = disqualified |
| **Specification compliance** | Deviation register disposition | Pass/score | Unaccepted deviation = disqualified |
| **Preferred / AVL rank** | AVL rank | Higher better | Rank 1 = 100, decaying |
| **Sample / technical evaluation** | Sample QC result, technical score (two-envelope) | Higher better | Direct |
| **Geographic / logistics risk** | Distance, single-port dependence, transit days | Lower better | Configurable |

**V3-CMP-FR-003 (M)** The criteria set, their weights, their scoring functions and their
applicability are **master data** (`S-CMP-03` / `S-SET-02`), maintained per item category and
per procurement type, versioned and effective-dated, with the seeded defaults from README §1.4.

**V3-CMP-BR-004 (M)** Weights MUST sum to 100 within a criteria set; the editor blocks saving
otherwise and shows the running total.

### 5.4.2 Disqualification before scoring

**V3-CMP-FR-004 (M)** A quotation is **disqualified** — excluded from scoring, shown with the
reason, never silently dropped — when any of the following holds:

| Disqualifier | Overridable |
|---|---|
| Vendor is on hold or blacklisted | No |
| Vendor's mandatory compliance document is expired | No |
| Vendor is not AVL-qualified for the item | Yes, with Purchase Head approval and a qualification action |
| Quotation validity has expired | Yes, by obtaining a revalidation revision |
| Unaddressed specification deviation | Yes, by dispositioning the deviation |
| Quoted quantity < the configured minimum acceptable share | Yes, into a split-award evaluation |
| Lead time makes the need date impossible | Yes, with the requester's acceptance of a revised date |
| Required sample failed or is pending | Yes, with QC Head approval |
| Late submission on a `BLOCK` RFQ | No |

### 5.4.3 Recommendation

**V3-CMP-FR-005 (M)** The engine produces, per line and for the comparison as a whole:

- the **ranked list** of qualified vendors with total weighted score,
- the **recommended award** — single vendor, or a split with quantities,
- a **rationale in words**, generated from the scoring, e.g. *"Viraj Profiles recommended:
  landed cost 1.4% above lowest, offset by quality score 91 vs 74 and OTIF 91% vs 78%. Expected
  quality-cost differential ₹38,200 exceeds the price differential of ₹31,900."*
- **savings** against the reference (target price, last purchase price, or highest quote),
- the **risk notes** — single source, capacity shortfall, first-time vendor, price above the
  index movement, unusually low bid (see below).

| Ref | Pri | Requirement |
|---|---|---|
| **V3-CMP-FR-006** | M | **Split-award proposal**: where no single vendor can meet the quantity, or where risk policy requires dual sourcing, the engine proposes a split honouring MOQ, order multiples, capacity limits, price-break slabs and any configured maximum share per vendor (default 70% for critical items). |
| **V3-CMP-FR-007** | M | **Abnormally low bid detection**: a quote more than a configurable percentage (default 15%) below the next lowest and below the should-cost is flagged for verification before award — in steel this usually means a different grade, a different thickness tolerance, or scrap-origin material. |
| **V3-CMP-FR-008** | M | **Price-reasonableness check** against the last purchase price, the rate contract, the should-cost and, where configured, an external index. Variance beyond a threshold requires a justification recorded on the comparison. |
| **V3-CMP-FR-009** | S | **What-if simulation**: change weights, exclude a vendor, change the quantity, or turn an adjustment off, and see the ranking recompute live. What-ifs are not saved unless explicitly kept, and a saved what-if records who created it. |
| **V3-CMP-FR-010** | S | Multi-line optimisation: award by line to the best per line, or award the whole basket to one vendor where basket discounts or freight economics make that better. Both options are computed and the difference is shown in money. |

**V3-CMP-BR-005 (M)** The recommendation is advisory. The system MUST NOT auto-award. A human
selects, and where the selection differs from the recommendation on price, quality or vendor, a
deviation reason code plus free-text justification is mandatory and is carried into the approval
decision context.

## 5.5 Comparison lifecycle

```
  ┌────────┐  add quotations, normalise, score
  │ DRAFT  │
  └───┬────┘
      │ buyer selects vendor(s)
      ▼
  ┌────────────┐  negotiation round(s) → quotations revised → comparison RECOMPUTED
  │ EVALUATED  │◄──────────────────────────────────────────────────────────────┐
  └───┬────────┘                                                               │
      │ submit for award approval                                              │
      ▼                                                                        │
  ┌──────────────────┐  return for correction ───────────────────────────────►─┘
  │ PENDING_APPROVAL │
  └───┬──────────┬───┘
      │ approve  │ reject
      ▼          ▼
  ┌────────┐  ┌──────────┐
  │AWARDED │  │ REJECTED │──► re-negotiate, re-RFQ, or close no-award
  └───┬────┘  └──────────┘
      │ PO / rate contract created
      ▼
  ┌──────────┐
  │ CONVERTED│
  └──────────┘
      Any state before AWARDED ── cancel with reason ──► CANCELLED
```

**V3-CMP-BR-006 (M)** Once a comparison is `AWARDED`, its snapshot is immutable. A later
quotation revision does not alter it; changing the award requires cancelling the comparison
(with reason) and creating a new one, or amending the resulting PO through its own workflow.

**V3-CMP-BR-007 (M)** A comparison MUST be mandatory before PO creation when the PO value
exceeds a configurable threshold (default ₹1,00,000) **unless** the PO is a rate-contract
call-off, a repeat order within a configurable window at or below the last rate, or an
emergency purchase with a recorded justification. The exemption used is recorded on the PO.

## 5.6 Negotiation

| Ref | Pri | Requirement |
|---|---|---|
| **V3-CMP-FR-011** | M | From the comparison, the buyer may issue a **negotiation request** to one or more vendors: target rate or target reduction, revised terms sought, response due date, and a note. Competitors' prices are never disclosed. |
| **V3-CMP-FR-012** | M | Each negotiation **round** is numbered and tracked; responses arrive as quotation revisions (Ch 4 §4.4.3) and the comparison recomputes, retaining every round for the savings report. |
| **V3-CMP-FR-013** | M | Savings are computed and stored per round: `(previous landed cost − revised landed cost) × awarded quantity`, and rolled up to a period savings report. This is the primary evidence of the procurement function's value. |
| **V3-CMP-FR-014** | S | Round-robin / best-and-final-offer (BAFO) mode: a single simultaneous request to all qualified vendors with a common deadline, after which no further rounds are permitted for that comparison. |

## 5.7 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V3-CMP-BR-008** | M | Only `RECEIVED` / `UNDER_COMPARISON`, non-superseded, non-expired quotations against the same RFQ revision may participate. Mixing quotations against different RFQ revisions is blocked. |
| **V3-CMP-BR-009** | M | Minimum comparable quotations for the value band is configurable (default 3 above ₹1,00,000). Comparing fewer requires a reason code, which is carried into the approval context and reported monthly. |
| **V3-CMP-BR-010** | M | The comparison creator MUST NOT approve the award (SoD, Vol 0 §4.2). |
| **V3-CMP-BR-011** | M | Awarding to other than the lowest **landed cost** requires a deviation reason code (`QUALITY`, `DELIVERY`, `CAPACITY`, `SPECIFICATION`, `CUSTOMER_NOMINATED`, `RISK_DIVERSIFICATION`, `PAYMENT_TERMS`, `OTHER`) plus free text. Awarding to other than the highest **score** likewise. |
| **V3-CMP-BR-012** | M | The awarded quantity per vendor MUST NOT exceed that vendor's quoted quantity, declared capacity, or configured maximum share; and MUST respect their MOQ and order multiple. |
| **V3-CMP-BR-013** | M | Total awarded quantity per line MUST equal the required quantity, unless the buyer explicitly records a partial award with a reason and the residue is returned to the PR as unordered. |
| **V3-CMP-BR-014** | M | The comparison statement (`S-CMP-07`) is generated as a PDF at the moment of approval submission and is attached immutably to the approval, so approvers and auditors see exactly what was approved. |
| **V3-CMP-BR-015** | M | Rate visibility on the comparison follows `PROCUREMENT.QUOTATION.VIEW_RATES`; a technical evaluator invited to score specification compliance sees the technical columns and no prices. |
| **V3-CMP-BR-016** | S | For critical items, awarding 100% to a single vendor when an alternative qualified vendor quoted acceptably raises a risk-concentration warning that must be acknowledged. |

## 5.8 Validations

| # | Validation | Trigger | Severity |
|---|---|---|---|
| 1 | ≥ 1 qualified quotation | Create | Error |
| 2 | Minimum comparable quotations for the band | Submit for approval | Warning + reason code |
| 3 | All quotations against the same RFQ revision | Add quotation | Error |
| 4 | No expired / superseded quotation included | Recompute | Error, with the offending quotation named |
| 5 | Weights sum to 100 | Save criteria set | Error |
| 6 | Every disqualification has a stated reason | Recompute | System-generated, non-empty |
| 7 | Awarded quantity ≤ quoted quantity, capacity, max share | Select | Error |
| 8 | Awarded quantity respects MOQ and order multiple | Select | Error (with the compliant quantity offered) |
| 9 | Σ awarded quantity = required quantity, or partial-award reason given | Submit | Error |
| 10 | Deviation reason present when selection ≠ recommendation | Submit | Error |
| 11 | Price variance beyond threshold has a justification | Submit | Error |
| 12 | Abnormally low bid acknowledged | Submit | Error |
| 13 | Unaddressed specification deviations on the selected vendor | Submit | Error |
| 14 | Creator ≠ approver | Submit | Error (workflow escalates) |
| 15 | Comparison statement PDF generated and attached | Submit | Error |

## 5.9 Screens

### S-CMP-01 · Comparison Workbench

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Comparison CMP/25-26/0044 — SS304 coil Aug 2026 · RFQ/25-26/0087 R1     ⚑ EVALUATED         │
│ Criteria set: Strategic RM v3 (Price 40 · Quality 25 · Delivery 20 · Capacity 15)           │
│         [Weights] [What-if] [Negotiate] [Split award] [Statement PDF] [Submit for approval]  │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Line 1 · SS304 Coil 0.5×400 2B · required 11,500 KG by 22-Aug-2026                          │
├──────────────────────┬───────────────┬───────────────┬───────────────┬──────────────────────┤
│                      │ Jindal        │ Viraj         │ Shah Alloys   │ Metal Source Intl    │
│                      │ Stainless     │ Profiles      │               │                      │
├──────────────────────┼───────────────┼───────────────┼───────────────┼──────────────────────┤
│ Basic rate /KG       │      243.50   │      248.00   │      241.00   │      256.00          │
│ Discount             │       1.0%    │       0.5%    │         —     │       2.0%           │
│ Freight              │ Extra 42,000  │ Included      │ Extra 55,000  │ Included             │
│ Packing / loading    │      6,000    │      —        │      8,000    │      —               │
│ Tax (creditable)     │ 18% IGST      │ 18% CGST+SGST │ 18% IGST      │ 18% IGST             │
│ Credit days          │        30     │        45     │        15     │        60            │
│ Cost of money adj.   │       +0.00   │     −1,860    │     +1,240    │     −3,720           │
│ Expected quality cost│      +9,800   │     +4,200    │    +28,600    │     +2,100           │
│ MOQ excess carry     │          —    │        —      │        —      │      +6,400          │
│ ─────────────────────┼───────────────┼───────────────┼───────────────┼──────────────────────┤
│ ⬤ LANDED COST /KG    │    248.62 (2) │    248.10 (1) │   252.44 (4)  │    251.06 (3)        │
│ Extended landed      │  28,59,130    │  28,53,150    │  29,03,060    │  28,87,190           │
├──────────────────────┼───────────────┼───────────────┼───────────────┼──────────────────────┤
│ Lead time            │  21 d ✔       │  24 d ✔       │  18 d ✔       │  35 d ✖ misses date  │
│ Quality rating       │  92           │  91           │  74           │  96                  │
│ OTIF (12 m)          │  86%          │  91%          │  78%          │  94%                 │
│ Vendor grade         │  A (87)       │  B (83)       │  B (71)       │  A (89)              │
│ Capacity vs required │  ✔ 3×         │  ✔ 2×         │  ✔ 1.4×       │  ✔ 4×                │
│ Compliance           │  ⚠ ISO 22 d   │  ✔            │  ✔            │  ✔                   │
│ Spec deviation       │  none         │  1 accepted   │  none         │  none                │
├──────────────────────┼───────────────┼───────────────┼───────────────┼──────────────────────┤
│ Price score (40)     │  39.9         │  40.0         │  39.3         │  39.5                │
│ Quality score (25)   │  23.0         │  22.8         │  18.5         │  24.0                │
│ Delivery score (20)  │  18.4         │  19.2         │  16.8         │   0.0  disqualified  │
│ Capacity score (15)  │  15.0         │  13.5         │  10.5         │  15.0                │
│ ⬤ TOTAL SCORE        │  96.3  (2)    │  95.5  (3)    │  85.1  (4)    │  — DISQUALIFIED      │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🏆 RECOMMENDATION — split award                                                              │
│    Viraj Profiles   7,000 KG  (lowest landed cost, OTIF 91%, price break honoured)          │
│    Jindal Stainless 4,500 KG  (dual-source policy for critical items; highest quality score) │
│    Rationale: single-sourcing 11,500 KG to Viraj saves ₹2,690 (0.09%) but concentrates a     │
│    critical grade on one vendor with 2× capacity headroom. Splitting keeps both qualified.   │
│    Savings vs highest quote ₹49,910 · vs last purchase price (₹245.00) −1.3% (price rising). │
│    ⚠ Jindal ISO 9001 expires in 22 days — obtain renewal before the first delivery.          │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ SELECTION        (•) Accept recommendation   ( ) Choose different                            │
│ Deviation reason [                                              ] (required if different)    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-CMP-02 · Landed-cost Breakdown drawer

```
┌────────────────────────────────────────────────────────────┐
│ Viraj Profiles · Line 1 · 11,500 KG          [x] Show steps │
├────────────────────────────────────────────────────────────┤
│ 1  Basic  248.00 × 11,500              28,52,000            │
│    slab applied: >10,000 KG → 248.00                        │
│ 2  Discount 0.5%                          −14,260           │
│ 3  Freight (included in rate)                    0          │
│ 4  Packing / loading                             0          │
│ 5  Inspection                                    0          │
│ 6  Import components                       n/a              │
│ 7  Non-creditable tax                            0          │
│    (CGST+SGST 18% = ₹5,12,773 fully creditable — excluded)  │
│ 8  Cost of money: 45 d vs benchmark 30 d   −1,860           │
│    (₹28.4 L × 9% × 15 ÷ 365)                                │
│ 9  MOQ excess carrying                           0          │
│ 10 Quality cost: reject 0.9% × ₹28.4 L × 0.165  +4,200      │
│ ─────────────────────────────────────────────────────────── │
│    LANDED  28,53,150  ÷ 11,500 KG  =  ₹248.10 /KG           │
│    [ Toggle step 8 off ] [ Toggle step 10 off ] [ Reset ]   │
└────────────────────────────────────────────────────────────┘
```

### S-CMP-05 · Split Award Allocator

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Split award — Line 1 · required 11,500 KG                                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Vendor          │ Quoted │ Capacity│ MOQ   │ Multiple │ Award qty │ Rate at qty │ Value │
│ Viraj Profiles  │ 11,500 │ 23,000  │ 3,000 │ 500      │ [ 7,000 ] │ 248.00      │17.36 L│
│ Jindal Stainless│ 11,500 │ 34,500  │ 5,000 │ 500      │ [ 4,500 ] │ 245.00 ⚠    │11.03 L│
│                 │        │         │       │          │           │ slab 5,001– │       │
│                 │        │         │       │          │           │ 10,000 → up │       │
│                 │        │         │       │          │           │ from 243.50 │       │
│ Shah Alloys     │ 11,500 │ 16,000  │ 2,000 │ 100      │ [     0 ] │      —      │   —   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Allocated 11,500 / 11,500 ✔   Max share policy 70% ✔ (Viraj 61%)                        │
│ ⚠ Splitting loses Jindal's >10,000 KG slab: +₹6,750 vs single-sourcing to Jindal        │
│ Blended landed cost ₹248.44/KG vs best single-source ₹248.10/KG (+₹3,910 total)         │
│                                              [ Auto-optimise ] [ Apply ] [ Cancel ]     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Notes |
|---|---|
| S-CMP-03 Scoring & Weighting Configuration | Criteria library, per-category weight sets, scoring function per criterion, effective dates, running weight total, simulator against a past comparison. |
| S-CMP-04 Recommendation Panel | Embedded; rationale text, savings, risk notes, accept/override. |
| S-CMP-06 Negotiation Round Manager | Rounds, targets sent, responses, per-round savings, BAFO deadline. |
| S-CMP-07 Comparison Statement | Print-ready approval pack: requirement, vendors invited vs responded, normalised comparison table, scores, recommendation, selection, deviation reason, signatures block. |
| S-CMP-08 Saved Comparisons | List with status, value, award result, savings, approval state. |

## 5.10 Approval — vendor selection

| Condition | Levels |
|---|---|
| Value ≤ ₹1,00,000 and lowest landed cost selected | Auto-approved, logged, appears on the auto-approval report |
| ₹1,00,001 – ₹10,00,000, lowest selected | L1 Purchase Manager |
| Any value, **not** lowest landed cost selected | L1 Purchase Manager → L2 Factory Manager |
| > ₹10,00,000 | L1 Purchase Manager → L2 Factory Manager → L3 Finance → L4 Director |
| Fewer than the minimum comparable quotations | +1 level (Purchase Head) regardless of value |
| Single-source / proprietary | L1 Purchase Head → L2 Factory Manager |
| Rate contract award (annual volume) | L1 Purchase Head → L2 Finance → L3 Director |
| Capital equipment | Technical evaluation (parallel) + L1 Purchase Head → L2 Finance → L3 Director |

**V3-CMP-BR-017 (M)** The approval decision context MUST show: the comparison statement, the
recommendation vs the selection with the deviation reason, the savings, the price variance vs
last purchase and contract, the vendors invited vs responded, each vendor's rating and
compliance status, and any risk notes. Approving an award without seeing the rejected
alternatives is a control failure.

## 5.11 Notifications

| Trigger | Recipient | Channel |
|---|---|---|
| Comparison ready for evaluation (all quotes in) | Buyer | In-app |
| Negotiation request issued | Vendor | E-mail, portal |
| Negotiation round closed with savings | Buyer, Purchase Head | In-app |
| Award submitted for approval | Approver | In-app, e-mail, push |
| Award approved | Buyer, Purchase Head | In-app, e-mail |
| Award rejected / returned | Buyer | In-app, e-mail |
| Award decision published | Awarded vendor; unsuccessful vendors (regret note) | E-mail, portal |
| Abnormally low bid detected | Buyer, Purchase Head | In-app |
| Risk concentration warning | Purchase Head | In-app |

## 5.12 Reports contributed

Quotation Comparison Report (per comparison, the full statement) · Comparative Statement
Register · Award Analysis (lowest vs selected, with reasons) · Deviation-from-Lowest Register ·
Negotiation Savings Report (by buyer, item, period) · Price Variance vs Last Purchase / Contract
/ Should-cost · Vendor Win Rate · Disqualification Analysis · Single-source Award Register ·
Comparison Cycle Time.

## 5.13 Dashboard KPIs contributed

Comparisons pending evaluation · pending award approval · savings realised this period (target
vs actual) · % awards to lowest landed cost · % awards with deviation reason · average
comparison-to-PO time · price index vs last quarter for the top spend items.

## 5.14 Events

| Event | When | Consumers |
|---|---|---|
| `procurement.comparison.created` | Comparison created | Audit |
| `procurement.comparison.evaluated` | Scores computed, selection made | Audit |
| `procurement.negotiation.requested` / `.responded` | Round issued / answered | Portal, Notification, Savings tracker |
| `procurement.comparison.awarded` | Award approved | PO creation, Quotation status, RFQ status, Vendor rating, Notification |
| `procurement.comparison.rejected` | Award rejected | Notification |
| `procurement.comparison.cancelled` | Cancelled | RFQ/PR release, Notification |

## 5.15 Acceptance criteria (extract)

- With the worked figures in §5.9, the engine computes Viraj's landed cost as ₹248.10/KG and
  Jindal's as ₹248.62/KG, and ranks Viraj first on cost while ranking Jindal first on total
  score — both verified by unit tests against §5.3 step order.
- Creditable GST does not appear in landed cost; changing a vendor from IGST to CGST+SGST with
  the same rate does not change their landed cost.
- A vendor whose lead time misses the need date scores 0 on delivery and is shown as
  disqualified with the reason, not omitted from the screen.
- Selecting the second-lowest without a deviation reason cannot be submitted for approval.
- A comparison approved in April and reopened in December shows April's weights and April's
  quoted rates.
- A split award that violates a vendor's MOQ is refused and the nearest compliant quantity is
  offered.
- Changing a weight set does not alter any previously approved comparison's scores.
- The comparison statement PDF attached to the approval is byte-identical to the one an
  auditor downloads a year later.

---

**Next:** [Chapter 6 — Purchase Order](06-purchase-order.md)
