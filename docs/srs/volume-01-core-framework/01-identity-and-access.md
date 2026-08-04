# Volume 1 · Chapter 1 — Identity & Access Management

**Area code:** `IAM`
Prerequisite: [Volume 0](../volume-00-foundation.md) §9 (Security standards)

---

## 1.1 Objective and scope

Provide authentication, authorisation, data scoping and session management for every human and
machine actor, such that the answer to "who did this, and were they allowed to?" is always
available and always enforced server-side.

**In scope:** user lifecycle, roles, permissions, data scope, field-level security, login,
password policy, MFA, sessions, device registration, shop-floor PIN/badge login, API keys,
portal (external) users, delegation of authority, impersonation.

**Out of scope:** the approval routing that consumes these permissions (Chapter 4), employee HR
records (Volume 10 — an employee and a user are distinct records, linked).

---

## 1.2 Conceptual model

```
                         ┌───────────────┐
                         │   PERMISSION  │  MODULE.ENTITY.ACTION
                         │  (system-     │  e.g. PROCUREMENT.PO.APPROVE
                         │   defined)    │
                         └───────┬───────┘
                                 │ many-to-many
                         ┌───────▼───────┐
                         │     ROLE      │  configurable bundle
                         │  + role type  │  (INTERNAL | PORTAL | SYSTEM)
                         └───────┬───────┘
                                 │ many-to-many
   ┌──────────────┐      ┌───────▼───────┐      ┌────────────────────┐
   │   EMPLOYEE   │◄────►│     USER      │◄────►│    DATA SCOPE      │
   │  (Vol 10)    │ 1:0..1│              │      │ companies[]        │
   └──────────────┘      │  + user type  │      │ branches[]         │
                         │  + status     │      │ plants[]           │
                         └───┬───────┬───┘      │ warehouses[]       │
                             │       │          │ cost_centres[]     │
                     ┌───────▼──┐ ┌──▼────────┐ │ row_rule           │
                     │ SESSION  │ │ DELEGATION│ │  (ALL|OWN|TEAM|    │
                     │ + device │ │ (from→to, │ │   DEPARTMENT)      │
                     └──────────┘ │  period)  │ └────────────────────┘
                                  └───────────┘
                         ┌───────────────┐
                         │  FIELD POLICY │  per role × entity × field
                         │  HIDDEN |     │
                         │  READ | EDIT  │
                         └───────────────┘
```

**V1-IAM-BR-001 (M)** Permissions are **never granted directly to a user**. They are granted to
roles; users hold roles. Rationale: an ERP with 500 users and direct grants becomes
un-auditable within a year.

**V1-IAM-BR-002 (M)** A user MAY hold multiple roles. Effective permissions are the **union** of
all active roles. Field policies are the **most permissive** across roles (a role granting EDIT
beats one granting READ). Data scope is the **union** of all roles' scopes plus the user's own
explicit scope.

**V1-IAM-BR-003 (M)** Deny always wins over allow. A permission explicitly denied on any held
role is denied regardless of other grants. Denials exist so that a broad role can be safely
reused with a narrow carve-out.

---

## 1.3 Functional requirements

### User lifecycle

| Ref | Pri | Requirement |
|---|---|---|
| **V1-IAM-FR-001** | M | The system MUST support creating a user with: login id, full name, email, mobile, user type, default company/branch/plant, roles, data scope, language, timezone, date/number format. |
| **V1-IAM-FR-002** | M | A user MAY be linked 1:1 to an employee record (Vol 10). When linked, name, department, designation and reporting manager are sourced from the employee master and are read-only on the user record. |
| **V1-IAM-FR-003** | M | User types MUST be supported: `INTERNAL` (staff), `PORTAL_SUPPLIER`, `PORTAL_CUSTOMER`, `SYSTEM` (integration/service accounts), `SHOPFLOOR` (PIN/badge, restricted to registered devices). |
| **V1-IAM-FR-004** | M | User status: `PENDING_ACTIVATION → ACTIVE ⇄ SUSPENDED → DEACTIVATED`. Deactivation is reversible; users are never deleted. |
| **V1-IAM-FR-005** | M | New users receive an activation link (expiry 48 h) and MUST set their own password. An administrator MUST NOT be able to read or set a user's working password. |
| **V1-IAM-FR-006** | M | Bulk user import from Excel with per-row validation and a dry-run preview. |
| **V1-IAM-FR-007** | M | Deactivating a user MUST: revoke all sessions immediately, reassign or flag their pending approvals (Ch 4), and warn if they are the sole approver at any workflow level. |
| **V1-IAM-FR-008** | S | Scheduled deactivation on a future date (for known exits), and auto-deactivation when the linked employee is marked as separated in HRMS. |

### Authentication

