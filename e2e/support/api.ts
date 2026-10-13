import { ADMIN, MAIL_HTTP_URL, WEB_URL } from './env.ts';

/**
 * Prepares data through the public API, never through the screens: a scenario tests one thing and sets up the rest
 * the fast way. Every record gets a unique name so scenarios can run in parallel on the same database.
 */
export interface CreatedUser {
  id: string;
  name: string;
  email: string;
  password: string;
}

interface Role {
  id: string;
  code: string | null;
  name: string;
  permissions: Record<string, string[]>;
  scopes: Record<string, string>;
}

const PASSWORD = 'E2e-user-password-1';

export const uniqueSuffix = (): string => Math.random().toString(36).slice(2, 10);

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const response = await fetch(`${WEB_URL}/api/v1${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `${rest.method ?? 'GET'} ${path} answered ${response.status}: ${await response.text()}`,
    );
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** An administrator session for preparing data. The token lives in the test process only. */
export class AdminApi {
  private constructor(private readonly token: string) {}

  static async signIn(): Promise<AdminApi> {
    const { access_token } = await call<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN.email,
        password: ADMIN.password,
        device: { platform: 'web', name: 'E2E fixtures' },
      }),
    });
    return new AdminApi(access_token);
  }

  /** The profile with this exact name, as the API holds it. */
  async roleNamed(name: string): Promise<Role> {
    const roles = await call<{ data: Role[] }>(`/roles?q=${encodeURIComponent(name)}`, {
      token: this.token,
    });
    const role = roles.data.find((candidate) => candidate.name === name);
    if (!role) {
      throw new Error(`There is no profile named "${name}".`);
    }
    return role;
  }

  /** An internal profile with the given permissions and data scopes, named uniquely. */
  async createRole(
    prefix: string,
    permissions: Record<string, string[]>,
    scopes: Record<string, string>,
  ): Promise<Role> {
    return call<Role>('/roles', {
      method: 'POST',
      token: this.token,
      body: JSON.stringify({
        name: `${prefix} ${uniqueSuffix()}`,
        user_type: 'internal',
        permissions,
        scopes,
      }),
    });
  }

  /**
   * A user who already accepted the invitation, so it can sign in. Without `roleId` it gets the first custom profile
   * (the `admin`-free default); a scenario that depends on what the user may do passes its own.
   */
  async createActiveUser(prefix = 'e2e', roleId?: string): Promise<CreatedUser> {
    const suffix = uniqueSuffix();
    const email = `${prefix}-${suffix}@example.test`;
    const name = `${prefix} ${suffix}`;
    const roles = await call<{ data: Role[] }>('/roles?per_page=100', { token: this.token });
    const role = roleId
      ? { id: roleId }
      : (roles.data.find((candidate) => candidate.code === null) ?? roles.data[0]);
    if (!role) {
      throw new Error('There is no profile to give to the new user.');
    }
    const user = await call<{ id: string }>('/users', {
      method: 'POST',
      token: this.token,
      body: JSON.stringify({ name, email, role_ids: [role.id] }),
    });
    const invitation = await waitForLink(email);
    await call('/auth/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: invitation, password: PASSWORD }),
    });
    return { id: user.id, name, email, password: PASSWORD };
  }
}

/** The one-time token in the link of the mail sent to `address` (the part after `#token=`). */
async function waitForLink(address: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${MAIL_HTTP_URL}/messages?to=${encodeURIComponent(address)}`);
    const messages = (await response.json()) as { text: string }[];
    const token = messages.at(-1)?.text.match(/#token=([0-9a-f]{64})/)?.[1];
    if (token) {
      return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No mail with a link arrived for ${address}.`);
}
