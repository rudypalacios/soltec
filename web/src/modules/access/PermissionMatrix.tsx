import {
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useIsMobile } from '../../components/useIsMobile';

export interface CatalogEntry {
  code: string;
  name: string;
}

export type MatrixScope = 'own' | 'team' | 'all';

export interface MatrixValue {
  /** Granted actions by resource code. */
  permissions: Record<string, string[]>;
  /** Data scope by resource code. A resource without an entry is `own`. */
  scopes: Record<string, MatrixScope>;
}

interface PermissionMatrixProps {
  resources: CatalogEntry[];
  actions: CatalogEntry[];
  value: MatrixValue;
  onChange: (value: MatrixValue) => void;
  disabled?: boolean;
}

const SCOPE_OPTIONS: { value: MatrixScope; label: string }[] = [
  { value: 'own', label: 'Solo lo propio' },
  { value: 'team', label: 'Su equipo' },
  { value: 'all', label: 'Todo' },
];

/** Switches one action of one resource on or off, leaving the rest of the matrix as it was. */
export function toggleAction(
  value: MatrixValue,
  resource: string,
  action: string,
  on: boolean,
): MatrixValue {
  const current = value.permissions[resource] ?? [];
  const next = on ? [...new Set([...current, action])] : current.filter((code) => code !== action);
  return { ...value, permissions: { ...value.permissions, [resource]: next } };
}

export function setScope(value: MatrixValue, resource: string, scope: MatrixScope): MatrixValue {
  return { ...value, scopes: { ...value.scopes, [resource]: scope } };
}

/**
 * What the API receives: only the resources with at least one action, each with its scope (`own` unless chosen).
 * A resource with no actions grants nothing, so it carries no scope either.
 */
export function toPayload(value: MatrixValue): MatrixValue {
  const permissions: Record<string, string[]> = {};
  const scopes: Record<string, MatrixScope> = {};
  for (const [resource, actions] of Object.entries(value.permissions)) {
    if (actions.length > 0) {
      permissions[resource] = actions;
      scopes[resource] = value.scopes[resource] ?? 'own';
    }
  }
  return { permissions, scopes };
}

/**
 * The permission matrix of a role: a table on a desktop, one card per module on a phone, both with the same
 * checkboxes (what the role may do) and the scope (whose data it reaches).
 */
export function PermissionMatrix(props: PermissionMatrixProps) {
  return useIsMobile() ? <MatrixCards {...props} /> : <MatrixTable {...props} />;
}

function ScopeSelect({
  resource,
  value,
  onChange,
  disabled,
}: {
  resource: CatalogEntry;
  value: MatrixValue;
  onChange: (value: MatrixValue) => void;
  disabled?: boolean;
}) {
  return (
    <TextField
      select
      size="small"
      label="Alcance"
      value={value.scopes[resource.code] ?? 'own'}
      onChange={(event) =>
        onChange(setScope(value, resource.code, event.target.value as MatrixScope))
      }
      disabled={disabled || (value.permissions[resource.code] ?? []).length === 0}
      slotProps={{
        // Each select must say whose scope it sets: the visible label is the same on every row.
        select: {
          SelectDisplayProps: {
            'aria-label': `Alcance de ${resource.name}`,
            'aria-labelledby': undefined,
          },
        },
      }}
      sx={{ minWidth: 160 }}
      fullWidth
    >
      {SCOPE_OPTIONS.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

function MatrixTable({ resources, actions, value, onChange, disabled }: PermissionMatrixProps) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Permisos del perfil">
        <TableHead>
          <TableRow>
            <TableCell>Módulo</TableCell>
            {actions.map((action) => (
              <TableCell key={action.code} align="center">
                {action.name}
              </TableCell>
            ))}
            <TableCell sx={{ width: 200 }}>Alcance de los datos</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {resources.map((resource) => (
            <TableRow key={resource.code}>
              <TableCell>{resource.name}</TableCell>
              {actions.map((action) => (
                <TableCell key={action.code} align="center" padding="checkbox">
                  <Checkbox
                    checked={(value.permissions[resource.code] ?? []).includes(action.code)}
                    onChange={(event) =>
                      onChange(
                        toggleAction(value, resource.code, action.code, event.target.checked),
                      )
                    }
                    disabled={disabled}
                    slotProps={{ input: { 'aria-label': `${action.name} ${resource.name}` } }}
                  />
                </TableCell>
              ))}
              <TableCell>
                <ScopeSelect
                  resource={resource}
                  value={value}
                  onChange={onChange}
                  disabled={disabled}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function MatrixCards({ resources, actions, value, onChange, disabled }: PermissionMatrixProps) {
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }} aria-label="Permisos del perfil">
      {resources.map((resource) => (
        <Paper key={resource.code} variant="outlined" sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{resource.name}</Typography>
          <FormGroup row sx={{ mb: 1.5 }}>
            {actions.map((action) => (
              <FormControlLabel
                key={action.code}
                sx={{ width: '50%', mr: 0 }}
                label={action.name}
                control={
                  <Checkbox
                    checked={(value.permissions[resource.code] ?? []).includes(action.code)}
                    onChange={(event) =>
                      onChange(
                        toggleAction(value, resource.code, action.code, event.target.checked),
                      )
                    }
                    disabled={disabled}
                    slotProps={{ input: { 'aria-label': `${action.name} ${resource.name}` } }}
                  />
                }
              />
            ))}
          </FormGroup>
          <ScopeSelect resource={resource} value={value} onChange={onChange} disabled={disabled} />
        </Paper>
      ))}
    </Box>
  );
}
