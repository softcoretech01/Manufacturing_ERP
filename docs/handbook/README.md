# Development Handbook — source

Source for [`docs/SSB_ERP_Development_Handbook.pdf`](../SSB_ERP_Development_Handbook.pdf), the
team-facing plan: portal map, page-to-page connections, process flows, dependencies, team
allocation, durations and the 18-week schedule to release 1.

> This is **not** the end-user manual. That is `SSB_ERP_User_Manual.docx` in the repository root,
> and it explains how to *use* the product. This one explains how to *build* it.

## Rebuild

```bash
./docs/handbook/build.sh
```

Needs Python 3 and any Chrome or Chromium. Set `CHROME=/path/to/chrome` if it is not on `PATH`.

## Files

| File | What it is |
|---|---|
| `part1.html` | Cover, contents, sections 1–3 (how to use it, the system, current build status) |
| `part2.html` | Sections 4–7 (portal pages, page connections, process flows, overall workflow) |
| `part3.html` | Sections 8–12 (dependencies, sequence, allocation, responsibilities, durations) |
| `generate_schedule_and_appendix.py` | Generates `part4.html`: section 13 (Gantt), 14 (definition of done), 15 (risks) and Appendix A |
| `build.sh` | Runs the generator, concatenates the parts, renders the PDF |
| `handbook.html` | Assembled document, produced by `build.sh` — do not edit by hand |

`part4.html` is generated, so it is not committed. Everything else is edited directly.

## What is measured, and what is judgement

**Measured from the repository, regenerated on every build.** Appendix A's 253 routes and their
sidebar labels come from `frontend/src/App.tsx`, `frontend/src/mock/masterRegistry.ts` and
`frontend/src/config/navigation.ts`. If you add a screen, it appears in the appendix automatically.

**Hand-maintained, and it goes stale.** Section 3 (build status), section 12 (durations) and
section 13 (schedule). Re-measure and re-issue at the end of every phase — weeks 2, 11, 14 and 18.

The status counts in section 3 are cheap to redo:

```bash
# screens per portal
grep -oE 'path="[^"]*"' frontend/src/App.tsx | sed 's/path="//;s/"//' \
  | awk -F/ '{print $2}' | sort | uniq -c | sort -rn

# pages wired to the real API rather than a mock fixture
grep -rl "from '@/api" frontend/src/pages/<portal>/ | wc -l
```

## Keeping the plan honest

The durations assume the plan estimates **remaining** effort, not effort from zero — see section
1.1 of the PDF. If a portal's status changes, its remaining effort changes with it, so re-issue
rather than letting the team follow a number nobody believes.
