# Volume 1 — Core Framework

**Stainless Steel Water Bottle Manufacturing ERP**
Version 0.1 (draft) · 2026-07-28

> **Prerequisite:** [Volume 0 — Foundation & Cross-Cutting Standards](../volume-00-foundation.md).
> This volume does not repeat the standards defined there. Every table assumes the standard
> column block (V0-DR-002), every endpoint assumes the API standards (V0-IR-001…027), every
> document assumes the transaction pattern (V0 §10).

---

## Why this volume comes first

Nothing in Volumes 2–11 can be built until this volume works. Every purchase order, every
production entry, every invoice depends on all seven of these services existing:

```
        ┌──────────────────────────────────────────────────────────────┐
        │                    ANY BUSINESS DOCUMENT                     │
        │        (PO, GRN, Production Order, Invoice, …)               │
        └───┬────────┬─────────┬─────────┬────────┬────────┬─────────┬─┘
            │        │         │         │        │        │         │
       ┌────▼──┐ ┌───▼───┐ ┌───▼────┐ ┌──▼───┐ ┌──▼───┐ ┌──▼────┐ ┌──▼─────┐
       │ Who   │ │ Where │ │ Number │ │Approve│ │Audit │ │Notify │ │Master  │
       │ (IAM) │ │ (Org) │ │  (NUM) │ │ (WFL) │ │(AUD) │ │ (NTF) │ │ data   │
       │  Ch 1 │ │  Ch 2 │ │  Ch 3  │ │  Ch 4 │ │ Ch 5 │ │  Ch 6 │ │ (MDM)  │
       └───────┘ └───────┘ └────────┘ └───────┘ └──────┘ └───────┘ │  Ch 7  │
                                                                    └────────┘
```

---

## Chapters

| Ch | Area code | Title | Covers |
|---|---|---|---|
| 1 | `IAM` | [Identity & Access Management](01-identity-and-access.md) | Users, roles, permissions, data scope, field-level security, sessions, MFA, API keys, delegation, login |
| 2 | `ORG` | [Organisation Structure](02-organization-structure.md) | Company, branch, plant, production line, warehouse, zone, bin, department, cost centre, financial year, period |
| 3 | `NUM` | [Document Numbering](03-document-numbering.md) | Series configuration, allocation engine, gapless statutory series, admin screens |
| 4 | `WFL` | [Workflow & Approval Engine](04-workflow-and-approvals.md) | Approval matrix, workflow builder, routing rules, escalation, delegation, approvals inbox |
| 5 | `AUD` | [Audit, Compliance & Data Lifecycle](05-audit-and-compliance.md) | Audit log, change history, attachments, comments, document links, soft delete, archival, backup/restore |
| 6 | `NTF` | [Notification & Communication](06-notifications.md) | Event rules, templates, email/SMS/WhatsApp/push/in-app channels, preferences, delivery tracking |
| 7 | `MDM` | [Master Data Management](07-master-data.md) | **All master data** — geography, tax/GST/HSN, UOM, business partners, product & bottle-specific masters, manufacturing, quality, logistics, reason/defect codes |
| 8 | `SYS` | [System Administration & Platform Services](08-system-administration.md) | System parameters, licence, dashboard designer, saved views, UDFs, tags, job scheduler, health, data import/export, seed data |

---

## Module objective

Provide a configurable, secure, auditable platform on which every business module is built,
such that:

- **V1-FR-001 (M)** No business module implements its own authentication, authorisation,
  numbering, approval, audit, attachment, comment or notification logic.
- **V1-FR-002 (M)** All organisational structure, master data, workflow, numbering, roles and
  permissions are configurable through the UI by an administrator **without any code change or
  deployment**.
- **V1-FR-003 (M)** Every action taken by any user in any module is attributable, reversible
  where legal, and permanently auditable.

## Out of scope for this volume

