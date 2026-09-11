#!/usr/bin/env python3
"""Generate the back half of the development handbook: the 18-week schedule
(Gantt), the definition of done, the risk register, and Appendix A.

Appendix A is derived from the repository itself, so it never goes stale:
routes come from frontend/src/App.tsx plus the generic master registry, and
sidebar labels come from frontend/src/config/navigation.ts.

Run from the repository root:

    python3 docs/handbook/generate_schedule_and_appendix.py

It writes docs/handbook/part4.html. Concatenate part1..part4 into
docs/handbook/handbook.html, then render the PDF with headless Chrome:

    chrome --headless --no-pdf-header-footer \\
           --print-to-pdf=docs/SSB_ERP_Development_Handbook.pdf \\
           docs/handbook/handbook.html
"""
import collections, html, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'frontend' / 'src'
OUT = ROOT / 'docs' / 'handbook' / 'part4.html'


def measure_routes():
    """Every distinct route in the product, grouped by portal prefix, with its
    sidebar label where it has one."""
    app = (SRC / 'App.tsx').read_text()
    nav = (SRC / 'config' / 'navigation.ts').read_text()
    registry = (SRC / 'mock' / 'masterRegistry.ts').read_text()

    routes = set(re.findall(r'path="(/[^"]*)"', app))
    routes |= set(re.findall(r"route: '([^']*)'", registry))
    routes.discard('*')

    labels = {to: lab for lab, to in re.findall(r"label: '([^']*)', to: '([^']*)'", nav)}

    grouped = collections.defaultdict(list)
    for route in sorted(routes):
        parts = [p for p in route.split('/') if p]
        grouped[parts[0] if parts else '(root)'].append([route, labels.get(route, '')])
    return dict(grouped)

WEEKS = 18
PHASE = {
    'p0': ('#2a78d6', 'Phase 0 &middot; Ramp-up'),
    'p1': ('#eb6834', 'Phase 1 &middot; Operational spine'),
    'p2': ('#1baf7a', 'Phase 2 &middot; Manufacturing execution'),
    'p3': ('#eda100', 'Phase 3 &middot; Commercial &amp; people'),
    'p4': ('#e87ba4', 'Phase 4/5 &middot; Analytics, hardening, go-live'),
}

# (label, owner, weeks-text, [(start, end, phase), ...])
ROWS = [
    ('Ramp-up &amp; foundation',        'All',    '1&ndash;2',  [(1, 2, 'p0')]),
    ('Administration &amp; Platform',   'Lead',   '1&ndash;12', [(1, 12, 'p1')]),
    ('Master Data completion',          'D2',     '3&ndash;5',  [(3, 5, 'p1')]),
    ('Inventory &amp; Stores',          'D1',     '3&ndash;11', [(3, 11, 'p1')]),
    ('Production Planning',             'D2',     '6&ndash;11', [(6, 11, 'p1')]),
    ('Shop Floor Execution',            'D3+D2',  '6&ndash;14', [(6, 14, 'p2')]),
    ('Plant Maintenance &amp; EAM',     'D1',     '12&ndash;18',[(12, 18, 'p2')]),
    ('Finance &amp; Accounts',          'D4',     '3&ndash;13', [(3, 13, 'p3')]),
    ('HR, Payroll &amp; Workforce',     'D5+D4',  '3&ndash;16', [(3, 16, 'p3')]),
    ('Analytics &amp; Insights',        'D3+D4',  '14&ndash;18',[(14, 18, 'p4')]),
    ('Hardening, 4 complete portals',   'Rotate', '3&ndash;5, 18', [(3, 5, 'p4'), (18, 18, 'p4')]),
    ('Integration, UAT, go-live',       'All',    '15&ndash;18',[(15, 18, 'p4')]),
]

MILESTONES = [
    ('2',  'Team ready',            'All six environments run the stack. Every developer has merged one small screen. CI is green and the review loop works.'),
    ('5',  'Masters closed',        'Master Data is 100% complete. Procurement and Product Engineering are hardened. Notifications and attachments are live for every portal to use.'),
    ('8',  'Stock moves',           'Inventory issue, return and transfer post real ledger rows. Finance chart of accounts and journals post double-entry.'),
    ('11', 'Plan to order',         'Inventory and Production Planning complete. Flow 6.2 demonstrable end to end: forecast to MRP to a released production order.'),
    ('13', 'Platform closed',       'Administration &amp; Platform Services complete. Finance complete except period close. Production entry live on the shop floor.'),
    ('14', 'Factory runs',          'Shop Floor Execution complete. Flow 6.3 demonstrable end to end: released order to finished goods, through quality gates.'),
    ('16', 'People paid',           'HR &amp; Payroll complete, with one full payroll run reproduced and reversed. Analytics well advanced.'),
    ('17', 'Feature complete',      'Plant Maintenance and Analytics complete. All eight flows in section 6 demonstrable.'),
    ('18', 'Go-live',               'UAT signed off. Opening balances and opening stock loaded. Users trained. Cutover.'),
]

