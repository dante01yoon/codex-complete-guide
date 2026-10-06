import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { HOLD_DURATION_MS } from '../rules/booking.js';

const integer = z.number().int().safe();
export const holdSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
  userId: z.string().min(1), statId: z.string().min(1), chgerId: z.string().min(1),
  connector: z.enum(['DC차데모', 'AC완속', 'AC3상', 'DC콤보', 'NACS', 'DC콤보2(버스전용)']),
  startMs: integer, endMs: integer, createdMs: integer, expiresMs: integer,
}).refine(h => h.endMs > h.startMs && h.expiresMs === h.createdMs + HOLD_DURATION_MS);
const snapshotSchema = z.object({
  version: z.literal(1), sessionId: z.string().uuid(),
  clock: z.object({ policyMs: integer, realMs: integer }),
  holds: z.array(holdSchema),
  orders: z.array(z.object({ orderId: z.string().uuid(), holdId: z.string(),
    userId: z.string().min(1), amount: z.literal(3000), mode: z.literal('test') })),
  confirmedReservations: z.array(z.object({ id: z.string(), userId: z.string(),
    statId: z.string(), chgerId: z.string(), startMs: integer, endMs: integer })),
  blockedChargers: z.array(z.string()),
});
export type CheckoutSnapshot = z.infer<typeof snapshotSchema>;

/** Runtime handoff only, outside source data; never restores MCP memory. */
export function sharedCheckoutFile(projectDirectory: string): string {
  const project = createHash('sha256').update(resolve(projectDirectory)).digest('hex').slice(0, 20);
  return resolve(tmpdir(), `ev-booking-${project}`, 'booking-runtime.json');
}
export async function readCheckoutSnapshot(path: string): Promise<CheckoutSnapshot> {
  const snapshot = snapshotSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  if (new Set(snapshot.holds.map(h => h.id)).size !== snapshot.holds.length ||
      new Set(snapshot.orders.map(o => o.orderId)).size !== snapshot.orders.length ||
      snapshot.orders.some(o => !snapshot.holds.some(h => h.id === o.holdId && h.userId === o.userId))) {
    throw new Error('INVALID_CHECKOUT_SNAPSHOT');
  }
  return snapshot;
}
export async function writeCheckoutSnapshot(path: string, snapshot: CheckoutSnapshot): Promise<void> {
  snapshotSchema.parse(snapshot);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}
