import type { ConnectorKind } from '../rules/types.js';
import { resolve } from 'node:path';
import { z } from 'zod';
import { chargerEligible, holdIsValid, HOLD_DURATION_MS, slotTimeAllowed } from '../rules/booking.js';
import { hasReservationOverlap } from '../rules/overlap.js';
import { approvalPath, validHoldId } from './approval-path.js';

export interface Charger {
  statId: string; chgerId: string; statNm: string; addr: string;
  lat: string; lng: string; chgerType: string; useTime: string;
  limitYn: string; delYn: string; stat: string; statUpdDt: string;
}
export interface Hold {
  id: string; userId: string; statId: string; chgerId: string;
  connector: ConnectorKind; startMs: number; endMs: number;
  createdMs: number; expiresMs: number;
}
export interface Reservation {
  id: string; userId: string; statId: string; chgerId: string;
  startMs: number; endMs: number;
}
export interface BookingStore {
  holds: Map<string, Hold>;
  confirmedReservations: Reservation[];
  blockedChargers: Set<string>;
  transaction<T>(work: () => T | Promise<T>): Promise<T>;
}
export interface BookingDependencies {
  dataDirectory: string;
  readJson(path: string): Promise<unknown>;
  now(): number;
  getActor(): { userId: string; role: string };
  newHoldId(): string;
  store: BookingStore;
  projectDirectory: string;
  approvalFiles: { exists(path: string): Promise<boolean> };
  createPaymentLink(request: { holdId: string; userId: string; amount: number; mode: 'test' }): Promise<string>;
}
export interface Failure { ok: false; error?: { code: string }; summary?: unknown; approvalCommand?: string }
export interface BookingService {
  searchChargers(input: unknown): Promise<{ ok: true; chargers: Charger[] } | Failure>;
  holdSlot(input: unknown): Promise<{ ok: true; hold: Hold } | Failure>;
  requestPayment(input: unknown): Promise<{ ok: true; url: string; amount: number; mode: 'test' } | Failure>;
}
export interface ToolRegistrar {
  registerTool(name: string, config: { description?: string; inputSchema: Record<string, unknown> }, handler: (input: Record<string, unknown>) => Promise<unknown>): unknown;
}
const connector = z.enum(['DC차데모', 'AC완속', 'AC3상', 'DC콤보', 'NACS', 'DC콤보2(버스전용)']);
const searchSchema = z.object({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().positive().finite(), connector,
});
const slotSchema = z.object({
  statId: z.string().min(1), chgerId: z.string().min(1), connector,
  startMs: z.number().int().safe(), durationMinutes: z.number().int(),
});
const paymentSchema = z.object({ holdId: z.string().refine(validHoldId) });
const fail = (code: string): Failure => ({ ok: false, error: { code } });
const key = (c: { statId: string; chgerId: string }) => JSON.stringify([c.statId, c.chgerId]);

