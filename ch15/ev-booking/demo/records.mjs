import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const loopsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../artifacts/loops');
const statuses = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN']);
const secrets = Object.entries(process.env)
  .filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD|AUTH/i.test(key) && value?.length >= 8)
  .map(([, value]) => value);

function redact(value) {
  let text = String(value);
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  return text.replace(/\b(?:live|test)_(?:g?ck|g?sk)_[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_KEY]')
    .replace(/(Authorization["\s:=]+(?:Basic|Bearer)\s+)[A-Za-z0-9+/=._-]+/gi, '$1[REDACTED]');
}

function clean(value, key = '') {
  if (/^(?:apiKey|secretKey|clientKey|accessToken|refreshToken|password|authorization)$/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(item => clean(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, clean(item, name)]));
  return value;
}

function check(value) {
  return { ...value, status: statuses.has(value?.status) ? value.status : 'NOT_RUN' };
}

function counts(cases) {
  if (!Array.isArray(cases) || !cases.length) return { passed: null, failed: null };
  return {
    passed: cases.filter(item => item.status === 'passed').length,
    failed: cases.filter(item => item.status === 'failed').length,
  };
}

function messageFrom(stop) {
  const message = stop?.detail?.message;
  if (!message) return stop?.detail?.error || null;
  try {
    const event = JSON.parse(message);
    return event.item?.text || event.error?.message || event.message || message;
  } catch { return message; }
}

async function readLoop(directory, id) {
  const warnings = [];
  const root = await realpath(directory);
  async function json(name, required = false) {
    try {
      const file = await realpath(path.join(directory, name));
      if (!file.startsWith(root + path.sep)) throw new Error('기록 폴더 밖의 파일');
      return clean(JSON.parse(await readFile(file, 'utf8')));
    } catch (error) {
      if (required || error.code !== 'ENOENT') warnings.push(`${name}: ${error.code === 'ENOENT' ? '파일 없음' : '읽을 수 없는 기록'}`);
      return null;
    }
  }
  const names = await readdir(directory);
  const [run, baseline, summary] = await Promise.all([
    json('run.json', true), json('baseline.json', true), json('summary.json'),
  ]);
  const roundNames = names.filter(name => /^round-\d+\.json$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const rawRounds = (await Promise.all(roundNames.map(name => json(name, true)))).filter(Boolean);
  const stop = summary?.stop || rawRounds.at(-1)?.stop || null;
  const baselineInvalid = stop?.reason === 'test_report_invalid' && stop?.detail?.phase === 'baseline';
  const baselineCounts = baselineInvalid ? { passed: null, failed: null } : counts(baseline?.cases);
  const rounds = rawRounds.map(round => ({
    number: round.round,
    startedAt: round.startedAt || null,
    endedAt: round.endedAt || null,
    codex: check(round.codex), tests: check(round.tests), types: check(round.types),
    passed: Number.isInteger(round.passed) ? round.passed : null,
    failed: Number.isInteger(round.failed) ? round.failed : null,
    beforeFailures: round.beforeFailures || [],
    failedCases: round.failedCases || [],
    stop: round.stop || null,
  }));
  return {
    id, run, warnings,
    status: statuses.has(summary?.status) ? summary.status : 'NOT_RUN',
    summaryMissing: !summary,
    baseline: {
      tests: check(baseline?.tests), types: check(baseline?.types),
      ...baselineCounts, invalid: baselineInvalid,
      failedCases: (baseline?.cases || []).filter(item => item.status === 'failed'),
    },
    rounds, stop, stopMessage: messageFrom(stop),
    elapsedMs: summary?.elapsedMs ?? stop?.elapsedMs ?? null,
    raw: { run, baseline, rounds: rawRounds, summary },
  };
}

export async function readLoops(directory = loopsRoot) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return { loops: [], warnings: ['artifacts/loops 폴더가 없습니다.'] };
    throw error;
  }
  const results = await Promise.all(entries.filter(entry => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => readLoop(path.join(directory, entry.name), entry.name)
      .catch(() => ({ id: entry.name, unreadable: true }))));
  return {
    loops: results.filter(item => !item.unreadable),
    warnings: results.filter(item => item.unreadable).map(item => `${item.id}: 폴더를 읽을 수 없습니다.`),
  };
}
