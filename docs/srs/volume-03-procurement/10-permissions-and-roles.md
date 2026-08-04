# Volume 3 · Chapter 10 — Permissions & Roles

Prerequisite: [Vol 0](../volume-00-foundation.md) §4 (role catalogue, SoD), §9.2 (authorisation)
· [Vol 1 Ch 1](../volume-01-core-framework/01-identity-and-access.md) (permissions, data scope,
field-level security, approval authority)

---

## 10.1 Principles

**V3-PRC-BR-003 (M)** Three enforcement levels apply to every procurement endpoint and screen,
all server-side, all mandatory (CLAUDE.md §5.4):

| Level | Question | Mechanism |
|---|---|---|
| **Action** | May this user invoke this operation at all? | `PROCUREMENT.<ENTITY>.<ACTION>` declared as a FastAPI dependency on every endpoint |
| **Data / scope** | Which rows may they see and touch? | Tenant context + scope filters: company, branch, plant, warehouse, cost centre, department, supplier ownership, own-records-only |
| **Field** | Which fields may they see, and which may they change? | Field-level policy per role per entity — e.g. a storekeeper sees a PO and not its rates |

**V3-PRC-BR-004 (M)** The UI hiding a button is a convenience, never a control. Every rule in
this chapter is tested at the API level with a 403 assertion (CLAUDE.md §8 RBAC tests).

**V3-PRC-BR-005 (M)** **Approval authority ≠ approve permission.** Holding
`PROCUREMENT.PO.APPROVE` allows a user to act on an assigned approval task; the *value* they may
authorise comes from `iam_approval_authority` (Vol 1 Ch 1). Both are required
(Vol 1 V1-WFL-BR-003).

## 10.2 Permission catalogue

Naming: `PROCUREMENT.<ENTITY>.<ACTION>`.

### 10.2.1 Standard actions and what they mean here

| Action | Meaning in this module |
|---|---|
| `VIEW` | Read documents within the user's data scope |
| `VIEW_ALL` | Read beyond own department/plant scope (still within company) |
| `CREATE` | Create a draft |
| `EDIT` | Modify a draft (or a returned document) |
| `DELETE` | **Soft-delete a draft only.** No approved or numbered document is ever deletable (CLAUDE.md §4.2). Cancellation, not deletion, is the path for anything submitted |
| `SUBMIT` | Send into the approval workflow |
| `APPROVE` / `REJECT` | Act on an assigned approval task |
| `CANCEL` | Cancel an approved document with a reason code |
| `SHORT_CLOSE` | Close the remaining open quantity with a reason |
| `AMEND` | Create a new revision of an approved document |
| `PRINT` | Generate/re-print the document PDF |
| `EXPORT` | Export list or report data to Excel/PDF/CSV |
| Entity-specific | `RELEASE`, `DISPATCH`, `MATCH`, `RATE`, `BLACKLIST`, `ACCEPT_EXCESS`, `OVERRIDE_PRICE`, `OVERRIDE_BUDGET`, `OPEN_SEALED`, `VIEW_RATES`, `VIEW_BANK`, `VIEW_COST`, `RECONCILE`, `REOPEN` |

### 10.2.2 Full catalogue

