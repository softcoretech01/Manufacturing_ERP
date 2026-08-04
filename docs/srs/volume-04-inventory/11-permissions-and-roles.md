# Volume 4 · Chapter 11 — Permissions, Roles & Workflow

Prerequisite: [Vol 1 Ch 1 — Identity & Access](../volume-01-core-framework/01-identity-and-access.md) ·
[Vol 1 Ch 4 — Workflow & Approvals](../volume-01-core-framework/04-workflow-and-approvals.md)

---

## 11.1 Permission catalogue

Permissions are `INVENTORY.<ENTITY>.<ACTION>` (CLAUDE.md §5.4). Every endpoint in Ch 13 declares
exactly one; an endpoint without a declared permission fails CI.

| Entity | Actions | Notes |
|---|---|---|
| `DASHBOARD` | VIEW · VIEW_ALL_PLANTS | Plant scope from the user's data scope unless VIEW_ALL_PLANTS |
| `STOCK` | VIEW · VIEW_VALUE · VIEW_ALL_WAREHOUSES · EXPORT | **VIEW_VALUE is separate from VIEW** (V4-INV-BR-004) |
| `LEDGER` | VIEW · EXPORT | Bin card and movement history |
| `PUTAWAY` | VIEW · CREATE · CONFIRM · OVERRIDE_BIN | Override is audited with both bins |
| `RECEIPT` | VIEW · CREATE · POST · CANCEL | CREATE only for non-GRN sources |
| `QC_HOLD` | VIEW · RELEASE · BLOCK | RELEASE without an inspection is an exception path |
| `REQUISITION` | VIEW · CREATE · EDIT · SUBMIT · APPROVE · CANCEL | — |
| `MATERIAL_ISSUE` | VIEW · CREATE · EDIT · SUBMIT · APPROVE · POST · CANCEL · OVERRIDE_BOM · OVERRIDE_FEFO · PRINT · EXPORT | Two override permissions, separately grantable |
| `MATERIAL_RETURN` | VIEW · CREATE · POST · CANCEL | — |
| `TRANSFER` | VIEW · CREATE · EDIT · SUBMIT · APPROVE · DISPATCH · RECEIVE · CANCEL · PRINT | DISPATCH and RECEIVE are separate — usually different people |
| `SUBCONTRACT` | VIEW · ISSUE · RECEIVE · RECONCILE | Job-work challan and reconciliation |
| `STOCK_ADJUSTMENT` | VIEW · CREATE · SUBMIT · APPROVE · POST · CANCEL | **Sensitive:** APPROVE |
| `SCRAP` | VIEW · CREATE · APPROVE · DISPOSE | — |
| `WRITE_OFF` | VIEW · CREATE · APPROVE | **Sensitive:** APPROVE |
| `CYCLE_COUNT` | VIEW · PLAN · COUNT · RECOUNT · APPROVE_VARIANCE · POST · FREEZE | **Sensitive:** APPROVE_VARIANCE, FREEZE |
| `BATCH` | VIEW · EDIT · BLOCK · EXTEND_EXPIRY · TRACE | **Sensitive:** EXTEND_EXPIRY |
| `SERIAL` | VIEW · GENERATE · EDIT | — |
| `VALUATION` | VIEW · REVALUE · APPROVE_REVALUATION · RECONCILE_GL · EXPORT | **Sensitive:** REVALUE, APPROVE_REVALUATION |
| `REORDER` | VIEW · EDIT · RECALCULATE | — |
| `RESERVATION` | VIEW · CREATE · RELEASE · OVERRIDE | **Sensitive:** OVERRIDE |
| `REPORT` | VIEW · VIEW_VALUE · EXPORT · SCHEDULE | — |
| `SETTINGS` | VIEW · EDIT | Parameters, strategies, movement types, reason codes |

## 11.2 Role × permission matrix (seeded defaults)

`●` full · `◐` limited (own scope / own documents) · `○` view only · blank = none

