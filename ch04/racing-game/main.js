import * as THREE from 'three';
import { Race, TRACK, TAU, trackPoint, isOnTrack, formatTime } from './race.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfebe8');
scene.fog = new THREE.Fog('#dfebe8', 140, 430);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const camera = new THREE.PerspectiveCamera(57, 1, 0.1, 650);
scene.add(new THREE.HemisphereLight('#f4ecdb', '#667652', 2.5));
const sunlight = new THREE.DirectionalLight('#ffe0b4', 3.1);
sunlight.position.set(-75, 110, 65);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
Object.assign(sunlight.shadow.camera, { left: -130, right: 130, top: 115, bottom: -115, near: 1, far: 300 });
sunlight.shadow.normalBias = 0.06;
sunlight.shadow.bias = -0.00015;
scene.add(sunlight);

const materials = {};
function material(color, options = {}) {
  const key = `${color}:${JSON.stringify(options)}`;
  return materials[key] ??= new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options });
}

function box(width, height, depth, color, x = 0, y = 0, z = 0, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Every road ribbon uses the same ellipse radii as the gameplay boundary test.
function ribbon(inner, outer, height, options = {}) {
  const segments = 384;
  const positions = [], colors = [], indices = [];
  const color = new THREE.Color();
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * TAU;
    if (options.colors) color.set(options.colors[Math.floor(i / 3) % options.colors.length]);
    for (const offset of [inner, outer]) {
      const point = trackPoint(angle, offset);
      positions.push(point.x, height, point.z);
      if (options.colors) colors.push(color.r, color.g, color.b);
    }
    if (i < segments && (!options.dashed || Math.floor(i / 3) % 2 === 0)) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material(options.color ?? '#ffffff', { vertexColors: colors.length > 0 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildTrack() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), material('#b7bf96'));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  ribbon(-TRACK.halfWidth - 1.7, TRACK.halfWidth + 1.7, 0.018, { color: '#cac8ab' });
  ribbon(-TRACK.halfWidth, TRACK.halfWidth, 0.04, { color: '#535b5c' });
  ribbon(-TRACK.halfWidth - 1.55, -TRACK.halfWidth, 0.07, { colors: ['#e1ddc9', '#c86949'] });
  ribbon(TRACK.halfWidth, TRACK.halfWidth + 1.55, 0.07, { colors: ['#e1ddc9', '#c86949'] });
  ribbon(-TRACK.halfWidth + 0.24, -TRACK.halfWidth + 0.42, 0.08, { color: '#eee5cb' });
  ribbon(TRACK.halfWidth - 0.42, TRACK.halfWidth - 0.24, 0.08, { color: '#eee5cb' });
  ribbon(-0.07, 0.07, 0.085, { color: '#c7c8b5', dashed: true });

  // Checkered start / finish line, made from geometry rather than an image.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 18; col++) {
      box(TRACK.halfWidth * 2 / 18, 0.025, 0.55,
        (row + col) % 2 ? '#e7e5d9' : '#283336',
        TRACK.radiusX - TRACK.halfWidth + (col + 0.5) * TRACK.halfWidth * 2 / 18,
        0.1, (row - 1) * 0.55);
    }
  }

  const dummy = new THREE.Object3D();
  const count = 144;
  const barriers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.65, 0.8, 1), material('#d8d7c1'), count);
  const tops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.72, 0.12, 1), material('#6b7d73'), count);
  for (let i = 0; i < count; i++) {
    const angle = (i + 0.5) / count * TAU;
    const p = trackPoint(angle, TRACK.halfWidth + 4);
    const length = Math.hypot((TRACK.radiusX + TRACK.halfWidth + 4) * Math.sin(angle),
      (TRACK.radiusZ + TRACK.halfWidth + 4) * Math.cos(angle)) * TAU / count;
    dummy.position.set(p.x, 0.4, p.z);
    dummy.rotation.y = Math.atan2(-(TRACK.radiusX + TRACK.halfWidth + 4) * Math.sin(angle),
      -(TRACK.radiusZ + TRACK.halfWidth + 4) * Math.cos(angle));
    dummy.scale.set(1, 1, length * 0.98);
    dummy.updateMatrix();
    barriers.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 0.86;
    dummy.updateMatrix();
    tops.setMatrixAt(i, dummy.matrix);
  }
  barriers.castShadow = true;
  barriers.receiveShadow = true;
  scene.add(barriers, tops);

  // Direction arrows make the intended, left-turning lap direction explicit.
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-0.75, -1.2);
  arrowShape.lineTo(0, 0);
  arrowShape.lineTo(0.75, -1.2);
  arrowShape.lineTo(0.75, -0.35);
  arrowShape.lineTo(0, 0.85);
  arrowShape.lineTo(-0.75, -0.35);
  arrowShape.closePath();
  const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
  arrowGeometry.rotateX(Math.PI / 2);
  for (let i = 0; i < 12; i++) {
    const angle = (i + 0.45) / 12 * TAU;
    const point = trackPoint(angle, -3.6);
    const arrow = new THREE.Mesh(arrowGeometry, material('#d6d6bb', { side: THREE.DoubleSide }));
    arrow.position.set(point.x, 0.1, point.z);
    arrow.rotation.y = Math.atan2(-TRACK.radiusX * Math.sin(angle), -TRACK.radiusZ * Math.cos(angle));
    scene.add(arrow);
  }
}