RISKS = [
    ('Seven of eleven SRS domain volumes are unwritten',
     'High', 'Certain',
     'Volumes 5 to 11 are "Not started", yet Planning, Shop Floor, Quality, Dispatch, Finance and '
     'HRMS are all being built. <code>CLAUDE.md</code> forbids coding before the volume exists, so '
     'today we are formally out of process on most of the remaining work.',
     'The lead writes a <b>3 to 5 page functional baseline note</b> per remaining portal before its '
     'build starts &mdash; scope, document lifecycle, business rules, worked examples &mdash; rather '
     'than a full 14-chapter volume. Half a day each, nine notes, budgeted inside the lead\'s '
     'weeks 1 to 12. Anything still unresolved goes to <code>open-questions.md</code> as a numbered '
     'assumption.'),
    ('Payroll and GST have no worked examples',
     'High', 'Likely',
     'Statutory calculation guessed wrong is not a bug, it is a legal exposure. Neither the payroll '
     'engine nor the GST and TDS logic has a single worked example in the repository to test against.',
     'Before week 8, get three real payslips and one filed GST return from the client\'s accountant. '
     'Turn them into fixed test cases. D4 and D5 do not write the engine until those cases exist. '
     'Rates and slabs live in master data behind the <code>statutory/</code> adapter.'),
    ('Fresher velocity is the largest unknown',
     'High', 'Likely',
     'Five developers new to a 253-screen codebase. A single misunderstood pattern repeated across '
     'twenty screens costs a fortnight.',
     '16% schedule slack. A weekly Friday demo of working software, not of pull requests. Re-forecast '
     'every Friday against section 13 and move a portal owner before a slip becomes three weeks. '
     'The lead reviews every pull request, and reviews the data model <i>before</i> the migration.'),
    ('Sales &amp; CRM is absent but two portals need it',
     'Medium', 'Certain',
     'Planning normally nets against sales orders; Finance receivables normally starts from a sales '
     'invoice. Neither exists in release 1.',
     'Planning takes demand from the forecast plus manual firm-order entry. Finance raises the sales '
     'invoice from the dispatch shipment. Both are documented as temporary in '
     '<code>open-questions.md</code> and both are replaced in release 2.'),
    ('The mock fixtures are a hint, not a contract',
     'Medium', 'Possible',
     'Eighty screens have mock data shaped for the convenience of the UI. A payload designed to make '
     'a table render is often not a sane API response.',
     'Before designing a model, read the mock <i>and</i> the relevant SRS section, then design the API '
     'from the domain. Where they disagree, the domain wins and the screen changes. Never let a mock '
     'shape a database table.'),
    ('Cross-module coupling creeps in',
     'Medium', 'Likely',
     'The fastest way for a fresher to finish a screen is to import another module\'s SQLAlchemy model '
     'and join across it. That one shortcut dissolves the modular monolith.',
     'import-linter in CI enforces the dependency direction. Read across modules only through the '
     'other module\'s application service; write across modules only through domain events on the '
     'transactional outbox. Agree the event name and payload on day one.'),
    ('Finance has a single owner',
     'Medium', 'Possible',
     'D4 alone holds the double-entry model, the three-way match and the statutory adapter. If D4 '
     'stalls or leaves, 45 person-days of the most correctness-critical work has no second reader.',
     'D4 pairs with the lead for one session a week through weeks 3 to 13. The lead personally '
     'reviews the chart of accounts and the posting rules. D5 shadows the payroll journal voucher '
     'from week 14, which gives a second person context.'),
    ('UAT generates new scope',
     'Medium', 'Certain',
     'Users see working software in week 15 and immediately want changes. Absorbing them silently is '
     'how an 18-week plan becomes 30 weeks.',
     'Every UAT finding is triaged into go-live blocker or release 2. Only a blocker enters the '
     'schedule, and only by displacing something else. The lead owns that call, in writing.'),
]

