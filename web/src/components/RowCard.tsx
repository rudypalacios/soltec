import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { Box, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';

/** One card of a repeating group: a title with its remove button over the fields, two columns on a desktop. */
export function RowCard({
  title,
  onRemove,
  removeLabel,
  children,
}: {
  title: string;
  onRemove?: () => void;
  removeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" component="h3">
            {title}
          </Typography>
          {onRemove ? (
            <IconButton
              aria-label={removeLabel}
              onClick={onRemove}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <DeleteOutline />
            </IconButton>
          ) : null}
        </Stack>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          {children}
        </Box>
      </Stack>
    </Paper>
  );
}

export function RowField({
  label,
  value,
  onChange,
  error,
  maxLength,
  readOnly,
  required,
  type,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxLength: number;
  readOnly: boolean;
  required?: boolean;
  type?: string;
  wide?: boolean;
}) {
  return (
    <TextField
      label={label}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={Boolean(error)}
      helperText={error}
      slotProps={{ htmlInput: { maxLength, readOnly } }}
      required={required && !readOnly}
      fullWidth
      sx={wide ? { gridColumn: { sm: '1 / -1' } } : undefined}
    />
  );
}