function sign(text, width, height, color = '#25372f', background = '#f5f1de') {
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 1024;
  signCanvas.height = 160;
  const ctx = signCanvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1024, 160);
  ctx.fillStyle = color;
  ctx.font = 'bold 74px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 84);
  const texture = new THREE.CanvasTexture(signCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide }));
}

function buildScenery() {
  // Seeded placement keeps the scenery identical after every restart.
  let seed = 89;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  const points = [];
  for (let i = 0; i < 180; i++) {
    const angle = random() * TAU;
    const radius = 1.35 + random() * 1.6;
    const x = Math.cos(angle) * TRACK.radiusX * radius;
    const z = Math.sin(angle) * TRACK.radiusZ * radius;
    if (x > 97 && x < 133 && z > -55 && z < 40) continue;
    points.push({ x, z, size: 0.8 + random() * 1.2 });
  }
  for (let i = 0; i < 16; i++) {
    const angle = random() * TAU;
    points.push({ x: Math.cos(angle) * (30 + random() * 15), z: Math.sin(angle) * (10 + random() * 12), size: 0.65 + random() * 0.5 });
  }
  const dummy = new THREE.Object3D();
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.35, 2.8, 5), material('#766c50'), points.length);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(2.3, 5.9, 6), material('#5d7b60'), points.length);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 4.5, 6), material('#738965'), points.length);
  points.forEach((p, i) => {
    dummy.scale.setScalar(p.size);
    dummy.rotation.y = random() * TAU;
    dummy.position.set(p.x, 1.4 * p.size, p.z);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 4.3 * p.size;
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 6.2 * p.size;
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  });
  leaves.castShadow = crowns.castShadow = true;
  scene.add(trunks, leaves, crowns);

  for (let i = 0; i < 24; i++) {
    const angle = i / 24 * TAU;
    const radius = 285 + random() * 95;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(45 + random() * 65, 35 + random() * 75, 5), material(i % 2 ? '#9aa68d' : '#a8af94'));
    mountain.position.set(Math.cos(angle) * radius, 3, Math.sin(angle) * radius);
    mountain.rotation.y = random() * Math.PI;
    scene.add(mountain);
  }

  // Low pit buildings and a covered grandstand sit outside the driving line.
  box(12, 4, 26, '#dad3b5', 113, 2, -20);
  box(13, 0.5, 28, '#607d71', 113, 4.25, -20);
  for (let i = 0; i < 5; i++) box(0.08, 2.2, 3.3, '#3e5553', 106.95, 1.8, -30 + i * 5);
  for (let i = 0; i < 5; i++) box(2.2, 0.7, 22, i % 2 ? '#a0a38a' : '#d0c7a8', 110 + i * 1.8, 0.5 + i * 0.7, 20);
  box(14, 0.35, 26, '#cfb48d', 114, 7, 20);
  for (const x of [108, 120]) for (const z of [8, 32]) box(0.3, 7, 0.3, '#5e7064', x, 3.5, z);

  // Start gantry: visible from the initial chase camera, including the sign face.
  for (const x of [TRACK.radiusX - 10.4, TRACK.radiusX + 10.4]) box(0.45, 7.6, 0.55, '#4b6358', x, 3.8, 0);
  box(21.5, 1.25, 0.65, '#d5d5ba', TRACK.radiusX, 7.2, 0);
  const banner = sign('OVAL CLUB   /   SUNSET CIRCUIT', 20.7, 1.1);
  banner.position.set(TRACK.radiusX, 7.2, 0.34);
  scene.add(banner);
  for (let i = 0; i < 5; i++) box(0.35, 0.16, 0.15, '#cdd4ad', TRACK.radiusX - 1.2 + i * 0.6, 6.4, 0.3);

  const infield = sign('MAKE EVERY LAP COUNT.', 25, 3);
  infield.position.set(38, 2.5, 10);
  infield.rotation.y = Math.PI / 2;
  scene.add(infield);
  for (const z of [-2, 22]) box(0.25, 3, 0.25, '#5e7064', 38, 1.5, z);
}

