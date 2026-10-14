import { Box, Stack, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { StatusBadge } from '../../components/StatusBadge';
import { formatMoment } from '../access/formatting';
import { formatMoney } from './productFormat';

type Bundle = components['schemas']['Bundle'];

/** The mark of a footnote after a label, as in the summary of a payment form: a raised number at the size of the text. */
export function FootnoteMark({ n }: { n: number }) {
  return (
    <Box
      component="sup"
      sx={{ ml: 0.25, fontSize: '0.75em', fontWeight: 600, color: 'text.secondary' }}
    >
      {n}
    </Box>
  );
}

/**
 * What goes with the cost of the bundle, laid out as the summary of a payment form: rows of label and value, and the
 * explanations as numbered footnotes at the bottom (the text at the size of any other, not fine print). Mark 1 belongs
 * to the cost of the bundle, which the table of components shows; marks 2 and 3 belong to the rows here, which exist
 * once the bundle is saved.
 */
export function CostSummary({
  bundle,
  currencyCode,
  readOnly,
}: {
  bundle: Bundle | null;
  currencyCode: string;
  readOnly: boolean;
}) {
  const notes: { n: number; text: string }[] = [
    {
      n: 1,
      text: readOnly
        ? 'Se calcula con los costos actuales de los componentes; no se guarda.'
        : 'Vista previa con los costos actuales de los componentes. El servidor calcula el costo y el precio al guardar; nada de esto se guarda.',
    },
  ];
  if (bundle) {
    notes.push(
      {
        n: 2,
        text: `Con «${bundle.margin_level.name}». Se calcula desde el costo cada vez; no se guarda.`,
      },
      {
        n: 3,
        text: 'Es la fecha del componente cuyo costo se revisó hace más tiempo. Pasado el plazo de los ajustes financieros, el paquete se marca como desactualizado.',
      },
    );
  }

  return (
    <Stack spacing={1.5}>
      {bundle ? (
        <Box
          component="dl"
          sx={{
            m: 0,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            columnGap: 2,
            rowGap: 1,
            alignItems: 'baseline',
          }}
        >
          <Box component="dt">
            Precio con IVA
            <FootnoteMark n={2} />
          </Box>
          <Box
            component="dd"
            sx={{ m: 0, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            {formatMoney(bundle.price_with_vat, currencyCode)}
          </Box>
          <Box component="dt">
            Costo más antiguo revisado
            <FootnoteMark n={3} />
          </Box>
          <Box component="dd" sx={{ m: 0, textAlign: 'right' }}>
            <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
              <span>{formatMoment(bundle.cost_updated_at)}</span>
              {bundle.cost_is_stale ? (
                <StatusBadge tone="warning" label="Costo desactualizado" />
              ) : null}
            </Stack>
          </Box>
        </Box>
      ) : null}
      <Stack
        component="ol"
        spacing={0.75}
        aria-label="Notas"
        sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider', pt: 1.5 }}
      >
        {notes.map((note) => (
          <Typography
            key={note.n}
            component="li"
            variant="caption"
            color="text.secondary"
            sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline' }}
          >
            <Box component="sup" sx={{ fontWeight: 600, flex: 'none' }}>
              {note.n}
            </Box>
            <span>{note.text}</span>
          </Typography>
        ))}
      </Stack>
    </Stack>
  );
}
