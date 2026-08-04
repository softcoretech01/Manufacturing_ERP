# Volume 3 · Chapter 8 — Approval Center

**Area code:** `APR`
Prerequisite: [Vol 1 Ch 4 — Workflow & Approval Engine](../volume-01-core-framework/04-workflow-and-approvals.md).
**The engine is not re-specified here.** This chapter defines the procurement module's
*configuration* of that engine, its decision context, its seeded matrices, and the procurement
view of the unified inbox.

---

## 8.1 Objective

Procurement is the module where authority limits actually bite, because it is where money is
committed to outsiders. The Approval Center exists so that:

- every approver sees, in one place, everything waiting on them across PR, RFQ, comparison, PO,
  amendment, GRN, return, debit note and invoice;
- every approver sees **why** the document needs a decision and what is unusual about it, not
  merely what it says;
- nothing sits unactioned in silence — SLA, reminder, escalation and delegation are configured,
  not hoped for.

**V3-APR-BR-001 (M)** No procurement document type may be transactable without a configured
approval rule. The engine fails closed (Vol 1 V1-WFL-BR-001): a missing rule blocks submission
with an error naming the document type, value band and the missing configuration. It never
auto-approves by default.

## 8.2 Approvable documents in this module

| # | Document | Approval mandatory | Auto-approve permitted | Notes |
|---|---|---|---|---|
| 1 | Purchase Requisition | Yes | Yes, below a low threshold | Ch 2 |
| 2 | PR Amendment | Yes | No | Level by change magnitude |
| 3 | RFQ | Configurable, off by default | n/a | Ch 3 §3.7 |
| 4 | RFQ Corrigendum (due-date extension after quotes received) | Yes | No | Fairness control |
| 5 | Quotation Comparison / Vendor Selection | Yes | Yes, low value + lowest landed cost | Ch 5 |
| 6 | Purchase Order | Yes | Only for contract call-offs below a threshold | Ch 6 |
| 7 | PO Amendment | Yes | No | Level by magnitude |
| 8 | PO Cancellation / Short-close | Yes | No | Reason mandatory |
| 9 | Rate Contract / Blanket Order | Yes | **No** | Multi-year commitment |
| 10 | Subcontract PO | Yes | No | Material leaves the plant |
| 11 | Supplier Onboarding / Qualification | Yes (parallel levels) | No | Ch 1 |
| 12 | Supplier Bank-detail Change | Yes | **No** | Fraud control |
| 13 | Supplier Hold / Blacklist / Reinstate | Yes | No | Director for blacklist |
| 14 | Gate Entry without PO | Yes (post-facto) | No | Exception |
| 15 | GRN | Yes | Yes, routine within tolerance | Ch 7 |
| 16 | GRN excess beyond tolerance | Yes | **No** | Ch 7 |
| 17 | GRN Reversal | Yes | **No** | Post-posting correction |
| 18 | Acceptance under deviation / concession | Yes | **No** | QC + value-based escalation |
| 19 | Purchase Return | Yes | No | Goods leave the plant |
| 20 | Debit Note | Yes | No | Statutory document |
| 21 | Supplier Invoice / Match Exception Resolution | Yes | Yes, fully matched below a threshold | Ch 7 |
| 22 | Budget override | Yes | **No** | Always Finance |
| 23 | Price-variance override | Yes | **No** | Always one level above the normal chain |

**V3-APR-BR-002 (M)** `AUTO_APPROVE` escalation on SLA breach is prohibited for rows marked
**No** above, and additionally for anything statutory (return, debit note) — enforced at
rule-save time by the engine (Vol 1 V1-WFL-BR-010).

## 8.3 Seeded approval matrices

These are the **seeded defaults** shipped with the module. They are configuration data, editable
by an administrator without code change, and the client's actual limits replace them at
implementation (open question Q3-02). Amounts are in INR.

### 8.3.1 Purchase Requisition

