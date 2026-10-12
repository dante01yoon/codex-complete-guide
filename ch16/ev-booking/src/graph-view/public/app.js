const $ = id => document.getElementById(id);
const ns = 'http://www.w3.org/2000/svg';
const positions = {
  U: [307, 20], P: [307, 115], T: [307, 215], A: [307, 310],
  D: [307, 405], I: [307, 510], R: [307, 625], F: [307, 720],
  Q: [30, 145], X: [595, 315], S: [595, 545],
};
const width = 205, height = 48;
const secondary = new Set(['Q', 'X', 'S']);
const shortLabels = { U: '사용자 · 작업 요청', P: '1. 계획 담당', T: '2. 테스트 담당', A: '3. 사용자 · 테스트 확인', D: '4. 테스트 담당 · Red', I: '5. 구현 담당', R: '6. 리뷰 담당', F: '부모 · 완료 보고', Q: '사용자 · 정책 확인', X: '사용자 · 별도 변경 승인', S: '중단 보고 · 사용자 결정' };
const subtitles = { U: '요청할 T 작업과 범위', P: '정책·선행 근거 확인', T: 'AC별 테스트 작성', A: '테스트 명시 확인', D: '실제 실패 확인', I: 'src만 수정·재검증', R: 'GPT-6-Astra 읽기 검토', F: '범위별 결과를 사용자에게', Q: '미정 정책·문서 충돌', X: '정책 확인·테스트 변경', S: '실제 차단·3연속 실패' };
let data, run, selected;

