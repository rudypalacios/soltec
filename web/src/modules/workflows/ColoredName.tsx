import { Box } from '@mui/material';

/** A dot in the color of a state followed by its name. */
export function ColoredName({ state }: { state: { name: string; color: string } }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Box
        component="span"
        aria-hidden
        data-testid="state-dot"
        sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: state.color, flexShrink: 0 }}
      />
      {state.name}
    </Box>
  );
}
