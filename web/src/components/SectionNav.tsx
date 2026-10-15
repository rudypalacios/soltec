import { Box, Stack, Tab, Tabs } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useIsMobile } from './useIsMobile';

export interface SectionNavItem {
  value: string;
  label: string;
  /** Makes the tab a link (sections with their own route). Without it the tab calls `onChange`. */
  to?: string;
}

/**
 * The submenu of a screen made of sections (Configuración, Catálogo): a list at the left on a desktop and scrollable
 * tabs above the content on a phone, so every section behaves the same.
 */
export function SectionNav({
  label,
  items,
  value,
  onChange,
  placement = 'side',
  children,
}: {
  /** Accessible name of the submenu. */
  label: string;
  items: readonly SectionNavItem[];
  /** The `value` of the open section; `false` when the address matches none. */
  value: string | false;
  onChange?: (value: string) => void;
  /**
   * `side` (the default) puts the list at the left on a desktop. `top` keeps tabs above the content, for a section
   * that already sits next to a side list (the parameters inside Configuración).
   */
  placement?: 'side' | 'top';
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const vertical = placement === 'side' && !isMobile;

  return (
    <Stack
      direction={placement === 'side' ? { xs: 'column', md: 'row' } : 'column'}
      spacing={{ xs: 2, md: placement === 'side' ? 4 : 2 }}
    >
      <Tabs
        value={value}
        onChange={onChange ? (_event, next: string) => onChange(next) : undefined}
        orientation={vertical ? 'vertical' : 'horizontal'}
        variant={vertical ? 'standard' : 'scrollable'}
        allowScrollButtonsMobile
        aria-label={label}
        sx={{
          flexShrink: 0,
          minWidth: vertical ? 180 : undefined,
          borderBottom: vertical ? 0 : 1,
          borderColor: 'divider',
        }}
      >
        {items.map((item) => (
          <Tab
            key={item.value}
            {...(item.to ? { component: RouterLink, to: item.to } : {})}
            value={item.value}
            label={item.label}
            sx={{ alignItems: vertical ? 'flex-start' : undefined, minHeight: 44 }}
          />
        ))}
      </Tabs>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>{children}</Box>
    </Stack>
  );
}
