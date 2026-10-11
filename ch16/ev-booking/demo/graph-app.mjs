const $=s=>document.querySelector(s);
const esc=s=>String(s??'기록 없음').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(file,line)=>`<a target="_blank" rel="noopener" href="/source?file=${encodeURIComponent(file)}">${esc(file)}${line?` · 원문 ${line}행`:''}</a>`;
const badge=s=>`<span class="badge ${/^(PASS|FAIL|BLOCKED|NOT_RUN)/.exec(s)?.[1]||''}">${esc(s)}</span>`;
let data,selected=0;
const pos={U:[30,35],P:[330,35],T:[630,35],C:[930,35],R:[930,200],I:[630,200],V:[330,200],M:[30,200],F:[30,400],H:[430,400],B:[820,400]};
const routes={
 'C>T':['M 990 35 C 990 8 750 8 750 35',870,20], 'M>T':['M 270 210 C 300 118 670 120 700 105',565,142], 'M>I':['M 270 255 C 360 380 700 380 700 270',590,376], 'I>R':['M 870 255 C 900 286 930 286 930 255',900,292], 'M>R':['M 270 255 C 320 390 980 390 1010 270',720,390], 'I>M':['M 630 215 C 590 173 300 173 270 215',430,181], 'M>V':['M 270 215 C 292 182 310 182 330 215',300,192],
 'U>P':['M 270 70 L 330 70',300,59], 'P>T':['M 570 70 L 630 70',600,105], 'T>C':['M 870 70 L 930 70',900,59],
 'C>R':['M 1050 105 L 1050 200',1090,157], 'R>I':['M 930 235 L 870 235',900,273], 'I>V':['M 630 235 L 570 235',600,224],
 'V>I':['M 450 270 C 450 327 750 327 750 270',600,321], 'V>M':['M 330 235 L 270 235',300,273], 'M>F':['M 150 270 L 150 400',200,351],
 'P>H':['M 450 105 C 280 145 285 365 480 400',285,150], 'R>H':['M 1050 270 C 1150 355 780 375 670 425',1010,350],
 'V>H':['M 450 270 L 530 400',470,360], 'T>B':['M 810 105 C 910 130 1185 300 1060 400',1120,300], 'I>B':['M 810 270 L 900 400',855,360]
};
function wrap(text,n=22){const a=[];while(text.length){a.push(text.slice(0,n));text=text.slice(n)}return a}
function graph(){
 const paths=data.steps[selected].paths;
 const activeNodes=new Set(paths.flatMap(p=>p.split('>')));
 $('#graph').innerHTML=`<svg viewBox="0 0 1220 495" role="img" aria-label="docs/agents.md의 11개 노드와 14개 화살표. 선택 인계의 경로 강조"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#405263"/></marker><marker id="active-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6ee7c7"/></marker></defs>${[...data.edges,...data.extraEdges.filter(e=>paths.includes(e.from+'>'+e.to))].map(e=>{
 const id=e.from+'>'+e.to;const [d,x,y]=routes[id];const active=paths.includes(id);
 const label=e.label==='기록 없음'||e.recorded?'':e.label;
 return `<g class="edge ${active?'active':''} ${e.recorded?'recorded':''}" data-edge="${id}"><title>${esc(e.from+' → '+e.to+' : '+e.label)}</title><path d="${d}" marker-end="url(#${active?'active-arrow':'arrow'})"/><text x="${x}" y="${y}" text-anchor="middle">${wrap(label,18).map((t,i)=>`<tspan x="${x}" dy="${i?13:0}">${esc(t)}</tspan>`).join('')}</text></g>`;
 }).join('')}${data.nodes.map(n=>{const [x,y]=pos[n.id];const [role,...rest]=n.label.split(': ');return `<g class="node ${['U','C','F','H'].includes(n.id)?'human':''} ${activeNodes.has(n.id)?'active':''}" data-node="${n.id}"><title>${esc(n.label)}</title><rect x="${x}" y="${y}" width="240" height="70" rx="10"/><text x="${x+16}" y="${y+26}">${esc(role)}</text><text class="sub" x="${x+16}" y="${y+47}">${esc(rest.join(': ')||n.label)}</text></g>`}).join('')}</svg>`;
 const step=data.steps[selected];
 $('#extra').textContent=step.paths.length?'원문 인계: '+step.route+' · 점선은 인계 기록에만 있는 연결, 실선은 원본 그래프 경로입니다.':'원본 그래프에 직접 대응하는 화살표 없음 · '+step.route+' (인계 기록에만 등장하는 연결)';
}
function select(i){selected=Math.max(0,Math.min(data.steps.length-1,i));const s=data.steps[selected];
 document.querySelectorAll('.step').forEach((el,n)=>{el.classList.toggle('active',n===selected);el.setAttribute('aria-pressed',String(n===selected))});
 $('#detail').innerHTML=`<div class="eyebrow">${esc(s.phase)} / HANDOFF ${s.order}</div><h3>${esc(s.route)}</h3><p>무엇을 넘겼나요?</p><blockquote>${esc(s.text)}</blockquote>${s.result!==s.text?`<p>인계 결과</p><blockquote>${esc(s.result)}</blockquote>`:''}<div class="facts"><div class="fact"><span>이 단계의 테스트 결과</span><b>${esc(s.test)}</b></div><div class="fact"><span>리뷰 지적 수</span><b>${esc(s.review)}</b></div><div class="fact"><span>사람이 개입한 지점 · 문맥 근거</span><b>${esc(s.human)}</b></div><div class="fact"><span>실행 시각 / 소요 시간</span><b>${esc(s.time)}</b></div></div><p class="muted">테스트 결과와 리뷰 수는 해당 인계에 기록된 값만 표시합니다. 사람 개입은 같은 문서의 승인 문맥을 포함합니다.</p>${link(s.source,s.line)}`;
 $('#prev').disabled=selected===0;$('#next').disabled=selected===data.steps.length-1;graph();
}
try{const response=await fetch('/api/graph');if(!response.ok)throw Error(await response.text());data=await response.json();
 $('#summary').innerHTML=`<span class="chip">${data.nodes.length}개 노드 · ${data.edges.length}개 경로</span><span class="chip">${data.steps.length}건 인계 · 2개 실행 기록</span><span class="chip">마지막 전체 테스트: 171/171 PASS · 문서 기록</span><span class="chip">실제 승인 파일 생성: NOT_RUN</span>`;
 $('#count').textContent=data.steps.length+'건';
 $('#steps').innerHTML=data.steps.map((s,i)=>`<button class="step" data-step="${i}" aria-pressed="false"><small>${String(i+1).padStart(2,'0')} / ${esc(s.phase)} · 원문 ${s.order}</small><strong>${esc(s.route)}</strong><small>${esc(s.result)}</small></button>`).join('');
 $('#steps').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(b)select(Number(b.dataset.step))});
 $('#prev').onclick=()=>select(selected-1);$('#next').onclick=()=>select(selected+1);
 $('#ac').innerHTML=data.results.map(r=>`<tr><td><strong>${r.id}</strong><br>${esc(r.title)}</td><td>${badge(r.status)}<p class="muted">${esc(r.scope)}</p></td><td>${esc(r.runtime)}</td><td>${esc(r.note)}<br>${link(r.source)}${r.id==='AC-18-8'?'<br>'+link('docs/local-checkout-plan.md'):''}</td></tr>`).join('');
 $('#evidence').innerHTML=data.evidence.map(r=>`<tr><td>${esc(r.cells[0])}<br>${link(r.source,r.line)}</td><td>${badge(r.cells[1])}</td><td>${esc(r.cells[2])}</td></tr>`).join('');
 $('#sources').innerHTML='읽기 전용 기록 뷰 · '+data.sources.map(s=>link(s)).join(' / ')+'<p>기록에서 읽은 과거 검증 결과이며, 이 화면이 예약 테스트를 재실행하지는 않습니다. 없는 값은 기록 없음으로 표시합니다.</p>';select(0);
}catch(e){$('#detail').textContent='기록 로드 실패: '+e.message;}
