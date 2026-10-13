import {
  Box,
  Button,
  Checkbox,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { checkState, countWithAccess, hasAccess, setActions, setScope } from '@soltec/shared';
import { color, density, radius } from '../../theme/tokens';
import {
  ScopeSelect,
  SectionBadge,
  SectionChevron,
  visuallyHidden,
  type MatrixAction,
} from './MatrixControls';
import type { MatrixViewProps } from './PermissionMatrix';

/** The AppBar is fixed: the column headings stick right below it. */
const STICKY_TOP = { xs: 56, sm: 64 };

/** A column of checkboxes: 2 px more than the 44 px target, so the heading «Desact.» has room. */
const ACTION_COLUMN = density.targetTouch + 2;

/** «Desactivar» does not fit in a 44 px column: it is shortened on screen and read in full. */
function ColumnName({ action }: { action: MatrixAction }) {
  if (action.name.length <= 8) {
    return <>{action.name}</>;
  }
  return (
    <>
      <span aria-hidden="true">{action.name.slice(0, 6)}.</span>
      <span style={visuallyHidden}>{action.name}</span>
    </>
  );
}

/**
 * The matrix on a phone: a single continuous table, not a card per module. The headings stay on top, each section is
 * a band with its count and an all/none button, and each module is a row of 44 px checkboxes. The scope shows below
 * the row of a module that has one and already has access.
 */
export function MatrixMobile({
  sections,
  actions,
  value,
  onChange,
  onToggleSection,
  disabled,
}: MatrixViewProps) {
  const actionCodes = actions.map((action) => action.code);
  const columns = actions.length + 1;

  return (
    <Paper variant="outlined" sx={{ borderRadius: `${radius.surface}px`, overflow: 'clip' }}>
      <Table
        size="small"
        aria-label="Permisos del perfil"
        // The band that follows (or the edge of the card) closes each section: no line under its last row.
        sx={{ tableLayout: 'fixed', '& tbody > tr:last-of-type > *': { borderBottom: 0 } }}
      >
        <colgroup>
          <col />
          {actions.map((action) => (
            <col key={action.code} style={{ width: ACTION_COLUMN }} />
          ))}
        </colgroup>
        <TableHead>
          <TableRow
            sx={{
              '& th': {
                position: 'sticky',
                top: STICKY_TOP,
                zIndex: 2,
                bgcolor: color.surface,
                borderBottom: `1px solid ${color.lineStrong}`,
                fontSize: 11,
                color: color.inkMuted,
                px: 0,
              },
            }}
          >
            <TableCell component="th" scope="col" sx={{ pl: 1.5 }}>
              Módulo
            </TableCell>
            {actions.map((action) => (
              <TableCell key={action.code} component="th" scope="col" align="center">
                <ColumnName action={action} />
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        {sections.map((section) => {
          const everything = section.items.every(
            (item) => checkState(value, [item.code], actionCodes) === 'all',
          );
          const codes = section.items.map((item) => item.code);
          return (
            <TableBody key={section.id}>
              <TableRow>
                <TableCell
                  component="th"
                  scope="rowgroup"
                  colSpan={columns}
                  sx={{ p: 0, bgcolor: color.surfaceMuted }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pr: 0.5 }}>
                    <Button
                      onClick={() => onToggleSection(section.id)}
                      aria-expanded={section.open}
                      color="inherit"
                      startIcon={<SectionChevron open={section.open} />}
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        minHeight: 48,
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        fontWeight: 600,
                        '& .label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                      }}
                    >
                      <span className="label">{section.label}</span>
                    </Button>
                    <SectionBadge
                      withAccess={countWithAccess(
                        value,
                        section.all.map((item) => item.code),
                      )}
                      total={section.all.length}
                    />
                    <Button
                      onClick={() => onChange(setActions(value, codes, actionCodes, !everything))}
                      disabled={disabled}
                      aria-label={`${everything ? 'Quitar todo' : 'Marcar todo'} en ${section.label}`}
                      sx={{ minHeight: 44, minWidth: 44, fontWeight: 600 }}
                    >
                      {everything ? 'Ninguno' : 'Todo'}
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
              {section.open
                ? section.items.flatMap((item) => {
                    const granted = hasAccess(value, item.code);
                    const rows = [
                      <TableRow key={item.code}>
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{
                            pl: 1.5,
                            pr: 0.5,
                            fontWeight: granted ? 600 : 400,
                            color: granted ? color.ink : color.inkMuted,
                          }}
                        >
                          {item.name}
                        </TableCell>
                        {actions.map((action) => (
                          // The theme gives every cell a 10/12 px padding that also beats `padding="none"`.
                          <TableCell key={action.code} align="center" sx={{ p: 0 }}>
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
                              // «&&» wins over the touch padding the theme gives every checkbox (ADR-0018):
                              // without it the box grows past its column and covers the row divider.
                              sx={{
                                '&&': {
                                  width: density.targetTouch,
                                  height: density.targetTouch,
                                  p: 0,
                                },
                              }}
                              slotProps={{
                                input: { 'aria-label': `${action.name} ${item.name}` },
                              }}
                            />
                          </TableCell>
                        ))}
                      </TableRow>,
                    ];
                    if (item.scoped && granted) {
                      rows.push(
                        <TableRow key={`${item.code}:scope`}>
                          <TableCell colSpan={columns} sx={{ pt: 0, pb: 1.5, px: 1.5 }}>
                            <ScopeSelect
                              resource={item}
                              value={value.scopes[item.code] ?? 'own'}
                              onChange={(scope) => onChange(setScope(value, item.code, scope))}
                              disabled={disabled}
                            />
                          </TableCell>
                        </TableRow>,
                      );
                    }
                    return rows;
                  })
                : null}
            </TableBody>
          );
        })}
      </Table>
    </Paper>
  );
}
