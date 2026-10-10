import { Autocomplete, TextField } from '@mui/material';
import type { components } from '@soltec/shared';
import { useDeferredValue, useState } from 'react';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { useUsers } from '../access/useUsers';
import { useDepartments } from './useDepartments';

/** A department or a manager as a user carries it: id and name. */
export type NamedRef = components['schemas']['NamedRef'];

/**
 * Whether the user form must ask for a department: only when the person can list departments and at least one
 * active department exists. The API accepts a user without one (the first administrator has none).
 */
export function useDepartmentChoices() {
  const canList = useCan()('departments', 'view');
  // 100 is the most the API returns per page: more than that is not a realistic list of departments.
  const departments = useDepartments({ status: 'active', per_page: 100 }, canList);
  const options: NamedRef[] = (departments.data?.data ?? []).map(({ id, name }) => ({ id, name }));
  return { canList, departments, options, required: canList && options.length > 0 };
}

export function DepartmentSelect({
  value,
  onChange,
  choices,
  error,
}: {
  value: NamedRef | null;
  onChange: (department: NamedRef | null) => void;
  choices: ReturnType<typeof useDepartmentChoices>;
  error?: string;
}) {
  if (!choices.canList) {
    return null;
  }
  // A user may still sit in a department that was deactivated later: keep it visible until it is changed.
  const options =
    value && !choices.options.some((option) => option.id === value.id)
      ? [value, ...choices.options]
      : choices.options;
  const helper = choices.departments.isError
    ? problemMessage(choices.departments.error)
    : choices.options.length === 0 && !choices.departments.isPending
      ? 'Aún no hay departamentos activos; puedes crearlos en Departamentos.'
      : undefined;

  return (
    <Autocomplete
      options={options}
      loading={choices.departments.isPending}
      value={value}
      onChange={(_, department) => onChange(department)}
      getOptionLabel={(department) => department.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText="No hay departamentos"
      renderInput={(params) => (
        <TextField
          {...params}
          label="Departamento"
          required={choices.required}
          error={Boolean(error)}
          helperText={error ?? helper}
        />
      )}
    />
  );
}

/**
 * The direct manager: an active internal user, searched by name or email. When editing (`forUserId`), the API leaves
 * out that user and everybody under them, who would make a cycle.
 */
export function ManagerSelect({
  value,
  onChange,
  forUserId,
  error,
}: {
  value: NamedRef | null;
  onChange: (manager: NamedRef | null) => void;
  forUserId?: string;
  error?: string;
}) {
  const [text, setText] = useState('');
  const deferredText = useDeferredValue(text);
  const users = useUsers({
    q: deferredText.trim() || undefined,
    status: 'active',
    type: 'internal',
    eligible_manager_for: forUserId,
    per_page: 20,
  });
  const found: NamedRef[] = (users.data?.data ?? []).map(({ id, name }) => ({ id, name }));
  const options = value && !found.some((user) => user.id === value.id) ? [value, ...found] : found;

  return (
    <Autocomplete
      options={options}
      loading={users.isFetching}
      value={value}
      onChange={(_, manager) => onChange(manager)}
      inputValue={text}
      onInputChange={(_, next) => setText(next)}
      // The API already filters by the text typed; filtering again here would hide matches by email.
      filterOptions={(all) => all}
      getOptionLabel={(user) => user.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={users.isError ? problemMessage(users.error) : 'Nadie coincide'}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Jefe directo"
          error={Boolean(error)}
          helperText={error ?? 'Opcional. Quien supervisa a esta persona.'}
        />
      )}
    />
  );
}
