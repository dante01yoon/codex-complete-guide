import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { parse as parseHTML } from 'parse5';

const traverse = traverseModule.default ?? traverseModule;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const diagnostics = [];
let filesChecked = 0;
const extensions = /\.(?:[cm]?[jt]sx?|html?|vue|svelte)$/i;
const domainWords = /^(?:refund\w*|deposit|amount|price|cost|fee|won|money|now|time|date|timestamp|deadline|expires?|expiry|remaining|minutes?|seconds?|hours?|days?|duration|start|end|ms|at)$/i;
function domainName(name) {
  return name.replace(/([a-z\d])([A-Z])/g, '$1_$2').split(/[^\p{L}\p{N}]+/u)
    .some((word) => domainWords.test(word) || /환불|금액|예약금|잔여|남은|시각|시간|기한/.test(word));
}
const fixes = {
  'ARCH-RULES': '금액·시간의 계산/경계 판정을 src/rules의 순수 함수로 옮기고, 화면에서는 서버 기준 시각을 인자로 전달해 반환 결과만 표시하세요. 기존 함수가 있으면 import하여 재사용하세요. src/rules·tests 변경이 금지된 요청에서는 별도 작업으로 보고하세요.',
  'ARCH-CLOCK': '서버 응답 또는 화면에 주입된 기준 시각(serverNowMs 등)을 받으세요. 현재 시각의 로컬 획득/대체값을 제거하고, src/rules 함수에 그 시각을 전달하세요. 표시 변환은 new Date(serverNowMs)처럼 명시적 값으로 하세요.',
  'ARCH-PARSE': '문법 오류를 수정하세요. Vue/Svelte는 현재 검사기가 지원하지 않으므로 화면 추가 전에 해당 파서와 검사 범위를 확장하세요.',
};
function report(file, source, offset, rule, reason) {
  const prefix = source.slice(0, offset);
  const line = prefix.split('\n').length;
  const column = offset - prefix.lastIndexOf('\n');
  diagnostics.push({ file: relative(root, file), line, column, rule, reason });
}

