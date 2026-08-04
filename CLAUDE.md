# CLAUDE.md — Development Guidelines

Stainless Steel Water Bottle Manufacturing ERP.

This file is the standing instruction set for any AI or human contributor working in this
repository. Read it before writing code or specification text. Where this file and a
volume-level SRS disagree, **this file wins for _how_ to build; the SRS wins for _what_ to
build.**

---

## 1. What this repository currently is

At present this repository holds **specification only** — no application code. The SRS lives
under [docs/srs/](docs/srs/) and is split into volumes so that each one stays inside a
reviewable, context-friendly size.

Do not start writing application code until the relevant SRS volume is written and the user
has approved it. If asked to implement a module, first confirm its volume exists and is
marked `Status: Approved` in [docs/srs/README.md](docs/srs/README.md).

---

## 2. Technology stack (locked)

| Layer | Decision |
|---|---|
| Database | MySQL 8.0+ (InnoDB, `utf8mb4_0900_ai_ci`) |
| Backend language | Python 3.12+ |
| Backend framework | FastAPI (ASGI, `uvicorn`/`gunicorn`) |
| ORM / migrations | SQLAlchemy 2.0 (typed, `Mapped[]` style) + Alembic |
| Validation | Pydantic v2 (all request/response contracts) |
| Async jobs / scheduling | Celery + Redis (broker + result backend), `celery beat` |
| Cache / locks / rate limit | Redis 7+ |
| Object storage | S3-compatible (MinIO on-prem, S3 on cloud) |
| Search (phase 2) | MySQL FULLTEXT first; OpenSearch only if proven necessary |
| Web frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Web state/data | TanStack Query (server state), Zustand (client state) |
| Web forms | React Hook Form + Zod |
| Web tables | TanStack Table (virtualised) |
| Charts | Recharts |
| Mobile | React Native (Expo), TypeScript, SQLite (offline), same REST API |
| Reports | Server-side: WeasyPrint (PDF), openpyxl / xlsxwriter (Excel), csv (CSV) |
| Auth | JWT RS256 access token (15 min) + rotating refresh token (opaque, DB-backed) |
| Observability | structlog → JSON logs, OpenTelemetry traces, Prometheus metrics |

**Assumptions flagged for the user:** FastAPI (vs Django/DRF) and React Native (vs PWA) were
chosen by the implementation team, not specified by the client. Both are recorded in
[docs/srs/volume-00-foundation.md](docs/srs/volume-00-foundation.md) §6 and can be overruled.

Do not introduce a new runtime dependency, framework, or database without recording the
decision as an ADR in `docs/adr/` and getting explicit approval.

---

## 3. Architecture rules

### 3.1 Modular monolith, not microservices

One deployable API application, internally partitioned into **modules** that map 1:1 to SRS
volumes. Each module owns its own schema namespace, domain model, services, and routers.

```
backend/
  app/
    core/                 # framework: config, db, auth, rbac, audit, workflow, numbering,
                          # notification, events, errors, pagination, export
    modules/
      masters/
      crm/
      procurement/
      inventory/
      engineering/
      planning/
      production/
      quality/
      maintenance/
      packing/
      dispatch/
      sales/
      finance/
      hrms/
      assets/
      dms/
      reporting/
    main.py
  migrations/             # alembic
  tests/
```

Each module folder follows the same internal layout:

```
modules/<module>/
  domain/          # entities, value objects, domain services, domain events. No I/O here.
  application/     # use-case services, command/query handlers, DTO mapping, orchestration
  infrastructure/  # SQLAlchemy models, repositories, external adapters
  api/             # FastAPI routers, Pydantic request/response schemas, dependencies
  events/          # event handlers this module subscribes to
  __init__.py      # module registration (routers, event subscriptions, permissions, jobs)
```

### 3.2 Dependency direction

`api → application → domain` and `infrastructure → domain`. The `domain` layer imports
nothing from FastAPI, SQLAlchemy, or any other module. Enforce with import-linter in CI.

### 3.3 Cross-module communication

