import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpBookingService, searchSchema, holdInputSchema, linkSchema } from './booking-service.js';
import { trustedEnvironment } from './environment.js';
import { BookingError } from './storage.js';

const service = createMcpBookingService(trustedEnvironment());
serveStdio(() => {
  const server = new McpServer({ name: 'ev-booking', version: '1.0.0' });
  async function respond(work: () => Promise<object>) {
    try {
      const result = await work();
      return { structuredContent: { ...result }, content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (error) {
      const code = error instanceof BookingError ? error.code : 'STORAGE_ERROR';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ code }) }] };
    }
  }
  server.registerTool('search_chargers', { description: '강남역 1km 가상 예약 충전기 검색. 서울 날짜 date(YYYY-MM-DD)와 시작 시각 startTime(HH:mm)을 함께 입력하거나 timeText:7시 단독으로 오늘19시를 검색한다. 두 방식 혼용 불가. 현재~7일, 00/30분 시작, 30/60/90분 이용.', inputSchema: searchSchema },
    (args) => respond(() => service.searchChargers(args)));
  server.registerTool('hold_charger', { description: '가상 예약 구간 10분 임시 점유', inputSchema: holdInputSchema },
    (args) => respond(() => service.holdCharger(args)));
  server.registerTool('request_payment_link', { description: '사람의 파일 승인 후 결제 없는 주소 요청', inputSchema: linkSchema },
    (args) => respond(() => service.requestPaymentLink(args)));
  return server;
}, { onerror: () => process.stderr.write('MCP_PROTOCOL_ERROR\n') });
