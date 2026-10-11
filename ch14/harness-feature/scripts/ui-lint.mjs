import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { parse as parseHTML } from 'parse5';

const moneyNames = /(?:^|_)(?:amount|price|fee|deposit|refund|krw|won|money|balance|cost|payment|금액|예약금|환불)(?:$|_)/i;
const timeNames = /(?:^|_)(?:now|time|date|timestamp|deadline|duration|minute|minutes|second|seconds|millisecond|milliseconds|ms|expires|expiry|시각|시간|기한)(?:$|_)/i;
const timeSuffix = /(?:At|Ms|Minutes|Seconds|Timestamp|Deadline)$/;
const splitName = name => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
const nameTags = name => new Set([
  ...(moneyNames.test(splitName(name)) ? ['money'] : []),
  ...(timeNames.test(splitName(name)) || timeSuffix.test(name) ? ['time'] : []),
]);
const union = (...sets) => new Set(sets.flatMap(set => [...set]));
const property = node => !node.computed && node.property.type === 'Identifier'
  ? node.property.name : node.property.type === 'StringLiteral' ? node.property.value : '';
const member = path => path?.isMemberExpression() || path?.isOptionalMemberExpression();
const call = path => path?.isCallExpression() || path?.isOptionalCallExpression();
const dateLibraries = /^(?:date-fns(?:\/|$)|dayjs(?:\/|$)|moment(?:-timezone)?(?:\/|$)|luxon$|@js-temporal\/polyfill$)/;
const messages = {
  'EV001': {
    reason: '브라우저 시계는 서버의 서울 시연용 현재 시각과 달라 정책 판정을 어긋나게 합니다.',
    fix: '서버 응답의 시연용 현재 시각을 입력으로 받으세요. 로컬 시계 대체값이나 로컬 경과시간 보정을 제거하고, 계산은 src/rules의 순수 함수에 전달하세요.',
  },
  'EV002': {
    reason: 'src/rules 밖의 금액·시간 계산 또는 비교는 예약·결제 정책을 중복 구현합니다.',
    fix: '이 계산·비교를 src/rules의 순수 함수로 옮기고 금액(KRW 정수)·시각을 인자로 받으세요. 화면/API는 반환된 금액·기한·판정 결과만 사용하세요.',
  },
  'EV003': {
    reason: '날짜 라이브러리는 화면에서 시간 계산이나 현재 시각 생성을 숨길 수 있습니다.',
    fix: '시간 계산용 라이브러리는 src/rules에서만 사용하세요. 화면 표시에는 명시적 시각과 Asia/Seoul을 지정한 Intl.DateTimeFormat을 사용하세요.',
  },
  'EV000': {
    reason: '구문 오류 때문에 이 코드의 금액·시간 경계를 검사하지 못했습니다.',
    fix: '지정된 위치의 JS/TS 구문 오류를 먼저 수정한 뒤 린트를 다시 실행하세요.',
  },
};

