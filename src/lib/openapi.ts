import { env } from '@/config';
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { ZodType } from 'zod';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDoc {
  method: HttpMethod;
  /**
   * The path exactly as Express declares it, e.g. `/users/:id`. Express `:param`
   * segments are rewritten to OpenAPI `{param}` templating on the way in, so a
   * route can never be documented under a path it does not serve.
   */
  path: string;
  summary: string;
  tags?: string[];
  /** Zod schema describing the JSON request body, if any. */
  body?: ZodType;
  /** Map of HTTP status code to response description. */
  responses?: Record<number, string>;
  /** Marks the route as requiring a Bearer access token. */
  security?: boolean;
}

/**
 * Rewrites Express `:param` path segments into OpenAPI 3 `{param}` templates.
 *
 * Hand-writing `{id}` next to `router.delete('/sessions/:id')` invites drift —
 * the two spellings look interchangeable but only one of them is the route the
 * server actually serves. Normalising here means the doc and the route are
 * written once, in the same syntax.
 */
const toOpenApiPath = (expressPath: string): string =>
  expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

/**
 * Shared OpenAPI registry. Route modules register themselves at import time so
 * the document always mirrors the mounted routes.
 */
export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

/**
 * One-line OpenAPI documentation for a route. Keep it next to the route
 * definition so adding an endpoint stays a single extra call:
 *
 *   describeRoute({ method: 'post', path: '/auth/login', body: AuthSchema.loginSchema,
 *     summary: 'Log in', responses: { 200: 'Tokens issued', 401: 'Invalid credentials' } });
 *
 * Pass the path exactly as the route declares it — `:id`, not `{id}`.
 */
export const describeRoute = ({
  method,
  path,
  summary,
  tags,
  body,
  responses,
  security,
}: RouteDoc) => {
  registry.registerPath({
    method,
    path: toOpenApiPath(path),
    summary,
    tags,
    security: security ? [{ bearerAuth: [] }] : undefined,
    request: body ? { body: { content: { 'application/json': { schema: body } } } } : undefined,
    responses: Object.fromEntries(
      Object.entries(responses ?? { 200: 'Successful response' }).map(([code, description]) => [
        code,
        { description },
      ]),
    ),
  });
};

export const buildOpenApiDocument = () =>
  new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: `${env.PROJECT_NAME} API`,
      version: '1.0.0',
      description: 'Taskflow backend REST API.',
    },
    servers: [{ url: '/' }],
  });
