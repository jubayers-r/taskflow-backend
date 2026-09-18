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
                          in the service — controllers never compute offsets)
  <domain>.controller.ts  Thin: read req.validated, call service, sendResponse
  <domain>.service.ts     Business rules only; tenancy + ownership; AppError
  <domain>.repository.ts  ALL Prisma access; tenant-scoped finders
  <domain>.serializer.ts  Output shaping (never returns raw rows / secrets)
  <domain>.test.ts        Colocated tests (vitest); multiple suites for one
                          domain live in <domain>/__tests__/
```

Reference implementation: `src/modules/auth/` — a large module that follows
this anatomy end-to-end (routes → schemas → controller → service → repository
→ utils → colocated `__tests__`).

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

- Repositories expose tenant-scoped finders. List queries always filter by
  `agencyId`. Single-resource reads use `findFirst({ where: { id, agencyId } })`
  — **never** `findUnique({ where: { id } })` on a tenant-owned resource, or a
  cross-tenant id would leak data.
- A 404 (not 403) is returned when a resource is not found within the tenant —
  this avoids confirming other tenants' resource ids.
- `req.auth.agencyId` is the only acceptable tenant source. Never trust an
  `agencyId` from the request body; the tenant comes from the token.

## Input / output

- Inputs: Zod in `<domain>.schemas.ts`. Pagination is defined inline in the
  module's query schema (limit clamped to 100; offset math in the service).
- Outputs: `sendResponse.*` helpers with an explicit serializer. Serializers
  are where fields are dropped (passwordHash, lockout counters, internal ids).
  Responses must never echo a raw Prisma row.

## Business rules

- Keep services dependency-injected-testable: they call repository functions,
  never `prisma` directly, so unit tests mock the repository boundary.
- Errors use `AppError` (see `src/lib/response/AppError.ts`). Do not throw raw
  `Error` or status codes inline.
- Audit: meaningful user actions call `recordAudit` with an `AuditAction`
  constant (best-effort, never throws).

## Tests (colocated)

- Unit tests mock the repository boundary (see
  `src/modules/auth/__tests__/` — e.g. `auth.sessions.test.ts`).
- Integration suites: extend `describeIntegration` from
  `src/__tests__/helpers/integration.ts` — they only run when
  `TEST_DATABASE_URL` is set (CI), and skip locally.
- Every new endpoint needs a test that proves: happy path, validation failure,
  tenancy isolation (cross-tenant → 404), and authz (wrong role → 403).

## Definition of done

1. Module matches the anatomy above.
2. All list endpoints paginated + capped; all resource reads tenant-scoped.
3. `describeRoute` per endpoint; `src/__tests__/openapi.test.ts` stays green.
4. Colocated tests cover happy/validation/tenancy/authz paths.
5. `bun run verify` is green (typecheck, lint, format, tests, coverage gate).
