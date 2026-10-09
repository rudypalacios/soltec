import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import type { DeviceIdStore } from '../ports/deviceIdStore';
import { AuthSession } from './session';

const ME = {
  id: '0192f1c2-7d3a-7a11-8f2e-0123456789ab',
  type: 'internal',
  name: 'Ana',
  email: 'ana@example.com',
  roles: [],
  permissions: { users: ['view'] },
  scopes: {},
};

class MemoryDeviceStore implements DeviceIdStore {
  constructor(public id: string | null = null) {}
  read() {
    return this.id;
  }
  write(id: string) {
    this.id = id;
  }
}

interface Call {
  method: string;
  path: string;
  authorization: string | null;
  body: unknown;
}

/** A fake API: a handler per "METHOD /path" and a log of every call it received. */
function fakeApi(handlers: Record<string, (call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetch = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname.replace(/^\/api/, '');
    const text = await request.text();
    const call: Call = {
      method: request.method,
      path,
      authorization: request.headers.get('Authorization'),
      body: text ? JSON.parse(text) : undefined,
    };
    calls.push(call);
    const handler = handlers[`${call.method} ${call.path}`];
    if (!handler) {
      throw new Error(`Unexpected call ${call.method} ${call.path}`);
    }
    return handler(call);
  };
  return { fetch, calls };
}

const problem = (status: number, code: string) =>
  Response.json({ type: 'about:blank', title: code, status, code }, { status });

const tokens = (access: string, restricted = false) => ({
  access_token: access,
  token_type: 'Bearer',
  expires_in: 900,
  password_change_required: restricted,
});

function newSession(
  api: ReturnType<typeof fakeApi>,
  store: DeviceIdStore = new MemoryDeviceStore(),
) {
  return new AuthSession({
    baseUrl: 'http://host.test/api',
    platform: 'web',
    deviceName: 'Test browser',
    deviceStore: store,
    fetch: api.fetch,
  });
}

