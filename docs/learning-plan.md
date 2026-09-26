# Learning plan — how work is sequenced in this repo

This file exists because the plan used to live only in chat, and it drifted.
Two productive debugging turns displaced a whole milestone before anyone noticed.
If the plan is not written down, it is not a plan.

It is deliberately separate from `BACKLOG.md`. That file records _what_ is
deferred and why. This one records _how_ the work gets done and _what order_.

## Method

- **One seam per commit.** A seam is a single file's worth of behaviour —
  schemas, serializer, service, controller, routes, mount, tests, docs. Never a
  mega-commit.
- **Message-tagged commits**, matching the repo's existing tags: `feat`,
  `fix`, `test`, `docs`, `refactor`.
- **`bun run verify` green at every seam.** Not at the end of the milestone.
- **The learner writes the seam; the reviewer reviews it** against the checklist
  below before it is committed. Reviewer and implementer are different roles on
  purpose — the point is to practise the seam, not to receive a finished file.
- **No infrastructure detours between seams.** A bug found mid-milestone gets
  fixed immediately and the milestone resumes; it does not become the work.
- **Nothing hand-maintained that the code can generate.** Route lists, endpoint
  tables, and drift-prone documentation are the recurring source of defects here.

## Review checklist

Every seam is reviewed against these nine before commit. Items 5, 6, and 8 exist
because they actually failed in this repo.

| #   | Check                                                                                  | Origin                       |
| --- | -------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | Tenant-scoped reads use `findFirst({ id, agencyId })`, never bare `findUnique({ id })` | tenancy rule                 |
| 2   | Cross-tenant access returns `404`, never `403`                                         | information leak             |
| 3   | Offset math lives in the service, never the controller                                 | `feature-specs.md`           |
| 4   | Responses go through a serializer; never a raw Prisma row                              | serializer rule              |
| 5   | `describeRoute` uses the identical path string the route declares (`:id`, not `{id}`)  | drift, fixed in `1cefd92`    |
| 6   | A new domain router is added to `DOMAIN_ROUTERS` in `routeDocs.test.ts`                | otherwise silently unaudited |
| 7   | `AuditAction` constants are extended, never inlined as strings                         | `feature-specs.md`           |
| 8   | No hand-written endpoint lists or route tables                                         | removed in `4d24983`         |
| 9   | All four test classes present: happy, validation, tenancy isolation, authz             | per-endpoint DoD             |

## Rules this repo learned the hard way

Each of these is enforced by code or a test, not by good intentions.

- **Tenancy is server-derived.** `agencyId` in a client payload is a tenant
  takeover. It shipped once in `registerSchema`. The schema is `.strict()` so it
  now fails loudly. (`637a26c`)
- **Documented paths are machine-enforced.** `routeDocs.test.ts` fails the build
  on an undocumented or phantom-documented route. (`aeb7e20`)
- **Config is the single authority on which database the process uses.** Do not
  mutate `process.env` to redirect it — `loadEnv({ override: true })` silently
  reverts that. Use `resolveDatabaseUrl`. (`dc29843`)
- **A 404 stays a 404.** Unknown paths point at `/docs` in the body and via a
  `Link` header. They must never redirect there. (`4d24983`)
- **Never log a secret.** Database URLs are redacted through `redactUrl` in
  `src/config/index.ts`.

## Position

**Complete — Users module.** `GET /api/v1/users/me`, tenant-scoped, with
`/auth/me` as a legacy alias. (`637a26c`, `a8fe58b`)

**Current milestone — M1: Projects.** See below.

**Deferred** — `BACKLOG.md` B1 (Agencies, Team & Invitations), B2 (Billing),
B3 (Object uploads), B4 (Multi-agency membership), B5 (Concurrency & integrity).

Note that B5 is where the soft-delete policy decision is parked, and M1 needs
part of that answer now — see Open decisions.

## M1 — Projects

Goal: build the second vertical slice so the module recipe in
`docs/module-guide.md` becomes muscle memory. Spec: `docs/feature-specs.md`
§ Module: Projects. Prisma model already exists in `prisma/schema/`.

Reference implementations: `src/modules/users/` for a small module, and
`src/modules/auth/` for one with a repository, transactions, and colocated
`__tests__/`.

### Prerequisite

`describeRoute` supports only `method/path/tags/body/responses/security`
(`src/lib/openapi.ts`). `GET /projects` needs a documented `query`; every
`/projects/:id` route needs a documented `params`. Per `feature-specs.md`, extend
it in the same commit as the first endpoint that needs it — seam 5.

### Seams

| #   | Seam                     | Exit criterion                                                                 |
| --- | ------------------------ | ------------------------------------------------------------------------------ |
| 1   | `projects.schemas.ts`    | create/update body, list query with coerced + clamped pagination, `:id` params |
| 2   | `projects.serializer.ts` | never returns a raw row; `taskCount` passed through, not computed              |
| 3   | `projects.service.ts`    | `findFirst({ id, agencyId })`; offset math here; `_count` for `taskCount`      |
| 4   | `projects.controller.ts` | reads `req.validated*` only; no business logic                                 |
| 5   | `projects.routes.ts`     | guard order correct; `PROJECT_*` added to `AuditAction`                        |
| 6   | mount + `DOMAIN_ROUTERS` | routes audited by `routeDocs.test.ts`                                          |
| 7   | `__tests__/`             | four test classes × five endpoints                                             |
| 8   | docs                     | README endpoints; `BACKLOG.md`; spec if anything changed                       |

### Endpoints

`POST /projects` (OWNER, MANAGER) · `GET /projects` (any member) ·
`GET /projects/:id` (any member) · `PATCH /projects/:id` (OWNER, MANAGER) ·
`DELETE /projects/:id` (OWNER)

### Done bar

- Cross-tenant access to any project returns `404`.
- `GET /projects` paginates, caps at 100, and excludes soft-deleted rows.
- `taskCount` is correct and comes from the database, not a loop.
- `bun run verify` green.
- Review checklist passes on all nine items.

### Open decisions

- **Soft delete on `Project` is unresolved and blocks seam 1.** The spec assumes
  `deletedAt`; the Prisma model has no such column. See the seam 1 brief.
- **`PROJECT_CREATED` / `PROJECT_UPDATED` / `PROJECT_DELETED` do not exist** in
  `src/lib/audit.ts`. Extend the const object at seam 5.

## Open infrastructure

- **Step 0 — Neon branch (not started, needs a human).** Six integration tests
  have never executed locally. Ideal timing is seam 7, when there are tenancy
  tests worth running against a real database.
- **Coverage gate is too loose.** Branches sit at a 15% threshold against 38%
  actual, so the gate is not currently doing anything. Raise it once M1 produces
  honest numbers rather than guessing at a target.
