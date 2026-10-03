'use strict';

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('ko-KR');
const PAGE_SIZE = 20;
let data, map, activePopup, mapReady = false, selectedId = '', filtered = [], page = 0;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const flyDuration = () => reduceMotion() ? 0 : 1400;
const coordinate = value => value === null || value === undefined || String(value).trim() === '' ? null : Number(value);
function hasCoordinates(library) {
  const lat = coordinate(library.latitude), lng = coordinate(library.longitude);
  return lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function makeChart(target, key) {
  const regions = [...data.stats.regions].sort((a, b) => b[key] - a[key]);
  const max = Math.max(...regions.map(r => r[key]), 1);
  $(target).classList.toggle('books', key === 'bookCount');
  for (const region of regions) {
    const row = element('button', 'bar-row');
    row.type = 'button';
    row.dataset.region = region.sido;
    row.setAttribute('aria-pressed', 'false');
    row.setAttribute('aria-label', `${region.sido} ${key === 'bookCount' ? '장서' : '도서관'} ${number.format(region[key])}${key === 'bookCount' ? '권' : '개'}, 지도에서 보기`);
    const track = element('span', 'bar-track');
    const fill = element('span', 'bar-fill');
    fill.style.setProperty('--width', `${region[key] / max * 100}%`);
    track.append(fill);
    row.append(element('span', 'bar-label', region.sido), track, element('span', 'bar-value', number.format(region[key])));
    row.addEventListener('click', () => {
      $('region').value = region.sido;
      filterLibraries();
      $('explore-title').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
    $(target).append(row);
  }
}
function mapNotice(message) {
  $('map-status').hidden = false;
  $('map-status').textContent = message;
}
function initializeMap() {
  if (!window.maplibregl) {
    mapNotice('3D 지도 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요. 도서관 검색은 사용할 수 있습니다.');
    return;
  }
  try {
    map = new maplibregl.Map({
      container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [127.6, 36.2], zoom: 6.5, pitch: 55, bearing: -18,
      maxPitch: 75, attributionControl: false, renderWorldCopies: false
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right');
    // Keep POI labels usable when the upstream sprite lacks an icon.
    map.on('styleimagemissing', event => {
      if (map.hasImage(event.id)) return;
      const size = 16, pixels = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const distance = Math.hypot(x - 7.5, y - 7.5);
        if (distance > 5.5) continue;
        const i = (y * size + x) * 4;
        const color = distance > 4 ? [255, 255, 255] : [119, 139, 132];
        pixels.set([...color, 255], i);
      }
      map.addImage(event.id, { width: size, height: size, data: pixels });
    });
    map.touchZoomRotate.enableRotation();
    map.touchPitch.enable();
    map.on('error', () => mapNotice('일부 지도 데이터를 불러오지 못했습니다. 인터넷 연결을 확인하세요. 도서관 검색은 계속 사용할 수 있습니다.'));
    map.on('load', () => {
      mapReady = true;
      map.addSource('libraries', { type: 'geojson', data: pillarData() });
      // Liberty supplies building polygons and their extrusion heights.
      map.setPaintProperty('building-3d', 'fill-extrusion-color', '#bccac6');
      map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.9);
      map.addLayer({ id: 'library-columns', type: 'fill-extrusion', source: 'libraries', paint: {
        'fill-extrusion-color': ['case', ['==', ['get', 'id'], selectedId], '#e7a159', '#208b79'],
        'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.92
      } });
      map.addSource('library-locations', { type: 'geojson', data: locationData() });
      map.addLayer({ id: 'library-dots', type: 'circle', source: 'library-locations', maxzoom: 13, paint: {
        'circle-radius': 3, 'circle-color': '#208b79', 'circle-stroke-color': '#fff', 'circle-stroke-width': 0.7
      } });
      for (const layer of ['library-columns', 'library-dots']) {
        map.on('click', layer, event => {
          const id = event.features?.[0]?.properties?.id;
          const library = filtered.find(l => l.id === id);
          if (library) selectLibrary(library);
        });
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }
      map.on('zoomend', () => { if (mapReady) map.getSource('libraries').setData(pillarData()); });
      map.on('moveend', () => {
        $('map').dataset.pitch = map.getPitch().toFixed(1);
        $('map').dataset.bearing = map.getBearing().toFixed(1);
        $('map').dataset.zoom = map.getZoom().toFixed(2);
        $('tilt-map').textContent = `기울기 ${Math.round(map.getPitch())}°`;
      });
      map.on('idle', () => {
        $('map').dataset.ready = 'true';
        $('map').dataset.buildingCount = String(map.queryRenderedFeatures({ layers: ['building-3d'] }).length);
        $('map').dataset.columnCount = String(map.queryRenderedFeatures({ layers: ['library-columns'] }).length);
      });
      for (const id of ['tilt-map', 'rotate-map', 'home-map']) $(id).disabled = false;
      $('tilt-map').addEventListener('click', () => map.easeTo({ pitch: map.getPitch() >= 60 ? 0 : map.getPitch() < 25 ? 55 : 70, duration: reduceMotion() ? 0 : 700 }));
      $('rotate-map').addEventListener('click', () => map.easeTo({ bearing: map.getBearing() + 45, duration: reduceMotion() ? 0 : 800 }));
      $('home-map').addEventListener('click', flyToResults);
      updateMap();
    });
  } catch (error) {
    if (map) map.remove();
    map = null;
    mapNotice('이 브라우저에서 3D 지도를 시작하지 못했습니다. WebGL을 지원하는 브라우저로 열어주세요. 검색과 차트는 사용할 수 있습니다.');
    console.error(error);
  }
}
function locationData() {
  return { type: 'FeatureCollection', features: filtered.filter(hasCoordinates).map(l => ({
    type: 'Feature', properties: { id: l.id }, geometry: { type: 'Point', coordinates: [coordinate(l.longitude), coordinate(l.latitude)] }
  })) };
}
function pillarData() {
  // Only footprint width changes with zoom; all heights use the same linear scale.
  const radius = Math.max(22, Math.min(1600, 45 * 2 ** (13 - (map?.getZoom() ?? 7))));
  return { type: 'FeatureCollection', features: filtered.filter(hasCoordinates).map(l => {
    const lat = coordinate(l.latitude), lng = coordinate(l.longitude);
    const ring = [];
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * 2 * Math.PI;
      ring.push([lng + Math.cos(angle) * radius / (111320 * Math.cos(lat * Math.PI / 180)), lat + Math.sin(angle) * radius / 111320]);
    }
    ring.push([...ring[0]]);
    return { type: 'Feature', properties: { id: l.id, books: l.bookCount ?? 0, height: Math.max(0, l.bookCount ?? 0) * 0.002 }, geometry: { type: 'Polygon', coordinates: [ring] } };
  }) };
}
function flyToResults() {
  if (!mapReady) return;
  const located = filtered.filter(hasCoordinates);
  if (!located.length) return;
  const bounds = new maplibregl.LngLatBounds();
  located.forEach(l => bounds.extend([coordinate(l.longitude), coordinate(l.latitude)]));
  map.fitBounds(bounds, { padding: { top: 75, bottom: 100, left: 40, right: 55 }, maxZoom: 12.5, pitch: 55, bearing: map.getBearing(), duration: flyDuration(), linear: false });
}
function popup(library) {
  const container = element('div');
  container.append(element('strong', '', library.name), element('div', 'popup-meta', library.address || '주소 정보 없음'), element('div', 'popup-meta', `${library.type || '유형 정보 없음'} · 장서 ${library.bookCount === null ? '정보 없음' : number.format(library.bookCount) + '권'}`), element('div', 'popup-meta', `데이터 기준일 ${library.dataDate || '정보 없음'}`));
  return container;
}
function updateMap() {
  const located = filtered.filter(hasCoordinates);
  const missing = filtered.length - located.length;
  $('map-count').textContent = map ? `지도 ${number.format(located.length)}개 · 좌표 없음/오류 ${number.format(missing)}개` : `지도 사용 불가 · 유효 좌표 ${number.format(located.length)}개`;
  $('map').dataset.markerCount = map ? String(located.length) : '0';
  if (!mapReady) return;
  activePopup?.remove();
  map.setPaintProperty('library-columns', 'fill-extrusion-color', '#208b79');
  map.getSource('libraries').setData(pillarData());
  map.getSource('library-locations').setData(locationData());
  flyToResults();
}
function selectLibrary(library) {
  selectedId = library.id;
  const index = filtered.findIndex(l => l.id === library.id);
  if (index >= 0) page = Math.floor(index / PAGE_SIZE);
  renderResults();
  if (mapReady && hasCoordinates(library)) {
    const center = [coordinate(library.longitude), coordinate(library.latitude)];
    map.setPaintProperty('library-columns', 'fill-extrusion-color', ['case', ['==', ['get', 'id'], library.id], '#e7a159', '#208b79']);
    activePopup?.remove();
    activePopup = new maplibregl.Popup({ offset: 12, maxWidth: '260px' }).setLngLat(center).setDOMContent(popup(library)).addTo(map);
    map.flyTo({ center, zoom: 15.5, pitch: 60, bearing: map.getBearing(), duration: flyDuration() });
  }
  const selected = $('result-list').querySelector('[aria-pressed="true"]');
  if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function renderResults() {
  const list = $('result-list');
  list.replaceChildren();
  const start = page * PAGE_SIZE;
  for (const library of filtered.slice(start, start + PAGE_SIZE)) {
    const item = element('button', 'library-item');
    item.type = 'button';
    item.setAttribute('aria-pressed', String(selectedId === library.id));
    item.append(element('span', 'library-name', library.name), element('span', 'library-address', library.address || `${library.sido} ${library.sigungu}`));
    const meta = element('span', 'library-meta');
    meta.append(element('span', '', library.type || '유형 정보 없음'), element('span', '', library.bookCount === null ? '장서 정보 없음' : `${number.format(library.bookCount)}권`));
    if (!hasCoordinates(library)) meta.append(element('span', '', '좌표 없음/오류'));
    if (!map && hasCoordinates(library)) meta.append(element('span', '', '지도 사용 불가'));
    item.append(meta);
    item.addEventListener('click', () => selectLibrary(library));
    list.append(item);
  }
  if (!filtered.length) list.append(element('p', 'empty', '검색 결과가 없습니다. 다른 이름으로 검색하거나 지역 필터를 바꿔보세요.'));
  $('result-count').textContent = `${number.format(filtered.length)}개`;
  $('page-info').textContent = filtered.length ? `${number.format(start + 1)}–${number.format(Math.min(start + PAGE_SIZE, filtered.length))} / ${number.format(filtered.length)}` : '0개';
  $('prev').disabled = page === 0;
  $('next').disabled = start + PAGE_SIZE >= filtered.length;
  list.scrollTop = 0;
}
function filterLibraries() {
  const region = $('region').value;
  const query = $('search').value.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
  filtered = data.libraries.filter(library => (!region || library.sido === region) && (!query || library.name.normalize('NFKC').toLocaleLowerCase('ko-KR').includes(query))).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
  page = 0;
  selectedId = '';
  $('results-title').textContent = region || '전국 도서관';
  document.querySelectorAll('.bar-row').forEach(row => row.setAttribute('aria-pressed', String(row.dataset.region === region)));
  renderResults();
  updateMap();
}
async function start() {
  try {
    const response = await fetch('data/libraries.json');
    if (!response.ok) throw new Error(`데이터 HTTP ${response.status}`);
    data = await response.json();
    if (data.libraries.length !== data.stats.totalLibraries) throw new Error('도서관 데이터 수와 집계가 일치하지 않습니다.');
    $('total-libraries').textContent = number.format(data.stats.totalLibraries);
    $('total-books').textContent = number.format(data.stats.totalBooks);
    $('total-regions').textContent = number.format(data.stats.regions.length);
    for (const r of data.stats.regions) {
      const option = element('option', '', r.sido);
      option.value = r.sido;
      $('region').append(option);
    }
    makeChart('library-chart', 'libraryCount');
    makeChart('book-chart', 'bookCount');
    initializeMap();
    const dates = data.libraries.map(l => l.dataDate).filter(Boolean).sort();
    $('data-note').textContent = `도서관별 데이터 기준일: ${dates[0] || '정보 없음'} ~ ${dates.at(-1) || '정보 없음'} · 장서 값 누락 ${data.stats.missingBookCount}개`;
    $('region').addEventListener('change', filterLibraries);
    let searchTimer;
    $('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(filterLibraries, 160); });
    $('reset').addEventListener('click', () => { clearTimeout(searchTimer); $('region').value = ''; $('search').value = ''; filterLibraries(); });
    $('prev').addEventListener('click', () => { page--; renderResults(); });
    $('next').addEventListener('click', () => { page++; renderResults(); });
    for (const id of ['region', 'search', 'reset']) $(id).disabled = false;
    $('load-status').textContent = '';
    filterLibraries();
  } catch (error) {
    $('load-status').textContent = '데이터를 불러오지 못했습니다. 로컬 HTTP 서버로 열었는지 확인하고 새로고침하세요.';
    console.error(error);
  }
}
start();
