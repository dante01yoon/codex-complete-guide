import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const documentNames = ['agents.md', 'acceptance.md', 'mcp-booking-validation.md', 'mcp-server-validation.md', 'payment-test-review.md', 'payment-demo.md'];
const clean = value => value.replace(/\*\*|`/g, '').trim();

// The order below is established by the server record referring to the earlier
// completed pure-rule work. File mtimes and commit hashes are not timestamps.
const runs = [
  { id: 'rules', title: 'MCP 순수 규칙', file: 'mcp-booking-validation.md', scope: '공개 함수 5개 · 승인된 테스트 34개', events: [
    ['사용자가 테스트를 확인하고', '사용자 테스트 확인', 'A', 'D'],
    ['테스트 담당이 실행한', '승인 테스트 불변 확인', null, null],
    ['승인 후 Stop 훅', '미구현 Red 확인', null, null],
    ['구현 담당:', '순수 함수 구현', 'D', 'I'],
    ['구현 후 신규 검사:', '구현 담당 Green', null, null],
    ['부모 재검증:', '부모 독립 재검증', null, null],
    ['GPT-6-Astra 읽기 전용 리뷰:', '읽기 전용 리뷰 완료', 'I', 'R'],
    ['조회 차단 기록:', '조회 차단과 사용자 재개 승인', null, null],
    ['P1 지적이 없어', '한정 범위 완료 보고', 'R', 'F'],
  ] },
  { id: 'server', title: '로컬 MCP 서버', file: 'mcp-server-validation.md', scope: 'T-54~57 한정 범위 · 승인된 테스트 62개', events: [
    ['사용자가 새 테스트62개', '사용자 테스트 확인', 'A', 'D'],
    ['테스트 담당 직접 Red:', '미구현 Red 확인', null, null],
    ['부모가 실패 증거를', '실패 증거 → 구현 담당', 'D', 'I'],
    ['구현 담당 `09:01:27`', '구현 담당 Green', null, null],
    ['부모 독립 재검증', '부모 독립 재검증', null, null],
    ['GPT-6-Astra 읽기 리뷰는', '리뷰 차단과 사용자 재개 승인', null, null],
    ['남은 P1 한 건:', '리뷰 → 성능 P1 지적', 'R', 'I'],
    ['P1 수정1/2회 완료:', 'P1 수정 → 재리뷰', 'I', 'R'],
    ['부모 수정 후 재검증', '수정 후 전체 재검증', null, null],
    ['GPT-6-Astra 최종 재리뷰 PASS:', '최종 재리뷰 완료', null, null],
    ['리뷰어의 독립 읽기 전용', '독립 측정과 완료 확인', 'R', 'F'],
  ] },
];

export function expandACs(text) {
  const values = new Set();
  for (const match of text.matchAll(/AC-(\d{2})-(\d+)((?:[·,]\d+)*)(?:[~～](\d+))?/g)) {
    const [, group, first, rest, last] = match;
    values.add(`AC-${group}-${first}`);
    for (const part of rest.matchAll(/\d+/g)) values.add(`AC-${group}-${part[0]}`);
    if (last) for (let n = Number(first) + 1; n <= Number(last); n++) values.add(`AC-${group}-${n}`);
  }
  return [...values];
}

function graphFrom(text) {
  const block = text.match(/```mermaid\s*([\s\S]*?)```/)?.[1];
  if (!block) throw new Error('docs/agents.md에 전달 그래프가 없습니다.');
  const nodes = [...block.matchAll(/(\w+)\["([^"]+)"\]/g)].map(([, id, label]) => ({ id, label }));
  const edges = block.split('\n').flatMap(line => {
    const m = line.match(/^\s*(\w+)(?:\["[^"]+"\])?\s*-->\s*(?:\|"([^"]+)"\|\s*)?(\w+)/);
    return m ? [{ id: `${m[1]}-${m[3]}`, from: m[1], to: m[3], label: m[2] || '요청할 작업과 범위' }] : [];
  });
  if (nodes.length !== new Set(nodes.map(n => n.id)).size) throw new Error('그래프 노드 ID 중복');
  return { nodes, edges, source: { file: 'agents.md', line: text.slice(0, text.indexOf('```mermaid')).split('\n').length } };
}

