import { describe, expect, it } from 'vitest';
import { describeBrowser } from './deviceName';

const AGENTS: [string, string][] = [
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Chrome en Windows',
  ],
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    'Edge en Windows',
  ],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Safari en macOS',
  ],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Safari en iPhone',
  ],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
    'Chrome en iPhone',
  ],
  [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    'Chrome en Android',
  ],
  ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox en Linux'],
];

describe('describeBrowser', () => {
  it.each(AGENTS)('reads %s', (agent, expected) => {
    expect(describeBrowser(agent)).toBe(expected);
  });

  it('keeps the generic name when the browser says nothing useful', () => {
    expect(describeBrowser('')).toBe('Navegador web');
    expect(describeBrowser('curl/8.5.0')).toBe('Navegador web');
  });

  it('names the browser alone when only the system is unknown', () => {
    expect(describeBrowser('Mozilla/5.0 (Unknown) Firefox/131.0')).toBe('Firefox');
  });
});
