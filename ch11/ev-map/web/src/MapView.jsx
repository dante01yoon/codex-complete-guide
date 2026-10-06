import React, { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { makeColumns, number, STATES } from './data.js';

setWorkerUrl(workerUrl);
const INITIAL = { center: [126.999, 37.503], zoom: 13.6, pitch: 55, bearing: -20 };

function popupContent(station) {
  const element = document.createElement('div');
  element.className = 'station-popup';
  const title = document.createElement('h3');
  title.textContent = station.name;
  const address = document.createElement('p');
  address.className = 'popup-address';
  address.textContent = station.address;
  const summary = document.createElement('p');
  summary.textContent = `충전기 ${number(station.total)}대`;
  element.append(title, address, summary);
  const list = document.createElement('ul');
  STATES.forEach((state, i) => {
    const row = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'state-dot';
    dot.style.background = state.color;
    row.append(dot, document.createTextNode(`${state.name} ${number(station.counts[i])}대`));
    list.append(row);
  });
  element.append(list);
  return element;
}

export default function MapView({ stations }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const [mode, setMode] = useState('3D');
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    let map;
    let popup;
    let timeout;
    try {
      map = new Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/liberty', ...INITIAL, canvasContextAttributes: { antialias: true }, attributionControl: true, maxPitch: 70 });
      mapRef.current = map;
      map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
      map.on('styleimagemissing', (event) => {
        if (!map.hasImage(event.id)) map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) });
      });
      // A transient tile error is recoverable; only show an error if loading stalls.
      timeout = setTimeout(() => { if (!map.isStyleLoaded()) setMapError(true); }, 45000);
      map.on('load', () => {
        clearTimeout(timeout);
        setLoaded(true);
        setMapError(false);
        const layers = map.getStyle().layers;
        // Match the accepted light basemap and prefer native Korean place names.
        for (const layer of layers) {
          if (layer.type === 'fill' && layer['source-layer'] === 'water') map.setPaintProperty(layer.id, 'fill-color', '#acd4ec');
          if (layer.type === 'line' && layer['source-layer'] === 'waterway') map.setPaintProperty(layer.id, 'line-color', '#acd4ec');
          if (layer.type === 'line' && layer['source-layer'] === 'transportation') {
            const casing = /casing|outline/.test(layer.id);
            map.setPaintProperty(layer.id, 'line-color', casing ? '#e0e5e8' : '#ffffff');
          }
          if (layer.type === 'fill' && layer['source-layer'] === 'landcover') map.setPaintProperty(layer.id, 'fill-color', '#e1ecdf');
          if (layer.type === 'symbol' && /shield/.test(layer.id)) map.setLayoutProperty(layer.id, 'visibility', 'none');
          else if (layer.type === 'symbol' && layer.layout?.['text-field']) {
            map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ko'], ['get', 'name'], ['get', 'name:latin'], '']);
            map.setPaintProperty(layer.id, 'text-color', '#61758b');
            map.setPaintProperty(layer.id, 'text-halo-color', '#ffffff');
          }
        }
        const labelId = layers.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;
        const source = layers.find((layer) => layer['source-layer'] === 'building')?.source;
        // Replace Liberty's existing extrusion to avoid duplicate buildings.
        layers.filter((layer) => layer.type === 'fill-extrusion' && layer['source-layer'] === 'building').forEach((layer) => map.removeLayer(layer.id));
        if (source) map.addLayer({
          id: 'seoul-buildings', type: 'fill-extrusion', source, 'source-layer': 'building', minzoom: 13,
          filter: ['!=', ['get', 'hide_3d'], true],
          paint: {
            'fill-extrusion-color': '#e0e5ed',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.78,
          },
        }, labelId);
        map.addSource('stations', { type: 'geojson', data: makeColumns(stations), maxzoom: 16, tolerance: 0 });
        map.addLayer({
          id: 'station-columns', type: 'fill-extrusion', source: 'stations',
          paint: {
            'fill-extrusion-color': ['match', ['get', 'state'], 0, STATES[0].color, 1, STATES[1].color, 2, STATES[2].color, STATES[3].color],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-opacity': 0.98,
          },
        }, labelId);
        map.addLayer({ id: 'selected-station', type: 'line', source: 'stations', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#0e6370', 'line-width': 3 } }, labelId);
        map.on('mouseenter', 'station-columns', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'station-columns', () => { map.getCanvas().style.cursor = ''; });
        const lookup = new globalThis.Map(stations.map((station) => [station.id, station]));
        map.on('click', 'station-columns', (event) => {
          const station = lookup.get(event.features?.[0]?.properties.id);
          if (!station) return;
          popup?.remove();
          map.setFilter('selected-station', ['==', ['get', 'id'], station.id]);
          popup = new Popup({ offset: 18, maxWidth: '290px' }).setLngLat([station.lng, station.lat]).setDOMContent(popupContent(station)).addTo(map);
          popup.on('close', () => { if (map.getLayer('selected-station')) map.setFilter('selected-station', ['==', ['get', 'id'], '']); });
        });
      });
    } catch {
      setMapError(true);
    }
    const resize = new ResizeObserver(() => map?.resize());
    resize.observe(container.current);
    return () => { clearTimeout(timeout); resize.disconnect(); popup?.remove(); map?.remove(); mapRef.current = null; };
  }, [stations]);

  function changeMode(next) {
    const map = mapRef.current;
    if (!map || !loaded) return;
    setMode(next);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.easeTo({ pitch: next === '3D' ? 55 : 0, bearing: next === '3D' ? -20 : 0, duration: reduced ? 0 : 650 });
  }

  function showSeoul() {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.fitBounds([[126.77, 37.42], [127.18, 37.70]], { padding: 55, pitch: mode === '3D' ? 55 : 0, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900 });
  }

  return <>
    <div ref={container} className="map-canvas" />
    <div className="map-toolbar">
      <h2>충전소 3D 지도</h2>
      <div className="map-actions">
        <div className="view-toggle" aria-label="지도 보기 방식">
          {['3D', '2D'].map((value) => <button key={value} aria-pressed={mode === value} disabled={!loaded} onClick={() => changeMode(value)}>{value}</button>)}
        </div>
        <button className="seoul-button" disabled={!loaded} onClick={showSeoul}>서울 전체</button>
      </div>
    </div>
    {mapError ? <div className="map-notice" role="alert">지도를 불러오지 못했습니다. 인터넷 연결을 확인한 후 다시 열어 주세요.</div> : !loaded ? <div className="map-notice" role="status">3D 지도를 불러오고 있습니다.</div> : null}
  </>;
}
