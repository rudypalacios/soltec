import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

export interface ApiClientOptions {
  /** Where the API is served, for example "/api" in the browser or a full URL elsewhere. */
  baseUrl: string;
  /** Injected so the same client runs on web and on React Native; defaults to the global fetch. */
  fetch?: (request: Request) => Promise<Response>;
}

/** Typed client generated from contract/openapi.yaml. It knows nothing about the platform. */
export function createApiClient(options: ApiClientOptions) {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    // Looked up on every call, not captured at creation, so a replaced global fetch is honoured.
    fetch: options.fetch ?? ((request) => globalThis.fetch(request)),
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;
