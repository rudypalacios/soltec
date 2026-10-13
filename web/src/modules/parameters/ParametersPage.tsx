import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import type { RowAction } from '../../components/RowActions';
import { ActiveBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { useIsMobile } from '../../components/useIsMobile';
import { useListFilters } from '../../components/useListFilters';
import { statusPalette } from '../../theme/tokens';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { ColorField } from './ColorField';
import { PARAMETER_VIEWS, type ParameterValue, type ParameterView } from './parameterViews';
import {
  useParameterValues,
  useSaveParameterValue,
  useSetParameterValueActive,
} from './useParameters';

const PER_PAGE = 25;
const TAB_PARAM = 'parametro';

/**
 * `/configuracion/parametros`: the lookup lists other sections draw their options from. One tab per list, only the
 * ones the user may view (a select on a phone); the tab lives in the address so a reload stays on it.
 */
export function ParametersPage() {
  const can = useCan();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const views = PARAMETER_VIEWS.filter((view) => can(view.resource, 'view'));
  const current = views.find((view) => view.slug === params.get(TAB_PARAM)) ?? views[0];

  if (!current) {
    return <Alert severity="warning">No tienes permiso para ver esta pantalla.</Alert>;
  }

  const select = (slug: string) => setParams({ [TAB_PARAM]: slug }, { replace: true });

  return (
    <>
      {isMobile ? (
        <TextField
          select
          label="Parámetro"
          value={current.slug}
          onChange={(event) => select(event.target.value)}
          fullWidth
          sx={{ mb: 2 }}
        >
          {views.map((view) => (
            <MenuItem key={view.slug} value={view.slug}>
              {view.label}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <Tabs
          value={current.slug}
          onChange={(_event, slug: string) => select(slug)}
          aria-label="Parámetros"
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
        >
          {views.map((view) => (
            <Tab key={view.slug} value={view.slug} label={view.label} />
          ))}
        </Tabs>
      )}
      {/* Keyed so each list starts with its own search, filter and page. */}
      <ParameterList key={current.slug} view={current} />
    </>
  );
}

/** A dot in the color of a status followed by its name; the name carries the meaning, the dot is a quick read. */
function ColoredName({ value }: { value: ParameterValue }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {value.color ? (
        <Box
          component="span"
          aria-hidden
          data-testid="status-dot"
          sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: value.color, flexShrink: 0 }}
        />
      ) : null}
      {value.name}
    </Box>
  );
}

function ParameterList({ view }: { view: ParameterView }) {
  const can = useCan();
  const filters = useListFilters();
  const [editing, setEditing] = useState<ParameterValue | 'new' | null>(null);
  // Kept after closing (`open` false) so the dialog does not lose its text while it fades out.
  const [pending, setPending] = useState<{
    value: ParameterValue;
    activate: boolean;
    open: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const values = useParameterValues(view, {
    q: filters.query,
    status: filters.status,
    page: filters.page + 1,
    per_page: PER_PAGE,
  });
  const setActive = useSetParameterValueActive(view);

  const confirm = async () => {
    if (!pending) {
      return;
    }
    const { value, activate } = pending;
    setFailure(null);
    try {
      await setActive.mutateAsync({ id: value.id, active: activate });
    } catch (error) {
      setFailure(
        problemMessage(error, {
          validation_failed: `Ya hay un valor activo llamado «${value.name}». Renombra uno de los dos primero.`,
        }),
      );
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const actionsFor = (value: ParameterValue): RowAction[] => {
    const actions: RowAction[] = [];
    if (can(view.resource, 'edit')) {
      actions.push({
        key: 'edit',
        label: 'Editar',
        icon: ACTION_ICONS.edit,
        onSelect: () => setEditing(value),
      });
    }
    if (can(view.resource, 'deactivate')) {
      actions.push({
        key: 'toggle',
        label: value.is_active ? 'Desactivar' : 'Reactivar',
        icon: value.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: value.is_active ? 'danger' : undefined,
        onSelect: () => setPending({ value, activate: !value.is_active, open: true }),
      });
    }
    return actions;
  };

  const columns: DataColumn<ParameterValue>[] = [
    {
      id: 'name',
      header: 'Nombre',
      mobile: 'title',
      minWidth: 200,
      render: (value) => <ColoredName value={value} />,
    },
    {
      id: 'status',
      header: 'Estado',
      mobile: 'badge',
      nowrap: true,
      render: (value) => <ActiveBadge active={value.is_active} />,
    },
  ];

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'flex-end', mb: 2 }}>
        {can(view.resource, 'create') ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>
            {view.newLabel}
          </Button>
        ) : null}
      </Stack>

      <FilterBar
        searchLabel="Buscar por nombre"
        search={filters.text}
        onSearchChange={filters.setText}
      >
        <StatusFilter value={filters.status} onChange={filters.setStatus} />
      </FilterBar>

      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      ) : null}

      <DataList
        label={`Lista de ${view.noun}`}
        noun={view.noun}
        columns={columns}
        rows={values.data?.data}
        error={values.isError ? problemMessage(values.error) : null}
        getRowId={(value) => value.id}
        getRowName={(value) => value.name}
        getActions={actionsFor}
        pagination={{
          page: filters.page,
          perPage: PER_PAGE,
          total: values.data?.meta.total ?? 0,
          onPageChange: filters.setPage,
        }}
      />

      {editing !== null ? (
        <ValueDialog
          view={view}
          value={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={pending?.open === true}
        title={pending?.activate ? 'Reactivar valor' : 'Desactivar valor'}
        message={
          pending?.activate
            ? `«${pending.value.name}» volverá a ofrecerse en los formularios.`
            : `«${pending?.value.name ?? ''}» dejará de ofrecerse en los formularios nuevos. Los registros que ya lo usan lo conservan.`
        }
        confirmLabel={pending?.activate ? 'Reactivar' : 'Desactivar'}
        destructive={pending?.activate === false}
        busy={setActive.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(pending && { ...pending, open: false })}
      />
    </>
  );
}

/** Creates a value (`value` null) or edits one. */
function ValueDialog({
  view,
  value,
  onClose,
}: {
  view: ParameterView;
  value: ParameterValue | null;
  onClose: () => void;
}) {
  const save = useSaveParameterValue(view);
  const [name, setName] = useState(value?.name ?? '');
  const [colorValue, setColorValue] = useState(value?.color ?? statusPalette[0].value);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    setFailure(null);
    try {
      await save.mutateAsync({
        name: name.trim(),
        color: view.hasColor ? colorValue : undefined,
        id: value?.id,
        version: value?.version,
      });
      onClose();
    } catch (error) {
      const fields = fieldMessages(error, { name: { taken: view.takenMessage } });
      setFieldError(fields.name ?? null);
      setFailure(
        fields.name
          ? null
          : problemMessage(error, {
              conflict:
                'Otra persona cambió este valor mientras lo editabas. Cierra y vuelve a intentarlo.',
            }),
      );
    }
  };

  return (
    <Dialog
      open
      onClose={save.isPending ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="parameter-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle id="parameter-dialog-title">
          {value ? view.editTitle : view.newLabel}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {failure ? <Alert severity="error">{failure}</Alert> : null}
            <TextField
              label="Nombre"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldError !== null}
              helperText={fieldError}
              slotProps={{ htmlInput: { maxLength: 100 } }}
              required
              fullWidth
              autoFocus
            />
            {view.hasColor ? (
              <ColorField value={colorValue} onChange={setColorValue} disabled={save.isPending} />
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={save.isPending || !name.trim()}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
