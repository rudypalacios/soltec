import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FormActions, FormPage } from '../../components/FormPage';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import {
  brandingLogoUrl,
  useCompany,
  useRemoveLogo,
  useSaveCompany,
  useUploadLogo,
} from './useSettings';

type Company = components['schemas']['Company'];

const MAX_LOGO_BYTES = 1_048_576;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** The time zones the browser knows, with the saved one first so it is always an option. */
function timeZones(saved: string): string[] {
  const known =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return Array.from(new Set([saved, ...known]));
}

/** `/configuracion/empresa`: the company's data and logo. */
export function CompanyPage() {
  const company = useCompany();

  if (company.isError) {
    return <Alert severity="error">{problemMessage(company.error)}</Alert>;
  }
  if (!company.data) {
    return <CircularProgress aria-label="Cargando la empresa" />;
  }
  return (
    <Stack spacing={3}>
      <LogoCard company={company.data} />
      <CompanyForm company={company.data} />
    </Stack>
  );
}

function LogoCard({ company }: { company: Company }) {
  const canEdit = useCan()('company', 'edit');
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const input = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // The same file can be chosen again after a mistake.
    if (input.current) {
      input.current.value = '';
    }
    if (!file) {
      return;
    }
    setFailure(null);
    // The server checks the content; these two checks only save a trip for the obvious mistakes.
    if (!LOGO_TYPES.includes(file.type)) {
      setFailure('Usa una imagen PNG, JPEG o WebP.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFailure('La imagen pesa más de 1 MB.');
      return;
    }
    try {
      await upload.mutateAsync(file);
    } catch (error) {
      setFailure(fieldMessages(error, { logo: LOGO_MESSAGES }).logo ?? problemMessage(error));
    }
  };

  const removeLogo = async () => {
    setFailure(null);
    try {
      await remove.mutateAsync();
    } catch (error) {
      setFailure(problemMessage(error));
    } finally {
      setConfirmRemove(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 560 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
        Logo
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        PNG, JPEG o WebP de hasta 1 MB; se reduce a 512 px como máximo. Un PNG con fondo
        transparente se ve mejor.
      </Typography>
      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      ) : null}
      <Box sx={{ minHeight: 64, display: 'flex', alignItems: 'center', mb: 2 }}>
        {company.logo_version ? (
          <Box
            component="img"
            src={brandingLogoUrl(company.logo_version)}
            alt="Logo actual"
            sx={{ maxHeight: 96, maxWidth: '100%', objectFit: 'contain' }}
          />
        ) : (
          <Typography color="text.secondary">
            Aún no hay logo: se muestra el nombre de la empresa o la marca provisional.
          </Typography>
        )}
      </Box>
      {canEdit ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component="label" variant="outlined" disabled={upload.isPending}>
            {upload.isPending ? 'Subiendo…' : 'Subir logo'}
            <input
              ref={input}
              type="file"
              hidden
              accept={LOGO_TYPES.join(',')}
              onChange={(event) => void choose(event)}
            />
          </Button>
          {company.logo_version ? (
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => setConfirmRemove(true)}
              disabled={remove.isPending}
            >
              Quitar logo
            </Button>
          ) : null}
        </Stack>
      ) : null}
      <ConfirmDialog
        open={confirmRemove}
        title="Quitar el logo"
        message="Se vuelve a mostrar el nombre de la empresa en lugar del logo."
        confirmLabel="Quitar"
        destructive
        busy={remove.isPending}
        onConfirm={() => void removeLogo()}
        onCancel={() => setConfirmRemove(false)}
      />
    </Paper>
  );
}

const LOGO_MESSAGES = {
  required: 'Elige una imagen.',
  too_large: 'La imagen es demasiado grande: máximo 1 MB y 8 megapíxeles.',
  unsupported_type: 'Usa una imagen PNG, JPEG o WebP.',
  invalid: 'No se pudo leer la imagen. Prueba con otra.',
};

const FIELD_OVERRIDES = {
  timezone: { invalid: 'Elige una zona horaria de la lista.' },
  email: { invalid: 'Escribe un correo válido.' },
};

/** The form's text fields from the saved company (an absent optional value is an empty text). */
function toValues(company: Company) {
  return {
    legal_name: company.legal_name,
    trade_name: company.trade_name,
    tax_id: company.tax_id,
    address: company.address ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    timezone: company.timezone,
  };
}

function CompanyForm({ company }: { company: Company }) {
  const canEdit = useCan()('company', 'edit');
  const save = useSaveCompany();
  const [values, setValues] = useState(() => toValues(company));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (field: keyof typeof values) => (event: ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));
  const field = (name: keyof typeof values, label: string, maxLength: number, required = false) => (
    <TextField
      label={label}
      value={values[name]}
      onChange={set(name)}
      error={name in errors}
      helperText={errors[name]}
      required={required}
      disabled={!canEdit}
      slotProps={{ htmlInput: { maxLength } }}
      fullWidth
    />
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFailure(null);
    setSaved(false);
    const nullable = (value: string) => value.trim() || null;
    try {
      const updated = await save.mutateAsync({
        version: company.version,
        legal_name: values.legal_name.trim(),
        trade_name: values.trade_name.trim(),
        tax_id: values.tax_id.trim(),
        address: nullable(values.address),
        phone: nullable(values.phone),
        email: nullable(values.email),
        timezone: values.timezone,
      });
      // What the server kept (trimmed, the email in lower case) replaces what was typed.
      setValues(toValues(updated));
      setSaved(true);
    } catch (error) {
      const fields = fieldMessages(error, FIELD_OVERRIDES);
      setErrors(fields);
      setFailure(
        Object.keys(fields).length > 0
          ? null
          : problemMessage(error, {
              conflict:
                'Otra persona cambió estos datos mientras los editabas. Recarga la página e inténtalo de nuevo.',
            }),
      );
    }
  };

  return (
    <FormPage onSubmit={(event) => void submit(event)}>
      <Typography variant="h6" component="h2">
        Datos de la empresa
      </Typography>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      {saved ? <Alert severity="success">Se guardaron los datos de la empresa.</Alert> : null}
      {field('trade_name', 'Nombre comercial', 190, true)}
      {field('legal_name', 'Razón social', 190, true)}
      {field('tax_id', 'NIT', 30, true)}
      {field('address', 'Dirección', 255)}
      {field('phone', 'Teléfono', 40)}
      {field('email', 'Correo de contacto', 190)}
      <Autocomplete
        options={timeZones(company.timezone)}
        value={values.timezone}
        onChange={(_, zone) => zone && setValues((current) => ({ ...current, timezone: zone }))}
        disableClearable
        disabled={!canEdit}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Zona horaria"
            error={'timezone' in errors}
            helperText={
              errors.timezone ?? 'Los números de documento cambian de mes a las 00:00 de esta zona.'
            }
          />
        )}
      />
      {canEdit ? (
        <FormActions>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            Guardar
          </Button>
        </FormActions>
      ) : null}
    </FormPage>
  );
}
