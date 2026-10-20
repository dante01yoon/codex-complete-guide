import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, TRACK, TAU, trackPoint, trackAngle, isOnTrack, formatTime } from '../race.js';

function drive(race, from, to, seconds = 20, offset = 0) {
  const steps = Math.ceil(Math.abs(to - from) / 0.015);
  for (let i = 1; i <= steps; i++) {
    race.update(seconds / steps, trackPoint(from + (to - from) * i / steps, offset));
  }
}

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
}

test('rendering and track bounds share the same ellipse at every angle', () => {
  for (let i = 0; i < 64; i++) {
    const angle = i / 64 * TAU;
    assert.equal(isOnTrack(trackPoint(angle)), true);
    assert.equal(isOnTrack(trackPoint(angle, TRACK.halfWidth - 0.01)), true);
    assert.equal(isOnTrack(trackPoint(angle, -TRACK.halfWidth + 0.01)), true);
    assert.equal(isOnTrack(trackPoint(angle, TRACK.halfWidth + 0.01)), false);
    assert.equal(isOnTrack(trackPoint(angle, -TRACK.halfWidth - 0.01)), false);
    close(trackAngle(trackPoint(angle)), angle);
  }
});

test('three forward laps finish the race and freeze timing', () => {
  const race = new Race(null);
  race.start(trackPoint(0));
  for (let lap = 0; lap < 3; lap++) {
    drive(race, 0, TAU, 20 + lap);
    assert.equal(race.lapTimes.length, lap + 1);
    assert.equal(race.lap, Math.min(lap + 2, 3));
  }
  assert.equal(race.phase, 'finished');
  assert.equal(race.progress, 1);
  close(race.elapsed, 63);
  close(race.best, 20);
  race.update(100, trackPoint(Math.PI));
  close(race.elapsed, 63);
  assert.equal(race.lapTimes.length, 3);
});

test('oscillating across the start line cannot count a lap', () => {
  const race = new Race(null);
  race.start(trackPoint(-0.1));
  for (let i = 0; i < 10; i++) {
    drive(race, -0.1, 0.1, 1);
    drive(race, 0.1, -0.1, 1);
  }
  assert.equal(race.nextCheckpoint, 1);
  assert.deepEqual(race.lapTimes, []);
});

test('reverse laps cannot advance checkpoints', () => {
  const race = new Race(null);
  race.start(trackPoint(0));
  drive(race, 0, -TAU * 3, 60);
  assert.equal(race.nextCheckpoint, 1);
  assert.deepEqual(race.lapTimes, []);
});

test('skipped gates and an infield shortcut cannot complete a lap', () => {
  const race = new Race(null);
  race.start(trackPoint(0));
  drive(race, 0, Math.PI / 2, 5);
  const expectedGate = race.nextCheckpoint;
  race.update(1, { x: 0, z: 0 });
  race.update(1, trackPoint(Math.PI * 1.5));
  drive(race, Math.PI * 1.5, TAU, 5);
  assert.equal(race.nextCheckpoint, expectedGate);
  assert.deepEqual(race.lapTimes, []);
});

test('off-road gate crossings require returning and crossing on the road', () => {
  const race = new Race(null);
  race.start(trackPoint(0));
  drive(race, 0, 0.3, 1);
  race.update(0.1, trackPoint(0.3, 15));
  drive(race, 0.3, 0.5, 1, 15);
  race.update(0.1, trackPoint(0.5));
  assert.equal(race.nextCheckpoint, 1);
  drive(race, 0.5, 0.3, 1);
  drive(race, 0.3, 0.5, 1);
  assert.equal(race.nextCheckpoint, 2);
});

test('teleporting over the circuit is not a valid gate crossing', () => {
  const race = new Race(null);
  race.start(trackPoint(0));
  for (let i = 1; i <= 12; i++) race.update(0.016, trackPoint(i * Math.PI / 2));
  assert.equal(race.nextCheckpoint, 1);
  assert.deepEqual(race.lapTimes, []);
});

test('crossing time is interpolated between simulation steps', () => {
  const race = new Race(null);
  race.start(trackPoint(0));
  drive(race, 0, TAU - 0.01, 20);
  const event = race.update(0.2, trackPoint(0.01));
  assert.equal(event.type, 'lap');
  close(event.time, 20.1);
  close(race.lapElapsed, 0.1);
  close(race.elapsed, 20.2);
});

test('best lap survives restart and a new Race instance', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const race = new Race(storage);
  race.start(trackPoint(0));
  drive(race, 0, TAU, 18);
  race.reset();
  assert.equal(race.phase, 'ready');
  assert.deepEqual(race.lapTimes, []);
  close(race.best, 18);
  const nextRace = new Race(storage);
  close(nextRace.best, 18);
  nextRace.start(trackPoint(0));
  drive(nextRace, 0, TAU, 24);
  close(nextRace.best, 18);
  close(new Race(storage).best, 18);
});

test('unavailable or corrupt storage does not prevent racing', () => {
  for (const value of ['garbage', 'Infinity', '-10', '0', 'null', '']) {
    assert.equal(new Race({ getItem: () => value }).best, null);
  }
  const storage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const race = new Race(storage);
  race.start(trackPoint(0));
  drive(race, 0, TAU, 20);
  close(race.best, 20);
  assert.equal(race.storageAvailable, false);
});

test('waiting at the start and invalid updates do not run the timer', () => {
  const race = new Race(null);
  race.update(5, trackPoint(0));
  assert.equal(race.elapsed, 0);
  race.start(trackPoint(0));
  race.update(NaN, trackPoint(0));
  race.update(-1, trackPoint(0));
  race.update(0, trackPoint(0));
  assert.equal(race.elapsed, 0);
});

test('time formatting handles missing records and minute boundaries', () => {
  assert.equal(formatTime(null), '--:--.---');
  assert.equal(formatTime(NaN), '--:--.---');
  assert.equal(formatTime(-1), '--:--.---');
  assert.equal(formatTime(0), '00:00.000');
  assert.equal(formatTime(61.2349), '01:01.234');
});
