import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../dist/server.js', import.meta.url))],
  cwd: '/tmp', stderr: 'pipe'
});
let stderr = '';
transport.stderr?.on('data', data => { stderr += data.toString(); });
const client = new Client({ name: 'library-verifier', version: '1.0.0' });
const parseResult = result => {
  assert.equal(result.isError, undefined);
  const data = JSON.parse(result.content.find(c => c.type === 'text').text);
  assert.deepEqual(data, result.structuredContent);
  assert.ok(!/전화|팩스|"phone"|"tel"|"fax"/i.test(JSON.stringify(data)));
  return data;
};
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), ['get_library', 'search_libraries', 'stats_by_region']);
  const searchArguments = { sido: '전라남도', sigungu: '보성군', keyword: '보성', limit: 2 };
  const search = parseResult(await client.callTool({ name: 'search_libraries', arguments: searchArguments }));
  assert.ok(search.total > 0);
  assert.equal(search.libraries[0].name, '전라남도교육청보성도서관');
  const detail = parseResult(await client.callTool({ name: 'get_library', arguments: { id: search.libraries[0].id } }));
  assert.equal(detail.details['도서관명'], search.libraries[0].name);
  assert.equal(detail.bookCount, 96794);
  const stats = parseResult(await client.callTool({ name: 'stats_by_region', arguments: {} }));
  assert.equal(stats.totalLibraries, 3601);
  assert.equal(stats.totalLibraries, stats.regions.reduce((n, r) => n + r.libraryCount, 0));
  const regional = parseResult(await client.callTool({ name: 'stats_by_region', arguments: { sido: '전라남도' } }));
  assert.deepEqual(regional.regions, stats.regions.filter(r => r.sido.includes('전라남도')));
  const next = parseResult(await client.callTool({ name: 'search_libraries', arguments: { ...searchArguments, offset: 2 } }));
  assert.ok(!next.libraries.some(l => search.libraries.some(first => first.id === l.id)));
  const missing = await client.callTool({ name: 'get_library', arguments: { id: 'missing-id' } });
  assert.equal(missing.isError, true);
  const invalid = await client.callTool({ name: 'search_libraries', arguments: { limit: 0 } });
  assert.equal(invalid.isError, true);
  const report = { status: 'PASS', transport: 'STDIO', node: process.execPath, tools: tools.map(t => ({ name: t.name, inputSchema: t.inputSchema })), searchArguments, searchResult: search,
    statsSummary: { totalLibraries: stats.totalLibraries, totalBooks: stats.totalBooks, missingBookCount: stats.missingBookCount, regionCount: stats.regions.length },
    checks: ['initialize', 'tools/list', 'all three tools/call', 'phone exclusion', 'pagination', 'unknown ID', 'invalid arguments', 'arbitrary working directory'], stderr: stderr.trim() };
  await writeFile(new URL('../verification-result.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}
