import AddIcon from '@mui/icons-material/Add';
import { Alert, Button } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { ActiveBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { useListFilters } from '../../components/useListFilters';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { useContacts, useSetContactActive } from './useContacts';

type Contact = components['schemas']['Contact'];
const PER_PAGE = 25;

/** The phone to show in a list: the landline, or the mobile when there is none. */
export function mainPhone(contact: Pick<Contact, 'phone' | 'mobile'>): string {
  return contact.phone ?? contact.mobile ?? '';
}

/** `/contactos`: the contacts the signed-in user reaches (their own, their team's or all, by data scope). */
export function ContactsPage() {
  const can = useCan();
  const filters = useListFilters();
  const [pending, setPending] = useState<{
    contact: Contact;
    activate: boolean;
    open: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const contacts = useContacts({
    q: filters.query,
    status: filters.status,
    page: filters.page + 1,
    per_page: PER_PAGE,
  });
  const setActive = useSetContactActive();

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setFailure(null);
    try {
      await setActive.mutateAsync({ contactId: pending.contact.id, active: pending.activate });
    } catch (error) {
      setFailure(problemMessage(error));
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const actionsFor = (contact: Contact): RowAction[] => {
    const actions: RowAction[] = [];
    if (can('contacts', 'edit')) {
      actions.push({
        key: 'edit',
        label: 'Editar',
        icon: ACTION_ICONS.edit,
        to: `/contactos/${contact.id}/editar`,
      });
    }
    if (can('contacts', 'deactivate')) {
      actions.push({
        key: 'toggle',
        label: contact.is_active ? 'Desactivar' : 'Reactivar',
        icon: contact.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: contact.is_active ? 'danger' : undefined,
        onSelect: () => setPending({ contact, activate: !contact.is_active, open: true }),
      });
    }
    return actions;
  };

  return (
    <>
      <PageHeader
        title="Contactos"
        actions={
          can('contacts', 'create') ? (
            <Button
              component={RouterLink}
              to="/contactos/nuevo"
              variant="contained"
              startIcon={<AddIcon />}
            >
              Nuevo contacto
            </Button>
          ) : null
        }
      />

      <FilterBar
        searchLabel="Buscar por nombre, correo, teléfono o código"
        search={filters.text}
        onSearchChange={filters.setText}
      >
        <StatusFilter value={filters.status} onChange={filters.setStatus} />
      </FilterBar>

      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      ) : null}

      <DataList
        label="Lista de contactos"
        noun="contactos"
        columns={COLUMNS}
        rows={contacts.data?.data}
        error={contacts.isError ? problemMessage(contacts.error) : null}
        getRowId={(contact) => contact.id}
        getRowName={(contact) => contact.name}
        isInactive={(contact) => !contact.is_active}
        getActions={actionsFor}
        pagination={{
          page: filters.page,
          perPage: PER_PAGE,
          total: contacts.data?.meta.total ?? 0,
          onPageChange: filters.setPage,
        }}
      />

      <ConfirmDialog
        open={pending?.open === true}
        title={pending?.activate ? 'Reactivar contacto' : 'Desactivar contacto'}
        message={
          pending?.activate
            ? `«${pending.contact.name}» volverá a aparecer en tus listas.`
            : `«${pending?.contact.name ?? ''}» dejará de aparecer en las listas activas. Sus datos se conservan.`
        }
        confirmLabel={pending?.activate ? 'Reactivar' : 'Desactivar'}
        destructive={pending?.activate === false}
        busy={setActive.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(pending && { ...pending, open: false })}
      />
    </>
  );
}

const COLUMNS: DataColumn<Contact>[] = [
  {
    id: 'name',
    header: 'Nombre',
    mobile: 'title',
    minWidth: 180,
    render: (contact) => contact.name,
  },
  {
    id: 'code',
    header: 'Código',
    mobile: 'subtitle',
    nowrap: true,
    render: (contact) => contact.code,
  },
  {
    id: 'phone',
    header: 'Teléfono',
    mobile: 'meta',
    nowrap: true,
    render: (contact) => mainPhone(contact) || '—',
  },
  {
    id: 'email',
    header: 'Correo',
    mobile: 'meta',
    minWidth: 160,
    render: (contact) => contact.email ?? '—',
  },
  {
    id: 'owner',
    header: 'Responsable',
    mobile: 'meta',
    render: (contact) => contact.owner.name,
  },
  {
    id: 'status',
    header: 'Estado',
    mobile: 'badge',
    nowrap: true,
    render: (contact) => <ActiveBadge active={contact.is_active} />,
  },
];