/** Static boundary checks only: never evaluates application source. */
export function lintCode(source, file, { client = true, rules = false, offset = 0, fullSource = source } = {}) {
  const diagnostics = [];
  const reported = new Set();
  function report(node, ruleId) {
    const start = offset + (node.start ?? 0);
    const key = `${start}:${ruleId}`;
    if (reported.has(key)) return;
    reported.add(key);
    const prefix = fullSource.slice(0, start).split('\n');
    diagnostics.push({ file, line: prefix.length, column: prefix.at(-1).length + 1,
      ruleId, severity: 'error', ...messages[ruleId] });
  }
  let ast;
  try {
    ast = parse(source, { sourceType: 'unambiguous', plugins: [
      ...(/\.[cm]?tsx?$/.test(file) ? ['typescript'] : []),
      ...(/\.[jt]sx$/.test(file) ? ['jsx'] : []),
    ] });
  } catch (error) {
    report({ start: error.pos ?? 0 }, 'EV000');
    return diagnostics;
  }
  const tags = new Map();
  const origins = new Map();
  const paths = [];
  traverse(ast, { enter(path) { paths.push(path); } });

  function origin(path, seen = new Set()) {
    if (!path?.node || seen.has(path.node)) return '';
    seen.add(path.node);
    if (path.isIdentifier()) {
      const binding = path.scope.getBinding(path.node.name);
      if (binding) return origins.get(binding) ?? '';
      return ['Date', 'performance', 'Temporal', 'globalThis', 'window', 'self', 'Math'].includes(path.node.name)
        ? path.node.name : '';
    }
    if (member(path)) {
      const base = origin(path.get('object'), seen);
      const prop = property(path.node);
      if (!base || !prop) return '';
      return ['globalThis', 'window', 'self'].includes(base) ? prop : `${base}.${prop}`;
    }
    if (call(path) && member(path.get('callee')) && property(path.node.callee) === 'bind') {
      return origin(path.get('callee').get('object'), seen);
    }
    if (path.isTSAsExpression() || path.isTSNonNullExpression() || path.isParenthesizedExpression()) {
      return origin(path.get('expression'), seen);
    }
    return '';
  }
  function stringDisplay(path) {
    if (!path?.node) return false;
    if (path.isStringLiteral() || path.isTemplateLiteral()) return true;
    if (call(path)) {
      const callee = path.get('callee');
      return callee.isIdentifier({ name: 'String' })
        || member(callee) && /^(?:toLocaleString|toISOString|toString|format)$/.test(property(callee.node));
    }
    return false;
  }
  function domain(path, seen = new Set()) {
    if (!path?.node || seen.has(path.node) || stringDisplay(path)) return new Set();
    seen.add(path.node);
    if (path.isIdentifier()) {
      return union(nameTags(path.node.name), tags.get(path.scope.getBinding(path.node.name)) ?? new Set());
    }
    if (path.isArrowFunctionExpression() || path.isFunctionExpression()) {
      const body = path.get('body');
      if (!body.isBlockStatement()) return domain(body, seen);
      const returned = [];
      body.traverse({ Function(inner) { inner.skip(); }, ReturnStatement(ret) { returned.push(domain(ret.get('argument'), new Set(seen))); } });
      return union(...returned);
    }
    if (member(path)) return union(nameTags(property(path.node)), domain(path.get('object'), seen));
    if (path.isNewExpression() && origin(path.get('callee')) === 'Date') return new Set(['time']);
    if (call(path)) {
      const callee = path.get('callee');
      if (/^(?:Date(?:\.|$)|performance\.|Temporal\.)/.test(origin(callee))) return new Set(['time']);
      const fromCallee = domain(callee, seen);
      // Math/conversion functions preserve the domain of their arguments.
      if (origin(callee).startsWith('Math.') || callee.isIdentifier() && /^(?:Number|parseInt|parseFloat)$/.test(callee.node.name)) {
        return union(fromCallee, ...path.get('arguments').map(arg => domain(arg, new Set(seen))));
      }
      return fromCallee;
    }
    if (path.isBinaryExpression() || path.isLogicalExpression() || path.isAssignmentExpression()) {
      return union(domain(path.get('left'), new Set(seen)), domain(path.get('right'), new Set(seen)));
    }
    if (path.isConditionalExpression()) return union(domain(path.get('consequent'), new Set(seen)), domain(path.get('alternate'), new Set(seen)));
    if (path.isUnaryExpression() || path.isUpdateExpression()) return domain(path.get('argument'), seen);
    if (path.isTSAsExpression() || path.isTSNonNullExpression() || path.isParenthesizedExpression()) return domain(path.get('expression'), seen);
    return new Set();
  }
  let changed;
  function bind(identifier, scope, values, sourceOrigin = '') {
    const binding = scope.getBinding(identifier.name);
    if (!binding) return;
    const next = union(tags.get(binding) ?? new Set(), values, nameTags(identifier.name));
    if (next.size !== (tags.get(binding)?.size ?? 0)) { tags.set(binding, next); changed = true; }
    if (sourceOrigin && !origins.has(binding)) { origins.set(binding, sourceOrigin); changed = true; }
  }
  // Fixed point tracks renamed values and reassignment through lexical bindings.
  do {
    changed = false;
    for (const path of paths) {
      if (path.isVariableDeclarator() || path.isAssignmentExpression({ operator: '=' })) {
        const lhs = path.get(path.isVariableDeclarator() ? 'id' : 'left');
        const rhs = path.get(path.isVariableDeclarator() ? 'init' : 'right');
        if (lhs.isIdentifier()) bind(lhs.node, path.scope, domain(rhs), origin(rhs));
        if (lhs.isObjectPattern()) {
          for (const prop of lhs.get('properties')) {
            if (!prop.isObjectProperty()) continue;
            const key = prop.node.computed ? prop.node.key.value : prop.node.key.name ?? prop.node.key.value;
            const value = prop.get('value');
            const target = value.isAssignmentPattern() ? value.get('left') : value;
            if (target.isIdentifier() && typeof key === 'string') {
              const base = origin(rhs);
              bind(target.node, path.scope, union(domain(rhs), nameTags(key)),
                base ? ['globalThis', 'window', 'self'].includes(base) ? key : `${base}.${key}` : '');
            }
          }
        }
      }
      if (path.isFunctionDeclaration() && path.node.id) {
        const returns = [];
        path.get('body').traverse({ Function(inner) { inner.skip(); }, ReturnStatement(ret) { returns.push(domain(ret.get('argument'))); } });
        bind(path.node.id, path.scope, union(...returns));
      }
    }
  } while (changed);

  function operationDomain(path) {
    let values = domain(path);
    // Literal-only calculations still inherit a named result/property domain.
    let parent = path.parentPath;
    while (parent && !parent.isStatement() && !parent.isFunction()) {
      if (parent.isVariableDeclarator()) values = union(values, domain(parent.get('id')));
      if (parent.isAssignmentExpression()) values = union(values, domain(parent.get('left')));
      if (parent.isObjectProperty()) {
        const key = parent.node.key;
        if (!parent.node.computed && key.type === 'Identifier' || key.type === 'StringLiteral') {
          values = union(values, nameTags(key.name ?? key.value));
        }
      }
      parent = parent.parentPath;
    }
    if (parent?.isReturnStatement()) {
      const fn = parent.getFunctionParent();
      if (fn?.node.id) values = union(values, nameTags(fn.node.id.name));
    }
    return values;
  }

  for (const path of paths) {
    const referenceAPI = origin(path);
    if (client && (member(path) || path.isReferencedIdentifier())
      && (referenceAPI === 'Date.now' || referenceAPI === 'performance.now' || referenceAPI.startsWith('Temporal.Now.'))) report(path.node, 'EV001');
    if (!rules && path.isImportDeclaration() && dateLibraries.test(path.node.source.value)) report(path.node, 'EV003');
    if (!rules && path.isImportExpression() && path.node.source.type === 'StringLiteral'
      && dateLibraries.test(path.node.source.value)) report(path.node, 'EV003');
    if (call(path) || path.isNewExpression()) {
      const callee = path.get('callee');
      const api = origin(callee).replace(/\.(?:call|apply)$/, '');
      const args = path.get('arguments');
      if (!rules && callee.isIdentifier({ name: 'require' }) && args[0]?.isStringLiteral()
        && dateLibraries.test(args[0].node.value)) report(path.node, 'EV003');
      if (client && (api === 'Date' && (call(path) || !args.length || args[0].isIdentifier({ name: 'undefined' }))
        || api === 'Date.now' || api === 'performance.now' || api.startsWith('Temporal.Now.'))) report(path.node, 'EV001');
      if (!rules && (api.startsWith('Math.') && (args.some(arg => domain(arg).size) || operationDomain(path).size)
        || member(callee) && /^set(?:UTC)?(?:Time|FullYear|Month|Date|Hours|Minutes|Seconds|Milliseconds|Year)$/.test(property(callee.node))
          && domain(callee.get('object')).has('time'))) report(path.node, 'EV002');
    }
    if (rules) continue;
    if (path.isBinaryExpression() && /^(?:\+|-|\*|\/|%|\*\*|<|>|<=|>=|<<|>>|>>>|&|\||\^)$/.test(path.node.operator)) {
      if (path.node.operator === '+' && (stringDisplay(path.get('left')) || stringDisplay(path.get('right')))) continue;
      if (operationDomain(path).size) report(path.node, 'EV002');
    }
    if (path.isAssignmentExpression() && /^(?:\+=|-=|\*=|\/=|%=|\*\*=|<<=|>>=|>>>=|&=|\|=|\^=)$/.test(path.node.operator)
      && operationDomain(path).size) report(path.node, 'EV002');
    if ((path.isUpdateExpression() || path.isUnaryExpression() && ['+', '-', '~'].includes(path.node.operator))
      && operationDomain(path).size) report(path.node, 'EV002');
  }
  return diagnostics;
}

