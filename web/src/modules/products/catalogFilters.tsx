import { FormControlLabel, MenuItem, Switch, TextField } from '@mui/material';
import { useState } from 'react';
import type { ActiveFilter } from '../../components/FilterBar';
import { SearchableSelect } from '../../components/SearchableSelect';
import { StatusFilter, type StatusValue } from '../../components/StatusFilter';
import type { useListFilters } from '../../components/useListFilters';
import { SupplierSelect, type SupplierChoice } from './SupplierSelect';
import {
  useAreaOptions,
  useBrandOptions,
  useGroupOptions,
  useMarginLevelOptions,
} from './useProducts';

export const ALL = '';
export const PER_PAGE_OPTIONS = [25, 50, 100];
const SORTS = [
  { value: 'name', label: 'Nombre' },
  { value: 'code', label: 'Código' },
  { value: 'cost', label: 'Costo, de menor a mayor' },
  { value: 'cost_review', label: 'Costo revisado hace más tiempo' },
] as const;
type Sort = (typeof SORTS)[number]['value'];

const STATUS_LABELS: Record<StatusValue, string> = {
  active: 'Activos',
  inactive: 'Inactivos',
  all: 'Todos',
};

/**
 * The filters products and bundles share: supplier, area, group, brand, margin level, order, stale cost and grouping.
 * The page keeps the search text, the status and the page (`list`) and adds what is its own.
 */
export function useCatalogFilters(list: ReturnType<typeof useListFilters>) {
  const [supplier, setSupplier] = useState<SupplierChoice | null>(null);
  const [areaId, setAreaId] = useState(ALL);
  const [groupId, setGroupId] = useState(ALL);
  const [brandId, setBrandId] = useState(ALL);
  const [staleOnly, setStaleOnly] = useState(false);
  const [levelId, setLevelId] = useState(ALL);
  const [sort, setSort] = useState<Sort>('name');
  const [grouped, setGrouped] = useState(false);
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0] ?? 25);

  const areas = useAreaOptions();
  const groups = useGroupOptions();
  const brands = useBrandOptions();
  const levels = useMarginLevelOptions();

  /** A filter that narrows the list sends it back to the first page. */
  const narrow =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      list.resetPage();
    };

  const query = {
    q: list.query,
    status: list.status,
    page: list.page + 1,
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

  const nameIn = (list: { id: string; name: string }[] | undefined, id: string) =>
    list?.find((item) => item.id === id)?.name ?? '…';
  // What is not at its default, as chips under the bar. The order and the margin are views of the list rather than
  // narrowing filters, but they are hidden in the panel too, so they show up the same way.
  const active: ActiveFilter[] = [
    list.status !== 'active' && {
      id: 'status',
      label: 'Estado',
      value: STATUS_LABELS[list.status],
      onClear: () => list.setStatus('active'),
    },
    supplier !== null && {
      id: 'supplier',
      label: 'Proveedor',
      value: supplier.name,
      onClear: () => narrow(setSupplier)(null),
    },
    areaId !== ALL && {
      id: 'area',
      label: 'Área',
      value: nameIn(areas.data?.data, areaId),
      onClear: () => {
        setAreaId(ALL);
        setGroupId(ALL);
        list.resetPage();
      },
    },
    groupId !== ALL && {
      id: 'group',
      label: 'Grupo',
      value: nameIn(groups.data?.data, groupId),
      onClear: () => narrow(setGroupId)(ALL),
    },
    brandId !== ALL && {
      id: 'brand',
      label: 'Marca',
      value: nameIn(brands.data?.data, brandId),
      onClear: () => narrow(setBrandId)(ALL),
    },
    levelId !== ALL && {
      id: 'margin',
      label: 'Margen',
      value: nameIn(levels.data?.data, levelId),
      onClear: () => setLevelId(ALL),
    },
    sort !== 'name' && {
      id: 'sort',
      label: 'Orden',
      value: SORTS.find((option) => option.value === sort)?.label ?? sort,
      onClear: () => narrow(setSort)('name'),
    },
    staleOnly && {
      id: 'stale',
      label: 'Costo',
      value: 'desactualizado',
      onClear: () => narrow(setStaleOnly)(false),
    },
    grouped && {
      id: 'grouped',
      label: 'Vista',
      value: 'agrupada por área y grupo',
      onClear: () => narrow(setGrouped)(false),
    },
  ].filter((filter): filter is ActiveFilter => filter !== false);

  return {
    query,
    supplier,
    active,
    clearAll: () => {
      list.setStatus('active');
      setSupplier(null);
      setAreaId(ALL);
      setGroupId(ALL);
      setBrandId(ALL);
      setLevelId(ALL);
      setSort('name');
      setStaleOnly(false);
      setGrouped(false);
    },
    grouped,
    perPage,
    levels: levels.data?.data ?? [],
    levelName:
      levels.data?.data.find((level) => (levelId === ALL ? level.is_default : level.id === levelId))
        ?.name ?? null,
    /** A selection belongs to the rows it was made on: another page or another filter starts over. */
    rowsKey: JSON.stringify([
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
    ]),
    changePerPage: (next: number) => {
      setPerPage(next);
      list.resetPage();
    },
    fields: (
      <>
        <StatusFilter value={list.status} onChange={list.setStatus} />
        <SupplierSelect value={supplier} onChange={narrow(setSupplier)} />
        <SearchableSelect
          label="Área"
          choices={(areas.data?.data ?? []).map((area) => ({ id: area.id, label: area.name }))}
          value={areaId}
          onChange={(next) => {
            setAreaId(next);
            setGroupId(ALL);
            list.resetPage();
          }}
        />
        <SearchableSelect
          label="Grupo"
          choices={(groups.data?.data ?? [])
            .filter((group) => areaId === ALL || group.area_id === areaId)
            .map((group) => ({ id: group.id, label: group.name }))}
          value={groupId}
          onChange={narrow(setGroupId)}
        />
        <SearchableSelect
          label="Marca"
          choices={(brands.data?.data ?? []).map((brand) => ({
            id: brand.id,
            label: brand.name,
          }))}
          value={brandId}
          onChange={narrow(setBrandId)}
        />
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
    ),
  };
}
