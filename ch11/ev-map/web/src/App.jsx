import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar.jsx';
import MapView from './MapView.jsx';
import { decodeStation } from './data.js';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/dashboard.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('data unavailable');
        return response.json();
      })
      .then((snapshot) => {
        if (snapshot.version !== 1 || !Array.isArray(snapshot.stations)) throw new Error('invalid data');
        setData({ meta: snapshot.meta, stations: snapshot.stations.map(decodeStation) });
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, []);
  return (
    <main className="dashboard">
      <Sidebar meta={data?.meta} />
      <section className="map-region" aria-label="서울 충전소 지도">
        {data ? <MapView stations={data.stations} /> : (
          <div className="loading-message" role="status">
            {error ? '저장된 데이터를 불러오지 못했습니다. 페이지를 다시 열어 주세요.' : '서울 충전소 지도를 준비하고 있습니다.'}
          </div>
        )}
      </section>
    </main>
  );
}