export function lintSource(source, file, options = {}) {
  if (!/\.html?$/.test(file)) return lintCode(source, file, options);
  const diagnostics = [];
  const document = parseHTML(source, { sourceCodeLocationInfo: true });
  function walk(node) {
    if (node.tagName === 'script') {
      const attrs = Object.fromEntries(node.attrs.map(attr => [attr.name, attr.value]));
      if (!attrs.src && (!attrs.type || /^(?:module|(?:text|application)\/(?:java|ecma)script)$/i.test(attrs.type))) {
        const start = node.sourceCodeLocation.startTag.endOffset;
        const end = node.sourceCodeLocation.endTag?.startOffset ?? source.length;
        diagnostics.push(...lintCode(source.slice(start, end), file, { ...options, offset: start, fullSource: source }));
      }
    }
    for (const attr of node.attrs ?? []) {
      if (/^on/i.test(attr.name) || /^javascript:/i.test(attr.value)) {
        // Event-handler code has its own function scope; decoded HTML entities are executable too.
        const code = /^on/i.test(attr.name) ? attr.value : attr.value.replace(/^javascript:/i, '');
        const location = node.sourceCodeLocation.attrs[attr.name];
        const found = lintCode(`function handler(event) {\n${code}\n}`, file, options);
        diagnostics.push(...found.map(item => ({ ...item, line: location.startLine, column: location.startCol })));
      }
    }
    for (const child of node.childNodes ?? []) walk(child);
    if (node.content) walk(node.content);
  }
  walk(document);
  return diagnostics;
}