const car = new THREE.Group();
const body = new THREE.Group();
const wheelPivots = [];
const wheels = [];
car.add(body);
scene.add(car);

function buildCar() {
  box(2.05, 0.55, 4.1, '#ef754b', 0, 0.7, 0, body);
  box(2.02, 0.24, 3.2, '#e46b43', 0, 1.0, -0.15, body);
  box(1.62, 0.6, 1.65, '#314d50', 0, 1.32, -0.25, body);
  box(1.7, 0.12, 1.28, '#ef875a', 0, 1.67, -0.39, body);
  box(1.68, 0.09, 0.08, '#ed956a', 0, 1.63, 0.58, body);
  for (const x of [-0.27, 0.27]) {
    box(0.15, 0.012, 1.19, '#f6dfad', x, 1.126, 1.28, body);
    box(0.15, 0.013, 1.29, '#f6dfad', x, 1.738, -0.39, body);
    box(0.15, 0.012, 0.7, '#f6dfad', x, 1.126, -1.48, body);
  }
  box(2.02, 0.17, 0.15, '#24393c', 0, 0.5, 2.07, body);
  box(2.02, 0.18, 0.15, '#24393c', 0, 0.5, -2.07, body);
  for (const x of [-0.72, 0.72]) {
    box(0.4, 0.17, 0.045, '#fff0b4', x, 0.84, 2.065, body);
    box(0.45, 0.14, 0.045, '#9c352a', x, 0.84, -2.065, body);
    box(0.12, 0.26, 0.18, '#2f4545', x, 1.1, -1.8, body);
  }
  box(2.1, 0.1, 0.38, '#293c3c', 0, 1.3, -1.85, body);
  for (const side of [-1, 1]) {
    box(0.22, 0.16, 0.3, '#ee8456', side * 1.12, 1.16, 0.45, body);
    for (const z of [-1.31, 1.3]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 1.04, 0.46, z);
      const geometry = new THREE.CylinderGeometry(0.44, 0.44, 0.35, 12);
      geometry.rotateZ(Math.PI / 2);
      const wheel = new THREE.Mesh(geometry, material('#263232'));
      wheel.castShadow = true;
      const hubGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.365, 8);
      hubGeometry.rotateZ(Math.PI / 2);
      wheel.add(new THREE.Mesh(hubGeometry, material('#c3c5b8', { metalness: 0.45 })));
      pivot.add(wheel);
      car.add(pivot);
      wheelPivots.push({ pivot, front: z > 0 });
      wheels.push(wheel);
    }
  }
}

buildTrack();
buildScenery();
buildCar();

