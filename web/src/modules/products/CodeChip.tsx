import { Box } from '@mui/material';
import { Highlight } from '../../components/Highlight';
import { color } from '../../theme/tokens';

/** A product code as a tag of its own, easy to find while scrolling a long list. */
export function CodeChip({ code, match }: { code: string; match?: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        bgcolor: color.primary.tint,
        color: color.primary.dark,
        fontWeight: 600,
        fontSize: '0.8125rem',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.2px',
        borderRadius: 0.75,
        px: 1,
        py: 0.125,
        whiteSpace: 'nowrap',
      }}
    >
      <Highlight text={code} match={match} />
    </Box>
  );
}
