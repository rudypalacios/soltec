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
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { ActiveBadge, StatusBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { useListFilters } from '../../components/useListFilters';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { formatAmount } from './productFormat';
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
const PER_PAGE = 25;

/** A change waiting for the person to confirm it (`open` false while the dialog fades out). */
type PendingAction =
  | { kind: 'one'; product: Product; activate: boolean; open: boolean }
  | { kind: 'many'; open: boolean }
  | { kind: 'supplier'; open: boolean };
const ALL = '';

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
    per_page: PER_PAGE,
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
  ]);
  useEffect(() => setSelected(new Set()), [rowsKey]);

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
        await setActive.mutateAsync({
          productId: pending.product.id,
          active: pending.activate,
        });
      } else if (pending.kind === 'many') {
        await run({ kind: 'deactivate', ids: [...selected] }, 'desactivaron');
      } else if (supplier) {
        await run({ kind: 'reactivate-supplier', supplierId: supplier.id }, 'reactivaron');
      }
    } catch (error) {
      setFailure(reactivationFailure(error, pending));
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const review = async (product: Product) => {
    setFailure(null);
    setNotice(null);
    try {
      await confirmCost.mutateAsync(product.id);
      setNotice(`Se marcó el costo de «${product.name}» como revisado.`);
    } catch (error) {
      setFailure(problemMessage(error));
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
        onSelect: () => void review(product),
      });
    }
    if (can('products', 'deactivate')) {
      actions.push({
        key: 'toggle',
        label: product.is_active ? 'Desactivar' : 'Reactivar',
        icon: product.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: product.is_active ? 'danger' : undefined,
        // Reactivating asks nothing: it only brings it back. Deactivating asks.
        onSelect: product.is_active
          ? () => setPending({ kind: 'one', product, activate: false, open: true })
          : () => void reactivateOne(product),
      });
    }
    return actions;
  };

  const reactivateOne = async (product: Product) => {
    setFailure(null);
    setNotice(null);
    try {
      await setActive.mutateAsync({ productId: product.id, active: true });
    } catch (error) {
      setFailure(reactivationFailure(error, { kind: 'one', product, activate: true, open: false }));
    }
  };

  const picked = [...selected];
  const canSweepSupplier =
    supplier !== null && can('products', 'deactivate') && filters.status !== 'active';

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
      >
        <StatusFilter value={filters.status} onChange={filters.setStatus} />
        <Box sx={{ flex: { xs: '1 1 100%', sm: '0 0 240px' } }}>
          <SupplierSelect value={supplier} onChange={narrow(setSupplier)} />
        </Box>
        <TextField
          select
          label="Área"
          value={areaId}
          onChange={(event) => {
            setAreaId(event.target.value);
            setGroupId(ALL);
            filters.resetPage();
          }}
        >
          <MenuItem value={ALL}>Todas</MenuItem>
          {(areas.data?.data ?? []).map((area) => (
            <MenuItem key={area.id} value={area.id}>
              {area.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Grupo"
          value={groupId}
          onChange={(event) => narrow(setGroupId)(event.target.value)}
        >
          <MenuItem value={ALL}>Todos</MenuItem>
          {groupsOfArea.map((group) => (
            <MenuItem key={group.id} value={group.id}>
              {group.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Marca"
          value={brandId}
          onChange={(event) => narrow(setBrandId)(event.target.value)}
        >
          <MenuItem value={ALL}>Todas</MenuItem>
          {(brands.data?.data ?? []).map((brand) => (
            <MenuItem key={brand.id} value={brand.id}>
              {brand.name}
            </MenuItem>
          ))}
        </TextField>
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
        <FormControlLabel
          control={
            <Switch
              checked={staleOnly}
              onChange={(event) => narrow(setStaleOnly)(event.target.checked)}
            />
          }
          label="Solo costo desactualizado"
        />
      </FilterBar>

      {levelName ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Los precios se calculan desde el costo con «{levelName}».
        </Typography>
      ) : null}

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
                onClick={() => void run({ kind: 'confirm-cost', ids: picked }, 'marcó el costo de')}
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
                  onClick={() => setPending({ kind: 'many', open: true })}
                >
                  Desactivar
                </Button>
                <Button
                  variant="outlined"
                  disabled={bulk.isPending}
                  onClick={() => void run({ kind: 'reactivate', ids: picked }, 'reactivaron')}
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
        columns={COLUMNS}
        rows={products.data?.data}
        error={products.isError ? problemMessage(products.error) : null}
        getRowId={(product) => product.id}
        getRowName={(product) => product.name}
        getActions={actionsFor}
        selection={
          can('products', 'edit') || can('products', 'deactivate')
            ? { selected, onChange: setSelected }
            : undefined
        }
        pagination={{
          page: filters.page,
          perPage: PER_PAGE,
          total: products.data?.meta.total ?? 0,
          onPageChange: filters.setPage,
        }}
      />

      <ConfirmDialog
        open={pending?.open === true}
        title={confirmTitle(pending)}
        message={confirmMessage(pending, picked.length, supplier)}
        confirmLabel={pending?.kind === 'supplier' ? 'Reactivar' : 'Desactivar'}
        destructive={pending?.kind !== 'supplier'}
        busy={setActive.isPending || bulk.isPending}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(pending && { ...pending, open: false })}
      />
    </>
  );
}

function confirmTitle(pending: PendingAction | null): string {
  if (pending?.kind === 'supplier') {
    return 'Reactivar los productos del proveedor';
  }
  return pending?.kind === 'many' ? 'Desactivar productos' : 'Desactivar producto';
}

function confirmMessage(
  pending: PendingAction | null,
  count: number,
  supplier: SupplierChoice | null,
): string {
  if (pending?.kind === 'supplier') {
    return `Se reactivarán los productos que «${supplier?.name ?? ''}» desactivó al desactivarse. Los que alguien desactivó a mano se quedan como están.`;
  }
  if (pending?.kind === 'many') {
    return `${count === 1 ? 'Se desactivará 1 producto' : `Se desactivarán ${count} productos`}. Sus datos se conservan y se pueden reactivar.`;
  }
  return `«${pending?.kind === 'one' ? pending.product.name : ''}» dejará de aparecer en las listas activas. Sus datos se conservan.`;
}

/** Why a reactivation failed: the supplier of the product is the usual reason, and says what to do about it. */
function reactivationFailure(error: unknown, pending: PendingAction): string {
  if (error instanceof ApiError && error.fieldErrors.supplier_id === 'parent_inactive') {
    const name = pending.kind === 'one' ? `«${pending.product.name}»` : 'los productos';
    return `No se puede reactivar ${name}: su proveedor está desactivado. Reactiva primero al proveedor.`;
  }
  return problemMessage(error);
}

const COLUMNS: DataColumn<Product>[] = [
  {
    id: 'name',
    header: 'Nombre',
    mobile: 'title',
    minWidth: 200,
    render: (product) => product.name,
  },
  {
    id: 'code',
    header: 'Código',
    mobile: 'subtitle',
    nowrap: true,
    render: (product) => product.code,
  },
  {
    id: 'supplier',
    header: 'Proveedor',
    mobile: 'meta',
    minWidth: 140,
    render: (product) => product.supplier.name,
  },
  {
    id: 'group',
    header: 'Área y grupo',
    mobile: 'hidden',
    minWidth: 140,
    render: (product) => `${product.area.name} · ${product.group.name}`,
  },
  {
    id: 'unit',
    header: 'Unidad',
    mobile: 'hidden',
    nowrap: true,
    render: (product) => product.unit.name,
  },
  {
    id: 'cost',
    header: 'Costo con IVA',
    mobile: 'meta',
    render: (product) => (
      <Stack spacing={0.25}>
        <span>{formatAmount(product.cost)}</span>
        {product.cost_is_stale ? <StatusBadge tone="warning" label="Costo desactualizado" /> : null}
      </Stack>
    ),
  },
  {
    id: 'price',
    header: 'Precio con IVA',
    mobile: 'meta',
    nowrap: true,
    render: (product) => formatAmount(product.price_with_vat),
  },
  {
    id: 'status',
    header: 'Estado',
    mobile: 'badge',
    nowrap: true,
    render: (product) => <ActiveBadge active={product.is_active} />,
  },
];
