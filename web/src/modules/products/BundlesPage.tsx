import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { ApiError, type components } from '@soltec/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import { Highlight } from '../../components/Highlight';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { StatusBadge } from '../../components/StatusBadge';
import { useIsMobile } from '../../components/useIsMobile';
import { useListFilters } from '../../components/useListFilters';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { PER_PAGE_OPTIONS, useCatalogFilters } from './catalogFilters';
import {
  bulkSummary,
  MetaLine,
  INACTIVE_CARD,
  INACTIVE_ROW,
  InactiveTag,
  PriceBlock,
} from './catalogParts';
import { CatalogTabs } from './CatalogTabs';
import { CodeChip } from './CodeChip';
import { MarginPreviewDialog } from './MarginPreviewDialog';
import { formatMoney } from './productFormat';
import { useBulkBundles, useBundles, useSetBundleActive } from './useBundles';

type Bundle = components['schemas']['Bundle'];

/** A change waiting for the person to confirm it (`open` false while the dialog fades out). */
type Change = 'deactivate' | 'reactivate';
type PendingAction =
  | { kind: 'one'; bundle: Bundle; change: Change; open: boolean }
  | { kind: 'many'; change: Change; open: boolean };

const WHAT = { one: 'paquete', many: 'paquetes', blockedBy: 'su grupo' } as const;

