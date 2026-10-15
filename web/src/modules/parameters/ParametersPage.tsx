import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { ApiError } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import type { RowAction } from '../../components/RowActions';
import { SectionNav } from '../../components/SectionNav';
import { ActiveBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { useListFilters } from '../../components/useListFilters';
import { statusPalette } from '../../theme/tokens';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { ColorField } from './ColorField';
import {
  ALL_VIEWS,
  PARAMETER_VIEWS,
  type ParameterValue,
  type ParameterView,
} from './parameterViews';
import {
  useParameterOptions,
  useParameterValues,
  useSaveParameterValue,
  useSetParameterValueActive,
} from './useParameters';

const PER_PAGE = 25;
const PARENT_OPTIONS = 100;
const TAB_PARAM = 'parametro';

/** `/configuracion/parametros`: the lookup lists other sections draw their options from. */
export function ParametersPage() {
  // Inside Configuración, which already has its side list: the tabs go on top.
  return <ParameterLists views={PARAMETER_VIEWS} tabsLabel="Parámetros" placement="top" />;
}

/**
 * One section per list, only the ones the user may view, in the submenu every sectioned screen shares; the open one
 * lives in the address so a reload stays on it. Serves the parameters and the product structure alike.
 */
export function ParameterLists({
  views: allViews,
  tabsLabel,
  placement,
}: {
  views: readonly ParameterView[];
  tabsLabel: string;
  placement?: 'side' | 'top';
}) {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const views = allViews.filter((view) => can(view.resource, 'view'));
  const current = views.find((view) => view.slug === params.get(TAB_PARAM)) ?? views[0];

  if (!current) {
    return <Alert severity="warning">No tienes permiso para ver esta pantalla.</Alert>;
  }

  const select = (slug: string) => setParams({ [TAB_PARAM]: slug }, { replace: true });

  return (
    <SectionNav
      label={tabsLabel}
      value={current.slug}
      onChange={select}
      placement={placement}
      items={views.map((view) => ({ value: view.slug, label: view.label }))}
    >
      {/* Keyed so each list starts with its own search, filter and page. */}
      <ParameterList key={current.slug} view={current} />
    </SectionNav>
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

/** A parent as a selector needs it. */
interface ParentChoice {
  id: string;
  name: string;
  is_active: boolean;
}

/**
 * The values of the list a view's values belong to (the areas, for groups). Whoever may view that list gets all of
 * it, inactive ones included, so a value under an inactive parent can still be found by its filter. Whoever only
 * views this list (and so can filter, create or edit in it) gets the active ones from the options list: the screen
 * needs nothing on the parent's own section (ADR-0024). Whoever may not view this list never reaches the screen.
 */
function useParentOptions(view: ParameterView) {
  const can = useCan();
  const parentView = ALL_VIEWS.find((candidate) => candidate.slug === view.parent?.slug);
  const canList = parentView !== undefined && can(parentView.resource, 'view');
  const canChoose = parentView !== undefined;
  const list = useParameterValues(
    parentView ?? view,
    { status: 'all', per_page: PARENT_OPTIONS },
    canList,
  );
  const active = useParameterOptions(parentView ?? view, canChoose && !canList);
  const options: ParentChoice[] | undefined = canList
    ? list.data?.data
    : active.data?.data.map((option) => ({ ...option, is_active: true }));
  return { allowed: canChoose, options: canChoose ? options : undefined };
}

/** Why an action on a value failed, with the counts and names the API sends back. */
function failureMessage(view: ParameterView, value: ParameterValue, error: unknown): string {
  if (error instanceof ApiError) {
    const { children, parent } = view;
    if (children && error.code === children.errorCode) {
      const count = error.details[children.countField];
      const text = typeof count === 'number' ? children.label(count) : 'valores activos';
      return `No se puede desactivar «${value.name}»: tiene ${text}. ${children.hint}`;
    }
    if (parent && error.fieldErrors[parent.field] === 'parent_inactive') {
      const name = value[parent.key]?.name;
      const which = name ? `${parent.label.toLowerCase()} «${name}»` : parent.label.toLowerCase();
      return `No se puede reactivar «${value.name}»: ${which} está desactivada. Reactívala primero.`;
    }
  }
  return problemMessage(error, {
    validation_failed: `Ya hay un valor activo llamado «${value.name}». Renombra uno de los dos primero.`,
  });
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
  // A parent's «3 grupos activos» link arrives here with the parent already chosen in the address.
  const [searchParams] = useSearchParams();
  const [parentFilter, setParentFilter] = useState(
    view.parent ? (searchParams.get(view.parent.field) ?? '') : '',
  );
  const parents = useParentOptions(view);
  // The list that hangs under this one (groups under an area), when the person may open it.
  const childView = ALL_VIEWS.find((candidate) => candidate.parent?.slug === view.slug);
  const childLink = childView && can(childView.resource, 'view') ? childView : undefined;
  // New values start under the parent the list is filtered by, if it is still active.
  const defaultParentId = parents.options?.find(
    (option) => option.id === parentFilter && option.is_active,
  )?.id;

  const values = useParameterValues(view, {
    q: filters.query,
    status: filters.status,
    page: filters.page + 1,
    per_page: PER_PAGE,
    ...(view.parent && parentFilter ? { [view.parent.field]: parentFilter } : {}),
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
      setFailure(failureMessage(view, value, error));
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

  const { parent, children } = view;
  const columns: DataColumn<ParameterValue>[] = [
    {
      id: 'name',
      header: 'Nombre',
      mobile: 'title',
      minWidth: 200,
      render: (value) => <ColoredName value={value} />,
    },
    ...(parent
      ? [
          {
            id: 'parent',
            header: parent.label,
            mobile: 'subtitle' as const,
            render: (value: ParameterValue) => value[parent.key]?.name ?? '',
          },
        ]
      : []),
    ...(children
      ? [
          {
            id: 'children',
            header: children.header,
            mobile: 'subtitle' as const,
            render: (value: ParameterValue) => {
              const text = children.label(value[children.countField] ?? 0);
              return childLink?.parent ? (
                <Link
                  component={RouterLink}
                  to={`/catalogo?${TAB_PARAM}=${childLink.slug}&${childLink.parent.field}=${value.id}`}
                  aria-label={`Ver ${text} de ${value.name}`}
                >
                  {text}
                </Link>
              ) : (
                text
              );
            },
          },
        ]
      : []),
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
      <FilterBar
        searchLabel="Buscar por nombre"
        search={filters.text}
        onSearchChange={filters.setText}
        action={
          can(view.resource, 'create') ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>
              {view.newLabel}
            </Button>
          ) : null
        }
      >
        <StatusFilter value={filters.status} onChange={filters.setStatus} />
        {parent && parents.allowed ? (
          <TextField
            select
            label={parent.label}
            value={parentFilter}
            onChange={(event) => {
              setParentFilter(event.target.value);
              filters.resetPage();
            }}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">{parent.allLabel}</MenuItem>
            {(parents.options ?? []).map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {option.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
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
        isInactive={(value) => !value.is_active}
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
          defaultParentId={defaultParentId}
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
  defaultParentId,
  onClose,
}: {
  view: ParameterView;
  value: ParameterValue | null;
  /** The parent a new value starts under (the list's filter). */
  defaultParentId?: string;
  onClose: () => void;
}) {
  const save = useSaveParameterValue(view);
  const parents = useParentOptions(view);
  const { parent } = view;
  const [parentId, setParentId] = useState(
    parent ? (value ? (value[parent.key]?.id ?? '') : (defaultParentId ?? '')) : '',
  );
  const [name, setName] = useState(value?.name ?? '');
  const [colorValue, setColorValue] = useState(value?.color ?? statusPalette[0].value);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [parentError, setParentError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Active parents, plus the one the value already has even if it was deactivated since (ADR-0023).
  const parentChoices = (parents.options ?? []).filter(
    (option) => option.is_active || option.id === (parent ? value?.[parent.key]?.id : undefined),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    setParentError(null);
    setFailure(null);
    try {
      await save.mutateAsync({
        name: name.trim(),
        color: view.hasColor ? colorValue : undefined,
        parentId: parent ? parentId : undefined,
        id: value?.id,
        version: value?.version,
      });
      onClose();
    } catch (error) {
      const fields = fieldMessages(error, {
        name: { taken: view.takenMessage },
        ...(parent
          ? { [parent.field]: { not_found: `Elige ${parent.label.toLowerCase()} activa.` } }
          : {}),
      });
      setFieldError(fields.name ?? null);
      setParentError(parent ? (fields[parent.field] ?? null) : null);
      setFailure(
        fields.name || (parent && fields[parent.field])
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
              slotProps={{ htmlInput: { maxLength: view.nameMax } }}
              required
              fullWidth
              autoFocus
            />
            {parent ? (
              <TextField
                select
                label={parent.label}
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                error={parentError !== null || !parents.allowed}
                helperText={
                  parents.allowed
                    ? parentError
                    : `No tienes permiso para ver las opciones de ${parent.label.toLowerCase()}.`
                }
                disabled={!parents.allowed}
                required
                fullWidth
              >
                {parentChoices.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            {view.hasColor ? (
              <ColorField value={colorValue} onChange={setColorValue} disabled={save.isPending} />
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={save.isPending || !name.trim() || (parent !== undefined && !parentId)}
          >
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
