import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { useDeferredValue, useState } from 'react';
import { problemMessage } from '../access/messages';
import { formatMoney } from './productFormat';
import { useBundleCandidates } from './useBundles';

export type Candidate = components['schemas']['BundleCandidate'];

/**
 * Searches the products a bundle can be made of, on the server by name or code. Each option has two lines: the name
 * and, under it in grey, the cost with its currency and the unit. The products already in the bundle are left out by
 * the server (`exclude`), without a note. Choosing one hands it to the form and clears the box, ready for the next.
 */
export function ComponentSearch({
  exclude,
  currencyCode,
  onPick,
  disabled = false,
  error,
}: {
  exclude: string[];
  currencyCode: string;
  onPick: (candidate: Candidate) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const deferred = useDeferredValue(text);
  const candidates = useBundleCandidates(deferred.trim(), exclude, open && !disabled);

  return (
    <Autocomplete<Candidate>
      options={candidates.data?.data ?? []}
      loading={candidates.isFetching}
      value={null}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      disabled={disabled}
      inputValue={text}
      onInputChange={(_, next, reason) => setText(reason === 'input' ? next : '')}
      onChange={(_, candidate) => {
        if (candidate) {
          onPick(candidate);
          setText('');
        }
      }}
      // The API already filters by what was typed (name or code); filtering again would hide matches by code. What is
      // already in the bundle is dropped here too: while a new search loads, the list of the last one is still shown.
      filterOptions={(all) => all.filter((candidate) => !exclude.includes(candidate.id))}
      getOptionLabel={(candidate) => candidate.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={candidates.isError ? problemMessage(candidates.error) : 'Nada coincide'}
      renderOption={({ key, ...props }, candidate) => (
        <Box component="li" key={key} {...props}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="div" noWrap>
              {candidate.name}
            </Typography>
            <Typography component="div" variant="body2" color="text.secondary" noWrap>
              {formatMoney(candidate.cost, currencyCode)} · {candidate.unit.name}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Agregar componente"
          placeholder="Busca un producto por nombre o código"
          error={Boolean(error)}
          helperText={error}
        />
      )}
    />
  );
}
