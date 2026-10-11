/** 정상 원본 식별자만 전달한다. 두 필드를 각각 비교한다. */
export interface ChargerIdentity {
  readonly statId: string;
  readonly chgerId: string;
}

/** 유한 정수 epoch milliseconds. startMs < endMs, [startMs, endMs). */
export interface TimeRange {
  readonly startMs: number;
  readonly endMs: number;
}

/** 호출자가 현재 유효하다고 판정한 확보 구간만 전달한다. */
export interface Occupancy {
  readonly charger: ChargerIdentity;
  readonly range: TimeRange;
  readonly kind: 'confirmed' | 'valid-hold';
}

export type ConnectorKind =
  | 'DC차데모'
  | 'AC완속'
  | 'AC3상'
  | 'DC콤보'
  | 'NACS'
  | 'DC콤보2(버스전용)';

export type ChargerTypeCode =
  | '01' | '02' | '03' | '04' | '05' | '06'
  | '07' | '08' | '09' | '10' | '11';

export interface ReservationRuleInput {
  readonly charger: ChargerIdentity;
  readonly range: TimeRange;
  readonly connector: ConnectorKind;
  readonly chargerType: ChargerTypeCode;
  readonly occupancies: readonly Occupancy[];
  readonly existingEligibilityPassed: boolean;
}

/** 규칙 판정이며 예약 생성·결제 승인·현장 이용 보장을 의미하지 않는다. */
export interface ReservationRuleResult {
  readonly overlapFree: boolean;
  readonly connectorSupported: boolean;
  readonly existingEligibilityPassed: boolean;
  readonly rulesPassed: boolean;
}
