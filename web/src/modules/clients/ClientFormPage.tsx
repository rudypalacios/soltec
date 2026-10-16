import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ApiError } from '@soltec/shared';
import type { components } from '@soltec/shared';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { AddressesEditor } from '../../components/AddressesEditor';
import { CodeChip } from '../../components/CodeChip';
import { FormActions, FormPage } from '../../components/FormPage';
import { PageHeader } from '../../components/PageHeader';
import { SearchableSelect, type Choice } from '../../components/SearchableSelect';
import { fieldMessage, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { useAreaOptions, useMarginLevelOptions } from '../products/useProducts';
import { bodyOf, billingBody, draftOf, type ClientDraft } from './clientDrafts';
import { BillingFields, FIELD_MESSAGES, IdentificationFields } from './clientFields';
import {
  useClient,
  useClientStatusOptions,
  useCreateClient,
  useSegmentOptions,
  useSetClientActive,
  useSimilarClients,
  useUpdateClient,
} from './useClients';

type Client = components['schemas']['Client'];

const SAVE_CONFLICTS = {
  conflict:
    'Otra persona cambió este cliente mientras lo editabas. Recarga la página para ver sus cambios.',
  identification_taken:
    'Ya existe un cliente con esta identificación. Consulta con tu jefe directo o con administración.',
  identification_inactive:
    'Ya existe un cliente desactivado con esta identificación. Pide a administración que lo reactive en lugar de registrarlo de nuevo.',
};

/** `/clientes/nuevo`: registers a prospect. */
export function ClientCreatePage() {
  return (
    <>
      <PageHeader title="Nuevo prospecto" />
      <ClientForm client={null} />
    </>
  );
}

/** `/clientes/:clientId/editar`. */
export function ClientEditPage() {
  const { clientId } = useParams();
  const client = useClient(clientId);

  if (client.isError) {
    return <Alert severity="error">{problemMessage(client.error)}</Alert>;
  }
  if (client.isPending) {
    return <CircularProgress aria-label="Cargando el cliente" />;
  }
  return (
    <>
      <PageHeader title={client.data.type === 'customer' ? 'Editar cliente' : 'Editar prospecto'} />
      {/* A different client (or a refetch after saving) restarts the form from the server's copy. */}
      <ClientForm key={`${client.data.id}:${client.data.version}`} client={client.data} />
    </>
  );
}

/** A value the client already had stays on the list even if it was switched off since. */
function withKept(
  found: { id: string; name: string }[],
  kept: { id: string; name: string } | null | undefined,
): Choice[] {
  const all = kept && !found.some((option) => option.id === kept.id) ? [kept, ...found] : found;
  return all.map((option) => ({ id: option.id, label: option.name }));
}

function ClientForm({ client }: { client: Client | null }) {
  const navigate = useNavigate();
  const can = useCan();
  const create = useCreateClient();
  const update = useUpdateClient(client?.id ?? '');
  const setActive = useSetClientActive();
  const [draft, setDraft] = useState<ClientDraft>(() => draftOf(client));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [inactiveHolder, setInactiveHolder] = useState<{ id: string; name: string } | null>(null);
  const patch = (changes: Partial<ClientDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const statuses = useClientStatusOptions();
  const segments = useSegmentOptions();
  const areas = useAreaOptions();
  const levels = useMarginLevelOptions();

  const deferredName = useDeferredValue(draft.name);
  const similar = useSimilarClients(deferredName, client === null);
  const lookalikes = client === null ? (similar.data?.data ?? []) : [];

  const back = client ? `/clientes/${client.id}` : '/clientes';
  const busy = create.isPending || update.isPending;
  const defaultLevel = levels.data?.data.find((level) => level.is_default);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFailure(null);
    setInactiveHolder(null);
    const body = bodyOf(draft);
    try {
      const saved = client
        ? await update.mutateAsync({
            ...body,
            version: client.version,
            billing_profile: draft.billing ? billingBody(draft.billing) : null,
          })
        : await create.mutateAsync(body);
      navigate(`/clientes/${saved.id}`);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'identification_taken' || error.code === 'identification_inactive')
      ) {
        setErrors({ identification: problemMessage(error, SAVE_CONFLICTS) });
        // Whoever may reactivate and already reaches that client is told which one, to reactivate it instead.
        const { inactive_client_id: id, inactive_client_name: name } = error.details;
        if (typeof id === 'string' && typeof name === 'string') {
          setInactiveHolder({ id, name });
        }
        return;
      }
      const codes = error instanceof ApiError ? error.fieldErrors : {};
      const messages = Object.fromEntries(
        Object.entries(codes).map(([field, code]) => [
          field,
          fieldMessage(code, FIELD_MESSAGES[field.split('.').at(-1) ?? field] ?? {}),
        ]),
      );
      setErrors(messages);
      setFailure(Object.keys(messages).length === 0 ? problemMessage(error, SAVE_CONFLICTS) : null);
    }
  };

  const reactivateHolder = async () => {
    if (!inactiveHolder) {
      return;
    }
    try {
      await setActive.mutateAsync({ clientId: inactiveHolder.id, active: true });
      // The client that already exists is the one to correct, not a new one.
      navigate(
        can('clients', 'edit')
          ? `/clientes/${inactiveHolder.id}/editar`
          : `/clientes/${inactiveHolder.id}`,
      );
    } catch (error) {
      setInactiveHolder(null);
      setFailure(problemMessage(error));
    }
  };

  return (
    <FormPage onSubmit={(event) => void submit(event)} maxWidth={760}>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      {inactiveHolder ? (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={setActive.isPending}
              onClick={() => void reactivateHolder()}
            >
              {`Reactivar «${inactiveHolder.name}»`}
            </Button>
          }
        >
          Ese cliente ya está registrado y está inactivo. Reactívalo para corregir sus datos en
          lugar de crear uno nuevo.
        </Alert>
      ) : null}
      {client && !client.is_active ? (
        <Alert severity="info">
          Este cliente está inactivo. Puedes corregir sus datos; para que vuelva a las listas,
          reactívalo desde su ficha.
        </Alert>
      ) : null}
      {client ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CodeChip code={client.code} />
        </Stack>
      ) : null}

      <Typography variant="h6" component="h2">
        Datos
      </Typography>
      <TextField
        label="Nombre comercial"
        value={draft.name}
        onChange={(event) => patch({ name: event.target.value })}
        error={Boolean(errors.name)}
        helperText={errors.name}
        required
        autoFocus
        slotProps={{ htmlInput: { maxLength: 190 } }}
        fullWidth
      />
      {lookalikes.length > 0 ? (
        <Alert severity="warning" role="status">
          <Typography sx={{ fontWeight: 600 }}>
            Ya tienes clientes con un nombre parecido
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {lookalikes.map((other) => (
              <li key={other.id}>
                <Link component={RouterLink} to={`/clientes/${other.id}`} target="_blank">
                  {other.name}
                </Link>{' '}
                <CodeChip code={other.code} />
              </li>
            ))}
          </Box>
          Revisa que no sea el mismo antes de guardar.
        </Alert>
      ) : null}
      <IdentificationFields
        type={draft.identificationType}
        value={draft.identification}
        onType={(identificationType) => patch({ identificationType })}
        onValue={(identification) => patch({ identification })}
        error={errors.identification}
        required
      />

      <Typography variant="h6" component="h2">
        Clasificación
      </Typography>
      <TextField
        select
        label="Estado del cliente"
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        value={draft.statusId}
        onChange={(event) => patch({ statusId: event.target.value })}
        error={Boolean(errors.status_id)}
        helperText={errors.status_id}
        fullWidth
      >
        <MenuItem value="">Sin estado</MenuItem>
        {withKept(statuses.data?.data ?? [], client?.status).map((status) => (
          <MenuItem key={status.id} value={status.id}>
            {status.label}
          </MenuItem>
        ))}
      </TextField>
      <SearchableSelect
        label="Segmento"
        choices={withKept(segments.data?.data ?? [], client?.segment)}
        value={draft.segmentId}
        onChange={(segmentId) => patch({ segmentId })}
        error={errors.segment_id}
      />
      <SearchableSelect
        label="Área de interés"
        choices={withKept(areas.data?.data ?? [], client?.area)}
        value={draft.areaId}
        onChange={(areaId) => patch({ areaId })}
        error={errors.area_id}
      />
      <TextField
        select
        label="Nivel de margen habitual"
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        value={draft.marginLevelId}
        onChange={(event) => patch({ marginLevelId: event.target.value })}
        error={Boolean(errors.margin_level_id)}
        helperText={
          errors.margin_level_id ?? 'Sin uno, las cotizaciones usan el nivel por defecto.'
        }
        fullWidth
      >
        <MenuItem value="">
          {defaultLevel ? `Usar el por defecto (${defaultLevel.name})` : 'Usar el por defecto'}
        </MenuItem>
        {withKept(levels.data?.data ?? [], client?.margin_level).map((level) => (
          <MenuItem key={level.id} value={level.id}>
            {level.label}
          </MenuItem>
        ))}
      </TextField>

      <Typography variant="h6" component="h2">
        Direcciones
      </Typography>
      <AddressesEditor
        rows={draft.addresses}
        onChange={(addresses) => patch({ addresses })}
        errors={errors}
        readOnly={false}
      />

      {draft.billing ? (
        <>
          <Typography variant="h6" component="h2">
            Facturación
          </Typography>
          <BillingFields
            draft={draft.billing}
            onChange={(changes) =>
              patch({ billing: draft.billing ? { ...draft.billing, ...changes } : null })
            }
            errors={errors}
            keepRegime={client?.billing_profile?.tax_regime}
            keepMethod={client?.billing_profile?.payment_method}
          />
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {client
            ? 'Los datos de facturación se piden al convertir el prospecto en cliente de venta.'
            : 'Quedas como su único asesor. Los datos de facturación se piden al convertirlo en cliente de venta.'}
        </Typography>
      )}

      <FormActions>
        <Button component={RouterLink} to={back} variant="outlined" color="inherit">
          Cancelar
        </Button>
        <Button type="submit" variant="contained" disabled={busy || !draft.name.trim()}>
          Guardar
        </Button>
      </FormActions>
    </FormPage>
  );
}
