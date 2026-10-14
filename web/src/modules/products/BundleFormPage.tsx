import DeleteOutline from '@mui/icons-material/DeleteOutline';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  ApiError,
  bundleCostPreview,
  isValidQuantity,
  lineCostPreview,
  type components,
} from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { FormActions, FormPage } from '../../components/FormPage';
import { PageHeader } from '../../components/PageHeader';
import { SearchableSelect } from '../../components/SearchableSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { formatMoment } from '../access/formatting';
import { fieldMessage, fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { InactiveTag } from './catalogParts';
import { CodeChip } from './CodeChip';
import { ComponentSearch, type Candidate } from './ComponentSearch';
import { formatMoney } from './productFormat';
import { useBundle, useBundleCurrency, useCreateBundle, useUpdateBundle } from './useBundles';
import { useAreaOptions, useBrandOptions, useGroupOptions } from './useProducts';

type Bundle = components['schemas']['Bundle'];

const NONE = '';
const MAX_ITEMS = 100;

const NOT_AVAILABLE = 'Ya no está activo o no existe. Elige otro.';
const FIELD_MESSAGES = {
  group_id: { not_found: NOT_AVAILABLE },
  brand_id: { not_found: NOT_AVAILABLE },
  items: { required: 'Agrega al menos un componente.', too_many: 'Son demasiados componentes.' },
};
const ITEM_MESSAGES = {
  product_id: {
    not_found: 'Este producto ya no está activo o no existe. Quítalo.',
    duplicate: 'Este producto está repetido.',
  },
  quantity: {
    invalid: 'Escribe una cantidad con hasta 3 decimales, por ejemplo 18 o 4.5.',
    out_of_range: 'La cantidad debe ser mayor que cero.',
  },
};

const SAVE_CONFLICTS = {
  conflict:
    'Otra persona cambió este paquete mientras lo editabas. Recarga la página para ver sus cambios.',
};

/** A component as the form keeps it: what the person edits (the quantity) and what it shows of the product. */
interface Line {
  productId: string;
  code: string;
  name: string;
  unit: string;
  /** The cost of one unit, VAT included, four decimals. */
  cost: string;
  quantity: string;
  /** False for a product deactivated after it went into the bundle. */
  isActive: boolean;
  costIsStale: boolean;
}

function linesOf(bundle: Bundle | null): Line[] {
  return (bundle?.items ?? []).map((item) => ({
    productId: item.product.id,
    code: item.product.code,
    name: item.product.name,
    unit: item.unit.name,
    cost: item.cost,
    quantity: trimQuantity(item.quantity),
    isActive: item.is_active,
    costIsStale: item.cost_is_stale,
  }));
}

/** «18.000» → «18», «4.500» → «4.5»: how people write a quantity. */
function trimQuantity(quantity: string): string {
  return quantity.includes('.') ? quantity.replace(/\.?0+$/, '') : quantity;
}

/** `/paquetes/nuevo`. */
export function BundleCreatePage() {
  return (
    <>
      <PageHeader title="Nuevo paquete" />
      <BundleForm bundle={null} readOnly={false} />
    </>
  );
}

/** `/paquetes/:bundleId/editar`. */
export function BundleEditPage() {
  return <BundlePage readOnly={false} />;
}

/** `/paquetes/:bundleId`: the bundle as whoever may only view the section sees it. */
export function BundleViewPage() {
  return <BundlePage readOnly />;
}

function BundlePage({ readOnly }: { readOnly: boolean }) {
  const { bundleId } = useParams();
  const bundle = useBundle(bundleId);
  const can = useCan();

  if (bundle.isError) {
    return <Alert severity="error">{problemMessage(bundle.error)}</Alert>;
  }
  if (bundle.isPending) {
    return <CircularProgress aria-label="Cargando el paquete" />;
  }
  return (
    <>
      <PageHeader
        title={readOnly ? bundle.data.name : 'Editar paquete'}
        actions={
          can('audit_logs', 'view') ? (
            <Button
              component={RouterLink}
              to={`/auditoria?tipo=bundles&registro=${bundle.data.id}`}
            >
              Ver historial
            </Button>
          ) : null
        }
      />
      {/* A different bundle (or a refetch after saving) restarts the form from the server's copy. */}
      <BundleForm
        key={`${bundle.data.id}:${bundle.data.version}`}
        bundle={bundle.data}
        readOnly={readOnly}
      />
    </>
  );
}

function BundleForm({ bundle, readOnly }: { bundle: Bundle | null; readOnly: boolean }) {
  const navigate = useNavigate();
  const create = useCreateBundle();
  const update = useUpdateBundle(bundle?.id ?? '');
  const areas = useAreaOptions();
  const groups = useGroupOptions();
  const brands = useBrandOptions();
  const currencyCode = useBundleCurrency();

  const [name, setName] = useState(bundle?.name ?? '');
  const [description, setDescription] = useState(bundle?.description ?? '');
  const [groupId, setGroupId] = useState(bundle?.group.id ?? NONE);
  const [brandId, setBrandId] = useState(bundle?.brand?.id ?? NONE);
  const [lines, setLines] = useState<Line[]>(() => linesOf(bundle));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  // What the bundle already has stays on its list even if it was switched off since.
  const areaName = new Map((areas.data?.data ?? []).map((area) => [area.id, area.name]));
  const groupChoices = (groups.data?.data ?? []).map((group) => ({
    id: group.id,
    label: `${areaName.get(group.area_id ?? '') ?? ''} · ${group.name}`,
  }));
  if (bundle && !groupChoices.some((group) => group.id === bundle.group.id)) {
    groupChoices.push({
      id: bundle.group.id,
      label: `${bundle.area.name} · ${bundle.group.name}`,
    });
  }
  const brandChoices = [...(brands.data?.data ?? [])];
  if (bundle?.brand && !brandChoices.some((brand) => brand.id === bundle.brand?.id)) {
    brandChoices.push(bundle.brand);
  }

  const setQuantity = (productId: string, quantity: string) =>
    setLines(lines.map((line) => (line.productId === productId ? { ...line, quantity } : line)));
  const remove = (productId: string) =>
    setLines(lines.filter((line) => line.productId !== productId));
  // A product is in a bundle once: a second pick of the same one (from a list that was still loading) is ignored.
  const add = (candidate: Candidate) =>
    setLines((current) =>
      current.some((line) => line.productId === candidate.id)
        ? current
        : [
            ...current,
            {
              productId: candidate.id,
              code: candidate.code,
              name: candidate.name,
              unit: candidate.unit.name,
              cost: candidate.cost,
              quantity: '1',
              isActive: true,
              costIsStale: false,
            },
          ],
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFailure(null);
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      group_id: groupId,
      brand_id: brandId || null,
      items: lines.map((line) => ({ product_id: line.productId, quantity: line.quantity.trim() })),
    };
    try {
      if (bundle) {
        await update.mutateAsync({ ...body, version: bundle.version });
      } else {
        await create.mutateAsync(body);
      }
      navigate('/paquetes');
    } catch (error) {
      const fields = serverMessages(error);
      setFieldErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error, SAVE_CONFLICTS) : null);
    }
  };

  const invalidQuantity = (line: Line) => line.quantity !== '' && !isValidQuantity(line.quantity);
  const everyQuantityValid = lines.every((line) => isValidQuantity(line.quantity.trim()));
  const preview = bundleCostPreview(lines.map(({ quantity, cost }) => ({ quantity, cost })));
  const hasInactive = lines.some((line) => !line.isActive);

  return (
    <FormPage onSubmit={(event) => void submit(event)} maxWidth={760}>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      {bundle && !bundle.is_active ? (
        <Alert severity="info">
          Este paquete está inactivo. Puedes corregir sus datos; para que vuelva a las listas,
          reactívalo desde la lista.
        </Alert>
      ) : null}

      <TextField
        label="Nombre"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={Boolean(fieldErrors.name)}
        helperText={fieldErrors.name}
        slotProps={{ htmlInput: { maxLength: 190, readOnly } }}
        required={!readOnly}
        autoFocus={!readOnly}
        fullWidth
      />
      <TextField
        label="Descripción"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={Boolean(fieldErrors.description)}
        helperText={fieldErrors.description}
        slotProps={{ htmlInput: { maxLength: 2000, readOnly } }}
        multiline
        minRows={2}
        fullWidth
      />

      <Box>
        <SearchableSelect
          label="Área y grupo"
          choices={groupChoices}
          value={groupId}
          onChange={setGroupId}
          required
          readOnly={readOnly}
          error={fieldErrors.group_id}
        />
      </Box>

      <Box>
        <SearchableSelect
          label="Marca"
          choices={brandChoices.map((brand) => ({ id: brand.id, label: brand.name }))}
          value={brandId}
          onChange={setBrandId}
          readOnly={readOnly}
          error={fieldErrors.brand_id}
        />
      </Box>

      <Stack spacing={1.5} component="section" aria-label="Componentes">
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
          Componentes
        </Typography>
        {hasInactive ? (
          <Alert severity="warning">
            Hay componentes inactivos. El paquete los sigue sumando, pero el Cotizador no lo
            ofrecerá hasta que los quites o los reemplaces.
          </Alert>
        ) : null}
        {readOnly ? null : (
          <ComponentSearch
            exclude={lines.map((line) => line.productId)}
            currencyCode={currencyCode}
            onPick={add}
            disabled={lines.length >= MAX_ITEMS}
            error={fieldErrors.items}
          />
        )}
        {lines.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Todavía no tiene componentes.
          </Typography>
        ) : (
          <Stack spacing={1} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {lines.map((line, position) => (
              <LineRow
                key={line.productId}
                line={line}
                currencyCode={currencyCode}
                readOnly={readOnly}
                error={
                  fieldErrors[`items.${position}.quantity`] ??
                  fieldErrors[`items.${position}.product_id`] ??
                  (invalidQuantity(line) ? ITEM_MESSAGES.quantity.invalid : undefined)
                }
                onQuantity={(quantity) => setQuantity(line.productId, quantity)}
                onRemove={() => remove(line.productId)}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack spacing={0.5}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography sx={{ fontWeight: 600 }}>Costo del paquete</Typography>
            <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(readOnly && bundle ? bundle.cost : preview, currencyCode)}
            </Typography>
          </Stack>
          {bundle ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Costo más antiguo revisado el {formatMoment(bundle.cost_updated_at)}.
              </Typography>
              {bundle.cost_is_stale ? (
                <StatusBadge tone="warning" label="Costo desactualizado" />
              ) : null}
              <Typography variant="body2" color="text.secondary">
                Precio con IVA: {formatMoney(bundle.price_with_vat, currencyCode)} con «
                {bundle.margin_level.name}».
              </Typography>
            </>
          ) : null}
          <Typography variant="caption" color="text.secondary">
            {readOnly
              ? 'Se calcula con los costos actuales de los componentes; no se guarda.'
              : 'Es una vista previa con los costos actuales. El servidor calcula el costo y el precio al guardar; nada de esto se guarda.'}
          </Typography>
        </Stack>
      </Paper>

      <FormActions>
        <Button component={RouterLink} to="/paquetes" variant="outlined" color="inherit">
          {readOnly ? 'Volver' : 'Cancelar'}
        </Button>
        {readOnly ? null : (
          <Button
            type="submit"
            variant="contained"
            disabled={
              create.isPending ||
              update.isPending ||
              !name.trim() ||
              lines.length === 0 ||
              !everyQuantityValid
            }
          >
            Guardar
          </Button>
        )}
      </FormActions>
    </FormPage>
  );
}

/**
 * The field errors of a failed save in Spanish. The ones of a component come as `items.N.quantity` and
 * `items.N.product_id`, so their messages are looked up by the last part of the path.
 */
function serverMessages(error: unknown): Record<string, string> {
  const messages = fieldMessages(error, FIELD_MESSAGES);
  if (error instanceof ApiError) {
    for (const [field, code] of Object.entries(error.fieldErrors)) {
      const item = /^items\.\d+\.(product_id|quantity)$/.exec(field);
      if (item?.[1] === 'product_id' || item?.[1] === 'quantity') {
        messages[field] = fieldMessage(code, ITEM_MESSAGES[item[1]]);
      }
    }
  }
  return messages;
}

function LineRow({
  line,
  currencyCode,
  readOnly,
  error,
  onQuantity,
  onRemove,
}: {
  line: Line;
  currencyCode: string;
  readOnly: boolean;
  error: string | undefined;
  onQuantity: (quantity: string) => void;
  onRemove: () => void;
}) {
  const lineCost = lineCostPreview({ quantity: line.quantity, cost: line.cost });
  return (
    <Paper
      component="li"
      variant="outlined"
      sx={{ p: 1.5, ...(line.isActive ? {} : { opacity: 0.85 }) }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <CodeChip code={line.code} />
          {line.isActive ? null : <InactiveTag />}
          {line.costIsStale ? <StatusBadge tone="warning" label="Costo desactualizado" /> : null}
          <Typography sx={{ fontWeight: 600, flexGrow: 1, minWidth: 0 }}>{line.name}</Typography>
          {readOnly ? null : (
            <IconButton
              aria-label={`Quitar ${line.name}`}
              onClick={onRemove}
              sx={{ width: 44, height: 44 }}
            >
              <DeleteOutline />
            </IconButton>
          )}
        </Stack>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 1, sm: 2 }}
          sx={{ alignItems: { sm: 'flex-start' } }}
        >
          <TextField
            label="Cantidad"
            value={line.quantity}
            onChange={(event) => onQuantity(event.target.value)}
            error={Boolean(error)}
            helperText={error}
            slotProps={{
              htmlInput: { inputMode: 'decimal', maxLength: 13, readOnly },
              input: { endAdornment: <UnitTag unit={line.unit} /> },
            }}
            sx={{ width: { sm: 200 } }}
          />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ pt: { sm: 2 }, fontVariantNumeric: 'tabular-nums' }}
          >
            {formatMoney(line.cost, currencyCode)} por {line.unit.toLowerCase()}
          </Typography>
          <Typography
            sx={{ pt: { sm: 1.75 }, ml: { sm: 'auto' }, fontVariantNumeric: 'tabular-nums' }}
          >
            {formatMoney(lineCost, currencyCode)}
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}

function UnitTag({ unit }: { unit: string }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
      {unit}
    </Typography>
  );
}