| Ref | Pri | Requirement |
|---|---|---|
| **V1-IAM-FR-009** | M | Login by login id or email + password, returning an access token and refresh token per V0-NFR-006/007. |
| **V1-IAM-FR-010** | M | Configurable password policy per company: minimum length (default 10), character classes, history (default last 5 barred), maximum age (default 90 days, 0 = never), and a blocklist of common/breached passwords. |
| **V1-IAM-FR-011** | M | Forced password change on first login and after an administrator-initiated reset. |
| **V1-IAM-FR-012** | M | Self-service password reset via email OTP or SMS OTP; OTP validity 10 minutes, maximum 3 attempts, rate-limited per account. |
| **V1-IAM-FR-013** | M | TOTP-based MFA (RFC 6238), with 10 single-use recovery codes issued at enrolment. MFA is enforceable per role and per user. |
| **V1-IAM-FR-014** | M | Shop-floor login: 6-digit PIN or badge scan, valid only on a **registered device** in a registered plant, auto-lock after 5 minutes idle, and the transaction is always attributed to the individual operator. |
| **V1-IAM-FR-015** | S | SSO via SAML 2.0 and OIDC, with just-in-time user provisioning and attribute-to-role mapping. |
| **V1-IAM-FR-016** | M | Concurrent-session policy per user type: configurable maximum (default: internal 3, portal 1, shopfloor unlimited on registered devices). Exceeding it either blocks the new login or evicts the oldest session, per configuration. |
| **V1-IAM-FR-017** | M | Session timeout: idle 30 minutes (configurable per role), absolute 12 hours. A warning appears 2 minutes before idle expiry with an extend option. |
| **V1-IAM-FR-018** | M | Administrators MUST be able to view all active sessions and force-terminate any session; users MUST be able to view and terminate their own sessions. |
| **V1-IAM-FR-019** | S | Impersonation ("log in as") for support, requiring `SYSTEM.USER.IMPERSONATE`, time-boxed to 60 minutes, prominently banner-flagged in the UI, blocked for approval actions, and every impersonated action audited with both identities. |

### Authorization

| Ref | Pri | Requirement |
|---|---|---|
| **V1-IAM-FR-020** | M | Roles are user-definable: code, name, description, role type, and permission set. System roles are seeded and MAY be cloned but MUST NOT be edited or deleted. |
| **V1-IAM-FR-021** | M | The permission catalogue is auto-discovered from endpoint declarations at build time, so the UI can never grant a permission that no endpoint checks, and no endpoint can exist without an entry. |
| **V1-IAM-FR-022** | M | Permission assignment UI presents a module → entity → action matrix with select-all per row/column and a live count of affected users. |
| **V1-IAM-FR-023** | M | Data scope is assignable per user: explicit lists of companies, branches, plants, warehouses and cost centres, plus a row-level rule (`ALL` / `OWN` / `TEAM` / `DEPARTMENT` / `ASSIGNED_TERRITORY`). |
| **V1-IAM-FR-024** | M | Field-level policies are definable per role × entity × field with values `HIDDEN`, `READ_ONLY`, `EDITABLE`. Applied at serialisation (V0-NFR-011). |
| **V1-IAM-FR-025** | M | Approval authority limits are definable per role/user: document type, minimum and maximum amount, currency, and optional dimension (cost centre, item category, plant). Consumed by Chapter 4. |
| **V1-IAM-FR-026** | M | "Who can do X?" query: given a permission, list every role and user holding it. And its inverse: given a user, show every effective permission with the role that granted it. |
| **V1-IAM-FR-027** | M | Any change to a role's permissions or a user's roles MUST invalidate the affected permission caches within 60 seconds and MUST be audited with a before/after diff. |
| **V1-IAM-FR-028** | M | Segregation-of-duties rules (V0 §4.2) are configurable as conflicting-permission pairs. Assigning both sides to one user raises a blocking error, overridable only with `SYSTEM.ROLE.ASSIGN` plus a recorded justification. |

### API keys and service accounts

| Ref | Pri | Requirement |
|---|---|---|
| **V1-IAM-FR-029** | M | API keys are issuable per integration with: name, company, permission set, IP allowlist, expiry date, and rate limit. The secret is displayed **once** at creation and stored only as a hash. |
| **V1-IAM-FR-030** | M | API key usage is logged (last used at, from IP, call count) and keys are revocable immediately. |
| **V1-IAM-FR-031** | M | Keys expiring within 30 days raise a notification to their owner and to system administrators. |

### Delegation

| Ref | Pri | Requirement |
|---|---|---|
| **V1-IAM-FR-032** | M | A user MAY delegate their approval authority to another user for a date range, optionally limited to specific document types. |
| **V1-IAM-FR-033** | M | Delegation transfers **approval authority only** — never data-entry rights, never permissions the delegate's own roles don't otherwise imply for viewing the document. |
| **V1-IAM-FR-034** | M | Delegated approvals are recorded as "approved by B on behalf of A" in the document, the audit log and the printout. The original authority holder remains accountable. |
| **V1-IAM-FR-035** | M | Delegation chains MUST NOT exceed one hop — B cannot re-delegate A's authority onward. |
| **V1-IAM-FR-036** | M | Delegation MUST NOT create a segregation-of-duties conflict; the system validates at creation time. |

---

## 1.4 Business rules

