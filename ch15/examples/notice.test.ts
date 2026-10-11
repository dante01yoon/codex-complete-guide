import { describe, expect, it } from 'vitest';
import { refundNotice } from '../../src/rules/notice.js';

const start = Date.parse('2026-10-11T14:00:00+09:00');
const at = (hhmm: string) => Date.parse(`2026-10-11T${hhmm}:00+09:00`);

describe('취소 안내 문구', () => {
  it('120분 넘게 남으면 전액', () => {
    expect(refundNotice(start, at('11:30'))).toBe('지금 취소하면 3,000원을 돌려받습니다. 시작까지 2시간 30분 남았습니다.');
  });
  it('정확히 120분 전도 전액', () => {
    expect(refundNotice(start, at('12:00'))).toBe('지금 취소하면 3,000원을 돌려받습니다. 시작까지 2시간 남았습니다.');
  });
  it('30분 이상 120분 미만이면 절반', () => {
    expect(refundNotice(start, at('13:00'))).toBe('지금 취소하면 1,500원을 돌려받습니다. 시작까지 1시간 남았습니다.');
  });
  it('30분 미만이면 환불 없음', () => {
    expect(refundNotice(start, at('13:40'))).toBe('지금 취소하면 환불받을 수 없습니다. 시작까지 20분 남았습니다.');
  });
  it('시작했으면 취소 안내 대신 시작했다고 알린다', () => {
    expect(refundNotice(start, at('14:00'))).toBe('이미 시작한 예약입니다.');
  });
});