function inspect(file, source, code, baseOffset = 0, jsx = false) {
  let ast;
  try {
    ast = parse(code, { sourceType: 'unambiguous', plugins: ['typescript', ...(jsx ? ['jsx'] : [])] });
  } catch (error) {
    report(file, source, baseOffset + (error.pos ?? 0), 'ARCH-PARSE', error.message);
    return;
  }
  const marked = new Set();
  function hasDomain(path) {
    if (!path?.node) return false;
    if (path.isIdentifier()) return domainName(path.node.name) || marked.has(path.scope.getBinding(path.node.name));
    if (path.isMemberExpression() || path.isOptionalMemberExpression()) {
      const prop = path.node.property;
      return domainName(prop.name ?? prop.value ?? '') || hasDomain(path.get('object'));
    }
    if (path.isCallExpression() || path.isOptionalCallExpression()) {
      const callee = path.node.callee;
      // Formatting and rules calls themselves are allowed; only operands are classified here.
      return callee.type === 'MemberExpression' && /^(?:getTime|valueOf|getMinutes|getHours)$/.test(callee.property.name ?? '');
    }
    if (path.isNewExpression()) return isDate(path.get('callee'));
    return path.get('expression')?.node ? hasDomain(path.get('expression'))
      : path.isBinaryExpression() ? hasDomain(path.get('left')) || hasDomain(path.get('right'))
        : path.isUnaryExpression() ? hasDomain(path.get('argument')) : false;
  }
  function isDate(path, seen = new Set()) {
    if (path.isIdentifier()) {
      const binding = path.scope.getBinding(path.node.name);
      if (!binding) return path.node.name === 'Date';
      if (seen.has(binding) || !binding.constant || !binding.path.isVariableDeclarator()) return false;
      seen.add(binding);
      return isDate(binding.path.get('init'), seen);
    }
    if (path.isMemberExpression() || path.isOptionalMemberExpression()) {
      const object = path.get('object');
      return (path.node.property.name ?? path.node.property.value) === 'Date'
        && object.isIdentifier() && ['window', 'globalThis', 'self'].includes(object.node.name)
        && !object.scope.getBinding(object.node.name);
    }
    return path.isTSAsExpression() || path.isParenthesizedExpression() ? isDate(path.get('expression'), seen) : false;
  }
  function domainSink(path) {
    for (let parent = path.parentPath; parent && !parent.isStatement(); parent = parent.parentPath) {
      if (parent.isVariableDeclarator()) return patternDomain(parent.node.id);
      if (parent.isAssignmentExpression()) return hasDomain(parent.get('left'));
      if (parent.isObjectProperty()) return domainName(parent.node.key.name ?? parent.node.key.value ?? '');
      if (parent.isFunction()) break;
    }
    const fn = path.getFunctionParent();
    return !!fn && domainName(fn.node.id?.name ?? '');
  }
  function patternDomain(node) {
    if (node.type === 'Identifier') return domainName(node.name);
    if (node.type === 'ObjectPattern') return node.properties.some((prop) => patternDomain(prop.value ?? prop.argument));
    if (node.type === 'AssignmentPattern') return patternDomain(node.left);
    return false;
  }
  // Follow simple local aliases by lexical binding, including destructured property renames.
  let changed;
  do {
    changed = false;
    traverse(ast, {
      VariableDeclarator(path) {
        const id = path.get('id');
        const init = path.get('init');
        if (id.isIdentifier() && hasDomain(init)) mark(path.scope.getBinding(id.node.name));
        if (id.isObjectPattern()) {
          for (const prop of id.get('properties')) {
            if (!prop.isObjectProperty()) continue;
            const value = prop.get('value');
            const local = value.isAssignmentPattern() ? value.get('left') : value;
            if (local.isIdentifier() && domainName(prop.node.key.name ?? prop.node.key.value ?? '')) mark(local.scope.getBinding(local.node.name));
          }
        }
      },
      AssignmentExpression(path) {
        if (path.get('left').isIdentifier() && hasDomain(path.get('right'))) mark(path.scope.getBinding(path.node.left.name));
      },
    });
  } while (changed);
  function mark(binding) {
    if (binding && !marked.has(binding)) { marked.add(binding); changed = true; }
  }
  function emit(path, rule, reason) { report(file, source, baseOffset + path.node.start, rule, reason); }
  traverse(ast, {
    NewExpression(path) {
      if (isDate(path.get('callee')) && path.node.arguments.length === 0) emit(path, 'ARCH-CLOCK', '인자 없는 new Date()는 브라우저 현재 시각을 사용합니다.');
    },
    CallExpression(path) {
      if (isDate(path.get('callee'))) emit(path, 'ARCH-CLOCK', 'Date() 호출은 브라우저 현재 시각을 사용합니다.');
      const callee = path.get('callee');
      if (callee.isMemberExpression() && /^set(?:Time|Minutes|Hours|Date|Month|FullYear|Seconds|Milliseconds|UTC\w+)$/.test(callee.node.property.name ?? '')) {
        emit(path, 'ARCH-RULES', '화면에서 Date 값을 변경하여 시간 규칙을 계산합니다.');
      }
      if (callee.isMemberExpression() && callee.node.object.name === 'Math'
        && /^(?:floor|ceil|round|min|max|abs|trunc)$/.test(callee.node.property.name ?? '')
        && (domainSink(path) || path.get('arguments').some(hasDomain))) {
        emit(path, 'ARCH-RULES', '화면에서 금액·남은 시간의 반올림/경계를 계산합니다.');
      }
    },
    'MemberExpression|OptionalMemberExpression'(path) {
      if ((path.node.property.name ?? path.node.property.value) === 'now' && isDate(path.get('object'))) {
        emit(path, 'ARCH-CLOCK', 'Date.now 참조/호출은 서버 기준 시각을 우회합니다.');
      }
    },
    VariableDeclarator(path) {
      if (path.get('id').isObjectPattern() && isDate(path.get('init'))
        && path.node.id.properties.some((prop) => (prop.key?.name ?? prop.key?.value) === 'now')) {
        emit(path, 'ARCH-CLOCK', 'Date에서 now를 꺼내면 로컬 현재 시각을 얻는 우회 경로가 됩니다.');
      }
    },
    BinaryExpression(path) {
      const { operator, left, right } = path.node;
      const domain = hasDomain(path.get('left')) || hasDomain(path.get('right')) || domainSink(path);
      if (!domain) return;
      // A string label is presentation, not amount arithmetic.
      if (operator === '+' && (left.type === 'StringLiteral' || right.type === 'StringLiteral')) return;
      if (['+', '-', '*', '/', '%', '**', '<', '<=', '>', '>='].includes(operator)
        || (['==', '===', '!=', '!=='].includes(operator) && (left.type === 'NumericLiteral' || right.type === 'NumericLiteral'))) {
        emit(path, 'ARCH-RULES', `화면에서 금액·시간을 직접 계산/판정(${operator})합니다.`);
      }
    },
    AssignmentExpression(path) {
      if (path.node.operator !== '=' && (hasDomain(path.get('left')) || domainSink(path))) emit(path, 'ARCH-RULES', `화면에서 금액·시간을 복합 대입(${path.node.operator})으로 계산합니다.`);
    },
    UpdateExpression(path) {
      if (hasDomain(path.get('argument'))) emit(path, 'ARCH-RULES', '화면에서 금액·시간 값을 증감합니다.');
    },
    ConditionalExpression(path) {
      if (domainSink(path) && (path.node.consequent.type === 'NumericLiteral' || path.node.alternate.type === 'NumericLiteral')) {
        emit(path, 'ARCH-RULES', '화면의 조건식으로 금액·시간의 숫자 결과를 정합니다.');
      }
    },
  });
}

