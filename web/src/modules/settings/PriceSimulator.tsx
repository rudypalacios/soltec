import { Box, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { calculatePrice, isValidCost, rateToPercent } from '@soltec/shared';
import { useEffect, useState } from 'react';
import { problemMessage } from '../access/messages';
import { formatAmount } from './formatAmount';
import { useMarginLevels, usePrice } from './useMarginLevels';

/** How long the cost must stay still before the server is asked: typing "525.01" is not six requests. */
const SETTLE_MS = 400;
// A real value: MUI shows nothing for a select whose value is the empty string.
const DEFAULT_LEVEL = 'default';

function useSettled(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

const percent = (rate: string) => `${rateToPercent(rate) ?? rate} %`;

/**
 * «Probar un precio»: type a cost and see what it would sell for with a level. The server's answer is the truth
 * (ADR-0014); between answers the same function in `shared/` previews at once with the rates the last answer carried,
 * so changing the cost or the level feels immediate. A difference between the two would be a bug the shared test
 * vectors are there to catch.
 */
export function PriceSimulator() {
  const levels = useMarginLevels('active');
  const [costText, setCostText] = useState('');
  const [levelId, setLevelId] = useState(DEFAULT_LEVEL);

  // A comma is a decimal mark to whoever types it; the API only knows the dot.
  const cost = costText.trim().replace(',', '.');
  const typed = cost !== '';
  const valid = isValidCost(cost);
  const settledCost = useSettled(cost);
  const price = usePrice(
    settledCost,
    levelId === DEFAULT_LEVEL ? null : levelId,
    isValidCost(settledCost),
  );

  const available = levels.data?.data ?? [];
  const defaultLevel = available.find((candidate) => candidate.is_default);
  const level = available.find((candidate) => candidate.id === levelId) ?? defaultLevel;

  // What the last server answer says about the taxes lets the next cost be previewed without waiting.
  const answer = price.data;
  let shown: { without: string; with: string } | null = null;
  if (valid && answer && level) {
    try {
      const preview = calculatePrice({
        cost,
        vatRate: answer.vat_rate,
        incomeTaxRate: answer.income_tax_rate,
        marginRate: level.rate,
      });
      shown = { without: preview.withoutVat, with: preview.withVat };
    } catch {
      shown = null;
    }
  }
  const confirmed =
    valid &&
    answer !== undefined &&
    !price.isPlaceholderData &&
    cost === settledCost &&
    answer.margin_level.id === level?.id;
  // When the server has answered for exactly this input, its figures are the ones shown.
  if (confirmed) {
    shown = { without: answer.without_vat, with: answer.with_vat };
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mt: 3, maxWidth: 560 }}>
      <Typography variant="h6" component="h3" sx={{ mb: 0.5 }}>
        Probar un precio
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Escribe el costo de la factura del proveedor (con IVA) para ver a cuánto se vendería.
      </Typography>
      <Stack spacing={2}>
        <TextField
          label="Costo"
          value={costText}
          onChange={(event) => setCostText(event.target.value)}
          error={typed && !valid}
          helperText={
            typed && !valid
              ? 'Escribe un monto con hasta 4 decimales, por ejemplo 525.01.'
              : undefined
          }
          slotProps={{
            htmlInput: { inputMode: 'decimal', maxLength: 14 },
            input: { startAdornment: <Typography color="text.secondary">Q&nbsp;</Typography> },
          }}
          fullWidth
        />
        <TextField
          select
          label="Nivel de margen"
          value={levelId}
          onChange={(event) => setLevelId(event.target.value)}
          fullWidth
        >
          <MenuItem value={DEFAULT_LEVEL}>
            Por defecto{defaultLevel ? ` (${defaultLevel.name})` : ''}
          </MenuItem>
          {available.map((candidate) => (
            <MenuItem key={candidate.id} value={candidate.id}>
              {candidate.name} ({percent(candidate.rate)})
            </MenuItem>
          ))}
        </TextField>

        {price.isError && valid ? (
          <Typography color="error" role="alert">
            {problemMessage(price.error)}
          </Typography>
        ) : null}

        {shown ? (
          <Box aria-live="polite">
            <Stack direction="row" spacing={4}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Precio sin IVA
                </Typography>
                <Typography variant="h5" component="p">
                  {formatAmount(shown.without)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Precio con IVA
                </Typography>
                <Typography variant="h5" component="p">
                  {formatAmount(shown.with)}
                </Typography>
              </Box>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {answer
                ? `Margen ${level ? percent(level.rate) : ''} · IVA ${percent(answer.vat_rate)} · ISR ${percent(answer.income_tax_rate)}. `
                : ''}
              {confirmed ? 'Calculado por el servidor.' : 'Calculando…'}
            </Typography>
          </Box>
        ) : null}
      </Stack>
    </Paper>
  );
}
