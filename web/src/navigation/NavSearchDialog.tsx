import SearchIcon from '@mui/icons-material/Search';
import { Box, Dialog, InputBase, List, ListItem, Typography } from '@mui/material';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Highlight } from '../components/Highlight';
import { useCan } from '../modules/access/SessionContext';
import { color } from '../theme/tokens';
import { groupLabel, matchTargets, searchTargets } from './navigation';

/**
 * «Buscar pantalla»: a box over the screen that finds the screens and sections the person may open, by typing part of
 * their name. It looks for screens, not for data. ↑ and ↓ move, Enter opens, Esc closes.
 */
export function NavSearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const can = useCan();
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const targets = useMemo(() => searchTargets(can), [can]);
  const results = useMemo(() => matchTargets(targets, query), [targets, query]);
  const current = results[Math.min(active, results.length - 1)];

  const close = () => {
    setQuery('');
    setActive(0);
    onClose();
  };
  const go = (path: string) => {
    close();
    navigate(path);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(results.length === 0 ? 0 : (active + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(results.length === 0 ? 0 : (active - 1 + results.length) % results.length);
    } else if (event.key === 'Enter' && current) {
      event.preventDefault();
      go(current.path);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth="sm"
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
      slotProps={{
        paper: { 'aria-label': 'Buscar pantalla', sx: { mt: { xs: 2, md: 12 } } },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, minHeight: 60 }}>
        <SearchIcon sx={{ color: 'text.secondary' }} />
        <InputBase
          autoFocus
          fullWidth
          placeholder="Buscar pantalla…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          slotProps={{
            input: {
              role: 'combobox',
              'aria-label': 'Buscar pantalla',
              'aria-expanded': true,
              'aria-controls': listId,
              'aria-activedescendant': current ? `${listId}-${current.key}` : undefined,
              'aria-autocomplete': 'list',
              maxLength: 60,
            },
          }}
          sx={{ fontSize: 16 }}
        />
      </Box>
      <List
        id={listId}
        role="listbox"
        aria-label="Resultados"
        sx={{ borderTop: 1, borderColor: 'divider', p: 1, maxHeight: 360, overflowY: 'auto' }}
      >
        {results.length === 0 ? (
          <ListItem sx={{ color: 'text.secondary', minHeight: 48 }}>
            No hay ninguna pantalla con ese nombre.
          </ListItem>
        ) : (
          results.map((target) => {
            const selected = target.key === current?.key;
            return (
              <ListItem
                key={target.key}
                id={`${listId}-${target.key}`}
                role="option"
                aria-selected={selected}
                onClick={() => go(target.path)}
                onMouseMove={() => setActive(results.indexOf(target))}
                sx={{
                  minHeight: 48,
                  gap: 1.5,
                  borderRadius: 1.5,
                  cursor: 'pointer',
                  justifyContent: 'space-between',
                  bgcolor: selected ? color.primary.tint : undefined,
                  color: selected ? color.primary.dark : undefined,
                  fontWeight: selected ? 600 : 400,
                }}
              >
                <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
                  <Highlight text={target.label} match={query} />
                </Box>
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ color: 'text.secondary', flexShrink: 0, fontWeight: 400 }}
                >
                  {groupLabel(target.groupId)}
                </Typography>
              </ListItem>
            );
          })
        )}
      </List>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          gap: 2,
          px: 2.5,
          py: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          color: 'text.secondary',
          fontSize: 12,
        }}
      >
        <span>↑ ↓ para moverse</span>
        <span>Enter para abrir</span>
        <span>Esc para cerrar</span>
      </Box>
    </Dialog>
  );
}
