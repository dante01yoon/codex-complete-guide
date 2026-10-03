import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, trackPoint, isOnTrack, getGate, crossGate } from '../track.js';
import { CAR, createCarState, updateCar, KeyboardInput } from '../car.js';
import { Race, RECORD_KEY, formatTime } from '../race.js';

const storage = (initial = null) => {
  let value = initial;
  return { getItem: () => value, setItem: (key, saved) => { assert.equal(key, RECORD_KEY); value = saved; } };
};
const gateCrossing = (index, backwards = false) => {
  const { center, tangent } = getGate(index);
  const sign = backwards ? -1 : 1;
  return [{ x: center.x - sign * tangent.x, z: center.z - sign * tangent.z }, { x: center.x + sign * tangent.x, z: center.z + sign * tangent.z }];
};
const cross = (race, index, backwards = false) => race.update(1, ...gateCrossing(index, backwards));
const lap = (race) => { for (const gate of [1, 2, 3]) cross(race, gate); return cross(race, 0); };

test('road includes its edges and excludes both infield and outside grass', () => {
  assert.ok(isOnTrack(createCarState()));
  assert.ok(isOnTrack({ x: TRACK.innerA, z: 0 }));
  assert.ok(isOnTrack({ x: 0, z: -TRACK.outerB }));
  assert.ok(!isOnTrack({ x: 0, z: 0 }));
  assert.ok(!isOnTrack({ x: TRACK.outerA + .1, z: 0 }));
  for (let i = 0; i < 100; i++) assert.ok(isOnTrack(trackPoint(i / 100 * Math.PI * 2)));
});

test('gates accept forward road crossings only and ignore the spawn point', () => {
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(crossGate(...gateCrossing(i), getGate(i)) - .5) < 1e-9);
    assert.equal(crossGate(...gateCrossing(i, true), getGate(i)), null);
  }
  assert.equal(crossGate({ x: -1, z: 0 }, { x: 1, z: 0 }, getGate(0)), null);
  assert.equal(crossGate(createCarState(), { x: 1, z: -TRACK.centerB }, getGate(0)), null);
});

test('acceleration is capped; braking stops without reversing', () => {
  const car = createCarState();
  for (let i = 0; i < 1200; i++) {
    updateCar(car, { throttle: 1 }, 1 / 120);
    car.x = 0; car.z = -TRACK.centerB;
  }
  assert.equal(car.speed, CAR.maxSpeed);
  for (let i = 0; i < 240; i++) updateCar(car, { throttle: -1 }, 1 / 120);
  assert.equal(car.speed, 0);
});

test('grass slows a fast car and still permits acceleration from a stop', () => {
  const road = createCarState(), grass = createCarState();
  road.speed = grass.speed = 25; grass.x = 200;
  for (let i = 0; i < 120; i++) {
    updateCar(road, { throttle: 1 }, 1 / 120);
    updateCar(grass, { throttle: 1 }, 1 / 120);
    road.x = 0; road.z = -TRACK.centerB;
  }
  assert.ok(grass.speed < 25 && grass.speed < road.speed);
  grass.speed = 0;
  for (let i = 0; i < 120; i++) updateCar(grass, { throttle: 1 }, 1 / 120);
  assert.ok(grass.speed > 0 && grass.speed <= CAR.offRoadMaxSpeed);
  grass.x = 0; grass.z = -TRACK.centerB;
  const slowSpeed = grass.speed;
  for (let i = 0; i < 30; i++) updateCar(grass, { throttle: 1 }, 1 / 120);
  assert.ok(grass.speed > slowSpeed);
});

test('stationary steering is disabled; left and right change heading correctly', () => {
  const still = createCarState(); updateCar(still, { steering: 1 }, .1);
  assert.equal(still.heading, Math.PI / 2);
  const left = createCarState(), right = createCarState(); left.speed = right.speed = 10;
  updateCar(left, { steering: 1 }, .1); updateCar(right, { steering: -1 }, .1);
  assert.ok(left.heading > Math.PI / 2 && right.heading < Math.PI / 2);
});

test('fixed physics steps give the same movement at 30Hz and 144Hz', () => {
  function run(fps) {
    const car = createCarState(); let accumulator = 0;
    for (let frame = 0; frame < fps * 3; frame++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-12 >= 1 / 120) {
        updateCar(car, { throttle: 1, steering: -.35 }, 1 / 120);
        accumulator -= 1 / 120;
      }
    }
    return car;
  }
  const a = run(30), b = run(144);
  for (const key of ['x', 'z', 'speed', 'heading']) assert.ok(Math.abs(a[key] - b[key]) < 1e-9);
});

test('WASD and arrows share inputs; opposing inputs cancel and blur clears them', () => {
  const target = new EventTarget();
  const input = new KeyboardInput(target);
  const send = (type, code) => { const event = new Event(type, { cancelable: true }); event.code = code; target.dispatchEvent(event); return event; };
  assert.ok(send('keydown', 'KeyW').defaultPrevented);
  send('keydown', 'ArrowUp'); send('keydown', 'KeyA');
  assert.deepEqual(input.read(), { throttle: 1, steering: 1 });
  send('keydown', 'KeyS'); send('keydown', 'ArrowRight');
  assert.deepEqual(input.read(), { throttle: 0, steering: 0 });
  send('keyup', 'KeyW'); send('keyup', 'KeyS');
  assert.equal(input.read().throttle, 1);
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(input.read(), { throttle: 0, steering: 0 });
  input.dispose();
});

