import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequirementsPage } from './RequirementsPage';

const report = {
  status: 'ready_with_warnings',
  summary: { pass: 2, warn: 1, fail: 0 },
  checks: [
    { id: 'php.version', group: 'php', status: 'pass', message: 'PHP 8.3.6', hint: null },
    { id: 'php.ext.gd', group: 'php', status: 'pass', message: 'Extension gd', hint: null },
    {
      id: 'php.upload_max_filesize',
      group: 'php',
      status: 'warn',
      message: 'upload_max_filesize is 2M; at least 16M is recommended.',
      hint: 'Raise it in cPanel > MultiPHP INI Editor.',
    },
    { id: 'db.connection', group: 'database', status: 'pass', message: 'Connected', hint: null },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RequirementsPage />
    </QueryClientProvider>,
  );
}

describe('RequirementsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the verdict and one table per group with Spanish titles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(report)),
    );
    renderPage();

    expect(await screen.findByText('Listo, con avisos')).toBeInTheDocument();
    const php = screen.getByRole('table', { name: 'PHP' });
    expect(within(php).getByText('Versión de PHP')).toBeInTheDocument();
    expect(within(php).getByText('Extensión gd')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Base de datos' })).toBeInTheDocument();
  });

  it('shows the hint only for requirements that are not met', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(report)),
    );
    renderPage();

    expect(await screen.findByText(/MultiPHP INI Editor/)).toBeInTheDocument();
    expect(screen.getAllByTitle('Aviso').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Correcto').length).toBeGreaterThan(0);
  });

  it('shows an error when the answer is not a requirements report', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ hello: 'world' })),
    );
    renderPage();

    expect(
      await screen.findByText(/No se pudo obtener la lista de requisitos/),
    ).toBeInTheDocument();
  });

  it('shows an error when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );
    renderPage();

    expect(
      await screen.findByText(/No se pudo obtener la lista de requisitos/),
    ).toBeInTheDocument();
  });
});
