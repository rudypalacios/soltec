import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { ACTION_ICONS } from '../../components/actionIcons';
import { DataList, type DataColumn } from '../../components/DataList';
import type { RowAction } from '../../components/RowActions';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { useSaveSequence, useSequences } from './useSettings';

type Sequence = components['schemas']['Sequence'];
type Period = components['schemas']['SequencePeriod'];

const PERIOD_LABELS: Record<Period, string> = {
  none: 'Nunca',
  year: 'Cada año',
  month: 'Cada mes',
};

/** `/configuracion/numeracion`: how the numbers of the documents are written. */
export function SequencesPage() {
  const canEdit = useCan()('sequences', 'edit');
  const sequences = useSequences();
  const [editing, setEditing] = useState<Sequence | null>(null);

  const actionsFor = (sequence: Sequence): RowAction[] =>
    canEdit
      ? [
          {
            key: 'edit',
            label: 'Editar',
            icon: ACTION_ICONS.edit,
            onSelect: () => setEditing(sequence),
          },
        ]
      : [];

  return (
    <>
      <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
        Numeración
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Así se escriben los números de los documentos. Un cambio solo afecta a los números que se
        emitan desde ahora; los ya emitidos no cambian.
      </Typography>
      <DataList
        label="Lista de numeraciones"
        noun="numeraciones"
        columns={COLUMNS}
        rows={sequences.data?.data}
        error={sequences.isError ? problemMessage(sequences.error) : null}
        getRowId={(sequence) => sequence.code}
        getRowName={(sequence) => sequence.name}
        getActions={actionsFor}
      />
      {editing ? <SequenceDialog sequence={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

const COLUMNS: DataColumn<Sequence>[] = [
  { id: 'name', header: 'Documento', mobile: 'title', minWidth: 160, render: (s) => s.name },
  {
    id: 'example',
    header: 'Próximo número',
    mobile: 'subtitle',
    nowrap: true,
    render: (s) => s.example,
  },
  {
    id: 'period',
    header: 'Reinicio',
    mobile: 'meta',
    nowrap: true,
    render: (s) => PERIOD_LABELS[s.period],
  },
];

function SequenceDialog({ sequence, onClose }: { sequence: Sequence; onClose: () => void }) {
  const save = useSaveSequence();
  const [prefix, setPrefix] = useState(sequence.prefix);
  const [padding, setPadding] = useState(String(sequence.padding));
  const [period, setPeriod] = useState<Period>(sequence.period);
  const [nextValue, setNextValue] = useState(String(sequence.next_value));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const found: Record<string, string> = {};
    if (!/^[A-Za-z0-9]{1,10}$/.test(prefix.trim())) {
      found.prefix = 'Usa de 1 a 10 letras o números, sin espacios.';
    }
    if (!/^\d{1,2}$/.test(padding) || Number(padding) < 1 || Number(padding) > 10) {
      found.padding = 'Escribe un número entre 1 y 10.';
    }
    if (!/^\d{1,15}$/.test(nextValue) || Number(nextValue) < 1) {
      found.next_value = 'Escribe un número entero desde 1.';
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    try {
      await save.mutateAsync({
        code: sequence.code,
        body: {
          version: sequence.version,
          prefix: prefix.trim().toUpperCase(),
          padding: Number(padding),
          period,
          next_value: Number(nextValue),
        },
      });
      onClose();
    } catch (error) {
      const fields = fieldMessages(error, {
        next_value: { too_low: 'No puede ser menor que el contador actual.' },
        period: { locked: 'Ya se emitieron números: el reinicio no puede cambiar.' },
      });
      setErrors(fields);
      setFailure(
        Object.keys(fields).length > 0
          ? null
          : problemMessage(error, {
              conflict:
                'Otra persona cambió esta numeración mientras la editabas. Cierra y vuelve a intentarlo.',
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
      aria-labelledby="sequence-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle id="sequence-dialog-title">
          Numeración de {sequence.name.toLowerCase()}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {failure ? <Alert severity="error">{failure}</Alert> : null}
            <Typography color="text.secondary">
              El próximo número es <strong>{sequence.example}</strong>.
            </Typography>
            <TextField
              label="Prefijo"
              value={prefix}
              onChange={(event) => setPrefix(event.target.value.toUpperCase())}
              error={'prefix' in errors}
              helperText={errors.prefix}
              slotProps={{ htmlInput: { maxLength: 10 } }}
              required
              fullWidth
            />
            <TextField
              label="Dígitos del contador"
              value={padding}
              onChange={(event) => setPadding(event.target.value)}
              error={'padding' in errors}
              helperText={errors.padding ?? 'Con 4, el uno se escribe 0001.'}
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 2 } }}
              required
              fullWidth
            />
            <TextField
              select
              label="Reinicio del contador"
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
              disabled={sequence.period_locked}
              error={'period' in errors}
              helperText={
                errors.period ??
                (sequence.period_locked
                  ? 'Ya se emitieron números: no se puede cambiar.'
                  : 'Con reinicio mensual el número lleva año y mes: COT-2610-0001.')
              }
              fullWidth
            >
              {(Object.keys(PERIOD_LABELS) as Period[]).map((value) => (
                <MenuItem key={value} value={value} sx={{ minHeight: 44 }}>
                  {PERIOD_LABELS[value]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Contador"
              value={nextValue}
              onChange={(event) => setNextValue(event.target.value)}
              error={'next_value' in errors}
              helperText={
                errors.next_value ?? 'Solo puede subir, para que ningún número se repita.'
              }
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 15 } }}
              required
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
