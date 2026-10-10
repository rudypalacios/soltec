import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  calculatePrice,
  isValidCost,
  percentToRate,
  rateToPercent,
  type components,
} from '@soltec/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import type { RowAction } from '../../components/RowActions';
import { StatusBadge } from '../../components/StatusBadge';
import { useIsMobile } from '../../components/useIsMobile';
import { color } from '../../theme/tokens';
import { StatusFilter, type StatusValue } from '../../components/StatusFilter';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { formatAmount } from './formatAmount';
import {
  useMarginLevels,
  usePrice,
  useSaveMarginLevel,
  useSetDefaultMarginLevel,
  useSetMarginLevelActive,
} from './useMarginLevels';

type MarginLevel = components['schemas']['MarginLevel'];

const PERCENT_ERROR = 'Escribe un porcentaje entre 0 y 99,999.';

/** "33" for 0.33000, shown with its sign: «33 %». */
export function ratePercentLabel(rate: string): string {
  return `${rateToPercent(rate) ?? rate} %`;
}

/** How long the cost must stay still before the server is asked: typing "525.01" is not six requests. */
const SETTLE_MS = 400;

function useSettled(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

interface LevelPrice {
  withoutVat: string;
  withVat: string;
}

/**
 * `/configuracion/margenes`: the margin levels prices are computed with. Typing a test cost adds each level's price
 * to the same list, so there is one list however many levels there are.
 */
export function MarginLevelsPage() {
  const can = useCan();
  const [status, setStatus] = useState<StatusValue>('active');
  const [editing, setEditing] = useState<MarginLevel | 'new' | null>(null);
  // Kept after closing (`open` false) so the dialog does not lose its text while it fades out.
  const [pending, setPending] = useState<{
    level: MarginLevel;
    activate: boolean;
    open: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const isMobile = useIsMobile();
  const [costText, setCostText] = useState('');

  const levels = useMarginLevels(status);
  const setActive = useSetMarginLevelActive();
  const setDefault = useSetDefaultMarginLevel();

  // A comma is a decimal mark to whoever types it; the API only knows the dot.
  const cost = costText.trim().replace(',', '.');
  const costInvalid = cost !== '' && !isValidCost(cost);
  const settledCost = useSettled(cost);
  // The server's answer is the truth (ADR-0014). It also carries the taxes, so the other levels can be priced at
  // once with the same function from `shared/` while the next answer is on its way.
  const serverPrice = usePrice(settledCost, isValidCost(settledCost));
  const answer = serverPrice.data;
  const confirmed = answer !== undefined && !serverPrice.isPlaceholderData && cost === settledCost;
  const priced = isValidCost(cost) && answer !== undefined;

  const priceOf = (level: MarginLevel): LevelPrice | null => {
    if (!priced || !level.is_active) {
      return null;
    }
    if (confirmed && answer.margin_level.id === level.id) {
      return { withoutVat: answer.without_vat, withVat: answer.with_vat };
    }
    try {
      const price = calculatePrice({
        cost,
        vatRate: answer.vat_rate,
        incomeTaxRate: answer.income_tax_rate,
        marginRate: level.rate,
      });
      return { withoutVat: price.withoutVat, withVat: price.withVat };
    } catch {
      return null;
    }
  };
  const columns = levelColumns({ priced, showStatus: status !== 'active', isMobile, priceOf });

  const confirm = async () => {
    if (!pending) {
      return;
    }
    const { level, activate } = pending;
    setFailure(null);
    try {
      await setActive.mutateAsync({ marginLevelId: level.id, active: activate });
    } catch (error) {
      setFailure(
        problemMessage(error, {
          validation_failed: `Ya hay un nivel activo llamado «${level.name}».`,
        }),
      );
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const makeDefault = async (level: MarginLevel) => {
    setFailure(null);
    try {
      await setDefault.mutateAsync(level.id);
    } catch (error) {
      setFailure(problemMessage(error));
    }
  };

  const actionsFor = (level: MarginLevel): RowAction[] => {
    const actions: RowAction[] = [];
    if (can('margin_levels', 'edit')) {
      actions.push({
        key: 'edit',
        label: 'Editar',
        icon: ACTION_ICONS.edit,
        onSelect: () => setEditing(level),
      });
      if (level.is_active && !level.is_default) {
        actions.push({
          key: 'default',
          label: 'Usar por defecto',
          icon: ACTION_ICONS.setDefault,
          onSelect: () => void makeDefault(level),
        });
      }
    }
    // The default level is the one the server will not deactivate: another must take over first.
    if (can('margin_levels', 'deactivate') && !level.is_default) {
      actions.push({
        key: 'toggle',
        label: level.is_active ? 'Desactivar' : 'Reactivar',
        icon: level.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: level.is_active ? 'danger' : undefined,
        onSelect: () => setPending({ level, activate: !level.is_active, open: true }),
      });
    }
    return actions;
  };

  return (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' }, mb: 2 }}
      >
        <Box>
          <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
            Niveles de margen
          </Typography>
          <Typography color="text.secondary">
            El precio de venta se calcula con el costo, el nivel de margen, el IVA y el ISR; no se
            guarda. Cambiar un nivel cambia los precios al instante, pero no las cotizaciones ya
            emitidas.
          </Typography>
        </Box>
        {can('margin_levels', 'create') ? (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditing('new')}
            sx={{ flexShrink: 0 }}
          >
            Nuevo nivel
          </Button>
        ) : null}
      </Stack>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          mb: 2,
          // On a phone the cost stays in sight while a long list scrolls under the fixed app bar.
          position: { xs: 'sticky', md: 'static' },
          top: { xs: 56, sm: 64 },
          zIndex: 1,
          bgcolor: 'background.default',
          py: { xs: 1, md: 0 },
        }}
      >
        <StatusFilter value={status} onChange={setStatus} />
        <TextField
          label="Costo de prueba (con IVA)"
          value={costText}
          onChange={(event) => setCostText(event.target.value)}
          error={costInvalid}
          helperText={
            costInvalid ? 'Escribe un monto con hasta 4 decimales, por ejemplo 525.01.' : undefined
          }
          slotProps={{
            htmlInput: { inputMode: 'decimal', maxLength: 14 },
            input: { startAdornment: <Typography color="text.secondary">Q&nbsp;</Typography> },
          }}
          sx={{ flex: '1 1 220px', maxWidth: { sm: 320 } }}
        />
      </Box>

      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      ) : null}

      <DataList
        label="Lista de niveles de margen"
        noun="niveles de margen"
        columns={columns}
        dense
        rows={levels.data?.data}
        error={levels.isError ? problemMessage(levels.error) : null}
        getRowId={(level) => level.id}
        getRowName={(level) => level.name}
        getActions={actionsFor}
      />

      {priced ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          IVA {ratePercentLabel(answer.vat_rate)} · ISR {ratePercentLabel(answer.income_tax_rate)}.{' '}
          {confirmed ? 'Precios calculados por el servidor.' : 'Calculando…'}
        </Typography>
      ) : null}

      {editing !== null ? (
        <MarginLevelDialog
          level={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={pending?.open === true}
        title={pending?.activate ? 'Reactivar nivel' : 'Desactivar nivel'}
        message={
          pending?.activate
            ? `«${pending.level.name}» volverá a poder elegirse para calcular precios.`
            : `«${pending?.level.name ?? ''}» dejará de poder elegirse para calcular precios. Se conserva.`
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

const statusBadge = (level: MarginLevel) =>
  !level.is_active ? (
    <StatusBadge tone="neutral" label="Inactivo" />
  ) : level.is_default ? (
    <StatusBadge tone="success" label="Por defecto" />
  ) : (
    <StatusBadge tone="success" label="Activo" />
  );

const defaultMark = (
  <Box
    component="span"
    sx={{ ml: 1, fontSize: 12, fontWeight: 400, color: color.success.main, whiteSpace: 'nowrap' }}
  >
    ● Por defecto
  </Box>
);

/**
 * The columns of the list. A table shows the name (with the default marked), the margin, the two prices when a test
 * cost is typed, and the state only when the filter shows inactive levels too (with «Activos» it would say «Activo»
 * on every row). A phone shows one compact line: name and margin on the left, the price (or the state) on the right.
 */
function levelColumns({
  priced,
  showStatus,
  isMobile,
  priceOf,
}: {
  priced: boolean;
  showStatus: boolean;
  isMobile: boolean;
  priceOf: (level: MarginLevel) => LevelPrice | null;
}): DataColumn<MarginLevel>[] {
  if (isMobile) {
    return [
      { id: 'name', header: 'Nombre', mobile: 'title', render: (level) => level.name },
      {
        id: 'detail',
        header: 'Margen',
        mobile: 'subtitle',
        render: (level) => {
          const price = priceOf(level);
          return [
            ratePercentLabel(level.rate),
            priced && level.is_default && level.is_active ? 'Por defecto' : null,
            price ? `sin IVA ${formatAmount(price.withoutVat)}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
        },
      },
      {
        id: 'result',
        header: priced ? 'Precio con IVA' : 'Estado',
        mobile: 'badge',
        render: (level) => {
          const price = priceOf(level);
          return price ? (
            <Typography component="span" sx={{ fontWeight: 700, fontSize: 17 }}>
              {formatAmount(price.withVat)}
            </Typography>
          ) : (
            statusBadge(level)
          );
        },
      },
    ];
  }

  const columns: DataColumn<MarginLevel>[] = [
    {
      id: 'name',
      header: 'Nombre',
      mobile: 'title',
      minWidth: 220,
      render: (level) => (
        <>
          {level.name}
          {level.is_default && level.is_active ? defaultMark : null}
        </>
      ),
    },
    {
      id: 'rate',
      header: 'Margen',
      mobile: 'subtitle',
      nowrap: true,
      render: (level) => ratePercentLabel(level.rate),
    },
  ];
  if (priced) {
    const money = (pick: keyof LevelPrice, bold: boolean) => (level: MarginLevel) => {
      const price = priceOf(level);
      return price ? (
        <Box component="span" sx={{ fontWeight: bold ? 700 : 400 }}>
          {formatAmount(price[pick])}
        </Box>
      ) : (
        '—'
      );
    };
    columns.push(
      {
        id: 'without',
        header: 'Precio sin IVA',
        mobile: 'hidden',
        nowrap: true,
        render: money('withoutVat', false),
      },
      {
        id: 'with',
        header: 'Precio con IVA',
        mobile: 'hidden',
        nowrap: true,
        render: money('withVat', true),
      },
    );
  }
  if (showStatus) {
    columns.push({
      id: 'status',
      header: 'Estado',
      mobile: 'badge',
      nowrap: true,
      render: statusBadge,
    });
  }
  return columns;
}

/** Creates a level (`level` null) or edits its name and margin. */
function MarginLevelDialog({ level, onClose }: { level: MarginLevel | null; onClose: () => void }) {
  const save = useSaveMarginLevel();
  const [name, setName] = useState(level?.name ?? '');
  const [percent, setPercent] = useState(level ? (rateToPercent(level.rate) ?? '') : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const rate = percentToRate(percent);
    if (!rate) {
      setErrors({ rate: PERCENT_ERROR });
      return;
    }
    setErrors({});

    try {
      await save.mutateAsync({ name: name.trim(), rate, id: level?.id, version: level?.version });
      onClose();
    } catch (error) {
      const fields = fieldMessages(error, {
        name: { taken: 'Ya hay un nivel activo con ese nombre.' },
        rate: { invalid: PERCENT_ERROR, out_of_range: PERCENT_ERROR },
      });
      setErrors(fields);
      setFailure(
        Object.keys(fields).length > 0
          ? null
          : problemMessage(error, {
              conflict:
                'Otra persona cambió este nivel mientras lo editabas. Cierra y vuelve a intentarlo.',
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
      aria-labelledby="margin-level-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle id="margin-level-dialog-title">
          {level ? 'Editar nivel de margen' : 'Nuevo nivel de margen'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {failure ? <Alert severity="error">{failure}</Alert> : null}
            <TextField
              label="Nombre"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={'name' in errors}
              helperText={errors.name}
              slotProps={{ htmlInput: { maxLength: 60 } }}
              required
              fullWidth
              autoFocus
            />
            <TextField
              label="Margen"
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              error={'rate' in errors}
              helperText={errors.rate ?? 'Parte del precio de venta que queda como margen.'}
              slotProps={{
                htmlInput: { inputMode: 'decimal', maxLength: 6 },
                input: { endAdornment: <Typography color="text.secondary">%</Typography> },
              }}
              required
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={save.isPending || !name.trim() || !percent.trim()}
          >
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
