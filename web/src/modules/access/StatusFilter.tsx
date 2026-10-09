import { MenuItem, TextField } from '@mui/material';

export type StatusValue = 'active' | 'inactive' | 'all';

const OPTIONS: { value: StatusValue; label: string }[] = [
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
  { value: 'all', label: 'Todos' },
];

/** The filter every list of this module shares: whether to show active, inactive or all records. */
export function StatusFilter({
  value,
  onChange,
}: {
  value: StatusValue;
  onChange: (value: StatusValue) => void;
}) {
  return (
    <TextField
      select
      label="Estado"
      value={value}
      onChange={(event) => onChange(event.target.value as StatusValue)}
      sx={{ minWidth: { sm: 160 } }}
    >
      {OPTIONS.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
