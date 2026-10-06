import type { ConnectorKind } from './types.js';

const CONNECTORS: Record<ConnectorKind, readonly string[]> = {
  'DC차데모': ['01', '03', '05', '06'], 'AC완속': ['02'],
  'AC3상': ['03', '06', '07'], 'DC콤보': ['04', '05', '06', '08', '10'],
  NACS: ['09', '10'], 'DC콤보2(버스전용)': ['11'],
};
export const HOLD_DURATION_MS = 600_000;

export function connectorSupported(type: string, connector: ConnectorKind): boolean {
  return CONNECTORS[connector]?.includes(type) ?? false;
}
export function chargerEligible(charger: {
  limitYn: string; delYn: string; useTime: string; stat: string; chgerType: string;
}, connector: ConnectorKind, blocked: boolean): boolean {
  // C-05: only the agreed wording is supported; other wording remains pending.
  return charger.limitYn === 'N' && charger.delYn === 'N'
    && charger.useTime === '24시간 이용가능' && ['2', '3'].includes(charger.stat)
    && !blocked && connectorSupported(charger.chgerType, connector);
}
export function slotTimeAllowed(startMs: number, durationMinutes: number, nowMs: number): boolean {
  const seoul = new Date(startMs + 9 * 60 * 60_000);
  return Number.isSafeInteger(startMs) && Number.isSafeInteger(nowMs)
    && startMs >= nowMs && startMs <= nowMs + 7 * 24 * 60 * 60_000
    && [0, 30].includes(seoul.getUTCMinutes())
    && seoul.getUTCSeconds() === 0 && seoul.getUTCMilliseconds() === 0
    && [30, 60, 90].includes(durationMinutes);
}
export function holdIsValid(hold: { expiresMs: number }, nowMs: number): boolean {
  return Number.isSafeInteger(nowMs) && nowMs < hold.expiresMs;
}
