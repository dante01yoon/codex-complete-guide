import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';

// Node.js 24: node scripts/smoke-toss.mjs (works from any directory).
// T-47 partial smoke check only; this does not verify approval or refunds.
// Official API: https://docs.tosspayments.com/reference#결제-승인
// Basic auth: https://docs.tosspayments.com/reference/using-api/authorization
// Exactly one POST per invocation: no retries and no redirect following.
// Never log credentials, request headers, response messages, or raw errors.
// 2026-10-06 live test-key smoke: one HTTP request, 404 / NOT_FOUND_PAYMENT_SESSION.
// Connection/authentication smoke PASS; actual approval/refund ACs NOT_RUN.
function report(httpStatus, code) {
  console.log(JSON.stringify({ httpStatus, code }));
}

async function main() {
  let secret;
  try {
    const env = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
    secret = env.TOSS_SECRET_KEY;
  } catch {
    report(null, 'LOCAL_ENV_READ_FAILED');
    process.exitCode = 1;
    return;
  }
  // Read only the project .env; do not accept an inherited or production key.
  if (typeof secret !== 'string' || !/^test_(?:sk|gsk)_[^\s:]+$/.test(secret)) {
    report(null, 'LOCAL_TEST_SECRET_KEY_REQUIRED');
    process.exitCode = 1;
    return;
  }

  const nonce = randomUUID();
  let response;
  try {
    response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${secret}:`, 'utf8').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey: `smoke_nonexistent_payment_${nonce}`,
        orderId: `smoke_nonexistent_order_${nonce}`,
        amount: 3000,
      }),
    });
  } catch {
    report(null, 'LOCAL_REQUEST_FAILED');
    process.exitCode = 1;
    return;
  }

  let code = null;
  try {
    const body = await response.json();
    // Print only a provider error-code-shaped value, never arbitrary body text.
    if (typeof body?.code === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(body.code)) {
      code = body.code;
    }
  } catch {
    // An unreadable response is not authentication success; do not retry.
  }
  report(response.status, code);
  const missingPayment = code === 'NOT_FOUND_PAYMENT' || code === 'NOT_FOUND_PAYMENT_SESSION';
  process.exitCode = response.status === 404 && missingPayment ? 0 : 1;
}

await main();
