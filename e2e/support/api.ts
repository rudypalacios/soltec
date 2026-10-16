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

  /** A supplier, created through the API; `fields` are the ones of the creation body. */
  async createSupplier(fields: Record<string, unknown>): Promise<{ id: string; name: string }> {
    return call<{ id: string; name: string }>('/suppliers', {
      method: 'POST',
      token: this.token,
      body: JSON.stringify(fields),
    });
  }

  /** A client (a prospect), created through the API; `fields` are the ones of the creation body. */
  async createClient(
    fields: Record<string, unknown>,
  ): Promise<{ id: string; name: string; version: number }> {
    return call<{ id: string; name: string; version: number }>('/clients', {
      method: 'POST',
      token: this.token,
      body: JSON.stringify(fields),
    });
  }

  /** Turns a prospect into a customer with the smallest billing profile there is. */
  async convertClient(id: string, version: number): Promise<{ id: string; version: number }> {
    const regimes = await call<{ data: { id: string }[] }>('/tax-regimes/options', {
      token: this.token,
    });
    const regime = regimes.data[0];
    if (!regime) {
      throw new Error('There is no tax regime.');
    }
    return call<{ id: string; version: number }>(`/clients/${id}/convert`, {
      method: 'POST',
      token: this.token,
      body: JSON.stringify({
        version,
        identification_type: 'none',
        billing_profile: { legal_name: `E2E fiscal ${uniqueSuffix()}`, tax_regime_id: regime.id },
      }),
    });
  }

  /** Shares a customer with one more adviser. */
  async addClientSeller(id: string, userId: string): Promise<void> {
    await call(`/clients/${id}/sellers`, {
      method: 'POST',
      token: this.token,
      body: JSON.stringify({ user_id: userId }),
    });
  }

  /** A product group under the first area, named uniquely; the area name is what the form shows before it. */
  async createProductGroup(
    prefix = 'e2e-grupo',
  ): Promise<{ id: string; name: string; label: string }> {
    const areas = await call<{ data: { id: string; name: string }[] }>('/areas/options', {
      token: this.token,
    });
    const area = areas.data[0];
    if (!area) {
      throw new Error('There is no area to put the group in.');
    }
    const group = await call<{ id: string; name: string }>('/product-groups', {
      method: 'POST',
      token: this.token,
      body: JSON.stringify({ name: `${prefix} ${uniqueSuffix()}`, area_id: area.id }),
    });
    return { ...group, label: `${area.name} · ${group.name}` };
  }

  /** The first unit of measure there is. */
  async firstUnitId(): Promise<string> {
    const units = await call<{ data: { id: string }[] }>('/units-of-measure/options', {
      token: this.token,
    });
    const unit = units.data[0];
    if (!unit) {
      throw new Error('There is no unit of measure.');
    }
    return unit.id;
  }

  /** A product, created through the API; `fields` are the ones of the creation body. */
  async createProduct(fields: Record<string, unknown>): Promise<{ id: string; name: string }> {
    return call<{ id: string; name: string }>('/products', {
      method: 'POST',
      token: this.token,
      body: JSON.stringify(fields),
    });
  }

  /** A bundle, created through the API; `fields` are the ones of the creation body. */
  async createBundle(fields: Record<string, unknown>): Promise<{ id: string; name: string }> {
    return call<{ id: string; name: string }>('/bundles', {
      method: 'POST',
      token: this.token,
      body: JSON.stringify(fields),
    });
  }

  /** Deactivates or reactivates a supplier, which takes its products along (or not). */
  async setSupplierActive(id: string, active: boolean): Promise<void> {
    await call(`/suppliers/${id}/${active ? 'reactivate' : 'deactivate'}`, {
      method: 'POST',
      token: this.token,
    });
  }

  /**
   * A user who already accepted the invitation, so it can sign in. Without `roleId` it gets the first custom profile
   * (the `admin`-free default); a scenario that depends on what the user may do passes its own. `managerId` places
   * the user under someone, which is what builds a team.
   */
  async createActiveUser(
    prefix = 'e2e',
    roleId?: string,
    managerId?: string,
  ): Promise<CreatedUser> {
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
      body: JSON.stringify({
        name,
        email,
        role_ids: [role.id],
        ...(managerId ? { manager_id: managerId } : {}),
      }),
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
