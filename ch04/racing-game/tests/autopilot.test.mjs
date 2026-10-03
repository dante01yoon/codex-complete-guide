import test from 'node:test';
import assert from 'node:assert/strict';
import { isAutopilotEnabled, updateAutopilot } from '../autopilot.js';
import { createCarState } from '../car.js';
import { TRACK } from '../track.js';
import { Race } from '../race.js';

test('autopilot requires the explicit query value 1', () => {
  for (const search of ['', '?autopilot', '?autopilot=0', '?autopilot=true', '?other=1']) {
    assert.equal(isAutopilotEnabled(search), false);
  }
  assert.equal(isAutopilotEnabled('?autopilot=1'), true);
  assert.equal(isAutopilotEnabled('?other=x&autopilot=1'), true);
});

test('autopilot stays on the centerline, faces forward, and completes three ordered laps', () => {
  const car = createCarState();
  const race = new Race(null); race.start();
  const visited = new Set();
  for (let i = 0; i < 120 * 90 && race.state === 'racing'; i++) {
    const previous = { x: car.x, z: car.z };
    updateAutopilot(car, 1 / 120);
    assert.ok(Math.abs((car.x / TRACK.centerA) ** 2 + (car.z / TRACK.centerB) ** 2 - 1) < 1e-12);
    assert.equal(car.onTrack, true);
    assert.ok(car.speed > 0 && car.speed <= 20);
    const dx = car.x - previous.x, dz = car.z - previous.z;
    assert.ok(dx * Math.sin(car.heading) + dz * Math.cos(car.heading) > 0);
    visited.add(`${Math.sign(car.x)},${Math.sign(car.z)}`);
    race.update(1 / 120, previous, car);
  }
  assert.equal(visited.size, 4);
  assert.equal(race.state, 'finished');
  assert.equal(race.lapTimes.length, 3);
  assert.equal(race.lapValid, true);
  assert.equal(race.storage, null);
  assert.ok(car.wheelTravel > 900);
});
