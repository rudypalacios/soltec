import { Alert, CircularProgress } from '@mui/material';
import { useHealth } from './useHealth';

/** Shows whether the API answers. It is the smoke indicator of the empty scaffolding screen. */
export function HealthStatus() {
  const { data, isPending, isError } = useHealth();

  if (isPending) {
    return <CircularProgress size={20} aria-label="Comprobando el servicio" />;
  }
  if (isError) {
    return <Alert severity="error">No se pudo contactar con el servicio.</Alert>;
  }
  if (data.status === 'ok') {
    return <Alert severity="success">El servicio está en línea.</Alert>;
  }
  return <Alert severity="warning">El servicio responde, pero la base de datos no.</Alert>;
}
