// routeDocs.test.ts
//
// Closes the gap in `openapi.test.ts`, which asserts that a handful of hardcoded
// paths exist but never checks that every other route is documented. A route
// shipped without a `describeRoute()` call used to pass CI silently.
//
// Enumerating mounted routes from `app.router` is not viable: Express 5 layers
// do not expose the mount path of a sub-router. Instead the domain routers are
// walked directly with their known prefixes. They contain only leaf routes, so
// no mount-path recovery is needed. DOMAIN_ROUTERS is the one place that has to
// name each router — add an entry whenever a new domain router is mounted in
// src/routes/index.ts, or its routes escape the audit below.

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { buildOpenApiDocument } from '@/lib/openapi';
import { AuthRoutes } from '@/modules/auth/auth.routes';
import { HealthRoutes } from '@/modules/health/health.routes';
import { UsersRoutes } from '@/modules/users/users.routes';

interface OpenApiDoc {
  paths: Record<string, Record<string, { security?: unknown }>>;
}

interface MountedRoute {
  method: string;
  path: string;
}

const ROUTE_NOT_FOUND = 'Route not found';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Every domain router mounted by the app, with the prefix it is mounted at. */
const DOMAIN_ROUTERS: Array<{ prefix: string; router: { stack?: unknown[] } }> = [
  { prefix: '/api/v1/auth', router: AuthRoutes as never },
  { prefix: '/api/v1/users', router: UsersRoutes as never },
  { prefix: '/health', router: HealthRoutes as never },
];

const joinPath = (prefix: string, sub: string): string => {
  const tail = sub === '/' ? '' : sub;
  return `${prefix}${tail}`.replace(/\/+$/, '') || '/';
};

const collectMountedRoutes = (prefix: string, router: { stack?: unknown[] }): MountedRoute[] => {
  const found: MountedRoute[] = [];

  for (const layer of (router.stack ?? []) as Array<{
    route?: { path?: string; methods?: Record<string, boolean> };
  }>) {
    if (!layer.route) continue;

    const full = joinPath(prefix, layer.route.path ?? '/');
    for (const method of Object.keys(layer.route.methods ?? {})) {
      if (method === '_all') continue;
      found.push({ method, path: full });
    }
  }

  return found;
};

const ALL_MOUNTED_ROUTES: MountedRoute[] = DOMAIN_ROUTERS.flatMap(({ prefix, router }) =>
  collectMountedRoutes(prefix, router),
);

/** Swap `:param` segments for a placeholder so the path can match a route. */
const toRequestPath = (docPath: string): string => docPath.replace(/:[^/]+/g, 'test-param');

/** Mirror of the normalisation `describeRoute` applies, for comparisons. */
const toOpenApiPath = (expressPath: string): string =>
  expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

describe('route documentation', () => {
  let doc: OpenApiDoc;

  beforeAll(async () => {
    // Importing the app registers every documented path at module load time.
    await import('@/app');
    doc = buildOpenApiDocument() as unknown as OpenApiDoc;
  });

  it('generates a non-empty document', () => {
    expect(Object.keys(doc.paths).length).toBeGreaterThan(0);
  });

  it('finds mounted routes to check', () => {
    // If the router walk silently returned nothing, every assertion below would
    // pass vacuously. This pins the fixture.
    expect(ALL_MOUNTED_ROUTES.length).toBeGreaterThan(10);
  });

  it('documents every mounted domain route', () => {
    const undocumented = ALL_MOUNTED_ROUTES.filter(
      ({ method, path }) => !(method in (doc.paths[toOpenApiPath(path)] ?? {})),
    ).map(({ method, path }) => `${method.toUpperCase()} ${path}`);

    expect(
      undocumented,
      `routes missing a describeRoute() call: ${undocumented.join(', ')}`,
    ).toEqual([]);
  });

  it('documents no route that is not mounted', async () => {
    // Both sides are compared in OpenAPI syntax, since that is what the
    // document contains once `describeRoute` has normalised `:id` to `{id}`.
    const mounted = new Set(
      ALL_MOUNTED_ROUTES.map(({ method, path }) => `${method} ${toOpenApiPath(path)}`),
    );
    const documented = Object.entries(doc.paths).flatMap(([docPath, operations]) =>
      HTTP_METHODS.filter((m) => m in operations).map((method) => `${method} ${docPath}`),
    );

    // /api/v1 (the service-metadata root) and the k8s aliases are mounted on the
    // app rather than a domain router, so they are verified by the reachability test.
    const outOfScope = ['/api/v1', '/healthz', '/readyz'];
    const stale = documented.filter(
      (entry) => !mounted.has(entry) && !outOfScope.some((p) => entry.endsWith(` ${p}`)),
    );

    expect(stale, `documented but not mounted: ${stale.join(', ')}`).toEqual([]);
  });

  it('rewrites Express :param segments into OpenAPI {param} templates', () => {
    // The document must stay valid OpenAPI 3 while route authors keep writing
    // `:id` — the same string the router uses.
    expect(Object.keys(doc.paths)).toContain('/api/v1/auth/sessions/{id}');
    expect(Object.keys(doc.paths)).not.toContain('/api/v1/auth/sessions/:id');
  });

  it('every documented route is actually reachable on the app', async () => {
    const missing: string[] = [];

    for (const [docPath, operations] of Object.entries(doc.paths)) {
      for (const method of HTTP_METHODS) {
        if (!(method in operations)) continue;

        const res = await request(app)[method](toRequestPath(docPath));
        const body = res.body as { message?: string } | undefined;

        if (body?.message === ROUTE_NOT_FOUND) {
          missing.push(`${method.toUpperCase()} ${docPath}`);
        }
      }
    }

    expect(missing, `documented but not served: ${missing.join(', ')}`).toEqual([]);
  });

  it('still routes a genuinely absent path to the not-found handler', async () => {
    // Guards the test above: if the 404 contract ever changed, that test would
    // pass vacuously. This proves ROUTE_NOT_FOUND is actually observable.
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect((res.body as { message?: string }).message).toBe(ROUTE_NOT_FOUND);
  });

  it('does not hand-maintain a route map at the versioned root', async () => {
    // The /api/v1 body used to carry a hand-written `endpoints` list — a second
    // source of truth for the route table that silently drifted when a module was
    // added. It now points at the generated contract instead. This test fails if
    // someone reintroduces the list.
    const res = await request(app).get('/api/v1');
    const data = (res.body as { data?: Record<string, unknown> }).data;

    expect(data).toBeDefined();
    expect(data).not.toHaveProperty('endpoints');
    expect(data?.openapi).toBe('/openapi.json');
    expect(data?.docs).toBe('/docs');
  });

  it('marks protected routes with the bearer scheme and public ones without', () => {
    expect(doc.paths['/api/v1/users/me']?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.paths['/api/v1/auth/login']?.post?.security).toBeUndefined();
  });

  it('does not document the operational endpoints it intentionally omits', async () => {
    // /metrics and /openapi.json are served but intentionally absent from the
    // public API document; this records that decision so it stays a choice.
    for (const path of ['/metrics', '/openapi.json', '/healthz', '/readyz']) {
      expect(Object.keys(doc.paths)).not.toContain(path);
    }

    const res = await request(app).get('/healthz');
    expect((res.body as { message?: string }).message).not.toBe(ROUTE_NOT_FOUND);
  });
});
