import { Box, Stack, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { formatMoment } from '../access/formatting';
import { formatMoney } from './productFormat';

type Bundle = components['schemas']['Bundle'];

/**
 * What goes with the cost of the bundle, as a numbered footer under the components: the price at the margin level, the
 * date of the oldest cost and what the figures are. They are plain sentences at the size of any note, not fine print. A
 * bundle that is not saved has no price or date yet, so it carries only the note about the preview. That a cost is
 * stale is said by the component that has it, as an inactive one is, and not here.
 */
export function CostNotes({
  bundle,
  currencyCode,
  readOnly,
}: {
  bundle: Bundle | null;
  currencyCode: string;
  readOnly: boolean;
}) {
  const notes: string[] = [];
  if (bundle) {
    notes.push(
      `Precio con IVA: ${formatMoney(bundle.price_with_vat, currencyCode)} con «${bundle.margin_level.name}».`,
      `Costo más antiguo revisado el ${formatMoment(bundle.cost_updated_at)}`,
    );
  }
  notes.push(
    readOnly
      ? 'Se calcula con los costos actuales de los componentes; no se guarda.'
      : 'El costo es una vista previa con los costos actuales. El servidor calcula el costo y el precio al guardar; nada de esto se guarda.',
  );

  if (notes.length === 1) {
    return (
      <Typography variant="caption" color="text.secondary">
        {notes[0]}
      </Typography>
    );
  }
  return (
    <Stack
      component="ol"
      spacing={0.75}
      aria-label="Notas"
      sx={{ m: 0, pl: 3, color: 'text.secondary' }}
    >
      {notes.map((note) => (
        <Box
          key={note}
          component="li"
          sx={{ typography: 'caption', '&::marker': { fontWeight: 600 } }}
        >
          {note}
        </Box>
      ))}
    </Stack>
  );
}
