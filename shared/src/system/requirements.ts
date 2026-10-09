export type CheckStatus = 'pass' | 'warn' | 'fail';
export type RequirementsVerdict = 'ready' | 'ready_with_warnings' | 'blocked';

export interface RequirementCheck {
  id: string;
  group: string;
  status: CheckStatus;
  message: string;
  hint: string | null;
}

/** What GET /api/system/requirements returns. The route is outside the public contract, so it is typed by hand. */
export interface RequirementsReport {
  status: RequirementsVerdict;
  summary: Record<CheckStatus, number>;
  checks: RequirementCheck[];
}

export interface CheckGroup {
  group: string;
  checks: RequirementCheck[];
}

const VERDICTS: readonly string[] = ['ready', 'ready_with_warnings', 'blocked'];
const STATUSES: readonly string[] = ['pass', 'warn', 'fail'];

function isCheck(value: unknown): value is RequirementCheck {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const check = value as Record<string, unknown>;
  return (
    typeof check.id === 'string' &&
    typeof check.group === 'string' &&
    typeof check.message === 'string' &&
    typeof check.status === 'string' &&
    STATUSES.includes(check.status) &&
    (check.hint === null || typeof check.hint === 'string')
  );
}

/** Checks the shape of an untrusted response before the screens rely on it. */
export function isRequirementsReport(value: unknown): value is RequirementsReport {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const report = value as Record<string, unknown>;
  return (
    typeof report.status === 'string' &&
    VERDICTS.includes(report.status) &&
    typeof report.summary === 'object' &&
    report.summary !== null &&
    Array.isArray(report.checks) &&
    report.checks.every(isCheck)
  );
}

/** Groups the checks keeping the order in which each group first appears. */
export function groupChecks(checks: readonly RequirementCheck[]): CheckGroup[] {
  const groups = new Map<string, RequirementCheck[]>();
  for (const check of checks) {
    const members = groups.get(check.group);
    if (members) {
      members.push(check);
    } else {
      groups.set(check.group, [check]);
    }
  }
  return [...groups].map(([group, members]) => ({ group, checks: members }));
}
