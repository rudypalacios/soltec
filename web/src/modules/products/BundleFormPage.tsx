import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { ApiError, bundleCostPreview, isValidQuantity, type components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { FormActions, FormPage } from '../../components/FormPage';
import { PageHeader } from '../../components/PageHeader';
import { SearchableSelect } from '../../components/SearchableSelect';
import { fieldMessage, fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { ComponentsTable, type Line } from './ComponentsTable';
import { CostSummary, FootnoteMark } from './CostSummary';
import { ComponentSearch, type Candidate } from './ComponentSearch';
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
    <FormPage onSubmit={(event) => void submit(event)} maxWidth={900}>
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
          <ComponentsTable
            lines={lines}
            currencyCode={currencyCode}
            readOnly={readOnly}
            total={readOnly && bundle ? bundle.cost : preview}
            totalLabel={
              <>
                Costo del paquete
                <FootnoteMark n={1} />
              </>
            }
            errorAt={(position) =>
              fieldErrors[`items.${position}.quantity`] ??
              fieldErrors[`items.${position}.product_id`] ??
              (lines[position] && invalidQuantity(lines[position])
                ? ITEM_MESSAGES.quantity.invalid
                : undefined)
            }
            onQuantity={setQuantity}
            onRemove={remove}
          />
        )}
      </Stack>

      <CostSummary bundle={bundle} currencyCode={currencyCode} readOnly={readOnly} />

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