| Item | Where it lives |
|---|---|
| Business-document workflows themselves (PO approval matrix *values*) | Configured by the client in the engine built here; defaults seeded per domain volume |
| Report content | Volume 11 |
| Dashboard widget content | Volume 11 (the *designer* is here, Ch 8) |
| Module-specific masters that only one module uses (e.g. inspection plan) | Their own volume — Ch 7 holds only cross-module masters |

---

## Actors for this volume

| Actor | Uses |
|---|---|
| System Administrator | All chapters — the primary user of this volume |
| Company Administrator | Ch 2 (own company), Ch 3, Ch 4, Ch 6, Ch 7 |
| Department Head | Ch 4 (approval matrix for own department), Ch 7 (own masters) |
| Internal Auditor | Ch 5 (read-only) |
| Every user | Ch 1 (login, profile, preferences), Ch 4 (approvals inbox), Ch 6 (notification preferences) |

---

## Permissions catalogue introduced by this volume

| Permission | Description |
|---|---|
| `SYSTEM.USER.VIEW / CREATE / EDIT / DEACTIVATE / RESET_PASSWORD / IMPERSONATE` | User administration |
| `SYSTEM.ROLE.VIEW / CREATE / EDIT / DELETE / ASSIGN` | Role administration |
| `SYSTEM.PERMISSION.VIEW / GRANT` | Permission administration |
| `SYSTEM.COMPANY.VIEW / CREATE / EDIT` | Company master |
| `SYSTEM.BRANCH.* / PLANT.* / WAREHOUSE.*` | Org structure |
| `SYSTEM.FINANCIAL_YEAR.VIEW / CREATE / CLOSE / REOPEN` | FY and period control |
| `SYSTEM.NUMBERING.VIEW / EDIT / OVERRIDE` | Numbering series |
| `SYSTEM.WORKFLOW.VIEW / DESIGN / ACTIVATE` | Workflow builder |
| `SYSTEM.APPROVAL_MATRIX.VIEW / EDIT` | Approval matrix |
| `SYSTEM.DELEGATION.CREATE / CREATE_FOR_OTHERS` | Approval delegation |
| `SYSTEM.AUDIT.VIEW / VIEW_ALL / EXPORT` | Audit log |
| `SYSTEM.NOTIFICATION.VIEW / CONFIGURE / TEMPLATE_EDIT / RESEND` | Notification config |
| `SYSTEM.PARAMETER.VIEW / EDIT` | System parameters |
| `SYSTEM.BACKUP.RUN / RESTORE / DOWNLOAD` | Backup & restore |
| `SYSTEM.LICENSE.VIEW / UPDATE` | Licence |
| `SYSTEM.DASHBOARD.DESIGN` | Dashboard designer |
| `SYSTEM.REPORT.DESIGN` | Report builder |
| `SYSTEM.INTEGRATION.VIEW / CONFIGURE / API_KEY_MANAGE` | Integrations, API keys, webhooks |
| `SYSTEM.JOB.VIEW / RUN / CANCEL` | Background jobs |
| `SYSTEM.CROSS_COMPANY_READ` | Group-level reporting |
| `SYSTEM.UNMASK_PII` | Reveal masked PII (audited) |
| `MASTER.<ENTITY>.VIEW / CREATE / EDIT / DEACTIVATE / IMPORT / EXPORT / APPROVE` | Per master entity (Ch 7) |

---

## Open questions specific to Volume 1

| # | Question | Chapter |
|---|---|---|
| Q1-01 | Is SSO (SAML/OIDC) required at go-live or deferred? | Ch 1 |
| Q1-02 | Confirm legal entity / branch / plant / warehouse counts and GSTIN allocation | Ch 2 |
| Q1-03 | Should approval limits be defined by amount only, or also by item category / cost centre? | Ch 4 |
| Q1-04 | Is WhatsApp Business API already provisioned, and with which BSP? | Ch 6 |
| Q1-05 | Existing master data sources and formats for migration (customer, supplier, item) | Ch 7 |
| Q1-06 | Does the client require a formal licence-enforcement mechanism, or is it an internal deployment? | Ch 8 |

---

**Revision history**

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-07-28 | Engineering | Initial draft |
