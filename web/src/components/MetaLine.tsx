import { Box, Typography } from '@mui/material';

/**
 * The secondary facts of a card (brand, suppliers, group), each of which can be very long. They share the line when they
 * fit and wrap to the next when they do not, and each one is cut with «…» on its own: a long brand cannot push the
 * supplier and the group out of sight. The whole text of each is in its `title` and on the detail screen.
 */
export function MetaLine({ parts }: { parts: (string | null | undefined)[] }) {
  const shown = parts.filter((part): part is string => Boolean(part));
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 0.75 }}>
      {shown.map((text, index) => (
        <Box
          key={`${index}:${text}`}
          component="span"
          sx={{ display: 'flex', maxWidth: '100%', minWidth: 0, columnGap: 0.75 }}
        >
          <Typography
            component="span"
            variant="body2"
            color="text.secondary"
            title={text}
            noWrap
            sx={{ minWidth: 0 }}
          >
            {text}
          </Typography>
          {index < shown.length - 1 ? (
            <Typography component="span" variant="body2" color="text.secondary" aria-hidden>
              ·
            </Typography>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