PORTAL_TITLE = {
    'admin': 'Administration &amp; Platform Services', 'workflow': 'Administration &mdash; Workflow',
    'masters': 'Master Data', 'procurement': 'Procurement', 'inventory': 'Inventory &amp; Stores',
    'engineering': 'Product Engineering', 'planning': 'Production Planning',
    'production': 'Shop Floor Execution', 'quality': 'Quality',
    'maintenance': 'Plant Maintenance &amp; EAM', 'dispatch': 'Packing, Dispatch &amp; Logistics',
    'finance': 'Finance &amp; Accounts', 'hrms': 'HR, Payroll &amp; Workforce',
    'bi': 'Analytics &amp; Insights', 'login': 'Sign-in', 'profile': 'User profile',
}
ORDER = ['admin', 'workflow', 'masters', 'procurement', 'inventory', 'engineering', 'planning',
         'production', 'quality', 'maintenance', 'dispatch', 'finance', 'hrms', 'bi',
         'login', 'profile']
OWNER = {'admin': 'Lead', 'workflow': 'Lead', 'masters': 'D2', 'procurement': 'done',
         'inventory': 'D1', 'engineering': 'done', 'planning': 'D2', 'production': 'D3 + D2',
         'quality': 'done', 'maintenance': 'D1', 'dispatch': 'done', 'finance': 'D4',
         'hrms': 'D5 + D4', 'bi': 'D3 + D4', 'login': 'done', 'profile': 'done'}

out = []
w = out.append

# ─────────────────────────── 13. schedule ───────────────────────────
w('<h2>13. The 18-week schedule</h2>')
w('<p>One row per workstream, one column per week. Bars are coloured by phase; the owner and the '
  'week range are printed on every row, and section 12 carries the same data as a table.</p>')

w('<div class="gantt">')
w('<table>')
w('<thead><tr><th class="lab">Workstream</th><th class="own">Owner</th><th class="own">Weeks</th>')
for i in range(1, WEEKS + 1):
    w(f'<th>{i}</th>')
w('</tr></thead><tbody>')