```
PROCUREMENT.DASHBOARD          VIEW · VIEW_ALL_PLANTS
PROCUREMENT.SUPPLIER           VIEW · VIEW_ALL · CREATE · EDIT · DELETE · SUBMIT · APPROVE ·
                               REJECT · HOLD · BLACKLIST · REINSTATE · RATE · VIEW_BANK ·
                               EDIT_BANK · PORTAL_MANAGE · PRINT · EXPORT · IMPORT
PROCUREMENT.AVL                VIEW · CREATE · EDIT · APPROVE · EXPORT
PROCUREMENT.PR                 VIEW · VIEW_ALL · CREATE · EDIT · DELETE · SUBMIT · APPROVE ·
                               REJECT · CANCEL · SHORT_CLOSE · AMEND · CONSOLIDATE ·
                               SET_SOURCING · PRINT · EXPORT
PROCUREMENT.RFQ                VIEW · CREATE · EDIT · DELETE · SUBMIT · APPROVE · REJECT ·
                               DISPATCH · AMEND · EXTEND · CANCEL · OPEN_SEALED · PRINT · EXPORT
PROCUREMENT.QUOTATION          VIEW · VIEW_RATES · CREATE · EDIT · DELETE · ACCEPT_PORTAL ·
                               RETURN_PORTAL · REVISE · NEGOTIATE · PRINT · EXPORT
PROCUREMENT.COMPARISON         VIEW · CREATE · EDIT · DELETE · CONFIGURE_WEIGHTS · RECOMMEND ·
                               AWARD · SUBMIT · APPROVE · REJECT · PRINT · EXPORT
PROCUREMENT.PO                 VIEW · VIEW_ALL · VIEW_RATES · CREATE · EDIT · DELETE · SUBMIT ·
                               APPROVE · REJECT · RELEASE · AMEND · CANCEL · SHORT_CLOSE ·
                               HOLD · REOPEN · OVERRIDE_PRICE · OVERRIDE_BUDGET · PRINT · EXPORT
PROCUREMENT.RATE_CONTRACT      VIEW · CREATE · EDIT · SUBMIT · APPROVE · AMEND · CLOSE · EXPORT
PROCUREMENT.SUBCONTRACT        VIEW · CREATE · APPROVE · RECONCILE · EXPORT
PROCUREMENT.GATE_ENTRY         VIEW · CREATE · EDIT · CANCEL · APPROVE_WITHOUT_PO · PRINT
PROCUREMENT.GRN                VIEW · VIEW_ALL · CREATE · EDIT · DELETE · SUBMIT · APPROVE ·
                               REJECT · CANCEL · REVERSE · ACCEPT_EXCESS · ACCEPT_DEVIATION ·
                               EDIT_BATCH_POSTED · PUTAWAY · PRINT · EXPORT
PROCUREMENT.RETURN             VIEW · CREATE · EDIT · SUBMIT · APPROVE · REJECT · DISPATCH ·
                               CANCEL · PRINT · EXPORT
PROCUREMENT.DEBIT_NOTE         VIEW · CREATE · EDIT · SUBMIT · APPROVE · REJECT · CANCEL ·
                               PRINT · EXPORT
PROCUREMENT.INVOICE            VIEW · CREATE · EDIT · DELETE · MATCH · RESOLVE_EXCEPTION ·
                               SUBMIT · APPROVE · REJECT · CANCEL · OVERRIDE_TOLERANCE ·
                               PRINT · EXPORT
PROCUREMENT.REPORT             VIEW · VIEW_COST · EXPORT · SCHEDULE
PROCUREMENT.SETTINGS           VIEW · EDIT · EDIT_TOLERANCE · EDIT_TEMPLATE · EDIT_REASON_CODE
```

## 10.3 Role × permission matrix

Legend: **✔** granted · **○** granted with scope restriction (see §10.4) · **—** not granted ·
**A** approval task only (cannot create) · **D** draft only

Roles map to the Vol 0 §4.1 catalogue; the client-named roles in the brief are shown against
their role codes.

