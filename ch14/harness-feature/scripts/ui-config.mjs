import { resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..');
export const artifactRoot = resolve(root, 'artifacts/ui');
export const logPath = resolve(artifactRoot, 'server.jsonl');
export const host = '127.0.0.1';
export const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT는 1~65535의 정수여야 합니다.');
}
export const baseURL = `http://${host}:${port}`;
export const redact = value => String(value)
  .replace(/\b(?:test|live)_(?:sk|ck|gsk|gck)_[A-Za-z0-9_-]+/g, '[REDACTED]')
  .replace(/(bearer\s+|basic\s+)[^\s]+/gi, '$1[REDACTED]')
  .replace(/(authorization\s*[:=]\s*|bearer\s+|basic\s+)[^\s]+/gi, '$1[REDACTED]')
  .replace(/([?&](?:token|key|secret|password|paymentKey)=)[^&\s]+/gi, '$1[REDACTED]');
export const stringify = (value, space) => JSON.stringify(value,
  (_key, item) => typeof item === 'string' ? redact(item) : item, space);
