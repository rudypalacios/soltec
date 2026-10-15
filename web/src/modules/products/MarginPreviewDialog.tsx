import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { problemMessage } from '../access/messages';
import { formatMoney } from './productFormat';
import { useBundleAtLevel } from './useBundles';
import { useProductAtLevel } from './useProducts';

type Level = { id: string; name: string; is_default: boolean };

/**
 * The price of one product or bundle at another margin level. Read only: the server prices the cost, nothing is
 * saved.
 */
export function MarginPreviewDialog({
  record,
  kind = 'product',
  levels,
  currencyCode,
  open,
  onClose,
}: {
  record: { id: string; name: string } | null;
  kind?: 'product' | 'bundle';
  levels: Level[];
  currencyCode: string;
  open: boolean;
  onClose: () => void;
}) {
  const [levelId, setLevelId] = useState<string | undefined>(undefined);
  const chosen = levelId ?? levels.find((level) => !level.is_default)?.id ?? levels[0]?.id;
  const active = open && record !== null;
  const product = useProductAtLevel(record?.id ?? '', chosen, active && kind === 'product');
  const bundle = useBundleAtLevel(record?.id ?? '', chosen, active && kind === 'bundle');
  const priced = kind === 'bundle' ? bundle : product;
  const result = priced.data;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="margin-title">
      <DialogTitle id="margin-title">Ver con otro margen</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>{record?.name}</Typography>
          <TextField
            select
            label="Nivel de margen"
            value={chosen ?? ''}
            onChange={(event) => setLevelId(event.target.value)}
          >
            {levels.map((level) => (
              <MenuItem key={level.id} value={level.id}>
                {level.name}
              </MenuItem>
            ))}
          </TextField>
          {priced.isError ? (
            <Alert severity="error">{problemMessage(priced.error)}</Alert>
          ) : result && result.id === record?.id ? (
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Costo: {formatMoney(result.cost, currencyCode)}
              </Typography>
              <Typography sx={{ fontWeight: 600, fontSize: '1.25rem' }}>
                {formatMoney(result.price_with_vat, currencyCode)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatMoney(result.price_without_vat, currencyCode)} sin IVA
              </Typography>
            </Stack>
          ) : (
            <CircularProgress size={24} aria-label="Calculando el precio" />
          )}
          <Typography variant="caption" color="text.secondary">
            Es solo una consulta: el precio se calcula desde el costo y no se guarda.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
