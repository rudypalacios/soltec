import { describe, expect, it } from 'vitest';
import { groupChecks, isRequirementsReport, type RequirementCheck } from './requirements';

const check = (id: string, group: string): RequirementCheck => ({
  id,
  group,
  status: 'pass',
  message: 'ok',
  hint: null,
});

describe('groupChecks', () => {
  it('groups by group keeping the order of first appearance', () => {
    const groups = groupChecks([check('a', 'php'), check('b', 'db'), check('c', 'php')]);

    expect(groups.map((g) => g.group)).toEqual(['php', 'db']);
    expect(groups[0]?.checks.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('returns nothing for no checks', () => {
    expect(groupChecks([])).toEqual([]);
  });
});

describe('isRequirementsReport', () => {
  const valid = {
    status: 'ready_with_warnings',
    summary: { pass: 1, warn: 1, fail: 0 },
    checks: [check('a', 'php'), { ...check('b', 'php'), status: 'warn', hint: 'Do this.' }],
  };

  it('accepts what the API returns', () => {
    expect(isRequirementsReport(valid)).toBe(true);
  });

  it.each([
    ['null', null],
    ['an unknown verdict', { ...valid, status: 'fine' }],
    [
      'a check with an unknown status',
      { ...valid, checks: [{ ...check('a', 'php'), status: 'meh' }] },
    ],
    [
      'a check without message',
      { ...valid, checks: [{ id: 'a', group: 'php', status: 'pass', hint: null }] },
    ],
    ['no checks list', { status: 'ready', summary: {} }],
  ])('rejects %s', (_name, value) => {
    expect(isRequirementsReport(value)).toBe(false);
  });
});
