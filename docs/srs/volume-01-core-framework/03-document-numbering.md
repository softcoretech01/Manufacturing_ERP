# Volume 1 · Chapter 3 — Document Numbering

**Area code:** `NUM`
Prerequisite: [Volume 0](../volume-00-foundation.md) §11 (Document numbering standard — format
tokens, rules and data model are defined there and not repeated here)

---

## 3.1 Objective and scope

Provide one engine that issues every document number in the system, configurable per company,
branch, plant, document type and financial year, with gapless guarantees where the law demands
them.

This chapter specifies the **service, screens and operational behaviour**. The format grammar,
core rules (V0-BR-025…029) and schema live in Volume 0 §11.

**Why this is a framework service and not a per-module concern:** a tax invoice series with a
gap is a GST compliance failure; a PO series that resets wrongly at year end breaks every open
commitment report. Twenty modules each rolling their own sequence would produce twenty
different failure modes.

---

## 3.2 Functional requirements

| Ref | Pri | Requirement |
|---|---|---|
| **V1-NUM-FR-001** | M | A numbering series MUST be definable for every document type, optionally discriminated by branch, plant and sub-type, and always by financial year where the reset frequency is financial-yearly. |
| **V1-NUM-FR-002** | M | The format is a token string (V0 §11.1) with a **live preview** showing the next three numbers as the administrator types. |
| **V1-NUM-FR-003** | M | Each series declares `allocate_on`: `DRAFT` (number visible immediately) or `APPROVAL` (number issued at approval/posting). Statutory series MUST be `APPROVAL`. |
| **V1-NUM-FR-004** | M | Each series declares `is_gapless`. Gapless series allocate under a distributed lock and record every allocation in `core_number_allocation` so gaplessness is **provable**, not assumed. |
| **V1-NUM-FR-005** | M | Series MUST auto-roll at financial year change: on the first allocation after the FY boundary, a new series instance for the new FY is created from the template, with the sequence reset per `reset_frequency`. |
| **V1-NUM-FR-006** | M | The system MUST warn when a series is within 10% of exhausting its padded width (e.g. `{SEQ:4}` at 9,000) and MUST NOT silently overflow the padding. Overflow either widens (configurable) or blocks with an actionable error. |
| **V1-NUM-FR-007** | M | Manual number override requires `SYSTEM.NUMBERING.OVERRIDE`, is blocked for statutory series, validates uniqueness within the series, and is audited with the reason. |
| **V1-NUM-FR-008** | M | A **series simulator** MUST let an administrator test a format against sample context (company, branch, plant, date, FY) without consuming a number. |
| **V1-NUM-FR-009** | M | Voided allocations (draft abandoned, transaction rolled back) MUST be recorded as `VOIDED` in the allocation table, never silently reused. For gapless statutory series, a voided number MUST be reported in statutory returns as a cancelled document. |
| **V1-NUM-FR-010** | M | Where a number is allocated at draft time and the draft is deleted, the allocation is marked `VOIDED` with the reason, producing a visible, explicable gap for non-statutory series. |
| **V1-NUM-FR-011** | M | Migration support: a series MUST be initialisable with a `start_number` other than 1, so that a company migrating mid-year continues its existing sequence rather than restarting. |
| **V1-NUM-FR-012** | S | Series MAY be defined per user-defined dimension (e.g. separate invoice series for domestic vs export) via `sub_type`. |

---

## 3.3 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V1-NUM-BR-001** | M | Exactly one series per (company, branch, plant, document type, sub-type, FY) may be `is_default`. Allocation without an explicit series uses the default; if none exists, the transaction is blocked with a configuration error naming the missing series — never with a silent fallback. |
| **V1-NUM-BR-002** | M | Allocation is atomic. The sequence increment and the allocation record are written in one transaction under a Redis lock keyed `numseries:{series_id}`, with a 5-second bounded wait. |
| **V1-NUM-BR-003** | M | For `is_gapless` series, the number is allocated **inside** the same database transaction that persists the document. If the document transaction rolls back, the allocation rolls back with it, so no gap is created. |
| **V1-NUM-BR-004** | M | For non-gapless series, allocation may occur before document persistence; failures produce `VOIDED` allocations and visible gaps, which is acceptable and expected. |
| **V1-NUM-BR-005** | M | A formatted document number MUST be unique within (company, document_type). Enforced by a unique index on the document table as well as by the allocation table. |
| **V1-NUM-BR-006** | M | Cancelling a document does not release its number (V0-BR-027). The number remains bound to the cancelled document forever. |
| **V1-NUM-BR-007** | M | A series MUST NOT be edited (format, padding, prefix) once it has issued at least one number, except to widen padding or extend validity. Format changes require creating a new series with a new validity window. |
| **V1-NUM-BR-008** | M | Statutory series (`is_statutory = 1`) MUST have `is_gapless = 1` and `allocate_on = APPROVAL`, and the system MUST NOT allow saving a statutory series violating either. |
| **V1-NUM-BR-009** | M | GST invoice numbers MUST be ≤ 16 characters and MUST contain only alphanumerics, hyphen and slash — a statutory constraint. The series editor MUST validate the maximum possible generated length against this at save time, not at allocation time. |
| **V1-NUM-BR-010** | M | Deleting a series is permitted only if it has issued no numbers. Otherwise it may only be deactivated. |

