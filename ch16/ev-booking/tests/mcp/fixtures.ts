import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from 'vitest';
import type { ChargerIdentity, ConnectorKind, TimeRange } from '../../src/rules/index.js';

// 실제 프로젝트 승인 폴더와 분리된 전용 임시 프로젝트만 쓴다.
export const repoRoot = resolve(import.meta.dirname, '../..');
export const NOW = Date.parse('2026-10-12T10:00:00+09:00');
export const START = Date.parse('2026-10-12T19:00:00+09:00');
export const BASE = 'http://127.0.0.1:5181';
export const searchArgs = { location: '강남역' as const, connector: 'DC콤보' as const, timeText: '7시' as const, durationMinutes: 30 as const };
export const holdArgs = { statId: 'A', chgerId: '01', connector: 'DC콤보' as const, startMs: START, durationMinutes: 30 as const, requestId: 'request-001' };
export const rawCharger = (overrides: Record<string, string> = {}) => ({
  statId: 'A', chgerId: '01', statNm: '시연 충전소', addr: '서울 시연 주소',
  chgerType: '04', lat: '37.497942', lng: '127.027621',
  useTime: '24시간 이용가능', limitYn: 'N', delYn: 'N', stat: '2', statUpdDt: '20261012090000', ...overrides,
});
export interface Hold {
  holdId: string; charger: ChargerIdentity; range: TimeRange;
  createdAtMs: number; expiresAtMs: number; status: 'held';
}
export interface LinkResult {
  linkAllowed: boolean; holdExpired: boolean; linkUrl: string | null; expiresAtMs: number;
  summary: { holdId: string; charger: ChargerIdentity; range: TimeRange; amount: 3000; currency: 'KRW'; holdExpiresAtMs: number };
  approvalCommand: string; effects: readonly unknown[];
}
export interface Service {
  searchChargers(args: { location: '강남역'; connector: ConnectorKind; timeText: '7시'; durationMinutes: 30 | 60 | 90 }): Promise<{
    range: TimeRange; candidates: readonly { charger: ChargerIdentity; chargerType: string; distanceMeters: number; existingEligibilityPassed: true }[];
  }>;
  holdCharger(args: { statId: string; chgerId: string; connector: ConnectorKind; startMs: number; durationMinutes: number; requestId: string }): Promise<Hold>;
  requestPaymentLink(args: { holdId: string }): Promise<LinkResult>;
}
export interface Options {
  projectRoot: string; sourceDataDir: string; now: () => number; actorId: string; linkBaseUrl: string;
}
export async function productModule(relative: string): Promise<Record<string, unknown>> {
  const path = join(repoRoot, relative);
  // 누락 entry는 환경 import 오류가 아니라 제품 기능 미제공 assertion 실패다.
  const exists = await access(path).then(() => true, () => false);
  expect(exists, `제품 공개 진입점이 필요합니다: ${relative}`).toBe(true);
  return import(/* @vite-ignore */ pathToFileURL(path).href) as Promise<Record<string, unknown>>;
}
export async function service(options: Options): Promise<Service> {
  const mod = await productModule('src/mcp/booking-service.ts');
  expect(mod.createMcpBookingService).toBeTypeOf('function');
  return (mod.createMcpBookingService as (o: Options) => Service)(options);
}
export async function approve(holdId: string, options: Pick<Options, 'projectRoot' | 'now'>): Promise<{ holdId: string; approvalPath: string }> {
  const mod = await productModule('src/cli/approve.ts');
  expect(mod.approveHold).toBeTypeOf('function');
  return (mod.approveHold as (id: string, o: Pick<Options, 'projectRoot' | 'now'>) => Promise<{ holdId: string; approvalPath: string }>)(holdId, options);
}
export async function fixture(stations = [rawCharger()], statuses: Record<string, string>[] = []) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'ev-booking-mcp-test-'));
  const sourceDataDir = join(projectRoot, 'source-data');
  await mkdir(sourceDataDir);
  await writeFile(join(sourceDataDir, 'stations.json'), JSON.stringify(stations));
  await writeFile(join(sourceDataDir, 'status.json'), JSON.stringify(statuses));
  let nowMs = NOW;
  const options: Options = { projectRoot, sourceDataDir, now: () => nowMs, actorId: 'test-driver-1', linkBaseUrl: BASE };
  return { projectRoot, sourceDataDir, options, setNow: (ms: number) => { nowMs = ms; },
    statePath: join(projectRoot, '.local/mcp-booking/state.json'),
    approvalPath: (holdId: string) => join(projectRoot, '.codex/approvals', `${holdId}.json`),
    readApproval: async (holdId: string) => JSON.parse(await readFile(join(projectRoot, '.codex/approvals', `${holdId}.json`), 'utf8')) as unknown,
    clean: () => rm(projectRoot, { recursive: true, force: true }),
  };
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;
export function trustedEnv(f: Fixture): Record<string, string> {
  return { PATH: process.env.PATH ?? '', EV_BOOKING_ROOT: f.projectRoot,
    EV_BOOKING_SOURCE_DATA_DIR: f.sourceDataDir, EV_BOOKING_ACTOR_ID: 'test-driver-1',
    EV_BOOKING_LINK_BASE_URL: BASE, EV_BOOKING_NOW_MS: String(f.options.now()) };
}