/** Reject normalized invalid dates (e.g. February 30), not just invalid syntax. */
function statusTimestamp(value: string): number | undefined {
  if (!/^\d{14}$/.test(value)) return undefined;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+09:00`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return undefined;
  const roundTrip = new Date(ms + 9 * 60 * 60_000).toISOString().slice(0, 19).replace(/[-T:]/g, '');
  return roundTrip === value ? ms : undefined;
}
function seoulIso(ms: number): string {
  return new Date(ms + 9 * 60 * 60_000).toISOString().slice(0, 19) + '+09:00';
}
function distanceMeters(a: { latitude: number; longitude: number }, b: Charger): number {
  if (!b.lat.trim() || !b.lng.trim()) return Infinity;
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return Infinity;
  const rad = (n: number) => n * Math.PI / 180;
  const h = Math.sin(rad(lat - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(lat)) * Math.sin(rad(lng - a.longitude) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
const chargerSchema = z.object({
  statId: z.string(), chgerId: z.string(), statNm: z.string(), addr: z.string(),
  lat: z.string(), lng: z.string(), chgerType: z.string(), useTime: z.string(),
  limitYn: z.string(), delYn: z.string(), stat: z.string(), statUpdDt: z.string(),
}).passthrough();
const statusSchema = chargerSchema.pick({ statId: true, chgerId: true, stat: true, statUpdDt: true });

export function createBookingService(d: BookingDependencies): BookingService {
  async function chargers(): Promise<Charger[]> {
    const [rawStations, rawStatuses] = await Promise.all([
      d.readJson(resolve(d.dataDirectory, 'stations.json')),
      d.readJson(resolve(d.dataDirectory, 'status.json')),
    ]);
    if (!Array.isArray(rawStations) || !Array.isArray(rawStatuses)) throw new Error('Invalid data');
    const records = new Map<string, Charger>();
    for (const raw of rawStations) {
      const parsed = chargerSchema.safeParse(raw);
      if (parsed.success) records.set(key(parsed.data), { ...parsed.data });
    }
    for (const raw of rawStatuses) {
      const parsed = statusSchema.safeParse(raw);
      if (!parsed.success) continue;
      const update = parsed.data, old = records.get(key(update));
      if (!old) continue;
      const updateMs = statusTimestamp(update.statUpdDt), oldMs = statusTimestamp(old.statUpdDt);
      if (updateMs !== undefined && (oldMs === undefined || updateMs > oldMs)) {
        old.stat = update.stat; old.statUpdDt = update.statUpdDt;
      }
    }
    return [...records.values()];
  }
  function eligible(c: Charger, selected: ConnectorKind): boolean {
    return chargerEligible(c, selected, d.store.blockedChargers.has(`${c.statId}:${c.chgerId}`));
  }
  function ownValidHold(id: string, userId: string): Hold | undefined {
    const h = d.store.holds.get(id);
    return h && h.userId === userId && holdIsValid(h, d.now()) ? h : undefined;
  }
  return {
    async searchChargers(input) {
      const parsed = searchSchema.safeParse(input);
      if (!parsed.success) return fail('INVALID_INPUT');
      try {
        const result = (await chargers()).filter(c => eligible(c, parsed.data.connector)
          && distanceMeters(parsed.data, c) < parsed.data.radiusMeters);
        return { ok: true, chargers: result };
      } catch { return fail('DATA_UNAVAILABLE'); }
    },
    async holdSlot(input) {
      const parsed = slotSchema.safeParse(input);
      if (!parsed.success) return fail('INVALID_INPUT');
      const actor = d.getActor();
      if (!actor.userId || actor.role !== 'driver') return fail('ACTOR_REQUIRED');
      const s = parsed.data;
      try {
        return await d.store.transaction(async () => {
          const c = (await chargers()).find(c => c.statId === s.statId && c.chgerId === s.chgerId);
          const now = d.now();
          if (!c || !eligible(c, s.connector)) return fail('INELIGIBLE_CHARGER');
          if (!slotTimeAllowed(s.startMs, s.durationMinutes, now)) return fail('INVALID_SLOT');
          const range = { startMs: s.startMs, endMs: s.startMs + s.durationMinutes * 60_000 };
          const occupancies = [
            ...d.store.confirmedReservations.map(r => ({ charger: r, range: r, kind: 'confirmed' as const })),
            ...[...d.store.holds.values()].filter(h => holdIsValid(h, now))
              .map(h => ({ charger: h, range: h, kind: 'valid-hold' as const })),
          ];
          if (hasReservationOverlap(s, range, occupancies)) return fail('SLOT_OCCUPIED');
          const id = d.newHoldId();
          if (!validHoldId(id) || d.store.holds.has(id)) return fail('HOLD_ID_UNAVAILABLE');
          const hold: Hold = { id, userId: actor.userId, statId: s.statId, chgerId: s.chgerId,
            connector: s.connector, ...range, createdMs: now, expiresMs: now + HOLD_DURATION_MS };
          d.store.holds.set(id, hold);
          return { ok: true as const, hold: { ...hold } };
        });
      } catch { return fail('DATA_UNAVAILABLE'); }
    },
    async requestPayment(input) {
      const parsed = paymentSchema.safeParse(input);
      if (!parsed.success) return fail('INVALID_INPUT');
      const actor = d.getActor();
      if (!actor.userId || actor.role !== 'driver') return fail('ACTOR_REQUIRED');
      const id = parsed.data.holdId;
      if (!ownValidHold(id, actor.userId)) return fail('HOLD_UNAVAILABLE');
      try {
        const approved = await d.approvalFiles.exists(approvalPath(d.projectDirectory, id));
        let hold = ownValidHold(id, actor.userId);
        if (!hold) return fail('HOLD_UNAVAILABLE');
        if (!approved) {
          const c = (await chargers()).find(c => c.statId === hold!.statId && c.chgerId === hold!.chgerId);
          hold = ownValidHold(id, actor.userId);
          if (!hold) return fail('HOLD_UNAVAILABLE');
          return { ok: false, error: { code: 'APPROVAL_REQUIRED' },
            summary: { stationId: hold.statId, stationName: c?.statNm ?? '',
              start: seoulIso(hold.startMs), end: seoulIso(hold.endMs), timeZone: 'Asia/Seoul', amount: 3000 },
            approvalCommand: `npm run approve -- ${id}` };
        }
        const url = await d.createPaymentLink({ holdId: id, userId: actor.userId, amount: 3000, mode: 'test' });
        if (!ownValidHold(id, actor.userId)) return fail('HOLD_UNAVAILABLE');
        return { ok: true, url, amount: 3000, mode: 'test' };
      } catch (error) {
        return fail(error instanceof Error && error.message === 'PAYMENT_LINK_NOT_CONFIGURED'
          ? 'PAYMENT_LINK_NOT_CONFIGURED' : 'PAYMENT_LINK_UNAVAILABLE');
      }
    },
  };
}
export function registerBookingTools(registrar: ToolRegistrar, service: BookingService): void {
  registrar.registerTool('search_chargers', { description: '저장된 충전기에서 위치·반경·선택 커넥터로 가상 예약 후보를 찾습니다. 실시간 현장 이용 보장이 아닙니다.', inputSchema: searchSchema.shape }, input => service.searchChargers(input));
  registrar.registerTool('hold_slot', { description: '자격·시간·겹침을 검사해 10분 임시 점유합니다. 결제나 예약 확정은 하지 않습니다.', inputSchema: slotSchema.shape }, input => service.holdSlot(input));
  registrar.registerTool('request_payment', { description: '사람이 터미널에서 승인한 자신의 유효 점유에만 3000원 테스트 링크를 요청합니다. 미승인이면 요약과 승인 명령을 반환합니다.', inputSchema: paymentSchema.shape }, input => service.requestPayment(input));
}
