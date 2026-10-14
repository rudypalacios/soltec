import { Box, FormControlLabel, MenuItem, Switch, TextField } from '@mui/material';
import { useState } from 'react';
import { SearchableSelect } from '../../components/SearchableSelect';
import { StatusFilter } from '../../components/StatusFilter';
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

/** The width of a filter that is not a plain select, as `FilterBar` gives them. */
const FILTER_FIELD = { flex: { xs: '1 1 140px', sm: '0 0 200px' } } as const;

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

  return {
    query,
    supplier,
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
              list.resetPage();
            }}
          />
        </Box>
        <Box sx={FILTER_FIELD}>
          <SearchableSelect
            label="Grupo"
            choices={(groups.data?.data ?? [])
              .filter((group) => areaId === ALL || group.area_id === areaId)
              .map((group) => ({ id: group.id, label: group.name }))}
            value={groupId}
            onChange={narrow(setGroupId)}
          />
        </Box>
        <Box sx={FILTER_FIELD}>
          <SearchableSelect
            label="Marca"
            choices={(brands.data?.data ?? []).map((brand) => ({
              id: brand.id,
              label: brand.name,
            }))}
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
    ),
  };
}
