import { createApiClient } from '@soltec/shared';

/**
 * The API is served from the same origin under /api (see ADR-0004). The URL is made absolute because
 * the Request objects the client builds do not resolve relative URLs outside a real browser page.
 */
export const apiClient = createApiClient({ baseUrl: `${window.location.origin}/api` });
