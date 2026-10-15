import { describe, expect, it } from 'vitest';
import { color } from './tokens';

/** WCAG 2.x relative luminance and contrast ratio of two #rrggbb colours. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe('design tokens', () => {
  // Text needs 4.5:1 (WCAG AA); borders of controls and graphic marks need 3:1.
  const text: [string, string, string][] = [
    ['ink on the page', color.ink, color.canvas],
    ['ink on a surface', color.ink, color.surface],
    ['ink on a muted surface', color.ink, color.surfaceMuted],
    ['muted ink on the page', color.inkMuted, color.canvas],
    ['muted ink on a surface', color.inkMuted, color.surface],
    ['muted ink on a muted surface (table header)', color.inkMuted, color.surfaceMuted],
    ['white on the primary (buttons)', color.surface, color.primary.main],
    ['white on the dark primary (hover)', color.surface, color.primary.dark],
    ['primary on a surface (links, text buttons)', color.primary.main, color.surface],
    ['primary on the page', color.primary.main, color.canvas],
    ['dark primary on its tint (active menu item)', color.primary.dark, color.primary.tint],
    ['error on a surface', color.error.main, color.surface],
    ['ink on the error tint', color.ink, color.error.tint],
    ['ink on the warning tint', color.ink, color.warning.tint],
    ['warning on its tint (the stale-cost tag)', color.warning.main, color.warning.tint],
    ['ink on the success tint', color.ink, color.success.tint],
  ];
  it.each(text)('keeps %s readable (4.5:1)', (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  const graphics: [string, string, string][] = [
    ['the border of a field', color.lineStrong, color.surface],
    ['the logo blue', color.brand, color.surface],
    ['the success dot', color.success.main, color.surface],
    ['the warning dot', color.warning.main, color.surface],
  ];
  it.each(graphics)('keeps %s visible (3:1)', (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(3);
  });
});