| Permission group | STORE_OPR | STORE_HEAD | SHIFT_SUP | PROD_MGR | PPC | QC_INSP | QC_HEAD | PURCH_* | ACCOUNTS | FACTORY_HEAD | AUDITOR |
|---|---|---|---|---|---|---|---|---|---|---|---|
| STOCK.VIEW | ● | ● | ◐ | ● | ● | ● | ● | ● | ● | ● | ● |
| STOCK.VIEW_VALUE | | ● | | ○ | ○ | | ○ | ● | ● | ● | ● |
| LEDGER.VIEW | ◐ | ● | | ○ | ● | ○ | ● | ○ | ● | ● | ● |
| PUTAWAY.* | ● | ● | | | | | | | | ○ | ○ |
| PUTAWAY.OVERRIDE_BIN | | ● | | | | | | | | ● | |
| RECEIPT.POST | ◐ | ● | | | | | | | | ○ | ○ |
| QC_HOLD.RELEASE / BLOCK | | ◐ | | | | ● | ● | | | ○ | ○ |
| REQUISITION.CREATE | ◐ | ● | ● | ● | ● | | | | | ● | |
| REQUISITION.APPROVE | | ● | | ● | | | | | | ● | |
| MATERIAL_ISSUE.CREATE / POST | ● | ● | ◐ | ◐ | | | | | | ○ | ○ |
| MATERIAL_ISSUE.OVERRIDE_BOM | | ● | | ● | | | | | | ● | |
| MATERIAL_ISSUE.OVERRIDE_FEFO | | ● | | | | | ● | | | ● | |
| MATERIAL_RETURN.* | ● | ● | ● | ● | | | | | | ○ | ○ |
| TRANSFER.CREATE / DISPATCH / RECEIVE | ● | ● | | | | | | | | ○ | ○ |
| TRANSFER.APPROVE | | ● | | | | | | | | ● | |
| SUBCONTRACT.ISSUE / RECEIVE | ◐ | ● | | | | | | ○ | | ○ | ○ |
| SUBCONTRACT.RECONCILE | | ● | | | | | | ● | ● | ● | ● |
| STOCK_ADJUSTMENT.CREATE | | ● | | | | | | | | ● | |
| STOCK_ADJUSTMENT.APPROVE | | | | | | | | | ● | ● | |
| SCRAP.CREATE | ● | ● | ● | ● | | ● | ● | | | ● | |
| SCRAP.APPROVE | | ● | | ● | | | ● | | | ● | |
| WRITE_OFF.CREATE / APPROVE | | ◐ | | | | | | | ● | ● | |
| CYCLE_COUNT.COUNT / RECOUNT | ● | ● | | | | ○ | ○ | | | ○ | ○ |
| CYCLE_COUNT.PLAN / APPROVE_VARIANCE | | ● | | | | | | | ○ | ● | |
| CYCLE_COUNT.FREEZE | | ● | | | | | | | | ● | |
| BATCH.VIEW / TRACE | ● | ● | ○ | ● | ● | ● | ● | ● | ○ | ● | ● |
| BATCH.BLOCK | | ◐ | | | | ● | ● | | | ● | |
| BATCH.EXTEND_EXPIRY | | | | | | | ● | | | | |
| SERIAL.GENERATE | ● | ● | | ● | | | | | | | |
| VALUATION.VIEW | | ● | | | ○ | | | ○ | ● | ● | ● |
| VALUATION.REVALUE | | | | | | | | | ● | | |
| VALUATION.APPROVE_REVALUATION | | | | | | | | | | ● | |
| REORDER.VIEW / EDIT | ○ | ● | | ○ | ● | | | ● | | ● | ○ |
| RESERVATION.CREATE / RELEASE | | ● | | ◐ | ● | | | | | ● | |
| RESERVATION.OVERRIDE | | | | | ● | | | | | ● | |
| SETTINGS.EDIT | | ◐ | | | | | | | | ● | |

Sales roles hold `STOCK.VIEW` (free and ATP only) and nothing else in this module.

## 11.3 Data scope

| Scope dimension | Rule |
|---|---|
| Company | Always enforced by the base repository (CLAUDE.md §4.3). No exception without `SYSTEM.CROSS_COMPANY_READ`. |
| Plant | A user sees the plants in their scope; `DASHBOARD.VIEW_ALL_PLANTS` widens dashboards only, never transactions. |
| Warehouse | A storekeeper is assigned warehouses; without `STOCK.VIEW_ALL_WAREHOUSES` they see and post only in those. Reject, scrap and quarantine stores are separately assignable. |
| Cost centre | Requisition and issue screens are filtered to the user's cost centres unless they hold a supervisory role. |
| Document ownership | `◐` in §11.2 means the user sees and edits their own documents and those of their assigned warehouses, not the whole plant. |

**V4-INV-BR-005 (M)** Warehouse scope is enforced on **read and write**. A storekeeper querying
the stock API for a warehouse outside their scope receives an empty result, not a 403 that
confirms the warehouse exists.

## 11.4 Field-level security

| Entity | Field | Restricted from | Behaviour |
|---|---|---|---|
| `inv_stock_balance` | `value`, `rate` | Roles without `STOCK.VIEW_VALUE` | Column absent from the API response and from exports — not blanked, not zeroed |
| `inv_stock_ledger` | `rate`, `value`, `running_value` | Same | Absent |
| `inv_material_issue` | `total_value`, line `rate`/`value` | `STORE_OPR`, `SHIFT_SUP`, `OPERATOR` | Absent |
| `inv_batch` | `landed_rate` | Roles without `VALUATION.VIEW` | Absent |
| `inv_count_sheet` | `system_quantity` | **Everyone**, until the sheet is submitted | Absent (V4-CNT-BR-002) |
| `inv_adjustment` | `value_impact` | Raiser roles without `STOCK.VIEW_VALUE` | Absent; approval still shows value to the approver |

**V4-INV-BR-006 (M)** Field-level suppression happens **server-side, in the response
serialisation**. A field the user may not see must never reach the browser, because "the UI hides
it" is not a control (CLAUDE.md §5.4).

## 11.5 Approval matrices (seeded defaults)

Configured in the Vol 1 workflow engine; these are the seeds, not hard-coded rules.

