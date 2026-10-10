import { Box } from '@mui/material';
import { useState } from 'react';
import { brandingLogoUrl, useBranding } from '../modules/settings/useSettings';
import { color } from '../theme/tokens';

// Seven dots on an arc, growing to the middle: the product's own mark, drawn in code.
const DOTS = [
  { x: 4, y: 9, r: 1.6 },
  { x: 14, y: 5.8, r: 2 },
  { x: 24, y: 3.4, r: 2.6 },
  { x: 34, y: 2.6, r: 3.2 },
  { x: 44, y: 3.4, r: 2.6 },
  { x: 54, y: 5.8, r: 2 },
  { x: 64, y: 9, r: 1.6 },
];

const NAME_SX = {
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: '-0.03em',
  color: 'text.primary',
} as const;

/**
 * The brand of this installation: the company's logo when it uploaded one, else its name, else the product's own
 * mark (the dotted arc over "soltec") while nothing is configured yet. While the brand loads, or if it cannot be
 * read, the product's mark shows.
 */
export function Brand() {
  const branding = useBranding().data;
  const name = branding?.trade_name ?? '';

  if (branding?.logo_version) {
    return <CompanyLogo key={branding.logo_version} version={branding.logo_version} name={name} />;
  }
  return name ? <NameMark name={name} /> : <ProductMark />;
}

/** The logo image; if the browser cannot load it the name stands in, so the header never shows a broken image. */
function CompanyLogo({ version, name }: { version: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return name ? <NameMark name={name} /> : <ProductMark />;
  }
  return (
    <Box
      component="img"
      src={brandingLogoUrl(version)}
      alt={name || 'Logo de la empresa'}
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
      sx={{ ...NAME_SX, lineHeight: 1.1, display: 'inline-block', maxWidth: 200 }}
    >
      {name}
    </Box>
  );
}

function ProductMark() {
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}
    >
      <svg width="68" height="13" viewBox="0 0 68 13" aria-hidden="true" focusable="false">
        {DOTS.map((dot) => (
          <circle key={dot.x} cx={dot.x} cy={dot.y} r={dot.r} fill={color.brand} />
        ))}
      </svg>
      <Box component="span" sx={{ ...NAME_SX, mt: '-1px' }}>
        soltec
      </Box>
    </Box>
  );
}
