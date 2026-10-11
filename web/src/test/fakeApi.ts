import { AuthSession, type DeviceIdStore } from '@soltec/shared';

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  authorization: string | null;
  contentType: string | null;
  body: unknown;
}

export type Handler = (call: Call) => Response | Promise<Response>;

export const ME = {
  id: '0192f1c2-7d3a-7a11-8f2e-00000000000a',
  type: 'internal' as const,
  name: 'Ana Pérez',
  email: 'ana@example.com',
  roles: [{ id: '0192f1c2-7d3a-7a11-8f2e-0000000000a1', code: 'admin', name: 'Administrador' }] as {
    id: string;
    code: string | null;
    name: string;
  }[],
  permissions: {
    users: ['view', 'create', 'edit', 'deactivate'],
    roles: ['view', 'create', 'edit', 'deactivate'],
  } as Record<string, string[]>,
  scopes: { users: 'all', roles: 'all' } as Record<string, string>,
};

/** A problem-details answer; `extra` carries the additional members some codes have (`password_min_length`…). */
export function problem(
  status: number,
  code: string,
  errors?: { field: string; code: string }[],
  extra: Record<string, unknown> = {},
) {
  return Response.json(
    { type: 'about:blank', title: code, status, code, ...(errors ? { errors } : {}), ...extra },
    { status },
  );
}

export const page = <T>(data: T[], total = data.length) => ({
  data,
  meta: { page: 1, per_page: 25, total },
});

const memoryDeviceStore: DeviceIdStore = { read: () => null, write: () => undefined };

/**
 * A session wired to a fake API. A handler is keyed by "METHOD /path" (the path without /api). The session starts
 * the way a reloaded page does: with a refresh cookie the fake accepts, which signs `me` in.
 */
export function createTestSession(
  handlers: Record<string, Handler>,
  me: typeof ME | null = ME,
  options: { restricted?: boolean } = {},
) {
  const calls: Call[] = [];
  const all: Record<string, Handler> = {
    'POST /v1/auth/refresh': () =>
      me
        ? Response.json({
            access_token: 'token',
            token_type: 'Bearer',
            expires_in: 900,
            password_change_required: options.restricted === true,
          })
        : problem(401, 'token_invalid'),
    'GET /v1/me': () => Response.json(me),
    'GET /v1/branding': () => Response.json({ trade_name: '', logo_version: null }),
    // The home screen of a profile that shows both widgets, as every profile did before it was configurable.
    'GET /v1/dashboard': () =>
      Response.json({ data: [{ code: 'quick_links' }, { code: 'service_status' }] }),
    'GET /v1/health': () => Response.json({ status: 'ok', checks: { database: 'ok' } }),
    ...handlers,
  };

  const session = new AuthSession({
    baseUrl: 'http://app.test/api',
    platform: 'web',
    deviceStore: memoryDeviceStore,
    fetch: async (request) => {
      const url = new URL(request.url);
      const isJson = (request.headers.get('Content-Type') ?? '').includes('json');
      const text = await request.text();
      const call: Call = {
        method: request.method,
        path: url.pathname.replace(/^\/api/, ''),
        query: url.searchParams,
        authorization: request.headers.get('Authorization'),
        contentType: request.headers.get('Content-Type'),
        // A binary body (an uploaded image) is kept as the text the request carried.
        body: text ? (isJson ? (JSON.parse(text) as unknown) : text) : undefined,
      };
      calls.push(call);
      const handler = all[`${call.method} ${call.path}`];
      if (!handler) {
        throw new Error(`The test did not expect ${call.method} ${call.path}`);
      }
      return handler(call);
    },
  });

  return { session, calls };
}
