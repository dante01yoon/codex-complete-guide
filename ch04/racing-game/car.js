import { TRACK, isOnTrack } from './track.js';

export const CAR = Object.freeze({ maxSpeed: 32, offRoadMaxSpeed: 9, acceleration: 12, braking: 24, rollingDrag: 1.25, offRoadDrag: 16 });

export function createCarState() {
  return { x: 0, z: -TRACK.centerB, heading: Math.PI / 2, speed: 0, steering: 0, wheelTravel: 0, onTrack: true };
}

export function updateCar(state, input, dt) {
  const onRoad = isOnTrack(state);
  const throttle = input.throttle || 0;
  if (throttle < 0) state.speed -= CAR.braking * dt;
  else if (throttle > 0) state.speed += CAR.acceleration * (onRoad ? 1 : .7) * dt;
  else state.speed -= CAR.rollingDrag * dt;
  if (!onRoad) {
    state.speed -= Math.min(CAR.offRoadDrag, 1.8 + state.speed * .8) * dt;
    if (state.speed > CAR.offRoadMaxSpeed) state.speed -= 8 * dt;
  }
  state.speed = Math.max(0, Math.min(CAR.maxSpeed, state.speed));
  state.steering += ((input.steering || 0) - state.steering) * (1 - Math.exp(-16 * dt));
  const turnRate = 1.65 / (1 + state.speed * .018);
  state.heading += state.steering * turnRate * Math.min(1, state.speed / 6) * dt;
  state.heading = Math.atan2(Math.sin(state.heading), Math.cos(state.heading));
  const travel = state.speed * dt;
  state.x += Math.sin(state.heading) * travel;
  state.z += Math.cos(state.heading) * travel;
  state.wheelTravel += travel;
  state.onTrack = isOnTrack(state);
}

export class KeyboardInput {
  constructor(target = window) {
    this.keys = new Set();
    this.target = target;
    this.codes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    this.down = (event) => {
      if (!this.codes.has(event.code) || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
      event.preventDefault(); this.keys.add(event.code);
    };
    this.up = (event) => { if (this.codes.has(event.code)) { event.preventDefault(); this.keys.delete(event.code); } };
    this.blur = () => this.clear();
    target.addEventListener('keydown', this.down);
    target.addEventListener('keyup', this.up);
    target.addEventListener('blur', this.blur);
  }
  read() {
    const pressed = (...codes) => codes.some(code => this.keys.has(code)) ? 1 : 0;
    return {
      throttle: pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown'),
      steering: pressed('KeyA', 'ArrowLeft') - pressed('KeyD', 'ArrowRight'),
    };
  }
  clear() { this.keys.clear(); }
  dispose() {
    this.target.removeEventListener('keydown', this.down);
    this.target.removeEventListener('keyup', this.up);
    this.target.removeEventListener('blur', this.blur);
  }
}

export function createCarMesh(THREE) {
  const car = new THREE.Group();
  const body = new THREE.Group();
  car.add(body);
  const paint = new THREE.MeshStandardMaterial({ color: '#f5683f', roughness: .38, metalness: .2 });
  const trim = new THREE.MeshStandardMaterial({ color: '#213731', roughness: .55 });
  const windowMat = new THREE.MeshStandardMaterial({ color: '#3d6463', roughness: .25, metalness: .25 });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#182523', roughness: 1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#bfc6b5', metalness: .65, roughness: .35 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#f3e4c6', roughness: .6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff0cd', emissive: '#ffd08a', emissiveIntensity: .35 });
  const rearMat = new THREE.MeshStandardMaterial({ color: '#ae2a1e', emissive: '#fb3420', emissiveIntensity: .45 });
  function box(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; body.add(mesh);
    return mesh;
  }
  box(2.05, .58, 4.05, paint, 0, .7, 0);
  box(2.12, .19, 4.16, trim, 0, .42, 0);
  box(1.72, .61, 1.7, windowMat, 0, 1.24, -.32);
  box(1.84, .13, 1.65, paint, 0, 1.59, -.38);
  box(1.83, .07, 1.28, paint, 0, 1.03, 1.1);
  box(.13, .67, .14, paint, -.82, 1.26, .4);
  box(.13, .67, .14, paint, .82, 1.26, .4);
  box(.13, .67, .14, paint, -.82, 1.26, -1.08);
  box(.13, .67, .14, paint, .82, 1.26, -1.08);
  for (const x of [-.22, .22]) {
    box(.21, .018, 1.2, stripeMat, x, 1.074, 1.1);
    box(.21, .018, 1.67, stripeMat, x, 1.664, -.38);
    box(.21, .018, .61, stripeMat, x, 1.004, -1.63);
  }
  for (const x of [-.68, .68]) {
    box(.43, .2, .04, lampMat, x, .8, 2.045);
    box(.43, .16, .04, rearMat, x, .77, -2.045);
    box(.12, .35, .15, trim, x, 1.04, -1.75);
  }
  box(2.24, .11, .4, trim, 0, 1.25, -1.8);
  box(1.04, .15, .05, trim, 0, .51, 2.085);
  const wheels = [];
  for (const x of [-1.08, 1.08]) {
    for (const z of [-1.28, 1.25]) {
      const pivot = new THREE.Group(); pivot.position.set(x, .48, z); car.add(pivot);
      const wheel = new THREE.Group(); pivot.add(wheel);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, .32, 16), tireMat);
      tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .335, 8), rimMat);
      rim.rotation.z = Math.PI / 2; wheel.add(rim);
      wheels.push({ pivot, wheel, front: z > 0 });
    }
  }
  function sync(state) {
    car.position.set(state.x, .03, state.z);
    car.rotation.y = state.heading;
    body.rotation.z = state.steering * Math.min(state.speed / CAR.maxSpeed, 1) * .045;
    for (const { pivot, wheel, front } of wheels) {
      pivot.rotation.y = front ? state.steering * .4 : 0;
      wheel.rotation.x = state.wheelTravel / .46;
    }
  }
  return { mesh: car, sync };
}
