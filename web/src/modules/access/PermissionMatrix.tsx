import { Box, Button, Checkbox, FormControlLabel, TextField, Typography } from '@mui/material';
import { countWithAccess, hasAccess, type MatrixValue } from '@soltec/shared';
import { useMemo, useState } from 'react';
import { useIsMobile } from '../../components/useIsMobile';
import { MatrixDesktop } from './MatrixDesktop';
import { MatrixMobile } from './MatrixMobile';
import type { MatrixAction, MatrixResource } from './MatrixControls';
import { groupBySection } from './permissionSections';

export type { MatrixAction, MatrixResource } from './MatrixControls';

/** A section of the matrix as the views draw it. */
export interface MatrixSection {
  id: string;
  label: string;
  /** Every module of the section: the count says how many of them the role reaches. */
  all: MatrixResource[];
  /** The ones that match the filter: what is drawn, and what the all/none controls act on. */
  items: MatrixResource[];
  open: boolean;
}

export interface MatrixViewProps {
  sections: MatrixSection[];
  actions: MatrixAction[];
  value: MatrixValue;
  onChange: (value: MatrixValue) => void;
  onToggleSection: (id: string) => void;
  disabled?: boolean;
}

interface PermissionMatrixProps {
  resources: MatrixResource[];
  actions: MatrixAction[];
  value: MatrixValue;
  onChange: (value: MatrixValue) => void;
  disabled?: boolean;
}

/** Lower case without accents, so «seguridad» finds «Seguridad» and «organizacion» finds «Organización». */
function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * The permission matrix of a role: what it may do in each module and, for modules with owned data, whose data it
 * reaches. Grouped in sections that fold, with a filter to review a long profile; a table per section on a desktop
 * and a single continuous table on a phone. The rules (view goes with every action) live in `@soltec/shared`.
 */
export function PermissionMatrix({
  resources,
  actions,
  value,
  onChange,
  disabled,
}: PermissionMatrixProps) {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState('');
  const [onlyAccess, setOnlyAccess] = useState(false);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());

  const grouped = useMemo(() => groupBySection(resources), [resources]);
  const filtering = filter.trim() !== '' || onlyAccess;
  const sections: MatrixSection[] = grouped
    .map((section) => ({
      id: section.id,
      label: section.label,
      all: section.items,
      items: section.items.filter(
        (item) =>
          plain(item.name).includes(plain(filter.trim())) &&
          (!onlyAccess || hasAccess(value, item.code)),
      ),
      // A filter would show nothing useful over a closed section, so it opens them all.
      open: filtering || !closed.has(section.id),
    }))
    .filter((section) => section.items.length > 0);

  const toggleSection = (id: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  const total = countWithAccess(
    value,
    resources.map((resource) => resource.code),
  );

  const View = isMobile ? MatrixMobile : MatrixDesktop;

  return (
    <Box component="section" aria-labelledby="matrix-title">
      <Typography id="matrix-title" variant="h6" component="h2" sx={{ mb: 1.5 }}>
        Permisos
      </Typography>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          flexWrap: 'wrap',
          alignItems: { md: 'center' },
          gap: { xs: 1, md: 2 },
          mb: 1.5,
        }}
      >
        <TextField
          label="Filtrar módulos"
          size="small"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          sx={{ flex: { md: '1 1 240px' }, maxWidth: { md: 360 } }}
          fullWidth={isMobile}
        />
        <FormControlLabel
          label="Solo con acceso"
          control={
            <Checkbox
              checked={onlyAccess}
              onChange={(event) => setOnlyAccess(event.target.checked)}
            />
          }
        />
        <Typography variant="body2" color="text.secondary" role="status">
          {total} de {resources.length} módulos con acceso
        </Typography>
        {isMobile ? null : (
          <Box sx={{ ml: 'auto' }}>
            <Button onClick={() => setClosed(new Set())}>Expandir todo</Button>
            <Button onClick={() => setClosed(new Set(grouped.map((section) => section.id)))}>
              Contraer todo
            </Button>
          </Box>
        )}
      </Box>
      {sections.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          Ningún módulo coincide con el filtro.
        </Typography>
      ) : (
        <View
          sections={sections}
          actions={actions}
          value={value}
          onChange={onChange}
          onToggleSection={toggleSection}
          disabled={disabled}
        />
      )}
    </Box>
  );
}
