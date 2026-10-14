import { Autocomplete, createFilterOptions, TextField } from '@mui/material';
import { useRef, useState } from 'react';
import { CREATE_ID, createLabel, offersCreate } from './createOption';

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
  onCreate,
}: {
  label: string;
  choices: Choice[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
  error?: string;
  helperText?: string;
  /**
   * Offers a last option, «Crear "what was typed"», when nothing matches exactly. It receives the typed text and the
   * screen opens its own dialog; the select does not change. Pass it only to whoever may create (ADR-0024).
   */
  onCreate?: (text: string) => void;
}) {
  const [text, setText] = useState('');
  // Choosing «Crear …» makes MUI write that label in the box; what was typed has to stay instead.
  const typedForCreate = useRef<string | null>(null);
  const matching = createFilterOptions<Choice>();
  return (
    <Autocomplete
      options={choices}
      value={choices.find((choice) => choice.id === value) ?? null}
      onChange={(_, choice) => {
        if (choice?.id === CREATE_ID) {
          typedForCreate.current = text;
          onCreate?.(text.trim());
          return;
        }
        onChange(choice?.id ?? '');
      }}
      inputValue={text}
      onInputChange={(_, next, reason) => {
        if (reason === 'reset' && typedForCreate.current !== null) {
          setText(typedForCreate.current);
          typedForCreate.current = null;
          return;
        }
        setText(next);
      }}
      filterOptions={(all, state) => {
        const found = matching(all, state);
        return onCreate &&
          offersCreate(
            state.inputValue,
            all.map((choice) => choice.label),
          )
          ? [...found, { id: CREATE_ID, label: createLabel(state.inputValue) }]
          : found;
      }}
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
