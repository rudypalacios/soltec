import { Autocomplete, TextField } from '@mui/material';

export interface Choice {
  id: string;
  label: string;
}

/**
 * A select you can type in, for a list the screen already has whole (areas, groups, brands): typing narrows what it
 * shows and no request is made. `''` is no choice, which clears it. A list that must be searched on the server (the
 * suppliers) has its own component.
 */
export function SearchableSelect({
  label,
  choices,
  value,
  onChange,
  required = false,
  readOnly = false,
  error,
  helperText,
}: {
  label: string;
  choices: Choice[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
  error?: string;
  helperText?: string;
}) {
  return (
    <Autocomplete
      options={choices}
      value={choices.find((choice) => choice.id === value) ?? null}
      onChange={(_, choice) => onChange(choice?.id ?? '')}
      getOptionLabel={(choice) => choice.label}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      readOnly={readOnly}
      noOptionsText="Nada coincide"
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required && !readOnly}
          error={Boolean(error)}
          helperText={error ?? helperText}
        />
      )}
    />
  );
}