| Ref | Pri | Rule |
|---|---|---|
| **V1-IAM-BR-004** | M | Login id is unique across the entire installation and immutable once created. Email is unique per company. |
| **V1-IAM-BR-005** | M | Passwords are stored as Argon2id hashes only. No reversible storage, anywhere, for any reason. |
| **V1-IAM-BR-006** | M | Account lockout after 5 failed attempts in 15 minutes, for 30 minutes. The response to a locked account is byte-identical to a wrong-password response (no account enumeration). An alert goes to the user's email and to security administrators. |
| **V1-IAM-BR-007** | M | The last user holding an active `SYS_ADMIN` role in an installation MUST NOT be deactivable, nor have that role removed. The system MUST block it with a clear message. |
| **V1-IAM-BR-008** | M | A user's active company at any moment MUST be within their data scope. Switching company re-resolves all permissions and scopes; it does not carry the previous company's cached authorisations. |
| **V1-IAM-BR-009** | M | Portal users (`PORTAL_SUPPLIER`, `PORTAL_CUSTOMER`) are hard-restricted to rows where the linked supplier/customer id matches their own, enforced in the repository layer, in addition to permissions. |
| **V1-IAM-BR-010** | M | `AUDITOR` role type MUST NOT be assignable any permission whose action is in {`CREATE`, `EDIT`, `DELETE`, `SUBMIT`, `APPROVE`, `REJECT`, `CANCEL`, `POST`, `REVERSE`}. Enforced by a role-type permission blacklist. |
| **V1-IAM-BR-011** | M | Impersonation MUST NOT be permitted into a user holding `SYS_ADMIN`, and MUST NOT permit approval, payment release, or password change actions. |
| **V1-IAM-BR-012** | M | A password reset, MFA reset, email change, or mobile change MUST notify the user on their **previous** contact details as well as the new ones. |
| **V1-IAM-BR-013** | M | Deactivating a user with pending approvals MUST require the administrator to choose: reassign to a named user, or route to the delegation/escalation chain. Silent orphaning is not permitted. |
| **V1-IAM-BR-014** | M | Shop-floor PIN login is valid only on devices registered to that plant and only for users holding a `SHOPFLOOR`-compatible role. A PIN MUST NOT grant approval, master-data or financial permissions. |

---

## 1.5 Data model

