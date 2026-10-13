import { Alert, Button, CircularProgress, TextField } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { FormActions, FormPage } from '../../components/FormPage';
import { PageHeader } from '../../components/PageHeader';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan, useCurrentUser } from '../access/SessionContext';
import { OwnerSelect, type NamedRef } from './OwnerSelect';
import { useContact, useCreateContact, useUpdateContact } from './useContacts';

type Contact = components['schemas']['Contact'];

const FIELD_MESSAGES = {
  email: { invalid: 'Escribe un correo válido, por ejemplo nombre@empresa.com.' },
  owner_id: {
    not_found: 'Esa persona ya no está activa.',
    out_of_scope: 'Con tu alcance, el nuevo responsable debe ser de tu equipo.',
  },
};

const SAVE_CONFLICTS = {
  conflict:
    'Otra persona cambió este contacto mientras lo editabas. Recarga la página para ver sus cambios.',
  forbidden: 'No tienes permiso para pasar este contacto a otra persona.',
};

/** `/contactos/nuevo`: the person who creates a contact becomes its owner. */
export function ContactCreatePage() {
  return (
    <>
      <PageHeader title="Nuevo contacto" />
      <ContactForm contact={null} />
    </>
  );
}

/** `/contactos/:contactId/editar`. */
export function ContactEditPage() {
  const { contactId } = useParams();
  const contact = useContact(contactId);
  const can = useCan();

  if (contact.isError) {
    return <Alert severity="error">{problemMessage(contact.error)}</Alert>;
  }
  if (contact.isPending) {
    return <CircularProgress aria-label="Cargando el contacto" />;
  }
  return (
    <>
      <PageHeader
        title="Editar contacto"
        actions={
          can('audit_logs', 'view') ? (
            <Button
              component={RouterLink}
              to={`/auditoria?tipo=contacts&registro=${contact.data.id}`}
            >
              Ver historial
            </Button>
          ) : null
        }
      />
      {/* A different contact (or a refetch after saving) restarts the form from the server's copy. */}
      <ContactForm key={`${contact.data.id}:${contact.data.version}`} contact={contact.data} />
    </>
  );
}

/** The text of an optional field the API sends as null. */
const text = (value: string | null | undefined) => value ?? '';
/** What the API receives for an optional field: nothing when it is empty. */
const orNull = (value: string) => value.trim() || null;

function ContactForm({ contact }: { contact: Contact | null }) {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const create = useCreateContact();
  const update = useUpdateContact(contact?.id ?? '');
  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(text(contact?.phone));
  const [mobile, setMobile] = useState(text(contact?.mobile));
  const [email, setEmail] = useState(text(contact?.email));
  const [address, setAddress] = useState(text(contact?.address));
  const [zone, setZone] = useState(text(contact?.zone));
  const [country, setCountry] = useState(text(contact?.country));
  const [owner, setOwner] = useState<NamedRef | null>(contact?.owner ?? null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  // Handing a contact over needs a scope that reaches other people. Who can be chosen comes from the contacts API,
  // so it needs nothing on the user screens.
  const canHandOver =
    contact !== null && (me?.scopes.contacts === 'team' || me?.scopes.contacts === 'all');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFailure(null);
    const data = {
      name: name.trim(),
      phone: orNull(phone),
      mobile: orNull(mobile),
      email: orNull(email),
      address: orNull(address),
      zone: orNull(zone),
      country: orNull(country),
    };
    try {
      if (contact) {
        await update.mutateAsync({
          ...data,
          version: contact.version,
          ...(canHandOver && owner ? { owner_id: owner.id } : {}),
        });
      } else {
        await create.mutateAsync(data);
      }
      navigate('/contactos');
    } catch (error) {
      const fields = fieldMessages(error, FIELD_MESSAGES);
      setFieldErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error, SAVE_CONFLICTS) : null);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    key: string,
    props: { required?: boolean; maxLength: number; type?: string; autoFocus?: boolean },
  ) => (
    <TextField
      label={label}
      type={props.type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={Boolean(fieldErrors[key])}
      helperText={fieldErrors[key]}
      slotProps={{ htmlInput: { maxLength: props.maxLength } }}
      required={props.required}
      autoFocus={props.autoFocus}
      fullWidth
    />
  );

  return (
    <FormPage onSubmit={(event) => void submit(event)}>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      {contact && !contact.is_active ? (
        <Alert severity="info">
          Este contacto está inactivo. Puedes corregir sus datos; para que vuelva a las listas,
          reactívalo desde la lista.
        </Alert>
      ) : null}
      {field('Nombre', name, setName, 'name', { required: true, maxLength: 150, autoFocus: true })}
      {field('Teléfono', phone, setPhone, 'phone', { maxLength: 40, type: 'tel' })}
      {field('Celular', mobile, setMobile, 'mobile', { maxLength: 40, type: 'tel' })}
      {field('Correo', email, setEmail, 'email', { maxLength: 190, type: 'email' })}
      {field('Dirección', address, setAddress, 'address', { maxLength: 255 })}
      {field('Zona', zone, setZone, 'zone', { maxLength: 100 })}
      {field('País', country, setCountry, 'country', { maxLength: 100 })}
      {contact ? (
        canHandOver ? (
          <OwnerSelect value={owner} onChange={setOwner} error={fieldErrors.owner_id} />
        ) : (
          <TextField label="Responsable" value={contact.owner.name} disabled fullWidth />
        )
      ) : null}
      <FormActions>
        <Button component={RouterLink} to="/contactos" variant="outlined" color="inherit">
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={create.isPending || update.isPending || !name.trim()}
        >
          Guardar
        </Button>
      </FormActions>
    </FormPage>
  );
}
