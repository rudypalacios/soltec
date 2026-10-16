import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState } from 'react';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ActionMenu, type RowAction } from '../../components/RowActions';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { ContactLinkDialog } from './ContactLinkDialog';
import { useUnlinkContact } from './useClients';

type Client = components['schemas']['Client'];
type Link = components['schemas']['ClientContactLink'];

/** The people linked to the client that the person may see, each with its roles (one row per person). */
export function ContactsSection({
  client,
  onNotice,
  onFailure,
}: {
  client: Client;
  onNotice: (message: string) => void;
  onFailure: (message: string) => void;
}) {
  const can = useCan();
  const unlink = useUnlinkContact(client.id);
  const [dialog, setDialog] = useState<{ editing: Link[] | null; open: boolean } | null>(null);
  const [removing, setRemoving] = useState<{ links: Link[]; open: boolean } | null>(null);
  const mayLink = can('clients', 'edit') && can('contacts', 'view');

  // The API sends one row per role; the screen shows one row per person.
  const people = new Map<string, Link[]>();
  for (const link of client.contacts) {
    people.set(link.contact.id, [...(people.get(link.contact.id) ?? []), link]);
  }

  const confirmUnlink = async () => {
    const links = removing?.links;
    if (!links?.[0]) {
      return;
    }
    try {
      await unlink.mutateAsync(links[0].contact.id);
      onNotice(`Se quitó el vínculo con «${links[0].contact.name}».`);
    } catch (error) {
      onFailure(problemMessage(error));
    } finally {
      setRemoving(removing && { ...removing, open: false });
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
        >
          <Typography variant="h6" component="h2">
            Contactos
          </Typography>
          {mayLink ? (
            <Button onClick={() => setDialog({ editing: null, open: true })}>Vincular</Button>
          ) : null}
        </Stack>
        {can('contacts', 'view') ? (
          <Typography variant="body2" color="text.secondary">
            Solo ves los contactos que son tuyos o de tu equipo.
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Tu perfil no tiene acceso a los contactos.
          </Typography>
        )}
        {people.size === 0 && can('contacts', 'view') ? (
          <Typography color="text.secondary">Sin contactos vinculados que puedas ver.</Typography>
        ) : null}
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {[...people.values()].map((links) => {
            const person = links[0]?.contact;
            if (!person) {
              return null;
            }
            const actions: RowAction[] = mayLink
              ? [
                  {
                    key: 'roles',
                    label: 'Cambiar roles',
                    icon: ACTION_ICONS.edit,
                    onSelect: () => setDialog({ editing: links, open: true }),
                  },
                  {
                    key: 'unlink',
                    label: 'Quitar vínculo',
                    icon: ACTION_ICONS.deactivate,
                    tone: 'danger',
                    onSelect: () => setRemoving({ links, open: true }),
                  },
                ]
              : [];
            return (
              <Box
                component="li"
                key={person.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 1,
                  borderTop: 1,
                  borderColor: 'divider',
                  '&:first-of-type': { borderTop: 0 },
                }}
              >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
                    {person.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {links.map((link) => link.contact_type.name).join(' · ')}
                  </Typography>
                </Box>
                {actions.length > 0 ? <ActionMenu actions={actions} rowName={person.name} /> : null}
              </Box>
            );
          })}
        </Box>
      </Stack>
      <ContactLinkDialog
        clientId={client.id}
        editing={dialog?.editing ?? null}
        linkedIds={[...people.keys()]}
        open={dialog?.open === true}
        onClose={() => setDialog(dialog && { ...dialog, open: false })}
        onDone={onNotice}
      />
      <ConfirmDialog
        open={removing?.open === true}
        title="Quitar vínculo"
        message={`«${removing?.links[0]?.contact.name ?? ''}» deja de estar vinculado a «${client.name}». El contacto no se borra y sigue en tu lista de contactos.`}
        confirmLabel="Quitar vínculo"
        destructive
        busy={unlink.isPending}
        onConfirm={() => void confirmUnlink()}
        onCancel={() => setRemoving(removing && { ...removing, open: false })}
      />
    </Paper>
  );
}
