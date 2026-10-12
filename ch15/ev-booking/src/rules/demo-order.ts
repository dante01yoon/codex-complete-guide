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
