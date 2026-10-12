import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { BookingError, identifierSchema, readState, serialize, writeApproval } from '../mcp/storage.js';
import { trustedEnvironment } from '../mcp/environment.js';
import { isMcpPaymentLinkUsable } from '../rules/mcp-booking.js';

export async function approveHold(holdId: string, options: { projectRoot: string; now: () => number }) {
  if (!identifierSchema.safeParse(holdId).success) throw new BookingError('INVALID_ARGUMENTS');
  const root = resolve(options.projectRoot);
  return serialize(root, async () => {
    const hold = (await readState(root)).holds.find((h) => h.holdId === holdId);
    if (!hold) throw new BookingError('UNKNOWN_HOLD');
    const nowMs = options.now(); if (!Number.isSafeInteger(nowMs)) throw new BookingError('INVALID_ARGUMENTS');
    if (!isMcpPaymentLinkUsable({ nowMs, holdExpiresAtMs: hold.expiresAtMs, linkExpiresAtMs: hold.expiresAtMs })) throw new BookingError('HOLD_EXPIRED');
    return { holdId, approvalPath: await writeApproval(root, holdId, nowMs) };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new BookingError('INVALID_ARGUMENTS');
    process.stdout.write(`${JSON.stringify(await approveHold(process.argv[2]!, trustedEnvironment()))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof BookingError ? error.code : 'STORAGE_ERROR'}\n`); process.exitCode = 1;
  }
}
