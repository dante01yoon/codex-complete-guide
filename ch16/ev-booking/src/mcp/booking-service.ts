import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v4';
import { evaluateMcpPaymentLinkRequest, filterMcpChargerCandidates, getMcpHoldTiming, resolveMcpBookingTime, resolveMcpBookingDateTime } from '../rules/mcp-booking.js';
import type { ChargerTypeCode } from '../rules/types.js';
import { decideMcpHold, mcpActiveOccupancies, mcpChargerEligible, mcpHoldAccess, mcpRequestedRange, mcpTimeAllowed, mergeMcpStatuses } from '../rules/mcp-service.js';
import type { StationRecord } from '../rules/mcp-service.js';
import { BookingError, connectorSchema, identifierSchema, readApproval, readState, serialize, writeState } from './storage.js';

const durationSchema = z.union([z.literal(30), z.literal(60), z.literal(90)]);
export const searchSchema = z.object({ location: z.literal('강남역'), connector: connectorSchema,
  timeText: z.literal('7시').optional().describe('단독 입력 시 서울 시연용 오늘 19시'),
  date: z.string().optional().describe('서울 날짜 YYYY-MM-DD, startTime과 함께 입력'),
  startTime: z.string().optional().describe('서울 시작 시각 HH:mm, date와 함께 입력'),
  durationMinutes: durationSchema }).strict().refine((args) =>
  args.timeText !== undefined
    ? args.date === undefined && args.startTime === undefined
    : args.date !== undefined && args.startTime !== undefined,
  { message: 'date/startTime 한 쌍 또는 timeText 단독으로 입력하세요.' });
export const holdInputSchema = z.object({ statId: z.string().min(1), chgerId: z.string().min(1),
  connector: connectorSchema, startMs: z.number().int().safe(), durationMinutes: durationSchema,
  requestId: identifierSchema }).strict();
export const linkSchema = z.object({ holdId: identifierSchema }).strict();
export interface BookingOptions {
  projectRoot: string; sourceDataDir: string; now: () => number; actorId: string; linkBaseUrl: string;
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value); if (!result.success) throw new BookingError('INVALID_ARGUMENTS');
  return result.data;
}
/** Trusted source adapter. Only reads saved arrays and preserves station metadata. */
async function stations(dir: string): Promise<StationRecord[]> {
  try {
    const array = z.array(z.record(z.string(), z.unknown()));
    const [raw, status] = await Promise.all(['stations.json', 'status.json'].map(async (file) =>
      array.parse(JSON.parse(await readFile(join(dir, file), 'utf8')))));
    if (!raw || !status || raw.some((r) => typeof r.statId !== 'string' || typeof r.chgerId !== 'string')) throw new Error();
    return mergeMcpStatuses(raw, status);
  } catch { throw new BookingError('SOURCE_DATA_ERROR'); }
}
function distanceMeters(record: StationRecord): number {
  const lat = Number(record.lat), lng = Number(record.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return Infinity;
  const rad = Math.PI / 180, dLat = (lat - 37.497942) * rad, dLng = (lng - 127.027621) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(37.497942 * rad) * Math.cos(lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function createMcpBookingService(options: BookingOptions) {
  const root = resolve(options.projectRoot);
  const now = (): number => {
    const value = options.now(); if (!Number.isSafeInteger(value)) throw new BookingError('INVALID_ARGUMENTS'); return value;
  };
  return {
    async searchChargers(value: unknown) {
      const args = parse(searchSchema, value), nowMs = now();
      const normalized = args.timeText !== undefined
        ? resolveMcpBookingTime({ nowMs, timeText: args.timeText, durationMinutes: args.durationMinutes })
        : resolveMcpBookingDateTime({ nowMs, date: args.date!, startTime: args.startTime!, durationMinutes: args.durationMinutes });
      if (!normalized) throw new BookingError('INVALID_ARGUMENTS');
      const { range } = normalized;
      if (!mcpTimeAllowed(range, nowMs)) throw new BookingError('INVALID_TIME');
      const [records, state] = await Promise.all([stations(options.sourceDataDir), readState(root)]);
      const candidates = records.map((r) => ({ ...r,
        charger: { statId: r.statId as string, chgerId: r.chgerId as string },
        chargerType: r.chgerType as ChargerTypeCode,
        existingEligibilityPassed: mcpChargerEligible(r), distanceMeters: distanceMeters(r),
      }));
      const occupancies = mcpActiveOccupancies(state.holds, nowMs);
      return { range, candidates: filterMcpChargerCandidates({ candidates, connector: args.connector, range, occupancies }) };
    },
    async holdCharger(value: unknown) {
      const args = parse(holdInputSchema, value);
      return serialize(root, async () => {
        const state = await readState(root), nowMs = now();
        const records = await stations(options.sourceDataDir);
        const charger = { statId: args.statId, chgerId: args.chgerId };
        const range = mcpRequestedRange(args.startMs, args.durationMinutes);
        const decision = decideMcpHold({ charger, range, connector: args.connector, requestId: args.requestId,
          actorId: options.actorId, nowMs, holds: state.holds,
          station: records.find((r) => r.statId === args.statId && r.chgerId === args.chgerId) });
        if (decision.error) throw new BookingError(decision.error);
        if (decision.existing) return decision.existing;
        const hold = { holdId: `hold-${randomUUID()}`, requestId: args.requestId, actorId: options.actorId,
          charger, connector: args.connector, range, createdAtMs: nowMs,
          expiresAtMs: getMcpHoldTiming({ createdAtMs: nowMs, nowMs }).expiresAtMs, status: 'held' as const };
        await writeState(root, { version: 1, holds: [...state.holds, hold] });
        return hold;
      });
    },
    async requestPaymentLink(value: unknown) {
      const args = parse(linkSchema, value);
      const hold = (await readState(root)).holds.find((h) => h.holdId === args.holdId);
      const denied = mcpHoldAccess(hold, options.actorId);
      if (denied || !hold) throw new BookingError(denied ?? 'UNKNOWN_HOLD');
      const approval = await readApproval(root, hold.holdId);
      const decision = evaluateMcpPaymentLinkRequest({ holdId: hold.holdId, charger: hold.charger, range: hold.range,
        nowMs: now(), holdExpiresAtMs: hold.expiresAtMs },
      { approvalFileExists: approval !== null, approvalHoldId: approval?.holdId ?? null });
      return { ...decision, linkUrl: decision.linkAllowed ? `${options.linkBaseUrl.replace(/\/$/, '')}/payment/${hold.holdId}` : null,
        expiresAtMs: hold.expiresAtMs };
    },
  };
}
