import CancelOutlined from '@mui/icons-material/CancelOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import CodeOutlined from '@mui/icons-material/CodeOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import MailOutline from '@mui/icons-material/MailOutline';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import StorageOutlined from '@mui/icons-material/StorageOutlined';
import WarningAmber from '@mui/icons-material/WarningAmber';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { groupChecks, type CheckStatus, type RequirementCheck } from '@soltec/shared';
import type { ReactElement } from 'react';
import { checkTitle, groupTitle, statusLabels, verdictLabels } from './requirementLabels';
import { useRequirements } from './useRequirements';

const statusIcons: Record<CheckStatus, ReactElement> = {
  pass: <CheckCircleOutline color="success" titleAccess={statusLabels.pass} />,
  warn: <WarningAmber color="warning" titleAccess={statusLabels.warn} />,
  fail: <CancelOutlined color="error" titleAccess={statusLabels.fail} />,
};

const groupIcons: Record<string, ReactElement> = {
  php: <CodeOutlined />,
  config: <SettingsOutlined />,
  storage: <FolderOutlined />,
  database: <StorageOutlined />,
  mail: <MailOutline />,
};

const verdictSeverity = {
  ready: 'success',
  ready_with_warnings: 'warning',
  blocked: 'error',
} as const;

function CheckRow({ check }: { check: RequirementCheck }) {
  return (
    <TableRow>
      <TableCell sx={{ width: 48 }}>{statusIcons[check.status]}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>{checkTitle(check.id)}</TableCell>
      <TableCell>
        {check.message}
        {check.status !== 'pass' && check.hint ? (
          <Typography variant="body2" color="text.secondary">
            {check.hint}
          </Typography>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

/** Installer-style checklist of what the server must provide, drawn from GET /api/system/requirements. */
export function RequirementsPage() {
  const { data, isPending, isError } = useRequirements();

  if (isPending) {
    return <CircularProgress aria-label="Revisando el servidor" />;
  }
  if (isError) {
    return <Alert severity="error">No se pudo obtener la lista de requisitos del servidor.</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h2">
        Requisitos del servidor
      </Typography>
      <Alert severity={verdictSeverity[data.status]}>{verdictLabels[data.status]}</Alert>
      <Stack direction="row" spacing={1}>
        {(['pass', 'warn', 'fail'] as const).map((status) => (
          <Chip
            key={status}
            icon={statusIcons[status]}
            label={`${statusLabels[status]}: ${data.summary[status]}`}
            variant="outlined"
          />
        ))}
      </Stack>
      {groupChecks(data.checks).map(({ group, checks }) => (
        <Paper key={group} variant="outlined">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
            {groupIcons[group]}
            <Typography variant="h6" component="h3">
              {groupTitle(group)}
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small" aria-label={groupTitle(group)}>
              <TableHead>
                <TableRow>
                  <TableCell>Estado</TableCell>
                  <TableCell>Requisito</TableCell>
                  <TableCell>Detalle</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {checks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ))}
    </Stack>
  );
}
