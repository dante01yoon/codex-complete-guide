import { resolve } from 'node:path';
import { BookingError } from './storage.js';
/** Environment is operator-owned configuration, never tool input. */
export function trustedEnvironment() {
  const root = resolve(process.env.EV_BOOKING_ROOT ?? process.cwd());
  const injected = process.env.EV_BOOKING_NOW_MS;
  const now = injected === undefined ? () => Date.now() : () => Number(injected);
  if (!Number.isSafeInteger(now())) throw new BookingError('INVALID_ARGUMENTS');
  return { projectRoot: root,
    sourceDataDir: resolve(process.env.EV_BOOKING_SOURCE_DATA_DIR ?? resolve(root, '../ev-map/data')),
    actorId: process.env.EV_BOOKING_ACTOR_ID ?? 'test-driver-1',
    linkBaseUrl: process.env.EV_BOOKING_LINK_BASE_URL ?? 'http://127.0.0.1:5180', now };
}