- **Read** across modules: only through the other module's published **application service**
  or a read-only query interface. Never import another module's SQLAlchemy models, and never
  join across module tables in a write path.
- **Write** across modules: only via **domain events** (transactional outbox → dispatcher).
  A GRN posting does not call inventory's repository; it emits `procurement.grn.approved`
  and inventory subscribes.
- Reporting/analytics queries may cross module tables read-only, in a dedicated
  `reporting` module, using explicit SQL — this is the one sanctioned exception.

### 3.4 Domain-Driven Design

Apply DDD where the domain earns it — Production, Quality, Inventory, Finance, BOM. Do not
force aggregates and value objects onto simple CRUD masters; those use a shared generic
master pattern (see §5.1).

Aggregate rule: **one aggregate per transaction.** If a use case must modify two aggregates,
modify one and emit an event for the other.

---

## 4. Non-negotiable data rules

### 4.1 Standard columns

Every business table carries:

```sql
id            BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
uid           CHAR(26)         NOT NULL,           -- ULID, public/API identifier
company_id    BIGINT UNSIGNED  NOT NULL,           -- tenant scope (omit on global masters)
branch_id     BIGINT UNSIGNED  NULL,               -- where applicable
version       INT UNSIGNED     NOT NULL DEFAULT 1, -- optimistic lock
created_at    DATETIME(6)      NOT NULL,
created_by    BIGINT UNSIGNED  NOT NULL,
updated_at    DATETIME(6)      NOT NULL,
updated_by    BIGINT UNSIGNED  NOT NULL,
deleted_at    DATETIME(6)      NULL,
deleted_by    BIGINT UNSIGNED  NULL
```

### 4.2 Soft delete only

Never `DELETE` a transactional or master record. Set `deleted_at`/`deleted_by`. All queries
filter `deleted_at IS NULL` via a SQLAlchemy global loader criteria — never rely on callers
remembering. Hard delete is permitted only for: session rows, idempotency keys, cache/temp
tables, and expired OTPs.

Because MySQL treats multiple `NULL`s as distinct in a unique index, every unique business
key uses a generated companion column:

```sql
deleted_key DATETIME(6) GENERATED ALWAYS AS (IFNULL(deleted_at, '1970-01-01 00:00:00')) STORED,
UNIQUE KEY uk_customer_code (company_id, code, deleted_key)
```

### 4.3 Multi-tenancy

MySQL has no row-level security, so tenancy is **application-enforced and mandatory**:

- Every request resolves a `TenantContext(company_id, branch_id, plant_id, user_id, roles)`.
- The base repository injects `company_id` into every query and every insert.
- Any query built outside the base repository must be reviewed; raw SQL in reporting must
  bind `company_id` explicitly. CI greps for raw `text(` usage without a tenant bind.
- Cross-company data access is only possible through an explicit, audited
  `SYSTEM.CROSS_COMPANY_READ` permission (group-level MIS dashboards).

### 4.4 Numeric and temporal types

| Concept | Type |
|---|---|
| Quantity | `DECIMAL(18,6)` |
| Rate / unit price | `DECIMAL(18,6)` |
| Amount / value | `DECIMAL(18,2)` |
| Percentage | `DECIMAL(9,4)` |
| Exchange rate | `DECIMAL(18,8)` |
| Weight (kg) | `DECIMAL(18,4)` |
| Dimension (mm) | `DECIMAL(12,3)` |
| Timestamp | `DATETIME(6)`, **stored in UTC** |
| Business date | `DATE`, in the plant's local timezone |

Never use `FLOAT`/`DOUBLE` for money or quantity. All rounding is half-up at the field's
declared scale, applied once, at the point of persistence.

### 4.5 Optimistic locking

Every update sends the row `version`. The API accepts it via `If-Match: "<version>"` or a
`version` body field. Mismatch → `409 Conflict` with problem type `concurrent-modification`
and the current server state in the payload so the UI can diff.

---

## 5. Non-negotiable functional rules

### 5.1 Every master