/** `/paquetes`: compound products, with the cost and price their components add up to. */
export function BundlesPage() {
  const can = useCan();
  const list = useListFilters();
  const catalog = useCatalogFilters(list);
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [preview, setPreview] = useState<{ bundle: Bundle; open: boolean } | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const bundles = useBundles(catalog.query);
  const setActive = useSetBundleActive();
  const bulk = useBulkBundles();

  useEffect(() => setSelected(new Set()), [catalog.rowsKey]);

  const currencyCode = bundles.data?.meta.currency_code ?? 'GTQ';
  const total = bundles.data?.meta.total;
  const picked = [...selected];
  const canSelect = can('bundles', 'deactivate');

  const confirmPending = async () => {
    if (!pending) {
      return;
    }
    setFailure(null);
    setNotice(null);
    try {
      if (pending.kind === 'one') {
        await setActive.mutateAsync({
          bundleId: pending.bundle.id,
          active: pending.change === 'reactivate',
        });
      } else {
        const result = await bulk.mutateAsync({ kind: pending.change, ids: picked });
        setNotice(
          bulkSummary(
            pending.change === 'deactivate' ? 'desactivaron' : 'reactivaron',
            result,
            WHAT,
          ),
        );
        setSelected(new Set());
      }
    } catch (error) {
      setFailure(reactivationFailure(error, pending));
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const actionsFor = (bundle: Bundle): RowAction[] => {
    const actions: RowAction[] = [
      can('bundles', 'edit')
        ? {
            key: 'edit',
            label: 'Editar',
            icon: ACTION_ICONS.edit,
            to: `/paquetes/${bundle.id}/editar`,
          }
        : { key: 'view', label: 'Ver', icon: ACTION_ICONS.view, to: `/paquetes/${bundle.id}` },
    ];
    if (catalog.levels.length > 1) {
      actions.push({
        key: 'margin',
        label: 'Ver con otro margen',
        icon: ACTION_ICONS.margin,
        onSelect: () => setPreview({ bundle, open: true }),
      });
    }
    if (can('bundles', 'deactivate')) {
      actions.push({
        key: 'toggle',
        label: bundle.is_active ? 'Desactivar' : 'Reactivar',
        icon: bundle.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: bundle.is_active ? 'danger' : undefined,
        onSelect: () =>
          setPending({
            kind: 'one',
            bundle,
            change: bundle.is_active ? 'deactivate' : 'reactivate',
            open: true,
          }),
      });
    }
    return actions;
  };

  return (
    <>
      <PageHeader
        title={can('products', 'view') ? 'Productos' : 'Paquetes'}
        actions={
          can('bundles', 'create') ? (
            <Button
              component={RouterLink}
              to="/paquetes/nuevo"
              variant="contained"
              startIcon={<AddIcon />}
            >
              Nuevo paquete
            </Button>
          ) : null
        }
      />
      <CatalogTabs current="bundles" />

      <FilterBar
        searchLabel="Buscar por nombre, código o componente"
        search={list.text}
        onSearchChange={list.setText}
        collapsed={isMobile && !filtersOpen}
        beside={
          isMobile ? (
            <>
              <Button
                variant={filtersOpen ? 'contained' : 'outlined'}
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(!filtersOpen)}
                sx={{ minHeight: 48 }}
              >
                Filtros
              </Button>
              {canSelect ? (
                <Button
                  variant={choosing ? 'contained' : 'outlined'}
                  aria-pressed={choosing}
                  onClick={() => {
                    setChoosing(!choosing);
                    setSelected(new Set());
                  }}
                  sx={{ minHeight: 48 }}
                >
                  Elegir
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {catalog.fields}
      </FilterBar>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {total === undefined ? ' ' : `${total === 1 ? '1 resultado' : `${total} resultados`}`}
        {catalog.levelName ? ` · Precios desde el costo con «${catalog.levelName}».` : ''}
      </Typography>

      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      ) : null}
      {notice ? (
        <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      ) : null}

      {picked.length > 0 && canSelect ? (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}
          >
            <Typography sx={{ fontWeight: 600, mr: 1 }}>
              {picked.length === 1 ? '1 seleccionado' : `${picked.length} seleccionados`}
            </Typography>
            <Button
              variant="outlined"
              color="error"
              disabled={bulk.isPending}
              onClick={() => setPending({ kind: 'many', change: 'deactivate', open: true })}
            >
              Desactivar
            </Button>
            <Button
              variant="outlined"
              disabled={bulk.isPending}
              onClick={() => setPending({ kind: 'many', change: 'reactivate', open: true })}
            >
              Reactivar
            </Button>
          </Stack>
        </Paper>
      ) : null}

      <DataList
        label="Lista de paquetes"
        noun="paquetes"
        columns={columnsFor({ currencyCode, match: list.query, grouped: catalog.grouped })}
        rows={bundles.data?.data}
        error={bundles.isError ? problemMessage(bundles.error) : null}
        getRowId={(bundle) => bundle.id}
        getRowName={(bundle) => bundle.name}
        getActions={actionsFor}
        rowSx={(bundle) => (bundle.is_active ? undefined : INACTIVE_ROW)}
        selection={
          canSelect && (!isMobile || choosing) ? { selected, onChange: setSelected } : undefined
        }
        groupBy={
          catalog.grouped
            ? (bundle) => ({
                key: `${bundle.area.id}/${bundle.group.id}`,
                title: bundle.area.name,
                subtitle: bundle.group.name,
              })
            : undefined
        }
        renderCard={(bundle, slots) => (
          <BundleCard
            bundle={bundle}
            currencyCode={currencyCode}
            match={list.query}
            slots={slots}
          />
        )}
        pagination={{
          page: list.page,
          perPage: catalog.perPage,
          total: total ?? 0,
          onPageChange: list.setPage,
          perPageOptions: PER_PAGE_OPTIONS,
          onPerPageChange: catalog.changePerPage,
        }}
      />

      <ConfirmDialog
        open={pending?.open === true}
        {...confirmCopy(pending, picked.length)}
        busy={setActive.isPending || bulk.isPending}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(pending && { ...pending, open: false })}
      />
      <MarginPreviewDialog
        record={preview?.bundle ?? null}
        kind="bundle"
        levels={catalog.levels}
        currencyCode={currencyCode}
        open={preview?.open === true}
        onClose={() => setPreview(preview && { ...preview, open: false })}
      />
    </>
  );
}

interface Copy {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
}

/** What each change says before it runs: nothing that writes to the database starts from a single click. */
function confirmCopy(pending: PendingAction | null, count: number): Copy {
  const change = pending?.change ?? 'deactivate';
  if (pending?.kind === 'many') {
    const these = count === 1 ? '1 paquete' : `${count} paquetes`;
    return {
      deactivate: {
        title: 'Desactivar paquetes',
        message: `Se desactivarán ${these}. Sus datos y componentes se conservan y se pueden reactivar.`,
        confirmLabel: 'Desactivar',
        destructive: true,
      },
      reactivate: {
        title: 'Reactivar paquetes',
        message: `Se reactivarán ${these}. Los que tienen el grupo desactivado no se podrán reactivar.`,
        confirmLabel: 'Reactivar',
        destructive: false,
      },
    }[change];
  }
  const name = `«${pending?.kind === 'one' ? pending.bundle.name : ''}»`;
  return {
    deactivate: {
      title: 'Desactivar paquete',
      message: `${name} dejará de aparecer en las listas activas. Sus datos y componentes se conservan.`,
      confirmLabel: 'Desactivar',
      destructive: true,
    },
    reactivate: {
      title: 'Reactivar paquete',
      message: `${name} volverá a aparecer en las listas activas.`,
      confirmLabel: 'Reactivar',
      destructive: false,
    },
  }[change];
}

/** Why a reactivation failed: the group of the bundle is the usual reason, and says what to do about it. */
function reactivationFailure(error: unknown, pending: PendingAction): string {
  if (error instanceof ApiError && error.fieldErrors.group_id === 'parent_inactive') {
    const name = pending.kind === 'one' ? `«${pending.bundle.name}»` : 'los paquetes';
    return `No se puede reactivar ${name}: su grupo está desactivado. Reactiva primero el grupo.`;
  }
  return problemMessage(error);
}

function componentCount(bundle: Bundle): string {
  return bundle.component_count === 1 ? '1 componente' : `${bundle.component_count} componentes`;
}

/** The line under a bundle name in the table: brand and how many components it has. */
function bundleSubline(bundle: Bundle): string {
  return [bundle.brand?.name, componentCount(bundle)].filter(Boolean).join(' · ');
}

/** «Contiene: …» when the search matched a component and not the bundle itself. */
function ContainsLine({ bundle, match }: { bundle: Bundle; match: string | undefined }) {
  if (!bundle.matched_component) {
    return null;
  }
  return (
    <Typography component="div" variant="body2" color="text.secondary">
      Contiene: <Highlight text={bundle.matched_component.name} match={match} />
    </Typography>
  );
}

/** What is wrong with the cost of a bundle: a stale component, or one that is no longer in use. */
function CostAlerts({ bundle, compact = false }: { bundle: Bundle; compact?: boolean }) {
  return (
    <>
      {bundle.cost_is_stale ? (
        <StatusBadge tone="warning" label={compact ? 'Costo desactualizado' : 'Desactualizado'} />
      ) : null}
      {bundle.has_inactive_components ? (
        <StatusBadge
          tone="warning"
          label={
            bundle.inactive_component_count === 1
              ? 'Tiene 1 componente inactivo'
              : `Tiene ${bundle.inactive_component_count} componentes inactivos`
          }
        />
      ) : null}
    </>
  );
}

function suppliersOf(bundle: Bundle): string {
  return bundle.suppliers.map((supplier) => supplier.name).join(', ');
}

/** The card of a phone: code and brand with the ⋮ menu on top; the name; suppliers and group, and the price. */
function BundleCard({
  bundle,
  currencyCode,
  match,
  slots,
}: {
  bundle: Bundle;
  currencyCode: string;
  match: string | undefined;
  slots: { select: ReactNode; menu: ReactNode };
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ px: 1.5, py: 1, ...(bundle.is_active ? {} : INACTIVE_CARD) }}
      data-testid="bundle-card"
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        {slots.select}
        <CodeChip code={bundle.code} match={match} />
        {bundle.is_active ? null : <InactiveTag />}
        {/* The count stays whole whatever the length of the rest: it is the one fact the card cannot lose. */}
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ flexGrow: 1, minWidth: 0, flexShrink: 0 }}
        >
          {componentCount(bundle)}
        </Typography>
        {slots.menu}
      </Stack>
      <Typography sx={{ fontWeight: 600, mt: 0.25 }}>
        <Highlight text={bundle.name} match={match} />
      </Typography>
      <ContainsLine bundle={bundle} match={match} />
      <Box sx={{ mt: 0.25 }}>
        <MetaLine parts={[bundle.brand?.name, suppliersOf(bundle), bundle.group.name]} />
      </Box>
      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        <CostAlerts bundle={bundle} compact />
      </Stack>
      {/* The price has its own row, against the right edge, so it never competes with the text above for width. */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
        <PriceBlock
          priceWithVat={bundle.price_with_vat}
          priceWithoutVat={bundle.price_without_vat}
          currencyCode={currencyCode}
        />
      </Box>
    </Paper>
  );
}

