import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { Button, IconButton } from '@mui/material';
import { useState } from 'react';
import { useIsMobile } from '../../components/useIsMobile';
import { useCan } from '../access/SessionContext';
import { BoardColumnsDialog } from './BoardColumnsDialog';
import { useBoardColumns, useWorkflowStates } from './useWorkflowStates';
import type { WorkflowCode } from './workflowFlows';

/**
 * The «Configurar tablero» entry, for the screens that show the board of a flow and for the flow screen itself. It is
 * only there for who may edit flows, and the dialog opens once the states and the columns have been read.
 */
export function ConfigureBoardButton({
  workflow,
  iconOnPhone = false,
}: {
  workflow: WorkflowCode;
  /** On a phone the button shrinks to its icon, to leave room in a crowded header. */
  iconOnPhone?: boolean;
}) {
  const can = useCan();
  // Another component, so the flow is not read for someone who may not edit it.
  return can('workflow_states', 'edit') ? (
    <Configure workflow={workflow} iconOnPhone={iconOnPhone} />
  ) : null;
}

function Configure({ workflow, iconOnPhone }: { workflow: WorkflowCode; iconOnPhone: boolean }) {
  const isMobile = useIsMobile();
  const states = useWorkflowStates(workflow);
  const columns = useBoardColumns(workflow);
  const [open, setOpen] = useState(false);
  const ready = states.data !== undefined && columns.data !== undefined;

  return (
    <>
      {isMobile && iconOnPhone ? (
        <IconButton
          aria-label="Configurar tablero"
          disabled={!ready}
          onClick={() => setOpen(true)}
          sx={{ width: 44, height: 44, border: 1, borderColor: 'divider', borderRadius: 1.5 }}
        >
          <SettingsOutlinedIcon />
        </IconButton>
      ) : (
        <Button
          variant="outlined"
          color="inherit"
          startIcon={<SettingsOutlinedIcon />}
          disabled={!ready}
          onClick={() => setOpen(true)}
        >
          Configurar tablero
        </Button>
      )}
      {open && states.data && columns.data ? (
        <BoardColumnsDialog
          workflow={workflow}
          states={states.data}
          columns={columns.data}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
