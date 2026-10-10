import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { theme } from '../theme/theme';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(destructive?: boolean) {
  render(
    <ThemeProvider theme={theme}>
      <ConfirmDialog
        open
        title="Título"
        message="Mensaje"
        confirmLabel="Confirmar"
        destructive={destructive}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />
    </ThemeProvider>,
  );
  return screen.getByRole('button', { name: 'Confirmar' });
}

describe('ConfirmDialog', () => {
  it('uses the primary colour unless the action is destructive', () => {
    expect(renderDialog()).toHaveClass('MuiButton-colorPrimary');
  });

  it('turns the confirm button red for a destructive action', () => {
    expect(renderDialog(true)).toHaveClass('MuiButton-colorError');
  });
});
