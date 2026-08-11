# Backend structure — where things live

The backend follows the **modular-monolith** layout mandated by `CLAUDE.md` §3.1
and §10: one deployable FastAPI app, internally partitioned into **modules**, and
each module owns its own `domain / application / infrastructure / api` layers.
Dependency direction is enforced: `api → application → domain` and
`infrastructure → domain`; the `domain` layer imports no framework.

If you're looking for the conventional flat "routers / models / schemas /
database" files, here is the exact mapping.

```
backend/
├── .env                     # local config (copied from .env.example)
├── requirements.txt         # runtime deps (mirror of pyproject [project])
├── requirements-dev.txt     # test/lint deps
├── pyproject.toml           # authoritative deps + ruff + mypy + pytest config
├── alembic.ini              # migration config (DB URL injected from settings)
├── migrations/              # Alembic
│   ├── env.py
│   └── versions/0001_initial_organisation.py
├── app/
│   ├── main.py              # ← FastAPI app assembly (create_app, routers, handlers)
│   ├── models.py            # ← the "models folder": imports EVERY ORM model so
│   │                        #    Base.metadata is complete (Alembic + tests use this)
│   ├── seed.py              # reference data (currencies, permissions) + bootstrap
│   ├── core/               # framework layer shared by all modules
│   │   ├── config.py        # settings (env-driven)
│   │   ├── database.py      # ← the "database.py": async engine + session + UoW
│   │   ├── base.py          # SQLAlchemy Base + standard-column mixins (§4.1)
│   │   ├── repository.py    # BaseRepository: tenant scope + soft delete + version
│   │   ├── security.py      # Argon2 password hashing + RS256 JWT
│   │   ├── deps.py          # auth dependency + require(permission) gate
│   │   ├── pagination.py    # offset paging + whitelisted sort/search
│   │   ├── audit.py         # append-only audit log + writer
│   │   ├── outbox.py        # transactional outbox (domain events)
│   │   ├── errors.py        # RFC-9457 problem+json errors + handlers
│   │   ├── enums.py         # shared StrEnums
│   │   ├── ids.py           # ULID uid generation
│   │   ├── time.py          # UTC clock
│   │   ├── schema.py        # base Pydantic in/out models
│   │   └── middleware.py    # X-Correlation-Id
│   └── modules/
│       ├── iam/                     # minimal Identity & Access slice
│       │   ├── infrastructure/models.py   # ← MODELS: user, role, permission, session…
│       │   ├── application/auth_service.py # login / refresh / resolve_context
│       │   ├── permissions.py              # SYSTEM.* permission catalogue
│       │   └── api/
│       │       ├── router.py               # ← ROUTERS: /auth/login,/refresh,/me
│       │       └── schemas.py              # ← SCHEMAS: token, login, me
│       └── organisation/
│           ├── domain/rules.py             # pure business rules (GSTIN/PAN, FY, cycles)
│           ├── application/services.py     # use-case services (one per entity)
│           ├── infrastructure/
│           │   ├── models.py               # ← MODELS: company, branch, plant, warehouse…
│           │   └── repositories.py         # per-entity repositories + guard queries
│           └── api/
│               ├── routers.py              # ← ROUTERS: /companies,/branches,/plants…
│               └── schemas.py              # ← SCHEMAS: *Create / *Update / *Out
└── tests/
    ├── conftest.py                  # test env + path
    ├── unit/                        # DB-free: domain rules + permission-coverage gate
    └── integration/                 # real MySQL: CRUD, tenant isolation, RBAC, migrations
```

## Quick answers

| Conventional name | This project |
|---|---|
| `app/database.py` | `app/core/database.py` |
| `app/routers/` | `app/modules/<module>/api/router(s).py` |
| `app/models/` | `app/modules/<module>/infrastructure/models.py` (all registered in `app/models.py`) |
| `app/schemas/` | `app/modules/<module>/api/schemas.py` |
| `app/services/` | `app/modules/<module>/application/services.py` |
| `main.py` | `app/main.py` |

## Adding a new module (e.g. `procurement`)

```
app/modules/procurement/
  domain/          # entities, value objects, pure rules
  application/     # services (use cases)
  infrastructure/  # models.py, repositories.py
  api/             # routers.py, schemas.py
```
Then register its models in `app/models.py` and include its router in `app/main.py`.
Run `alembic revision --autogenerate -m "procurement"` and review the migration.
