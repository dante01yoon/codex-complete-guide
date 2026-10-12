import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { approve, BASE, fixture, holdArgs, NOW, repoRoot, searchArgs, START, trustedEnv } from './fixtures.js';
import type { Fixture } from './fixtures.js';

// 실제 SDK stdio 프로토콜을 사용한다. 서버·도구 구현 mock 없음.
// 신뢰된 환경의 root는 임시 프로젝트이며 실제 보호 승인 폴더를 가리키지 않는다.
const fixtures: Fixture[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map((f) => f.clean())); });
async function connected() {
  const entry = join(repoRoot, 'src/mcp/server.ts');
  expect(await access(entry).then(() => true, () => false), '제품 MCP stdio 서버 진입점이 필요합니다').toBe(true);
  const f = await fixture(); fixtures.push(f);
  const client = new Client({ name: 'ev-booking-integration-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', 'tsx', entry], cwd: repoRoot, env: trustedEnv(f), stderr: 'pipe' });
  try { await client.connect(transport); } catch (error) { await transport.close(); throw error; }
  return { f, client, close: async () => { try { await client.close(); } finally { await transport.close(); } } };
}

describe('MCP SDK Client / 실제 tools/list·tools/call', () => {
  it('AC-18-8 / GIVEN 격리stdio서버 WHEN initialize·tools/list THEN 세도구·신뢰context인수없음', async () => {
    const { client, close } = await connected();
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(['hold_charger', 'request_payment_link', 'search_chargers']);
      for (const tool of tools) {
        expect(Object.keys(tool.inputSchema.properties ?? {})).not.toEqual(expect.arrayContaining(['projectRoot']));
        for (const forbidden of ['approved', 'approvalFileExists', 'approvalPath', 'projectRoot', 'actorId', 'nowMs']) {
          expect(tool.inputSchema.properties ?? {}).not.toHaveProperty(forbidden);
        }
      }
    } finally { await close(); }
  }, 15000);
  it('AC-18-2·8·9·11 / GIVEN 승인없는점유 WHEN 실제세도구·승인함수·재요청 THEN 파일읽기후에만주소·원기한', async () => {
    const { f, client, close } = await connected();
    try {
      const search = await client.callTool({ name: 'search_chargers', arguments: searchArgs });
      expect(search.isError).not.toBe(true);
      expect(search.structuredContent).toMatchObject({ range: { startMs: START, endMs: START + 1800000 }, candidates: [{ charger: { statId: 'A', chgerId: '01' } }] });
      const held = await client.callTool({ name: 'hold_charger', arguments: holdArgs });
      expect(held.isError).not.toBe(true);
      expect(held.structuredContent).toMatchObject({ createdAtMs: NOW, expiresAtMs: NOW + 600000, status: 'held' });
      const heldContent = held.structuredContent as Record<string, unknown> | undefined;
      const holdId = heldContent?.holdId;
      expect(holdId).toBeTypeOf('string');
      if (typeof holdId !== 'string') throw new Error('hold 도구가 점유 식별자를 제공해야 합니다');
      const forged = await client.callTool({ name: 'request_payment_link', arguments: { holdId, approved: true } });
      expect(forged.isError).toBe(true);
      const pending = await client.callTool({ name: 'request_payment_link', arguments: { holdId } });
      expect(pending.isError).not.toBe(true);
      expect(pending.structuredContent).toMatchObject({ linkAllowed: false, linkUrl: null, effects: [], approvalCommand: `npm run approve -- ${holdId}` });
      await approve(holdId, f.options);
      const linked = await client.callTool({ name: 'request_payment_link', arguments: { holdId } });
      expect(linked.isError).not.toBe(true);
      expect(linked.structuredContent).toMatchObject({ linkAllowed: true, linkUrl: `${BASE}/payment/${holdId}`, expiresAtMs: NOW + 600000 });
      expect(linked.content).toEqual([{ type: 'text', text: JSON.stringify(linked.structuredContent) }]);
      const repeated = await client.callTool({ name: 'request_payment_link', arguments: { holdId } });
      expect(repeated.structuredContent).toEqual(linked.structuredContent);
    } finally { await close(); }
  }, 15000);
});
