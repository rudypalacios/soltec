import CheckIcon from '@mui/icons-material/Check';
import { Box, FormControl, FormLabel } from '@mui/material';
import { color, density, statusPalette, touchQuery } from '../../theme/tokens';

/**
 * The color of a status, chosen from the eight the product offers. A color saved outside them (the API accepts any
 * `#RRGGBB`) shows as one more swatch so editing the name never silently repaints the status.
 */
export function ColorField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const known = statusPalette.some((option) => option.value.toLowerCase() === value.toLowerCase());
  const options = known
    ? statusPalette
    : [...statusPalette, { name: `Personalizado ${value}`, value }];

  return (
    <FormControl component="fieldset" disabled={disabled}>
      <FormLabel component="legend" sx={{ mb: 1 }}>
        Color
      </FormLabel>
      <Box
        role="radiogroup"
        aria-label="Color"
        // One row of eight on a desktop; two rows of four with finger-sized targets on a phone or tablet.
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: 'repeat(8, 36px)',
          [touchQuery]: { gridTemplateColumns: `repeat(4, ${density.targetTouch}px)` },
        }}
      >
        {options.map((option) => {
          const selected = option.value.toLowerCase() === value.toLowerCase();
          return (
            <Box
              key={option.value}
              component="button"
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.name}
              title={option.name}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              sx={{
                width: 36,
                height: 36,
                [touchQuery]: { width: density.targetTouch, height: density.targetTouch },
                borderRadius: '50%',
                border: 2,
                borderColor: selected ? color.ink : 'transparent',
                p: '3px',
                bgcolor: 'transparent',
                cursor: 'pointer',
                '&:focus-visible': { outline: `3px solid ${color.primary.main}`, outlineOffset: 2 },
                '&:disabled': { cursor: 'default', opacity: 0.6 },
              }}
            >
              <Box
                component="span"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  bgcolor: option.value,
                  color: color.surface,
                }}
              >
                {selected ? <CheckIcon fontSize="small" /> : null}
              </Box>
            </Box>
          );
        })}
      </Box>
    </FormControl>
  );
}
