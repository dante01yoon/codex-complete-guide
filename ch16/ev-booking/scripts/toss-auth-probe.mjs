#!/usr/bin/env node
// Diagnostic only: one nonexistent payment, no retries, no application state.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import https from 'node:https';

const endpoint = 'https://api.tosspayments.com/v1/payments/confirm';
const report = {
  checkedAt: new Date().toISOString(),
  endpoint,
  mode: 'test',
  requestAttempts: 0,
  connectivity: 'NOT_RUN',
  authentication: 'NOT_RUN',
  paymentApproval: 'NOT_RUN',
};

async function main() {
  // Read the project .env directly; inherited environment cannot override it.
  let secret;
  try {
    secret = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'))
      .TOSS_SECRET_KEY;
  } catch {
    report.authentication = 'BLOCKED';
    report.reason = 'ENV_LOAD_FAILED';
    return;
  }
  if (typeof secret !== 'string' || !/^test_(?:gsk|sk)_[A-Za-z0-9_-]+$/.test(secret)) {
    report.authentication = 'BLOCKED';
    report.reason = 'TEST_SECRET_KEY_REQUIRED';
    return;
  }

  const id = randomUUID();
  const body = JSON.stringify({
    paymentKey: `nonexistent_auth_probe_${id}`,
    orderId: `auth_probe_${id}`,
    amount: 3000,
  });
  // Never print headers, keys, response body, or raw exceptions.
  const authorization = `Basic ${Buffer.from(`${secret}:`).toString('base64')}`;
  const response = await new Promise((resolve, reject) => {
    report.requestAttempts = 1;
    const req = https.request(endpoint, {
      method: 'POST',
      agent: false,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 65536) req.destroy(new Error('RESPONSE_TOO_LARGE'));
      });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    const deadline = setTimeout(() => req.destroy(new Error('TIMEOUT')), 15000);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject);
    req.end(body);
  });

  report.httpStatus = response.status;
  report.connectivity = 'PASS';
  let code;
  try { code = JSON.parse(response.data).code; } catch { /* No raw output. */ }
  // Print only an error-code token, never arbitrary response content.
  if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(code)) {
    report.apiCode = code;
  }
  if (response.status === 404 && code === 'NOT_FOUND_PAYMENT') {
    report.authentication = 'PASS';
    report.reason = 'NONEXISTENT_PAYMENT_REJECTED_AFTER_AUTHENTICATION';
  } else {
    report.authentication = 'FAIL';
    report.reason = 'EXPECTED_NOT_FOUND_PAYMENT_NOT_RECEIVED';
  }
}

try {
  await main();
} catch {
  report.connectivity = 'FAIL';
  report.authentication = 'NOT_RUN';
  report.reason = 'NETWORK_OR_RESPONSE_FAILURE_NO_RETRY';
}
if (report.apiCode) console.log(report.apiCode);
process.exitCode = report.authentication === 'PASS' ? 0 : 1;
