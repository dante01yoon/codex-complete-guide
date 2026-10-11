import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { lintSource } from './ui-lint.mjs';

const root = resolve(import.meta.dirname, '..');
const extensions = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.html', '.htm']);
const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'artifacts']);
const args = process.argv.slice(2);
const json = args.includes('--json');
if (args.some(arg => arg.startsWith('--') && arg !== '--json')) {
  console.error('사용법: npm run lint -- [--json] [파일 또는 폴더 ...]');
  process.exit(2);
}
const diagnostics = [];
const files = new Set();
async function collect(path, optional = false) {
  let entries;
  try { entries = await readdir(path, { withFileTypes: true }); }
  catch (error) {
    if (optional && error.code === 'ENOENT') return;
    if (error.code === 'ENOTDIR') { if (extensions.has(extname(path))) files.add(path); return; }
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (ignored.has(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error(`심볼릭 링크는 검사 범위를 숨길 수 있습니다: ${relative(root, resolve(path, entry.name))}`);
    if (entry.isDirectory()) await collect(resolve(path, entry.name));
    else if (extensions.has(extname(entry.name))) files.add(resolve(path, entry.name));
  }
}
try {
  const targets = args.filter(arg => arg !== '--json');
  if (targets.length) for (const target of targets) await collect(resolve(process.cwd(), target));
  else for (const target of ['web', 'src']) await collect(resolve(root, target), true);
  if (!files.size) throw new Error('검사할 화면/소스 파일이 없습니다. 검사 범위를 확인하세요.');
  for (const file of [...files].sort()) {
    const name = relative(root, file).replaceAll('\\', '/');
    const rules = name.startsWith('src/rules/');
    const client = !/^src\/(?:server|api)\//.test(name);
    diagnostics.push(...lintSource(await readFile(file, 'utf8'), name, { rules, client }));
  }
  diagnostics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));
  const status = diagnostics.length ? 'FAIL' : 'PASS';
  if (json) console.log(JSON.stringify({ status, checkedFiles: files.size, diagnostics }, null, 2));
  else {
    for (const item of diagnostics) console.error(`${item.file}:${item.line}:${item.column} error ${item.ruleId}\n  이유: ${item.reason}\n  수정: ${item.fix}`);
    console.log(`${status} — ${files.size}개 파일 검사, ${diagnostics.length}개 오류`);
  }
  process.exitCode = diagnostics.length ? 1 : 0;
} catch (error) {
  const result = { status: 'BLOCKED', message: error.message };
  if (json) console.log(JSON.stringify(result));
  else console.error(`BLOCKED — ${result.message}`);
  process.exitCode = 2;
}
