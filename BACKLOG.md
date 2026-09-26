# Backlog — deferred milestones

Specs for work intentionally deferred from the main build. Each entry includes
scope and a "done" bar so any future opencode session can pick it up cold — or
verify a hand-built implementation meets the $5–30K standard of this repo.

Guidelines when resuming:

- Every milestone must end with green `bun run verify`.
- Follow `docs/module-guide.md` (module anatomy, tenancy rules, guard order,
  colocated tests, DoD).
- Ship atomic, message-tagged commits per concern (no mega-commits).
- Integration tests go behind `describeIntegration` (run only with
  `TEST_DATABASE_URL`, i.e. CI).

---

## B1 — Agencies, Team & Invitations

The tenancy product layer. Registration now provisions an OWNER-managed
single-member agency transactionally — see `registerUserWithAgency` in
`src/modules/auth/auth.repository.ts` — so every new account has an `agencyId`
and `requireTenant` passes for it. **The `src/modules/agencies/` module does not
exist yet:** the agency row is created but nothing reads, lists, or manages it.
This milestone builds the product layer on top of that row.

> Tenancy is server-derived and must stay that way. `agencyId` was previously
> accepted in the register body and written straight to the user row, which let
> anyone register into an existing agency and read that tenant's data. The
> register schema is `.strict()` and now rejects it. Never add a tenant id to a
> client-supplied payload.

**Schema**: `Invitation` is already modelled (`PENDING/ACCEPTED/REJECTED`,
token, expiresAt, role). `User.role` holds OWNER/MANAGER/MEMBER.

**Scope**:

- `src/modules/agencies/` vertical slice per the module guide.
- `GET /agencies/me` — agency + members (paginated), OWNER/MANAGER view allowed.
- `PATCH /agencies/me` (OWNER) — name/description.
- `POST /agencies/invitations` (OWNER/MANAGER) — email, role; creates
  `Invitation` + token + expiry (e.g. 7 days); sends invite email via the email
  queue; enumeration-safe responses; per-recipient rate limit.
- `GET /agencies/invitations` — list own agency's invites (OWNER/MANAGER).
- `DELETE /agencies/invitations/:id` (OWNER) — revoke (set `revokedAt`), best
  effort to also invalidate by token.
- `POST /auth/accept-invite` — authenticated user accepts an invite token →
  sets `user.agencyId` + `role`; marks ACCEPTED; transactional (version check
  on `status`).
- `POST /agencies/leave` — after OWNER handoff; enforce "last owner cannot
  leave" invariant.
- `PUT /agencies/members/:userId/role` (OWNER) — role change; prevent
  demoting/removing the last OWNER.
- `DELETE /agencies/members/:userId` (OWNER) — remove member; enforce last-owner
  invariant; soft-block (refuse) while assigned to tasks or keep-and-reassign;
  state the choice in the PR.

**Done bar**:

- Cross-tenant access → 404 (never 403/200) for agency resources and member
  lookups.
- Invitation accept is race-safe (token single-use, transactional).
- Last-OWNER invariants hold under concurrent requests.
- Colocated tests cover tenancy isolation, RBAC matrix, and invite lifecycle;
  integration tests (under `describeIntegration`) for the transaction paths.
- Audit events: AGENCY_UPDATED, INVITATION_SENT, INVITATION_REVOKED,
  INVITATION_ACCEPTED, MEMBER_ROLE_CHANGED, MEMBER_REMOVED.

---

## B2 — Billing (Stripe)

The `Payment` / `Subscription` / `PaymentHistory` schema already models Stripe
IDs, `rawResponse` audit, and status history.

**Scope**:

- Checkout session creation (`POST /api/v1/billing/checkout`) keyed to a
  `SubscriptionTier`; `stripeCustomerId` created lazily on the agency.
- Customer portal (`POST /api/v1/billing/portal`).
- Webhook endpoint `POST /api/v1/billing/webhooks` with signature verification
  (`STRIPE_WEBHOOK_SECRET` via config); handle
  `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.updated/deleted`.
- Webhook handler: upsert `Payment`, append `PaymentHistory`, update
  `Subscription.status/currentPeriodEnd/cancelAtPeriodEnd`, persist
  `rawResponse`. Idempotent by `stripePaymentIntentId`/`stripeSubscriptionId`.
- Entitlement hook for later milestones (e.g. `requirePlan(PRO|BUSINESS)`).

**Done bar**:

- Signature verification rejects unverified payloads (401, no processing).
- Idempotency: replaying a webhook produces no duplicate payments/history.
- New config keys added to `src/config/index.ts`, `.env.example`,
  `.env.production.example`, README.
- Unit tests for webhook → domain mapping; integration tests (gated) for the
  DB transitions.

---

## B3 — R2/S3 object uploads

Currently `Attachment` rows carry caller-supplied metadata (fileName, url,
type, size). This milestone wires real storage so URLs are not trusted input.

**Scope**:

- Config: `AWS_ENDPOINT`/`AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
  - `S3_BUCKET` (Cloudflare R2-compatible S3 endpoint).
- `src/lib/storage.ts`: presigned PUT for `POST /api/v1/tasks/:taskId/attachments`
  (returns upload URL + final metadata record); presigned GET for download.
- Size/type constraints enforced at generation time; object keys are
  unguessable (`{agencyId}/{taskId}/{uuid}.{ext}`).
- Callback/complete endpoint that marks the attachment uploaded (or rely on
  presigned-only creation like S3 event forwarding — state the choice).
- Tenant isolation via key prefix + ownership checks on task.

**Done bar**:

- Attachments never accept a foreign `fileUrl`; all URLs are storage-derived.
- Key prefix guarantees cross-tenant object access fails at the S3 level
  (bucket policy note) and at the API level (404).
- Upload flow documented in README ops section; secrets tested absent from
  responses/logs.

---

## B4 — Multi-agency membership

Current schema is single-agency-per-user (`User.agencyId`). If the product ever
needs a user in several workspaces, introduce a `Membership` join table
(`userId`, `agencyId`, `role`, `joinedAt`) and migrate reads/tokens to it.
Keep `User.role` as the _global_ role and `Membership.role` per workspace.

**Done bar** (when picked up): access tokens carry active `agencyId` +
workspace role; `GET /auth/me` returns memberships; switching workspace issues
a re-scoped token (`POST /auth/switch-agency`); all existing tenancy rules
re-verified against the join table.

---

## B5 — Concurrency & integrity hardening

- Optimistic locking (`version` integer + `IF_VERSION`-style update) on
  `Task`/`Project` to prevent lost updates on concurrent clients.
- Soft delete policy decision across all owned resources (currently only
  `User.deletedAt` exists); prefer `deleted_at` + filtered unique indexes.

**Done bar**: concurrent PATCH tests prove last-writer-wins is replaced by
conflict → 409 `VERSION_CONFLICT`; delete semantics are uniform and documented.