| Entity · Action | Employee (requester) | Dept Head | Purchase Exec `PURCH_EXEC` | Purchase Mgr/Head `PURCH_HEAD` | Factory Mgr `FACTORY_HEAD` | Finance Mgr `CFO`/`ACCOUNTS` | Director `MD`/`CEO` | Store Mgr `STORE_HEAD` | Store Opr `STORE_OPR` | QC Mgr `QC_HEAD` | Planner `PPC` | Admin `SYS_ADMIN` | Auditor | Supplier portal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **DASHBOARD.VIEW** | ○ own | ○ dept | ✔ | ✔ | ✔ | ✔ | ✔ | ○ plant | ○ plant | ○ plant | ✔ | ✔ | ✔ | — |
| **DASHBOARD.VIEW_ALL_PLANTS** | — | — | — | ✔ | ✔ | ✔ | ✔ | — | — | — | — | ✔ | ✔ | — |
| **SUPPLIER.VIEW** | — | ○ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ○ | ✔ | ✔ | ✔ | ✔ | ○ own |
| SUPPLIER.CREATE / EDIT | — | — | ✔ | ✔ | — | — | — | — | — | — | — | ✔ | — | ○ own profile |
| SUPPLIER.DELETE (draft) | — | — | ✔ D | ✔ D | — | — | — | — | — | — | — | ✔ D | — | — |
| SUPPLIER.APPROVE / REJECT | — | — | — | ✔ | A | A | A | — | — | A | — | — | — | — |
| SUPPLIER.HOLD | — | — | — | ✔ | ✔ | — | ✔ | — | — | ✔ | — | — | — | — |
| SUPPLIER.BLACKLIST / REINSTATE | — | — | — | A | A | — | ✔ | — | — | — | — | — | — | — |
| SUPPLIER.RATE | — | — | ✔ | ✔ | — | — | — | — | — | ✔ | — | — | — | — |
| SUPPLIER.VIEW_BANK | — | — | — | ✔ | — | ✔ | ✔ | — | — | — | — | — | ✔ | ○ own |
| SUPPLIER.EDIT_BANK | — | — | — | — | — | ✔ | — | — | — | — | — | — | — | ○ request |
| SUPPLIER.PORTAL_MANAGE | — | — | ✔ | ✔ | — | — | — | — | — | — | — | ✔ | — | — |
| **AVL.VIEW** | — | ○ | ✔ | ✔ | ✔ | — | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ | — |
| AVL.CREATE / EDIT | — | — | ✔ | ✔ | — | — | — | — | — | ✔ | — | ✔ | — | — |
| AVL.APPROVE | — | — | — | ✔ | — | — | — | — | — | A | — | — | — | — |
| **PR.VIEW** | ○ own | ○ dept | ✔ | ✔ | ✔ | ✔ | ✔ | ○ plant | — | ○ plant | ✔ | ✔ | ✔ | — |
| PR.VIEW_ALL | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | ✔ | ✔ | ✔ | — |
| PR.CREATE / EDIT / SUBMIT | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ | — | — | — |
| PR.DELETE (draft) | ✔ own | ✔ own | ✔ | ✔ | ✔ | ✔ | — | ✔ own | ✔ own | ✔ own | ✔ | — | — | — |
| PR.APPROVE / REJECT | — | ✔ | — | ✔ | ✔ | ✔ | ✔ | — | — | — | — | — | — | — |
| PR.CANCEL / SHORT_CLOSE | ○ own draft | ✔ dept | ✔ | ✔ | ✔ | — | ✔ | — | — | — | ✔ | — | — | — |
| PR.AMEND | ✔ own | ✔ dept | ✔ | ✔ | ✔ | — | — | — | — | — | ✔ | — | — | — |
| PR.CONSOLIDATE / SET_SOURCING | — | — | ✔ | ✔ | — | — | — | — | — | — | ✔ | — | — | — |
| PR.PRINT / EXPORT | ✔ own | ✔ dept | ✔ | ✔ | ✔ | ✔ | ✔ | ○ | — | ○ | ✔ | ✔ | ✔ | — |
| **RFQ.VIEW** | — | — | ✔ | ✔ | ✔ | ○ | ✔ | — | — | ✔ | ✔ | ✔ | ✔ | ○ invited |
| RFQ.CREATE / EDIT / SUBMIT | — | — | ✔ | ✔ | — | — | — | — | — | — | — | — | — | — |
| RFQ.DELETE (draft) | — | — | ✔ D | ✔ D | — | — | — | — | — | — | — | — | — | — |
| RFQ.APPROVE / REJECT | — | — | — | ✔ | A | A | A | — | — | — | — | — | — | — |
| RFQ.DISPATCH | — | — | ○ | ✔ | — | — | — | — | — | — | — | — | — | — |
| RFQ.AMEND / EXTEND / CANCEL | — | — | ✔ | ✔ | — | — | — | — | — | — | — | — | — | — |
| RFQ.OPEN_SEALED | — | — | ✔ (1 of 2) | ✔ (1 of 2) | ✔ (1 of 2) | ✔ (1 of 2) | ✔ | — | — | — | — | — | — | — |
| RFQ.PRINT / EXPORT | — | — | ✔ | ✔ | ✔ | ○ | ✔ | — | — | ✔ | ✔ | ✔ | ✔ | ○ own |
| **QUOTATION.VIEW** | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | ✔ | ○ | ✔ | ✔ | ○ own |
| **QUOTATION.VIEW_RATES** | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | — | — | ✔ | ○ own |
| QUOTATION.CREATE / EDIT | — | — | ✔ | ✔ | — | — | — | — | — | — | — | — | — | ○ own |
| QUOTATION.ACCEPT_PORTAL / RETURN | — | — | ✔ | ✔ | — | — | — | — | — | — | — | — | — | — |
| QUOTATION.REVISE / NEGOTIATE | — | — | ✔ | ✔ | — | — | — | — | — | — | — | — | — | — |
| QUOTATION.PRINT / EXPORT | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | ○ | — | ✔ | ✔ | ○ own |
| **COMPARISON.VIEW** | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | ○ tech | ○ | ✔ | ✔ | — |
| COMPARISON.CREATE / EDIT | — | — | ✔ | ✔ | — | — | — | — | — | — | — | — | — | — |
| COMPARISON.CONFIGURE_WEIGHTS | — | — | — | ✔ | — | — | — | — | — | ○ quality | — | ✔ | — | — |
| COMPARISON.AWARD / SUBMIT | — | — | ✔ | ✔ | — | — | — | — | — | — | — | — | — | — |
| COMPARISON.APPROVE / REJECT | — | — | — | ✔ | ✔ | ✔ | ✔ | — | — | A tech | — | — | — | — |
| COMPARISON.PRINT / EXPORT | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | ○ | — | ✔ | ✔ | — |
| **PO.VIEW** | ○ own PR | ○ dept | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ plant | ○ plant | ✔ plant | ✔ | ✔ | ✔ | ○ own |
| **PO.VIEW_RATES** | — | ○ dept | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | — | — | ✔ | ○ own |
| PO.CREATE / EDIT / SUBMIT | — | — | ✔ | ✔ | — | — | — | — | — | — | ○ subcon | — | — | — |
| PO.DELETE (draft) | — | — | ✔ D | ✔ D | — | — | — | — | — | — | — | — | — | — |
| PO.APPROVE / REJECT | — | — | — | ✔ | ✔ | ✔ | ✔ | — | — | — | A subcon | — | — | — |
| PO.RELEASE | — | — | ○ | ✔ | — | — | — | — | — | — | — | — | — | — |
| PO.AMEND | — | — | ✔ | ✔ | — | — | — | — | — | — | — | — | — | — |
| PO.CANCEL / SHORT_CLOSE / HOLD | — | — | ○ | ✔ | ✔ | — | ✔ | — | — | — | — | — | — | — |
| PO.REOPEN | — | — | — | — | — | ✔ | ✔ | — | — | — | — | — | — | — |
| PO.OVERRIDE_PRICE | — | — | — | ✔ | ✔ | — | ✔ | — | — | — | — | — | — | — |
| PO.OVERRIDE_BUDGET | — | — | — | — | — | ✔ | ✔ | — | — | — | — | — | — | — |
| PO.PRINT / EXPORT | — | ○ dept | ✔ | ✔ | ✔ | ✔ | ✔ | ○ no rates | ○ no rates | ○ no rates | ✔ | ✔ | ✔ | ○ own |
| **RATE_CONTRACT.VIEW** | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | ✔ | ✔ | ✔ | ○ own |
| RATE_CONTRACT.CREATE / EDIT | — | — | ✔ | ✔ | — | — | — | — | — | — | — | — | — | — |
| RATE_CONTRACT.APPROVE / CLOSE | — | — | — | ✔ | A | ✔ | ✔ | — | — | — | — | — | — | — |
| **SUBCONTRACT.VIEW** | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ○ | ✔ | ✔ | ✔ | ✔ | ○ own |
| SUBCONTRACT.CREATE | — | — | ✔ | ✔ | — | — | — | — | — | — | ✔ | — | — | — |
| SUBCONTRACT.APPROVE | — | — | — | ✔ | ✔ | — | — | — | — | — | A | — | — | — |
| SUBCONTRACT.RECONCILE | — | — | ✔ | ✔ | — | ○ | — | ✔ | — | — | ✔ | — | — | — |
| **GATE_ENTRY.VIEW / CREATE** | — | — | ○ view | ○ view | ○ view | — | ○ view | ✔ | ✔ | — | — | ✔ | ✔ | — |
| GATE_ENTRY.EDIT / CANCEL | — | — | — | — | — | — | — | ✔ | ○ same shift | — | — | ✔ | — | — |
| GATE_ENTRY.APPROVE_WITHOUT_PO | — | — | — | ✔ | ✔ | — | — | ✔ | — | — | — | — | — | — |
| **GRN.VIEW** | ○ own PR | ○ dept | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ○ own |
| GRN.CREATE / EDIT / SUBMIT | — | — | — | — | — | — | — | ✔ | ✔ | — | — | — | — | — |
| GRN.DELETE (draft) | — | — | — | — | — | — | — | ✔ D | ✔ own D | — | — | — | — | — |
| GRN.APPROVE / REJECT | — | — | — | A excess | A | — | — | ✔ | — | — | — | — | — | — |
| GRN.ACCEPT_EXCESS | — | — | — | ✔ | ✔ | — | — | ○ within tol | — | — | — | — | — | — |
| GRN.ACCEPT_DEVIATION | — | — | — | A | A | — | — | — | — | ✔ | — | — | — | — |
| GRN.REVERSE | — | — | — | — | A | A | — | ✔ | — | — | — | — | — | — |
| GRN.EDIT_BATCH_POSTED | — | — | — | — | — | — | — | ✔ + reason | — | ✔ + reason | — | ✔ | — | — |
| GRN.PUTAWAY | — | — | — | — | — | — | — | ✔ | ✔ | — | — | — | — | — |
| GRN.PRINT / EXPORT | — | ○ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ○ own |
| **RETURN.VIEW** | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ | ○ own |
| RETURN.CREATE / EDIT / SUBMIT | — | — | ✔ | ✔ | — | — | — | ✔ | ○ | ○ | — | — | — | — |
| RETURN.APPROVE / REJECT | — | — | — | ✔ | ✔ | — | — | ✔ | — | A | — | — | — | — |
| RETURN.DISPATCH | — | — | — | — | — | — | — | ✔ | ✔ | — | — | — | — | — |
| **DEBIT_NOTE.VIEW** | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | ○ | — | ✔ | — | ✔ | ✔ | ○ own |
| DEBIT_NOTE.CREATE / SUBMIT | — | — | ✔ | ✔ | — | ✔ | — | — | — | — | — | — | — | — |
| DEBIT_NOTE.APPROVE / REJECT | — | — | — | ✔ | A | ✔ | ✔ | — | — | A quality | — | — | — | — |
| **INVOICE.VIEW** | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | ○ | — | — | — | ✔ | ✔ | ○ own |
| INVOICE.CREATE / EDIT | — | — | — | — | — | ✔ | — | — | — | — | — | — | — | ○ upload |
| INVOICE.MATCH / RESOLVE_EXCEPTION | — | — | ○ price | ✔ | — | ✔ | — | — | — | — | — | — | — | — |
| INVOICE.APPROVE / REJECT | — | — | — | A | A | ✔ | ✔ | — | — | — | — | — | — | — |
| INVOICE.OVERRIDE_TOLERANCE | — | — | — | ✔ | — | ✔ | ✔ | — | — | — | — | — | — | — |
| **REPORT.VIEW** | ○ own | ○ dept | ✔ | ✔ | ✔ | ✔ | ✔ | ○ plant | ○ plant | ○ plant | ✔ | ✔ | ✔ | — |
| **REPORT.VIEW_COST** | — | ○ dept | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | ○ | — | ✔ | — |
| REPORT.EXPORT / SCHEDULE | — | ○ | ✔ | ✔ | ✔ | ✔ | ✔ | ○ | — | ○ | ✔ | ✔ | ✔ | — |
| **SETTINGS.VIEW** | — | — | ○ | ✔ | ○ | ○ | ○ | ○ | — | ○ | — | ✔ | ✔ | — |
| SETTINGS.EDIT | — | — | — | ✔ | — | — | — | — | — | — | — | ✔ | — | — |
| SETTINGS.EDIT_TOLERANCE | — | — | — | ✔ | ✔ | ✔ | — | — | — | ✔ | — | ✔ | — | — |

