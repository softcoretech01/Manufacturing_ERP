# Portal Workflow Infographics

Reference-style **role-based workflow infographic** for each ERP portal — actor columns
across the top, phase rail down the left, numbered icon step-cards, decision diamonds with
YES/NO branches, side outputs, a "why this matters" benefits strip and a flow-summary box.

- **`*.png`** — final high-resolution images (rendered at 2× via headless Chrome).
- **`html/*.html`** — editable source for each infographic (open in any browser). Edit the
  HTML, or edit `scratchpad/gen_infographics.py` and re-render, to change wording/flow.

| # | Portal | Image |
|---|--------|-------|
| 1  | Admin / Core Framework        | [`01-admin.png`](01-admin.png) |
| 2  | CRM & Sales                   | [`02-crm-sales.png`](02-crm-sales.png) |
| 3  | Procurement                   | [`03-procurement.png`](03-procurement.png) |
| 4  | Supplier (External)           | [`04-supplier.png`](04-supplier.png) |
| 5  | Customer (External)           | [`05-customer.png`](05-customer.png) |
| 6  | Inventory & Warehouse         | [`06-inventory.png`](06-inventory.png) |
| 7  | Engineering & Planning        | [`07-engineering.png`](07-engineering.png) |
| 8  | Production / Shop Floor        | [`08-production.png`](08-production.png) |
| 9  | Quality Management            | [`09-quality.png`](09-quality.png) |
| 10 | Maintenance                   | [`10-maintenance.png`](10-maintenance.png) |
| 11 | Packing & Dispatch            | [`11-packing-dispatch.png`](11-packing-dispatch.png) |
| 12 | Finance & Accounting          | [`12-finance.png`](12-finance.png) |
| 13 | HRMS                          | [`13-hrms.png`](13-hrms.png) |
| 14 | Reports & Dashboards (MIS)     | [`14-reports.png`](14-reports.png) |

## Legend

- **Green card** = start · **Dark card** = end · **White numbered card** = process step
  (numbered start→end) · **Amber diamond** = decision (YES continues, red dashed = rework/return)
  · **Dashed card** = side output.
- **Coloured top tabs** = actors / systems (swimlane columns).
- **Left rail** = process phases.

Portal set derived from Volume 0 §4.1 role types and the module list in `CLAUDE.md` §3.1.