test('three ordered laps finish once, with fractional finish timing', () => {
  const race = new Race(storage()); race.start();
  assert.equal(lap(race).type, 'lap'); assert.equal(race.currentLap, 2);
  assert.equal(lap(race).type, 'lap'); assert.equal(race.currentLap, 3);
  assert.equal(lap(race).type, 'finish'); assert.equal(race.state, 'finished');
  assert.deepEqual(race.lapTimes, [3.5, 4, 4]);
  assert.equal(race.elapsed, 11.5); assert.equal(race.currentLap, 3);
  assert.equal(race.records.lapSeconds, 3.5); assert.equal(race.records.raceSeconds, 11.5);
  lap(race); assert.equal(race.elapsed, 11.5); assert.equal(race.lapTimes.length, 3);
});

test('continuous ellipse driving counts exactly three complete laps', () => {
  const race = new Race(storage()); race.start();
  let previous = trackPoint(TRACK.startAngle);
  for (let step = 1; step <= 3601 && race.state !== 'finished'; step++) {
    const current = trackPoint(TRACK.startAngle + step / 1200 * 2 * Math.PI);
    race.update(1 / 120, previous, current); previous = current;
  }
  assert.equal(race.state, 'finished'); assert.equal(race.lapTimes.length, 3);
  assert.ok(Math.abs(race.elapsed - 30) < .02);
});

test('spawn movement, start-line shuttling, reverse and missing gates never award a lap', () => {
  const race = new Race(); race.start();
  race.update(1, createCarState(), { x: 1, z: -TRACK.centerB });
  for (let i = 0; i < 6; i++) { cross(race, 0, true); cross(race, 0); }
  for (const gate of [1, 2, 3, 0]) cross(race, gate, true);
  cross(race, 2); cross(race, 3); cross(race, 0);
  assert.equal(race.lapTimes.length, 0);
});

test('grass invalidates shortcuts; start-line recovery retains the time penalty', () => {
  const race = new Race(storage()); race.start(); cross(race, 1);
  race.update(2, { x: 0, z: 0 }, { x: 1, z: 0 });
  assert.equal(race.lapValid, false);
  cross(race, 2); cross(race, 3);
  assert.equal(cross(race, 0).type, 'retry');
  assert.equal(race.lapTimes.length, 0); assert.equal(race.lapValid, true);
  const penalty = race.elapsed;
  lap(race); assert.ok(race.lapTimes[0] > penalty);
});

test('pausing freezes time and checkpoints; restart preserves records', () => {
  const race = new Race(storage()); race.start(); lap(race); const record = race.records.lapSeconds;
  race.pause(); const elapsed = race.elapsed;
  cross(race, 1); race.addTime(20);
  assert.equal(race.elapsed, elapsed); assert.equal(race.nextGate, 1);
  race.resume(); cross(race, 1); assert.equal(race.nextGate, 2);
  race.start(); assert.equal(race.elapsed, 0); assert.equal(race.nextGate, 1);
  assert.equal(race.records.lapSeconds, record); assert.equal(race.records.raceSeconds, null);
});

test('records persist, slower laps never overwrite, and unfinished races do not save total times', () => {
  const store = storage(); const race = new Race(store); race.start(); lap(race);
  const first = race.records.lapSeconds; race.addTime(10); lap(race);
  assert.equal(race.records.lapSeconds, first);
  assert.equal(new Race(store).records.lapSeconds, first);
  assert.equal(new Race(store).records.raceSeconds, null);
  lap(race); assert.equal(new Race(store).records.raceSeconds, race.elapsed);
});

test('corrupt or unavailable storage cannot interrupt the game', () => {
  const bad = new Race(storage('{broken')); assert.equal(bad.records.lapSeconds, null);
  const invalid = new Race(storage(JSON.stringify({ lapSeconds: -1, raceSeconds: 'fast' })));
  assert.deepEqual(invalid.records, { lapSeconds: null, raceSeconds: null });
  const blocked = new Race({ getItem() { throw Error('Blocked'); }, setItem() { throw Error('Blocked'); } });
  blocked.start(); lap(blocked); lap(blocked); lap(blocked);
  assert.equal(blocked.state, 'finished'); assert.equal(blocked.storageUnavailable, true);
  assert.ok(blocked.records.lapSeconds > 0);
});

test('time formatting handles absent values and minute boundaries', () => {
  assert.equal(formatTime(null), '—'); assert.equal(formatTime(undefined), '—');
  assert.equal(formatTime(0), '00:00.000'); assert.equal(formatTime(61.234), '01:01.234');
  assert.equal(formatTime(59.9999), '00:59.999'); assert.equal(formatTime(60), '01:00.000');
});