| Pri | Rule | Condition | L1 | L2 | L3 | L4 |
|---|---|---|---|---|---|---|
| 1 | PR — Emergency | urgency = EMERGENCY and ≤ 2,00,000 | Factory Manager | — | — | — |
| 5 | PR — Capital | procurement_type = CAPITAL | Dept Head | Finance Manager | Factory Manager | Director |
| 10 | PR — Micro | ≤ 5,000 | *auto-approve, logged* | — | — | — |
| 20 | PR — Routine | 5,001 – 25,000 | Dept Head | — | — | — |
| 30 | PR — Standard | 25,001 – 2,00,000 | Dept Head | Purchase Manager | — | — |
| 40 | PR — High | 2,00,001 – 10,00,000 | Dept Head | Purchase Manager | Factory Manager | — |
| 50 | PR — Very high | > 10,00,000 | Dept Head | Purchase Manager | Factory Manager | Director |
| 15 | PR — MRP within plan | source = MRP and within the approved plan | Purchase Manager | — | — | — |

SLA: L1 8 h, L2 16 h, L3 24 h, L4 48 h (working hours). Emergency: 2 h at every level.

### 8.3.2 Quotation Comparison / Vendor Selection

| Pri | Rule | Condition | Levels |
|---|---|---|---|
| 5 | Award — not lowest landed cost | selection ≠ lowest, any value | Purchase Manager → Factory Manager |
| 6 | Award — below minimum quotations | comparable quotes < policy minimum | + Purchase Head (prepended) |
| 7 | Award — single source / proprietary | single-vendor RFQ | Purchase Head → Factory Manager |
| 10 | Award — low value, lowest selected | ≤ 1,00,000 and lowest | *auto-approve, logged* |
| 20 | Award — standard | 1,00,001 – 10,00,000 and lowest | Purchase Manager |
| 30 | Award — high | > 10,00,000 | Purchase Manager → Factory Manager → Finance Manager → Director |
| 8 | Award — rate contract | type = RATE_CONTRACT_RFQ | Purchase Head → Finance Manager → Director |
| 9 | Award — capital | procurement_type = CAPITAL | Technical evaluator ∥ Purchase Head → Finance Manager → Director |

### 8.3.3 Purchase Order

| Pri | Rule | Condition | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|---|---|
| 1 | PO — Emergency | urgency = EMERGENCY, ≤ 2,00,000 | Factory Manager | — | — | — | — |
| 5 | PO — Call-off at contract rate | type = CALL_OFF, rate = contract, within balance | Purchase Manager *(auto below 50,000)* | — | — | — | — |
| 6 | PO — Capital | type = CAPITAL | Purchase Head | Finance Manager | Factory Manager | Director | — |
| 7 | PO — Subcontract | type = SUBCONTRACT | PPC | Purchase Manager | Factory Manager | — | — |
| 8 | PO — Import | type = IMPORT | Purchase Manager | Finance Manager (forex/LC) | Director | — | — |
| 9 | PO — Rate contract / blanket | type = BLANKET/RATE_CONTRACT | Purchase Head | Finance Manager | Director | — | — |
| 20 | PO — Small | ≤ 1,00,000 | Purchase Manager | — | — | — | — |
| 30 | PO — Standard | 1,00,001 – 10,00,000 | Purchase Manager | Finance (verification) | — | — | — |
| 40 | PO — High | 10,00,001 – 50,00,000 | Purchase Manager | Finance Manager | Factory Manager | Director | — |
| 50 | PO — Very high | > 50,00,000 | Purchase Manager | Finance Manager | Factory Manager | Director | Managing Director |
| 4 | PO — Price variance override | rate > threshold above contract/LPP | *inserts one level above the resolved chain* | | | | |
| 3 | PO — Budget override | budget breach with override | *inserts Finance Manager at L1* | | | | |

SLA: L1 12 h, L2 24 h, L3 24 h, L4 48 h, L5 72 h. Escalation: notify manager at breach; never
auto-approve.

### 8.3.4 Amendments

| Change | Approval |
|---|---|
| Value increase > 10%, or quantity increase > 10% | Full chain for the **new** value |
| Value increase ≤ 10% | Purchase Manager → Finance |
| Rate change (any) | Chain for the new value, plus price-variance level if applicable |
| Delivery date change within the tolerance window | Purchase Manager |
| Delivery date change beyond tolerance, or affecting a production schedule | Purchase Manager → PPC |
| Specification change | Purchase Manager → QC Head (→ Factory Manager for critical items) |
| Delivery location change | Purchase Manager |
| Line addition | Full chain for the new value |
| Line closure / short-close | Purchase Manager → Factory Manager above a threshold |

