import { hasReservationOverlap } from './overlap.js';
import type {
  ChargerIdentity, ChargerTypeCode, ConnectorKind, Occupancy, TimeRange,
} from './types.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SEOUL_OFFSET_MS = 9 * 60 * MINUTE_MS;
const DEPOSIT = 3000;

const CONNECTOR_TYPES: Readonly<Record<ConnectorKind, readonly ChargerTypeCode[]>> = {
  'DC차데모': ['01', '03', '05', '06'],
  'AC완속': ['02'],
  'AC3상': ['03', '06', '07'],
  'DC콤보': ['04', '05', '06', '08', '10'],
  NACS: ['09', '10'],
  'DC콤보2(버스전용)': ['11'],
};

export interface McpChargerCandidate {
  readonly charger: ChargerIdentity;
  readonly chargerType: ChargerTypeCode;
  readonly existingEligibilityPassed: boolean;
  readonly distanceMeters: number;
}

/** AC-18-3: 정규화된 예문의 '7시'만 받는다. 외부 시계를 읽지 않는다. */
export function resolveMcpBookingTime(input: {
  readonly nowMs: number;
  readonly timeText: '7시';
  readonly durationMinutes: number;
}): { readonly range: TimeRange; readonly withinBookingWindow: boolean } {
  const seoulDay = Math.floor((input.nowMs + SEOUL_OFFSET_MS) / DAY_MS);
  const startMs = seoulDay * DAY_MS - SEOUL_OFFSET_MS + 19 * 60 * MINUTE_MS;
  return {
    range: { startMs, endMs: startMs + input.durationMinutes * MINUTE_MS },
    withinBookingWindow: input.nowMs <= startMs && startMs <= input.nowMs + 7 * DAY_MS,
  };
}

/** AC-18-13·14·15: 명시한 서울 날짜를 검증하며 달력 자동 보정을 거절한다. */
export function resolveMcpBookingDateTime(input: {
  readonly nowMs: number;
  readonly date: string;
  readonly startTime: string;
  readonly durationMinutes: number;
}): { readonly range: TimeRange; readonly withinBookingWindow: boolean } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)) return null;
  const startMs = Date.parse(`${input.date}T${input.startTime}:00+09:00`);
  if (!Number.isFinite(startMs)
    || new Date(startMs + SEOUL_OFFSET_MS).toISOString() !== `${input.date}T${input.startTime}:00.000Z`) return null;
  return {
    range: { startMs, endMs: startMs + input.durationMinutes * MINUTE_MS },
    withinBookingWindow: input.nowMs <= startMs && startMs <= input.nowMs + 7 * DAY_MS,
  };
}

/**
 * AC-18-4: 정규화된 거리·기존 자격·유효 점유 snapshot을 받는다.
 * C-12: 정확히 1000m 포함, 거리 오름차순과 식별자 순으로 반환한다.
 */
export function filterMcpChargerCandidates<T extends McpChargerCandidate>(input: {
  readonly candidates: readonly T[];
  readonly connector: ConnectorKind;
  readonly range: TimeRange;
  readonly occupancies: readonly Occupancy[];
}): readonly T[] {
  return input.candidates.filter((candidate) =>
    candidate.distanceMeters <= 1000
    && candidate.existingEligibilityPassed
    && CONNECTOR_TYPES[input.connector].includes(candidate.chargerType)
    && !hasReservationOverlap(candidate.charger, input.range, input.occupancies),
  ).sort((a, b) => a.distanceMeters - b.distanceMeters
    || compareId(a.charger.statId, b.charger.statId)
    || compareId(a.charger.chgerId, b.charger.chgerId));
}

function compareId(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** AC-05-3: 생성이 끝난 점유의 기한 계산이며 점유 생성·해제 동작은 아니다. */
export function getMcpHoldTiming(input: {
  readonly createdAtMs: number;
  readonly nowMs: number;
}): { readonly expiresAtMs: number; readonly isExpired: boolean } {
  const expiresAtMs = input.createdAtMs + 10 * MINUTE_MS;
  return { expiresAtMs, isExpired: input.nowMs >= expiresAtMs };
}

export interface McpPaymentLinkRequest {
  readonly holdId: string;
  readonly charger: ChargerIdentity;
  readonly range: TimeRange;
  readonly nowMs: number;
  readonly holdExpiresAtMs: number;
  readonly claimedApproval?: unknown;
}

/** Adapter가 보호된 승인 파일을 확인한 snapshot. 모델 도구 인수로 받지 않는다. */
export interface McpApprovalSnapshot {
  readonly approvalFileExists: boolean;
  readonly approvalHoldId: string | null;
}

export interface McpPaymentSummary {
  readonly holdId: string;
  readonly charger: ChargerIdentity;
  readonly range: TimeRange;
  readonly amount: 3000;
  readonly currency: 'KRW';
  readonly holdExpiresAtMs: number;
}

export interface McpPaymentLinkEffect {
  readonly type: 'create-payment-link';
  readonly holdId: string;
  readonly amount: 3000;
  readonly currency: 'KRW';
  readonly expiresAtMs: number;
}

export interface McpPaymentLinkDecision {
  readonly linkAllowed: boolean;
  readonly holdExpired: boolean;
  readonly summary: McpPaymentSummary;
  readonly approvalCommand: string;
  readonly effects: readonly McpPaymentLinkEffect[];
}

/** 표시용 셸 인수: 안전한 식별자는 그대로, 나머지는 단일 인수로 인용한다. */
function quoteHoldId(holdId: string): string {
  return /^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(holdId)
    ? holdId
    : `'${holdId.replace(/'/g, `'"'"'`)}'`;
}

/** AC-18-2·7: 판정/effect만 반환한다. 파일·명령·링크 생성은 실행하지 않는다. */
export function evaluateMcpPaymentLinkRequest(
  input: McpPaymentLinkRequest,
  context: McpApprovalSnapshot,
): McpPaymentLinkDecision {
  const holdExpired = input.nowMs >= input.holdExpiresAtMs;
  const linkAllowed = !holdExpired
    && context.approvalFileExists
    && context.approvalHoldId === input.holdId;
  return {
    linkAllowed,
    holdExpired,
    summary: {
      holdId: input.holdId,
      charger: input.charger,
      range: input.range,
      amount: DEPOSIT,
      currency: 'KRW',
      holdExpiresAtMs: input.holdExpiresAtMs,
    },
    approvalCommand: `npm run approve -- ${quoteHoldId(input.holdId)}`,
    effects: linkAllowed ? [{
      type: 'create-payment-link',
      holdId: input.holdId,
      amount: DEPOSIT,
      currency: 'KRW',
      expiresAtMs: input.holdExpiresAtMs,
    }] : [],
  };
}

/** AC-18-5: 다른 권한 조건을 충족한 기발급 링크의 기간만 판정한다. */
export function isMcpPaymentLinkUsable(input: {
  readonly nowMs: number;
  readonly holdExpiresAtMs: number;
  readonly linkExpiresAtMs: number;
}): boolean {
  return input.nowMs < input.holdExpiresAtMs && input.nowMs < input.linkExpiresAtMs;
}
