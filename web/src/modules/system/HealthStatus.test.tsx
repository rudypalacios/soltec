import { AuthSession } from '@soltec/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../access/SessionContext';
import { HealthStatus } from './HealthStatus';

function renderWithQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const session = new AuthSession({
    baseUrl: 'http://app.test/api',
    platform: 'web',
    deviceStore: { read: () => null, write: () => undefined },
  });
  render(
    <SessionContext.Provider value={session}>
      <QueryClientProvider client={client}>
        <HealthStatus />
      </QueryClientProvider>
    </SessionContext.Provider>,
  );
}

function mockHealth(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body, { status })),
  );
}

describe('HealthStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tells the user the service is online', async () => {
    mockHealth({ status: 'ok', checks: { database: 'ok' } });
    renderWithQuery();

    expect(await screen.findByText('El servicio está en línea.')).toBeInTheDocument();
  });

  it('warns when the database is down', async () => {
    mockHealth({ status: 'degraded', checks: { database: 'error' } }, 503);
    renderWithQuery();

    expect(await screen.findByText(/la base de datos no/)).toBeInTheDocument();
  });

  it('shows an error when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );
    renderWithQuery();

    expect(await screen.findByText('No se pudo contactar con el servicio.')).toBeInTheDocument();
  });
});