export async function loadData(root) {
  const documents = Object.fromEntries(await Promise.all(documentNames.map(async file => {
    const text = await readFile(resolve(root, 'docs', file), 'utf8');
    return [file, { text, lines: text.split('\n') }];
  })));
  const graph = graphFrom(documents['agents.md'].text);
  const loadedRuns = runs.map(run => ({ ...run, events: run.events.map(([needle, title, from, to], index) => {
    const line = documents[run.file].lines.findIndex(value => value.startsWith('- ') && value.includes(needle));
    if (line < 0) throw new Error(`${run.file}: 인계 근거를 찾을 수 없습니다 (${needle}).`);
    const raw = documents[run.file].lines[line];
    const edge = from && to ? `${from}-${to}` : null;
    if (edge && !graph.edges.some(e => e.id === edge)) throw new Error(`그래프에 없는 인계: ${edge}`);
    return { id: `${run.id}-${index}`, title, edge, text: clean(raw.slice(2)), source: { file: run.file, line: line + 1 }, time: raw.match(/\b\d{2}:\d{2}:\d{2}\b/)?.[0] || null };
  }) }));

  const criteria = [...documents['acceptance.md'].text.matchAll(/^### (AC-\d{2}-\d+) — (.+)$/gm)].map(([, id, title]) => ({ id, title, evidence: [] }));
  const add = (ids, item) => ids.forEach(id => criteria.find(c => c.id === id)?.evidence.push(item));
  // Only explicit AC/result associations are included. Test counts and references
  // in plans or acceptance criteria never imply a functional PASS.
  const serverLines = documents['mcp-server-validation.md'].lines;
  serverLines.forEach((line, index) => {
    if (!line.startsWith('| AC-')) return;
    const cells = line.split('|').slice(1, -1).map(clean);
    const status = cells[2].match(/\b(PASS|FAIL|BLOCKED|NOT_RUN)\b/)?.[1];
    if (!status) return;
    add(expandACs(cells[0]), { status, scope: cells[1], qualification: cells[2], stream: 'MCP 서버', source: { file: 'mcp-server-validation.md', line: index + 1 } });
  });
  const rulesLines = documents['mcp-booking-validation.md'].lines;
  const line = rulesLines.findIndex(value => value.startsWith('- AC-18-1~5·7'));
  if (line < 0) throw new Error('순수 규칙의 AC별 완료 범위 기록이 없습니다.');
  // AC-18-1~5·7 uses a trailing middle-dot after the range.
  add(['AC-18-1', 'AC-18-2', 'AC-18-3', 'AC-18-4', 'AC-18-5', 'AC-18-7'], {
    status: 'PASS', scope: '계획에 명시한 순수 판정 부분만. 실제 MCP·파일 I/O·결제 URL·토스 제외.', qualification: '34/34 및 전체 190/190 PASS 근거 + AC별 완료 범위', stream: 'MCP 순수 규칙', source: { file: 'mcp-booking-validation.md', line: line + 1 },
  });
  criteria.forEach(c => {
    // The server work explicitly follows the pure-rule work; a newer record
    // supersedes an older record only within this documented MCP workstream.
    c.latest = c.evidence.find(e => e.stream === 'MCP 서버') || c.evidence.at(-1) || null;
    c.otherLatest = [];
  });
  const other = (ids, item) => ids.forEach(id => criteria.find(c => c.id === id)?.otherLatest.push(item));
  const reviewLines = documents['payment-test-review.md'].lines;
  const notRun = reviewLines.findIndex(value => value.startsWith('- 사용자 확인 후 새 테스트의 실패 확인:'));
  if (notRun < 0) throw new Error('결제 테스트의 최종 실행 기록이 없습니다.');
  const reviewACs = expandACs(reviewLines.filter(value => value.startsWith('| AC-')).join('\n'));
  other(reviewACs, { status: 'NOT_RUN', stream: '승인·웹훅 테스트', scope: clean(reviewLines[notRun].slice(2)), qualification: '작성 당시 자동 훅 FAIL과 사용자 확인 후 실행 상태를 구분. 표의 기대 결과는 PASS가 아님.', source: { file: 'payment-test-review.md', line: notRun + 1 } });
  // These associations are explicitly stated in acceptance.md's approved
  // single-order demonstration scope. No association is inferred from counts.
  const demoLines = documents['payment-demo.md'].lines;
  const demoEvidence = [
    [['AC-05-1'], '| 토스 실제 테스트 위젯 |', '주문 정보·위젯의 시연 부분만'],
    [['AC-05-7'], '| 금액 조작 거절 |', '단일 주문의 서버 금액 검증만'],
    [['AC-05-6', 'AC-06-2'], '| 코드·사유 표시 및 새로고침 |', '실패 결과 화면 · 모의 반환 URL 검증만'],
  ];
  for (const [ids, needle, scope] of demoEvidence) {
    const index = demoLines.findIndex(value => value.startsWith(needle));
    if (index < 0) throw new Error('결제 시연의 결과 근거를 찾을 수 없습니다.');
    const cells = demoLines[index].split('|').slice(1,-1).map(clean);
    other(ids, { status: cells[1], stream: '단일 주문 화면 시연', scope, qualification: cells[2] + ' · 실제 승인·환불 완료 NOT_RUN', source: { file: 'payment-demo.md', line: index + 1 } });
  }
  return { graph, runs: loadedRuns, criteria, documents: documentNames, scopeNote: '각 검증 흐름에서 마지막으로 명시된 AC별 결과입니다. 순수 규칙·격리 fixture·화면 확인을 구분하며, 부분 PASS를 전체 AC 통과로 확대하지 않습니다. 흐름 간 날짜 순서를 추정하지 않습니다.' };
}
