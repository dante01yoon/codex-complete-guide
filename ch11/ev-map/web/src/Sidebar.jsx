import React from 'react';
import { HEIGHT_PER_CHARGER, STATES, number } from './data.js';

function ColumnLegend() {
  return (
    <svg viewBox="0 0 100 164" aria-hidden="true" className="column-legend">
      <polygon points="15,27 45,9 75,27 45,45" fill="#b0bacb" />
      {[
        [27, 48, '#8793a8'], [48, 66, '#ff6346'],
        [66, 96, '#2d87f7'], [96, 151, '#50cdb2'],
      ].map(([top, bottom, color]) => (
        <g key={color}>
          <polygon points={`15,${top} 45,${top+18} 45,${bottom+18} 15,${bottom}`} fill={color} />
          <polygon points={`45,${top+18} 75,${top} 75,${bottom} 45,${bottom+18}`} fill={color} style={{ filter: 'brightness(.88)' }} />
        </g>
      ))}
    </svg>
  );
}

export default function Sidebar({ meta }) {
  const counts = meta?.counts ?? [0, 0, 0, 0];
  const total = meta?.chargerCount ?? 0;
  const time = meta ? new Date(meta.statusFetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  return (
    <aside className="sidebar">
      <header>
        <h1>서울 충전소</h1>
        <p className="subtitle">충전기 상태를 입체적으로 살펴보세요</p>
      </header>
      <section className="overview" aria-label="전체 현황">
        <div className="totals">
          <div><strong>{meta ? number(meta.stationCount) : '—'}</strong><span>충전소</span></div>
          <div><strong>{meta ? number(total) : '—'}</strong><span>충전기</span></div>
        </div>
        <div className="composition-bar" aria-label="전체 충전기 상태별 비율">
          {STATES.map((state, i) => <span key={state.name} style={{ background: state.color, width: `${total ? counts[i]/total*100 : 25}%` }} />)}
        </div>
      </section>
      <section className="states-section">
        <h2>충전기 상태</h2>
        <ul className="state-list">
          {STATES.map((state, i) => (
            <li key={state.name}><span className="state-dot" style={{ background: state.color }} /><span>{state.name}</span><strong>{meta ? number(counts[i]) : '—'}</strong></li>
          ))}
        </ul>
      </section>
      <section className="legend-section">
        <h2>지도 범례</h2>
        <div className="legend-content"><ColumnLegend /><p><b>높이</b> = 충전기 수<br /><b>색상</b> = 상태별 비율</p></div>
        <span className="sr-only">충전기 1대당 {HEIGHT_PER_CHARGER}미터 높이로 표시합니다.</span>
      </section>
      <footer className="data-note">
        <p>저장된 데이터 기준<br />상태 갱신 시각으로 최신 정보 반영</p>
        {meta ? <p className="snapshot-time">{time} KST 저장 · 실시간 정보 아님</p> : null}
        {meta?.unmappedStations ? <p>좌표 확인 불가 {number(meta.unmappedStations)}곳은 지도에서 제외</p> : null}
      </footer>
    </aside>
  );
}
