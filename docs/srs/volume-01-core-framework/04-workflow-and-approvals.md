# Volume 1 · Chapter 4 — Workflow & Approval Engine

**Area code:** `WFL`
Prerequisite: [Volume 0](../volume-00-foundation.md) §10 (Standard transaction document
pattern), [Chapter 1](01-identity-and-access.md) (approval authority, delegation)

---

## 4.1 Objective and scope

Provide one configurable approval and workflow engine used by every document in every module,
so that authority limits, routing, escalation and delegation are defined once by an
administrator and never coded per module.

**In scope:** approval matrix, multi-level and parallel approval, conditional routing, workflow
designer, SLA and escalation, delegation and out-of-office, recall, rework loops, approvals
inbox, bulk approval, mobile approval, audit of every decision.

**Out of scope:** the specific approval limits for each document type (client configuration
data, seeded per domain volume); business validations that run before submission (each
module's own rules).

---

## 4.2 Two configuration levels

The system supports two ways to configure approvals, because forcing every case through a
visual designer is as wrong as forcing every case through a rigid matrix:

```
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  LEVEL 1 — APPROVAL MATRIX  (covers ~90% of cases, no designer needed)        │
  │                                                                              │
  │  Document type + condition (amount band, category, plant, …)                 │
  │        → ordered list of approval levels                                     │
  │        → each level: approver (role / user / dynamic), quorum, SLA           │
  │                                                                              │
  │  Example: Purchase Order                                                     │
  │    ₹0 – ₹1,00,000       → L1 Purchase Head                                   │
  │    ₹1,00,001 – ₹10,00,000 → L1 Purchase Head → L2 Factory Head               │
  │    > ₹10,00,000        → L1 Purchase Head → L2 Factory Head → L3 CFO → L4 MD │
  └──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │  escalate to when the matrix is not enough
                                       ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  LEVEL 2 — WORKFLOW DESIGNER  (visual, for genuinely branching processes)     │
  │                                                                              │
  │  Nodes: Start · Approval · Condition · Parallel split/join · Action ·         │
  │         Notification · Wait · Sub-workflow · End                             │
  │                                                                              │
  │  Example: New Supplier Onboarding —                                          │
  │    Start → Purchase review → [is critical item?] ─yes→ Quality audit ─┐      │
  │                                                  └─no──────────────────┤      │
  │                              → Finance credit check → parallel{legal,   │      │
  │                                 compliance} → join → Approve → End      │      │
  └──────────────────────────────────────────────────────────────────────────────┘
```

**V1-WFL-BR-001 (M)** Every approvable document type MUST have at least a matrix
configuration. If no rule matches an instance, the system MUST fail closed — the document
cannot be submitted, and the error names the missing configuration. It MUST NOT auto-approve.

---

## 4.3 Functional requirements — approval matrix

| Ref | Pri | Requirement |
|---|---|---|
| **V1-WFL-FR-001** | M | Define approval rules per document type, scoped optionally to company, branch, plant, department or cost centre. |
| **V1-WFL-FR-002** | M | Rule conditions MUST support: amount band (min/max in a stated currency), item category, supplier/customer category, cost centre, plant, department, priority/urgency flag, requester's department, and a general boolean expression over the document's fields. |
| **V1-WFL-FR-003** | M | Each rule defines an ordered list of approval **levels**. Each level specifies: approver type (`ROLE`, `USER`, `DEPARTMENT_HEAD`, `REPORTING_MANAGER`, `COST_CENTRE_OWNER`, `PLANT_HEAD`, `DYNAMIC_EXPRESSION`), the approver value, approval mode (`ANY_ONE`, `ALL`, `QUORUM_N`), SLA hours, escalation target, and whether the level may be skipped when a condition holds. |
| **V1-WFL-FR-004** | M | Levels MUST be able to run **in parallel** as well as in sequence — e.g. Quality and Finance review a new supplier simultaneously, and both must complete before approval. |
| **V1-WFL-FR-005** | M | Rules are evaluated most-specific-first. Specificity order: plant → branch → company; within the same scope, the narrowest matching condition wins; ties are broken by an explicit `priority` integer on the rule. |
| **V1-WFL-FR-006** | M | A **rule simulator** MUST let an administrator enter sample document attributes and see exactly which rule matches and which approvers would be assigned, without creating a document. |
| **V1-WFL-FR-007** | M | Amount-band boundaries MUST be validated for gaps and overlaps at save time, and the editor MUST show a visual coverage bar of the configured bands. |

## 4.4 Functional requirements — execution

| Ref | Pri | Requirement |
|---|---|---|
| **V1-WFL-FR-008** | M | On submission, the engine resolves the applicable rule, creates a workflow instance with its levels and tasks, assigns level 1, and notifies the assignees. |
| **V1-WFL-FR-009** | M | Approvers MAY: **Approve**, **Reject** (reason mandatory), **Return for correction** (reason mandatory — sends the document back to the originator as `DRAFT` while retaining the workflow history), **Request information** (asks a named user a question without moving the document), **Reassign** (to another eligible approver, with reason), **Add comment**. |
| **V1-WFL-FR-010** | M | The originator MAY **recall** a document while it is still at level 1 and untouched. Once any approver has acted, recall is not available — return-for-correction is the path. |
| **V1-WFL-FR-011** | M | Rejection terminates the workflow. The document moves to `REJECTED` and can be reopened to `DRAFT` by the originator, which starts a **new** workflow instance on resubmission; the previous instance is retained. |
| **V1-WFL-FR-012** | M | Approval at the final level transitions the document to `APPROVED` and fires the module's post-approval side effects via the domain event, never via direct calls from the workflow engine. |
| **V1-WFL-FR-013** | M | SLA tracking per level: due at assignment + SLA hours, computed on **working hours** using the plant/branch calendar, not wall-clock. Overdue tasks are flagged and escalated. |
| **V1-WFL-FR-014** | M | Escalation actions: `NOTIFY_ONLY`, `NOTIFY_MANAGER`, `REASSIGN_TO_ESCALATION_TARGET`, `AUTO_APPROVE` (permitted only where explicitly configured and never for statutory or financial documents), `AUTO_REJECT`. |
| **V1-WFL-FR-015** | M | Reminders before SLA breach at configurable intervals (default 50% and 80% of SLA elapsed). |
| **V1-WFL-FR-016** | M | Delegation (Ch 1) is applied at assignment time: if the resolved approver has an active delegation covering this document type and date, the task is assigned to the delegate, recorded as "on behalf of". |
| **V1-WFL-FR-017** | M | Out-of-office: a user MAY mark themselves unavailable with a date range and a cover person; new tasks route to the cover person automatically. |
| **V1-WFL-FR-018** | M | Bulk approval from the inbox for same-type documents, with per-document success/failure results (V0-IR-014). Each document is validated individually — a bulk approve is not a bypass. |
| **V1-WFL-FR-019** | M | Approvers MUST see, alongside the document, the **decision context**: the requester, the business justification, prior approvals with comments, budget/limit consumption, supplier or customer history, and any exceptions flagged (price variance, credit limit, stock impact). Approving blind is a control failure. |
| **V1-WFL-FR-020** | M | A workflow instance MUST be viewable as a progress diagram on the document, showing completed, current and pending levels with timestamps and comments. |
| **V1-WFL-FR-021** | S | Amount-based **auto-approval** thresholds (e.g. PRs below ₹5,000 auto-approve) MUST be configurable per document type, and every auto-approval MUST be logged as such with the rule that caused it. |
| **V1-WFL-FR-022** | M | If the document changes materially after submission (amount, quantity, supplier, item), the workflow MUST restart from level 1 by default. Which fields are "material" is configurable per document type. Silent approval of a changed document is a control failure. |

## 4.5 Functional requirements — workflow designer

| Ref | Pri | Requirement |
|---|---|---|
| **V1-WFL-FR-023** | S | A visual designer MUST allow building workflows from: `START`, `APPROVAL`, `CONDITION` (branch), `PARALLEL_SPLIT`, `PARALLEL_JOIN`, `ACTION` (call a registered system action), `NOTIFICATION`, `WAIT` (timer or external event), `SUB_WORKFLOW`, `END`. |
| **V1-WFL-FR-024** | S | Workflows are **versioned**. Running instances continue on the version they started with; new instances use the active version. A workflow with running instances cannot be edited in place. |
| **V1-WFL-FR-025** | S | Designer validation MUST detect: unreachable nodes, missing end node, unmatched parallel split/join, cycles without an exit condition, and approval nodes with unresolvable approvers. |
| **V1-WFL-FR-026** | S | Test mode MUST run a workflow against a sample document with simulated decisions, showing the path taken. |

---

## 4.6 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V1-WFL-BR-002** | M | **Self-approval is blocked**: the document creator cannot be an approver on their own document, at any level, unless the company parameter `ALLOW_SELF_APPROVAL` is enabled for that document type (default off). When enabled, every self-approval is flagged in the audit and in an exception report. |
| **V1-WFL-BR-003** | M | An approver MUST hold both the `APPROVE` permission for the document type **and** an approval authority (Ch 1 `iam_approval_authority`) covering the document's amount. Matrix assignment alone is insufficient. If the resolved approver lacks authority for the amount, the engine escalates to the next level that does, and records why. |
| **V1-WFL-BR-004** | M | The same user MUST NOT approve two different levels of the same document instance. If the matrix resolves them to the same person, the level is auto-completed with an audit note ("same approver as level N — level auto-satisfied") only if `COLLAPSE_DUPLICATE_APPROVERS` is enabled; otherwise the engine escalates. |
| **V1-WFL-BR-005** | M | Rejection reason is mandatory and MUST come from a configured reason code list for that document type, optionally with free text. |
| **V1-WFL-BR-006** | M | A document in `PENDING_APPROVAL` MUST NOT be editable. The only paths are: approve, reject, return for correction, recall (level 1, untouched), or reassign. |
| **V1-WFL-BR-007** | M | Approval decisions are immutable. An approval cannot be "unapproved"; the document must be cancelled or amended, creating a new record and a new workflow. |
| **V1-WFL-BR-008** | M | When a document is amended after approval (V0-BR-019), the amendment MUST go through its own approval workflow, at a level determined by the **magnitude of change**, configurable per document type (e.g. a quantity increase > 10% requires the full chain; a delivery-date change requires only level 1). |
| **V1-WFL-BR-009** | M | A workflow instance MUST NOT be deletable. Cancelling a document cancels its open workflow instance, which is retained with status `CANCELLED`. |
| **V1-WFL-BR-010** | M | `AUTO_APPROVE` escalation MUST NOT be configurable for: purchase orders above the company's configured threshold, payment vouchers, journal vouchers, credit notes, stock adjustments, or any document flagged statutory. Validated at rule-save time. |
| **V1-WFL-BR-011** | M | If an assigned approver is deactivated, their open tasks MUST be reassigned per Ch 1 V1-IAM-BR-013 (explicit reassignment or escalation chain) — never left orphaned. |
| **V1-WFL-BR-012** | M | Working-hours SLA calculation MUST use the branch or plant calendar including holidays and shutdowns. A task assigned at 17:00 Friday with an 8-hour SLA is due at 13:00 Monday, not 01:00 Saturday. |
| **V1-WFL-BR-013** | M | Every decision records: user, on-behalf-of (if delegated), timestamp, channel (web/mobile/email), IP, comments, reason code, and the document version approved. Approving version 3 does not authorise version 4. |

---

## 4.7 Data model

```sql
core_approval_rule
  id, uid, company_id,
  document_type       VARCHAR(50) NOT NULL,
  sub_type            VARCHAR(50) NULL,
  name                VARCHAR(200) NOT NULL,
  branch_id, plant_id, department_id, cost_centre_id   -- all NULL = applies to all
  condition_type      VARCHAR(30),      -- AMOUNT_BAND|EXPRESSION|ALWAYS
  min_amount          DECIMAL(18,2) NULL,
  max_amount          DECIMAL(18,2) NULL,
  currency_code       VARCHAR(3) DEFAULT 'INR',
  condition_expr      VARCHAR(1000) NULL,   -- safe expression DSL, whitelisted fields/ops
  workflow_id         BIGINT UNSIGNED NULL, -- set → use designer workflow instead of levels
  priority            INT DEFAULT 100,      -- lower = evaluated first
  auto_approve_below  DECIMAL(18,2) NULL,
  restart_on_change   TINYINT(1) DEFAULT 1,
  material_change_fields JSON NULL,
  is_active           TINYINT(1) DEFAULT 1,
  valid_from DATE, valid_to DATE NULL,
  <standard columns>
  KEY ix_rule_lookup (company_id, document_type, sub_type, is_active, priority)

core_approval_rule_level
  id, uid, company_id, approval_rule_id,
  level_no            TINYINT UNSIGNED NOT NULL,
  level_name          VARCHAR(100),
  approver_type       VARCHAR(30) NOT NULL, -- ROLE|USER|DEPARTMENT_HEAD|REPORTING_MANAGER|
                                            -- COST_CENTRE_OWNER|PLANT_HEAD|DYNAMIC_EXPRESSION
  approver_role_id    BIGINT UNSIGNED NULL,
  approver_user_id    BIGINT UNSIGNED NULL,
  approver_expr       VARCHAR(500) NULL,
  approval_mode       VARCHAR(20) DEFAULT 'ANY_ONE',  -- ANY_ONE|ALL|QUORUM_N
  quorum_count        TINYINT UNSIGNED NULL,
  is_parallel_with_previous TINYINT(1) DEFAULT 0,
  skip_condition_expr VARCHAR(500) NULL,
  sla_hours           DECIMAL(8,2) NULL,
  reminder_pct        JSON DEFAULT '[50,80]',
  escalation_action   VARCHAR(30) DEFAULT 'NOTIFY_ONLY',
  escalation_user_id  BIGINT UNSIGNED NULL,
  escalation_role_id  BIGINT UNSIGNED NULL,
  can_edit_document   TINYINT(1) DEFAULT 0,   -- rare; e.g. finance may adjust a cost centre
  editable_fields     JSON NULL,
  <standard columns>
  UNIQUE KEY uk_rule_level (approval_rule_id, level_no, deleted_key)

core_workflow_instance
  id, uid, company_id,
  entity_type         VARCHAR(80) NOT NULL,
  entity_id           BIGINT UNSIGNED NOT NULL,
  entity_uid          CHAR(26) NOT NULL,
  document_no         VARCHAR(100) NULL,
  document_version    INT UNSIGNED NOT NULL,   -- the version submitted
  document_amount     DECIMAL(18,2) NULL,
  currency_code       VARCHAR(3) NULL,
  approval_rule_id    BIGINT UNSIGNED NULL,
  workflow_id         BIGINT UNSIGNED NULL,
  workflow_version    INT UNSIGNED NULL,
  status              VARCHAR(25) NOT NULL,  -- IN_PROGRESS|APPROVED|REJECTED|RETURNED|
                                             -- RECALLED|CANCELLED|AUTO_APPROVED
  current_level       TINYINT UNSIGNED NULL,
  initiated_by        BIGINT UNSIGNED NOT NULL,
  initiated_at        DATETIME(6) NOT NULL,
  completed_at        DATETIME(6) NULL,
  total_sla_hours     DECIMAL(10,2) NULL,
  actual_hours        DECIMAL(10,2) NULL,
  is_overdue          TINYINT(1) DEFAULT 0,
  <standard columns>
  KEY ix_wfi_entity (company_id, entity_type, entity_id)
  KEY ix_wfi_status (company_id, status, initiated_at)

core_workflow_task
  id, uid, company_id, workflow_instance_id,
  level_no            TINYINT UNSIGNED NOT NULL,
  level_name          VARCHAR(100),
  assigned_to_user_id BIGINT UNSIGNED NOT NULL,
  assigned_role_id    BIGINT UNSIGNED NULL,
  on_behalf_of_user_id BIGINT UNSIGNED NULL,   -- delegation
  delegation_id       BIGINT UNSIGNED NULL,
  approval_mode       VARCHAR(20),
  status              VARCHAR(25) NOT NULL,  -- PENDING|APPROVED|REJECTED|RETURNED|
                                             -- REASSIGNED|SKIPPED|EXPIRED|AUTO_APPROVED|
                                             -- CANCELLED|INFO_REQUESTED
  assigned_at         DATETIME(6) NOT NULL,
  due_at              DATETIME(6) NULL,       -- working-hours computed
  first_viewed_at     DATETIME(6) NULL,
  acted_at            DATETIME(6) NULL,
  action              VARCHAR(30) NULL,
  reason_code         VARCHAR(50) NULL,
  comments            TEXT NULL,
  channel             VARCHAR(20) NULL,       -- WEB|MOBILE|EMAIL|API
  ip_address          VARCHAR(45) NULL,
  reassigned_to_user_id BIGINT UNSIGNED NULL,
  reassign_reason     VARCHAR(500) NULL,
  reminder_count      TINYINT UNSIGNED DEFAULT 0,
  escalated_at        DATETIME(6) NULL,
  <standard columns>
  KEY ix_task_inbox (company_id, assigned_to_user_id, status, due_at)
  KEY ix_task_instance (workflow_instance_id, level_no)

core_workflow_history          -- append-only narrative of everything that happened
  id, uid, company_id, workflow_instance_id, task_id NULL,
  sequence_no INT UNSIGNED,
  event_type VARCHAR(40),   -- SUBMITTED|ASSIGNED|VIEWED|APPROVED|REJECTED|RETURNED|
                            -- REASSIGNED|ESCALATED|REMINDED|RECALLED|CANCELLED|
                            -- INFO_REQUESTED|INFO_PROVIDED|AUTO_APPROVED|LEVEL_SKIPPED
  from_status VARCHAR(25), to_status VARCHAR(25),
  user_id BIGINT UNSIGNED, user_name VARCHAR(150),
  comments TEXT, metadata JSON,
  created_at DATETIME(6)
  KEY ix_wfh (workflow_instance_id, sequence_no)

core_out_of_office
  id, uid, company_id, user_id,
  from_date DATE, to_date DATE,
  cover_user_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(200), auto_reply_message TEXT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  <standard columns>

-- Designer workflows (V1-WFL-FR-023…026)
core_workflow
  id, uid, company_id,
  code VARCHAR(50), name VARCHAR(200), description VARCHAR(500),
  document_type VARCHAR(50) NULL,
  version INT UNSIGNED DEFAULT 1,
  status VARCHAR(20) DEFAULT 'DRAFT',   -- DRAFT|ACTIVE|DEPRECATED
  definition JSON NOT NULL,              -- nodes + edges
  activated_at DATETIME(6) NULL, activated_by BIGINT UNSIGNED NULL,
  <standard columns>
  UNIQUE KEY uk_workflow (company_id, code, version, deleted_key)

core_workflow_node_state       -- runtime state for designer workflows
  id, uid, company_id, workflow_instance_id,
  node_id VARCHAR(50), node_type VARCHAR(30),
  status VARCHAR(20),          -- PENDING|ACTIVE|COMPLETED|SKIPPED|FAILED
  entered_at DATETIME(6), exited_at DATETIME(6),
  output JSON NULL
```

---

## 4.8 Screens

### S-WFL-01 · Approval Matrix Configuration

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Approval Matrix — Purchase Order                     [ + New rule ] [Simulate] [⋮]    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Document type [Purchase Order ▼]   Company [SSB Industries ▼]   [x] Active only        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Amount coverage                                                                       │
│  ├────────────┬──────────────────┬───────────────────────────────────────────────────┐ │
│  │ 0      1L  │ 1L          10L  │ 10L                                          ∞    │ │
│  │  Rule 1    │     Rule 2       │                  Rule 3                           │ │
│  └────────────┴──────────────────┴───────────────────────────────────────────────────┘ │
│  ✔ Full coverage, no gaps, no overlaps                                                 │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Pri│ Rule                    │ Condition                    │ Levels                │⋮ │
│ 10 │ PO — Routine            │ ₹0 – ₹1,00,000               │ L1 Purchase Head      │⋮ │
│ 20 │ PO — Mid value          │ ₹1,00,001 – ₹10,00,000       │ L1 Purch → L2 Factory │⋮ │
│ 30 │ PO — High value         │ > ₹10,00,000                 │ L1→L2→L3 CFO→L4 MD    │⋮ │
│ 5  │ PO — Capital item       │ item_category = CAPITAL       │ L1 Plant→L2 CFO→L3 MD│⋮ │
│ 5  │ PO — Subcontract        │ po_type = SUBCONTRACT         │ L1 PPC→L2 Factory Hd │⋮ │
│ 1  │ PO — Emergency          │ priority = URGENT AND ≤ ₹2L   │ L1 Factory Head only  │⋮ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-WFL-02 · Rule Editor

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Approval Rule — PO High value                              [Cancel] [Save]          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Applies to ──────────────────────────┐ ┌─ Condition ────────────────────────────┐  │
│ │ Document type * [Purchase Order ▼]    │ │ Type (•) Amount band ( ) Expression     │  │
│ │ Sub-type        [All ▼]               │ │ Currency [INR ▼]                        │  │
│ │ Company *       [SSB Industries ▼]    │ │ From  [10,00,001    ]                   │  │
│ │ Branch          [All ▼]               │ │ To    [            ]  (blank = ∞)       │  │
│ │ Plant           [All ▼]               │ │ Additional expression (optional)         │  │
│ │ Priority        [30    ]              │ │ [                                    ]  │  │
│ │ Valid 01-Apr-2026 → —                 │ │ Auto-approve below [        ] (blank)   │  │
│ └───────────────────────────────────────┘ └─────────────────────────────────────────┘  │
├─ Approval levels ──────────────────────────────────────── [ + Add level ] ─────────────┤
│ ┌────┬──────────────┬─────────────────────┬────────┬──────┬────────────────────────┐  │
│ │ L  │ Name         │ Approver            │ Mode   │ SLA  │ On breach              │  │
│ │ 1  │ Purchase     │ Role: PURCH_HEAD    │ Any one│ 24 h │ Notify manager     [⋮] │  │
│ │ 2  │ Works        │ Role: FACTORY_HEAD  │ Any one│ 24 h │ Notify manager     [⋮] │  │
│ │ 3  │ Finance      │ Role: CFO           │ Any one│ 48 h │ Notify + escalate MD[⋮]│  │
│ │ 4  │ Management   │ Role: MD            │ Any one│ 72 h │ Notify only        [⋮] │  │
│ └────┴──────────────┴─────────────────────┴────────┴──────┴────────────────────────┘  │
│  ⓘ L3 and L4 can run in parallel — [ ] Run level 4 in parallel with level 3            │
├─ On document change after submission ──────────────────────────────────────────────────┤
│  (•) Restart workflow from level 1                                                     │
│  ( ) Continue from current level                                                       │
│  Material fields: [x] total_amount [x] supplier [x] item lines [ ] delivery_date       │
│                   [ ] remarks                                                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  ⚠ AUTO_APPROVE escalation is not permitted for Purchase Order above ₹10,00,000        │
│    (V1-WFL-BR-010).                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-WFL-03 · Approvals Inbox (unified across all modules)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  My Approvals  (12)                                     [Bulk approve] [Settings] ⟳    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [ All (12) ] [ Overdue (3) ] [ Due today (4) ] [ Delegated to me (2) ] [ Completed ]  │
│  🔍 Search…   [Document type ▼] [Requester ▼] [Amount ▼]        Sort [Due date ▼]      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│[x]│⏰│ Document          │ Requester │ Subject                  │ Amount    │ Due      │
│[x]│🔴│ PO/25-26/00042    │ P. Suresh │ Jindal Steel — SS304 coil│ 15,62,292 │ 2d over  │
│   │  │ L3 of 4 · Finance │           │ ⚠ Rate 24% above last PO │           │          │
│[x]│🔴│ PR/25-26/00318    │ M. Devi   │ Coating chemicals        │    82,400 │ 1d over  │
│[ ]│🟡│ ADJ/25-26/0012    │ K. Ravi   │ Stock adj — RM shortage  │  −1,24,000│ Today    │
│   │  │ ⚠ Negative variance 2.1% of RM value                     │           │          │
│[ ]│🟡│ SO/25-26/00891    │ A. Kumar  │ Metro Cash — 12,000 btl  │ 42,80,000 │ Today    │
│   │  │ ⚠ Customer credit limit 82% utilised                     │           │          │
│[ ]│🟢│ MWO/25-26/0044    │ Tech team │ PM — Deep Draw Press 2   │         — │ 3 days   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2 selected  →  [ ✔ Approve ] [ ✕ Reject ] [ ↩ Return ] [ Open ]         ✕ Clear         │
│ ⓘ Bulk approve validates each document individually. Failures are reported per row.    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-WFL-04 · Approval Decision Panel (on the document)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Purchase Order PO/25-26/00042            ⚑ PENDING APPROVAL — Level 3 of 4            │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│  … document content …                    │  APPROVAL PROGRESS                          │
│                                          │                                             │
│                                          │  ✔ L1 Purchase                              │
│                                          │    P. Suresh · 25-Jul 10:14                 │
│                                          │    "Rate justified — steel index up"        │
│                                          │        │                                    │
│                                          │  ✔ L2 Works                                 │
│                                          │    S. Balaji · 25-Jul 16:40                 │
│                                          │    "Required for July schedule"             │
│                                          │        │                                    │
│                                          │  ◉ L3 Finance  ← YOU                        │
│                                          │    Assigned 26-Jul 09:00                    │
│                                          │    🔴 Overdue by 2 days (SLA 48 h)          │
│                                          │        │                                    │
│                                          │  ○ L4 Management                            │
│                                          │    Mr. R. Krishnan (MD)                     │
│                                          ├─────────────────────────────────────────────┤
│                                          │  DECISION CONTEXT                           │
│                                          │  Budget CC-PUR   ₹1.8 Cr used of ₹2.4 Cr    │
│                                          │  This PO would take it to 79%               │
│                                          │  Supplier Jindal · rating 4.2 · on-time 92% │
│                                          │  ⚠ Rate ₹245/kg vs last ₹198/kg (+24%)      │
│                                          │    Justification: "LME + domestic surcharge" │
│                                          │  ⚠ No alternate quote on file                │
│                                          │  Stock cover for SS304: 11 days              │
│                                          ├─────────────────────────────────────────────┤
│                                          │  Comments *                                 │
│                                          │  [                                       ]  │
│                                          │  Reason code (if rejecting/returning)       │
│                                          │  [ ▼ Select                              ]  │
│                                          │                                             │
│                                          │  [ ✔ Approve ]  [ ✕ Reject ]                │
│                                          │  [ ↩ Return for correction ]                │
│                                          │  [ ? Request information ]                  │
│                                          │  [ ⇄ Reassign ]                             │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
```

### S-WFL-05 · Workflow Designer

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Workflow Designer — Supplier Onboarding (v2, DRAFT)   [Validate][Test][Save][Activate] │
├──────────┬─────────────────────────────────────────────────────────────────────────────┤
│ PALETTE  │                                                                             │
│ ○ Start  │    ┌───────┐   ┌──────────────┐   ┌─────────────────┐                       │
│ ▭ Approve│    │ START ├──►│ Purchase     ├──►│ ◇ Critical      │                       │
│ ◇ Cond.  │    └───────┘   │ review       │   │   item?         │                       │
│ ⋔ Split  │                │ Role:PURCH_HD│   └────┬───────┬────┘                       │
│ ⋓ Join   │                │ SLA 24h      │    yes │       │ no                         │
│ ⚙ Action │                └──────────────┘        ▼       │                            │
│ ✉ Notify │                              ┌──────────────┐  │                            │
│ ⏲ Wait   │                              │ Quality audit│  │                            │
│ ⊞ Sub-wf │                              │ Role: QC_HEAD│  │                            │
│ ● End    │                              │ SLA 72h      │  │                            │
│          │                              └───────┬──────┘  │                            │
│          │                                      └────┬────┘                            │
│          │                                           ▼                                 │
│          │                                  ┌────────────────┐                         │
│          │                                  │ Finance credit │                         │
│          │                                  │ check · CFO    │                         │
│          │                                  └───────┬────────┘                         │
│          │                                          ▼                                  │
│          │                                     ⋔ Parallel                              │
│          │                                    ┌────┴─────┐                             │
│          │                          ┌─────────▼──┐   ┌───▼─────────┐                   │
│          │                          │ Legal      │   │ Compliance  │                   │
│          │                          └─────────┬──┘   └───┬─────────┘                   │
│          │                                    └────┬─────┘                             │
│          │                                     ⋓ Join                                  │
│          │                                          ▼                                  │
│          │                              ┌──────────────┐   ┌─────┐                     │
│          │                              │ ⚙ Activate   ├──►│ END │                     │
│          │                              │   supplier   │   └─────┘                     │
│          │                              └──────────────┘                               │
├──────────┴─────────────────────────────────────────────────────────────────────────────┤
│ ✔ Validation passed — 0 unreachable nodes, split/join matched, all approvers resolvable │
│ ⚠ 3 instances running on v1. They will continue on v1; new instances will use v2.       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens

| Screen | Purpose |
|---|---|
| S-WFL-06 · Rule Simulator | Enter sample attributes → matched rule, resolved approvers, projected SLA |
| S-WFL-07 · Workflow Monitor | All in-flight instances, filter by overdue/document type/approver; admin reassign |
| S-WFL-08 · Out of Office | Set own unavailability and cover person; admin view of all |
| S-WFL-09 · Escalation Configuration | Global escalation defaults and holiday/calendar linkage |
| S-WFL-10 · Approval History (per document) | Full timeline with every event, comment and version approved |

---

## 4.9 API

| Method | Endpoint | Permission |
|---|---|---|
| GET/POST | `/api/v1/approval-rules` | `SYSTEM.APPROVAL_MATRIX.VIEW` / `.EDIT` |
| GET/PATCH/DELETE | `/api/v1/approval-rules/{uid}` | `.VIEW` / `.EDIT` |
| POST | `/api/v1/approval-rules/simulate` | `.VIEW` |
| GET | `/api/v1/approval-rules/coverage?document_type=…` | `.VIEW` — gap/overlap analysis |
| GET | `/api/v1/approvals/inbox` | authenticated |
| GET | `/api/v1/approvals/inbox/count` | authenticated — header badge |
| GET | `/api/v1/approvals/tasks/{uid}` | assignee or `SYSTEM.WORKFLOW.VIEW` |
| POST | `/api/v1/approvals/tasks/{uid}/approve` | assignee |
| POST | `/api/v1/approvals/tasks/{uid}/reject` | assignee — `reason_code` required |
| POST | `/api/v1/approvals/tasks/{uid}/return` | assignee — `reason_code` required |
| POST | `/api/v1/approvals/tasks/{uid}/reassign` | assignee or `SYSTEM.WORKFLOW.VIEW` |
| POST | `/api/v1/approvals/tasks/{uid}/request-info` | assignee |
| POST | `/api/v1/approvals/bulk-approve` | assignee — 207 Multi-Status |
| GET | `/api/v1/workflow-instances/{uid}` · `/history` | `SYSTEM.WORKFLOW.VIEW` or document view |
| POST | `/api/v1/workflow-instances/{uid}/recall` | originator, level 1 untouched |
| POST | `/api/v1/workflow-instances/{uid}/cancel` | `SYSTEM.WORKFLOW.VIEW` + document cancel |
| GET | `/api/v1/workflow-instances?status=IN_PROGRESS&overdue=true` | `SYSTEM.WORKFLOW.VIEW` |
| GET/POST | `/api/v1/workflows` (designer) · `/{uid}/versions` | `SYSTEM.WORKFLOW.DESIGN` |
| POST | `/api/v1/workflows/{uid}/validate` · `/test` · `/activate` | `.DESIGN` / `.ACTIVATE` |
| GET/POST/DELETE | `/api/v1/out-of-office` | authenticated (own) |

Internal service interface:

```python
class WorkflowService:
    def submit(self, *, entity_type: str, entity: Any, session: Session) -> WorkflowInstance: ...
    def decide(self, *, task_uid: str, action: Decision, actor: User,
               comments: str, reason_code: str | None) -> WorkflowInstance: ...
    def cancel_for_entity(self, *, entity_type: str, entity_id: int, reason: str) -> None: ...
    def restart_on_change(self, *, entity_type: str, entity_id: int,
                          changed_fields: set[str]) -> bool: ...
```

---

## 4.10 Events

| Event | When | Consumers |
|---|---|---|
| `workflow.approval.requested` | Instance created / level assigned | Notification, Mobile push |
| `workflow.approval.approved` | A level approved | Notification (originator) |
| `workflow.approval.rejected` | Rejected | Document module → `REJECTED`, Notification |
| `workflow.approval.returned` | Returned for correction | Document module → `DRAFT`, Notification |
| `workflow.approval.completed` | Final level approved | **Document module → `APPROVED` + post-approval side effects** |
| `workflow.approval.recalled` | Originator recalled | Notification |
| `workflow.approval.escalated` | SLA breached, escalation fired | Notification, Escalation target |
| `workflow.approval.reminded` | Pre-breach reminder | Notification |
| `workflow.approval.reassigned` | Task reassigned | Notification (both users) |
| `workflow.approval.auto_approved` | Auto-approval rule fired | Audit, Exception report |
| `workflow.task.info_requested` / `.info_provided` | Information request loop | Notification |

**V1-WFL-BR-014 (M)** The workflow engine MUST NOT call module code directly. Post-approval
side effects (stock commitment, budget consumption, e-mail to supplier) are triggered by the
module subscribing to `workflow.approval.completed`. This keeps the engine independent of all
twenty modules.

---

## 4.11 Reports

| Report | Content |
|---|---|
| Pending Approvals | All in-flight approvals by document type, level, approver, age |
| Approval Ageing | Bucketed by days pending; identifies chronic bottlenecks |
| Approver Performance | Per approver: volume, average turnaround, % within SLA, % overdue |
| SLA Compliance | By document type and level, trended monthly |
| Escalation Report | Every escalation with cause and outcome |
| Rejection Analysis | Rejections by reason code, document type, requester — a process-improvement input |
| Return-for-correction Analysis | Which document types get returned most, and why |
| **Self-approval Exceptions** | Every self-approval permitted by parameter — an audit control |
| **Auto-approval Log** | Every auto-approval with the rule that caused it |
| Delegation Usage | Approvals made on behalf of others |
| Bypassed/Overridden Approvals | Any admin intervention in a workflow |
| Approval Cycle Time | Submission → final approval, by document type, trended |

---

## 4.12 Notifications

| Trigger | Recipients | Channels | Urgency |
|---|---|---|---|
| Approval assigned to you | Assignee | In-app, Email, Push | High |
| Reminder at 50% / 80% SLA | Assignee | In-app, Email | Normal |
| SLA breached | Assignee + escalation target | In-app, Email, SMS | High |
| Document approved | Originator | In-app, Email | Normal |
| Document rejected / returned | Originator | In-app, Email | High |
| Information requested | Named user | In-app, Email | Normal |
| Task reassigned | Both users | In-app, Email | Normal |
| Delegation active — task routed to delegate | Delegate + delegator | In-app | Normal |
| Workflow completed | Originator + subscribers | In-app | Normal |

---

## 4.13 Acceptance criteria (extract)

- A PO of ₹15,00,000 routes through exactly 4 levels; a PO of ₹50,000 through exactly 1.
- A document with no matching rule cannot be submitted, and the error names the document type
  and amount that found no rule.
- The creator of a PO cannot appear as an approver on it while `ALLOW_SELF_APPROVAL` is off,
  even when they hold `PROCUREMENT.PO.APPROVE`.
- A task assigned Friday 17:00 with SLA 8 h, on a calendar with Saturday and Sunday off and
  working hours 09:00–18:00, is due Monday 13:00.
- Editing the total amount of a submitted PO restarts the workflow at level 1, and the history
  shows both instances.
- Bulk-approving 20 documents where 2 fail validation approves 18 and returns per-row errors
  for 2.
- Deactivating an approver with 5 pending tasks forces an explicit reassignment choice.
- Approving a document at version 3 and then amending it to version 4 leaves version 4
  unapproved, with the history recording which version each approval covered.
- Saving an `AUTO_APPROVE` escalation on a payment voucher rule is rejected.

---

**Next:** [Chapter 5 — Audit, Compliance & Data Lifecycle](05-audit-and-compliance.md)
