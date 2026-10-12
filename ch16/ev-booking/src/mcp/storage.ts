import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, unlink, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v4';

export class BookingError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export const connectorSchema = z.enum(['DC차데모','AC완속','AC3상','DC콤보','NACS','DC콤보2(버스전용)']);
export const identifierSchema = z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/);
const holdSchema = z.object({
  holdId: identifierSchema, requestId: identifierSchema, actorId: z.string().min(1),
  charger: z.object({ statId: z.string().min(1), chgerId: z.string().min(1) }).strict(),
  connector: connectorSchema,
  range: z.object({ startMs: z.number().int().safe(), endMs: z.number().int().safe() }).strict(),
  createdAtMs: z.number().int().safe(), expiresAtMs: z.number().int().safe(), status: z.literal('held'),
}).strict().refine((h) => h.range.startMs < h.range.endMs && h.expiresAtMs === h.createdAtMs + 600000);
const stateSchema = z.object({ version: z.literal(1), holds: z.array(holdSchema) }).strict()
  .refine((s) => new Set(s.holds.map((h) => h.holdId)).size === s.holds.length);
export type StoredHold = z.infer<typeof holdSchema>;
export type BookingState = z.infer<typeof stateSchema>;
export const statePath = (root: string): string => join(root, '.local/mcp-booking/state.json');
export const approvalPath = (root: string, id: string): string => join(root, '.codex/approvals', `${id}.json`);
const locks = new Map<string, Promise<void>>();
export async function serialize<T>(root: string, work: () => Promise<T>): Promise<T> {
  const key = await realpath(resolve(root));
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((done) => { release = done; });
  locks.set(key, pending);
  await previous;
  try { return await work(); } finally {
    release(); if (locks.get(key) === pending) locks.delete(key);
  }
}
function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
export async function readState(root: string): Promise<BookingState> {
  let text: string;
  try { text = await readFile(statePath(root), 'utf8'); }
  catch (error) { if (missing(error)) return { version: 1, holds: [] }; throw new BookingError('STORAGE_ERROR'); }
  try { return stateSchema.parse(JSON.parse(text)); } catch { throw new BookingError('STORAGE_ERROR'); }
}
export async function writeState(root: string, state: BookingState): Promise<void> {
  const path = statePath(root); const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, path);
  } catch { throw new BookingError('STORAGE_ERROR'); }
  finally { await unlink(temp).catch(() => {}); }
}
/** Approval components must be ordinary directories. No symlink evidence is accepted. */
async function approvalDirectories(root: string, create: boolean): Promise<boolean> {
  for (const path of [join(root, '.codex'), join(root, '.codex/approvals')]) {
    if (create) {
      try { await mkdir(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
    try { const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) return false; }
    catch (error) { if (missing(error)) return false; throw error; }
  }
  return true;
}
export async function readApproval(root: string, id: string): Promise<{ holdId: string; approvedAtMs: number } | null> {
  try {
    if (!await approvalDirectories(root, false)) return null;
    const file = await open(approvalPath(root, id), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!(await file.stat()).isFile()) return null;
      const approval = z.object({ holdId: identifierSchema, approvedAtMs: z.number().int().safe() }).strict().parse(JSON.parse(await file.readFile('utf8')));
      return approval.holdId === id ? approval : null;
    } finally { await file.close(); }
  } catch { return null; }
}
/** Called by the human CLI only; the MCP service never invokes this writer. */
export async function writeApproval(root: string, id: string, nowMs: number): Promise<string> {
  const path = approvalPath(root, id);
  try {
    if (!await approvalDirectories(root, true)) throw new BookingError('STORAGE_ERROR');
    if (await readApproval(root, id)) return path;
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(JSON.stringify({ holdId: id, approvedAtMs: nowMs })); await handle.sync(); }
    finally { await handle.close(); }
    return path;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST' && await readApproval(root, id)) return path;
    throw new BookingError('STORAGE_ERROR');
  }
}
