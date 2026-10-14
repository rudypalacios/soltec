import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { ApiError, type components } from '@soltec/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { SearchableSelect } from '../../components/SearchableSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { useListFilters } from '../../components/useListFilters';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { Highlight } from '../../components/Highlight';
import { useIsMobile } from '../../components/useIsMobile';
import { color } from '../../theme/tokens';
import { CodeChip } from './CodeChip';
import { MarginPreviewDialog } from './MarginPreviewDialog';
import { formatMoney } from './productFormat';
import { SupplierSelect, type SupplierChoice } from './SupplierSelect';
import {
  useAreaOptions,
  useBrandOptions,
  useBulkProducts,
  useConfirmProductCost,
  useGroupOptions,
  useMarginLevelOptions,
  useProducts,
  useSetProductActive,
  type BulkAction,
  type BulkResult,
} from './useProducts';

type Product = components['schemas']['Product'];
const PER_PAGE_OPTIONS = [25, 50, 100];
const SORTS = [
  { value: 'name', label: 'Nombre' },
  { value: 'code', label: 'Código' },
  { value: 'cost', label: 'Costo, de menor a mayor' },
  { value: 'cost_review', label: 'Costo revisado hace más tiempo' },
] as const;
type Sort = (typeof SORTS)[number]['value'];

/** A change waiting for the person to confirm it (`open` false while the dialog fades out). */
type Change = 'deactivate' | 'reactivate' | 'review';
type PendingAction =
  | { kind: 'one'; product: Product; change: Change; open: boolean }
  | { kind: 'many'; change: Change; open: boolean }
  | { kind: 'supplier'; open: boolean };
const ALL = '';
/** The width of a filter that is not a plain select, as `FilterBar` gives them. */
const FILTER_FIELD = { flex: { xs: '1 1 140px', sm: '0 0 200px' } } as const;

/** What a bulk action did, in a sentence: «Se desactivaron 3 productos. 1 ya estaba así.» */
export function bulkSummary(verb: string, result: BulkResult): string {
  const plural = (count: number) => (count === 1 ? '1 producto' : `${count} productos`);
  const parts = [`Se ${verb} ${plural(result.affected)}.`];
  if (result.unchanged > 0) {
    parts.push(
      `${plural(result.unchanged)} ya estaba${result.unchanged === 1 ? '' : 'n'} así o no aplicaba.`,
    );
  }
  if (result.blocked > 0) {
    parts.push(
      `${plural(result.blocked)} no se pudo${result.blocked === 1 ? '' : 'ieron'} reactivar porque su proveedor está desactivado.`,
    );
  }
  return parts.join(' ');
}