---

## 3.4 Allocation algorithm

```
allocate(document_type, sub_type, context, transaction) → formatted_number

  1. resolve series:
       match on (company, branch, plant, document_type, sub_type, FY-of-document-date)
       falling back progressively: plant → branch → company level
       if none and a default exists at company level → use it
       if none at all → raise ConfigurationError("No numbering series defined for …")

  2. validate:
       series.is_active AND document_date within [valid_from, valid_to]
       period/FY of document_date is open

  3. if series.reset_frequency triggers a reset for this date and last_reset_on is stale:
       reset current_number to start_number - increment_by
       set last_reset_on

  4. acquire redis lock "numseries:{series.id}" (wait ≤ 5s, ttl 10s)
       4a. SELECT … FOR UPDATE on core_number_series
       4b. next = current_number + increment_by
       4c. if width(next) > padding_width:
              if allow_widen → widen padding
              else → raise SeriesExhausted
       4d. UPDATE current_number = next
       4e. formatted = render(format_string, tokens, next)
       4f. INSERT core_number_allocation (series, next, formatted, entity_type,
                                          entity_id, ALLOCATED)
   5. release lock

  6. if series.is_gapless:
        step 4 executed inside the caller's transaction → rollback removes the allocation
     else:
        step 4 committed independently → a rollback leaves a VOIDED allocation

  7. return formatted
```

**Deadlock note:** the lock is always acquired *after* all other business validation and
immediately *before* persistence, and is held for the shortest possible span. No other lock is
acquired while holding a numbering lock.

---

## 3.5 Seeded series (defaults)