### Notes on the matrix

- **Employee (requester)** is not a role code — it is any authenticated user with the base
  requisition grant. They may raise and track a PR and see the PO and GRN that resulted from
  *their own* PR, without rates.
- **Department Head** is resolved dynamically from the org structure (Vol 1 Ch 2), not held as a
  static role. Their scope is their own department's documents.
- **Purchase Executive** creates everything and approves nothing. **Purchase Manager / Head**
  approves within authority and additionally owns settings, supplier approval and rate contracts.
- **Director** does not create transactional documents. Read-all plus top-tier approval plus
  reopen/reinstate authority. Granting a director `CREATE` rights defeats the SoD design.
- **Auditor** is read-everything, write-nothing, enforced by the role-type blacklist
  (Vol 0 V0-BR-002), including full audit-log and override-register access.
- **Admin (`SYS_ADMIN`)** configures and never transacts: no `SUBMIT`, `APPROVE`, `RELEASE` or
  `MATCH` on any procurement document. Configuration authority and transaction authority are
  different things, and combining them removes the last independent control.
- **Supplier portal** holds no internal permission at all; its access is a separate
  external-principal scope over its own records only.

## 10.4 Data scope rules

| Scope dimension | Applied to | Rule |
|---|---|---|
| **Company** | Everything | Mandatory, injected by the base repository (CLAUDE.md §4.3). Cross-company reads require `SYSTEM.CROSS_COMPANY_READ` |
| **Branch / Plant** | PR, RFQ, PO, GRN, return, invoice | Users are granted one or more plants; documents outside are invisible, not merely unlistable |
| **Warehouse / Store** | Gate entry, GRN, put-away | Store operators see only their assigned stores |
| **Department** | PR | Department Heads and requesters see their own department; buyers see all |
| **Cost centre** | PR, PO, budget widgets | Cost-centre owners see their own; Finance sees all |
| **Own records** | PR (`VIEW` without `VIEW_ALL`), quotations entered by self | Creator-scoped |
| **Supplier ownership** | Supplier 360, RFQ, quotations | Where buyers are assigned to supplier portfolios, an optional restriction to own portfolio |
| **External principal** | Supplier portal | Hard-bound to one supplier id; every query filtered by it; enumeration of other suppliers impossible |

