import { Box } from '@mui/material';
import { color } from '../theme/tokens';

// Seven dots on an arc, growing to the middle: the mark's shape, drawn in the logo's blue.
const DOTS = [
  { x: 4, y: 9, r: 1.6 },
  { x: 14, y: 5.8, r: 2 },
  { x: 24, y: 3.4, r: 2.6 },
  { x: 34, y: 2.6, r: 3.2 },
  { x: 44, y: 3.4, r: 2.6 },
  { x: 54, y: 5.8, r: 2 },
  { x: 64, y: 9, r: 1.6 },
];

/**
 * The product's mark: the dotted arc over the name. A stand-in drawn in code until the company's own logo
 * (a file in the configuration, slice 1.3) replaces it.
 */
export function Brand() {
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
      <Box
        component="span"
        sx={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          color: 'text.primary',
          mt: '-1px',
        }}
      >
        soltec
      </Box>
    </Box>
  );
}