```sql
-- ─────────────────────────── USERS ───────────────────────────
iam_user
  id, uid, company_id                       -- home company
  login_id            VARCHAR(80)  NOT NULL
  email               VARCHAR(150) NOT NULL
  mobile              VARCHAR(20)  NULL
  full_name           VARCHAR(150) NOT NULL
  user_type           VARCHAR(20)  NOT NULL  -- INTERNAL|PORTAL_SUPPLIER|PORTAL_CUSTOMER|
                                             -- SYSTEM|SHOPFLOOR
  status              VARCHAR(25)  NOT NULL  -- PENDING_ACTIVATION|ACTIVE|SUSPENDED|DEACTIVATED
  employee_id         BIGINT UNSIGNED NULL   -- FK hrm_employee (Vol 10)
  supplier_id         BIGINT UNSIGNED NULL   -- FK mst_supplier, for PORTAL_SUPPLIER
  customer_id         BIGINT UNSIGNED NULL   -- FK mst_customer, for PORTAL_CUSTOMER
  password_hash       VARCHAR(255) NULL      -- Argon2id; NULL for SSO-only users
  password_set_at     DATETIME(6)  NULL
  password_expires_at DATETIME(6)  NULL
  must_change_password TINYINT(1)  DEFAULT 0
  shopfloor_pin_hash  VARCHAR(255) NULL
  badge_code          VARCHAR(50)  NULL
  mfa_enabled         TINYINT(1)   DEFAULT 0
  mfa_secret_enc      VARBINARY(255) NULL    -- app-level encrypted (V0-NFR-014)
  failed_attempts     TINYINT UNSIGNED DEFAULT 0
  locked_until        DATETIME(6)  NULL
  last_login_at       DATETIME(6)  NULL
  last_login_ip       VARCHAR(45)  NULL
  default_company_id  BIGINT UNSIGNED NOT NULL
  default_branch_id   BIGINT UNSIGNED NULL
  default_plant_id    BIGINT UNSIGNED NULL
  language            VARCHAR(10)  DEFAULT 'en-IN'
  timezone            VARCHAR(50)  DEFAULT 'Asia/Kolkata'
  date_format         VARCHAR(20)  DEFAULT 'dd-MMM-yyyy'
  number_format       VARCHAR(20)  DEFAULT 'IN'   -- IN | INTL
  row_rule            VARCHAR(30)  DEFAULT 'ALL'  -- ALL|OWN|TEAM|DEPARTMENT|ASSIGNED_TERRITORY
  deactivated_on      DATE NULL
  <standard columns>
  UNIQUE KEY uk_user_login (login_id, deleted_key)
  UNIQUE KEY uk_user_email (company_id, email, deleted_key)
  KEY ix_user_employee (employee_id)

iam_password_history
  id, user_id, password_hash VARCHAR(255), created_at
  KEY ix_pwd_hist_user (user_id, created_at)

iam_user_mfa_recovery_code
  id, user_id, code_hash VARCHAR(255), used_at DATETIME(6) NULL, created_at

-- ─────────────────────────── ROLES & PERMISSIONS ───────────────────────────
iam_role
  id, uid, company_id NULL                  -- NULL = installation-wide template role
  code                VARCHAR(50)  NOT NULL
  name                VARCHAR(150) NOT NULL
  description         VARCHAR(500) NULL
  role_type           VARCHAR(20)  NOT NULL -- INTERNAL|PORTAL|SYSTEM|AUDIT
  is_system           TINYINT(1)   DEFAULT 0  -- seeded, not editable
  is_active           TINYINT(1)   DEFAULT 1
  <standard columns>
  UNIQUE KEY uk_role_code (company_id, code, deleted_key)

iam_permission                              -- seeded from endpoint declarations, not user-editable
  id, uid,
  code                VARCHAR(100) NOT NULL  -- 'PROCUREMENT.PO.APPROVE'
  module              VARCHAR(50)  NOT NULL
  entity              VARCHAR(50)  NOT NULL
  action              VARCHAR(30)  NOT NULL
  name                VARCHAR(150) NOT NULL
  description         VARCHAR(500) NULL
  is_sensitive        TINYINT(1)   DEFAULT 0  -- requires extra confirmation to grant
  UNIQUE KEY uk_perm_code (code)

iam_role_permission
  id, role_id, permission_id,
  effect              VARCHAR(10) DEFAULT 'ALLOW'  -- ALLOW | DENY
  <standard columns>
  UNIQUE KEY uk_role_perm (role_id, permission_id, deleted_key)

iam_user_role
  id, user_id, role_id, company_id,
  valid_from DATE NULL, valid_to DATE NULL,
  <standard columns>
  UNIQUE KEY uk_user_role (user_id, role_id, company_id, deleted_key)

-- ─────────────────────────── DATA SCOPE ───────────────────────────
iam_user_scope
  id, user_id,
  scope_type          VARCHAR(20) NOT NULL  -- COMPANY|BRANCH|PLANT|WAREHOUSE|COST_CENTRE|
                                            -- DEPARTMENT|TERRITORY
  scope_entity_id     BIGINT UNSIGNED NOT NULL
  access_level        VARCHAR(10) DEFAULT 'RW'  -- R | RW
  <standard columns>
  UNIQUE KEY uk_user_scope (user_id, scope_type, scope_entity_id, deleted_key)

-- ─────────────────────────── FIELD-LEVEL SECURITY ───────────────────────────
iam_field_policy
  id, uid, company_id,
  role_id             BIGINT UNSIGNED NOT NULL
  entity_type         VARCHAR(80)  NOT NULL   -- 'prc_purchase_order'
  field_name          VARCHAR(80)  NOT NULL   -- 'rate', 'total_amount'
  access              VARCHAR(15)  NOT NULL   -- HIDDEN | READ_ONLY | EDITABLE
  condition_expr      VARCHAR(500) NULL       -- optional: applies only when expression true
  <standard columns>
  UNIQUE KEY uk_field_policy (role_id, entity_type, field_name, deleted_key)

-- ─────────────────────────── APPROVAL AUTHORITY ───────────────────────────
iam_approval_authority
  id, uid, company_id,
  user_id             BIGINT UNSIGNED NULL    -- either user_id …
  role_id             BIGINT UNSIGNED NULL    -- … or role_id (exactly one)
  document_type       VARCHAR(50)  NOT NULL
  min_amount          DECIMAL(18,2) DEFAULT 0
  max_amount          DECIMAL(18,2) NULL      -- NULL = unlimited
  currency_code       VARCHAR(3)   DEFAULT 'INR'
  dimension_type      VARCHAR(30)  NULL       -- COST_CENTRE|ITEM_CATEGORY|PLANT|DEPARTMENT
  dimension_value_id  BIGINT UNSIGNED NULL
  valid_from DATE, valid_to DATE NULL,
  is_active           TINYINT(1) DEFAULT 1
  <standard columns>
  CHECK ((user_id IS NULL) <> (role_id IS NULL))

-- ─────────────────────────── DELEGATION ───────────────────────────
iam_delegation
  id, uid, company_id,
  from_user_id        BIGINT UNSIGNED NOT NULL
  to_user_id          BIGINT UNSIGNED NOT NULL
  document_types      JSON NULL               -- NULL = all
  valid_from          DATE NOT NULL
  valid_to            DATE NOT NULL
  reason              VARCHAR(500) NULL
  status              VARCHAR(20) DEFAULT 'ACTIVE'  -- ACTIVE|EXPIRED|REVOKED
  <standard columns>
  KEY ix_delegation_active (company_id, to_user_id, valid_from, valid_to)
  CHECK (from_user_id <> to_user_id)

-- ─────────────────────────── SESSIONS & DEVICES ───────────────────────────
iam_session
  id, uid, user_id, company_id,
  refresh_token_hash  VARCHAR(255) NOT NULL
  parent_session_uid  CHAR(26) NULL           -- rotation family, for reuse detection
  device_id           BIGINT UNSIGNED NULL
  channel             VARCHAR(20)  NOT NULL   -- WEB|MOBILE|PORTAL|API|KIOSK
  ip_address          VARCHAR(45), user_agent VARCHAR(500)
  issued_at DATETIME(6), expires_at DATETIME(6),
  last_activity_at DATETIME(6),
  revoked_at DATETIME(6) NULL, revoke_reason VARCHAR(100) NULL
  KEY ix_session_user (user_id, revoked_at, expires_at)

iam_device
  id, uid, company_id, plant_id NULL,
  device_code   VARCHAR(50)  NOT NULL         -- printed on the device label
  device_name   VARCHAR(150) NOT NULL
  device_type   VARCHAR(30)  NOT NULL         -- HANDHELD|TABLET|KIOSK|PHONE|SCANNER
  platform      VARCHAR(30)  NULL
  push_token    VARCHAR(255) NULL
  is_registered TINYINT(1) DEFAULT 0
  allow_pin_login TINYINT(1) DEFAULT 0
  last_seen_at  DATETIME(6) NULL
  is_active     TINYINT(1) DEFAULT 1
  <standard columns>
  UNIQUE KEY uk_device_code (company_id, device_code, deleted_key)

-- ─────────────────────────── API KEYS ───────────────────────────
iam_api_key
  id, uid, company_id,
  name          VARCHAR(150) NOT NULL
  key_prefix    VARCHAR(12)  NOT NULL         -- shown in UI for identification
  key_hash      VARCHAR(255) NOT NULL
  role_id       BIGINT UNSIGNED NULL
  ip_allowlist  JSON NULL
  rate_limit_per_min INT DEFAULT 200
  expires_at    DATETIME(6) NULL
  last_used_at  DATETIME(6) NULL
  last_used_ip  VARCHAR(45) NULL
  call_count    BIGINT UNSIGNED DEFAULT 0
  status        VARCHAR(20) DEFAULT 'ACTIVE'  -- ACTIVE|REVOKED|EXPIRED
  <standard columns>
  UNIQUE KEY uk_api_key_prefix (key_prefix)

-- ─────────────────────────── SOD RULES ───────────────────────────
iam_sod_rule
  id, uid, company_id,
  name          VARCHAR(150) NOT NULL
  permission_a_id BIGINT UNSIGNED NOT NULL
  permission_b_id BIGINT UNSIGNED NOT NULL
  severity      VARCHAR(15) DEFAULT 'BLOCK'   -- BLOCK | WARN
  is_active     TINYINT(1) DEFAULT 1
  <standard columns>

iam_sod_override
  id, uid, company_id, user_id, sod_rule_id,
  justification TEXT NOT NULL, approved_by BIGINT UNSIGNED,
  valid_to DATE NULL, <standard columns>
```