async function checkFile(file) {
  filesChecked++;
  const source = await readFile(file, 'utf8');
  if (/\.(vue|svelte)$/i.test(file)) {
    report(file, source, 0, 'ARCH-PARSE', '지원되지 않는 화면 파일입니다. 검사를 생략하지 않습니다.');
  } else if (/\.html?$/i.test(file)) {
    const doc = parseHTML(source, { sourceCodeLocationInfo: true });
    function visit(node) {
      if (node.tagName === 'script') {
        const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
        if (!attrs.src && (!attrs.type || /^(?:module|(?:text|application)\/(?:javascript|ecmascript))$/i.test(attrs.type))) {
          const start = node.sourceCodeLocation.startTag.endOffset;
          const end = node.sourceCodeLocation.endTag?.startOffset ?? node.sourceCodeLocation.endOffset;
          inspect(file, source, source.slice(start, end), start);
        }
      }
      for (const attr of node.attrs ?? []) {
        if (/^on[a-z]+$/i.test(attr.name)) {
          const loc = node.sourceCodeLocation.attrs[attr.name];
          const raw = source.slice(loc.startOffset, loc.endOffset);
          const valueStart = raw.search(/=\s*/);
          if (valueStart >= 0) {
            const afterEquals = raw.slice(valueStart).match(/^=\s*/)[0].length + valueStart;
            const quote = /["']/.test(raw[afterEquals]) ? 1 : 0;
            inspect(file, source, attr.value, loc.startOffset + afterEquals + quote);
          }
        }
      }
      for (const child of node.childNodes ?? []) visit(child);
      if (node.content) visit(node.content);
    }
    visit(doc);
  } else inspect(file, source, source, 0, /\.[jt]sx$/i.test(file));
}
async function scan(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(directory, entry.name);
    const name = relative(root, file).replaceAll('\\', '/');
    if (['src/rules', 'src/server'].includes(name) || /\.server\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/.test(name)) continue;
    if (entry.isDirectory()) await scan(file);
    else if (entry.isFile() && extensions.test(entry.name)) await checkFile(file);
  }
}
try {
  for (const directory of ['ui', 'public', 'src']) await scan(join(root, directory));
  for (const item of diagnostics) {
    console.error(`${item.file}:${item.line}:${item.column} [${item.rule}] ${item.reason}\n  수정: ${fixes[item.rule]}`);
  }
  console.log(`${diagnostics.length ? 'FAIL' : 'PASS'} lint:arch — ${filesChecked}개 파일 검사, ${diagnostics.length}개 위반`);
  process.exitCode = diagnostics.length ? 1 : 0;
} catch (error) {
  console.error(`FAIL lint:arch — 검사 실행 오류: ${error.message}`);
  process.exitCode = 1;
}