Configurable without code changes. Every master gets: `code` (unique, optionally
auto-numbered), `name`, `is_active`, effective-dated activation where relevant, attachments,
notes, audit trail, import from Excel, export, and a "where used / dependency check" before
deactivation. Masters are never hard-deleted and may not be deactivated while referenced by
an open transaction.

### 5.2 Every transaction document

Must support, without exception:

1. **Attachments** (`core_attachment`, polymorphic on `entity_type` + `entity_id`)
2. **Comments / remarks thread** (`core_comment`, same polymorphic key, @mention capable)
3. **Approval workflow** (`core_workflow_instance`), even if the configured workflow is
   auto-approve
4. **Configurable document number** from the numbering engine — never a raw sequence in
   module code
5. **Standard lifecycle**: `DRAFT → PENDING_APPROVAL → APPROVED → IN_PROGRESS → COMPLETED`
   with `REJECTED`, `ON_HOLD`, `CANCELLED`, `CLOSED`, `AMENDED` as applicable. State
   transitions are validated by an explicit state machine, never by scattered `if` checks.
6. **Amendment/revision** with full version history and a diff view, not in-place edit after
   approval
7. **Cancellation with mandatory reason code**, never deletion
8. **Print / PDF** with a configurable template
9. **Audit log** entries for create, update, submit, approve, reject, cancel, amend, delete
10. **Domain events** emitted on every state change

If you are adding a document type and any of these ten is missing, the work is not done.

### 5.3 Audit logging

`core_audit_log` records: who, when, from where (IP, device, app), entity type, entity id,
document number, action, old value, new value (JSON diff of changed fields only), reason,
and the request correlation id. Audit rows are **append-only** — no UPDATE, no DELETE, and
the application DB user has no privilege to do either.

Never log secrets, passwords, tokens, or full bank/card numbers into audit or application
logs.

### 5.4 RBAC

Permissions are strings: `<MODULE>.<ENTITY>.<ACTION>` — e.g. `PROCUREMENT.PO.APPROVE`.
Three enforcement levels, all required:

- **Action level** — can the user invoke this endpoint at all
- **Data/scope level** — which company/branch/plant/warehouse/cost-centre rows they see
- **Field level** — which fields are visible, and which are editable (e.g. a storekeeper
  sees a PO but not its rates)

Enforcement is server-side and mandatory. The UI hiding a button is a convenience, never a
control. Every endpoint declares its permission via a dependency; an endpoint with no
declared permission fails CI.

### 5.5 Events and hooks

Every module publishes domain events through the transactional outbox. Event names are
`<module>.<entity>.<past-tense-verb>`, payloads are versioned and additive-only. Outbound
webhooks are configurable per company so ERP/CRM/eCommerce/IoT integrations need no code
change.

---

## 6. API rules

- Base path `/api/v1`. Breaking changes require `/api/v2`; additive changes do not.
- Resource-oriented, plural nouns: `/api/v1/purchase-orders/{uid}`. State transitions are
  sub-resources: `POST /api/v1/purchase-orders/{uid}/approve`.
- **Always the public `uid` (ULID) in URLs and payloads. Never expose `id`.**
- List responses are enveloped: `{ "data": [...], "meta": { page, page_size, total, ... } }`.
  Single-resource responses return the object directly.
- Errors follow RFC 9457 `application/problem+json` with a stable machine-readable `type`
  and, for validation, a `errors[]` array keyed by field path.
- Every mutating request accepts `Idempotency-Key`; replays return the original response.
- Pagination is cursor-based for high-volume ledgers, offset-based for master lists.
- Filtering uses a documented, whitelisted query grammar — never pass user strings into SQL.
- Long-running work (MRP run, month-end, bulk import, large export) returns `202 Accepted`
  with a job uid; the client polls `/api/v1/jobs/{uid}` or subscribes over WebSocket.
- Every response carries `X-Correlation-Id`; every log line and audit row carries the same.

---

## 7. Frontend rules

