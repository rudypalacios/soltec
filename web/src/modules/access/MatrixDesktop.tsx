import {
  Box,
  Checkbox,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { checkState, countWithAccess, hasAccess, setActions, setScope } from '@soltec/shared';
import { color, radius } from '../../theme/tokens';
import { ScopeSelect, SectionBadge, SectionChevron, TriStateCheckbox } from './MatrixControls';
import type { MatrixViewProps } from './PermissionMatrix';

/** The matrix on a desktop: one table per section, the actions as columns. */
export function MatrixDesktop({
  sections,
  actions,
  value,
  onChange,
  onToggleSection,
  disabled,
}: MatrixViewProps) {
  const actionCodes = actions.map((action) => action.code);

  return (
    <Stack spacing={1.5}>
      {sections.map((section) => {
        const codes = section.items.map((item) => item.code);
        const showScope = section.items.some((item) => item.scoped);
        return (
          <Paper
            key={section.id}
            variant="outlined"
            sx={{ overflow: 'hidden', borderRadius: `${radius.surface}px` }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                minHeight: 48,
                bgcolor: color.surfaceMuted,
              }}
            >
              <IconButton
                size="small"
                onClick={() => onToggleSection(section.id)}
                aria-expanded={section.open}
                aria-label={`${section.open ? 'Contraer' : 'Expandir'} ${section.label}`}
              >
                <SectionChevron open={section.open} />
              </IconButton>
              <Typography component="h3" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>
                {section.label}
              </Typography>
              <SectionBadge
                withAccess={countWithAccess(
                  value,
                  section.all.map((item) => item.code),
                )}
                total={section.all.length}
              />
            </Box>
            {section.open ? (
              <Table size="small" aria-label={`Permisos de ${section.label}`}>
                {/* The theme paints table headings grey; here the band above is the grey one. */}
                <TableHead sx={{ '& .MuiTableCell-head': { bgcolor: color.surface } }}>
                  <TableRow>
                    <TableCell padding="checkbox" sx={{ width: 48 }}>
                      <TriStateCheckbox
                        state={checkState(value, codes, actionCodes)}
                        label={`Todo en ${section.label}`}
                        onToggle={(on) => onChange(setActions(value, codes, actionCodes, on))}
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>Módulo</TableCell>
                    {actions.map((action) => (
                      <TableCell key={action.code} align="center" sx={{ width: 120 }}>
                        <Box
                          component="label"
                          sx={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                        >
                          <TriStateCheckbox
                            state={checkState(value, codes, [action.code])}
                            label={`${action.name} en toda la sección ${section.label}`}
                            onToggle={(on) => onChange(setActions(value, codes, [action.code], on))}
                            disabled={disabled}
                          />
                          {action.name}
                        </Box>
                      </TableCell>
                    ))}
                    <TableCell sx={{ width: 210 }}>
                      {showScope ? 'Alcance de los datos' : null}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {section.items.map((item) => {
                    const granted = hasAccess(value, item.code);
                    return (
                      <TableRow key={item.code}>
                        <TableCell padding="checkbox">
                          <TriStateCheckbox
                            state={checkState(value, [item.code], actionCodes)}
                            label={`Todo en ${item.name}`}
                            onToggle={(on) =>
                              onChange(setActions(value, [item.code], actionCodes, on))
                            }
                            disabled={disabled}
                          />
                        </TableCell>
                        <TableCell
                          sx={{
                            fontWeight: granted ? 600 : 400,
                            color: granted ? color.ink : color.inkMuted,
                          }}
                        >
                          {item.name}
                        </TableCell>
                        {actions.map((action) => (
                          <TableCell key={action.code} align="center" padding="checkbox">
                            <Checkbox
                              checked={(value.permissions[item.code] ?? []).includes(action.code)}
                              onChange={(event) =>
                                onChange(
                                  setActions(
                                    value,
                                    [item.code],
                                    [action.code],
                                    event.target.checked,
                                  ),
                                )
                              }
                              disabled={disabled}
                              slotProps={{
                                input: { 'aria-label': `${action.name} ${item.name}` },
                              }}
                            />
                          </TableCell>
                        ))}
                        <TableCell>
                          {item.scoped ? (
                            <ScopeSelect
                              resource={item}
                              value={value.scopes[item.code] ?? 'own'}
                              onChange={(scope) => onChange(setScope(value, item.code, scope))}
                              disabled={disabled || !granted}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : null}
          </Paper>
        );
      })}
    </Stack>
  );
}
