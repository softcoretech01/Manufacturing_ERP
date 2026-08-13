# Frontend API layer (Organisation)

Real backend integration for the Organisation module. **Additive** — the mock
screens keep working until each is migrated. This fixes the CLAUDE.md §7
violation ("server state via TanStack Query only; never Zustand") for this scope.

## Files
- `client.ts` — fetch wrapper: base URL from `VITE_API_BASE_URL`, attaches the
  access token, rotates the refresh token on a 401 and retries, parses RFC-9457
  `problem+json` into a typed `ProblemError`.
- `session.ts` — Zustand store for **client** auth state (tokens + active
  `companyUid`). Server data never lives here.
- `organisation.ts` — typed endpoint functions (`login`, `branches`, `companies`, …).
- `../hooks/useOrganisation.ts` — TanStack Query hooks; every key is scoped by
  the active `companyUid`, so switching company refetches automatically (§4.3).

## Setup
Create `web/.env.local`:
```
VITE_API_BASE_URL=http://localhost:8000/api/v1
```
Then sign in once to populate the session:
```ts
import { login } from '@/api/organisation'
await login('admin_a', 'Passw0rd!xyz')   // stores tokens + companyUid
```

## Migrating a list screen (recipe — Branches as example)
Before (mock): `const { rows, create, update, remove } = useCollection('admin:branch', seed)`
After (real API):
```tsx
import { useBranches, useCreateBranch, useUpdateBranch, useDeactivateBranch } from '@/hooks/useOrganisation'

const { data, isLoading, error } = useBranches({ page, page_size: 25, q, sort })
const create = useCreateBranch()
const update = useUpdateBranch()
const deactivate = useDeactivateBranch()

// rows: data?.data ?? []   ·   total: data?.meta.total ?? 0
// create.mutate(body)
// update.mutate({ uid, body: { version, ...changes } })   // optimistic lock
// deactivate.mutate({ uid, body: { version } })
```
Handle `error` as `ProblemError` — `error.problem.errors` gives field-level
messages; `error.kind === 'concurrent-modification'` is a 409 version conflict.
