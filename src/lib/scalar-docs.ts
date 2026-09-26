import { apiReference } from '@scalar/express-api-reference';
import type { Application } from 'express';

// Scalar loads its bundle from a CDN and ships an inline init script, so the
// default helmet CSP (`script-src 'self'`) would blank the page. Relax it for
// this read-only route only, leaving the strict policy everywhere else.
const docsContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: https:",
  "font-src 'self' https: data:",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

/** Mounts the Scalar UI and its docs-only role-aware authentication helpers. */
export const mountScalarDocs = (app: Application): void => {
  app.use('/docs', (_req, res, next) => {
    res.setHeader('Content-Security-Policy', docsContentSecurityPolicy);
    next();
  });

  app.use(
    '/docs',
    apiReference({
      url: '/openapi.json',
      customCss: `
        #taskflow-docs-role-picker {
          position: fixed; right: 20px; bottom: 20px; z-index: 1000;
          display: flex; align-items: center; gap: 8px; padding: 10px 12px;
          border: 1px solid var(--scalar-border-color, #d1d5db); border-radius: 8px;
          background: var(--scalar-background-1, #fff); color: var(--scalar-color-1, #111827);
          box-shadow: 0 8px 20px rgb(0 0 0 / 12%); font: 13px system-ui, sans-serif;
        }
        #taskflow-docs-role-picker select, #taskflow-docs-role-picker button {
          border: 1px solid var(--scalar-border-color, #9ca3af); border-radius: 4px;
          background: transparent; color: inherit; padding: 4px 6px;
        }
        #taskflow-docs-role-picker button { cursor: pointer; }
      `,
      // Runs while Scalar loads the OpenAPI document. It adds a docs-only
      // profile picker and makes the refresh-token cookie available to Scalar.
      customFetch: ((input, init) => {
        const browser = Reflect.get(globalThis, 'window');
        const document = browser.document;
        const localStorage = browser.localStorage;
        const activeRoleKey = 'taskflow.scalar.activeRole';
        const roles = ['OWNER', 'MANAGER', 'MEMBER'];

        if (!document.getElementById('taskflow-docs-role-picker')) {
          const picker = document.createElement('div');
          picker.id = 'taskflow-docs-role-picker';
          picker.innerHTML =
            '<label for="taskflow-docs-role">Test as</label>' +
            '<select id="taskflow-docs-role">' +
            roles.map((role) => `<option value="${role}">${role}</option>`).join('') +
            '</select>' +
            '<button type="button" id="taskflow-docs-clear-token">Clear token</button>';
          document.body.append(picker);

          const select = document.getElementById('taskflow-docs-role')!;
          const activeRole = localStorage.getItem(activeRoleKey);
          select.value = roles.includes(activeRole ?? '') ? activeRole! : 'MEMBER';
          select.addEventListener('change', () =>
            localStorage.setItem(activeRoleKey, select.value),
          );
          document.getElementById('taskflow-docs-clear-token')?.addEventListener('click', () => {
            localStorage.removeItem(`taskflow.scalar.accessToken.${select.value}`);
          });
        }

        return browser.fetch(input, { ...init, credentials: 'include' });
      }) as typeof globalThis.fetch,
      // Equivalent to a Postman pre-request script. Only the token for the
      // selected Prisma UserRole is attached to the outgoing request.
      onBeforeRequest: ({ requestBuilder }) => {
        const browser = Reflect.get(globalThis, 'window');
        const role = browser.localStorage.getItem('taskflow.scalar.activeRole') ?? 'MEMBER';
        const token = browser.localStorage.getItem(`taskflow.scalar.accessToken.${role}`);
        if (token) requestBuilder.headers.set('Authorization', `Bearer ${token}`);
      },
      // Equivalent to a Postman post-response script. Login/refresh responses
      // are stored under the role encoded in the JWT, never merely the selected
      // label, so a token cannot be filed under the wrong test profile.
      onResponseReceived: async ({ response, request }) => {
        if (!response.ok || !/\/api\/v1\/auth\/(login|refresh)$/.test(request.url)) return;

        const body = (await response.clone().json()) as { data?: { accessToken?: unknown } };
        const token = body.data?.accessToken;
        if (typeof token !== 'string') return;

        try {
          const browser = Reflect.get(globalThis, 'window');
          const encodedPayload = token.split('.')[1];
          if (!encodedPayload) return;
          const payload = JSON.parse(
            browser.atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')),
          );
          if (['OWNER', 'MANAGER', 'MEMBER'].includes(payload.role)) {
            browser.localStorage.setItem(`taskflow.scalar.accessToken.${payload.role}`, token);
            browser.localStorage.setItem('taskflow.scalar.activeRole', payload.role);
            const select = browser.document.getElementById('taskflow-docs-role');
            if (select) select.value = payload.role;
          }
        } catch {
          // The server remains the source of truth; ignore malformed client-side JWTs.
        }
      },
    }),
  );
};
