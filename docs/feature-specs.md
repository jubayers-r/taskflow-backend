# Feature specs: Projects & Tasks

Back-of-the-envelope contracts for the next feature modules. These are
**guidelines, not implementation** — nothing here is built yet. Follow the
canonical anatomy in [module-guide.md](./module-guide.md) when implementing.

Status: deferred by the owner; implement one module at a time, in this order.
Anything not listed here is out of scope for the current milestone.

## Common conventions (all modules)

- Anatomy: `routes.ts` / `schemas.ts` / `controller.ts` / `service.ts` /
  `repository.ts` / `serializer.ts` / colocated `__tests__`.
- Guard order: `authenticate → requireTenant → authorize(roles)? → validateRequest`.
- Tenancy: repositories filter list queries by `agencyId`, and read single
  resources with `findFirst({ where: { id, agencyId } })`. Not-found within the
  tenant → `404` (never `403`, never `findUnique({ id })` alone).
- Serializers: responses are shaped in the serializer; never raw Prisma rows,
  never leaks (passwords, hashes, internal ids).
- Pagination is inline per endpoint in the query schema:
  - `page: z.coerce.number().int().min(1).default(1)`
  - `limit: z.coerce.number().int().min(1).default(20).transform(n => Math.min(n, 100))`
  - Offset math (`(page - 1) * limit`) happens in the **service**, not the
    controller. Cleanup deleted rows is the schema's `WHERE deletedAt = null`
    story, not offset logic.
- Audit: state changes log via `recordAudit` with an `AuditAction` in
  `src/lib/audit.ts` (extend the enum; never inline strings).
- Unit tests mock the **repository** boundary (see
  `src/modules/auth/__tests__/`). Every endpoint needs: happy path, validation
  failure, tenancy isolation (cross-tenant → 404), authz (wrong role → 403).
- `describeRoute` per endpoint so `src/__tests__/openapi.test.ts` stays green.
  Note: `describeRoute` in `src/lib/openapi.ts` currently supports only
  `method/path/tags/body/responses/security` — extend it with `query`/`params`
  in the same commit that first needs them.

## Module: Projects

Resource lives at `projects` in Prisma. Tenant-scoped: `agencyId`, soft
deletable (`deletedAt`), `createdAt`/`updatedAt`. Fields exposed: `id`, `name`,
`description`, `taskCount` (computed), `createdAt`, `updatedAt`.

| Method | Path            | Authz             | Notes                                         |
| ------ | --------------- | ----------------- | --------------------------------------------- |
| POST   | `/projects`     | OWNER, MANAGER    | validate + create; audit `PROJECT_CREATED`    |
| GET    | `/projects`     | any tenant member | paginated list, `deletedAt = null`            |
| GET    | `/projects/:id` | any tenant member | `findFirst({ id, agencyId })` → 404 if absent |
| PATCH  | `/projects/:id` | OWNER, MANAGER    | partial update; audit `PROJECT_UPDATED`       |
| DELETE | `/projects/:id` | OWNER             | soft delete; audit `PROJECT_DELETED`          |

- `POST` body: `name` (1..100), `description` (0..2000, optional).
- `GET /projects` response includes `taskCount` derived with a `_count` or a
  subquery in the repository; serializer strips nothing sensitive here.
- `DELETE` on an unknown/foreign project → `404` (same as reads).

## Module: Tasks (+ subtasks, comments, attachments)

Resource lives at `tasks` in Prisma. Tenant-scoped via `agencyId`, soft
deletable, `createdAt`/`updatedAt`.

Fields: `id`, `projectId`, `title`, `description`, `status`, `priority`,
`assigneeId`, `dueDate`, `parentTaskId` (subtasks), `createdAt`, `updatedAt`.

| Field      | Values                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| `status`   | `TODO → IN_PROGRESS → IN_REVIEW → DONE` (allow reopen `DONE → IN_PROGRESS`) |
| `priority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT`                                           |

| Method | Path                         | Authz                                   | Notes                               |
| ------ | ---------------------------- | --------------------------------------- | ----------------------------------- |
| POST   | `/projects/:projectId/tasks` | OWNER, MANAGER, MEMBER (project member) | validate; audit `TASK_CREATED`      |
| GET    | `/projects/:projectId/tasks` | any tenant member                       | paginated, filterable list          |
| GET    | `/tasks/:id`                 | any tenant member                       | `findFirst({ id, agencyId })` → 404 |
| PATCH  | `/tasks/:id`                 | OWNER, MANAGER, assignee                | status transitions per rules        |
| DELETE | `/tasks/:id`                 | OWNER, MANAGER, (assignee?)             | soft delete; audit `TASK_DELETED`   |

- Subtasks via `parentTaskId`; comments (POST/GET on `/tasks/:id/comments`) and
  attachments are **metadata-only** — an attachment row stores keys +
  `signedUrl`, not base64 blobs. No upload handling until the deferred R2
  milestone.
- Filters on the list endpoint: `status`, `priority`, `assigneeId` (must be a
  member of the same agency), plus pagination + sort by `dueDate`/`createdAt`/
  `priority`.
- Compliance rules enforced in the service:
  - Assignee must belong to the same agency.
  - Status transitions validated (invalid transition → `400` with the allowed
    next states).
  - Cross-tenant access to any `id` → `404`.
  - Non-owner/manager/assignee writes → `403`.
- Serializer exposes `id`, `title`, `description`, `status`, `priority`,
  `assigneeId`, `projectId`, `dueDate`, `parentTaskId`, `createdAt`, `updatedAt`
  — never internal notes/`deletedAt`.

## Prisma / DB considerations (when implementing)

- Add soft-delete columns + the unique constraint handling on top of
  `deletedAt` (Prisma does not filter soft-deletes for you — repositories must
  add `deletedAt: null` to every query).
- Indexes: `tasks(agencyId, deletedAt)`, `tasks(projectId)`,
  `tasks(assigneeId)`, `projects(agencyId, deletedAt)`.
- Audit actions to add in `src/lib/audit.ts`:
  `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_DELETED`, `TASK_CREATED`,
  `TASK_UPDATED`, `TASK_DELETED`.