for label, owner, wktext, segs in ROWS:
    w('<tr>')
    w(f'<td class="lab">{label}</td><td class="own">{owner}</td><td class="own">{wktext}</td>')
    # map week -> segment start
    starts = {s: (e, p) for s, e, p in segs}
    covered = set()
    for s, e, p in segs:
        covered.update(range(s, e + 1))
    week = 1
    while week <= WEEKS:
        if week in starts:
            end, ph = starts[week]
            span = end - week + 1
            colour = PHASE[ph][0]
            w(f'<td class="wk" colspan="{span}">'
              f'<div class="bar" style="background:{colour}"></div></td>')
            week = end + 1
        else:
            q = ' q' if ((week - 1) // 4) % 2 == 1 else ''
            w(f'<td class="wk{q}"></td>')
            week += 1
    w('</tr>')
w('</tbody></table></div>')

w('<div class="legend">')
for k in ['p0', 'p1', 'p2', 'p3', 'p4']:
    c, n = PHASE[k]
    w(f'<span><i style="background:{c}"></i>{n}</span>')
w('</div>')

w('<h3>13.1 Milestones</h3>')
w('<p>Each milestone is a demonstrable state of the product, not a percentage. If it cannot be '
  'clicked through in the browser at the Friday demo, it has not been met.</p>')
w('<table class="tight"><thead><tr><th class="ctr" style="width:14mm">End of week</th>'
  '<th style="width:30mm">Milestone</th><th>Means</th></tr></thead><tbody>')
for wk, name, means in MILESTONES:
    w(f'<tr><td class="ctr"><b>{wk}</b></td><td><b>{name}</b></td><td>{means}</td></tr>')
w('</tbody></table>')

w('<h3>13.2 The weekly rhythm</h3>')
w('<table class="tight"><thead><tr><th style="width:26mm">When</th><th>What</th></tr></thead><tbody>'
  '<tr><td><b>Daily, 15 minutes</b></td><td>Standup. Yesterday, today, blocked on what. A blocker '
  'named at standup is the lead\'s problem that day, not the developer\'s problem all week.</td></tr>'
  '<tr><td><b>Continuously</b></td><td>Pull requests, reviewed by the lead. Nothing merges '
  'unreviewed. One module per branch.</td></tr>'
  '<tr><td><b>Friday, 1 hour</b></td><td>Demo of working software in the browser, each developer in '
  'turn. Then the lead re-forecasts the schedule and says out loud whether week 18 still holds.</td></tr>'
  '<tr><td><b>Fortnightly</b></td><td>Walk one complete flow from section 6 end to end, across '
  'portals, with the owners of every portal it touches in the room.</td></tr>'
  '</tbody></table>')

# ─────────────────────────── 14. definition of done ───────────────────────────
w('<h2>14. Definition of done</h2>')
w('<p>The point of this section is that "the screen looks right" is not done. These lists are '
  'taken from the standing rules in <code>CLAUDE.md</code>, and they are what the lead reviews '
  'against.</p>')

w('<h3>14.1 Every transaction document &mdash; all ten, no exceptions</h3>')
w('<p>A transaction document is anything with a document number and a lifecycle: a purchase order, '
  'a material issue, a production order, an inspection, a work order, a payroll run. If you are '
  'adding one and any of these ten is missing, the work is not done.</p>')
DOD = [
    ('Attachments', 'Through <code>core_attachment</code>, polymorphic on <code>entity_type</code> plus <code>entity_id</code>.'),
    ('Comments thread', 'Through <code>core_comment</code>, same polymorphic key, @mention capable.'),
    ('Approval workflow', 'A <code>core_workflow_instance</code> exists even when the configured workflow is auto-approve.'),
    ('Configurable document number', 'From the numbering engine. Never a raw sequence in module code.'),
    ('Standard lifecycle', 'DRAFT, PENDING_APPROVAL, APPROVED, IN_PROGRESS, COMPLETED, with REJECTED, ON_HOLD, CANCELLED, CLOSED, AMENDED as applicable. Validated by an explicit state machine, never by scattered <code>if</code> checks.'),
    ('Amendment and revision', 'Full version history and a diff view. Never an in-place edit after approval.'),
    ('Cancellation with a reason code', 'Mandatory reason. Never deletion.'),
    ('Print and PDF', 'With a configurable template.'),
    ('Audit log entries', 'On create, update, submit, approve, reject, cancel, amend, delete.'),
    ('Domain events', 'Emitted on every state change, through the transactional outbox.'),
]
w('<table class="tight"><thead><tr><th class="ctr" style="width:10mm">#</th>'
  '<th style="width:44mm">Requirement</th><th>What it means concretely</th></tr></thead><tbody>')
for i, (r, m) in enumerate(DOD, 1):
    w(f'<tr><td class="ctr"><b>{i}</b></td><td><b>{r}</b></td><td>{m}</td></tr>')
w('</tbody></table>')

w('<h3>14.2 Every master</h3>')
w('<p>Configurable without a code change, and carrying: a unique <code>code</code> (optionally '
  'auto-numbered), a <code>name</code>, <code>is_active</code>, effective-dated activation where '
  'relevant, attachments, notes, an audit trail, Excel import, export, and a <b>where-used '
  'dependency check before deactivation</b>. A master is never hard-deleted, and may not be '
  'deactivated while an open transaction references it.</p>')

w('<h3>14.3 Quality gates, enforced in CI</h3>')
GATES = [
    ('Unit tests', 'Every domain rule, calculation and state transition. <code>pytest</code>.'),
    ('Integration tests', 'Every API endpoint, against real MySQL in Docker. Never SQLite.'),
    ('Coverage', '&ge;85% on <code>domain/</code> and <code>application/</code>; &ge;70% overall.'),
    ('Contract tests', 'The OpenAPI schema is generated, committed, and diffed in CI.'),
    ('Migration tests', 'Every Alembic revision runs up <b>and</b> down against a seeded database.'),
    ('Tenancy tests', 'Each module proves that a cross-company read returns nothing.'),
    ('RBAC tests', 'Each endpoint returns 403 without its permission.'),
    ('Front end', 'Vitest and React Testing Library units; Playwright for the critical journeys.'),
    ('Lint and types', '<code>ruff</code> and <code>mypy --strict</code> on the backend; ESLint, Prettier and <code>tsc</code> on the front end.'),
]
w('<table class="tight"><thead><tr><th style="width:34mm">Gate</th><th>Requirement</th></tr></thead><tbody>')
for g, r in GATES:
    w(f'<tr><td><b>{g}</b></td><td>{r}</td></tr>')
w('</tbody></table>')

w('<div class="note stop"><div class="hd">Calculations that may never ship on "looks right"</div>'
  '<p>Financial posting, inventory valuation, BOM explosion, MRP and payroll all require test cases '
  'derived from worked examples. If there is no worked example, there is no test, and if there is no '
  'test the calculation does not ship. This is the single rule most likely to save this project from '
  'an expensive go-live.</p></div>')

# ─────────────────────────── 15. risks ───────────────────────────
w('<h2>15. Risks and open items</h2>')
w('<p>Eight risks, ordered by what they cost us. Each has a named mitigation, and the mitigation is '
  'work that is already inside the plan &mdash; not a hope.</p>')
for i, (title, impact, likely, desc, mit) in enumerate(RISKS, 1):
    cls = 'stop' if impact == 'High' else 'warn'
    w(f'<div class="note {cls}"><div class="hd">R{i}. {title} '
      f'<span class="pill {"shell" if impact=="High" else "part"}" style="margin-left:4px">'
      f'{impact} impact &middot; {likely}</span></div>'
      f'<p>{desc}</p><p><b>Mitigation.</b> {mit}</p></div>')

w('<h3>15.1 What the lead should do in week 1</h3>')
w('<ol class="steps">'
  '<li><b>Fill in the names</b> in the section 10 table and circulate this handbook.</li>'
  '<li><b>Start the nine functional baseline notes</b> (risk R1), in build order: Inventory first, '
  'because D1 starts on it in week 3.</li>'
  '<li><b>Ask the client for the payroll and GST worked examples</b> (risk R2). This has the longest '
  'lead time of anything in the plan, so it goes out in week 1, not week 7.</li>'
  '<li><b>Turn on import-linter in CI</b> (risk R6) before five freshers start writing modules.</li>'
  '<li><b>Record the two Sales &amp; CRM substitutions</b> in <code>open-questions.md</code> '
  '(risk R4) so nobody re-litigates them in week 12.</li>'
  '<li><b>Agree the cross-module event names</b> for GRN posting, production confirmation, FG '
  'receipt, valuation posting and payroll journal voucher. Five names, written down, and Finance, '
  'Inventory, MES and HR can then build in parallel.</li>'
  '</ol>')

# ─────────────────────────── appendix ───────────────────────────
routes = measure_routes()
total = sum(len(v) for v in routes.values())
w('<h2>Appendix A &mdash; Full screen and route reference</h2>')
w(f'<p>All {total} routes in the product, grouped by portal, generated from '
  '<code>frontend/src/App.tsx</code> and the generic master registry. The label column is the '
  'sidebar caption from <code>navigation.ts</code>; a blank label means the screen is reachable by '
  'URL or from another screen rather than from the sidebar. Use this as the checklist when you '
  'estimate or hand over a portal.</p>')

for key in ORDER:
    if key not in routes:
        continue
    rows = routes[key]
    title = PORTAL_TITLE.get(key, key.title())
    own = OWNER.get(key, '')
    tag = ('<span class="pill done">complete</span>' if own == 'done'
           else f'<span class="own-tag">{own}</span>')
    w(f'<h3>{title} &mdash; {len(rows)} screens {tag}</h3>')
    w('<table class="tight"><thead><tr><th style="width:52mm">Route</th><th>Sidebar label</th>'
      '<th style="width:52mm">Route</th><th>Sidebar label</th></tr></thead><tbody>')
    half = (len(rows) + 1) // 2
    left, right = rows[:half], rows[half:]
    for i in range(half):
        r1, l1 = left[i]
        cells = f'<td><code>{html.escape(r1)}</code></td><td>{html.escape(l1) or "&mdash;"}</td>'
        if i < len(right):
            r2, l2 = right[i]
            cells += f'<td><code>{html.escape(r2)}</code></td><td>{html.escape(l2) or "&mdash;"}</td>'
        else:
            cells += '<td></td><td></td>'
        w(f'<tr>{cells}</tr>')
    w('</tbody></table>')

w('<div class="note" style="margin-top:16px"><div class="hd">Keep this handbook current</div>'
  '<p>Sections 3, 12 and 13 go stale the moment a portal lands. Re-measure and re-issue at the end '
  'of every phase &mdash; weeks 2, 11, 14 and 18. The status in section 3 was produced by counting '
  'routes in <code>App.tsx</code> and counting page components that import from <code>@/api</code>, '
  'so it takes minutes to redo, and a handbook nobody trusts is worse than none.</p></div>')

OUT.write_text('\n'.join(out))
print(f'{OUT.relative_to(ROOT)} written — {total} routes across {len(routes)} portal prefixes')
