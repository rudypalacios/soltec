import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type components } from '@soltec/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { FormActions, FormPage } from '../../components/FormPage';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { fieldMessages, problemMessage } from '../access/messages';
import { formatMoment } from '../access/formatting';
import { useCan } from '../access/SessionContext';
import { viewOf } from '../parameters/parameterViews';
import { QuickParameterDialog } from '../parameters/QuickParameterDialog';
import { formatAmount } from './productFormat';
import { SupplierSelect, type SupplierChoice } from './SupplierSelect';
import {
  useAreaOptions,
  useBrandOptions,
  useCreateProduct,
  useGroupOptions,
  useProduct,
  useUnitOptions,
  useUpdateProduct,
} from './useProducts';

type Product = components['schemas']['Product'];

const BRANDS = viewOf('brands');
const GROUPS = viewOf('product-groups');
const NONE = '';

const NOT_AVAILABLE = 'Ya no está activo o no existe. Elige otro.';
const FIELD_MESSAGES = {
  cost: {
    invalid: 'Escribe un monto con hasta 4 decimales, por ejemplo 22.96.',
    out_of_range: 'El costo debe ser mayor que cero.',
  },
  supplier_id: { not_found: NOT_AVAILABLE },
  group_id: { not_found: NOT_AVAILABLE },
  brand_id: { not_found: NOT_AVAILABLE },
  unit_id: { not_found: NOT_AVAILABLE },
};

const SAVE_CONFLICTS = {
  conflict:
    'Otra persona cambió este producto mientras lo editabas. Recarga la página para ver sus cambios.',
};

/** `/productos/nuevo`. */
export function ProductCreatePage() {
  return (
    <>
      <PageHeader title="Nuevo producto" />
      <ProductForm product={null} readOnly={false} />
    </>
  );
}

/** `/productos/:productId/editar`. */
export function ProductEditPage() {
  return <ProductPage readOnly={false} />;
}

/** `/productos/:productId`: the product as whoever may only view the section sees it. */
export function ProductViewPage() {
  return <ProductPage readOnly />;
}

function ProductPage({ readOnly }: { readOnly: boolean }) {
  const { productId } = useParams();
  const product = useProduct(productId);
  const can = useCan();

  if (product.isError) {
    return <Alert severity="error">{problemMessage(product.error)}</Alert>;
  }
  if (product.isPending) {
    return <CircularProgress aria-label="Cargando el producto" />;
  }
  return (
    <>
      <PageHeader
        title={readOnly ? product.data.name : 'Editar producto'}
        actions={
          can('audit_logs', 'view') ? (
            <Button
              component={RouterLink}
              to={`/auditoria?tipo=products&registro=${product.data.id}`}
            >
              Ver historial
            </Button>
          ) : null
        }
      />
      {/* A different product (or a refetch after saving) restarts the form from the server's copy. */}
      <ProductForm
        key={`${product.data.id}:${product.data.version}`}
        product={product.data}
        readOnly={readOnly}
      />
    </>
  );
}

