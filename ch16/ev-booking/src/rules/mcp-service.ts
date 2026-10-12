import { filterMcpChargerCandidates } from './mcp-booking.js';
import { hasReservationOverlap } from './overlap.js';
import type { ChargerIdentity, ChargerTypeCode, ConnectorKind, Occupancy, TimeRange } from './types.js';

export type StationRecord = Readonly<Record<string, unknown>>;
/** 이번 서버 합의: 정확한 24시간 문구와 저장 상태만 사용한다. */
export function mcpChargerEligible(record: StationRecord): boolean {
  return record.limitYn === 'N' && record.delYn === 'N'
    && record.useTime === '24시간 이용가능'
    && (record.stat === '2' || record.stat === '3')
    && record.operatorBlocked !== true;
}
export function mcpConnectorSupported(chargerType: ChargerTypeCode, connector: ConnectorKind): boolean {
  return filterMcpChargerCandidates({ candidates: [{
    charger: { statId: '', chgerId: '' }, chargerType,
    distanceMeters: 0, existingEligibilityPassed: true,
  }], connector, range: { startMs: 0, endMs: 1 }, occupancies: [] }).length === 1;
}
export function mcpTimeAllowed(range: TimeRange, nowMs: number): boolean {
  const duration = (range.endMs - range.startMs) / 60_000;
  return Number.isSafeInteger(range.startMs) && Number.isSafeInteger(range.endMs)
    && range.startMs >= nowMs && range.startMs <= nowMs + 7 * 86_400_000
    && range.startMs % 1_800_000 === 0 && [30, 60, 90].includes(duration);
}
/** 원본 시각은 서울 YYYYMMDDhhmmss. 잘못된 변경분은 최신 증거가 아니다. */
function sourceTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{14}$/.test(value)) return null;
  const iso = `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:${value.slice(10,12)}:${value.slice(12,14)}+09:00`;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  const normalized = new Date(parsed + 9 * 3_600_000).toISOString().slice(0,19).replace(/[-:T]/g, '');
  return normalized === value ? parsed : null;
}
export function mergeMcpStatuses(stations: readonly StationRecord[], statuses: readonly StationRecord[]): StationRecord[] {
  // 두 식별자를 별도로 인덱싱해 구분자 충돌 없이 최신 유효 변경분을 한 번만 찾는다.
  const latestByStation = new Map<unknown, Map<unknown, { record: StationRecord; time: number }>>();
  for (const status of statuses) {
    const time = sourceTimestamp(status.statUpdDt);
    if (time === null) continue;
    let chargers = latestByStation.get(status.statId);
    if (!chargers) {
      chargers = new Map();
      latestByStation.set(status.statId, chargers);
    }
    const previous = chargers.get(status.chgerId);
    // 같은 시각은 원래 순회의 첫 번째 변경분을 유지한다.
    if (!previous || time > previous.time) chargers.set(status.chgerId, { record: status, time });
  }
  return stations.map((station) => {
    const update = latestByStation.get(station.statId)?.get(station.chgerId);
    if (!update) return station;
    const originalTime = sourceTimestamp(station.statUpdDt);
    return originalTime === null || update.time > originalTime
      ? { ...station, stat: update.record.stat, statUpdDt: update.record.statUpdDt }
      : station;
  });
}

export interface McpHeldRecord {
  readonly holdId: string; readonly requestId: string; readonly actorId: string;
  readonly charger: ChargerIdentity; readonly connector: ConnectorKind;
  readonly range: TimeRange; readonly createdAtMs: number; readonly expiresAtMs: number;
  readonly status: 'held';
}
export function mcpRequestedRange(startMs: number, durationMinutes: number): TimeRange {
  return { startMs, endMs: startMs + durationMinutes * 60_000 };
}
export function mcpActiveOccupancies(holds: readonly McpHeldRecord[], nowMs: number): Occupancy[] {
  return holds.filter((h) => nowMs < h.expiresAtMs)
    .map((h) => ({ charger: h.charger, range: h.range, kind: 'valid-hold' as const }));
}
export function decideMcpHold(input: {
  readonly charger: ChargerIdentity; readonly connector: ConnectorKind;
  readonly range: TimeRange; readonly requestId: string; readonly actorId: string;
  readonly nowMs: number; readonly station: StationRecord | undefined;
  readonly holds: readonly McpHeldRecord[];
}): { existing?: McpHeldRecord; error?: string } {
  const prior = input.holds.find((h) => h.actorId === input.actorId && h.requestId === input.requestId);
  if (prior) {
    const same = prior.charger.statId === input.charger.statId && prior.charger.chgerId === input.charger.chgerId
      && prior.connector === input.connector && prior.range.startMs === input.range.startMs && prior.range.endMs === input.range.endMs;
    return same ? { existing: prior } : { error: 'IDEMPOTENCY_CONFLICT' };
  }
  if (!input.station) return { error: 'UNKNOWN_CHARGER' };
  if (!mcpChargerEligible(input.station)
    || !mcpConnectorSupported(input.station.chgerType as ChargerTypeCode, input.connector)) return { error: 'INELIGIBLE_CHARGER' };
  if (!mcpTimeAllowed(input.range, input.nowMs)) return { error: 'INVALID_TIME' };
  const occupied = mcpActiveOccupancies(input.holds, input.nowMs);
  return hasReservationOverlap(input.charger, input.range, occupied) ? { error: 'HOLD_CONFLICT' } : {};
}
export function mcpHoldAccess(hold: McpHeldRecord | undefined, actorId: string): string | null {
  return !hold ? 'UNKNOWN_HOLD' : hold.actorId !== actorId ? 'FORBIDDEN' : null;
}
