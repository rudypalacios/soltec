import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState } from 'react';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ActionMenu, type RowAction } from '../../components/RowActions';
import { problemMessage } from '../access/messages';
import { useCan, useCurrentUser } from '../access/SessionContext';
import { AddSellerDialog } from './AddSellerDialog';
import { ReassignDialog } from './ReassignDialog';
import { useRemoveSeller, useSetResponsible } from './useClients';

type Client = components['schemas']['Client'];
type Seller = components['schemas']['ClientSeller'];
type Pending = { kind: 'remove' | 'responsible'; seller: Seller; open: boolean };

/**
 * The advisers of the client. The responsible adviser and whoever reaches the client with a `team` or `all` scope
 * administer them; any other adviser only sees them. Adding or handing over to someone needs a `team` or `all` scope:
 * with `own` there is nobody else to choose (the server decides too, ADR-0025).
 */
export function SellersSection({
  client,
  onNotice,
  onFailure,
}: {
  client: Client;
  onNotice: (message: string) => void;
  onFailure: (message: string) => void;
}) {
  const can = useCan();
  const me = useCurrentUser();
  const remove = useRemoveSeller(client.id);
  const makeResponsible = useSetResponsible(client.id);
  const [pending, setPending] = useState<Pending | null>(null);
  const [adding, setAdding] = useState(false);
  const [reassigning, setReassigning] = useState(false);

  const scope = me?.scopes.clients;
  const mayAdminister =
    can('clients', 'edit') &&
    (scope === 'team' || scope === 'all' || client.responsible?.id === me?.id);
  // Choosing someone else needs a scope that reaches other people: with `own` there is nobody to choose (the server
  // offers and accepts only the team with `team` and nobody else with `own`), so a seller asks their boss.
  const mayChoosePeople = mayAdminister && (scope === 'team' || scope === 'all');
  const customer = client.type === 'customer';

  const confirm = async () => {
    if (!pending) {
      return;
    }
    try {
      if (pending.kind === 'remove') {
        await remove.mutateAsync(pending.seller.user.id);
        onNotice(`«${pending.seller.user.name}» dejó de ser asesor del cliente.`);
      } else {
        await makeResponsible.mutateAsync(pending.seller.user.id);
        onNotice(`«${pending.seller.user.name}» es ahora el asesor responsable.`);
      }
    } catch (error) {
      onFailure(problemMessage(error));
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const actionsFor = (seller: Seller): RowAction[] => {
    const actions: RowAction[] = [];
    if (!seller.is_responsible) {
      actions.push({
        key: 'responsible',
        label: 'Hacer responsable',
        icon: ACTION_ICONS.setDefault,
        onSelect: () => setPending({ kind: 'responsible', seller, open: true }),
      });
      actions.push({
        key: 'remove',
        label: 'Quitar',
        icon: ACTION_ICONS.deactivate,
        tone: 'danger',
        onSelect: () => setPending({ kind: 'remove', seller, open: true }),
      });
    }
    return actions;
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
        >
          <Typography variant="h6" component="h2">
            Asesores
          </Typography>
          {mayChoosePeople ? (
            <Stack direction="row" sx={{ gap: 0.5 }}>
              {customer ? <Button onClick={() => setAdding(true)}>Agregar</Button> : null}
              <Button aria-label="Reasignar a otro asesor" onClick={() => setReassigning(true)}>
                Reasignar
              </Button>
            </Stack>
          ) : null}
        </Stack>
        {!customer ? (
          <Typography variant="body2" color="text.secondary">
            Un prospecto tiene un solo asesor. Al convertirlo en cliente de venta se puede
            compartir.
          </Typography>
        ) : null}
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {client.sellers.map((seller) => {
            const actions = mayAdminister ? actionsFor(seller) : [];
            return (
              <Box
                component="li"
                key={seller.user.id}
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
                    {seller.user.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {seller.is_responsible ? 'Responsable' : 'Asesor'}
                  </Typography>
                </Box>
                {actions.length > 0 ? (
                  <ActionMenu actions={actions} rowName={seller.user.name} />
                ) : null}
              </Box>
            );
          })}
        </Box>
      </Stack>
      <AddSellerDialog
        client={client}
        open={adding}
        onClose={() => setAdding(false)}
        onDone={onNotice}
      />
      <ReassignDialog
        client={client}
        open={reassigning}
        onClose={() => setReassigning(false)}
        onDone={onNotice}
      />
      <ConfirmDialog
        open={pending?.open === true}
        title={pending?.kind === 'remove' ? 'Quitar asesor' : 'Hacer responsable'}
        message={
          pending?.kind === 'remove'
            ? `«${pending.seller.user.name}» deja de ser asesor de «${client.name}» y ya no lo verá por ser asesor. Sus contactos no cambian de dueño.`
            : `«${pending?.seller.user.name ?? ''}» pasa a ser el asesor responsable de «${client.name}». El responsable actual sigue como asesor.`
        }
        confirmLabel={pending?.kind === 'remove' ? 'Quitar' : 'Hacer responsable'}
        destructive={pending?.kind === 'remove'}
        busy={remove.isPending || makeResponsible.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(pending && { ...pending, open: false })}
      />
    </Paper>
  );
}