function ProductForm({ product, readOnly }: { product: Product | null; readOnly: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const can = useCan();
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.id ?? '');
  const areas = useAreaOptions();
  const groups = useGroupOptions();
  const brands = useBrandOptions();
  const units = useUnitOptions();

  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [supplier, setSupplier] = useState<SupplierChoice | null>(product?.supplier ?? null);
  const [groupId, setGroupId] = useState(product?.group.id ?? NONE);
  const [brandId, setBrandId] = useState(product?.brand?.id ?? NONE);
  const [unitId, setUnitId] = useState(product?.unit.id ?? NONE);
  const [cost, setCost] = useState(product?.cost ? formatAmount(product.cost) : '');
  const [checkAvailability, setCheckAvailability] = useState(product?.check_availability ?? false);
  const [costReviewed, setCostReviewed] = useState(false);
  const [creating, setCreating] = useState<'brand' | 'group' | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  // What the product already has stays on its list even if it was switched off since.
  const areaName = new Map((areas.data?.data ?? []).map((area) => [area.id, area.name]));
  const groupChoices = (groups.data?.data ?? []).map((group) => ({
    id: group.id,
    label: `${areaName.get(group.area_id ?? '') ?? ''} · ${group.name}`,
  }));
  if (product && !groupChoices.some((group) => group.id === product.group.id)) {
    groupChoices.push({
      id: product.group.id,
      label: `${product.area.name} · ${product.group.name}`,
    });
  }
  const brandChoices = [...(brands.data?.data ?? [])];
  if (product?.brand && !brandChoices.some((brand) => brand.id === product.brand?.id)) {
    brandChoices.push(product.brand);
  }
  const unitChoices = [...(units.data?.data ?? [])];
  if (product && !unitChoices.some((unit) => unit.id === product.unit.id)) {
    unitChoices.push(product.unit);
  }

  // Changing the cost already counts as updating it; the box is for confirming it stays the same.
  const costChanged = product !== null && formatAmount(cost) !== formatAmount(product.cost);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFailure(null);
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      supplier_id: supplier?.id ?? '',
      group_id: groupId,
      brand_id: brandId || null,
      unit_id: unitId,
      cost: cost.trim(),
      check_availability: checkAvailability,
    };
    try {
      if (product) {
        await update.mutateAsync({
          ...body,
          version: product.version,
          cost_reviewed: costReviewed,
        });
      } else {
        await create.mutateAsync(body);
      }
      navigate('/productos');
    } catch (error) {
      const fields = fieldMessages(error, FIELD_MESSAGES);
      setFieldErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error, SAVE_CONFLICTS) : null);
    }
  };

  const refreshOptions = () => queryClient.invalidateQueries({ queryKey: ['products', 'options'] });
  const select = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    errorKey: string,
    choices: { id: string; label: string }[],
    props: { required?: boolean; none?: string } = {},
  ) => (
    <TextField
      select
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={Boolean(fieldErrors[errorKey])}
      helperText={fieldErrors[errorKey]}
      required={props.required && !readOnly}
      slotProps={{ input: { readOnly } }}
      fullWidth
    >
      {props.none ? <MenuItem value={NONE}>{props.none}</MenuItem> : null}
      {choices.map((choice) => (
        <MenuItem key={choice.id} value={choice.id}>
          {choice.label}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <FormPage onSubmit={(event) => void submit(event)} maxWidth={640}>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      {product && !product.is_active ? (
        <Alert severity="info">
          Este producto está inactivo
          {product.deactivation_reason === 'supplier' ? ' porque su proveedor lo está' : ''}. Puedes
          corregir sus datos; para que vuelva a las listas, reactívalo desde la lista.
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
        <SupplierSelect
          value={supplier}
          onChange={setSupplier}
          required
          readOnly={readOnly}
          error={fieldErrors.supplier_id}
        />
        {!readOnly && can('suppliers', 'create') ? (
          <Link component={RouterLink} to="/proveedores/nuevo" variant="body2">
            Registrar un proveedor nuevo
          </Link>
        ) : null}
      </Box>

      <Box>
        {select('Área y grupo', groupId, setGroupId, 'group_id', groupChoices, { required: true })}
        {!readOnly && can('product_groups', 'create') ? (
          <Button size="small" onClick={() => setCreating('group')} sx={{ mt: 0.5 }}>
            Crear grupo
          </Button>
        ) : null}
      </Box>

      <Box>
        {select(
          'Marca',
          brandId,
          setBrandId,
          'brand_id',
          brandChoices.map((brand) => ({ id: brand.id, label: brand.name })),
          { none: 'Sin marca' },
        )}
        {!readOnly && can('brands', 'create') ? (
          <Button size="small" onClick={() => setCreating('brand')} sx={{ mt: 0.5 }}>
            Crear marca
          </Button>
        ) : null}
      </Box>

      {select(
        'Unidad de medida',
        unitId,
        setUnitId,
        'unit_id',
        unitChoices.map((unit) => ({ id: unit.id, label: unit.name })),
        { required: true },
      )}

      <TextField
        label="Costo con IVA"
        value={cost}
        onChange={(event) => setCost(event.target.value)}
        error={Boolean(fieldErrors.cost)}
        helperText={fieldErrors.cost ?? 'Como en la factura del proveedor, con IVA.'}
        slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 14, readOnly } }}
        required={!readOnly}
        fullWidth
      />

      {product ? (
        <Stack spacing={1} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2">
            Costo revisado el {formatMoment(product.cost_updated_at)}.
          </Typography>
          {product.cost_is_stale ? (
            <StatusBadge tone="warning" label="Costo desactualizado" />
          ) : null}
          <Typography variant="body2" color="text.secondary">
            Precio con IVA: {formatAmount(product.price_with_vat)} con «{product.margin_level.name}
            ». Se calcula desde el costo cada vez; no se guarda.
          </Typography>
          {readOnly ? null : (
            <FormControlLabel
              control={
                <Checkbox
                  checked={costReviewed || costChanged}
                  disabled={costChanged}
                  onChange={(event) => setCostReviewed(event.target.checked)}
                />
              }
              label="El costo sigue igual (revisado)"
            />
          )}
        </Stack>
      ) : null}

      <FormControlLabel
        control={
          <Checkbox
            checked={checkAvailability}
            disabled={readOnly}
            onChange={(event) => setCheckAvailability(event.target.checked)}
          />
        }
        label="Validar disponibilidad antes de ofrecerlo"
      />

      <FormActions>
        <Button component={RouterLink} to="/productos" variant="outlined" color="inherit">
          {readOnly ? 'Volver' : 'Cancelar'}
        </Button>
        {readOnly ? null : (
          <Button
            type="submit"
            variant="contained"
            disabled={create.isPending || update.isPending || !name.trim()}
          >
            Guardar
          </Button>
        )}
      </FormActions>

      <QuickParameterDialog
        view={creating === 'group' ? GROUPS : BRANDS}
        open={creating !== null}
        onClose={() => setCreating(null)}
        parents={creating === 'group' ? (areas.data?.data ?? []) : undefined}
        onCreated={(created) => {
          if (creating === 'group') {
            setGroupId(created.id);
          } else {
            setBrandId(created.id);
          }
          setCreating(null);
          void refreshOptions();
        }}
      />
    </FormPage>
  );
}
