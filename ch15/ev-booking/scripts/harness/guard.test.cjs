// Guard regression checks use an isolated copy, never the project's real switch.
// No payment calls, keys, tests/ writes, or hook edits in the actual checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const project = path.resolve(__dirname, '../..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-guard-fixture-'));
const hookDir = path.join(fixture, '.codex');
const switchFile = path.join(hookDir, 'TEST_WRITING');
let failed = 0;
let passed = 0;

function setSwitch(on) {
  fs.rmSync(switchFile, { force: true, recursive: true });
  if (on) fs.writeFileSync(switchFile, '');
}
function run(event) {
  const result = spawnSync('bash', [path.join(hookDir, 'guard.sh')], {
    cwd: fixture,
    input: typeof event === 'string' ? event : JSON.stringify({ cwd: fixture, ...event }),
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return result;
}
function check(name, expected, event) {
  try {
    const result = run(event);
    assert.equal(result.status, expected, `exit=${result.status}: ${result.stderr.trim()}`);
    if (expected === 2) assert.match(result.stderr, /guard: BLOCKED/);
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
function patch(target, action = 'Add File') {
  return { tool_name: 'apply_patch', tool_input: `*** Begin Patch\n*** ${action}: ${target}\n+fixture\n*** End Patch` };
}
function command(cmd, workdir = fixture) {
  return { tool_name: 'exec_command', tool_input: { cmd, workdir } };
}

try {
  fs.mkdirSync(hookDir);
  fs.mkdirSync(path.join(fixture, 'tests/rules'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'docs'));
  fs.copyFileSync(path.join(project, '.codex/guard.sh'), path.join(hookDir, 'guard.sh'));
  fs.writeFileSync(path.join(hookDir, 'verify.sh'), '# fixture');
  fs.writeFileSync(path.join(hookDir, 'hooks.json'), '{}');
  fs.symlinkSync(path.join(fixture, 'tests'), path.join(fixture, 'test-alias'));
  fs.symlinkSync(hookDir, path.join(fixture, 'hook-alias'));

  for (const enabled of [false, true]) {
    setSwitch(enabled);
    const label = enabled ? 'ON' : 'OFF';
    const writeStatus = enabled ? 0 : 2;
    check(`${label} test add patch`, writeStatus, patch('tests/rules/payment.test.ts'));
    check(`${label} test delete patch`, writeStatus, patch('tests/rules/payment.test.ts', 'Delete File'));
    check(`${label} test write tool`, writeStatus, { tool_name: 'Write', tool_input: { file_path: 'tests/rules/payment.test.ts', content: '' } });
    check(`${label} test shell write`, writeStatus, command('touch tests/rules/payment.test.ts'));
    check(`${label} test symlink write`, writeStatus, patch('test-alias/rules/payment.test.ts'));
    check(`${label} test workdir write`, writeStatus, command('touch payment.test.ts', path.join(fixture, 'tests/rules')));
    check(`${label} snapshots`, writeStatus, command('npx vitest run --update'));
    check(`${label} test read`, 0, command('cat tests/rules/payment.test.ts'));
    check(`${label} test runner`, 0, command('npm run test:rules'));
    check(`${label} source patch`, 0, patch('src/rules/payment.ts'));
    for (const target of ['.codex/TEST_WRITING', '.codex/guard.sh', '.codex/verify.sh', '.codex/hooks.json']) {
      check(`${label} immutable patch ${target}`, 2, patch(target, 'Update File'));
      check(`${label} immutable Write ${target}`, 2, { tool_name: 'Write', tool_input: { file_path: target, content: '' } });
    }
    check(`${label} switch creation`, 2, command('touch .codex/TEST_WRITING'));
    check(`${label} switch removal`, 2, command('rm .codex/TEST_WRITING'));
    check(`${label} hook directory removal`, 2, command('rm -rf .codex'));
    check(`${label} project ancestor removal`, 2, command('rm -rf .'));
    check(`${label} hook symlink`, 2, patch('hook-alias/guard.sh', 'Update File'));
    check(`${label} normalized hook path`, 2, patch('docs/../.codex/guard.sh', 'Delete File'));
    check(`${label} switch move destination`, 2, { tool_name: 'apply_patch', tool_input: '*** Begin Patch\n*** Update File: docs/file.md\n*** Move to: .codex/TEST_WRITING\n*** End Patch' });
    check(`${label} hook Read tool`, 0, { tool_name: 'Read', tool_input: { file_path: '.codex/guard.sh' } });
    check(`${label} hook shell read`, 0, command('cat .codex/guard.sh'));
    check(`${label} combined test and switch write`, 2, command('touch tests/rules/payment.test.ts; rm .codex/TEST_WRITING'));
    check(`${label} test path as content only`, 0, { tool_name: 'apply_patch', tool_input: '*** Begin Patch\n*** Update File: docs/file.md\n+Mention tests/rules/payment.test.ts\n*** End Patch' });
  }
  setSwitch(false);
  fs.mkdirSync(switchFile);
  check('directory cannot enable switch', 2, patch('tests/rules/payment.test.ts'));
  setSwitch(false);
  fs.writeFileSync(path.join(fixture, 'untrusted-switch'), '');
  fs.symlinkSync(path.join(fixture, 'untrusted-switch'), switchFile);
  check('symlink cannot enable switch', 2, patch('tests/rules/payment.test.ts'));
  check('malformed JSON remains blocked', 2, '{broken');
  console.log(`Guard regression: ${passed} PASS / ${failed} FAIL (isolated fixture only)`);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