const race = new Race();
const vehicle = { x: TRACK.radiusX, z: 4, heading: Math.PI, speed: 0, steer: 0, onTrack: true };
const keys = new Set();
const FIXED_STEP = 1 / 120;
const MAX_SPEED = 48;
const targetCamera = new THREE.Vector3();
const targetLook = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
const mapContext = $('minimap').getContext('2d');
const speedBars = [...document.querySelectorAll('.speed-track i')];
let paused = false;
let countdownRemaining = null;
let accumulator = 0;
let previousFrame = performance.now();
let toastUntil = 0;
let returnFocus = null;

function syncCar() {
  car.position.set(vehicle.x, 0, vehicle.z);
  car.rotation.y = vehicle.heading;
  body.rotation.z = vehicle.steer * Math.min(vehicle.speed / MAX_SPEED, 1) * -0.035;
  wheelPivots.forEach(({ pivot, front }) => { if (front) pivot.rotation.y = vehicle.steer * 0.35; });
}

function updateCamera(dt, snap = false) {
  const forwardX = Math.sin(vehicle.heading), forwardZ = Math.cos(vehicle.heading);
  const distance = 11 + vehicle.speed * 0.045;
  targetCamera.set(vehicle.x - forwardX * distance, 6.9 + vehicle.speed * 0.012, vehicle.z - forwardZ * distance);
  targetLook.set(vehicle.x + forwardX * 10, 0.8, vehicle.z + forwardZ * 10);
  const blend = snap ? 1 : 1 - Math.exp(-7 * dt);
  camera.position.lerp(targetCamera, blend);
  cameraLook.lerp(targetLook, blend);
  camera.lookAt(cameraLook);
}

function toast(message, duration = 3200) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastUntil = performance.now() + duration;
}

function focusDialog(button) {
  returnFocus = document.activeElement;
  button.focus({ preventScroll: true });
}

function setPaused(value) {
  if ((race.phase !== 'racing' && countdownRemaining === null) || paused === value) return;
  paused = value;
  keys.clear();
  accumulator = 0;
  previousFrame = performance.now();
  $('pause-overlay').hidden = !paused;
  if (paused) focusDialog($('resume-button'));
  else (returnFocus ?? canvas).focus({ preventScroll: true });
  updateUI();
}

function resetRace() {
  race.reset();
  Object.assign(vehicle, { x: TRACK.radiusX, z: 4, heading: Math.PI, speed: 0, steer: 0, onTrack: true });
  keys.clear();
  paused = false;
  countdownRemaining = null;
  accumulator = 0;
  previousFrame = performance.now();
  toastUntil = 0;
  $('toast').hidden = true;
  $('pause-overlay').hidden = true;
  $('finish-overlay').hidden = true;
  wheels.forEach((wheel) => { wheel.rotation.x = 0; });
  syncCar();
  updateCamera(0, true);
  updateUI();
  canvas.focus({ preventScroll: true });
}

function finishRace() {
  vehicle.speed = 0;
  vehicle.steer = 0;
  keys.clear();
  $('total-time').textContent = formatTime(race.elapsed);
  const fastest = Math.min(...race.lapTimes);
  $('lap-results').replaceChildren(...race.lapTimes.map((time, i) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `LAP 0${i + 1}${time === fastest ? '  ·  SESSION BEST' : ''}`;
    const result = document.createElement('strong');
    result.textContent = formatTime(time);
    li.append(label, result);
    return li;
  }));
  $('result-best').textContent = `${race.newBest ? '✦ 새로운 최고 랩 기록! ' : '최고 랩 기록  '}${formatTime(race.best)}${race.storageAvailable ? '' : ' · 이번 실행에만 저장'} `;
  $('finish-overlay').hidden = false;
  $('toast').hidden = true;
  focusDialog($('finish-restart-button'));
}