**V3-PRC-BR-006 (M)** Scope is enforced in the repository layer, not in the router. A new
endpoint inherits scoping automatically; an endpoint that bypasses the base repository fails CI
review (CLAUDE.md §4.3).

## 10.5 Field-level security

| Entity | Field group | Visible to | Editable by |
|---|---|---|---|
| Supplier | Bank account, IFSC, beneficiary | `SUPPLIER.VIEW_BANK` | `SUPPLIER.EDIT_BANK` (Finance) + approval + cooling period |
| Supplier | PAN, GSTIN, Udyam | All with `SUPPLIER.VIEW` | Purchase Exec/Head, admin |
| Supplier | Rating components and drill data | `SUPPLIER.VIEW` | System-computed; manual override needs `SUPPLIER.RATE` |
| Quotation | Rate, discount, tax, value, landed cost | `QUOTATION.VIEW_RATES` | Purchase Exec/Head only |
| Comparison | Cost columns and scores | `QUOTATION.VIEW_RATES` | — |
| Comparison | Technical/spec columns | All comparison viewers (incl. QC technical evaluator) | QC for technical scores |
| RFQ | Target price / should-cost | Purchase Exec/Head, Purchase Manager | Purchase Head |
| RFQ | Vendor list before dispatch | Buyer, Purchase Head | Buyer |
| PO | Rate, discount, tax, value, totals | `PO.VIEW_RATES` | Buyer in draft only |
| PO | Delivery date, quantity, item, specification | All PO viewers (stores need these) | Buyer in draft; amendment thereafter |
| GRN | Rate, landed rate, value | `PO.VIEW_RATES` | Never editable |
| GRN | Quantity, batch, heat, dates, bin | Stores, QC, buyer | Stores in draft; privileged after posting |
| Invoice | All value and tax fields | `INVOICE.VIEW` + `REPORT.VIEW_COST` | Accounts |
| Any document | Internal approval comments | Approvers, originator, auditor | Author only, append-only thread |
| Any document | Supplier-facing remarks | All + portal | Buyer |