function element(tag, attrs, text) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}
function html(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function sourceLink(source) {
  const a = html('a', '', `${source.file}:${source.line}`);
  a.href = `/docs/${source.file}#L${source.line}`; a.target = '_blank'; a.rel = 'noopener';
  return a;
}
function route(edge) {
  const [x1,y1] = positions[edge.from], [x2,y2] = positions[edge.to];
  if (x1 === x2 && y2 > y1) return `M${x1+width/2} ${y1+height} L${x2+width/2} ${y2-3}`;
  if (edge.id === 'R-I') return 'M307 645 C265 645 265 535 304 535';
  if (edge.id === 'D-P') return 'M307 429 L260 429 L260 140 L304 140';
  if (edge.id === 'X-T') return 'M698 315 L698 238 L515 238';
  if (edge.id === 'P-Q') return 'M307 138 C272 138 272 164 238 164';
  if (edge.id === 'Q-P') return 'M132 145 L132 105 L409 105 L409 112';
  if (edge.id === 'D-S') return 'M512 429 L565 429 L565 556 L592 556';
  if (edge.id === 'I-S') return 'M512 538 L550 538 L550 578 L592 578';
  if (edge.id === 'I-X') return 'M512 521 L542 521 L542 349 L592 349';
  if (edge.id === 'R-X') return 'M512 646 L575 646 L575 365 L592 365';
  return `M${x1+width} ${y1+height/2} L${x2} ${y2+height/2}`;
}
function drawGraph() {
  const svg = $('graph');
  const defs = element('defs', {});
  for (const [name, color] of [['arrow', '#c4cfc9'], ['arrow-active', '#137961']]) {
    const marker = element('marker', { id: name, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    marker.append(element('path', { d:'M 0 0 L 10 5 L 0 10 z', fill:color })); defs.append(marker);
  }
  svg.append(defs);
  for (const edge of data.graph.edges) {
    const path = element('path', { d:route(edge), class:'edge', 'data-edge':edge.id, 'marker-end':'url(#arrow)' });
    path.append(element('title', {}, edge.label)); svg.append(path);
  }
  // Compact labels identify the main handoffs; every branch retains its full
  // source label in the accessible title and selection detail.
  const labels = [['P-T',409,190], ['T-A',409,288], ['A-D',409,384], ['D-I',409,487], ['I-R',409,597], ['R-F',409,703]];
  const korean = ['계획 · 계약','테스트 내용','확인된 테스트','실패 증거','diff · 검증 결과','완료 근거'];
  labels.forEach(([id,x,y],i) => {
    svg.append(element('rect', { x:x-70,y:y-14,width:140,height:23,rx:4,class:'edge-label-bg' }));
    svg.append(element('text', { x,y,'text-anchor':'middle',class:'edge-label','data-label':id }, korean[i]));
  });
  for (const node of data.graph.nodes) {
    const pos = positions[node.id];
    if (!pos) throw new Error(`지원되지 않은 노드: ${node.id}`);
    const [x,y] = pos;
    const group = element('g', { class:`node ${secondary.has(node.id)?'secondary':''}`, 'data-node':node.id });
    group.append(element('title',{},node.label));
    group.append(element('rect',{x,y,width,height,rx:8}));
    group.append(element('text',{x:x+width/2,y:y+20,'text-anchor':'middle',class:'node-label'},shortLabels[node.id]));
    group.append(element('text',{x:x+width/2,y:y+36,'text-anchor':'middle',class:'node-kind'},subtitles[node.id]));
    svg.append(group);
  }
}
function selectEvent(event, focus = false) {
  selected = event;
  document.querySelectorAll('[data-event]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.event === event.id)));
  const edge = data.graph.edges.find(e => e.id === event.edge);
  document.querySelectorAll('[data-edge]').forEach(path => {
    const active = path.dataset.edge === event.edge;
    path.classList.toggle('selected', active); path.setAttribute('marker-end', `url(#${active?'arrow-active':'arrow'})`);
  });
  document.querySelectorAll('[data-label]').forEach(label => label.classList.toggle('selected', label.dataset.label === event.edge));
  document.querySelectorAll('[data-node]').forEach(node => node.classList.toggle('selected', !!edge && [edge.from,edge.to].includes(node.dataset.node)));
  $('selected-title').textContent = event.title;
  $('selected-edge').textContent = edge ? `${shortLabels[edge.from]} → ${shortLabels[edge.to]} · ${edge.label}` : '이 기록에 대응하는 역할 간 인계는 명시돼 있지 않습니다.';
  const a = sourceLink(event.source);
  $('record-source').replaceWith(Object.assign(a, { id:'record-source' }));
  $('record-text').textContent = event.text;
  const graphScroll = document.querySelector('.graph-scroll');
  if (graphScroll.scrollWidth > graphScroll.clientWidth && graphScroll.clientWidth > 0) {
    const center = edge ? (positions[edge.from][0] + positions[edge.to][0] + width) / 2 : positions.I[0] + width/2;
    graphScroll.scrollLeft = center / 820 * $('graph').getBoundingClientRect().width - graphScroll.clientWidth / 2;
  }
  if (focus) document.querySelector(`[data-event="${event.id}"]`)?.scrollIntoView({ block:'nearest', behavior:'instant' });
}
function renderRun(id) {
  run = data.runs.find(r => r.id === id);
  $('run-scope').textContent = run.scope; $('event-count').textContent = String(run.events.length).padStart(2,'0');
  $('timeline').replaceChildren(...run.events.map((event,index) => {
    const li = html('li'); const button = html('button','event');
    button.type = 'button'; button.dataset.event = event.id; button.setAttribute('aria-pressed','false');
    button.append(html('span','event-number',String(index+1).padStart(2,'0')));
    const content = html('span','event-content'); content.append(html('span','event-title',event.title),html('span','event-time',event.time ? `기록 시각 ${event.time} · 시간대 미기록` : '시각 미기록'));
    button.append(content);button.addEventListener('click',()=>selectEvent(event));li.append(button);return li;
  }));
  selectEvent(run.events.find(e => e.edge === 'D-I') || run.events[0]);
}
function renderResults() {
  const filter = $('filter').value;
  const criteria = data.criteria.flatMap(c => {
    const records = [c.latest, ...c.otherLatest].filter(Boolean);
    return (records.length ? records.map(latest => ({ ...c, latest })) : [c]);
  }).filter(c => filter === 'all' || (filter === 'recorded' && c.latest) || (filter === 'missing' && !c.latest) || c.latest?.status === filter);
  $('results-body').replaceChildren(...criteria.map(c => {
    const tr = html('tr');tr.dataset.ac = c.id;
    const first = html('td');first.append(html('span','ac-id',c.id),html('span','',c.title));
    const status = html('td');status.append(html('span',`status ${c.latest?.status || 'missing'}`,c.latest?.status || '기록 없음'));
    const scope = html('td'),source = html('td');
    if (c.latest) {
      status.append(html('span','scope',c.latest.stream));
      scope.append(html('span','',c.latest.scope),html('span','scope',c.latest.qualification));source.append(sourceLink(c.latest.source));
      if (c.evidence.includes(c.latest) && c.evidence.length>1) {
        const detail = html('details');detail.append(html('summary','',`선행 기록 ${c.evidence.length-1}건`));
        c.evidence.filter(e=>e!==c.latest).forEach(e=>{const p=html('p','',`${e.status} · ${e.scope} `);p.append(sourceLink(e.source));detail.append(p);});scope.append(detail);
      }
    } else {
      scope.textContent = '이 작업 흐름의 AC별 실행 결과가 기록돼 있지 않습니다.';
      source.append(html('span','scope','미실행 또는 실패로 추정하지 않음'));
    }
    tr.append(first,status,scope,source);return tr;
  }));
  if (!criteria.length) {const tr=html('tr');const td=html('td','','조건에 맞는 기록이 없습니다.');td.colSpan=4;tr.append(td);$('results-body').append(tr);}
}
async function init() {
  try {
    const response = await fetch('/api/graph'); if (!response.ok) throw new Error(); data = await response.json();
    $('scope-note').textContent = data.scopeNote;
    $('run').replaceChildren(...data.runs.map(r=>{const option=html('option','',r.title);option.value=r.id;return option;}));
    $('run').value='server';$('run').addEventListener('change',()=>renderRun($('run').value));
    $('filter').addEventListener('change',renderResults);
    const recorded = data.criteria.filter(c=>c.latest || c.otherLatest.length).length;
    $('summary').replaceChildren(...[['전체 기준',data.criteria.length],['부분 결과 기록',recorded],['기록 없음',data.criteria.length-recorded]].map(([label,value])=>{const span=html('span','',label);span.append(html('strong','',value));return span;}));
    $('doc-count').textContent=`docs 원본 ${data.documents.length}개 · 새로고침 시 다시 읽기`;
    drawGraph();renderRun('server');renderResults();$('loading').hidden=true;$('content').hidden=false;
    selectEvent(selected);
  } catch { $('loading').hidden=true;$('error').hidden=false;$('error').textContent='문서 또는 그래프를 읽을 수 없습니다. 원본 문서 형식을 확인하고 새로고침해 주세요.'; }
}
init();
