import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
export const sources = ['docs/agents.md','docs/mcp-implementation.md','docs/local-checkout-plan.md','docs/acceptance.md'];
const missing = '기록 없음';
function table(text, heading) {
 const start=text.indexOf(heading); if(start<0) return [];
 const lines=text.slice(start).split('\n'); const rows=[]; let begun=false;
 for(let i=1;i<lines.length;i++) { const line=lines[i]; if(!line.startsWith('|')) { if(begun) break; continue; }
 begun=true; if(/^\|[\s:|-]+\|$/.test(line)) continue;
 const cells=line.split('|').slice(1,-1).map(s=>s.trim()); rows.push({cells,line:text.slice(0,start).split('\n').length+i}); }
 return rows.slice(1);
}
export async function readGraphData() {
 const texts=await Promise.all(sources.map(s=>readFile(new URL(s,root),'utf8')));
 const [agents,mcp,local,ac]=texts;
 const mermaid=agents.match(/```mermaid\n([\s\S]*?)```/)?.[1] || '';
 const nodes=[...mermaid.matchAll(/(\w+)\["([^"]+)"\]/g)].map(m=>({id:m[1],label:m[2]}));
 const edges=[...mermaid.matchAll(/^\s+(\w+)(?:\["[^\n]*?"\])? -->\s*(?:\|"([^"]+)"\|\s*)?(\w+)/gm)].map(m=>({from:m[1],to:m[3],label:m[2]||missing}));
 // Edge mapping is presentation metadata; the handoff text itself is read verbatim.
 const paths=[['P>T'],['T>C'],['C>T','M>T'],['M>I'],['I>R','M>R','R>I'],['I>M','I>V'],['M>V'],['V>M'],['R>I'],['I>V'],['V>M']];
 const human=[null,'사용자가 최초 55개 테스트 이름을 확인','사용자가 C-12 승인 파일 정책 결정 · 테스트 커밋 및 구현 승인','사용자가 커밋 5b15293 · 테스트 작성 스위치 해제',null,null,null,null,'사용자가 3개 테스트 계획 확인 · 스위치 해제 · 커밋 93faed8 · 구현/리뷰 승인',null,null];
 const steps=[...table(mcp,'## 에이전트가 주고받은 내용').map(r=>({...r,source:sources[1],phase:'MCP 구현',text:r.cells[2],result:r.cells[3],route:r.cells[1],order:r.cells[0]})),...table(local,'## 커밋 후 구현·리뷰 결과').map(r=>({...r,source:sources[2],phase:'로컬 링크 후속',text:r.cells[2],result:r.cells[2],route:r.cells[1],order:r.cells[0]}))].map((r,i)=>{
 const raw=r.text===r.result?r.text:r.text+' '+r.result;
 const test=i===6?r.result:raw.match(/(?:59\/59 FAIL[^|]*|MCP 59\/59 PASS[^|]*|신규 3\/3[^|]*|1 FAIL \/ 2 PASS[^,]*)/)?.[0]||missing;
 const review=/지적 없음/.test(raw)?'P1 0 · P2 0 · P3 0':missing;
 return {...r,id:i+1,paths:paths[i]||[],human:human[i]||missing,test,review,time:missing};
 });
 const evidence=[...table(mcp,'## 실행 증거와 범위').map(r=>({...r,source:sources[1]})),...table(local,'## 확정한 정책과 등록 결과').map(r=>({...r,source:sources[2]}))];
 const titles=[...ac.matchAll(/### (AC-18-(?:10|[1-9])) — ([^\n]+)/g)].map(m=>({id:m[1],title:m[2]}));
 // Collective AC coverage is explicit in agents.md; show this separately from live verification.
 const green=agents.includes('MCP 59개·전체 168개 테스트 및 타입 검사 PASS');
 const results=titles.map((r,i)=>({...r,status:green?'PASS':missing,scope:'모의 계약 · AC-18-1~10 커버리지와 59/59 집계로 표시 (개별 수치 기록 없음)',source:sources[1],runtime:i===0?'PASS · 실제 stdio 등록':i===1?'PASS · 실제 원본 검색':i===2?'실제 검색 PASS · 자격/병합 사례별 실연결 결과 기록 없음':i===3||i===5?'PASS · 실제 stdio 점유 (경계 전체 실연결은 기록 없음)':i===6?'PASS · 실제 미승인 응답':i===7?(local.includes('신규 3/3')?'PASS · 후속 로컬 URL 제공자 / 승인 파일 존재 모의':'BLOCKED · 링크 제공자 미설정'):i===9?'NOT_RUN · 사람이 실행하는 실제 승인 CLI':missing,note:i===7?'이전 실제 링크 BLOCKED → 후속 로컬 URL 계약 PASS. checkout 페이지·실결제 NOT_RUN.':i===9?'명령의 파일 생성은 모의 계약 PASS. 실제 승인 파일 생성 NOT_RUN.':'실제 로그인·영속 저장·토스 연결 완료를 뜻하지 않음'}));
 const extraEdges=[{from:'C',to:'T'},{from:'M',to:'T'},{from:'M',to:'I'},{from:'I',to:'R'},{from:'M',to:'R'},{from:'I',to:'M'},{from:'M',to:'V'}].map(e=>({...e,label:'실행 기록에 등장하는 인계 · 원본 그래프 외',recorded:true}));
 return {nodes,edges,extraEdges,steps,evidence,results,sources,mermaid};
}