### 8.3.5 Receipt, return and invoice

Specified in [Ch 7 §7.18](07-receipt-return-and-invoice.md); reproduced in the matrix
configuration screen under the same document types.

### 8.3.6 Supplier

| Document | Levels |
|---|---|
| Supplier qualification | **Parallel**: Purchase screening ∥ QC audit (critical/food-contact only) ∥ Finance check ∥ Compliance check → then Purchase Head |
| Provisional → full approval | Purchase Head → QC Head |
| Bank-detail change | Finance Manager → Finance Head (cooling period enforced after approval) |
| Hold | Purchase Head |
| Blacklist | Purchase Head → Factory Manager → Director |
| Reinstate from blacklist | Director |

## 8.4 Decision context — what an approver must see

Vol 1 V1-WFL-FR-019 requires decision context; this section defines it for procurement. An
approver seeing only the document is not making a decision, they are performing a ritual.

| Document | Context block MUST include |
|---|---|
| **PR** | Requester and department · justification · budget available/consumed/committed and the effect of this PR · current stock, in-transit, open PO, coverage days · last purchase rate, date and supplier · rate contract if any · consumption trend · duplicate-PR and stock-elsewhere warnings the requester acknowledged · need-date feasibility |
| **Comparison / Award** | Comparison statement PDF · vendors invited vs responded vs disqualified with reasons · normalised landed-cost table · scores and weights used · system recommendation vs actual selection with the deviation reason · savings vs target/LPP/highest · price variance vs contract and index · risk notes (single source, first-time vendor, capacity, abnormally low bid) |
| **PO** | Supplier rating, grade trend, OTIF, rejection %, hold and document-expiry status · comparison outcome or the exemption used · rate variance vs contract, award and LPP with justification text · budget position after this PO · stock cover days · open PO exposure with this supplier · aggregate value of related POs in the split-detection window · advance/milestone payment requested · MSME status and payment implication |
| **PO Amendment** | Field-level diff vs the approved revision · quantity already received and invoiced · reason for amendment · value impact and new budget position · schedule impact on production |
| **GRN (exception)** | Ordered vs received vs tolerance · gate entry and weighbridge figures · supplier status · previous excess/short history for this supplier · which dispositions are available and their consequences |
| **Deviation acceptance** | Defect detail and QC report · quantity and value affected · the production consequence of rejecting · the concession claimed · this supplier's deviation history |
| **Purchase return / Debit note** | Source GRN and QC report · batch/heat affected · value computation basis · original invoice reference · supplier's dispute history · rejection ageing |
| **Invoice exception** | The three-way comparison side by side · exception type and magnitude · tolerance in force · supplier's explanation · this supplier's first-pass match rate · the proposed resolution and its financial effect · MSME due-date implication |
| **Supplier qualification** | Checklist score with evidence · audit report · financial check outcome · compliance documents with expiry · related-party declaration · duplicate-check result · who invited them |
| **Budget / price override** | The exact breach, the limit, the requested override, the justification text, and who else has overridden this cost centre this period |

**V3-APR-BR-003 (M)** The decision context MUST be rendered server-side from live data at the
moment the approver opens the task, not cached from submission time — except the comparison
statement PDF and the document revision, which are deliberately frozen.

## 8.5 Approval actions available

All from the engine (Vol 1 V1-WFL-FR-009); procurement's configuration of them:

