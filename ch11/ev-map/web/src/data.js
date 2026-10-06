export const STATES = [
  { name: '충전대기', color: '#50cdb2' },
  { name: '충전중', color: '#2d87f7' },
  { name: '고장·점검', color: '#ff6346' },
  { name: '확인 불가', color: '#8793a8' },
];
export const HEIGHT_PER_CHARGER = 6;
export const number = (value) => value.toLocaleString('ko-KR');

export function decodeStation(row) {
  const [id, name, address, lng, lat, counts, updated] = row;
  return { id, name, address, lng, lat, counts, updated, total: counts.reduce((a, b) => a + b, 0) };
}

export function makeColumns(stations) {
  const features = [];
  for (const station of stations) {
    if (!Number.isFinite(station.lng) || !Number.isFinite(station.lat)) continue;
    const dx = 18 / (111320 * Math.cos(station.lat * Math.PI / 180));
    const dy = 18 / 111320;
    const { lng: x, lat: y } = station;
    const ring = [[x-dx,y-dy],[x+dx,y-dy],[x+dx,y+dy],[x-dx,y+dy],[x-dx,y-dy]];
    let base = 0;
    station.counts.forEach((count, state) => {
      if (!count) return;
      const height = base + count * HEIGHT_PER_CHARGER;
      features.push({
        type: 'Feature',
        properties: { id: station.id, state, base, height, total: station.total },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
      base = height;
    });
  }
  return { type: 'FeatureCollection', features };
}