function columnsFor({
  currencyCode,
  match,
  grouped,
}: {
  currencyCode: string;
  match: string | undefined;
  grouped: boolean;
}): DataColumn<Bundle>[] {
  const columns: DataColumn<Bundle>[] = [
    {
      id: 'code',
      header: 'Código',
      mobile: 'subtitle',
      nowrap: true,
      render: (bundle) => (
        <>
          <CodeChip code={bundle.code} match={match} />
          {bundle.is_active ? null : (
            <Box sx={{ mt: 0.5 }}>
              <InactiveTag />
            </Box>
          )}
        </>
      ),
    },
    {
      id: 'name',
      header: 'Paquete',
      mobile: 'title',
      minWidth: 220,
      render: (bundle) => (
        <Box>
          <Typography component="div" sx={{ fontWeight: 600, color: 'text.primary' }}>
            <Highlight text={bundle.name} match={match} />
          </Typography>
          <Typography component="div" variant="body2" color="text.secondary">
            {bundleSubline(bundle)}
          </Typography>
          <ContainsLine bundle={bundle} match={match} />
        </Box>
      ),
    },
    {
      id: 'suppliers',
      header: 'Proveedores',
      mobile: 'meta',
      minWidth: 140,
      render: suppliersOf,
    },
  ];
  if (!grouped) {
    columns.push({
      id: 'group',
      header: 'Grupo',
      mobile: 'hidden',
      minWidth: 140,
      render: (bundle) => (
        <>
          {bundle.group.name}
          <Typography component="div" variant="body2" color="text.secondary">
            {bundle.area.name}
          </Typography>
        </>
      ),
    });
  }
  columns.push(
    {
      id: 'cost',
      header: 'Costo',
      align: 'right',
      mobile: 'hidden',
      render: (bundle) => (
        <Stack spacing={0.25} sx={{ alignItems: 'flex-end', fontVariantNumeric: 'tabular-nums' }}>
          <span>{formatMoney(bundle.cost, currencyCode)}</span>
          <CostAlerts bundle={bundle} />
        </Stack>
      ),
    },
    {
      id: 'price',
      header: 'Precio con IVA',
      align: 'right',
      mobile: 'hidden',
      nowrap: true,
      render: (bundle) => (
        <PriceBlock
          priceWithVat={bundle.price_with_vat}
          priceWithoutVat={bundle.price_without_vat}
          currencyCode={currencyCode}
        />
      ),
    },
  );
  return columns;
}