| Action | Available on | Requires | Effect |
|---|---|---|---|
| **Approve** | All | Comment optional (mandatory above a configurable value) | Advances to the next level or completes |
| **Reject** | All | Reason code + comment | Terminates the workflow; document → `REJECTED` |
| **Send back / Return for correction** | All | Reason code + comment | Document → `DRAFT` with the originator; workflow history retained |
| **Delegate** | All | Active delegation or ad-hoc reassignment with reason | Task moves; recorded as "on behalf of" |
| **Escalate** | All | — | Raises to the escalation target with the reason; used when the approver lacks the context or the authority |
| **Request information** | All | Named user + question | Document stays put; a question/answer thread is attached |
| **Reassign** | All | Reason | Moves the task to another eligible approver |
| **Add comment / attachment** | All | — | Appended to the document thread, visible to all approvers |
| **Approve with condition** | PO, Comparison, GRN deviation | Condition text (mandatory) | Approves and records a condition that becomes a tracked task on the buyer (e.g. "obtain the ISO renewal before the first delivery") |
| **Partial approve** | PR, PO (line level) | Reason per excluded line | Approves selected lines; excluded lines return to draft as a separate document |
| **Bulk approve** | All, from the inbox | Per-document validation | Each document validated individually; 207 Multi-Status result |
| **Recall** | Originator, level 1 untouched | — | Withdraws to `DRAFT` |
| **Auto-approve** | Where configured | Rule match | Logged with the rule that caused it; on the auto-approval exception report |

**V3-APR-FR-001 (M)** **Approve with condition** MUST create a tracked, dated, assigned task
that blocks the configured downstream action (e.g. PO release, first GRN) until closed. A
condition that nobody tracks is not a control.

**V3-APR-FR-002 (M)** **Partial approve** on a multi-line PR or PO MUST split the document: the
approved lines proceed on the original number, and the excluded lines are moved to a new
document in `DRAFT` linked to the original, with the exclusion reason. Approving "most of" a
document without splitting it leaves an ambiguous record.

## 8.6 Delegation, out-of-office and escalation

