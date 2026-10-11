/**
 * A name a person can recognize in their list of sessions («Chrome en Windows»), taken from what the browser says
 * about itself. The user agent is a hint, not a promise: whatever cannot be read falls back to «Navegador web».
 */
export function describeBrowser(userAgent: string): string {
  const browser = browserOf(userAgent);
  const system = systemOf(userAgent);
  if (browser === null) {
    return 'Navegador web';
  }
  return system === null ? browser : `${browser} en ${system}`;
}

// Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

// Order matters: an iPhone says "like Mac OS X" and Android says "Linux".
const SYSTEMS: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

function browserOf(userAgent: string): string | null {
  return BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}

function systemOf(userAgent: string): string | null {
  return SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}
