import { describe, expect, it } from 'vitest';
import { createApiClient } from './client';

describe('createApiClient', () => {
  it('calls the versioned health endpoint under the base URL and returns typed data', async () => {
    let requestedUrl = '';
    const client = createApiClient({
      baseUrl: 'http://example.test/api',
      fetch: async (request) => {
        requestedUrl = request.url;
        return Response.json({ status: 'ok', checks: { database: 'ok' } });
      },
    });

    const { data, error } = await client.GET('/v1/health');

    expect(requestedUrl).toBe('http://example.test/api/v1/health');
    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    expect(data?.checks.database).toBe('ok');
  });

  it('exposes a degraded status when the API reports the database is down', async () => {
    const client = createApiClient({
      baseUrl: 'http://example.test/api',
      fetch: async () =>
        Response.json({ status: 'degraded', checks: { database: 'error' } }, { status: 503 }),
    });

    const { data, error } = await client.GET('/v1/health');

    expect(data).toBeUndefined();
    expect(error?.status).toBe('degraded');
  });
});
