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
import { percentToRate, rateToPercent, type components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import type { RowAction } from '../../components/RowActions';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusFilter, type StatusValue } from '../../components/StatusFilter';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { PriceSimulator } from './PriceSimulator';
import {
  useMarginLevels,
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

/** `/configuracion/margenes`: the margin levels prices are computed with, and a simulator to see the effect. */
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

  const levels = useMarginLevels(status);
  const setActive = useSetMarginLevelActive();
  const setDefault = useSetDefaultMarginLevel();

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

      <Box sx={{ display: 'flex', mb: 2 }}>
        <StatusFilter value={status} onChange={setStatus} />
      </Box>

      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      ) : null}

      <DataList
        label="Lista de niveles de margen"
        noun="niveles de margen"
        columns={COLUMNS}
        rows={levels.data?.data}
        error={levels.isError ? problemMessage(levels.error) : null}
        getRowId={(level) => level.id}
        getRowName={(level) => level.name}
        getActions={actionsFor}
      />

      <PriceSimulator />

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

const COLUMNS: DataColumn<MarginLevel>[] = [
  {
    id: 'name',
    header: 'Nombre',
    mobile: 'title',
    minWidth: 180,
    render: (level) => level.name,
  },
  {
    id: 'rate',
    header: 'Margen',
    mobile: 'subtitle',
    nowrap: true,
    render: (level) => ratePercentLabel(level.rate),
  },
  {
    id: 'status',
    header: 'Estado',
    mobile: 'badge',
    nowrap: true,
    render: (level) =>
      !level.is_active ? (
        <StatusBadge tone="neutral" label="Inactivo" />
      ) : level.is_default ? (
        <StatusBadge tone="success" label="Por defecto" />
      ) : (
        <StatusBadge tone="success" label="Activo" />
      ),
  },
];

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
