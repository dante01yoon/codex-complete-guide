import { CAR } from './car.js';
import { TRACK, trackPoint, isOnTrack } from './track.js';

export function isAutopilotEnabled(search) {
  return new URLSearchParams(search).get('autopilot') === '1';
}

// A deterministic visual test driver; normal keyboard physics stays in updateCar.
export function updateAutopilot(car, dt) {
  car.speed = Math.min(20, car.speed + CAR.acceleration * dt);
  const travel = car.speed * dt;
  const angle = Math.atan2(car.z / TRACK.centerB, car.x / TRACK.centerA);
  const tangentLength = Math.hypot(TRACK.centerA * Math.sin(angle), TRACK.centerB * Math.cos(angle));
  const nextAngle = angle + travel / tangentLength;
  const point = trackPoint(nextAngle);
  car.x = point.x;
  car.z = point.z;
  car.heading = Math.atan2(-TRACK.centerA * Math.sin(nextAngle), TRACK.centerB * Math.cos(nextAngle));
  car.steering = -.35;
  car.wheelTravel += travel;
  car.onTrack = isOnTrack(car);
}