describe('AuthSession', () => {
  let store: MemoryDeviceStore;

  beforeEach(() => {
    store = new MemoryDeviceStore();
  });

  describe('login', () => {
    it('keeps the user, remembers the device and sends it the next time', async () => {
      const api = fakeApi({
        'POST /v1/auth/login': () =>
          Response.json({ ...tokens('token-1'), device_id: 'device-1', user: ME }),
      });
      const session = newSession(api, store);

      const result = await session.login('ana@example.com', 'a long enough password');

      expect(result.passwordChangeRequired).toBe(false);
      expect(session.getState()).toEqual({
        status: 'authenticated',
        user: ME,
        passwordChangeRequired: false,
      });
      expect(store.id).toBe('device-1');
      expect(api.calls[0]?.body).toEqual({
        email: 'ana@example.com',
        password: 'a long enough password',
        device: { platform: 'web', name: 'Test browser' },
      });

      await session.login('ana@example.com', 'a long enough password');
      expect(api.calls[1]?.body).toMatchObject({ device: { id: 'device-1' } });
    });

    it('does not send the token with the login itself', async () => {
      const api = fakeApi({
        'POST /v1/auth/login': () =>
          Response.json({ ...tokens('token-1'), device_id: 'device-1', user: ME }),
      });
      const session = newSession(api);
      await session.login('a@example.com', 'x'.repeat(12));
      await session.login('a@example.com', 'x'.repeat(12));

      expect(api.calls.map((call) => call.authorization)).toEqual([null, null]);
    });

    it('reports a restricted session when the password has to be changed', async () => {
      const api = fakeApi({
        'POST /v1/auth/login': () =>
          Response.json({ ...tokens('token-1', true), device_id: 'device-1', user: ME }),
      });
      const session = newSession(api);

      const result = await session.login('ana@example.com', 'temporary password');

      expect(result.passwordChangeRequired).toBe(true);
      expect(session.getState()).toMatchObject({ passwordChangeRequired: true });
    });

    it('throws the ApiError of wrong credentials and stays anonymous-or-restoring', async () => {
      const api = fakeApi({ 'POST /v1/auth/login': () => problem(401, 'invalid_credentials') });
      const session = newSession(api);

      await expect(session.login('ana@example.com', 'nope')).rejects.toMatchObject({
        status: 401,
        code: 'invalid_credentials',
      });
      expect(session.getState().status).not.toBe('authenticated');
    });
  });

  describe('restore', () => {
    it('signs a reloaded page back in from the refresh cookie and loads the user', async () => {
      const api = fakeApi({
        'POST /v1/auth/refresh': () => Response.json(tokens('token-2')),
        'GET /v1/me': () => Response.json(ME),
      });
      const session = newSession(api);

      await session.restore();

      expect(session.getState()).toEqual({
        status: 'authenticated',
        user: ME,
        passwordChangeRequired: false,
      });
      expect(api.calls.find((call) => call.path === '/v1/me')?.authorization).toBe(
        'Bearer token-2',
      );
    });

    it('becomes anonymous when there is no valid refresh token', async () => {
      const api = fakeApi({ 'POST /v1/auth/refresh': () => problem(401, 'token_invalid') });
      const session = newSession(api);

      await session.restore();

      expect(session.getState()).toEqual({ status: 'anonymous' });
    });

    it('becomes anonymous when the server cannot be reached', async () => {
      const session = new AuthSession({
        baseUrl: 'http://host.test/api',
        platform: 'web',
        deviceStore: store,
        fetch: async () => {
          throw new TypeError('network down');
        },
      });

      await session.restore();

      expect(session.getState()).toEqual({ status: 'anonymous' });
    });

    it('does not load the user while the password has to be changed', async () => {
      const api = fakeApi({ 'POST /v1/auth/refresh': () => Response.json(tokens('t', true)) });
      const session = newSession(api);

      await session.restore();

      expect(session.getState()).toEqual({
        status: 'authenticated',
        user: null,
        passwordChangeRequired: true,
      });
      expect(api.calls).toHaveLength(1);
    });

    it('refreshes only once when called twice', async () => {
      const api = fakeApi({
        'POST /v1/auth/refresh': () => Response.json(tokens('token-2')),
        'GET /v1/me': () => Response.json(ME),
      });
      const session = newSession(api);

      await Promise.all([session.restore(), session.restore()]);

      expect(api.calls.filter((call) => call.path === '/v1/auth/refresh')).toHaveLength(1);
    });
  });

  describe('expired access tokens', () => {
    async function signedIn(extra: Parameters<typeof fakeApi>[0]) {
      const api = fakeApi({
        'POST /v1/auth/login': () =>
          Response.json({ ...tokens('old-token'), device_id: 'device-1', user: ME }),
        ...extra,
      });
      const session = newSession(api);
      await session.login('ana@example.com', 'a long enough password');
      return { api, session };
    }

    it('refreshes once and repeats the call that failed, with its body intact', async () => {
      const { api, session } = await signedIn({
        'POST /v1/auth/refresh': () => Response.json(tokens('new-token')),
        'POST /v1/users': (call) =>
          call.authorization === 'Bearer old-token'
            ? problem(401, 'token_expired')
            : Response.json({ ok: true }, { status: 201 }),
      });

      const { response } = await session.client.POST('/v1/users', {
        body: { name: 'N', email: 'n@example.com', role_ids: [], initial_password: 'p'.repeat(12) },
      });

      expect(response.status).toBe(201);
      const attempts = api.calls.filter((call) => call.path === '/v1/users');
      expect(attempts.map((call) => call.authorization)).toEqual([
        'Bearer old-token',
        'Bearer new-token',
      ]);
      expect(attempts[1]?.body).toEqual(attempts[0]?.body);
    });

    it('shares one refresh between calls that fail together', async () => {
      const { api, session } = await signedIn({
        'POST /v1/auth/refresh': () => Response.json(tokens('new-token')),
        'GET /v1/roles': (call) =>
          call.authorization === 'Bearer old-token'
            ? problem(401, 'token_expired')
            : Response.json({ data: [], meta: { page: 1, per_page: 25, total: 0 } }),
        'GET /v1/users': (call) =>
          call.authorization === 'Bearer old-token'
            ? problem(401, 'token_expired')
            : Response.json({ data: [], meta: { page: 1, per_page: 25, total: 0 } }),
      });

      const [roles, users] = await Promise.all([
        session.client.GET('/v1/roles'),
        session.client.GET('/v1/users'),
      ]);

      expect(roles.response.status).toBe(200);
      expect(users.response.status).toBe(200);
      expect(api.calls.filter((call) => call.path === '/v1/auth/refresh')).toHaveLength(1);
    });

    it('signs out when the refresh fails and gives the caller the original 401', async () => {
      const { session } = await signedIn({
        'POST /v1/auth/refresh': () => problem(401, 'token_invalid'),
        'GET /v1/users': () => problem(401, 'token_expired'),
      });

      const { response } = await session.client.GET('/v1/users');

      expect(response.status).toBe(401);
      expect(session.getState()).toEqual({ status: 'anonymous' });
    });

    it('does not loop when the repeated call fails again', async () => {
      const { api, session } = await signedIn({
        'POST /v1/auth/refresh': () => Response.json(tokens('new-token')),
        'GET /v1/users': () => problem(401, 'token_invalid'),
      });

      const { response } = await session.client.GET('/v1/users');

      expect(response.status).toBe(401);
      expect(api.calls.filter((call) => call.path === '/v1/users')).toHaveLength(2);
      expect(api.calls.filter((call) => call.path === '/v1/auth/refresh')).toHaveLength(1);
    });

    it('does not refresh after other errors', async () => {
      const { api, session } = await signedIn({
        'GET /v1/users': () => problem(403, 'forbidden'),
      });

      await session.client.GET('/v1/users');

      expect(api.calls.some((call) => call.path === '/v1/auth/refresh')).toBe(false);
    });
  });

  describe('logout', () => {
    it('closes the session on the server and here', async () => {
      const { api, session } = await (async () => {
        const api = fakeApi({
          'POST /v1/auth/login': () =>
            Response.json({ ...tokens('token-1'), device_id: 'device-1', user: ME }),
          'POST /v1/auth/logout': () => new Response(null, { status: 204 }),
        });
        const session = newSession(api);
        await session.login('ana@example.com', 'a long enough password');
        return { api, session };
      })();

      await session.logout();

      expect(session.getState()).toEqual({ status: 'anonymous' });
      expect(api.calls.at(-1)).toMatchObject({
        path: '/v1/auth/logout',
        authorization: 'Bearer token-1',
      });
    });

    it('ends the local session even when the server cannot be reached', async () => {
      let online = true;
      const session = new AuthSession({
        baseUrl: 'http://host.test/api',
        platform: 'web',
        deviceStore: store,
        fetch: async (request) => {
          if (!online) {
            throw new TypeError('network down');
          }
          return new URL(request.url).pathname.endsWith('/login')
            ? Response.json({ ...tokens('token-1'), device_id: 'device-1', user: ME })
            : new Response(null, { status: 204 });
        },
      });
      await session.login('ana@example.com', 'a long enough password');

      online = false;
      await session.logout();

      expect(session.getState()).toEqual({ status: 'anonymous' });
    });

    it('stops sending the token afterwards', async () => {
      const api = fakeApi({
        'POST /v1/auth/login': () =>
          Response.json({ ...tokens('token-1'), device_id: 'device-1', user: ME }),
        'POST /v1/auth/logout': () => new Response(null, { status: 204 }),
        'GET /v1/health': () => Response.json({ status: 'ok', checks: { database: 'ok' } }),
      });
      const session = newSession(api);
      await session.login('ana@example.com', 'a long enough password');
      await session.logout();

      await session.client.GET('/v1/health');

      expect(api.calls.at(-1)?.authorization).toBeNull();
    });
  });

  describe('changePassword', () => {
    it('renews the session so the restriction is lifted, then loads the user', async () => {
      const api = fakeApi({
        'POST /v1/auth/login': () =>
          Response.json({ ...tokens('restricted', true), device_id: 'device-1', user: ME }),
        'POST /v1/auth/password/change': () => new Response(null, { status: 204 }),
        'POST /v1/auth/refresh': () => Response.json(tokens('full')),
        'GET /v1/me': () => Response.json(ME),
      });
      const session = newSession(api);
      await session.login('ana@example.com', 'temporary password');

      await session.changePassword('temporary password', 'a brand new password');

      expect(api.calls.find((call) => call.path === '/v1/auth/password/change')?.body).toEqual({
        current_password: 'temporary password',
        new_password: 'a brand new password',
      });
      expect(session.getState()).toEqual({
        status: 'authenticated',
        user: ME,
        passwordChangeRequired: false,
      });
      expect(api.calls.find((call) => call.path === '/v1/me')?.authorization).toBe('Bearer full');
    });

    it('throws the field errors of a rejected password and keeps the session', async () => {
      const api = fakeApi({
        'POST /v1/auth/login': () =>
          Response.json({ ...tokens('restricted', true), device_id: 'device-1', user: ME }),
        'POST /v1/auth/password/change': () =>
          Response.json(
            {
              type: 'about:blank',
              title: 'Validation failed',
              status: 422,
              code: 'validation_failed',
              errors: [{ field: 'current_password', code: 'current_password_incorrect' }],
            },
            { status: 422 },
          ),
      });
      const session = newSession(api);
      await session.login('ana@example.com', 'temporary password');

      const failure = await session.changePassword('wrong', 'a brand new password').catch((e) => e);

      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).fieldErrors).toEqual({
        current_password: 'current_password_incorrect',
      });
      expect(session.getState()).toMatchObject({ status: 'authenticated' });
    });
  });

  it('tells subscribers about every change and stops after unsubscribing', async () => {
    const api = fakeApi({
      'POST /v1/auth/login': () =>
        Response.json({ ...tokens('token-1'), device_id: 'device-1', user: ME }),
      'POST /v1/auth/logout': () => new Response(null, { status: 204 }),
    });
    const session = newSession(api);
    let notifications = 0;
    const unsubscribe = session.subscribe(() => {
      notifications += 1;
    });

    await session.login('ana@example.com', 'a long enough password');
    expect(notifications).toBe(1);

    unsubscribe();
    await session.logout();
    expect(notifications).toBe(1);
  });
});