/** `/productos`: the catalog with its costs and the prices derived from them. */
export function ProductsPage() {
  const can = useCan();
  const filters = useListFilters();
  const [supplier, setSupplier] = useState<SupplierChoice | null>(null);
  const [areaId, setAreaId] = useState(ALL);
  const [groupId, setGroupId] = useState(ALL);
  const [brandId, setBrandId] = useState(ALL);
  const [staleOnly, setStaleOnly] = useState(false);
  const [levelId, setLevelId] = useState(ALL);
  const [sort, setSort] = useState<Sort>('name');
  const [grouped, setGrouped] = useState(false);
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0] ?? 25);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [preview, setPreview] = useState<{ product: Product; open: boolean } | null>(null);
  const isMobile = useIsMobile();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const areas = useAreaOptions();
  const groups = useGroupOptions();
  const brands = useBrandOptions();
  const levels = useMarginLevelOptions();
  const groupsOfArea = (groups.data?.data ?? []).filter(
    (group) => areaId === ALL || group.area_id === areaId,
  );

  const query = {
    q: filters.query,
    status: filters.status,
    page: filters.page + 1,
    per_page: perPage,
    sort,
    ...(grouped ? { grouped: 'true' as const } : {}),
    ...(supplier ? { supplier_id: supplier.id } : {}),
    ...(areaId !== ALL ? { area_id: areaId } : {}),
    ...(groupId !== ALL ? { group_id: groupId } : {}),
    ...(brandId !== ALL ? { brand_id: brandId } : {}),
    ...(staleOnly ? { stale: 'true' as const } : {}),
    ...(levelId !== ALL ? { margin_level_id: levelId } : {}),
  };
  const products = useProducts(query);
  const setActive = useSetProductActive();
  const confirmCost = useConfirmProductCost();
  const bulk = useBulkProducts();

  // A selection belongs to the rows it was made on: another page or another filter starts over.
  const rowsKey = JSON.stringify([
    query.q,
    query.status,
    query.page,
    supplier?.id,
    areaId,
    groupId,
    brandId,
    staleOnly,
    sort,
    grouped,
    perPage,
  ]);
  useEffect(() => setSelected(new Set()), [rowsKey]);

  const currencyCode = products.data?.meta.currency_code ?? 'GTQ';
  const levelName =
    levels.data?.data.find((level) => (levelId === ALL ? level.is_default : level.id === levelId))
      ?.name ?? null;

  const narrow =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      filters.resetPage();
    };

  const run = async (action: BulkAction, verb: string) => {
    setFailure(null);
    setNotice(null);
    try {
      setNotice(bulkSummary(verb, await bulk.mutateAsync(action)));
      setSelected(new Set());
    } catch (error) {
      setFailure(problemMessage(error));
    }
  };

  const confirmPending = async () => {
    if (!pending) {
      return;
    }
    setFailure(null);
    setNotice(null);
    try {
      if (pending.kind === 'one') {
        const { product, change } = pending;
        if (change === 'review') {
          await confirmCost.mutateAsync(product.id);
          setNotice(`Se marcó el costo de «${product.name}» como revisado.`);
        } else {
          await setActive.mutateAsync({ productId: product.id, active: change === 'reactivate' });
        }
      } else if (pending.kind === 'many') {
        const request: Record<
          Change,
          { kind: 'deactivate' | 'reactivate' | 'confirm-cost'; verb: string }
        > = {
          deactivate: { kind: 'deactivate', verb: 'desactivaron' },
          reactivate: { kind: 'reactivate', verb: 'reactivaron' },
          review: { kind: 'confirm-cost', verb: 'marcó el costo de' },
        };
        const { kind, verb } = request[pending.change];
        await run({ kind, ids: [...selected] }, verb);
      } else if (supplier) {
        await run({ kind: 'reactivate-supplier', supplierId: supplier.id }, 'reactivaron');
      }
    } catch (error) {
      setFailure(reactivationFailure(error, pending));
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const actionsFor = (product: Product): RowAction[] => {
    const actions: RowAction[] = [];
    if (can('products', 'edit')) {
      actions.push({
        key: 'edit',
        label: 'Editar',
        icon: ACTION_ICONS.edit,
        to: `/productos/${product.id}/editar`,
      });
    } else {
      actions.push({
        key: 'view',
        label: 'Ver',
        icon: ACTION_ICONS.view,
        to: `/productos/${product.id}`,
      });
    }
    if (can('products', 'edit') && product.is_active) {
      actions.push({
        key: 'review',
        label: 'Marcar costo como revisado',
        icon: ACTION_ICONS.review,
        onSelect: () => setPending({ kind: 'one', product, change: 'review', open: true }),
      });
    }
    if ((levels.data?.data.length ?? 0) > 1) {
      actions.push({
        key: 'margin',
        label: 'Ver con otro margen',
        icon: ACTION_ICONS.margin,
        onSelect: () => setPreview({ product, open: true }),
      });
    }
    if (can('products', 'deactivate')) {
      actions.push({
        key: 'toggle',
        label: product.is_active ? 'Desactivar' : 'Reactivar',
        icon: product.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: product.is_active ? 'danger' : undefined,
        onSelect: () =>
          setPending({
            kind: 'one',
            product,
            change: product.is_active ? 'deactivate' : 'reactivate',
            open: true,
          }),
      });
    }
    return actions;
  };

  const picked = [...selected];
  const canSweepSupplier =
    supplier !== null && can('products', 'deactivate') && filters.status !== 'active';
  const canSelect = can('products', 'edit') || can('products', 'deactivate');
  const total = products.data?.meta.total;

  const filterFields = (
    <>
      <StatusFilter value={filters.status} onChange={filters.setStatus} />
      <Box sx={{ flex: { xs: '1 1 100%', sm: '0 0 240px' } }}>
        <SupplierSelect value={supplier} onChange={narrow(setSupplier)} />
      </Box>
      <Box sx={FILTER_FIELD}>
        <SearchableSelect
          label="Área"
          choices={(areas.data?.data ?? []).map((area) => ({ id: area.id, label: area.name }))}
          value={areaId}
          onChange={(next) => {
            setAreaId(next);
            setGroupId(ALL);
            filters.resetPage();
          }}
        />
      </Box>
      <Box sx={FILTER_FIELD}>
        <SearchableSelect
          label="Grupo"
          choices={groupsOfArea.map((group) => ({ id: group.id, label: group.name }))}
          value={groupId}
          onChange={narrow(setGroupId)}
        />
      </Box>
      <Box sx={FILTER_FIELD}>
        <SearchableSelect
          label="Marca"
          choices={(brands.data?.data ?? []).map((brand) => ({ id: brand.id, label: brand.name }))}
          value={brandId}
          onChange={narrow(setBrandId)}
        />
      </Box>
      <TextField
        select
        label="Margen"
        value={levelId}
        onChange={(event) => setLevelId(event.target.value)}
      >
        <MenuItem value={ALL}>Por defecto</MenuItem>
        {(levels.data?.data ?? []).map((level) => (
          <MenuItem key={level.id} value={level.id}>
            {level.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Ordenar por"
        value={sort}
        onChange={(event) => narrow(setSort)(event.target.value as Sort)}
      >
        {SORTS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        control={
          <Switch
            checked={staleOnly}
            onChange={(event) => narrow(setStaleOnly)(event.target.checked)}
          />
        }
        label="Solo costo desactualizado"
      />
      <FormControlLabel
        control={
          <Switch
            checked={grouped}
            onChange={(event) => narrow(setGrouped)(event.target.checked)}
          />
        }
        label="Agrupar por área y grupo"
      />
    </>
  );

  return (
    <>
      <PageHeader
        title="Productos"
        actions={
          can('products', 'create') ? (
            <Button
              component={RouterLink}
              to="/productos/nuevo"
              variant="contained"
              startIcon={<AddIcon />}
            >
              Nuevo producto
            </Button>
          ) : null
        }
      />

      <FilterBar
        searchLabel="Buscar por nombre o código"
        search={filters.text}
        onSearchChange={filters.setText}
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
        {filterFields}
      </FilterBar>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {total === undefined ? ' ' : `${total === 1 ? '1 resultado' : `${total} resultados`}`}
        {levelName ? ` · Precios desde el costo con «${levelName}».` : ''}
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

      {picked.length > 0 || canSweepSupplier ? (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}
          >
            {picked.length > 0 ? (
              <Typography sx={{ fontWeight: 600, mr: 1 }}>
                {picked.length === 1 ? '1 seleccionado' : `${picked.length} seleccionados`}
              </Typography>
            ) : null}
            {picked.length > 0 && can('products', 'edit') ? (
              <Button
                variant="outlined"
                disabled={bulk.isPending}
                onClick={() => setPending({ kind: 'many', change: 'review', open: true })}
              >
                Marcar costo como revisado
              </Button>
            ) : null}
            {picked.length > 0 && can('products', 'deactivate') ? (
              <>
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
              </>
            ) : null}
            {canSweepSupplier ? (
              <Button
                variant="outlined"
                disabled={bulk.isPending}
                onClick={() => setPending({ kind: 'supplier', open: true })}
              >
                Reactivar los desactivados por el proveedor
              </Button>
            ) : null}
          </Stack>
        </Paper>
      ) : null}

      <DataList
        label="Lista de productos"
        noun="productos"
        columns={columnsFor({ currencyCode, match: filters.query, grouped })}
        rows={products.data?.data}
        error={products.isError ? problemMessage(products.error) : null}
        getRowId={(product) => product.id}
        getRowName={(product) => product.name}
        getActions={actionsFor}
        rowSx={(product) => (product.is_active ? undefined : INACTIVE_ROW)}
        selection={
          canSelect && (!isMobile || choosing) ? { selected, onChange: setSelected } : undefined
        }
        groupBy={
          grouped
            ? (product) => ({
                key: `${product.area.id}/${product.group.id}`,
                title: product.area.name,
                subtitle: product.group.name,
              })
            : undefined
        }
        renderCard={(product, slots) => (
          <ProductCard
            product={product}
            currencyCode={currencyCode}
            match={filters.query}
            slots={slots}
          />
        )}
        pagination={{
          page: filters.page,
          perPage,
          total: total ?? 0,
          onPageChange: filters.setPage,
          perPageOptions: PER_PAGE_OPTIONS,
          onPerPageChange: (next) => {
            setPerPage(next);
            filters.resetPage();
          },
        }}
      />

      <ConfirmDialog
        open={pending?.open === true}
        {...confirmCopy(pending, picked.length, supplier)}
        busy={setActive.isPending || bulk.isPending || confirmCost.isPending}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(pending && { ...pending, open: false })}
      />
      <MarginPreviewDialog
        product={preview?.product ?? null}
        levels={levels.data?.data ?? []}
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
function confirmCopy(
  pending: PendingAction | null,
  count: number,
  supplier: SupplierChoice | null,
): Copy {
  if (pending?.kind === 'supplier') {
    return {
      title: 'Reactivar los productos del proveedor',
      message: `Se reactivarán los productos que «${supplier?.name ?? ''}» desactivó al desactivarse. Los que alguien desactivó a mano se quedan como están.`,
      confirmLabel: 'Reactivar',
      destructive: false,
    };
  }
  const change = pending?.change ?? 'deactivate';
  if (pending?.kind === 'many') {
    const these = count === 1 ? '1 producto' : `${count} productos`;
    return {
      deactivate: {
        title: 'Desactivar productos',
        message: `Se desactivarán ${these}. Sus datos se conservan y se pueden reactivar.`,
        confirmLabel: 'Desactivar',
        destructive: true,
      },
      reactivate: {
        title: 'Reactivar productos',
        message: `Se reactivarán ${these}. Los que tienen el proveedor desactivado no se podrán reactivar.`,
        confirmLabel: 'Reactivar',
        destructive: false,
      },
      review: {
        title: 'Marcar costo como revisado',
        message: `Se registrará que el costo de ${these} se revisó y sigue siendo correcto. Dejan de figurar como desactualizados.`,
        confirmLabel: 'Marcar como revisado',
        destructive: false,
      },
    }[change];
  }
  const name = `«${pending?.kind === 'one' ? pending.product.name : ''}»`;
  return {
    deactivate: {
      title: 'Desactivar producto',
      message: `${name} dejará de aparecer en las listas activas. Sus datos se conservan.`,
      confirmLabel: 'Desactivar',
      destructive: true,
    },
    reactivate: {
      title: 'Reactivar producto',
      message: `${name} volverá a aparecer en las listas activas.`,
      confirmLabel: 'Reactivar',
      destructive: false,
    },
    review: {
      title: 'Marcar costo como revisado',
      message: `Se registrará que el costo de ${name} se revisó y sigue siendo correcto. Deja de figurar como desactualizado.`,
      confirmLabel: 'Marcar como revisado',
      destructive: false,
    },
  }[change];
}

/** Why a reactivation failed: the supplier of the product is the usual reason, and says what to do about it. */
function reactivationFailure(error: unknown, pending: PendingAction): string {
  if (error instanceof ApiError && error.fieldErrors.supplier_id === 'parent_inactive') {
    const name = pending.kind === 'one' ? `«${pending.product.name}»` : 'los productos';
    return `No se puede reactivar ${name}: su proveedor está desactivado. Reactiva primero al proveedor.`;
  }
  return problemMessage(error);
}

/** The line under a product name: brand and unit. */
function productSubline(product: Product): string {
  return [product.brand?.name, product.unit.name].filter(Boolean).join(' · ');
}

/**
 * How an inactive product shows in the list, with three quiet signals so «Todos» still tells them apart: a stripe at
 * the left, a faint wash and grey text (the name keeps its colour), plus the «Inactivo» tag. Amber stays for the stale
 * cost, so the two never read as the same thing.
 */
const INACTIVE_ROW = {
  bgcolor: color.inactive.wash,
  '& > td': { color: 'text.secondary' },
  '& > td:first-of-type': { boxShadow: `inset 3px 0 0 ${color.inactive.stripe}` },
  '&.MuiTableRow-hover:hover': { bgcolor: color.inactive.wash },
} as const;

function InactiveTag() {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        bgcolor: color.error.tint,
        color: color.error.main,
        fontSize: '0.75rem',
        fontWeight: 600,
        borderRadius: 999,
        px: 1,
        whiteSpace: 'nowrap',
      }}
    >
      Inactivo
    </Box>
  );
}

function PriceBlock({ product, currencyCode }: { product: Product; currencyCode: string }) {
  return (
    <Box sx={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      <Typography component="div" sx={{ fontWeight: 600 }}>
        {formatMoney(product.price_with_vat, currencyCode)}
      </Typography>
      <Typography component="div" variant="body2" color="text.secondary">
        {formatMoney(product.price_without_vat, currencyCode)} sin IVA
      </Typography>
    </Box>
  );
}

/** The card of a phone: code, brand and unit with the ⋮ menu on top; the name; supplier and group, and the price. */
function ProductCard({
  product,
  currencyCode,
  match,
  slots,
}: {
  product: Product;
  currencyCode: string;
  match: string | undefined;
  slots: { select: ReactNode; menu: ReactNode };
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        px: 1.5,
        py: 1,
        ...(product.is_active
          ? {}
          : {
              bgcolor: color.inactive.wash,
              borderLeft: `3px solid ${color.inactive.stripe}`,
            }),
      }}
      data-testid="product-card"
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        {slots.select}
        <CodeChip code={product.code} match={match} />
        {product.is_active ? null : <InactiveTag />}
        <Typography variant="body2" color="text.secondary" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
          {productSubline(product)}
        </Typography>
        {slots.menu}
      </Stack>
      <Typography sx={{ fontWeight: 600, mt: 0.25 }}>
        <Highlight text={product.name} match={match} />
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: 'flex-end', mt: 0.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">
            {product.supplier.name} · {product.group.name}
          </Typography>
          {product.cost_is_stale ? (
            <StatusBadge tone="warning" label="Costo desactualizado" />
          ) : null}
        </Box>
        <PriceBlock product={product} currencyCode={currencyCode} />
      </Stack>
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
}): DataColumn<Product>[] {
  const columns: DataColumn<Product>[] = [
    {
      id: 'code',
      header: 'Código',
      mobile: 'subtitle',
      nowrap: true,
      render: (product) => (
        <>
          <CodeChip code={product.code} match={match} />
          {product.is_active ? null : (
            <Box sx={{ mt: 0.5 }}>
              <InactiveTag />
            </Box>
          )}
        </>
      ),
    },
    {
      id: 'name',
      header: 'Producto',
      mobile: 'title',
      minWidth: 220,
      render: (product) => (
        <Box>
          <Typography component="div" sx={{ fontWeight: 600, color: 'text.primary' }}>
            <Highlight text={product.name} match={match} />
          </Typography>
          <Typography component="div" variant="body2" color="text.secondary">
            {productSubline(product)}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'supplier',
      header: 'Proveedor',
      mobile: 'meta',
      minWidth: 140,
      render: (product) => product.supplier.name,
    },
  ];
  if (!grouped) {
    columns.push({
      id: 'group',
      header: 'Grupo',
      mobile: 'hidden',
      minWidth: 140,
      render: (product) => (
        <>
          {product.group.name}
          <Typography component="div" variant="body2" color="text.secondary">
            {product.area.name}
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
      render: (product) => (
        <Stack spacing={0.25} sx={{ alignItems: 'flex-end', fontVariantNumeric: 'tabular-nums' }}>
          <span>{formatMoney(product.cost, currencyCode)}</span>
          {product.cost_is_stale ? <StatusBadge tone="warning" label="Desactualizado" /> : null}
        </Stack>
      ),
    },
    {
      id: 'price',
      header: 'Precio con IVA',
      align: 'right',
      mobile: 'hidden',
      nowrap: true,
      render: (product) => <PriceBlock product={product} currencyCode={currencyCode} />,
    },
  );
  return columns;
}