- Tailwind utility classes for layout/spacing; shared UI primitives live in
  `web/src/components/ui/`. No inline `style` objects except computed values.
- Design tokens (colour, spacing, radius, typography) live in `tailwind.config.ts`. Never
  hard-code a hex value in a component.
- Every screen supports full keyboard operation. Shop-floor and store screens must be
  usable without a mouse — data-entry staff are faster on the keyboard, and gloved hands on
  touchscreens need ≥44 px targets.
- Screens are built from a small set of archetypes (List, Form, Detail, Wizard, Board,
  Dashboard, Report) defined in Volume 0 §16. Don't invent a new layout per screen.
- Server state via TanStack Query only. No manual `useEffect` fetch. No storing server data
  in Zustand.
- All money/quantity display formatting goes through shared formatters that respect the
  company's locale and decimal-precision settings.
- Every list screen ships with: column chooser, saved views, server-side sort/filter,
  bulk-action bar, and Excel/PDF/CSV export.
- Accessibility: WCAG 2.1 AA. Semantic HTML, labelled inputs, visible focus rings, and no
  colour-only status encoding (always pair colour with text or icon).

---

## 8. Testing and quality gates

| Gate | Requirement |
|---|---|
| Unit tests | Every domain rule, calculation, and state transition. `pytest`. |
| Integration tests | Every API endpoint, against a real MySQL in Docker — not SQLite. |
| Coverage | ≥85% on `domain/` and `application/`, ≥70% overall. |
| Contract tests | OpenAPI schema is generated, committed, and diffed in CI. |
| Migration tests | Every Alembic migration runs up **and** down against a seeded DB. |
| Tenancy tests | Each module has a test proving cross-company reads return nothing. |
| RBAC tests | Each endpoint tested for 403 without its permission. |
| Frontend | Vitest units + React Testing Library; Playwright for critical journeys. |
| Lint/format | `ruff` + `mypy --strict` on backend; ESLint + Prettier + `tsc` on frontend. |

Financial, inventory-valuation, BOM-explosion, MRP, and payroll calculations require test
cases derived from worked examples in the SRS. Never ship one on "looks right".

---

## 9. Working conventions for AI contributors

1. **Read the relevant SRS volume before coding.** Cite requirement IDs (e.g. `V4-INV-FR-012`)
   in commit messages and PR descriptions.
2. **One module per branch.** Do not touch three modules in one change.
3. **Do not invent business rules.** If the SRS is silent, ask, or record an explicit
   assumption in `docs/srs/open-questions.md`. Manufacturing and statutory logic guessed
   wrong is worse than absent.
4. **Do not scaffold speculative code.** Build what the current volume specifies.
5. **Never weaken a rule in §4 or §5 for convenience.** If a rule genuinely blocks a
   legitimate case, raise it — don't route around it.
6. **Migrations are forward-only in production.** Every Alembic revision is reviewed for
   locking behaviour on large tables; use online DDL / `pt-online-schema-change` patterns
   for tables expected to exceed 10M rows.
7. **Indian statutory logic** (GST, e-invoice IRN, e-way bill, TDS, PF/ESI) is isolated
   behind a `statutory/` adapter with the rates and slabs held as configurable master data —
   never hard-coded in business logic. Rates change by notification; code should not.
8. When a task is ambiguous, do the unambiguous parts fully, then ask one specific question
   about the rest.

---

## 10. Repository layout (target)

```
/
  CLAUDE.md
  docs/
    srs/
      README.md                       # volume index + status
      volume-00-foundation.md         # cross-cutting standards (read first)
      volume-01-core-framework/       # auth, RBAC, workflow, masters, audit, notifications
      volume-02-crm-sales/
      volume-03-procurement/
      volume-04-inventory/
      volume-05-engineering-planning/
      volume-06-production/
      volume-07-quality/
      volume-08-packing-dispatch/
      volume-09-finance/
      volume-10-hrms-assets/
      volume-11-reports-dashboards-mobile/
      open-questions.md
    adr/                              # architecture decision records
  backend/
  web/
  mobile/
  infra/
```
