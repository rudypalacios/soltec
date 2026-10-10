import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const FULL = ['view', 'edit'];
const SETTINGS_ME = {
  ...ME,
  permissions: { ...ME.permissions, company: FULL, financial_settings: FULL, sequences: FULL },
  scopes: { ...ME.scopes, company: 'all', financial_settings: 'all', sequences: 'all' },
};
const READER_ME = {
  ...ME,
  permissions: { company: ['view'], financial_settings: ['view'], sequences: ['view'] },
  scopes: { company: 'all', financial_settings: 'all', sequences: 'all' },
};

const STAMPS = { created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
const COMPANY = {
  legal_name: 'Sistemas Acme, S.A.',
  trade_name: 'Acme',
  tax_id: '1234567-8',
  address: null,
  phone: null,
  email: null,
  timezone: 'America/Guatemala',
  logo_version: null,
  version: 1,
  ...STAMPS,
};
const FINANCIAL = {
  currency_code: 'GTQ',
  vat_rate: '0.12000',
  income_tax_rate: '0.03000',
  stale_cost_days: 90,
  quote_validity_days: 15,
  version: 1,
  ...STAMPS,
};
const QUOTE = {
  code: 'quote',
  name: 'Cotizaciones',
  prefix: 'COT',
  padding: 4,
  period: 'month',
  next_value: 1,
  period_locked: false,
  example: 'COT-2610-0001',
  version: 1,
  updated_at: STAMPS.updated_at,
};
const CLIENT = {
  ...QUOTE,
  code: 'client',
  name: 'Clientes',
  prefix: 'CLI',
  period: 'none',
  next_value: 58,
  example: 'CLI-0058',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('brand', () => {
  it('shows the company logo with its name on the sign-in screen', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/branding': () => Response.json({ trade_name: 'Acme', logo_version: 'logo-1a2b' }),
      },
      null,
    );
    renderApp(session, '/ingresar');

    const logo = await screen.findByRole('img', { name: 'Acme' });
    expect(logo).toHaveAttribute('src', '/api/v1/branding/logo?v=logo-1a2b');
  });

  it('shows the name when there is no logo, and the name again if the logo does not load', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/branding': () => Response.json({ trade_name: 'Acme', logo_version: 'logo-1a2b' }),
      },
      null,
    );
    renderApp(session, '/ingresar');

    fireEvent.error(await screen.findByRole('img', { name: 'Acme' }));

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Acme' })).not.toBeInTheDocument();
  });

  it('says «Dashboard» when the company has no name yet', async () => {
    const { session } = createTestSession({}, null);
    renderApp(session, '/ingresar');

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('shows no brand at all, and never a default one, while it is not known yet', async () => {
    const { session } = createTestSession(
      { 'GET /v1/branding': () => new Promise<Response>(() => undefined) },
      null,
    );
    renderApp(session, '/ingresar');

    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('soltec')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('paints the brand this browser remembers before the API answers, and remembers the new one', async () => {
    window.localStorage.setItem(
      'soltec.branding',
      JSON.stringify({ trade_name: 'Acme', logo_version: 'logo-1a2b' }),
    );
    const { session } = createTestSession(
      {
        'GET /v1/branding': () => Response.json({ trade_name: 'Acme', logo_version: 'logo-9z9z' }),
      },
      null,
    );
    renderApp(session, '/ingresar');

    // At once, from memory: the old logo.
    expect(screen.getByRole('img', { name: 'Acme' })).toHaveAttribute(
      'src',
      '/api/v1/branding/logo?v=logo-1a2b',
    );
    // Then what the API says.
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Acme' })).toHaveAttribute(
        'src',
        '/api/v1/branding/logo?v=logo-9z9z',
      ),
    );
    expect(JSON.parse(window.localStorage.getItem('soltec.branding') ?? 'null')).toEqual({
      trade_name: 'Acme',
      logo_version: 'logo-9z9z',
    });
  });

  it('works when the browser refuses to remember anything', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { session } = createTestSession(
      { 'GET /v1/branding': () => Response.json({ trade_name: 'Acme', logo_version: null }) },
      null,
    );
    renderApp(session, '/ingresar');

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('navigation', () => {
  it('offers «Configuración» to whoever may view any section and opens the first one', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/sequences': () => Response.json({ data: [QUOTE] }),
      },
      { ...ME, permissions: { sequences: ['view'] }, scopes: { sequences: 'all' } },
    );
    renderApp(session, '/');

    await userEvent.setup().click(await screen.findByRole('link', { name: 'Configuración' }));

    expect(await screen.findByRole('heading', { name: 'Numeración' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/configuracion/numeracion');
    expect(screen.queryByRole('tab', { name: 'Empresa' })).not.toBeInTheDocument();
  });

  it('hides «Configuración» from who may view none of it', async () => {
    const { session } = createTestSession({});
    renderApp(session, '/');

    await screen.findByRole('link', { name: 'Usuarios' });
    expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
  });

  it('tells an administrator the company data is missing, and where to complete it', async () => {
    const { session } = createTestSession({}, SETTINGS_ME);
    renderApp(session, '/');

    const link = await screen.findByRole('link', { name: 'Completarlos' });
    expect(link).toHaveAttribute('href', '/configuracion/empresa');
  });
});

describe('company', () => {
  it('saves the data with the version that was read, and keeps what the server answers', async () => {
    const saved: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/settings/company': () => Response.json(COMPANY),
        'PATCH /v1/settings/company': (call) => {
          saved.push(call);
          return Response.json({
            ...COMPANY,
            trade_name: 'Acme Guatemala',
            email: 'info@acme.test',
            version: 2,
          });
        },
      },
      SETTINGS_ME,
    );
    renderApp(session, '/configuracion/empresa');
    const user = userEvent.setup();

    const name = await screen.findByLabelText(/Nombre comercial/);
    expect(name).toHaveValue('Acme');
    await user.clear(name);
    await user.type(name, '  Acme Guatemala ');
    await user.type(screen.getByLabelText('Correo de contacto'), 'Info@Acme.test');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Se guardaron los datos de la empresa.')).toBeInTheDocument();
    expect(saved[0]?.body).toEqual({
      version: 1,
      legal_name: 'Sistemas Acme, S.A.',
      trade_name: 'Acme Guatemala',
      tax_id: '1234567-8',
      address: null,
      phone: null,
      email: 'Info@Acme.test',
      timezone: 'America/Guatemala',
    });
    expect(screen.getByLabelText('Correo de contacto')).toHaveValue('info@acme.test');
  });

  it('shows the field the server rejected and the stale-version conflict', async () => {
    let attempt = 0;
    const { session } = createTestSession(
      {
        'GET /v1/settings/company': () => Response.json(COMPANY),
        'PATCH /v1/settings/company': () => {
          attempt += 1;
          return attempt === 1
            ? problem(422, 'validation_failed', [{ field: 'email', code: 'invalid' }])
            : problem(409, 'conflict');
        },
      },
      SETTINGS_ME,
    );
    renderApp(session, '/configuracion/empresa');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribe un correo válido.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/Otra persona cambió estos datos/)).toBeInTheDocument();
  });

  it('is read-only without the edit permission', async () => {
    const { session } = createTestSession(
      { 'GET /v1/settings/company': () => Response.json(COMPANY) },
      READER_ME,
    );
    renderApp(session, '/configuracion/empresa');

    expect(await screen.findByLabelText(/Nombre comercial/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Subir logo')).not.toBeInTheDocument();
  });

  it('uploads a logo and removes it after confirming', async () => {
    const calls: Call[] = [];
    let logo: string | null = null;
    const { session } = createTestSession(
      {
        'GET /v1/settings/company': () => Response.json({ ...COMPANY, logo_version: logo }),
        'PUT /v1/settings/company/logo': (call) => {
          calls.push(call);
          logo = 'logo-9f9f';
          return Response.json({ ...COMPANY, logo_version: logo, version: 2 });
        },
        'DELETE /v1/settings/company/logo': (call) => {
          calls.push(call);
          logo = null;
          return Response.json({ ...COMPANY, version: 3 });
        },
      },
      SETTINGS_ME,
    );
    renderApp(session, '/configuracion/empresa');
    const user = userEvent.setup();

    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    await user.upload(await screen.findByLabelText('Subir logo'), file);

    const preview = await screen.findByRole('img', { name: 'Logo actual' });
    expect(preview).toHaveAttribute('src', '/api/v1/branding/logo?v=logo-9f9f');
    expect(calls[0]).toMatchObject({ method: 'PUT', contentType: 'image/png' });

    await user.click(screen.getByRole('button', { name: 'Quitar logo' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Quitar' }));

    await waitFor(() =>
      expect(screen.queryByRole('img', { name: 'Logo actual' })).not.toBeInTheDocument(),
    );
    expect(calls[1]?.method).toBe('DELETE');
  });

  it('refuses an image of the wrong type or size without calling the server', async () => {
    const { session, calls } = createTestSession(
      { 'GET /v1/settings/company': () => Response.json(COMPANY) },
      SETTINGS_ME,
    );
    renderApp(session, '/configuracion/empresa');
    const user = userEvent.setup({ applyAccept: false });
    const input = await screen.findByLabelText('Subir logo');

    await user.upload(input, new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(await screen.findByText('Usa una imagen PNG, JPEG o WebP.')).toBeInTheDocument();

    const big = new File([new Uint8Array(1_048_577)], 'big.png', { type: 'image/png' });
    await user.upload(input, big);
    expect(await screen.findByText('La imagen pesa más de 1 MB.')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('shows what the server says about an image it could not read', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/settings/company': () => Response.json(COMPANY),
        'PUT /v1/settings/company/logo': () =>
          problem(422, 'validation_failed', [{ field: 'logo', code: 'invalid' }]),
      },
      SETTINGS_ME,
    );
    renderApp(session, '/configuracion/empresa');

    await userEvent
      .setup()
      .upload(
        await screen.findByLabelText('Subir logo'),
        new File(['x'], 'a.png', { type: 'image/png' }),
      );

    expect(
      await screen.findByText('No se pudo leer la imagen. Prueba con otra.'),
    ).toBeInTheDocument();
  });
});

describe('finances', () => {
  it('shows the rates as percentages and saves them as rates', async () => {
    const saved: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/settings/financial': () => Response.json(FINANCIAL),
        'PATCH /v1/settings/financial': (call) => {
          saved.push(call);
          return Response.json({ ...FINANCIAL, income_tax_rate: '0.05500', version: 2 });
        },
      },
      SETTINGS_ME,
    );
    renderApp(session, '/configuracion/finanzas');
    const user = userEvent.setup();

    const vat = await screen.findByLabelText('IVA');
    expect(vat).toHaveValue('12');
    const isr = screen.getByLabelText('ISR');
    expect(isr).toHaveValue('3');
    expect(screen.getByLabelText('Moneda')).toBeDisabled();

    await user.clear(isr);
    await user.type(isr, '5,5');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Se guardaron los valores.')).toBeInTheDocument();
    expect(saved[0]?.body).toEqual({
      version: 1,
      vat_rate: '0.12000',
      income_tax_rate: '0.05500',
      stale_cost_days: 90,
      quote_validity_days: 15,
    });
    expect(screen.getByLabelText('ISR')).toHaveValue('5.5');
  });

  it('does not send values that are not valid', async () => {
    const { session, calls } = createTestSession(
      { 'GET /v1/settings/financial': () => Response.json(FINANCIAL) },
      SETTINGS_ME,
    );
    renderApp(session, '/configuracion/finanzas');
    const user = userEvent.setup();

    const vat = await screen.findByLabelText('IVA');
    await user.clear(vat);
    await user.type(vat, '100');
    const validity = screen.getByLabelText(/Validez de una cotización/);
    await user.clear(validity);
    await user.type(validity, '0');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Escribe un porcentaje entre 0 y 99,999.')).toBeInTheDocument();
    expect(screen.getByText('Escribe un número de días entre 1 y 365.')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });
});

describe('numbering', () => {
  const sequences = { 'GET /v1/sequences': () => Response.json({ data: [CLIENT, QUOTE] }) };

  it('lists the next number of each document in a table on a desktop', async () => {
    const { session } = createTestSession(sequences, SETTINGS_ME);
    renderApp(session, '/configuracion/numeracion');

    const table = await screen.findByRole('table', { name: 'Lista de numeraciones' });
    expect(within(table).getByText('COT-2610-0001')).toBeInTheDocument();
    expect(within(table).getAllByText('Cada mes')).toHaveLength(1);
    expect(within(table).getByText('CLI-0058')).toBeInTheDocument();
  });

  it('shows cards on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(sequences, SETTINGS_ME);
    renderApp(session, '/configuracion/numeracion');

    const cards = await screen.findByLabelText('Lista de numeraciones');
    expect(within(cards).getByText('COT-2610-0001')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('edits a rule and sends the version that was read', async () => {
    const saved: Call[] = [];
    const { session } = createTestSession(
      {
        ...sequences,
        'PATCH /v1/sequences/quote': (call) => {
          saved.push(call);
          return Response.json({ ...QUOTE, prefix: 'COTZ', version: 2 });
        },
      },
      SETTINGS_ME,
    );
    renderApp(session, '/configuracion/numeracion');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Cotizaciones' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const prefix = await screen.findByLabelText(/Prefijo/);
    await user.clear(prefix);
    await user.type(prefix, 'cotz');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(saved[0]?.body).toEqual({
      version: 1,
      prefix: 'COTZ',
      padding: 4,
      period: 'month',
      next_value: 1,
    });
  });

  it('locks the reset period once numbers were issued and explains a counter that is too low', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/sequences': () =>
          Response.json({ data: [{ ...QUOTE, period_locked: true, next_value: 7 }] }),
        'PATCH /v1/sequences/quote': () =>
          problem(422, 'validation_failed', [{ field: 'next_value', code: 'too_low' }]),
      },
      SETTINGS_ME,
    );
    renderApp(session, '/configuracion/numeracion');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Cotizaciones' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    expect(await screen.findByLabelText('Reinicio del contador')).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('No puede ser menor que el contador actual.'),
    ).toBeInTheDocument();
  });

  it('does not offer to edit without the permission', async () => {
    const { session } = createTestSession(sequences, READER_ME);
    renderApp(session, '/configuracion/numeracion');

    await screen.findByRole('table', { name: 'Lista de numeraciones' });
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument();
  });
});