**V3-PRC-BR-007 (M)** Field-level restriction is applied in the **response serialiser**, so a
restricted field is absent from the API payload — not present-but-hidden in the UI. Tested by
asserting the field is absent from the JSON for a restricted role.

## 10.6 Segregation of duties — enforced pairs

Each row is enforced by the workflow engine and covered by an automated test.

| Conflicting pair | Enforcement |
|---|---|
| Create PR / Approve PR | Engine blocks self-approval; escalates when the requester is the department head |
| Create supplier / Approve supplier qualification | Creator excluded from the approval chain; inviting buyer excluded for self-registrations |
| Create comparison / Approve award | Creator excluded |
| Create PO / Approve PO | Creator excluded at every level |
| Approve comparison / Sole approver of the resulting PO | Discouraged by configuration; flagged where unavoidable |
| GRN entry / GRN approval | Different users |
| GRN entry / QC inspection decision | Different users |
| GRN approval / Purchase return approval for the same lot | Different users above a value threshold |
| Invoice verification / Invoice approval above authority | Different users |
| Invoice approval / Payment release (Vol 9) | Different users |
| Supplier bank edit / Bank change approval | Different users; Finance approves, Purchase cannot |
| Budget override request / Budget override approval | Requester ≠ Finance approver |
| Configure approval matrix / Approve documents | `SYS_ADMIN` holds no approval permission |
| Configure tolerance / Use the tolerance override | Different users where the value exceeds a threshold |

