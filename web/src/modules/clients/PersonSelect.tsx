import { Autocomplete, TextField } from '@mui/material';
import type { components } from '@soltec/shared';
import { useDeferredValue, useState } from 'react';
import { problemMessage } from '../access/messages';
import { usePersonOptions } from './useClients';

export type Person = components['schemas']['NamedRef'];

/**
 * A person of the company to hand a client to or to add as an adviser: the active internal users, searched on the
 * server by name or email, so a long list never has to be loaded whole.
 */
export function PersonSelect({
  label,
  value,
  onChange,
  error,
  helperText,
  required = false,
  exclude = [],
}: {
  label: string;
  value: Person | null;
  onChange: (person: Person | null) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
  /** People that must not be offered (the ones the client already has). */
  exclude?: readonly string[];
}) {
  // What the box shows and what was typed to search differ once someone is chosen: the name is not a search.
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const options = usePersonOptions(deferredSearch.trim());
  const found = (options.data?.data ?? []).filter((person) => !exclude.includes(person.id));
  const choices =
    value && !found.some((person) => person.id === value.id) ? [value, ...found] : found;

  return (
    <Autocomplete
      options={choices}
      loading={options.isFetching}
      value={value}
      onChange={(_, person) => onChange(person)}
      inputValue={text}
      onInputChange={(_, next, reason) => {
        setText(next);
        setSearch(reason === 'input' ? next : '');
      }}
      // The API already filters by what was typed; filtering again would hide matches by email.
      filterOptions={(all) => all}
      getOptionLabel={(person) => person.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={options.isError ? problemMessage(options.error) : 'Nadie coincide'}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          error={Boolean(error)}
          helperText={error ?? helperText}
        />
      )}
    />
  );
}
