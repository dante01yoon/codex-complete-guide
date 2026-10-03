import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { loadLibraries, searchLibraries, statsByRegion } from './libraries.js';

async function main() {
  const csvPath = process.argv[2] ?? fileURLToPath(new URL('../전국도서관표준데이터.csv', import.meta.url));
  const { libraries, encoding } = await loadLibraries(csvPath);
  const byId = new Map(libraries.map(l => [l.id, l]));
  const server = new McpServer({ name: 'library-mcp', version: '1.0.0' }, {
    instructions: '전국도서관 CSV 조회 서버. search_libraries 결과의 id로 get_library를 호출하세요. 전화번호는 제공하지 않습니다. 장서는 자료수(도서) 기준이며 데이터기준일자는 각 도서관 상세에서 확인하세요.'
  });
  const filter = z.string().trim().min(1).max(200).optional();
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const result = (data: Record<string, unknown>) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], structuredContent: data
  });
  server.registerTool('search_libraries', {
    description: '시도(sido), 시군구(sigungu), 키워드(keyword)의 부분일치 AND 검색. 키워드는 이름·주소·운영기관·유형에서 찾습니다. 반환 id로 상세 조회하세요.',
    inputSchema: z.object({ sido: filter, sigungu: filter, keyword: filter,
      limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0) }), annotations
  }, async args => result(searchLibraries(libraries, args)));
  server.registerTool('stats_by_region', {
    description: '시도별 도서관 수와 장서 수(자료수(도서))를 집계합니다. sido 생략 시 전국 집계. 누락·잘못된 장서 값은 합계에서 제외하고 missingBookCount로 표시합니다. 시도는 CSV 표기를 유지합니다.',
    inputSchema: z.object({ sido: filter }), annotations
  }, async ({ sido }) => result(statsByRegion(libraries, sido)));
  server.registerTool('get_library', {
    description: 'search_libraries가 반환한 id로 도서관의 원본 상세 항목을 조회합니다. 전화번호는 제외됩니다.',
    inputSchema: z.object({ id: z.string().trim().min(1).max(100) }), annotations
  }, async ({ id }) => {
    const library = byId.get(id);
    if (!library) return { ...result({ error: '도서관을 찾을 수 없습니다.', id }), isError: true };
    return result({ id: library.id, bookCount: library.bookCount, details: library.fields });
  });
  // stdout is reserved exclusively for MCP protocol messages.
  console.error(`[library-mcp] ${encoding}: ${libraries.length}개 도서관 로드`);
  await server.connect(new StdioServerTransport());
}
main().catch(() => {
  console.error('[library-mcp] 시작 실패: CSV 경로·인코딩·필수 열을 확인하세요.');
  process.exitCode = 1;
});
