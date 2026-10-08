import { AppBar, Box, Container, Toolbar, Typography } from '@mui/material';
import { HealthStatus } from '../modules/system/HealthStatus';

/** Empty application shell: the real navigation and screens arrive with the first milestone. */
export function App() {
  return (
    <Box>
      <AppBar
        position="static"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar>
          <Typography variant="h6" component="h1">
            Soltec
          </Typography>
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 3 }}>
        <HealthStatus />
      </Container>
    </Box>
  );
}