| Document type | Code | Default format | Statutory | Gapless | Allocate on | Reset |
|---|---|---|---|---|---|---|
| Purchase Requisition | `PURCHASE_REQUISITION` | `PR/{FY}/{SEQ:5}` | No | No | DRAFT | FY |
| RFQ | `RFQ` | `RFQ/{FY}/{SEQ:4}` | No | No | DRAFT | FY |
| Supplier Quotation | `SUPPLIER_QUOTATION` | `SQ/{FY}/{SEQ:4}` | No | No | DRAFT | FY |
| Purchase Order | `PURCHASE_ORDER` | `PO/{FY}/{SEQ:5}` | No | No | APPROVAL | FY |
| Purchase Amendment | `PO_AMENDMENT` | `{PO_NO}-R{REV}` | No | No | APPROVAL | — |
| GRN | `GRN` | `{PLANT}/GRN/{FY}/{SEQ:5}` | No | Yes | APPROVAL | FY |
| Purchase Return | `PURCHASE_RETURN` | `{PLANT}/PRT/{FY}/{SEQ:4}` | Yes | Yes | APPROVAL | FY |
| Debit Note | `DEBIT_NOTE` | `DN/{FY}/{SEQ:4}` | Yes | Yes | APPROVAL | FY |
| Lead | `LEAD` | `LD/{FY}/{SEQ:5}` | No | No | DRAFT | FY |
| Quotation | `QUOTATION` | `QT/{FY}/{SEQ:5}` | No | No | DRAFT | FY |
| Sales Order | `SALES_ORDER` | `SO/{FY}/{SEQ:5}` | No | No | APPROVAL | FY |
| Tax Invoice (domestic) | `SALES_INVOICE` / `DOMESTIC` | `{BRANCH}/INV/{FY}/{SEQ:5}` | **Yes** | **Yes** | APPROVAL | FY |
| Tax Invoice (export) | `SALES_INVOICE` / `EXPORT` | `{BRANCH}/EXP/{FY}/{SEQ:4}` | **Yes** | **Yes** | APPROVAL | FY |
| Credit Note | `CREDIT_NOTE` | `CN/{FY}/{SEQ:4}` | **Yes** | **Yes** | APPROVAL | FY |
| Delivery Challan | `DELIVERY_CHALLAN` | `{PLANT}/DC/{FY}/{SEQ:5}` | **Yes** | **Yes** | APPROVAL | FY |
| Job-work Challan | `JOBWORK_CHALLAN` | `{PLANT}/JW/{FY}/{SEQ:4}` | **Yes** | **Yes** | APPROVAL | FY |
| Stock Transfer | `STOCK_TRANSFER` | `ST/{FY}/{SEQ:5}` | No | No | APPROVAL | FY |
| Stock Adjustment | `STOCK_ADJUSTMENT` | `ADJ/{FY}/{SEQ:4}` | No | No | APPROVAL | FY |
| Material Issue | `MATERIAL_ISSUE` | `{PLANT}/MI/{FY}/{SEQ:6}` | No | No | APPROVAL | FY |
| Material Return | `MATERIAL_RETURN` | `{PLANT}/MR/{FY}/{SEQ:5}` | No | No | APPROVAL | FY |
| Production Order | `PRODUCTION_ORDER` | `PRD/{YY}{MM}/{SEQ:4}` | No | No | DRAFT | Monthly |
| Work Order | `WORK_ORDER` | `WO/{YY}{MM}/{SEQ:5}` | No | No | DRAFT | Monthly |
| Batch | `BATCH` | `B{YY}{MM}{DD}{SEQ:3}` | No | No | DRAFT | Daily |
| Inspection Report | `INSPECTION` | `QC/{FY}/{SEQ:5}` | No | No | DRAFT | FY |
| NCR | `NCR` | `NCR/{FY}/{SEQ:4}` | No | No | DRAFT | FY |
| CAPA | `CAPA` | `CAPA/{FY}/{SEQ:4}` | No | No | DRAFT | FY |
| Packing Order | `PACKING_ORDER` | `{PLANT}/PK/{FY}/{SEQ:5}` | No | No | DRAFT | FY |
| Carton | `CARTON` | `CTN{YY}{SEQ:7}` | No | No | DRAFT | Yearly |
| Pallet | `PALLET` | `PLT{YY}{SEQ:6}` | No | No | DRAFT | Yearly |
| Shipment | `SHIPMENT` | `SHP/{FY}/{SEQ:5}` | No | No | APPROVAL | FY |
| Journal Voucher | `JOURNAL_VOUCHER` | `JV/{FY}/{SEQ:5}` | Yes | Yes | APPROVAL | FY |
| Receipt Voucher | `RECEIPT_VOUCHER` | `RV/{FY}/{SEQ:5}` | Yes | Yes | APPROVAL | FY |
| Payment Voucher | `PAYMENT_VOUCHER` | `PV/{FY}/{SEQ:5}` | Yes | Yes | APPROVAL | FY |
| Maintenance Work Order | `MAINT_WO` | `MWO/{FY}/{SEQ:4}` | No | No | DRAFT | FY |
| Asset Code | `ASSET` | `AST/{SEQ:5}` | No | No | DRAFT | Never |
| Employee Code | `EMPLOYEE` | `EMP{SEQ:4}` | No | No | DRAFT | Never |
| Customer Code | `CUSTOMER` | `CUS{SEQ:5}` | No | No | DRAFT | Never |
| Supplier Code | `SUPPLIER` | `SUP{SEQ:5}` | No | No | DRAFT | Never |
| Item Code | `ITEM` | *manual by default* | No | No | — | — |

**V1-NUM-BR-011 (M)** Item codes default to manual entry because manufacturers almost always
have an established, meaningful item-coding convention. A series is available but not default.

---

## 3.6 Screens

