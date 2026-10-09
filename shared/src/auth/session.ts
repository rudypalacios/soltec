import { createApiClient, type ApiClient } from '../api/client';
import { unwrap, unwrapEmpty } from '../api/errors';
import type { components } from '../api/generated/schema';
import type { DeviceIdStore } from '../ports/deviceIdStore';

type Me = components['schemas']['Me'];

export type SessionState =
  | { status: 'restoring' }
  | { status: 'anonymous' }
  | {
      status: 'authenticated';
      /** Null only when the session was restored while the password still has to be changed. */
      user: Me | null;
      /** True while the access token only serves to change the password. */
      passwordChangeRequired: boolean;
    };

export interface AuthSessionOptions {
  /** Where the API is served, for example "https://host/api". */
  baseUrl: string;
  platform: 'web' | 'android' | 'ios';
  /** Text that helps the user recognize this device in a list of sessions. */
  deviceName?: string;
  deviceStore: DeviceIdStore;
  fetch?: (request: Request) => Promise<Response>;
}

const NEVER_AUTHENTICATED = ['/v1/auth/login', '/v1/auth/refresh'];

/**
 * The session of the signed-in person on one device: the access token (kept only in memory), the user and the
 * refresh that keeps them signed in. It knows nothing about the platform: the web keeps the refresh token in a cookie
 * the browser sends by itself, a mobile app would pass it in the body through the same API.
 *
 * `client` is the typed API client that every module uses: it adds the token to each call and, when the API answers
 * 401, refreshes the session once (however many calls failed at the same time) and repeats the call.
 */
export class AuthSession {
  readonly client: ApiClient;

  private readonly baseFetch: (request: Request) => Promise<Response>;
  private state: SessionState = { status: 'restoring' };
  private accessToken: string | null = null;
  private readonly listeners = new Set<() => void>();
  private refreshing: Promise<boolean> | null = null;
  private restoring: Promise<void> | null = null;

  constructor(private readonly options: AuthSessionOptions) {
    this.baseFetch = options.fetch ?? ((request) => globalThis.fetch(request));
    this.client = createApiClient({
      baseUrl: options.baseUrl,
      fetch: (request) => this.authenticatedFetch(request),
    });
  }

  /** For useSyncExternalStore: the same object until something changes. */
  readonly getState = (): SessionState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Recovers the session of a reloaded page from the refresh cookie. Safe to call twice. */
  restore(): Promise<void> {
    this.restoring ??= this.doRestore();
    return this.restoring;
  }

  /** @throws ApiError 401 `invalid_credentials`, 422 or 503 `auth_not_configured` */
  async login(email: string, password: string): Promise<{ passwordChangeRequired: boolean }> {
    const deviceId = this.options.deviceStore.read();
    const data = unwrap(
      await this.client.POST('/v1/auth/login', {
        body: {
          email,
          password,
          device: {
            platform: this.options.platform,
            ...(this.options.deviceName ? { name: this.options.deviceName } : {}),
            ...(deviceId ? { id: deviceId } : {}),
          },
        },
      }),
    );

    this.accessToken = data.access_token;
    this.options.deviceStore.write(data.device_id);
    this.setState({
      status: 'authenticated',
      user: data.user,
      passwordChangeRequired: data.password_change_required,
    });
    return { passwordChangeRequired: data.password_change_required };
  }

  /** Closes the session on the server and here. The local session ends even if the server cannot be reached. */
  async logout(): Promise<void> {
    try {
      await this.client.POST('/v1/auth/logout');
    } catch {
      // Offline: the token will expire by itself and the refresh token is not usable without this device's cookie.
    }
    this.clear();
  }

  /**
   * @throws ApiError 422 with the field `current_password` (`current_password_incorrect`) or `new_password`
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    unwrapEmpty(
      await this.client.POST('/v1/auth/password/change', {
        body: { current_password: currentPassword, new_password: newPassword },
      }),
    );
    // The restriction lives in the token: a refresh issues an unrestricted one now that the password is changed.
    if (!(await this.refreshOnce())) {
      throw new Error('The session could not be renewed after changing the password.');
    }
    await this.loadUser();
  }

  private async doRestore(): Promise<void> {
    let renewed: boolean;
    try {
      renewed = await this.refreshOnce();
    } catch {
      // The server cannot be reached: without a way to know, the person has to sign in again.
      this.clear();
      return;
    }
    if (!renewed) {
      return;
    }
    const state = this.state;
    if (state.status === 'authenticated' && !state.passwordChangeRequired) {
      await this.loadUser();
    }
  }

  private async loadUser(): Promise<void> {
    const user = unwrap(await this.client.GET('/v1/me'));
    this.setState({ status: 'authenticated', user, passwordChangeRequired: false });
  }

  /** One refresh at a time: calls that fail together wait for the same one. */
  private refreshOnce(): Promise<boolean> {
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<boolean> {
    const result = await this.client.POST('/v1/auth/refresh');
    if (!result.response.ok || !result.data) {
      this.clear();
      return false;
    }

    this.accessToken = result.data.access_token;
    const current = this.state;
    this.setState({
      status: 'authenticated',
      user: current.status === 'authenticated' ? current.user : null,
      passwordChangeRequired: result.data.password_change_required,
    });
    return true;
  }

  private async authenticatedFetch(request: Request): Promise<Response> {
    const token = this.accessToken;
    const path = new URL(request.url).pathname;
    if (token === null || NEVER_AUTHENTICATED.some((suffix) => path.endsWith(suffix))) {
      return this.baseFetch(request);
    }

    const replay = request.clone();
    const response = await this.baseFetch(withBearer(request, token));
    if (response.status !== 401) {
      return response;
    }

    // The access token expired or was revoked: renew the session once and repeat the call.
    const renewed = await this.refreshOnce();
    return renewed && this.accessToken !== null
      ? this.baseFetch(withBearer(replay, this.accessToken))
      : response;
  }

  private clear(): void {
    this.accessToken = null;
    this.setState({ status: 'anonymous' });
  }

  private setState(state: SessionState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}

function withBearer(request: Request, token: string): Request {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(request, { headers });
}
