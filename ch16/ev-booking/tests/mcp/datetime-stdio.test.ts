import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { fixture, NOW, repoRoot, searchArgs, START, trustedEnv } from './fixtures.js';
import type { Fixture } from './fixtures.js';

// T-59: 사용자 명시 확인 전 실행/수집 금지. 실제 SDK·서버, 격리root만 사용.
const fixtures: Fixture[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map((f) => f.clean())); });
async function connected() {
  const f = await fixture(); fixtures.push(f);
  const client = new Client({ name: 'ev-booking-datetime-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', 'tsx', join(repoRoot, 'src/mcp/server.ts')], cwd: repoRoot, env: trustedEnv(f), stderr: 'pipe' });
  try { await client.connect(transport); } catch (error) { await transport.close(); throw error; }
  return { client, close: async () => { try { await client.close(); } finally { await transport.close(); } } };
}
const explicit = { location: '강남역', connector: 'DC콤보', durationMinutes: 30, date: '2026-10-13', startTime: '19:00' };
const startMs = Date.parse('2026-10-13T19:00:00+09:00');

describe('T-59 / AC-18-8·15 / 실제 SDK 날짜 필드 발견·호출', () => {
  it('AC-18-8·15 / GIVEN stdio 서버 WHEN tools/list THEN 날짜·시각 필드 발견·신뢰 context 노출 없음', async () => {
    const { client, close } = await connected();
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(['hold_charger', 'request_payment_link', 'search_chargers']);
      const properties = tools.find((t) => t.name === 'search_chargers')?.inputSchema.properties;
      expect(properties).toHaveProperty('date'); expect(properties).toHaveProperty('startTime'); expect(properties).toHaveProperty('timeText');
      for (const tool of tools) for (const field of ['nowMs', 'actorId', 'approved', 'projectRoot', 'approvalPath', 'approvalFileExists']) {
        expect(tool.inputSchema.properties ?? {}).not.toHaveProperty(field);
      }
    } finally { await close(); }
  }, 15000);

  it('AC-18-13·15·10 / GIVEN 13일19시 입력 WHEN tools/call 검색→hold→반복 THEN 명시 구간·원래10분 보존', async () => {
    const { client, close } = await connected();
    try {
      const search = await client.callTool({ name: 'search_chargers', arguments: explicit });
      expect(search.isError).not.toBe(true);
      expect(search.structuredContent).toMatchObject({ range: { startMs, endMs: startMs + 1_800_000 }, candidates: [{ charger: { statId: 'A', chgerId: '01' } }] });
      const range = (search.structuredContent as { range: { startMs: number; endMs: number } }).range;
      const args = { statId: 'A', chgerId: '01', connector: 'DC콤보', startMs: range.startMs, durationMinutes: 30, requestId: 'stdio-datetime-hold' };
      const hold = await client.callTool({ name: 'hold_charger', arguments: args });
      expect(hold.isError).not.toBe(true);
      expect(hold.structuredContent).toMatchObject({ range, createdAtMs: NOW, expiresAtMs: NOW + 600_000, status: 'held' });
      const repeated = await client.callTool({ name: 'hold_charger', arguments: args });
      expect(repeated.structuredContent).toEqual(hold.structuredContent);
    } finally { await close(); }
  }, 15000);

  it('AC-18-3·14 / GIVEN legacy7시 단독 WHEN SDK 검색 THEN 오늘19시 유지', async () => {
    const { client, close } = await connected();
    try {
      const result = await client.callTool({ name: 'search_chargers', arguments: searchArgs });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ range: { startMs: START, endMs: START + 1_800_000 } });
    } finally { await close(); }
  }, 15000);

  it('AC-18-14·15 / GIVEN 혼용·누락·자동보정날짜 WHEN SDK 검색 THEN 오류·성공 후보 없음', async () => {
    const { client, close } = await connected();
    try {
      for (const args of [
        { ...explicit, timeText: '7시' }, { ...searchArgs, date: explicit.date },
        { location: '강남역', connector: 'DC콤보', durationMinutes: 30, date: explicit.date },
        { ...explicit, date: '2026-02-30' },
      ]) {
        const result = await client.callTool({ name: 'search_chargers', arguments: args });
        expect(result.isError, JSON.stringify(args)).toBe(true);
        expect(result.structuredContent).toBeUndefined();
      }
    } finally { await close(); }
  }, 15000);

  it('AC-18-8·15 / GIVEN 명시 입력 WHEN 서버시계·사용자·승인·root 위조 THEN SDK 오류', async () => {
    const { client, close } = await connected();
    try {
      for (const forged of [{ nowMs: NOW }, { actorId: 'test-driver-2' }, { approved: true }, { projectRoot: '/untrusted-root' }]) {
        const result = await client.callTool({ name: 'search_chargers', arguments: { ...explicit, ...forged } });
        expect(result.isError, JSON.stringify(forged)).toBe(true);
      }
    } finally { await close(); }
  }, 15000);
});
