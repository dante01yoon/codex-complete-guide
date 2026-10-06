import test from 'node:test';
import assert from 'node:assert/strict';
import { makeColumns, decodeStation, HEIGHT_PER_CHARGER } from '../web/src/data.js';

test('stacked segments exactly represent charger counts and total height', () => {
  const station = decodeStation(['S1', 'name', 'address', 127, 37.5, [2, 3, 0, 1], '']);
  const result = makeColumns([station]);
  assert.equal(result.features.length, 3);
  assert.deepEqual(result.features.map(f => [f.properties.state, f.properties.base, f.properties.height]), [
    [0, 0, 2 * HEIGHT_PER_CHARGER],
    [1, 2 * HEIGHT_PER_CHARGER, 5 * HEIGHT_PER_CHARGER],
    [3, 5 * HEIGHT_PER_CHARGER, 6 * HEIGHT_PER_CHARGER],
  ]);
  assert.equal(station.total, 6);
  for (const feature of result.features) {
    const ring = feature.geometry.coordinates[0];
    assert.deepEqual(ring[0], ring.at(-1));
  }
});

test('missing coordinates never create a column at zero or a non-finite point', () => {
  assert.equal(makeColumns([decodeStation(['S2', '', '', null, null, [1, 0, 0, 0], ''])]).features.length, 0);
});