## 10.7 Special-purpose grants

| Grant | Who typically holds it | Why it is separate |
|---|---|---|
| `PO.OVERRIDE_PRICE` | Purchase Head, Factory Head, Director | Price control is the module's central financial control; overriding it must be a deliberate, rare, reported act |
| `PO.OVERRIDE_BUDGET` | Finance Manager, Director | Budget is Finance's control, not Procurement's |
| `GRN.ACCEPT_EXCESS` | Purchase Manager, Factory Head | Excess stock is unauthorised inventory and unauthorised spend |
| `GRN.ACCEPT_DEVIATION` | QC Head (+ Factory Head above a value) | Quality concession is a quality decision, never a commercial one |
| `GRN.EDIT_BATCH_POSTED` | Store Head, QC Head, admin | Batch is the traceability key; correcting it must be rare and audited |
| `RFQ.OPEN_SEALED` | Two of {Purchase Head, Factory Head, Finance Manager, Director} | Dual control on sealed bids |
| `SUPPLIER.VIEW_BANK` / `EDIT_BANK` | Finance, Purchase Head (view only) | Vendor bank fraud vector |
| `PO.REOPEN` | Finance Manager, Director | Reopening a closed PO reopens a closed accounting position |
| `INVOICE.OVERRIDE_TOLERANCE` | Purchase Head, Finance Manager | Directly authorises paying more than agreed |
| `SYSTEM.UNMASK_PII` | Named individuals only | Vol 1 Ch 1; every use audited |