---

## 1.6 Screens

### S-IAM-01 · User List

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Users                                          [ + New User ] [Import] [Export] [⋮]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Name / login / email…   [Status ▼] [Role ▼] [Type ▼] [Department ▼]   ⚙ Columns  ⟳  │
│ Applied: Status = Active ✕                                                [Clear all]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│[ ]│ Login      │ Name          │ Type     │ Roles            │ Last login  │Status│ ⋮  │
│[ ]│ rkumar     │ Ravi Kumar    │ Internal │ PURCH_HEAD, …+1  │ 28-Jul 09:14│⚑Act. │ ⋮  │
│[ ]│ smeena     │ S. Meena      │ Internal │ QC_INSP          │ 28-Jul 08:02│⚑Act. │ ⋮  │
│[ ]│ op_1147    │ Anand P       │ Shopfloor│ OPERATOR         │ 28-Jul 06:31│⚑Act. │ ⋮  │
│[ ]│ jindal_sup │ Jindal Steel  │ Portal   │ SUPPLIER_PORTAL  │ 26-Jul 15:40│⚑Act. │ ⋮  │
│[ ]│ kraman     │ K. Raman      │ Internal │ ACCOUNTS         │ 02-Jun 11:22│⚑Susp.│ ⋮  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ⋮ row menu: View · Edit · Reset password · Reset MFA · View sessions · View permissions │
│            · Suspend · Deactivate · Impersonate                                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Showing 1–50 of 214                       [◀] 1 2 3 4 5 [▶]        Rows: [50 ▼]        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-IAM-02 · User Create / Edit

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  ← User — Ravi Kumar (rkumar)                            [Cancel]  [Save]              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Basic │ Roles & Permissions │ Data Scope │ Approval Limits │ Security │ Sessions │ Log │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ Identity ───────────────────────────┐ ┌─ Defaults ──────────────────────────────┐   │
│ │ Login ID *   [rkumar          ] 🔒   │ │ Company *   [SSB Industries Pvt Ltd ▼]  │   │
│ │ User Type *  [Internal ▼]            │ │ Branch      [Chennai ▼]                 │   │
│ │ Link Employee 🔍 [EMP0142 Ravi Kumar]│ │ Plant       [Plant 1 — Sriperumbudur ▼] │   │
│ │ Full Name *  [Ravi Kumar       ] 🔒  │ │ Language    [English (India) ▼]         │   │
│ │ Email *      [ravi@ssb.co.in       ] │ │ Timezone    [Asia/Kolkata ▼]            │   │
│ │ Mobile       [+91 98400 12345      ] │ │ Date format [dd-MMM-yyyy ▼]             │   │
│ │ Status       [Active ▼]              │ │ Numbers     (•) Indian ( ) International │   │
│ │ Department   Purchase        🔒      │ │ Row rule    [All records in scope ▼]    │   │
│ │ Designation  Purchase Head   🔒      │ └─────────────────────────────────────────┘   │
│ │ Reports to   Mr. S. Balaji   🔒      │  🔒 = sourced from Employee master            │
│ └──────────────────────────────────────┘                                               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Roles & Permissions tab**

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Assigned roles                                                        [ + Assign role ]│
│ ┌──────────────────┬───────────────────────┬────────────┬────────────┬──────────────┐ │
│ │ Role             │ Description           │ Valid from │ Valid to   │              │ │
│ │ PURCH_HEAD       │ Purchase Head         │ 01-Apr-25  │ —          │ [Remove]     │ │
│ │ PPC              │ Production Planning   │ 01-Jun-26  │ 31-Aug-26  │ [Remove]     │ │
│ └──────────────────┴───────────────────────┴────────────┴────────────┴──────────────┘ │
│                                                                                        │
│ ⚠ Segregation of duties: PURCH_HEAD grants PROCUREMENT.PO.CREATE and PROCUREMENT.PO.   │
│   APPROVE. Self-approval is blocked by workflow, so this is a WARNING, not a block.    │
│                                                                                        │
├─ Effective permissions (read-only, computed) ──────────────── [🔍 filter] [Export] ────┤
│ Permission                        │ Granted by      │ Effect                           │
│ PROCUREMENT.PO.VIEW               │ PURCH_HEAD      │ ALLOW                            │
│ PROCUREMENT.PO.APPROVE            │ PURCH_HEAD      │ ALLOW                            │
│ PROCUREMENT.PO.CANCEL             │ PURCH_HEAD      │ ALLOW                            │
│ FINANCE.PAYMENT.RELEASE           │ PURCH_HEAD      │ ⛔ DENY (explicit)                │
│ PLANNING.MRP.RUN                  │ PPC             │ ALLOW (expires 31-Aug-26)        │
│ … 84 permissions                                                                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Data Scope tab**

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Row-level rule    [All records within scope ▼]                                         │
│                    Own records only / Own team / Own department / Assigned territory   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Companies    [x] SSB Industries Pvt Ltd      [ ] SSB Exports LLP                       │
│ Branches     [x] Chennai (HO)   [x] Coimbatore   [ ] Delhi                             │
│ Plants       [x] Plant 1 — Sriperumbudur     [ ] Plant 2 — Hosur                       │
│ Warehouses   [x] RM Store  [x] WIP Store  [x] FG Store  [ ] Scrap Yard                 │
│ Cost centres [x] CC-PUR  [ ] CC-PRD  [ ] CC-QC                                         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Preview: this user will see approximately 12,480 of 31,206 purchase documents.         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-IAM-03 · Role Management

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Role — PURCH_HEAD (Purchase Head)              [Clone] [Deactivate] [Save]          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Code * [PURCH_HEAD] 🔒   Name * [Purchase Head]   Type [Internal ▼]   [x] Active       │
│ Description [Full procurement authority including PO approval up to ₹50 lakh        ]  │
│ Users holding this role: 4   [View]                                                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Permissions                          [Expand all] [Collapse all]  🔍 [filter…]         │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Module / Entity        │VIEW│CREAT│EDIT│DEL│SUBM│APPR│REJ│CANC│AMEND│PRINT│EXPORT│ │ │
│ │ ▾ PROCUREMENT                                                                      │ │
│ │    Purchase Requisition│ [x]│ [x] │[x] │[ ]│[x] │[x] │[x]│[x] │ [x] │ [x] │  [x] │ │ │
│ │    RFQ                 │ [x]│ [x] │[x] │[ ]│[x] │[x] │[x]│[x] │ [x] │ [x] │  [x] │ │ │
│ │    Supplier Quotation  │ [x]│ [x] │[x] │[ ]│[x] │[x] │[x]│[ ] │ [ ] │ [x] │  [x] │ │ │
│ │    Purchase Order      │ [x]│ [x] │[x] │[ ]│[x] │[x] │[x]│[x] │ [x] │ [x] │  [x] │ │ │
│ │    GRN                 │ [x]│ [ ] │[ ] │[ ]│[ ] │[ ] │[ ]│[ ] │ [ ] │ [x] │  [x] │ │ │
│ │ ▾ FINANCE                                                                          │ │
│ │    Payment             │ [x]│ [ ] │[ ] │[ ]│[ ] │[ ] │[ ]│[ ] │ [ ] │ [ ] │  [ ] │ │ │
│ │    Payment Release     │ ⛔ DENY — explicitly denied for segregation of duties      │ │
│ │ ▸ INVENTORY  ▸ SALES  ▸ PRODUCTION  ▸ QUALITY  ▸ SYSTEM                            │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│ Selected: 84 permissions       ⚠ 2 sensitive permissions selected                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Field-level policies                                              [ + Add policy ]     │
│ Entity                │ Field          │ Access     │ Condition                        │
│ prc_purchase_order    │ (all)          │ EDITABLE   │ —                                │
│ hrm_employee          │ salary_ctc     │ HIDDEN     │ —                                │
│ mst_supplier          │ bank_account_no│ HIDDEN     │ —                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ Changing this role affects 4 users. Their permissions refresh within 60 seconds.     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### S-IAM-04 · Login

