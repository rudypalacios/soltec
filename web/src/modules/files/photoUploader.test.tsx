import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PhotoPreparer } from '@soltec/shared';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider, useCurrentUser } from '../access/SessionContext';
import { createTestSession, problem, type Call, type Handler } from '../../test/fakeApi';
import { theme } from '../../theme/theme';
import { PhotoUploader, type UploadedPhoto } from './PhotoUploader';

const STAMPS = { created_at: '2026-10-30T10:00:00.000Z', updated_at: '2026-10-30T10:00:00.000Z' };
const STORED = (name: string, id: string) => ({
  id,
  original_name: name,
  width: 1600,
  height: 1200,
  size_bytes: 1234,
  metadata: null,
  uploaded_by: { id: '0192f1c2-7d3a-7a11-8f2e-00000000000a', name: 'Ana Pérez' },
  is_active: true,
  version: 1,
  ...STAMPS,
});
const image = () => new Response(new Blob(['webp'], { type: 'image/webp' }));

/** The platform's photo port, replaced by one that does not need a canvas: jsdom has none. */
const preparer: PhotoPreparer = {
  prepare: (_source, name) =>
    Promise.resolve({
      photo: new Blob(['jpeg bytes'], { type: 'image/jpeg' }),
      name: name.replace(/\.\w+$/, '') + '.jpg',
      metadata: { device_make: 'Google', latitude: 14.6, longitude: -90.5 },
    }),
};

function Harness({
  initial = [],
  onChange,
  max,
  prepare = preparer,
}: {
  initial?: UploadedPhoto[];
  onChange?: (photos: UploadedPhoto[]) => void;
  max?: number;
  prepare?: PhotoPreparer;
}) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>(initial);
  // The uploader needs a signed-in session, which the provider recovers from the refresh cookie.
  const user = useCurrentUser();
  if (!user) {
    return null;
  }
  return (
    <PhotoUploader
      value={photos}
      onChange={(next) => {
        setPhotos(next);
        onChange?.(next);
      }}
      max={max}
      preparer={prepare}
    />
  );
}

