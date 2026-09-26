# Canonical module guide

Every feature module in this codebase follows one anatomy. If a new module
does not match this shape, it should be refactored or rejected in review. This
is the contract that keeps the codebase legible at the $5–30K build level:
one recipe, repeated, boring.

## Module anatomy

A domain module lives in `src/modules/<domain>/` and owns _everything_ for its
domain — routes, validation, business rules, persistence, presenters, tests.

```
src/modules/<domain>/
  <domain>.routes.ts      Express Router; one describeRoute() per endpoint
  <domain>.schemas.ts     Zod boundary: body / params / query. Pagination,
                          filters, and sorts are defined inline per endpoint
                          (page≥1, limit 1..100, keyset/offset math completed
                          in the service — controllers never compute offsets).
                          Omit this file only when the module accepts no input
                          at all (e.g. users, which only serves GET /me).
  <domain>.controller.ts  Thin: read req.validated, call service, sendResponse
  <domain>.service.ts     Business rules only; tenancy + ownership; AppError.
                          May call prisma directly for plain CRUD
  <domain>.repository.ts  OPTIONAL — transactional / multi-step flows only
  <domain>.serializer.ts  Output shaping (never returns raw rows / secrets)
  <domain>.test.ts        Colocated tests (vitest); multiple suites for one
                          domain live in <domain>/__tests__/
```

Repository policy (hybrid): **plain single-table CRUD skips the repository and
the service calls `prisma` directly.** Add `repository.ts` only when a flow
spans multiple statements that must hold one invariant together — transactions
(session creation, refresh-token rotation, password reset that revokes
sessions), or the same query reused by several services. See
`src/modules/auth/auth.repository.ts` for that case.

Reference implementation: `src/modules/auth/` — a large module that follows
this anatomy end-to-end (routes → schemas → controller → service → repository
→ serializer → utils → colocated `__tests__`).

## Guard order (routes)

All middleware runs left to right. Do not reorder:

```
authenticate → requireTenant? → authorize(roles?)? → validateRequest? → controller
```

- `authenticate` (`@/middlewares/auth.middleware`) — verifies JWT + live session.
- `requireTenant` — every route touching agency-scoped data. Rejects users
  without `agencyId`.
- `authorize(...roles)` — OWNER/MANAGER/MEMBER gates (idempotent after
  `authenticate`).
- `validateRequest` — fills `req.validated`; controllers read `validatedBody`,
  `validatedParams`, `validatedQuery` — never `req.body` directly.
- `describeRoute` must be present per endpoint so OpenAPI/Scalar stays correct.

## Tenancy rules (non-negotiable)

- Tenancy is enforced at the point of every query. Tenant-scoped finders live
  in the repository **when one exists**; otherwise the service applies the
  scope inline. List queries always filter by `agencyId`. Single-resource reads
  use `findFirst({ where: { id, agencyId } })` — **never**
  `findUnique({ where: { id } })` on a tenant-owned resource, or a cross-tenant
  id would leak data. Scope by the agency even when it is `null`:
  `agencyId: auth.agencyId ?? null` keeps the tenancy filter in the query
  instead of dropping it.
- A 404 (not 403) is returned when a resource is not found within the tenant —
  this avoids confirming other tenants' resource ids.
- `req.auth.agencyId` is the only acceptable tenant source. **Never accept an
  `agencyId` from a request body, query, or param** — not even at registration,
  where there is no token yet. An `agencyId` in a client payload is a tenant
  takeover: the attacker joins the target agency and reads its data. This exact
  bug shipped once in `registerSchema`; the schema is `.strict()` so it now
  fails loudly. Assign tenancy server-side and take only a display label (e.g.
  `agencyName`) from the client.

## Input / output

- Inputs: Zod in `<domain>.schemas.ts`. Pagination is defined inline in the
  module's query schema (limit clamped to 100; offset math in the service).
- Outputs: `sendResponse.*` helpers with an explicit serializer. Serializers
  are where fields are dropped (passwordHash, lockout counters, internal ids).
  Responses must never echo a raw Prisma row.

## Business rules

- Keep services dependency-injected-testable. Plain CRUD calls `prisma`
  directly; transactional/multi-step flows go through the repository. Unit
  tests mock exactly one boundary: the repository when it exists, `@/lib/prisma`
  otherwise — never both, never the ORM below it.
- Errors use `AppError` (see `src/lib/response/AppError.ts`). Do not throw raw
  `Error` or status codes inline.
- Audit: meaningful user actions call `recordAudit` with an `AuditAction`
  constant (best-effort, never throws).

## Tests (colocated)

- Unit tests mock one boundary: the repository (when the module has one) or
  `@/lib/prisma` directly (see `src/modules/auth/__tests__/` — e.g.
  `auth.sessions.test.ts`, `auth.login.test.ts`).
- Integration suites: extend `describeIntegration` from
  `src/__tests__/helpers/integration.ts` — they only run when
  `TEST_DATABASE_URL` is set (CI), and skip locally.
- Every new endpoint needs a test that proves: happy path, validation failure,
  tenancy isolation (cross-tenant → 404), and authz (wrong role → 403).

## Definition of done

1. Module matches the anatomy above.
2. All list endpoints paginated + capped; all resource reads tenant-scoped.
3. `describeRoute` per endpoint, using the same path string the route declares
   (`:id`, not `{id}`). This is **machine-enforced**:
   `src/__tests__/routeDocs.test.ts` fails if a mounted domain route is
   undocumented or a documented path is not served. When you add a new domain
   router, add it to `DOMAIN_ROUTERS` in that file so its routes are audited.
4. Colocated tests cover happy/validation/tenancy/authz paths.
5. `bun run verify` is green (typecheck, lint, format, tests, coverage gate).
