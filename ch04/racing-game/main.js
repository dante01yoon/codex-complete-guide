import * as THREE from 'three';
import { TRACK, createTrack, getGate } from './track.js';
import { CAR, createCarState, updateCar, createCarMesh, KeyboardInput } from './car.js';
import { Race, formatTime } from './race.js';
import { isAutopilotEnabled, updateAutopilot } from './autopilot.js';

export function boot() {
  const autopilot = isAutopilotEnabled(window.location.search);
  const $ = (id) => document.getElementById(id);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  $('viewport').append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#aabdaf');
  scene.fog = new THREE.Fog('#aabdaf', 150, 330);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, .1, 650);
  scene.add(new THREE.HemisphereLight('#f5f0d9', '#45634c', 2.2));
  const sun = new THREE.DirectionalLight('#fff1cb', 3);
  sun.position.set(-70, 110, -50); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -115, right: 115, top: 100, bottom: -100, near: 1, far: 260 });
  sun.shadow.normalBias = .035; sun.shadow.bias = -.0001;
  scene.add(sun);
  scene.add(createTrack(THREE));
  const vehicle = createCarMesh(THREE);
  scene.add(vehicle.mesh);
  let car = createCarState(); vehicle.sync(car);
  const input = new KeyboardInput();
  let storage = null;
  try { if (!autopilot) storage = window.localStorage; } catch { /* Play normally without persistent records. */ }
  const race = new Race(storage);
  const STEP = 1 / 120;
  let accumulator = 0;
  let lastFrame = performance.now();
  let transientNotice = ''; let noticeUntil = 0;
  const cameraTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const hud = {
    lap: $('lap-number'), lapTime: $('lap-time'), total: $('total-time'), last: $('last-lap'),
    speed: $('speed'), speedBar: $('speed-bar'), surface: $('surface-status'), notice: $('notice'),
  };
  let lastNotice = '';
  const minimap = $('minimap');
  const minimapCar = $('minimap-car');
  for (const [id, a, b] of [
    ['minimap-outer', TRACK.outerA, TRACK.outerB],
    ['minimap-inner', TRACK.innerA, TRACK.innerB],
    ['minimap-center', TRACK.centerA, TRACK.centerB],
  ]) {
    $(id).setAttribute('rx', a); $(id).setAttribute('ry', b);
  }
  const startGate = getGate(0);
  for (const [attribute, value] of [
    ['x1', startGate.inner.x], ['y1', startGate.inner.z],
    ['x2', startGate.outer.x], ['y2', startGate.outer.z],
  ]) $('minimap-start').setAttribute(attribute, value);

  function renderMinimap() {
    // Keep world X/Z aligned with map X/Y. Zoom out if the car leaves the map.
    const zoom = Math.max(1, Math.abs(car.x) / 84, Math.abs(car.z) / 52);
    minimap.setAttribute('viewBox', `${-94 * zoom} ${-62 * zoom} ${188 * zoom} ${124 * zoom}`);
    const heading = 180 - car.heading * 180 / Math.PI;
    minimapCar.setAttribute('transform', `translate(${car.x} ${car.z}) rotate(${heading}) scale(${zoom})`);
  }

  function updateRecords() {
    for (const id of ['best-lap', 'menu-best-lap']) $(id).textContent = formatTime(race.records.lapSeconds);
    for (const id of ['best-race', 'menu-best-race']) $(id).textContent = formatTime(race.records.raceSeconds);
  }
  function followCamera(dt, snap = false) {
    const forwardX = Math.sin(car.heading), forwardZ = Math.cos(car.heading);
    const distance = 13 + car.speed * .11;
    cameraTarget.set(car.x - forwardX * distance, 8 + car.speed * .04, car.z - forwardZ * distance);
    desiredLook.set(car.x + forwardX * 6, 1.1, car.z + forwardZ * 6);
    if (snap) { camera.position.copy(cameraTarget); lookTarget.copy(desiredLook); }
    else {
      camera.position.lerp(cameraTarget, 1 - Math.exp(-5 * dt));
      lookTarget.lerp(desiredLook, 1 - Math.exp(-8 * dt));
    }
    camera.lookAt(lookTarget);
  }
  camera.position.set(-101, 86, -112);
  camera.lookAt(16, 0, 0);

  function showNotice(message, seconds = 3) {
    transientNotice = message; noticeUntil = race.elapsed + seconds;
  }
  function renderHUD() {
    renderMinimap();
    hud.lap.textContent = String(race.currentLap).padStart(2, '0');
    hud.lapTime.textContent = formatTime(race.currentLapTime);
    hud.total.textContent = formatTime(race.elapsed);
    hud.last.textContent = formatTime(race.lapTimes.at(-1));
    hud.speed.textContent = String(Math.round(car.speed * 3.6)).padStart(3, '0');
    hud.speedBar.style.width = `${car.speed / CAR.maxSpeed * 100}%`;
    hud.surface.classList.toggle('off-road', !car.onTrack);
    hud.surface.innerHTML = `<i class="status-dot"></i>${car.onTrack ? 'TRACK' : 'GRASS'}`;
    [...$('lap-progress').children].forEach((segment, i) => {
      segment.className = i < race.lapTimes.length ? 'complete' : i === race.lapTimes.length ? 'active' : '';
    });
    let notice = race.elapsed < noticeUntil ? transientNotice : '';
    if (!car.onTrack) notice = '트랙 이탈 · 속도가 줄어듭니다. 도로로 복귀하세요.';
    else if (!race.lapValid) notice = '랩 무효 · 출발선을 통과한 뒤 다시 도전하세요.';
    else if (autopilot && !notice) notice = 'AUTOPILOT · 중앙선 자동 주행 테스트 · 기록 저장 안 함';
    else if (race.storageUnavailable && !notice) notice = '기록은 이번 세션에서만 유지됩니다.';
    hud.notice.hidden = !notice;
    hud.notice.classList.toggle('warning', !car.onTrack || !race.lapValid);
    if (notice !== lastNotice) { hud.notice.textContent = notice; lastNotice = notice; }
  }
  function startRace() {
    input.clear(); car = createCarState(); vehicle.sync(car); race.start();
    accumulator = 0; lastFrame = performance.now();
    document.body.classList.remove('menu-open');
    for (const id of ['menu', 'menu-bottom', 'menu-edition', 'dialog-layer', 'pause-dialog', 'finish-dialog']) $(id).hidden = true;
    $('hud').hidden = false; $('race-actions').hidden = false;
    followCamera(0, true); showNotice(autopilot ? 'AUTOPILOT · 중앙선 자동 주행 테스트 · 기록 저장 안 함' : '3바퀴 타임 어택 · W 또는 ↑ 키로 출발하세요.', 4);
    updateRecords(); renderHUD(); $('pause-button').focus({ preventScroll: true });
  }
  function pauseRace() {
    if (race.state !== 'racing' || race.paused) return;
    race.pause(); input.clear(); accumulator = 0;
    $('dialog-layer').hidden = false; $('pause-dialog').hidden = false;
    $('resume-button').focus({ preventScroll: true });
  }
  function resumeRace() {
    if (!race.paused || document.hidden) return;
    race.resume(); input.clear(); accumulator = 0; lastFrame = performance.now();
    $('dialog-layer').hidden = true; $('pause-dialog').hidden = true;
    $('pause-button').focus({ preventScroll: true });
  }
  function finishRace() {
    car.speed = 0; input.clear(); accumulator = 0;
    $('dialog-layer').hidden = false; $('finish-dialog').hidden = false;
    $('result-total').textContent = formatTime(race.elapsed);
    $('result-laps').replaceChildren(...race.lapTimes.map((time, i) => {
      const row = document.createElement('li');
      const label = document.createElement('span'); label.textContent = `LAP ${String(i + 1).padStart(2, '0')}`; label.className = 'mono';
      const value = document.createElement('span'); value.textContent = formatTime(time); value.className = 'mono';
      row.append(label, value); return row;
    }));
    const records = [];
    if (race.newLapRecord) records.push('최고 랩 갱신');
    if (race.newRaceRecord) records.push('최고 완주 갱신');
    $('record-note').textContent = (records.join(' · ') || '좋은 주행이었어요. 다음 기록에 도전해보세요.') + (race.storageUnavailable ? ' · 기록은 이번 세션에만 저장됩니다.' : '');
    updateRecords(); $('race-again-button').focus({ preventScroll: true });
  }

  $('start-button').addEventListener('click', startRace);
  $('restart-button').addEventListener('click', startRace);
  $('race-again-button').addEventListener('click', startRace);
  $('pause-button').addEventListener('click', pauseRace);
  $('resume-button').addEventListener('click', resumeRace);
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault(); if (race.paused) resumeRace(); else pauseRace();
    }
    if (race.paused && event.code === 'Tab') { event.preventDefault(); $('resume-button').focus(); }
    if (race.state === 'finished' && event.code === 'Tab') { event.preventDefault(); $('race-again-button').focus(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRace(); });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); pauseRace(); $('error').hidden = false;
    $('error-message').textContent = '그래픽 연결이 중단되었습니다. 페이지를 다시 불러와 주세요.';
  });
  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.max(0, (now - lastFrame) / 1000); lastFrame = now;
    const dt = Math.min(elapsed, .1);
    if (race.state === 'racing' && !race.paused) {
      // Charge stalled foreground time without making a large physics jump.
      if (elapsed > dt) race.addTime(elapsed - dt);
      accumulator += dt;
      const controls = input.read();
      while (accumulator >= STEP && race.state === 'racing') {
        const previous = { x: car.x, z: car.z };
        if (autopilot) updateAutopilot(car, STEP);
        else updateCar(car, controls, STEP);
        const event = race.update(STEP, previous, car);
        accumulator -= STEP;
        if (event?.type === 'lap') { showNotice(`LAP ${event.lap} · ${formatTime(event.lapTime)}${event.newBest ? ' · 최고 랩!' : ''}`, 4); updateRecords(); }
        if (event?.type === 'retry') showNotice('새 유효 랩 시작 · 도로 위에서 한 바퀴를 완주하세요.', 4);
        if (event?.type === 'finish') finishRace();
      }
      vehicle.sync(car); followCamera(dt); renderHUD();
    }
    renderer.render(scene, camera);
  }
  updateRecords(); $('start-button').disabled = false; $('start-label').textContent = '레이스 시작';
  requestAnimationFrame(frame);
}
