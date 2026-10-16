import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  Stack,
  TextField,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { ApiError } from '@soltec/shared';
import { useDeferredValue, useEffect, useState } from 'react';
import { orNull } from '../../components/drafts';
import { fieldMessage, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { useContacts, useCreateContact } from '../contacts/useContacts';
import { useContactTypeOptions, useSetContactRoles } from './useClients';

type Link = components['schemas']['ClientContactLink'];
type Contact = components['schemas']['Contact'];

interface Choice {
  id: string;
  name: string;
  code: string;
}

/** The person to link and their roles with the client. A person that is not in the list yet can be created here. */
export function ContactLinkDialog({
  clientId,
  editing,
  linkedIds,
  open,
  onClose,
  onDone,
}: {
  clientId: string;
  /** The link being edited (one row per role of the same person), or null to link someone new. */
  editing: Link[] | null;
  /** The people already linked, which are not offered again. */
  linkedIds: readonly string[];
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const can = useCan();
  const setRoles = useSetContactRoles(clientId);
  const createContact = useCreateContact();
  const types = useContactTypeOptions();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const contacts = useContacts({ q: deferredSearch.trim() || undefined, per_page: 20 });
  const [person, setPerson] = useState<Choice | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '', email: '' });
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const first = editing?.[0];
  useEffect(() => {
    if (open) {
      setPerson(
        first ? { id: first.contact.id, name: first.contact.name, code: first.contact.code } : null,
      );
      setTypeIds((editing ?? []).map((link) => link.contact_type.id));
      setText('');
      setSearch('');
      setCreating(false);
      setDraft({ name: '', phone: '', email: '' });
      setErrors({});
      setFailure(null);
    }
  }, [open, first, editing]);

  const choices: Choice[] = (contacts.data?.data ?? [])
    .filter((contact: Contact) => !linkedIds.includes(contact.id))
    .map((contact: Contact) => ({ id: contact.id, name: contact.name, code: contact.code }));
  const busy = setRoles.isPending || createContact.isPending;
  const valid = typeIds.length > 0 && (editing || (creating ? draft.name.trim() : person));

  const submit = async () => {
    setErrors({});
    setFailure(null);
    try {
      let contactId = person?.id ?? '';
      if (creating) {
        const created = await createContact.mutateAsync({
          name: draft.name.trim(),
          phone: orNull(draft.phone),
          email: orNull(draft.email),
        });
        contactId = created.id;
      }
      await setRoles.mutateAsync({ contactId, contactTypeIds: typeIds });
      onDone(editing ? 'Se actualizaron los roles del contacto.' : 'Se vinculó el contacto.');
      onClose();
    } catch (error) {
      const codes = error instanceof ApiError ? error.fieldErrors : {};
      const messages = Object.fromEntries(
        Object.entries(codes).map(([field, code]) => [field, fieldMessage(code)]),
      );
      setErrors(messages);
      setFailure(Object.keys(messages).length === 0 ? problemMessage(error) : null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="link-title"
    >
      <DialogTitle id="link-title">
        {editing ? 'Roles del contacto' : 'Vincular contacto'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>
            Solo ves y vinculas los contactos que son tuyos o de tu equipo. Vincularlo no lo hace
            visible para los demás asesores del cliente.
          </DialogContentText>
          {failure ? <Alert severity="error">{failure}</Alert> : null}
          {editing ? (
            <TextField label="Contacto" value={first?.contact.name ?? ''} disabled fullWidth />
          ) : creating ? (
            <>
              <TextField
                label="Nombre del contacto"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                error={Boolean(errors.name)}
                helperText={errors.name}
                required
                slotProps={{ htmlInput: { maxLength: 150 } }}
                fullWidth
              />
              <TextField
                label="Teléfono"
                value={draft.phone}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                error={Boolean(errors.phone)}
                helperText={errors.phone}
                slotProps={{ htmlInput: { maxLength: 40 } }}
                fullWidth
              />
              <TextField
                label="Correo"
                type="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                error={Boolean(errors.email)}
                helperText={errors.email ?? 'El resto de sus datos se completa en Contactos.'}
                slotProps={{ htmlInput: { maxLength: 190 } }}
                fullWidth
              />
            </>
          ) : (
            <Autocomplete
              options={choices}
              loading={contacts.isFetching}
              value={person}
              onChange={(_, next) => setPerson(next)}
              inputValue={text}
              onInputChange={(_, next, reason) => {
                setText(next);
                setSearch(reason === 'input' ? next : '');
              }}
              filterOptions={(all) => all}
              getOptionLabel={(choice) => choice.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Nadie coincide"
              renderInput={(params) => (
                <TextField {...params} label="Contacto" required helperText={errors.contact_id} />
              )}
            />
          )}
          {!editing && can('contacts', 'create') ? (
            <Button
              onClick={() => {
                setCreating(!creating);
                setPerson(null);
              }}
              sx={{ alignSelf: 'flex-start' }}
            >
              {creating ? 'Elegir un contacto que ya existe' : 'Crear un contacto nuevo'}
            </Button>
          ) : null}
          <FormGroup aria-label="Roles del contacto">
            {(types.data?.data ?? []).map((type) => (
              <FormControlLabel
                key={type.id}
                label={type.name}
                control={
                  <Checkbox
                    checked={typeIds.includes(type.id)}
                    onChange={(event) =>
                      setTypeIds(
                        event.target.checked
                          ? [...typeIds, type.id]
                          : typeIds.filter((id) => id !== type.id),
                      )
                    }
                  />
                }
              />
            ))}
            <FormHelperText error={Boolean(errors['contact_type_ids'])}>
              {errors['contact_type_ids'] ??
                'Elige al menos un rol: qué hace esta persona con el cliente.'}
            </FormHelperText>
          </FormGroup>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy || !valid}>
          {editing ? 'Guardar roles' : 'Vincular'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