| Ref | Pri | Requirement |
|---|---|---|
| **V3-APR-FR-003** | M | Delegation is configured per user, per document type (or all), with a date range, an optional value ceiling below the delegator's own authority, and a reason. The delegate cannot sub-delegate. |
| **V3-APR-FR-004** | M | A delegate's approval is recorded as "X on behalf of Y", and both appear in the audit and in the delegation-usage report. |
| **V3-APR-FR-005** | M | Out-of-office routes new tasks to the named cover person automatically for the declared period; tasks already assigned stay assigned unless explicitly reassigned. |
| **V3-APR-FR-006** | M | Escalation on SLA breach follows the configured action per level. For procurement the seeded actions are `NOTIFY_MANAGER` at L1–L2 and `REASSIGN_TO_ESCALATION_TARGET` at L3+, never `AUTO_APPROVE`. |
| **V3-APR-FR-007** | M | An approver who lacks approval authority for the document's value (Vol 1 V1-WFL-BR-003) MUST NOT be able to approve; the engine escalates to a level that does and records why. Matrix membership is not authority. |
| **V3-APR-FR-008** | S | **Approval-limit calendar**: temporary authority increases (e.g. during a plant head's leave) are granted with a validity window and are separately reported. |

## 8.7 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V3-APR-BR-004** | M | Self-approval is blocked across procurement without exception: the creator of a PR, comparison, PO, GRN, return, debit note or invoice cannot approve it, whatever roles they hold. The company parameter `ALLOW_SELF_APPROVAL` MUST remain off for all procurement document types; if a client insists otherwise, every instance is flagged on the self-approval exception report. |
| **V3-APR-BR-005** | M | The same user MUST NOT approve two levels of the same document instance (Vol 1 V1-WFL-BR-004); the engine escalates rather than collapsing levels. |
| **V3-APR-BR-006** | M | Segregation of duties, enforced and tested: create PO ≠ approve PO · create supplier ≠ approve supplier · GRN entry ≠ QC decision · invoice verification ≠ payment release · comparison creator ≠ award approver · budget override requester ≠ Finance approver. |
| **V3-APR-BR-007** | M | Approval is against a **document revision**. Any material change after approval invalidates it and restarts the workflow (Vol 1 V1-WFL-FR-022); the material-field set per procurement document type is seeded as: PR (item, quantity, need date, cost centre, plant), PO (supplier, item, quantity, rate, taxes, charges, delivery date, terms), GRN (quantity, batch, item), Invoice (any value or tax field). |
| **V3-APR-BR-008** | M | Approval decisions are immutable. There is no "unapprove"; the path is cancel or amend, each with its own workflow. |
| **V3-APR-BR-009** | M | Every decision records user, on-behalf-of, timestamp, channel, IP, comment, reason code and document revision. |
| **V3-APR-BR-010** | M | Bulk approval validates each document individually and returns per-document results. A bulk approve is a convenience, never a bypass. |
| **V3-APR-BR-011** | M | A document whose supplier moved to hold or blacklist while it was in the approval queue MUST be flagged at the top of the decision context, and approving it requires an explicit acknowledgement. |
| **V3-APR-BR-012** | S | Chronic bottlenecks — an approver whose median turnaround exceeds SLA for a period — are reported to the Purchase Head and the Director as a process metric, not as a personal one. |

## 8.8 Screens

### S-APR-01 · Pending My Approval (procurement view)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Approval Center — Pending my approval (14)          [Bulk approve] [Settings] ⟳         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [All 14] [Overdue 3] [Due today 5] [Delegated to me 2] [Conditions open 1] [Completed]  │
│ 🔍 Search   [Document ▼] [Supplier ▼] [Requester ▼] [Value ▼]   Sort [Due date ▼]       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│[x]│⏰│ Document        │ Requester │ Subject                    │ Value      │ Due      │
│[x]│🔴│ PO/25-26/00356  │ S. Ramesh │ Viraj Profiles — SS304 coil│ 20,43,020  │ 2 d over │
│   │  │ L2 of 4 Finance │           │ ⚠ Rate 1.85% above contract RC/25-26/004          │
│   │  │                 │           │ ⚠ 2 more POs to this supplier this week — ₹38.6 L │
│[x]│🔴│ PR/25-26/00318  │ M. Devi   │ Coating chemicals          │    82,400  │ 1 d over │
│   │  │ L2 of 3         │           │ ⚠ Budget CC-PROD-01 at 91% after this PR          │
│[ ]│🟡│ CMP/25-26/0044  │ S. Ramesh │ Split award — SS304 coil   │ 28,53,150  │ Today    │
│   │  │ L1 of 4         │           │ ⚠ Not lowest landed cost — reason: quality+risk   │
│[ ]│🟡│ DN/25-26/0033   │ K. Ravi   │ Debit note — rate variance │    17,995  │ Today    │
│[ ]│🟢│ SUP/00119       │ P. Latha  │ New supplier — Elasto Poly │        —   │ 3 days   │
│   │  │ Parallel: QC ✔ Finance ⏳ Compliance ✔ — you are Compliance                      │
│[ ]│🟢│ INV/VP/2026/8841│ Accounts  │ Invoice exception — price  │ 17,85,104  │ 4 days   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2 selected → [✔ Approve] [✕ Reject] [↩ Send back] [⇄ Reassign] [Open]        ✕ Clear    │
│ ⓘ Bulk approve validates each document individually; failures are reported per row.     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-APR-02 · Approval Decision Panel — PO example

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PO/25-26/00356 · Viraj Profiles Ltd     ⚑ PENDING APPROVAL — Level 2 of 4 (Finance)    │
├──────────────────────────────────────┬─────────────────────────────────────────────────┤
│ … purchase order content …           │ APPROVAL PROGRESS                               │
│                                      │ ✔ L1 Purchase Manager                           │
│                                      │   R. Kannan · 06-Aug 09:20                      │
│                                      │   "Index revision verified against JSW circular"│
│                                      │ ◉ L2 Finance  ← YOU   🔴 overdue 2 d (SLA 24 h) │
│                                      │ ○ L3 Factory Manager                            │
│                                      │ ○ L4 Director                                   │
│                                      ├─────────────────────────────────────────────────┤
│                                      │ DECISION CONTEXT                                │
│                                      │ Supplier  Viraj Profiles · Grade B (83) ↑       │
│                                      │           OTIF 91% · Rejection 0.9%             │
│                                      │           ✔ documents valid · not on hold       │
│                                      │ Sourcing  CMP/25-26/0044 — split award, not     │
│                                      │           lowest; reason: quality + dual source │
│                                      │ Rate      ₹248.00 vs contract ₹243.50 (+1.85%)  │
│                                      │           vs last purchase ₹245.00 (+1.22%)     │
│                                      │           Justification: "index revision"       │
│                                      │ Budget    CC-PROD-01 → 71.2% after this PO      │
│                                      │ Stock     SS304 cover 11 days                   │
│                                      │ Exposure  Open PO with this supplier ₹62.4 L    │
│                                      │ ⚠ Split   2 more POs this week — total ₹38.6 L  │
│                                      │           would fall in the > ₹50 L band        │
│                                      │ MSME      No · terms 45 days                    │
│                                      ├─────────────────────────────────────────────────┤
│                                      │ Comments *                                      │
│                                      │ [                                            ]  │
│                                      │ Reason code (reject / send back)                │
│                                      │ [ ▼ Select                                   ]  │
│                                      │ [ ✔ Approve ] [ ✔ Approve with condition ]      │
│                                      │ [ ✕ Reject ] [ ↩ Send back ] [ ? Request info ] │
│                                      │ [ ⇄ Reassign ] [ ⇧ Escalate ]                   │
└──────────────────────────────────────┴─────────────────────────────────────────────────┘
```

### S-APR-06 · Procurement Approval Matrix

Presented as the Vol 1 `S-WFL-01` screen filtered to procurement document types, with the
amount-coverage bar, gap/overlap validation, and the rule simulator. Procurement adds a
**matrix overview** tab showing all procurement document types side by side, so an administrator
can see at a glance that a ₹5 lakh purchase needs 3 approvals as a PR and 2 as a PO — and fix
the inconsistency.

### Other screens

| Screen | Notes |
|---|---|
| S-APR-03 My Submitted Documents | Everything the user originated, with current level, current approver, age, and a nudge action. |
| S-APR-04 Delegation Register | Own delegations and, for administrators, all delegations; create with document type, ceiling, period, reason. |
| S-APR-05 Approval History | Per document and per approver; full timeline with revision approved, comments, reason codes, channel, IP. |

## 8.9 Notifications

Inherited from Vol 1 §4.12. Procurement-specific additions:

| Trigger | Recipient | Channel |
|---|---|---|
| Approval assigned — high-value PO (> configurable) | Approver | In-app, e-mail, push, SMS |
| Approval condition created | Buyer (owner of the condition) | In-app, e-mail |
| Approval condition overdue | Buyer, condition approver | In-app, e-mail |
| Supplier held/blacklisted while a document is in your queue | Current approver | In-app |
| Split-PO pattern detected on a document you are approving | Approver, Purchase Head | In-app |
| Auto-approval fired | Purchase Head (digest), Auditor | In-app, weekly digest |
| Self-approval permitted by parameter | Auditor, Director | In-app, immediate |
| Chronic bottleneck (monthly) | Purchase Head, Director | E-mail digest |

## 8.10 Reports

| Report | Content |
|---|---|
| Approval History (per document) | Every event, decision, comment, reason, revision, channel |
| Pending Approvals | By document type, level, approver, age, value |
| Approval Ageing | Bucketed 0–1, 1–2, 2–5, > 5 working days |
| Approver Performance | Volume, median turnaround, % within SLA, % overdue |
| Approval Cycle Time by Document | PR, comparison, PO, GRN, invoice — trended monthly |
| Escalation Report | Every escalation, cause, target, outcome |
| Rejection Analysis | By reason code, document type, requester, approver |
| Send-back Analysis | Which documents get returned most, and why — a training input |
| Delegation Usage | Approvals made on behalf of others |
| **Auto-approval Log** | Every auto-approval with the rule that fired |
| **Self-approval Exceptions** | Any self-approval permitted by parameter |
| **Override Register** | Budget overrides, price-variance overrides, tolerance overrides, with approver and reason |
| **Emergency & Exception Register** | Emergency PR/PO, comparison exemptions, without-PO receipts, single-source awards |
| Approval Condition Register | Open and closed conditions, owner, due date, blocking effect |

## 8.11 Procurement parameters (Settings)

Configured on `S-SET-01`, all effective-dated and audited:

| Parameter | Default | Effect |
|---|---|---|
| `PR_MANDATORY_FOR_PO` | true (per procurement type) | Blocks PO without a PR reference |
| `PR_AUTO_APPROVE_BELOW` | 5,000 | Auto-approval threshold |
| `RFQ_MIN_VENDORS_ABOVE_VALUE` | 3 above 1,00,000 | Minimum invited vendors |
| `RFQ_MIN_NOTICE_HOURS` | 48 (24 urgent) | Minimum response window |
| `RFQ_APPROVAL_ABOVE_VALUE` | 10,00,000 | When RFQ approval switches on |
| `COMPARISON_MANDATORY_ABOVE_VALUE` | 1,00,000 | When comparison is required |
| `COMPARISON_MIN_QUOTES` | 3 | Minimum comparable quotations |
| `REPEAT_ORDER_WINDOW_DAYS` | 90 | Comparison exemption window |
| `PO_PRICE_VARIANCE_WARN_PCT` | 3% | Justification required |
| `PO_PRICE_VARIANCE_BLOCK_PCT` | 10% | Override permission required |
| `PO_SPLIT_DETECTION_WINDOW_DAYS` | 7 | Aggregation window for limit-splitting |
| `PO_OVER_ORDER_TOLERANCE_PCT` | 0% | Ordering above PR quantity |
| `BUDGET_CONTROL_PR` / `_PO` | WARN / BLOCK | Budget gate behaviour |
| `GRN_OVER_RECEIPT_TOLERANCE_PCT` | 2% (item/supplier overridable) | Excess receipt |
| `GRN_UNDER_RECEIPT_TOLERANCE_PCT` | 5% | Short-supply disposition trigger |
| `GRN_MIN_SHELF_LIFE_PCT` | 75% | Expiry-managed receipt |
| `REJECTION_AGEING_BLOCK_DAYS` | 30 | Blocks further GRN for the supplier |
| `INVOICE_QTY_TOLERANCE_PCT` | 0% | Match tolerance |
| `INVOICE_RATE_TOLERANCE_PCT` | 0.5% | Match tolerance |
| `INVOICE_VALUE_TOLERANCE_ABS` | 5 | Rounding absorption |
| `MSME_MAX_CREDIT_DAYS` | 45 | Statutory cap, not overridable |
| `SUPPLIER_PROVISIONAL_LIMIT` | 5,00,000 / 6 months | Provisional approval ceiling |
| `SUPPLIER_DOC_EXPIRY_ALERT_DAYS` | 60, 30, 7 | Alert offsets |
| `JOBWORK_RETURN_WINDOW_DAYS` | 180 / 365 | Statutory, from the statutory adapter |
| `ALLOW_SELF_APPROVAL` | false (all procurement types) | SoD control |
| `EMERGENCY_POST_REVIEW` | true | Monthly Director review of emergencies |

## 8.12 Acceptance criteria (extract)

- A PR of ₹4,000 auto-approves and appears on the auto-approval log with the rule that fired.
- A PO of ₹20,43,020 routes Purchase Manager → Finance → Factory Manager → Director; changing
  the rate afterwards restarts it at level 1.
- Three POs to the same supplier for the same item within 7 days, each ₹18 L, show the approver
  an aggregate of ₹54 L and route per the > ₹50 L band.
- A buyer who holds `PROCUREMENT.PO.APPROVE` cannot approve their own PO, and the engine
  escalates with the reason recorded.
- An approver whose approval authority is ₹10 L cannot approve a ₹20 L PO even though the matrix
  names their role; the engine escalates.
- Approving with a condition creates a task that blocks PO release until closed.
- Partially approving a 5-line PR splits it into a 3-line approved PR and a 2-line draft PR,
  both linked, with the exclusion reason on the draft.
- Saving an `AUTO_APPROVE` escalation on the debit-note rule is rejected at save time.
- A supplier blacklisted while their PO sits at level 3 causes a blocking flag on the decision
  panel that must be acknowledged before approval.

---

**Next:** [Chapter 9 — Dashboard & Reports](09-dashboard-and-reports.md)
