import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBookingService } from '../../src/mcp/booking-server.js';
import type { BookingDependencies, Hold } from '../../src/mcp/booking-server.js';
import { localDemoDependencies } from '../../src/mcp/stdio.js';

/** T-54 / AC-18-11: docs/local-checkout-plan.md의 사용자 확인된 세 계약.
 * 실제 localDemoDependencies.createPaymentLink를 호출한다. 링크 구현은 모의하지 않는다.
 * 시계·계정·입력 JSON·승인 파일 존재만 주입한다. 실제 승인 파일·CLI·HTTP는 사용하지 않는다.
 * orderId 재사용·반복 요청·checkout 페이지 제공은 이번 검증 범위가 아니다.
 */
const PROJECT = process.cwd();
const CREATED_MS = Date.parse('2026-10-06T18:00:00+09:00');
const START_MS = Date.parse('2026-10-06T19:00:00+09:00');
const HOLD_ID = 'hold-local-checkout';

function fixture(approved: boolean, nowMs = CREATED_MS) {
  const runtime = localDemoDependencies(PROJECT);
  // spy는 원래 링크 제공자를 그대로 호출한다.
  const createPaymentLink = vi.spyOn(runtime, 'createPaymentLink');
  const approvalExists = vi.fn(async (path: string) =>
    approved && path === resolve(PROJECT, '.codex', 'approvals', HOLD_ID));
  const dependencies: BookingDependencies = {
    ...runtime,
    now: () => nowMs,
    getActor: () => ({ userId: 'driver-a', role: 'driver' }),
    approvalFiles: { exists: approvalExists },
    readJson: async (path: string): Promise<unknown> => {
      if (path === resolve(runtime.dataDirectory, 'status.json')) return [];
      if (path !== resolve(runtime.dataDirectory, 'stations.json')) throw new Error('Unexpected fixture data path');
      return [{
        statId: 'local-station', chgerId: '01', statNm: '시연 충전소', addr: '서울 강남구 시연 주소',
        lat: '37.4982', lng: '127.0277', chgerType: '04', useTime: '24시간 이용가능',
        limitYn: 'N', delYn: 'N', stat: '2', statUpdDt: '20261006170000',
      }];
    },
  };
  const hold: Hold = {
    id: HOLD_ID, userId: 'driver-a', statId: 'local-station', chgerId: '01', connector: 'DC콤보',
    startMs: START_MS, endMs: START_MS + 30 * 60_000,
    createdMs: CREATED_MS, expiresMs: CREATED_MS + 600_000,
  };
  runtime.store.holds.set(hold.id, hold);
  return { service: createBookingService(dependencies), store: runtime.store, createPaymentLink, approvalExists };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('HTTP is outside the local checkout contract'); }));
});

afterEach(() => {
  try { expect(fetch).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});

describe('T-54 실제 로컬 런타임 테스트 링크 계약', () => {
  it('AC-18-11 승인된 유효 점유는 지정 로컬 URL과 3000원 테스트 모드를 반환한다', async () => {
    const h = fixture(true);
    const result = await h.service.requestPayment({ holdId: HOLD_ID });
    expect(h.approvalExists).toHaveBeenCalledWith(resolve(PROJECT, '.codex', 'approvals', HOLD_ID));
    expect(h.createPaymentLink).toHaveBeenCalledWith({ holdId: HOLD_ID, userId: 'driver-a', amount: 3000, mode: 'test' });
    expect(h.store.confirmedReservations).toHaveLength(0);
    expect(result).toMatchObject({ ok: true, amount: 3000, mode: 'test' });
    if (!result.ok) throw new Error('Expected approved local checkout URL');
    const url = new URL(result.url);
    expect(url.origin).toBe('http://127.0.0.1:5180');
    expect(url.pathname.startsWith('/checkout/')).toBe(true);
    expect(url.pathname.slice('/checkout/'.length)).not.toBe('');
  });

  it('AC-18-11 미승인 점유에는 로컬 링크를 만들지 않는다', async () => {
    const h = fixture(false);
    const result = await h.service.requestPayment({ holdId: HOLD_ID });
    expect(result).toMatchObject({
      ok: false, error: { code: 'APPROVAL_REQUIRED' },
      summary: {
        stationId: 'local-station', stationName: '시연 충전소',
        start: '2026-10-06T19:00:00+09:00', end: '2026-10-06T19:30:00+09:00',
        timeZone: 'Asia/Seoul', amount: 3000,
      },
      approvalCommand: `npm run approve -- ${HOLD_ID}`,
    });
    expect(result).not.toHaveProperty('url');
    expect(h.createPaymentLink).not.toHaveBeenCalled();
    expect(h.store.confirmedReservations).toHaveLength(0);
  });

  it('AC-18-11 만료 점유에는 승인 파일이 있어도 로컬 링크를 만들지 않는다', async () => {
    const h = fixture(true, CREATED_MS + 600_000);
    const result = await h.service.requestPayment({ holdId: HOLD_ID });
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty('url');
    expect(h.createPaymentLink).not.toHaveBeenCalled();
    const retainedHold = h.store.holds.get(HOLD_ID);
    if (retainedHold) expect(retainedHold.expiresMs).toBe(CREATED_MS + 600_000);
    expect(h.store.confirmedReservations).toHaveLength(0);
  });
});