function renderUploader(
  handlers: Record<string, Handler>,
  props: Parameters<typeof Harness>[0] = {},
) {
  const { session, calls } = createTestSession(handlers);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={theme}>
        <SessionProvider session={session}>
          <Harness {...props} />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const pick = (files: File[]) =>
  userEvent.upload(screen.getByLabelText('Elegir fotos', { selector: 'input' }), files);
const photoFile = (name: string) => new File(['raw'], name, { type: 'image/jpeg' });

/**
 * What the uploader put in each multipart form. The request the fake API reads is built by Node, which cannot read a
 * file made by jsdom, so the form is recorded as it is built and left empty.
 */
interface FormEntry {
  name: string;
  value: unknown;
  filename?: string;
}
const forms: FormEntry[][] = [];
const entry = (form: FormEntry[] | undefined, name: string) =>
  form?.find((item) => item.name === name);
const sentId = (form: FormEntry[] | undefined) => String(entry(form, 'id')?.value);

beforeEach(() => {
  forms.length = 0;
  const byForm = new Map<FormData, FormEntry[]>();
  vi.spyOn(FormData.prototype, 'append').mockImplementation(function (
    this: FormData,
    name: string,
    value: unknown,
    filename?: string,
  ) {
    let form = byForm.get(this);
    if (!form) {
      form = [];
      byForm.set(this, form);
      forms.push(form);
    }
    form.push({ name, value, filename });
  } as never);
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:thumb', revokeObjectURL: () => {} }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('photo uploader', () => {
  it('shrinks and uploads a photo as a multipart form and lists it with its thumbnail', async () => {
    const posts: Call[] = [];
    const changes: UploadedPhoto[][] = [];
    renderUploader(
      {
        'POST /v1/files': (call) => {
          posts.push(call);
          return Response.json(STORED('visita.jpg', '0192f1c2-7d3a-7a11-8f2e-00000000c101'), {
            status: 201,
          });
        },
        '#content': () => image(),
        'GET /v1/files/0192f1c2-7d3a-7a11-8f2e-00000000c101/content': () => image(),
      },
      { onChange: (photos) => changes.push(photos) },
    );

    await screen.findByRole('button', { name: 'Agregar fotos' });
    await pick([photoFile('IMG_0042.heic')]);

    await waitFor(() => expect(posts).toHaveLength(1));
    const [post] = posts;
    expect(post?.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const [form] = forms;
    expect(entry(form, 'file')).toMatchObject({ filename: 'IMG_0042.jpg' });
    expect((entry(form, 'file')?.value as Blob).type).toBe('image/jpeg');
    expect(JSON.parse(String(entry(form, 'metadata')?.value))).toEqual({
      device_make: 'Google',
      latitude: 14.6,
      longitude: -90.5,
    });
    expect(sentId(form)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);

    expect(await screen.findByRole('img', { name: 'Foto «visita.jpg»' })).toHaveAttribute(
      'src',
      'blob:thumb',
    );
    expect(changes.at(-1)).toEqual([
      { id: '0192f1c2-7d3a-7a11-8f2e-00000000c101', name: 'visita.jpg' },
    ]);
  });

  it('says why a photo was refused and sends it again with the same id', async () => {
    const posts: Call[] = [];
    let attempt = 0;
    renderUploader({
      'POST /v1/files': (call) => {
        posts.push(call);
        attempt += 1;
        return attempt === 1
          ? problem(422, 'validation_failed', [{ field: 'file', code: 'too_large' }])
          : Response.json(STORED('grande.jpg', '0192f1c2-7d3a-7a11-8f2e-00000000c102'), {
              status: 201,
            });
      },
      'GET /v1/files/0192f1c2-7d3a-7a11-8f2e-00000000c102/content': () => image(),
    });
    const user = userEvent.setup();

    await screen.findByRole('button', { name: 'Agregar fotos' });
    await pick([photoFile('grande.jpg')]);
    expect(await screen.findByText('La foto pesa demasiado (máximo 10 MB).')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('img', { name: 'Foto «grande.jpg»' })).toBeVisible();
    expect(posts).toHaveLength(2);
    // One photo, one id: if the first answer had only been lost, the server would recognise the retry.
    expect(forms).toHaveLength(2);
    expect(sentId(forms[1])).toBe(sentId(forms[0]));
  });

  it('says so when the browser cannot open the picture, and sends nothing', async () => {
    const posts: Call[] = [];
    renderUploader(
      { 'POST /v1/files': (call) => (posts.push(call), Response.json({}, { status: 201 })) },
      { prepare: { prepare: () => Promise.reject(new Error('cannot decode')) } },
    );

    await screen.findByRole('button', { name: 'Agregar fotos' });
    await pick([photoFile('rara.heic')]);

    expect(await screen.findByText('No se pudo preparar la foto. Prueba con otra.')).toBeVisible();
    expect(posts).toHaveLength(0);
  });

  it('tells the person who may not upload', async () => {
    renderUploader({ 'POST /v1/files': () => problem(403, 'forbidden') });

    await screen.findByRole('button', { name: 'Agregar fotos' });
    await pick([photoFile('a.jpg')]);

    expect(await screen.findByText('No tienes permiso para subir fotos.')).toBeVisible();
  });

  it('removes a photo from the list and a failed one too', async () => {
    const changes: UploadedPhoto[][] = [];
    renderUploader(
      {
        'POST /v1/files': () =>
          problem(422, 'validation_failed', [{ field: 'file', code: 'unsupported_type' }]),
        'GET /v1/files/0192f1c2-7d3a-7a11-8f2e-00000000c103/content': () => image(),
      },
      {
        initial: [{ id: '0192f1c2-7d3a-7a11-8f2e-00000000c103', name: 'techo.jpg' }],
        onChange: (photos) => changes.push(photos),
      },
    );
    const user = userEvent.setup();

    const list = await screen.findByRole('list', { name: 'Fotos' });
    await user.click(within(list).getByRole('button', { name: 'Quitar «techo.jpg»' }));
    expect(changes.at(-1)).toEqual([]);

    await pick([photoFile('animada.gif')]);
    expect(await screen.findByText('Solo se aceptan fotos JPEG, PNG o WebP.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Quitar «animada.gif»' }));
    expect(screen.queryByText('animada.gif')).not.toBeInTheDocument();
  });

  it('stops offering to add photos at the maximum', async () => {
    renderUploader(
      { 'GET /v1/files/0192f1c2-7d3a-7a11-8f2e-00000000c104/content': () => image() },
      { initial: [{ id: '0192f1c2-7d3a-7a11-8f2e-00000000c104', name: 'una.jpg' }], max: 1 },
    );

    expect(await screen.findByRole('button', { name: 'Agregar fotos' })).toBeDisabled();
    expect(screen.getByText('Llegaste al máximo de 1 fotos.')).toBeVisible();
  });
});