```
                    ┌────────────────────────────────────────┐
                    │              SSB ERP                   │
                    │   Stainless Steel Bottle Manufacturing │
                    ├────────────────────────────────────────┤
                    │  Login ID / Email                      │
                    │  [                                  ]  │
                    │  Password                              │
                    │  [                               ] 👁   │
                    │  [ ] Remember this device (30 days)    │
                    │                                        │
                    │           [      Sign in      ]        │
                    │                                        │
                    │  Forgot password?    Sign in with SSO  │
                    ├────────────────────────────────────────┤
                    │  🏭 Shop floor? [ Use PIN / Badge ]     │
                    └────────────────────────────────────────┘

    MFA step (if enabled):
                    ┌────────────────────────────────────────┐
                    │  Two-factor authentication              │
                    │  Enter the 6-digit code from your app   │
                    │       [_][_][_]  [_][_][_]              │
                    │  [ ] Trust this device for 30 days      │
                    │           [      Verify      ]          │
                    │  Use a recovery code instead            │
                    └────────────────────────────────────────┘

    Shop-floor PIN (kiosk/handheld, device-registered only):
                    ┌────────────────────────────────────────┐
                    │  Plant 1 · Line A · Device HH-014       │
                    │  Scan badge  ▌▌▐▌▐▐▌  or enter PIN      │
                    │        [•][•][•][•][•][•]               │
                    │      [1][2][3]                          │
                    │      [4][5][6]     [ ⌫ ]  [ Enter ]     │
                    │      [7][8][9]                          │
                    │      [ ][0][ ]                          │
                    └────────────────────────────────────────┘
```

