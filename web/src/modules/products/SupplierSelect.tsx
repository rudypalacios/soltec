import { Autocomplete, TextField } from '@mui/material';
import { useDeferredValue, useState } from 'react';
import { problemMessage } from '../access/messages';
import { useSupplierOptions } from './useProducts';

export interface SupplierChoice {
  id: string;
  name: string;
}

/**
 * Chooses a supplier, searched on the server by name or code. Open to any internal session (ADR-0024): the screen
 * that uses it needs nothing on the suppliers section. The supplier the record already has stays on the list even if
 * it was deactivated since.
 */
export function SupplierSelect({
  value,
  onChange,
  label = 'Proveedor',
  required = false,
  readOnly = false,
  error,
  helperText,
}: {
  value: SupplierChoice | null;
  onChange: (supplier: SupplierChoice | null) => void;
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  error?: string;
  helperText?: string;
}) {
  // What the box shows, and what was typed to search: choosing a supplier fills the box but is not a search.
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const options = useSupplierOptions(deferredSearch.trim(), !readOnly);
  const found: SupplierChoice[] = (options.data?.data ?? []).map(({ id, name }) => ({ id, name }));
  const choices =
    value && !found.some((supplier) => supplier.id === value.id) ? [value, ...found] : found;

  return (
    <Autocomplete
      options={choices}
      loading={options.isFetching}
      value={value}
      onChange={(_, supplier) => onChange(supplier)}
      inputValue={text}
      onInputChange={(_, next, reason) => {
        setText(next);
        setSearch(reason === 'input' ? next : '');
      }}
      // The API already filters by what was typed (name or code); filtering again would hide matches by code.
      filterOptions={(all) => all}
      getOptionLabel={(supplier) => supplier.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      readOnly={readOnly}
      noOptionsText={options.isError ? problemMessage(options.error) : 'Nadie coincide'}
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
