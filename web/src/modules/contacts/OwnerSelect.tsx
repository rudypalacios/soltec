import { Autocomplete, TextField } from '@mui/material';
import type { components } from '@soltec/shared';
import { useDeferredValue, useState } from 'react';
import { problemMessage } from '../access/messages';
import { useContactOwnerOptions } from './useContacts';

export type NamedRef = components['schemas']['NamedRef'];

/**
 * The owner of a contact. It offers only the people the signed-in user can hand the contact to (their team, or
 * everybody, by data scope), searched by name or email; the API decides, so nobody appears that it would then refuse.
 */
export function OwnerSelect({
  value,
  onChange,
  error,
}: {
  value: NamedRef | null;
  onChange: (owner: NamedRef | null) => void;
  error?: string;
}) {
  // What the box shows, and what the person typed to search. They differ when an owner is chosen: the box shows their
  // name, but that is not a search (searching for it would leave the owner as the only option).
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const options = useContactOwnerOptions(deferredSearch.trim());
  const found: NamedRef[] = options.data?.data ?? [];
  // The current owner stays visible even when they are not among the people the caller can hand it to.
  const choices =
    value && !found.some((person) => person.id === value.id) ? [value, ...found] : found;

  return (
    <Autocomplete
      options={choices}
      loading={options.isFetching}
      value={value}
      onChange={(_, owner) => onChange(owner)}
      inputValue={text}
      onInputChange={(_, next, reason) => {
        setText(next);
        setSearch(reason === 'input' ? next : '');
      }}
      // The API already filters by the text typed; filtering again here would hide matches by email.
      filterOptions={(all) => all}
      getOptionLabel={(person) => person.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      disableClearable={value !== null}
      noOptionsText={options.isError ? problemMessage(options.error) : 'Nadie coincide'}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Responsable"
          required
          error={Boolean(error)}
          helperText={
            error ??
            'Quien ingresó el contacto y lo ve en su lista. Cámbialo para pasárselo a otra persona de tu alcance.'
          }
        />
      )}
    />
  );
}
