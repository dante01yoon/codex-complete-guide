export const TRACK = Object.freeze({
  radiusX: 84,
  radiusZ: 52,
  halfWidth: 7.5,
  laps: 3,
  checkpoints: 16,
});

export const TAU = Math.PI * 2;
const CHECKPOINT_ANGLE = TAU / TRACK.checkpoints;
const STORAGE_KEY = 'oval-club.best-lap.v1';

export function trackPoint(angle, offset = 0) {
  return {
    x: (TRACK.radiusX + offset) * Math.cos(angle),
    z: -(TRACK.radiusZ + offset) * Math.sin(angle),
  };
}

export function trackAngle({ x, z }) {
  return (Math.atan2(-z / TRACK.radiusZ, x / TRACK.radiusX) + TAU) % TAU;
}

export function isOnTrack({ x, z }) {
  const outer = (x / (TRACK.radiusX + TRACK.halfWidth)) ** 2
    + (z / (TRACK.radiusZ + TRACK.halfWidth)) ** 2;
  const inner = (x / (TRACK.radiusX - TRACK.halfWidth)) ** 2
    + (z / (TRACK.radiusZ - TRACK.halfWidth)) ** 2;
  return outer <= 1 && inner >= 1;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.---';
  const milliseconds = Math.floor(seconds * 1000);
  const minutes = Math.floor(milliseconds / 60000);
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}

function defaultStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export class Race {
  constructor(storage = defaultStorage()) {
    this.storage = storage;
    this.best = null;
    this.storageAvailable = Boolean(storage);
    try {
      const saved = Number(storage?.getItem(STORAGE_KEY));
      if (Number.isFinite(saved) && saved > 0) this.best = saved;
    } catch {
      this.storageAvailable = false;
    }
    this.reset();
  }

  reset() {
    this.phase = 'ready';
    this.elapsed = 0;
    this.lapElapsed = 0;
    this.lapTimes = [];
    this.nextCheckpoint = 1;
    this.previous = null;
    this.newBest = false;
  }

  get lap() { return Math.min(this.lapTimes.length + 1, TRACK.laps); }

  get progress() {
    return this.phase === 'finished' ? 1
      : (this.lapTimes.length + (this.nextCheckpoint - 1) / TRACK.checkpoints) / TRACK.laps;
  }

  start(position) {
    if (this.phase !== 'ready') return;
    this.phase = 'racing';
    this.previous = { angle: trackAngle(position), onTrack: isOnTrack(position) };
  }

  update(dt, position) {
    if (this.phase !== 'racing' || !Number.isFinite(dt) || dt <= 0) return null;
    const current = { angle: trackAngle(position), onTrack: isOnTrack(position) };
    const previous = this.previous ?? current;
    this.previous = current;

    // Signed angular change rejects reversing and implausible position jumps.
    const delta = (current.angle - previous.angle + Math.PI * 3) % TAU - Math.PI;
    const gateAngle = (this.nextCheckpoint % TRACK.checkpoints) * CHECKPOINT_ANGLE;
    const toGate = (gateAngle - previous.angle + TAU) % TAU;
    const crossed = previous.onTrack && current.onTrack && delta > 0 && delta < CHECKPOINT_ANGLE
      && toGate > 0 && toGate <= delta + 1e-9;

    if (!crossed || this.nextCheckpoint !== TRACK.checkpoints) {
      this.elapsed += dt;
      this.lapElapsed += dt;
      if (crossed) this.nextCheckpoint += 1;
      return null;
    }

    // Split the simulation step at the finish line so lap timing is frame independent.
    const fraction = Math.min(1, toGate / delta);
    const time = this.lapElapsed + dt * fraction;
    this.lapTimes.push(time);
    const isBest = this.best === null || time < this.best;
    if (isBest) {
      this.best = time;
      this.newBest = true;
      try { this.storage?.setItem(STORAGE_KEY, String(time)); }
      catch { this.storageAvailable = false; }
    }

    if (this.lapTimes.length === TRACK.laps) {
      this.elapsed += dt * fraction;
      this.lapElapsed = time;
      this.phase = 'finished';
      return { type: 'finish', time, isBest };
    }

    this.elapsed += dt;
    this.lapElapsed = dt * (1 - fraction);
    this.nextCheckpoint = 1;
    return { type: 'lap', time, isBest };
  }
}
