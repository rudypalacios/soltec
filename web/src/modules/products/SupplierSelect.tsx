import { Autocomplete, TextField } from '@mui/material';
import { useDeferredValue, useRef, useState } from 'react';
import { CREATE_ID, createLabel, offersCreate } from '../../components/createOption';
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
  onCreate,
}: {
  value: SupplierChoice | null;
  onChange: (supplier: SupplierChoice | null) => void;
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  error?: string;
  helperText?: string;
  /** Offers «Crear "what was typed"» when no supplier matches exactly; the screen opens its own dialog. */
  onCreate?: (text: string) => void;
}) {
  // What the box shows, and what was typed to search: choosing a supplier fills the box but is not a search.
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  // Choosing «Crear …» makes MUI write that label in the box; what was typed has to stay instead.
  const typedForCreate = useRef<string | null>(null);
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
      onChange={(_, supplier) => {
        if (supplier?.id === CREATE_ID) {
          typedForCreate.current = text;
          onCreate?.(text.trim());
          return;
        }
        onChange(supplier);
      }}
      inputValue={text}
      onInputChange={(_, next, reason) => {
        if (reason === 'reset' && typedForCreate.current !== null) {
          setText(typedForCreate.current);
          typedForCreate.current = null;
          return;
        }
        setText(next);
        setSearch(reason === 'input' ? next : '');
      }}
      // The API already filters by what was typed (name or code); filtering again would hide matches by code.
      filterOptions={(all) =>
        onCreate && offersCreate(text, [...all.map((supplier) => supplier.name), value?.name ?? ''])
          ? [...all, { id: CREATE_ID, name: createLabel(text) }]
          : all
      }
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