### S-IAM-05 · My Profile & Sessions

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  My Profile                                                                            │
│  Profile │ Security │ Preferences │ Notifications │ Sessions & Devices │ Delegation    │
├─ Security ─────────────────────────────────────────────────────────────────────────────┤
│  Password        Last changed 12-May-2026 · expires in 14 days   [ Change password ]   │
│  Two-factor      ✔ Enabled (Authenticator app)   [ Reconfigure ] [ Recovery codes ]    │
│                  7 of 10 recovery codes remaining                                      │
├─ Sessions & Devices ───────────────────────────────────────────────────────────────────┤
│  Device            │ Location    │ Channel │ Started      │ Last active │              │
│  Chrome / Windows  │ 10.2.14.88  │ Web     │ 28-Jul 09:14 │ now  (this) │              │
│  ERP App / Android │ 10.2.30.11  │ Mobile  │ 27-Jul 07:02 │ 28-Jul 08:40│ [Sign out]   │
│  Edge / Windows    │ 49.37.x.x   │ Web     │ 21-Jul 18:33 │ 21-Jul 19:10│ [Sign out]   │
│                                                        [ Sign out of all other devices ]│
├─ Delegation ───────────────────────────────────────────────────────────────────────────┤
│  Delegate my approvals to    🔍 [S. Balaji (sbalaji)          ]                        │
│  From [01-Aug-2026] To [10-Aug-2026]                                                   │
│  Document types  [x] Purchase Order  [x] Purchase Requisition  [ ] All                  │
│  Reason [Annual leave                                                    ]             │
│                                                        [ Create delegation ]           │
│  Active delegations: none                                                              │
│  Delegated to me:  Purchase Requisition from K. Raman, 20-Jul → 30-Jul  [View]         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Other screens in this chapter

| Screen | Purpose |
|---|---|
| S-IAM-06 · Permission Explorer | "Who can approve POs above ₹10 lakh?" — search by permission, see roles and users |
| S-IAM-07 · Active Sessions (admin) | All sessions installation-wide, filter by user/device/channel, force terminate |
| S-IAM-08 · Device Registry | Register/deregister shop-floor devices, bind to plant, enable PIN login |
| S-IAM-09 · API Keys | Create, view (prefix only), revoke; usage stats |
| S-IAM-10 · Delegation Register (admin) | All delegations, create on behalf of others, revoke |
| S-IAM-11 · SoD Rules & Violations | Configure conflicting pairs; report of users currently in violation with overrides |
| S-IAM-12 · Login Activity | Successful/failed logins, lockouts, by user/IP/date — security monitoring |

---

