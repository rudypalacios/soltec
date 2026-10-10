import BlockOutlined from '@mui/icons-material/BlockOutlined';
import DriveFileRenameOutline from '@mui/icons-material/DriveFileRenameOutline';
import EditOutlined from '@mui/icons-material/EditOutlined';
import ForwardToInboxOutlined from '@mui/icons-material/ForwardToInboxOutlined';
import LockOpenOutlined from '@mui/icons-material/LockOpenOutlined';
import RestoreOutlined from '@mui/icons-material/RestoreOutlined';
import StarOutline from '@mui/icons-material/StarOutline';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';

/**
 * The icon of each action a row offers, so the same action looks the same on every list. The screens pick from
 * here instead of importing icons one by one; a new kind of action adds its icon here.
 */
export const ACTION_ICONS = {
  edit: <EditOutlined />,
  view: <VisibilityOutlined />,
  rename: <DriveFileRenameOutline />,
  resend: <ForwardToInboxOutlined />,
  deactivate: <BlockOutlined />,
  reactivate: <RestoreOutlined />,
  setDefault: <StarOutline />,
  unlock: <LockOpenOutlined />,
} as const;
