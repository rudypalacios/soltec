import { Paper, Stack } from '@mui/material';
import type { FormEventHandler, ReactNode } from 'react';

/**
 * The surface of a data-entry screen: a bordered card as wide as a form reads well (560 px by default), with its fields one
 * under another. On a phone it takes the full width.
 */
export function FormPage({
  onSubmit,
  children,
  maxWidth = 560,
}: {
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  /** In px. 560 reads well for a few fields; a narrower one (a password) can ask for less. */
  maxWidth?: number;
}) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth }}>
      <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
        {children}
      </Stack>
    </Paper>
  );
}

/**
 * The buttons that close a form: the confirming one last on a desktop (where the eye ends) and first on a phone
 * (where the thumb reaches), the way `column-reverse` stacks them.
 */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column-reverse', sm: 'row' }}
      spacing={1}
      sx={{ justifyContent: { sm: 'flex-end' } }}
    >
      {children}
    </Stack>
  );
}
