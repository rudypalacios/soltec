/**
 * Design tokens (ADR-0018). Raw values only: `theme.ts` turns them into the MUI theme and `theme.test.ts` checks
 * that the pairs used together keep a readable contrast.
 *
 * The palette is the product's. `brand` is the blue of the Soltec logo; the per-company logo and name come from the
 * configuration (slice 1.3), not from here.
 */
export const color = {
  /** The logo's blue. As text on white it falls short of 4.5:1, so it is for decoration (marks, illustrations). */
  brand: '#0080C8',
  primary: {
    main: '#0B6BB0',
    dark: '#085A95',
    light: '#3D8EC9',
    /** Background of the active menu item and of selected rows. */
    tint: '#E3F0FA',
  },
  ink: '#1F2328',
  inkMuted: '#566370',
  canvas: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceMuted: '#EDF1F4',
  /** Dividers and borders of cards and tables. */
  line: '#D8DEE4',
  /** Borders of inputs: they have to reach 3:1 against the surface to be seen. */
  lineStrong: '#7C8996',
  success: { main: '#1E7A4C', tint: '#E3F4EA' },
  warning: { main: '#9A5800', tint: '#FFF1D6' },
  error: { main: '#B3261E', tint: '#FCE8E6' },
} as const;

/**
 * The eight colors a client status can take (slice 2.1). The API accepts any `#RRGGBB`; the screen offers these so the
 * statuses stay readable together. Every one reaches 4.5:1 against white, so the name beside the dot can use it too.
 */
export const statusPalette = [
  { name: 'Azul', value: '#0B6BB0' },
  { name: 'Turquesa', value: '#00796B' },
  { name: 'Verde', value: '#1E7A4C' },
  { name: 'Ámbar', value: '#9A5800' },
  { name: 'Gris', value: '#7C8996' },
  { name: 'Rojo', value: '#B3261E' },
  { name: 'Morado', value: '#6B4FA3' },
  { name: 'Magenta', value: '#B0306A' },
] as const;

export const font = {
  family:
    '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
} as const;

export const radius = {
  /** Buttons, inputs, chips. */
  control: 6,
  /** Cards, tables, dialogs. */
  surface: 12,
} as const;

/**
 * Where the touch sizes apply: a coarse pointer (a finger, whatever the width) or a narrow window. A tablet in
 * landscape is wide and still needs big targets; a narrow desktop window does not, but costs nothing to serve.
 */
export const touchQuery = '@media (pointer: coarse), (max-width: 899.95px)';

/** Heights in px: desktop is compact (40) and touch is at least what a finger needs (44 for targets, 48 for fields). */
export const density = {
  fieldDesktop: 40,
  fieldTouch: 48,
  targetTouch: 44,
} as const;