### S-NUM-01 · Numbering Series List

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Document Numbering                             [ + New series ] [Simulator] [Export]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Document type…  [Branch ▼] [Plant ▼] [FY ▼] [Statutory ▼]  [x] Active only    ⟳     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Document type      │Sub  │Br │Pl│ FY    │ Format              │ Next        │Used │ ⋮  │
│ Purchase Order     │ —   │ * │ *│25-26  │ PO/{FY}/{SEQ:5}     │ PO/25-26/…43│  42 │ ⋮  │
│ GRN                │ —   │ * │P1│25-26  │ {PLANT}/GRN/{FY}/…  │ P1/GRN/…318 │ 317 │ ⋮  │
│ Tax Invoice ⚖      │DOM  │CHN│ *│25-26  │ {BRANCH}/INV/{FY}/… │ CHNINV…0190 │ 189 │ ⋮  │
│ Tax Invoice ⚖      │EXP  │CHN│ *│25-26  │ {BRANCH}/EXP/{FY}/… │ CHNEXP…0024 │  23 │ ⋮  │
│ Credit Note   ⚖    │ —   │CHN│ *│25-26  │ CN/{FY}/{SEQ:4}     │ CN/25-26/…12│  11 │ ⋮  │
│ Carton             │ —   │ * │ *│  —    │ CTN{YY}{SEQ:7}      │ CTN26008841 │8840 │ ⋮  │
│ Work Order    ⚠    │ —   │ * │P1│26-07  │ WO/{YY}{MM}/{SEQ:5} │ WO/2607/…    │9214 │ ⋮  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚖ Statutory (gapless, allocated on approval)                                           │
│ ⚠ Work Order series is at 92% of its {SEQ:5} capacity. Widen padding or reset earlier.  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-NUM-02 · Series Editor

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Numbering Series — Tax Invoice (Domestic)                    [Cancel]  [Save]       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Applies to ───────────────────────────┐ ┌─ Behaviour ───────────────────────────┐  │
│ │ Document type * [Tax Invoice ▼] 🔒     │ │ [x] Statutory document  ⚖             │  │
│ │ Sub-type        [Domestic ▼]           │ │ [x] Gapless (enforced by statutory)🔒 │  │
│ │ Company *       [SSB Industries ▼] 🔒  │ │ Allocate on  ( ) Draft (•) Approval🔒 │  │
│ │ Branch          [Chennai (HO) ▼]       │ │ Reset        [Financial year ▼]       │  │
│ │ Plant           [All ▼]                │ │ Start number [1        ]              │  │
│ │ Financial year  [FY25-26 ▼]            │ │ Increment by [1        ]              │  │
│ │ Valid 01-Apr-2025 → 31-Mar-2026        │ │ Padding      [5 ▼]  [ ] auto-widen    │  │
│ │ [x] Default for this combination        │ │ [x] Active                            │  │
│ └────────────────────────────────────────┘ └───────────────────────────────────────┘  │
├─ Format ───────────────────────────────────────────────────────────────────────────────┤
│  [{BRANCH}{PREFIX}{FY}{SEQ:5}                                                     ]    │
│  Insert token: [{PREFIX}][{BRANCH}][{PLANT}][{FY}][{YY}][{MM}][{DD}][{SEQ:n}][{SEP}]   │
│  Prefix [INV]   Suffix [ ]   Separator [ ]                                             │
│                                                                                        │
│  ┌─ Live preview ────────────────────────────────────────────────────────────────────┐ │
│  │  Next three numbers:   CHNINV25-2600190                                           │ │
│  │                        CHNINV25-2600191                                           │ │
│  │                        CHNINV25-2600192                                           │ │
│  │  Maximum length: 19 characters                                                    │ │
│  │  ⛔ GST invoice numbers must not exceed 16 characters (Rule 46(b) CGST Rules).     │ │
│  │     Reduce the prefix or padding.                                                 │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Current number  189      Numbers issued  189      Last issued  27-Jul-2026 16:42      │
│  ⚠ This series has issued numbers. Format, prefix and padding are locked; you may only │
│    widen padding or extend validity. To change the format, create a new series.        │
│                                              [ View allocation log ]                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-NUM-03 · Allocation Log / Gapless Proof

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Allocation Log — Tax Invoice (Domestic) · Chennai · FY25-26                           │
│  [Date range: 01-Apr-2025 → 28-Jul-2026] [Status ▼]         [Export] [Gap analysis]    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  ✔ Gapless verified: 189 numbers issued, sequence 1–189, 0 gaps, 2 voided (documented) │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Seq │ Number             │ Document        │ Status    │ Allocated           │ By      │
│ 189 │ CHNINV25-2600189   │ INV → Reliance  │ CONSUMED  │ 27-Jul-2026 16:42   │ kraman  │
│ 188 │ CHNINV25-2600188   │ INV → Metro Cash│ CONSUMED  │ 27-Jul-2026 14:10   │ kraman  │
│ 187 │ CHNINV25-2600187   │ (cancelled inv) │ CONSUMED  │ 26-Jul-2026 11:33   │ kraman  │
│     │                    │ ⓘ Document cancelled 26-Jul. Number retained; reported as   │
│     │                    │   cancelled in GSTR-1.                                      │
│ 186 │ CHNINV25-2600186   │ INV → Amazon    │ CONSUMED  │ 26-Jul-2026 10:02   │ kraman  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-NUM-04 · Simulator

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Numbering Simulator                    ⓘ Does not consume a number                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Format   [{PLANT}{SEP}{PREFIX}{SEP}{FY}{SEP}{SEQ:5}                              ]    │
│  Prefix [GRN]  Separator [/]  Padding [5]                                              │
│  Context: Company [SSB ▼] Branch [Chennai ▼] Plant [Plant 1 ▼]                         │
│           Document date [28-Jul-2026]  →  FY26-27   Current sequence [317]             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Result:  P1/GRN/26-27/00318                          Length 20                        │
│           Next 5: …00318, …00319, …00320, …00321, …00322                               │
│  On 01-Apr-2027 (FY roll):  P1/GRN/27-28/00001                                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3.7 API

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/number-series` | `SYSTEM.NUMBERING.VIEW` | Filter by doc type, branch, plant, FY |
| POST | `/api/v1/number-series` | `SYSTEM.NUMBERING.EDIT` | Validates statutory constraints |
| GET/PATCH | `/api/v1/number-series/{uid}` | `.VIEW` / `.EDIT` | Locked fields rejected after first issue |
| POST | `/api/v1/number-series/{uid}/deactivate` | `.EDIT` | |
| POST | `/api/v1/number-series/preview` | `.VIEW` | Format + context → next 3 numbers, length, validation |
| POST | `/api/v1/number-series/simulate` | `.VIEW` | Full simulator, including FY roll |
| GET | `/api/v1/number-series/{uid}/allocations` | `.VIEW` | Allocation log, filterable |
| GET | `/api/v1/number-series/{uid}/gap-analysis` | `.VIEW` | Gaps with explanation per gap |
| POST | `/api/v1/number-series/{uid}/reset` | `.EDIT` | Manual reset; blocked for statutory mid-year |
| GET | `/api/v1/number-series/exhaustion-warnings` | `.VIEW` | Series near capacity |

Internal service interface (not exposed over HTTP):

```python
class NumberingService:
    def allocate(self, *, document_type: str, sub_type: str | None,
                 context: NumberingContext, session: Session) -> str: ...
    def void(self, *, formatted_number: str, reason: str, session: Session) -> None: ...
    def preview(self, *, series_id: int, count: int = 3) -> list[str]: ...
