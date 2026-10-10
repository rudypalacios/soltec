import { Box } from '@mui/material';
import { useState } from 'react';
import { brandingLogoUrl, useBranding } from '../modules/settings/useSettings';

const NAME_SX = {
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: '-0.03em',
  color: 'text.primary',
} as const;

/** What shows when the company has not set a name yet. */
const DEFAULT_NAME = 'Dashboard';

/**
 * The brand of this installation: the company's logo if it has one, else its commercial name, else "Dashboard".
 * While the brand is not known yet (first visit, nothing remembered) it shows nothing but keeps its height, so the
 * screen never shows a brand that is not the company's and nothing below it moves.
 */
export function Brand() {
  const branding = useBranding().data;

  if (!branding) {
    return <Box component="span" aria-hidden sx={{ display: 'block', height: 40 }} />;
  }
  if (branding.logo_version) {
    return (
      <CompanyLogo
        key={branding.logo_version}
        version={branding.logo_version}
        name={branding.trade_name}
      />
    );
  }
  return <NameMark name={branding.trade_name} />;
}

/** The logo image; if the browser cannot load it the name stands in, so the header never shows a broken image. */
function CompanyLogo({ version, name }: { version: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <NameMark name={name} />;
  }
  return (
    <Box
      component="img"
      src={brandingLogoUrl(version)}
      alt={name || DEFAULT_NAME}
      onError={() => setFailed(true)}
      // The file is at most 512 px wide; the header shows it small. A fixed height avoids a jump while it loads.
      sx={{ display: 'block', height: 40, maxWidth: 180, objectFit: 'contain' }}
    />
  );
}

function NameMark({ name }: { name: string }) {
  return (
    <Box
      component="span"
      sx={{
        ...NAME_SX,
        display: 'flex',
        alignItems: 'center',
        height: 40,
        lineHeight: 1.1,
        maxWidth: 200,
      }}
    >
      {name || DEFAULT_NAME}
    </Box>
  );
}
