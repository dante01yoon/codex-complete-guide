import { mcpActiveOccupancies, mcpChargerEligible, mcpConnectorSupported } from './mcp-service.js';
import type { McpHeldRecord, StationRecord } from './mcp-service.js';
import { hasReservationOverlap } from './overlap.js';
import type { ChargerIdentity, ChargerTypeCode, TimeRange } from './types.js';

/** 단일 결제 시연의 입력 선택. 전체 예약 자격 모듈 완료를 의미하지 않는다. */
export interface DemoCharger {
  statNm: string; statId: string; chgerId: string; chgerType: string;
  addr: string; useTime: string; limitYn: string; delYn: string;
  stat: string; statUpdDt: string; output: string;
}

export function selectDemoCharger(stations: readonly DemoCharger[]): DemoCharger | undefined {
  return stations.find(s => s.limitYn === 'N' && s.delYn === 'N'
    && s.useTime === '24시간 이용가능' && s.chgerType === '04'
    && (s.stat === '2' || s.stat === '3'));
}

/** 약 24시간 뒤 00/30분 시작. epoch의 30분 경계는 서울에서도 동일하다. */
export function demoReservationRange(nowMs: number) {
  const startMs = Math.ceil((nowMs + 24 * 60 * 60 * 1000) / (30 * 60 * 1000)) * 30 * 60 * 1000;
  return { startMs, endMs: startMs + 60 * 60 * 1000 };
}

/** Existing qualification, connector, overlap and one-active-reservation checks for a linked demo order. */
export function demoLinkedSlotAvailable(hold: Pick<McpHeldRecord, 'actorId' | 'charger' | 'connector' | 'range'>, records: readonly StationRecord[], others: readonly {
  owner: string; stage: string; charger: ChargerIdentity; range: TimeRange;
}[], otherHolds: readonly McpHeldRecord[], nowMs: number): boolean {
  const station = records.find(s => s.statId === hold.charger.statId && s.chgerId === hold.charger.chgerId);
  if (!station || !mcpChargerEligible(station)
    || !mcpConnectorSupported(station.chgerType as ChargerTypeCode, hold.connector)) return false;
  const active = others.filter(o => ['confirmed', 'approving', 'review', 'refund-pending'].includes(o.stage));
  if (active.some(o => o.owner === hold.actorId)) return false;
  return !hasReservationOverlap(hold.charger, hold.range,
    [...mcpActiveOccupancies(otherHolds, nowMs),
      ...active.map(o => ({ charger: o.charger, range: o.range, kind: 'confirmed' as const }))]);
}
