import { getGate, crossGate, isOnTrack } from './track.js';

export const RECORD_KEY = 'oval-racing.records.v1';
export const TOTAL_LAPS = 3;

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const milliseconds = Math.floor(seconds * 1000 + 1e-7);
  const minutes = Math.floor(milliseconds / 60000);
  const wholeSeconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}

export class Race {
  constructor(storage = null) {
    this.storage = storage;
    this.records = { lapSeconds: null, raceSeconds: null };
    this.storageUnavailable = !storage;
    try {
      const saved = JSON.parse(storage?.getItem(RECORD_KEY) || 'null');
      for (const key of ['lapSeconds', 'raceSeconds']) {
        if (Number.isFinite(saved?.[key]) && saved[key] > 0) this.records[key] = saved[key];
      }
    } catch { /* Invalid stored data is ignored; storage writes may still work. */ }
    this.gates = [0, 1, 2, 3].map(getGate);
    this.reset();
  }
  reset() {
    this.state = 'ready'; this.paused = false; this.elapsed = 0; this.lapStartedAt = 0;
    this.lapTimes = []; this.nextGate = 1; this.lapValid = true;
    this.newLapRecord = false; this.newRaceRecord = false;
  }
  start() { this.reset(); this.state = 'racing'; }
  pause() { if (this.state === 'racing') this.paused = true; }
  resume() { this.paused = false; }
  get currentLap() { return Math.min(this.lapTimes.length + 1, TOTAL_LAPS); }
  get currentLapTime() {
    return this.state === 'finished' ? this.lapTimes.at(-1) : this.elapsed - this.lapStartedAt;
  }
  addTime(dt) { if (this.state === 'racing' && !this.paused) this.elapsed += dt; }
  saveRecords() {
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(RECORD_KEY, JSON.stringify(this.records));
      this.storageUnavailable = false;
    } catch { this.storageUnavailable = true; }
  }
  update(dt, previous, current) {
    if (this.state !== 'racing' || this.paused) return null;
    const beforeTime = this.elapsed;
    this.elapsed += dt;
    if (!isOnTrack(previous) || !isOnTrack(current)) this.lapValid = false;

    // A lap must visit the three checkpoints in order, then cross the start line.
    const crossing = crossGate(previous, current, this.gates[this.nextGate]);
    if (this.nextGate !== 0 && crossing !== null && this.lapValid) {
      this.nextGate = (this.nextGate + 1) % 4;
      return null;
    }
    const finishFraction = crossGate(previous, current, this.gates[0]);
    if (finishFraction === null) return null;
    if (!this.lapValid || this.nextGate !== 0) {
      this.nextGate = 1; this.lapValid = true;
      // Keep the clock running: failed attempts remain part of this lap's time.
      return { type: 'retry' };
    }
    const crossingTime = beforeTime + dt * finishFraction;
    const lapTime = crossingTime - this.lapStartedAt;
    this.lapTimes.push(lapTime);
    this.lapStartedAt = crossingTime;
    this.nextGate = 1;
    const newBest = this.records.lapSeconds === null || lapTime < this.records.lapSeconds;
    if (newBest) { this.records.lapSeconds = lapTime; this.newLapRecord = true; }
    if (this.lapTimes.length === TOTAL_LAPS) {
      this.state = 'finished'; this.elapsed = crossingTime;
      this.newRaceRecord = this.records.raceSeconds === null || crossingTime < this.records.raceSeconds;
      if (this.newRaceRecord) this.records.raceSeconds = crossingTime;
      this.saveRecords();
      return { type: 'finish', lapTime, newBest };
    }
    if (newBest) this.saveRecords();
    return { type: 'lap', lapTime, newBest, lap: this.lapTimes.length };
  }
}
