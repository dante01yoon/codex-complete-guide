import { access, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { approve, BASE, fixture, holdArgs, NOW, productModule, rawCharger, repoRoot, searchArgs, service, START, trustedEnv } from './fixtures.js';
import type { Fixture } from './fixtures.js';

// T-54~57: 새 사용자 확인 전 실행/수집 금지. 실제 프로젝트 승인 폴더 접근 없음.
const fixtures: Fixture[] = [];
const setup = async (...args: Parameters<typeof fixture>) => { const f = await fixture(...args); fixtures.push(f); return f; };
afterEach(async () => { await Promise.all(fixtures.splice(0).map((f) => f.clean())); });
const exists = (path: string) => access(path).then(() => true, () => false);

describe('MCP service / 실제 데이터·JSON 점유·격리 승인 파일', () => {
  it('AC-18-3·4 / GIVEN 원본배열·자격불충족후보 WHEN 검색 THEN 오늘19시와 적격후보만·거리ID순서', async () => {
    const f = await setup([
      rawCharger({ statId: 'FAR', lat: '37.499942' }), rawCharger({ statId: 'B' }),
      rawCharger({ statId: 'A', chgerId: '02' }), rawCharger(),
      rawCharger({ statId: 'OUTSIDE', lat: '37.517942' }),
      rawCharger({ statId: 'LIMIT', limitYn: 'Y' }), rawCharger({ statId: 'DELETE', delYn: 'Y' }),
      rawCharger({ statId: 'HOURS', useTime: '24시간' }), rawCharger({ statId: 'BROKEN', stat: '4' }),
      rawCharger({ statId: 'UNKNOWN', stat: '9' }), rawCharger({ statId: 'OTHER_TYPE', chgerType: '01' }),
    ]);
    const before = await readFile(join(f.sourceDataDir, 'stations.json'), 'utf8');
    const result = await (await service(f.options)).searchChargers(searchArgs);
    expect(result.range).toEqual({ startMs: START, endMs: Date.parse('2026-10-12T19:30:00+09:00') });
    expect(result.candidates.map((c) => c.charger)).toEqual([
      { statId: 'A', chgerId: '01' }, { statId: 'A', chgerId: '02' }, { statId: 'B', chgerId: '01' }, { statId: 'FAR', chgerId: '01' },
    ]);
    expect(result.candidates.every((c) => c.existingEligibilityPassed && c.distanceMeters <= 1000)).toBe(true);
    expect(await readFile(join(f.sourceDataDir, 'stations.json'), 'utf8')).toBe(before);
  });
  it('AC-02-4 / AC-18-4 / GIVEN 더최신고장·더오래된고장변경 WHEN 검색 THEN 최신만적용', async () => {
    const f = await setup([rawCharger({ statId: 'NEW' }), rawCharger({ statId: 'OLD' })], [
      { statId: 'NEW', chgerId: '01', stat: '4', statUpdDt: '20261012093000' },
      { statId: 'OLD', chgerId: '01', stat: '4', statUpdDt: '20261012080000' },
    ]);
    expect((await (await service(f.options)).searchChargers(searchArgs)).candidates.map((c) => c.charger.statId)).toEqual(['OLD']);
  });
  it('AC-18-10 / GIVEN 빈구간 WHEN hold호출 THEN 생성부터10분·JSON저장·새서비스에서복구', async () => {
    const f = await setup();
    const hold = await (await service(f.options)).holdCharger(holdArgs);
    expect(hold).toMatchObject({ charger: { statId: 'A', chgerId: '01' },
      range: { startMs: START, endMs: START + 1800000 }, createdAtMs: NOW, expiresAtMs: NOW + 600000, status: 'held' });
    const state = JSON.parse(await readFile(f.statePath, 'utf8')) as { version: number; holds: unknown[] };
    expect(state.version).toBe(1);
    expect(state.holds).toEqual([expect.objectContaining({ ...hold, connector: 'DC콤보', requestId: 'request-001', actorId: 'test-driver-1' })]);
    expect((await (await service(f.options)).requestPaymentLink({ holdId: hold.holdId })).summary.holdId).toBe(hold.holdId);
  });
  it('AC-02-6·7·8 / AC-18-10 / GIVEN 차데모01충전기 WHEN 검색없이DC콤보hold직접요청 THEN INELIGIBLE_CHARGER·hold0건', async () => {
    const f = await setup([rawCharger({ chgerType: '01' })]); const s = await service(f.options);
    await expect(s.holdCharger(holdArgs)).rejects.toMatchObject({ code: 'INELIGIBLE_CHARGER' });
    const holds = await exists(f.statePath)
      ? (JSON.parse(await readFile(f.statePath, 'utf8')) as { holds: unknown[] }).holds : [];
    expect(holds).toEqual([]);
  });
  it('AC-04-4 / AC-18-10 / GIVEN 동일충전기빈구간 WHEN 두동시요청 THEN 하나만저장·다른요청HOLD_CONFLICT', async () => {
    const f = await setup(); const first = await service(f.options); const second = await service(f.options);
    const results = await Promise.allSettled([first.holdCharger(holdArgs), second.holdCharger({ ...holdArgs, requestId: 'request-002' })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected');
    expect(failed).toMatchObject({ status: 'rejected', reason: { code: 'HOLD_CONFLICT' } });
    expect((JSON.parse(await readFile(f.statePath, 'utf8')) as { holds: unknown[] }).holds).toHaveLength(1);
  });
  it('AC-04-3 / AC-18-10 / GIVEN19시점유 WHEN19시30분연속점유 THEN 둘다허용', async () => {
    const f = await setup(); const s = await service(f.options);
    await s.holdCharger(holdArgs);
    expect(await s.holdCharger({ ...holdArgs, startMs: START + 1800000, requestId: 'request-002' })).toMatchObject({ range: { startMs: START + 1800000, endMs: START + 3600000 } });
  });
  it('AC-18-10 / GIVEN 기존hold WHEN 같은requestId반복·만료후반복 THEN 동일hold·원래기한유지', async () => {
    const f = await setup(); const s = await service(f.options); const first = await s.holdCharger(holdArgs);
    f.setNow(NOW + 300000); expect(await s.holdCharger(holdArgs)).toEqual(first);
    f.setNow(NOW + 600000); expect(await s.holdCharger(holdArgs)).toEqual(first);
    expect((JSON.parse(await readFile(f.statePath, 'utf8')) as { holds: unknown[] }).holds).toHaveLength(1);
  });
  it('AC-18-10 / GIVEN 기존requestId WHEN 다른payload THEN IDEMPOTENCY_CONFLICT', async () => {
    const f = await setup(); const s = await service(f.options); await s.holdCharger(holdArgs);
    await expect(s.holdCharger({ ...holdArgs, durationMinutes: 60 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(s.holdCharger({ ...holdArgs, connector: 'DC차데모' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('AC-18-10 / GIVEN 만료점유 WHEN 다른requestId신규점유 THEN 새hold와새10분기한', async () => {
    const f = await setup(); const s = await service(f.options); const first = await s.holdCharger(holdArgs);
    f.setNow(first.expiresAtMs);
    const next = await s.holdCharger({ ...holdArgs, requestId: 'request-002' });
    expect(next.holdId).not.toBe(first.holdId); expect(next.expiresAtMs).toBe(NOW + 1200000);
  });
  it('AC-18-2·9 / GIVEN 승인파일없음 WHEN 링크요청 THEN 요약·명령만·파일자동생성없음', async () => {
    const f = await setup(); const s = await service(f.options); const hold = await s.holdCharger(holdArgs);
    expect(await s.requestPaymentLink({ holdId: hold.holdId })).toMatchObject({
      linkAllowed: false, linkUrl: null, expiresAtMs: NOW + 600000, effects: [],
      approvalCommand: `npm run approve -- ${hold.holdId}`,
      summary: { holdId: hold.holdId, charger: hold.charger, range: hold.range, amount: 3000, currency: 'KRW', holdExpiresAtMs: hold.expiresAtMs },
    });
    expect(await exists(f.approvalPath(hold.holdId))).toBe(false);
  });
  it('AC-03-4 / AC-18-8·11 / GIVEN 다른운전자소유hold WHEN 신뢰된다른actor로링크요청 THEN FORBIDDEN', async () => {
    const f = await setup(); const hold = await (await service(f.options)).holdCharger(holdArgs);
    await approve(hold.holdId, f.options);
    const other = await service({ ...f.options, actorId: 'test-driver-2' });
    await expect(other.requestPaymentLink({ holdId: hold.holdId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('AC-18-9 / GIVEN 격리root WHEN 경로탈출holdId승인요청 THEN INVALID_ARGUMENTS·승인폴더밖파일없음', async () => {
    const f = await setup();
    await expect(approve('../outside', f.options)).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    expect(await exists(join(f.projectRoot, '.codex/outside.json'))).toBe(false);
  });
  it('AC-18-10 저장보호 / GIVEN 손상state WHEN hold요청 THEN STORAGE_ERROR·손상파일그대로유지', async () => {
    const f = await setup(); const s = await service(f.options); await s.holdCharger(holdArgs);
    await writeFile(f.statePath, '{invalid-state');
    await expect((async () => (await service(f.options)).holdCharger({ ...holdArgs, requestId: 'request-002' }))()).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect(await readFile(f.statePath, 'utf8')).toBe('{invalid-state');
  });
  it('AC-18-4 원본보호 / GIVEN 손상원본 WHEN 검색 THEN SOURCE_DATA_ERROR·빈목록성공으로바꾸지않음', async () => {
    const f = await setup(); await writeFile(join(f.sourceDataDir, 'stations.json'), '{invalid-source');
    // 생성 시점에 lazy/eager 읽기 중 어느 것을 쓰든 공개 호출 경계의 오류를 검증한다.
    await expect((async () => (await service(f.options)).searchChargers(searchArgs))()).rejects.toMatchObject({ code: 'SOURCE_DATA_ERROR' });
  });
  it('AC-18-7·9·11 / GIVEN 격리root유효hold WHEN 실제approve함수후링크요청 THEN 승인파일읽고결제없는주소', async () => {
    const f = await setup(); const s = await service(f.options); const hold = await s.holdCharger(holdArgs);
    f.setNow(NOW + 1000);
    expect(await approve(hold.holdId, f.options)).toEqual({ holdId: hold.holdId, approvalPath: f.approvalPath(hold.holdId) });
    expect(await f.readApproval(hold.holdId)).toEqual({ holdId: hold.holdId, approvedAtMs: NOW + 1000 });
    expect(await s.requestPaymentLink({ holdId: hold.holdId })).toMatchObject({ linkAllowed: true, linkUrl: `${BASE}/payment/${hold.holdId}`, expiresAtMs: NOW + 600000 });
    f.setNow(NOW + 2000); await approve(hold.holdId, f.options);
    expect(await f.readApproval(hold.holdId)).toEqual({ holdId: hold.holdId, approvedAtMs: NOW + 1000 });
    expect((await s.requestPaymentLink({ holdId: hold.holdId })).expiresAtMs).toBe(NOW + 600000);
  });
  it.each([600000, 600001])('AC-18-5·11 / GIVEN 승인된hold WHEN +%sms THEN 새링크없음', async (elapsed) => {
    const f = await setup(); const s = await service(f.options); const hold = await s.holdCharger(holdArgs); await approve(hold.holdId, f.options);
    f.setNow(NOW + elapsed);
    expect(await s.requestPaymentLink({ holdId: hold.holdId })).toMatchObject({ linkAllowed: false, holdExpired: true, linkUrl: null, effects: [], expiresAtMs: NOW + 600000 });
  });
  it.each([600000, 600001])('AC-18-9·10 / GIVEN 승인없는hold WHEN +%sms에approve THEN HOLD_EXPIRED·파일없음', async (elapsed) => {
    const f = await setup(); const hold = await (await service(f.options)).holdCharger(holdArgs); f.setNow(NOW + elapsed);
    await expect(approve(hold.holdId, f.options)).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
    expect(await exists(f.approvalPath(hold.holdId))).toBe(false);
  });
  it.each(['malformed', 'different-hold', 'symlink'])('AC-18-7·9 / GIVEN %s 승인파일 WHEN 링크요청 THEN 승인으로수용하지않음', async (kind) => {
    const f = await setup(); const s = await service(f.options); const hold = await s.holdCharger(holdArgs);
    await mkdir(join(f.projectRoot, '.codex/approvals'), { recursive: true });
    const path = f.approvalPath(hold.holdId);
    if (kind === 'malformed') await writeFile(path, '{invalid');
    else if (kind === 'different-hold') await writeFile(path, JSON.stringify({ holdId: 'other-hold', approvedAtMs: NOW }));
    else { const target = join(f.projectRoot, 'untrusted.json'); await writeFile(target, JSON.stringify({ holdId: hold.holdId, approvedAtMs: NOW })); await symlink(target, path); }
    expect(await s.requestPaymentLink({ holdId: hold.holdId })).toMatchObject({ linkAllowed: false, linkUrl: null, effects: [] });
  });
  it('AC-18-9 / GIVEN 격리root유효hold WHEN npm approve CLI THEN exit0·JSON·해당승인파일', async () => {
    const f = await setup(); const hold = await (await service(f.options)).holdCharger(holdArgs);
    await productModule('src/cli/approve.ts');
    const result = await promisify(execFile)('npm', ['--silent', 'run', 'approve', '--', hold.holdId], { cwd: repoRoot, env: trustedEnv(f) });
    expect(JSON.parse(result.stdout)).toEqual({ holdId: hold.holdId, approvalPath: f.approvalPath(hold.holdId) });
    expect(await f.readApproval(hold.holdId)).toEqual({ holdId: hold.holdId, approvedAtMs: NOW });
  }, 15000);
  it('AC-18-9 / GIVEN 격리root만료hold WHEN 실제CLI THEN exit1·HOLD_EXPIRED·승인파일없음', async () => {
    const f = await setup(); const hold = await (await service(f.options)).holdCharger(holdArgs); f.setNow(hold.expiresAtMs);
    await productModule('src/cli/approve.ts');
    await expect(promisify(execFile)(process.execPath, ['--import', 'tsx', join(repoRoot, 'src/cli/approve.ts'), hold.holdId], { cwd: repoRoot, env: trustedEnv(f) })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('HOLD_EXPIRED') });
    expect(await exists(f.approvalPath(hold.holdId))).toBe(false);
  }, 15000);
});