```

---

## 3.8 Events

| Event | When |
|---|---|
| `numbering.series.created` / `.updated` / `.deactivated` | Configuration change |
| `numbering.series.rolled_over` | Automatic FY/month/day reset performed |
| `numbering.series.exhaustion_warning` | ≥90% of padded capacity used |
| `numbering.number.allocated` | Every allocation (low-volume subscribers only; not for dashboards) |
| `numbering.number.voided` | Allocation voided, with reason |
| `numbering.override.used` | Manual number override |

---

## 3.9 Reports

| Report | Content |
|---|---|
| Numbering Series Master | All series with format, current number, usage, statutory flags |
| Allocation Log | Every number issued, with document, status, user, timestamp |
| **Gap Analysis** | Per series: missing sequences with the reason each is missing — the artefact a GST auditor asks for |
| Voided Numbers | All voided allocations with reason and user |
| Override Log | Every manual override, with justification |
| Series Exhaustion | Series approaching capacity, with projected exhaustion date |

---

## 3.10 Acceptance criteria (extract)

- 500 concurrent allocations against one gapless series produce 500 distinct, consecutive
  numbers with no duplicates and no gaps.
- A document transaction that rolls back after allocating from a gapless series leaves no gap
  and no orphaned allocation.
- Saving a statutory series with `allocate_on = DRAFT` is rejected.
- A GST invoice format whose maximum rendered length exceeds 16 characters is rejected at save
  time with the computed length shown.
- On 1 April, the first PO allocation creates the new FY series automatically and returns
  `PO/26-27/00001`.
- Cancelling an invoice retains its number, and Gap Analysis reports zero gaps while listing
  the cancelled number.
- Attempting to change the format of a series that has issued numbers is rejected with an
  explanation and a "create new series" path.

---

**Next:** [Chapter 4 — Workflow & Approval Engine](04-workflow-and-approvals.md)