## 1.7 API

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/login` | — | Returns access + refresh token, or MFA challenge |
| POST | `/api/v1/auth/mfa/verify` | — | Completes an MFA challenge |
| POST | `/api/v1/auth/refresh` | — | Rotates refresh token; reuse detection per V0-NFR-007 |
| POST | `/api/v1/auth/logout` | authenticated | Revokes current session |
| POST | `/api/v1/auth/forgot-password` | — | Always returns 202 regardless of account existence |
| POST | `/api/v1/auth/reset-password` | — | Token + new password |
| POST | `/api/v1/auth/change-password` | authenticated | Requires current password |
| POST | `/api/v1/auth/pin-login` | — | Shop floor; requires registered `X-Device-Id` |
| GET | `/api/v1/auth/me` | authenticated | Profile, active company, effective permissions, scope, feature flags |
| POST | `/api/v1/auth/switch-company` | authenticated | Re-issues token for another in-scope company |
| GET/POST | `/api/v1/users` | `SYSTEM.USER.VIEW` / `.CREATE` | |
| GET/PATCH | `/api/v1/users/{uid}` | `SYSTEM.USER.VIEW` / `.EDIT` | |
| POST | `/api/v1/users/{uid}/activate` `/suspend` `/deactivate` | `SYSTEM.USER.EDIT` / `.DEACTIVATE` | |
| POST | `/api/v1/users/{uid}/reset-password` | `SYSTEM.USER.RESET_PASSWORD` | Sends a reset link; never sets a password directly |
| POST | `/api/v1/users/{uid}/reset-mfa` | `SYSTEM.USER.RESET_PASSWORD` | Audited, notifies user |
| GET | `/api/v1/users/{uid}/effective-permissions` | `SYSTEM.USER.VIEW` | Permission + granting role |
| PUT | `/api/v1/users/{uid}/roles` | `SYSTEM.ROLE.ASSIGN` | Validates SoD |
| PUT | `/api/v1/users/{uid}/scope` | `SYSTEM.USER.EDIT` | |
| GET | `/api/v1/users/{uid}/sessions` · DELETE `/sessions/{sid}` | `SYSTEM.USER.VIEW` / `.EDIT` | |
| POST | `/api/v1/users/import` | `SYSTEM.USER.CREATE` | 202 + job uid |
| GET/POST | `/api/v1/roles` · GET/PATCH `/roles/{uid}` | `SYSTEM.ROLE.*` | |
| POST | `/api/v1/roles/{uid}/clone` | `SYSTEM.ROLE.CREATE` | |
| GET | `/api/v1/roles/{uid}/users` | `SYSTEM.ROLE.VIEW` | Impact analysis before edit |
| GET | `/api/v1/permissions` | `SYSTEM.PERMISSION.VIEW` | Full catalogue, grouped |
| GET | `/api/v1/permissions/{code}/holders` | `SYSTEM.PERMISSION.VIEW` | "Who can do X" |
| GET/PUT | `/api/v1/roles/{uid}/field-policies` | `SYSTEM.ROLE.EDIT` | |
| GET/POST/DELETE | `/api/v1/delegations` | `SYSTEM.DELEGATION.CREATE` | Own; others need `.CREATE_FOR_OTHERS` |
| GET/POST/DELETE | `/api/v1/api-keys` | `SYSTEM.INTEGRATION.API_KEY_MANAGE` | Secret returned once |
| GET/POST | `/api/v1/devices` · POST `/devices/{uid}/register` | `SYSTEM.INTEGRATION.CONFIGURE` | |
| POST | `/api/v1/users/{uid}/impersonate` | `SYSTEM.USER.IMPERSONATE` | Time-boxed token |
| GET | `/api/v1/sod/violations` | `SYSTEM.ROLE.VIEW` | Current violations report |

---

## 1.8 Events

| Event | When |
|---|---|
| `iam.user.created` / `.updated` / `.activated` / `.suspended` / `.deactivated` | User lifecycle |
| `iam.user.logged_in` / `.login_failed` / `.locked_out` | Authentication |
| `iam.user.password_changed` / `.password_reset` / `.mfa_enabled` / `.mfa_reset` | Credential change |
| `iam.role.created` / `.updated` / `.deleted` | Role change |
| `iam.permission.changed` | Any role-permission or user-role change → cache invalidation |
| `iam.delegation.created` / `.expired` / `.revoked` | Delegation |
| `iam.api_key.created` / `.revoked` / `.expiring_soon` | API key |
| `iam.sod.violation_detected` | SoD conflict raised or overridden |
| `iam.impersonation.started` / `.ended` | Support impersonation |

---

## 1.9 Notifications

| Trigger | Recipients | Channels | Urgency |
|---|---|---|---|
| Account created / activation link | New user | Email | Normal |
| Password reset requested | User (old + new contacts) | Email + SMS | Critical |
| Password changed | User | Email | Critical |
| MFA enabled / reset | User | Email + SMS | Critical |
| Login from a new device or unusual IP | User | Email | Critical |
| Account locked out | User + security admins | Email | Critical |
| Role or permission changed | Affected user + admins | In-app + Email | High |
| Delegation created / starting / ending | Both users | In-app + Email | Normal |
| API key expiring in 30 days | Key owner + admins | Email | Normal |
| SoD violation detected | Security admins | In-app + Email | High |

---

## 1.10 Reports

| Report | Content |
|---|---|
| User Master List | All users with type, status, roles, department, last login |
| User Access Rights | Per user: every effective permission and its granting role — the standard artefact an IT auditor asks for |
| Role Definition Report | Per role: permissions, field policies, and holders |
| Permission Holders | Per permission: every role and user holding it |
| Login Activity | Successes, failures, lockouts by user/IP/date/channel |
| Dormant Users | Active accounts with no login for N days (default 60) — an access-review control |
| Segregation of Duties Violations | Users in violation, with overrides and justifications |
| Delegation Register | All delegations, active and historic |
| API Key Usage | Keys, last used, call volume, expiry |
| Privileged Action Log | Every use of a `is_sensitive` permission |

---

## 1.11 Acceptance criteria (extract)

- A request bearing Company A's context returns **zero** rows belonging to Company B, for
  every endpoint in every module. Automated per module.
- Removing a permission from a role revokes it for all holders within 60 seconds, without a
  re-login.
- A `STORE_OPR` fetching a purchase order receives a payload with no `rate`, `discount`,
  `amount` or `total_amount` keys present, and `meta.masked_fields` listing them.
- A user cannot approve a document they created, when `ALLOW_SELF_APPROVAL` is off, even
  holding both permissions.
- Deactivating the sole remaining `SYS_ADMIN` is blocked with an explanatory message.
- A refresh token replayed after use invalidates the whole session family and raises a
  security alert.
- Five failed logins produce a lockout whose response is indistinguishable from a wrong
  password.

---

**Next:** [Chapter 2 — Organisation Structure](02-organization-structure.md)
