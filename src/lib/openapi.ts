import { env } from '@/config';
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { ZodType } from 'zod';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDoc {
  method: HttpMethod;
  path: string;
  summary: string;
  tags?: string[];
  /** Zod schema describing the JSON request body, if any. */
  body?: ZodType;
  /** Map of HTTP status code to response description. */
  responses?: Record<number, string>;
}

/**
 * Shared OpenAPI registry. Route modules register themselves at import time so
 * the document always mirrors the mounted routes.
 */
export const registry = new OpenAPIRegistry();

/**
 * One-line OpenAPI documentation for a route. Keep it next to the route
 * definition so adding an endpoint stays a single extra call:
 *
 *   describeRoute({ method: 'post', path: '/auth/login', body: AuthSchema.loginSchema,
 *     summary: 'Log in', responses: { 200: 'Tokens issued', 401: 'Invalid credentials' } });
 */
export const describeRoute = ({ method, path, summary, tags, body, responses }: RouteDoc) => {
  registry.registerPath({
    method,
    path,
    summary,
    tags,
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
