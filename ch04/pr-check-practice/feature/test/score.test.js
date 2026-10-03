import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScore, recordResult, resetScore } from '../src/score.js';

test('X가 이기면 X 점수가 1 오른다', () => {
  const score = recordResult(createScore(), ['X', 'X', 'X', 'O', 'O', null, null, null, null]);
  assert.deepEqual(score, { X: 1, O: 0, draw: 0 });
});

test('게임이 끝나지 않았으면 점수가 바뀌지 않는다', () => {
  const score = recordResult(createScore(), ['X', 'O', null, null, null, null, null, null, null]);
  assert.deepEqual(score, { X: 0, O: 0, draw: 0 });
});

test('점수 초기화', () => {
  assert.deepEqual(resetScore(), { X: 0, O: 0, draw: 0 });
});
