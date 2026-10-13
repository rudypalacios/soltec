import ExpandMore from '@mui/icons-material/ExpandMore';
import { Checkbox, Chip, MenuItem, TextField } from '@mui/material';
import { type CheckState, type MatrixScope } from '@soltec/shared';
import { color } from '../../theme/tokens';

export interface MatrixResource {
  code: string;
  name: string;
  /** Whether the rows of the module have an owner, so a data scope applies to it. */
  scoped: boolean;
}

export interface MatrixAction {
  code: string;
  name: string;
}

const SCOPE_OPTIONS: { value: MatrixScope; label: string }[] = [
  { value: 'own', label: 'Solo lo propio' },
  { value: 'team', label: 'Su equipo' },
  { value: 'all', label: 'Todo' },
];

/** Text for screen readers only: the visible text says less (a count as «2/3») than what has to be announced. */
export const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/** A checkbox that stands for several: checked when every one is on, dashed when only some are. */
export function TriStateCheckbox({
  state,
  label,
  onToggle,
  disabled,
  sx,
}: {
  state: CheckState;
  label: string;
  onToggle: (on: boolean) => void;
  disabled?: boolean;
  sx?: object;
}) {
  return (
    <Checkbox
      checked={state === 'all'}
      indeterminate={state === 'some'}
      onChange={(event) => onToggle(event.target.checked)}
      disabled={disabled}
      slotProps={{
        input: {
          'aria-label': label,
          'aria-checked': state === 'some' ? 'mixed' : state === 'all',
        },
      }}
      sx={sx}
    />
  );
}

export function ScopeSelect({
  resource,
  value,
  onChange,
  disabled,
}: {
  resource: MatrixResource;
  value: MatrixScope;
  onChange: (scope: MatrixScope) => void;
  disabled?: boolean;
}) {
  return (
    <TextField
      select
      size="small"
      label="Alcance"
      value={value}
      onChange={(event) => onChange(event.target.value as MatrixScope)}
      disabled={disabled}
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

/** «2/3»: short enough to share a line with a long section name. The full sentence is for screen readers. */
export function SectionBadge({ withAccess, total }: { withAccess: number; total: number }) {
  return (
    <Chip
      size="small"
      variant={withAccess > 0 ? 'filled' : 'outlined'}
      label={
        <>
          <span aria-hidden="true">
            {withAccess}/{total}
          </span>
          <span style={visuallyHidden}>
            {withAccess} de {total} módulos con acceso
          </span>
        </>
      }
      sx={{
        flex: 'none',
        fontVariantNumeric: 'tabular-nums',
        ...(withAccess > 0
          ? { bgcolor: color.primary.tint, color: color.primary.dark, fontWeight: 600 }
          : { bgcolor: color.surface, color: color.inkMuted }),
      }}
    />
  );
}

/** Points right when the section is closed and down when it is open. */
export function SectionChevron({ open }: { open: boolean }) {
  return (
    <ExpandMore
      sx={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms' }}
    />
  );
}
