import { randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ZodType } from 'zod';
import { createBookingService, registerBookingTools } from './booking-server.js';
import type { BookingDependencies, BookingService, BookingStore } from './booking-server.js';

/** This process-local demo adapter is not shared storage or a login mechanism. */
export function createMemoryBookingStore(): BookingStore {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    holds: new Map(), confirmedReservations: [], blockedChargers: new Set(),
    transaction<T>(work: () => T | Promise<T>): Promise<T> {
      const result = queue.then(work);
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

export function createMcpBookingServer(service: BookingService): McpServer {
  const server = new McpServer({ name: 'ev-booking-local-demo', version: '0.1.0' });
  registerBookingTools({
    registerTool(name, config, handler) {
      return server.registerTool(name, {
        description: config.description,
        inputSchema: config.inputSchema as Record<string, ZodType>,
      }, async input => {
        const result = await handler(input);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          isError: typeof result === 'object' && result !== null && 'ok' in result && result.ok === false };
      });
    },
  }, service);
  return server;
}

export function localDemoDependencies(projectDirectory: string): BookingDependencies {
  // Optional deterministic demo anchor progresses without changing the computer clock.
  const anchor = process.env.BOOKING_DEMO_NOW;
  const anchorMs = anchor ? Date.parse(anchor) : Date.now();
  if (!Number.isSafeInteger(anchorMs)) throw new Error('Invalid BOOKING_DEMO_NOW');
  const monotonicStart = performance.now();
  const userId = process.env.BOOKING_DEMO_USER_ID ?? '';
  return {
    projectDirectory, dataDirectory: resolve(projectDirectory, '../ev-map/data'),
    readJson: async path => JSON.parse(await readFile(path, 'utf8')) as unknown,
    now: () => anchorMs + Math.floor(performance.now() - monotonicStart),
    // Trusted process configuration; tool input can never select another user.
    getActor: () => ({ userId, role: 'driver' }),
    newHoldId: () => `hold-${randomUUID()}`, store: createMemoryBookingStore(),
    approvalFiles: {
      async exists(path) {
        try {
          for (const directory of [resolve(projectDirectory, '.codex'), dirname(path)]) {
            const info = await lstat(directory);
            if (!info.isDirectory() || info.isSymbolicLink()) return false;
          }
          const info = await lstat(path);
          return info.isFile() && !info.isSymbolicLink();
        } catch { return false; }
      },
    },
    // AC-18-11: URL-only local demo; no checkout server, payment or network request.
    async createPaymentLink() {
      return `http://127.0.0.1:5180/checkout/${randomUUID()}`;
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const dependencies = localDemoDependencies(projectDirectory);
    const server = createMcpBookingServer(createBookingService(dependencies));
    console.error('학습용 가상 예약 MCP: 저장 데이터·메모리 점유, 실제 충전소 이용 보장 없음.');
    console.error('BOOKING_DEMO_USER_ID는 시연용 계정 주입이며 로그인 인증이 아닙니다. 사람 승인 후 로컬 테스트 링크만 반환하며 결제창과 실제 결제는 제공하지 않습니다.');
    await server.connect(new StdioServerTransport());
  } catch {
    console.error('로컬 예약 MCP를 시작하지 못했습니다. 실행 설정과 저장 데이터를 확인하세요.');
    process.exitCode = 1;
  }
}