function step(dt) {
  if (paused || race.phase === 'finished') return;
  const throttle = keys.has('KeyW') || keys.has('ArrowUp');
  const brake = keys.has('KeyS') || keys.has('ArrowDown');
  if (race.phase === 'ready') {
    if (countdownRemaining !== null) {
      countdownRemaining = Math.max(0, countdownRemaining - dt);
      if (countdownRemaining < 1e-9) {
        countdownRemaining = null;
        race.start(vehicle);
      }
    }
    // Neither the driving simulation nor the race clock runs before the start.
    return;
  }
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  const steering = Number(left) - Number(right);
  vehicle.steer = THREE.MathUtils.damp(vehicle.steer, steering, 10, dt);
  vehicle.onTrack = isOnTrack(vehicle);
  const maxSpeed = vehicle.onTrack ? MAX_SPEED : 13;
  if (brake) vehicle.speed -= 30 * dt;
  else if (throttle) vehicle.speed += (vehicle.onTrack ? 14 : 5) * dt;
  else vehicle.speed -= (2.1 + vehicle.speed * 0.035) * dt;
  if (vehicle.speed > maxSpeed) vehicle.speed = Math.max(maxSpeed, vehicle.speed - (vehicle.onTrack ? 10 : 25) * dt);
  vehicle.speed = Math.max(0, Math.min(vehicle.speed, MAX_SPEED));
  vehicle.heading += vehicle.steer * Math.min(vehicle.speed * 0.11, 1.85) * (vehicle.onTrack ? 1 : 0.8) * dt;
  vehicle.heading = Math.atan2(Math.sin(vehicle.heading), Math.cos(vehicle.heading));
  vehicle.x += Math.sin(vehicle.heading) * vehicle.speed * dt;
  vehicle.z += Math.cos(vehicle.heading) * vehicle.speed * dt;
  // Keep a lost car within the scenery; R always returns to the start line.
  vehicle.x = THREE.MathUtils.clamp(vehicle.x, -280, 280);
  vehicle.z = THREE.MathUtils.clamp(vehicle.z, -220, 220);
  vehicle.onTrack = isOnTrack(vehicle);
  wheels.forEach((wheel) => { wheel.rotation.x += vehicle.speed * dt / 0.44; });

  const event = race.update(dt, vehicle);
  if (event?.type === 'finish') finishRace();
  else if (event?.type === 'lap') toast(`LAP ${race.lapTimes.length}  ·  ${formatTime(event.time)}${event.isBest ? '  ✦ NEW BEST' : ''}`);
}

function text(id, value) {
  const element = $(id);
  if (element.textContent !== value) element.textContent = value;
}

function drawMap() {
  const ctx = mapContext;
  const scale = 1.72, cx = 228, cy = 148;
  ctx.clearRect(0, 0, 456, 300);
  ctx.beginPath();
  ctx.ellipse(cx, cy, TRACK.radiusX * scale, TRACK.radiusZ * scale, 0, 0, TAU);
  ctx.strokeStyle = '#b2bcb3';
  ctx.lineWidth = TRACK.halfWidth * 2 * scale;
  ctx.stroke();
  ctx.strokeStyle = '#46554e';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#202a30';
  ctx.fillRect(cx + TRACK.radiusX * scale - 15, cy - 2, 30, 4);
  if (race.phase === 'racing') {
    const gate = trackPoint(race.nextCheckpoint / TRACK.checkpoints * TAU);
    ctx.beginPath();
    ctx.arc(cx + gate.x * scale, cy + gate.z * scale, 5, 0, TAU);
    ctx.fillStyle = '#202a30';
    ctx.fill();
  }
  ctx.save();
  ctx.translate(THREE.MathUtils.clamp(cx + vehicle.x * scale, 10, 446), THREE.MathUtils.clamp(cy + vehicle.z * scale, 12, 288));
  ctx.rotate(Math.PI - vehicle.heading);
  ctx.fillStyle = '#9e411e';
  ctx.strokeStyle = '#202a30';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 5);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function updateUI() {
  text('lap', String(race.lap).padStart(2, '0'));
  text('lap-time', formatTime(race.lapElapsed));
  text('best-time', formatTime(race.best));
  text('speed', String(Math.round(vehicle.speed * 3.6)).padStart(3, '0'));
  text('gear', vehicle.speed < 0.5 ? 'N' : `D${Math.min(5, Math.floor(vehicle.speed / 10) + 1)}`);
  text('progress', `${Math.floor(race.progress * 100)}% COMPLETE`);
  speedBars.forEach((bar, i) => bar.classList.toggle('active', vehicle.speed / MAX_SPEED > i / speedBars.length));
  const countingDown = countdownRemaining !== null;
  $('start-hint').hidden = race.phase !== 'ready' || countingDown;
  $('countdown').hidden = !countingDown || paused;
  if (countingDown) text('countdown-value', String(Math.max(1, Math.ceil(countdownRemaining - 1e-9))));
  $('pause-button').disabled = race.phase !== 'racing' && !countingDown;
  $('pause-button').setAttribute('aria-pressed', String(paused));
  const offroad = !vehicle.onTrack;
  $('track-status').classList.toggle('offroad', offroad);
  text('surface-label', race.phase === 'finished' ? 'CHEQUERED FLAG' : paused ? 'SESSION PAUSED' : countingDown ? 'GET READY' : race.phase === 'ready' ? 'READY TO RACE' : offroad ? 'OFF TRACK' : 'ON THE RACING LINE');
  text('surface-detail', race.phase === 'finished' ? '다음 기록을 향해, 다시 한번.' : paused ? '기록 측정이 멈췄습니다.' : countingDown ? '카운트다운이 끝나면 출발합니다.' : race.phase === 'ready' ? '세 바퀴, 하나의 새로운 기록.' : offroad ? '잔디에서는 속도가 줄어듭니다.' : `다음 체크포인트 ${race.nextCheckpoint} / ${TRACK.checkpoints}`);
  drawMap();
}

const drivingKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', (event) => {
  const dialog = !$('pause-overlay').hidden ? $('pause-overlay') : !$('finish-overlay').hidden ? $('finish-overlay') : null;
  if (event.code === 'Tab' && dialog) {
    const buttons = [...dialog.querySelectorAll('button')];
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (drivingKeys.has(event.code)) {
    event.preventDefault();
    if (!paused && race.phase !== 'finished') {
      keys.add(event.code);
      if (race.phase === 'ready' && countdownRemaining === null
        && (event.code === 'KeyW' || event.code === 'ArrowUp')) {
        countdownRemaining = 3;
        accumulator = 0;
        previousFrame = performance.now();
        updateUI();
      }
    }
  } else if (!event.repeat && (event.code === 'KeyP' || event.code === 'Escape')) {
    event.preventDefault();
    setPaused(!paused);
  } else if (!event.repeat && event.code === 'KeyR') {
    event.preventDefault();
    resetRace();
  }
});
window.addEventListener('keyup', (event) => { keys.delete(event.code); });
window.addEventListener('blur', () => { keys.clear(); setPaused(true); });
document.addEventListener('visibilitychange', () => {
  keys.clear();
  if (document.hidden) setPaused(true);
  accumulator = 0;
  previousFrame = performance.now();
});
$('pause-button').addEventListener('click', () => setPaused(!paused));
$('resume-button').addEventListener('click', () => setPaused(false));
for (const id of ['restart-button', 'pause-restart-button', 'finish-restart-button']) $(id).addEventListener('click', resetRace);
canvas.tabIndex = 0;
canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  keys.clear();
  setPaused(true);
  $('error-message').textContent = '그래픽 연결이 중단되었습니다. 페이지를 새로고침해 서킷을 다시 불러와 주세요.';
  $('error-panel').hidden = false;
});

function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
resize();
resetRace();

// Read-only telemetry is also useful when tuning the arcade driving model.
export function getGameState() {
  return { ...vehicle, paused, phase: countdownRemaining !== null ? 'countdown' : race.phase,
    countdownRemaining, lap: race.lap, elapsed: race.elapsed,
    lapElapsed: race.lapElapsed, lapTimes: [...race.lapTimes], best: race.best,
    nextCheckpoint: race.nextCheckpoint, camera: camera.position.toArray() };
}

function frame(now) {
  const dt = Math.max(0, Math.min((now - previousFrame) / 1000, 0.25));
  previousFrame = now;
  if (!paused && race.phase !== 'finished' && !document.hidden) {
    accumulator += dt;
    while (accumulator >= FIXED_STEP) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
  }
  syncCar();
  if (!paused) updateCamera(dt);
  if (now > toastUntil) $('toast').hidden = true;
  updateUI();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
