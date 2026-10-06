import { resolve } from 'node:path';

/** Safe both as a filename and as the sole argument printed in the human command. */
export function validHoldId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}
export function approvalPath(projectDirectory: string, holdId: string): string {
  if (!validHoldId(holdId)) throw new Error('Invalid hold identifier');
  return resolve(projectDirectory, '.codex', 'approvals', holdId);
}