### Material requisition

| Condition | Levels |
|---|---|
| Shop-floor consumable within the shift limit | Auto-approve, logged |
| Value ≤ ₹50,000 | L1 Shift Supervisor |
| ₹50,001 – ₹5,00,000 | L1 Shift Supervisor → L2 Stores In-charge |
| > ₹5,00,000 | L1 Shift Sup → L2 Stores In-charge → L3 Factory Head |
| Any value, non-BOM item on a production order | L1 Production Manager (with justification) |

### Stock transfer

| Condition | Levels |
|---|---|
| Bin transfer | None (posted directly, audited) |
| Warehouse transfer within a plant, ≤ ₹1,00,000 | L1 Stores In-charge |
| Warehouse transfer > ₹1,00,000, or to a controlled store | L1 Stores In-charge → L2 Materials Manager |
| Inter-plant / depot, any value | L1 Stores In-charge → L2 Materials Manager |
| Inter-plant > ₹10,00,000 | + L3 Factory Head |
| Job-work challan | L1 Stores In-charge → L2 Purchase Head (contract terms) |

### Stock adjustment, scrap and write-off

| Condition | Levels |
|---|---|
| Adjustment ≤ ₹10,000 | L1 Stores In-charge |
| ₹10,001 – ₹1,00,000 | L1 Stores In-charge → L2 Materials Manager |
| ₹1,00,001 – ₹5,00,000 | + L3 Factory Head, and Finance in parallel |
| > ₹5,00,000 | + L4 Director |
| Pilferage reason, any value | Factory Head mandatory regardless of value |
| Scrap within order tolerance | L1 Production Manager |
| Scrap beyond tolerance | L1 Production Manager → L2 Factory Head (+ Quality Head informed) |
| Write-off, any value | L1 Materials Manager → L2 Finance → L3 Factory Head |
| Write-off > ₹5,00,000 | + L4 Director |

### Count variance and revaluation

| Condition | Levels |
|---|---|
| Variance within item tolerance | L1 Stores In-charge |
| Variance beyond tolerance, ≤ ₹1,00,000 | L1 Stores In-charge → L2 Materials Manager |
| Variance > ₹1,00,000 | + L3 Factory Head + Finance |
| Full physical verification result | L1 Materials Manager → L2 Factory Head → L3 CFO |
| Revaluation / standard-cost revision | L1 Costing → L2 CFO |
| NRV write-down | L1 Costing → L2 CFO → L3 Director |

## 11.6 Segregation of duties

| # | Rule | Severity |
|---|---|---|
| SOD-INV-01 | Stock adjustment entry vs approval (seeded `sod-05`) | **Block** |
| SOD-INV-02 | Count entry vs count-variance approval | **Block** |
| SOD-INV-03 | Recount by the same user who performed the first count | **Block** |
| SOD-INV-04 | Material requisition raise vs issue posting, where `allow_self_issue = false` | **Block** |
| SOD-INV-05 | Transfer dispatch vs transfer receipt by the same user | Warn (block for inter-plant) |
| SOD-INV-06 | Revaluation raise vs approve | **Block** |
| SOD-INV-07 | Write-off raise vs approve | **Block** |
| SOD-INV-08 | Batch block vs batch unblock by the same user within 24 h | Warn |
| SOD-INV-09 | Holding both `STOCK_ADJUSTMENT.APPROVE` and `CYCLE_COUNT.COUNT` | Warn — reported in the SoD violation register |

**V4-INV-BR-007 (M)** A `Block` SoD rule is enforced at the point of action, server-side, with the
rule named in the error. Where the blocked user is the only holder of the approving role, the
workflow escalates to the configured fallback and records the escalation reason.

## 11.7 Audit and sensitive actions

The following are marked sensitive and appear on the standing security report reviewed monthly:

- Any use of `OVERRIDE_BIN`, `OVERRIDE_BOM`, `OVERRIDE_FEFO`, `RESERVATION.OVERRIDE`
- `QC_HOLD.RELEASE` without an inspection reference
- `BATCH.EXTEND_EXPIRY`
- `CYCLE_COUNT.FREEZE` overrides that allowed a movement during a freeze
- Any adjustment with reason `PILFERAGE`
- Any back-dated posting
- Any negative-stock exception
- Every export containing value columns, with the row count and filter

## 11.8 Acceptance criteria (extract)

- A Store Operator's stock API response contains no `value` or `rate` key at all.
- A Store Operator querying a warehouse outside their assignment receives an empty list, not a
  403 revealing its existence.
- The raiser of an adjustment cannot approve it even when they hold `STOCK_ADJUSTMENT.APPROVE`.
- A count sheet API response omits `system_quantity` until the sheet is submitted, for every role
  including the Factory Head.
- A ₹6.2 L adjustment routes to four levels; a ₹8,000 one to a single level; a pilferage
  adjustment of ₹2,000 still reaches the Factory Head.
- Every endpoint in Ch 13 has a declared permission, verified by a CI check that fails the build
  otherwise.

---

**Next:** [Chapter 12 — Data Model](12-data-model.md)