**V3-PRC-BR-008 (M)** Every use of a grant in this table writes an entry to the override
register (Ch 9 R-65) with the document, the value, the reason and the authorising user, and
appears in the monthly governance pack.

## 10.8 Onboarding defaults

Seeded role bundles the client can adopt directly:

| Client role name | Role code | Bundle |
|---|---|---|
| Employee / Requester | `REQUESTER` | PR create/edit/submit/view own, PR print, own-PR document flow view |
| Department Head | derived from org | Requester bundle + PR approve/view dept + dept reports + dept cost view |
| Purchase Executive | `PURCH_EXEC` | Supplier create/edit, AVL, PR view all + consolidate + sourcing, RFQ full except approve, quotation full, comparison create/award, PO create/amend, rate contract create, expediting, returns/debit notes create, reports |
| Purchase Manager | `PURCH_MGR` | Purchase Executive bundle + PR/RFQ/comparison/PO approve within authority + price override + settings view |
| Purchase Head | `PURCH_HEAD` | Purchase Manager bundle + supplier approve/hold/blacklist-propose + rate contract approve + settings edit + all-plant view |
| Factory Manager | `FACTORY_HEAD` | Approve PR/PO/comparison/subcontract/return within authority, GRN excess approve, deviation approve (with QC), all-plant view, reports with cost |
| Finance Manager | `CFO` / `ACCOUNTS` | PO finance verification approve, invoice full, debit note approve, budget override, supplier bank edit, GRIR, all financial reports |
| Director | `MD` / `CEO` | View all, top-tier approve, blacklist/reinstate, PO reopen, governance reports; **no create** |
| Store Manager | `STORE_HEAD` | Gate entry, GRN full incl. approve/reverse/put-away, return create/approve/dispatch, plant-scoped, no rates |
| Store Operator | `STORE_OPR` | Gate entry create, GRN create/edit own draft, put-away, scan, store-scoped, no rates |
| QC Manager | `QC_HEAD` | Inspection decision (Vol 7), deviation approve, supplier quality rating, AVL quality qualification, quality reports, GRN view |
| Planner | `PPC` | PR from MRP, consolidate, subcontract PO create, expediting view, planning reports |
| Admin | `SYS_ADMIN` | All settings, numbering, matrices, templates, master maintenance; **no transaction or approval permission** |
| Internal Auditor | `AUDITOR` | Read-all + audit log + override register; write nowhere |
| Supplier | `SUPPLIER_PORTAL` | Own RFQ response, PO acknowledge, ASN, invoice upload, document renewal, scorecard view |

## 10.9 Acceptance criteria (extract)

- Every procurement endpoint declares a permission; an endpoint without one fails CI
  (CLAUDE.md §5.4).
- Each endpoint returns 403 for a user lacking its permission, asserted by an automated test per
  endpoint.
- A `STORE_OPR` fetching a PO by uid receives the document **without** rate, amount or tax fields
  present in the JSON.
- A plant-2 buyer cannot retrieve a plant-1 GRN by uid; the response is 404, not 403, so
  existence is not disclosed.
- A supplier-portal principal requesting another supplier's RFQ receives 404 and the attempt is
  audited.
- `SYS_ADMIN` cannot approve a purchase order, even after granting themselves every role,
  because `SYS_ADMIN` is blacklisted from transactional approval permissions.
- An `AUDITOR` receives 403 on every POST, PATCH and DELETE in the module.
- A user with `PO.APPROVE` but an approval authority of ₹10 L cannot approve a ₹20 L PO; the
  engine escalates and records the reason.
- Every use of `PO.OVERRIDE_PRICE` appears in the override register within the same transaction.

---

**Next:** [Chapter 11 — Data Model](11-data-model.md)
