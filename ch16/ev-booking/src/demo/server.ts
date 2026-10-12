import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { trustedEnvironment } from '../mcp/environment.ts';
import { createPaymentDemoServer } from './payment-server.ts';

const options = trustedEnvironment();
const env = parseEnv(readFileSync(join(options.projectRoot, '.env'), 'utf8'));
const clientKey = env.TOSS_CLIENT_KEY ?? '';
const secretKey = env.TOSS_SECRET_KEY ?? '';
if (!/^test_gck_[A-Za-z0-9_-]+$/.test(clientKey) || !/^test_gsk_[A-Za-z0-9_-]+$/.test(secretKey)) {
  console.error('토스 위젯용 테스트 키가 필요합니다. .env를 확인하세요.');
  process.exit(1);
}
async function toss(path: string, body: object, idempotencyKey: string) {
  const response = await fetch(`https://api.tosspayments.com/v1/payments${path}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: await response.json() };
}
const server = await createPaymentDemoServer({ ...options, clientKey, toss });
server.listen(5180, '127.0.0.1', () => console.log('토스 테스트 결제 시연: http://127.0.0.1:5180'));
