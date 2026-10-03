import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWinner, isDraw } from '../src/board.js';

test('가로줄을 완성하면 승리', () => {
  assert.equal(getWinner(['X', 'X', 'X', 'O', 'O', null, null, null, null]), 'X');
});

test('칸이 모두 찼고 승자가 없으면 무승부', () => {
  assert.equal(isDraw(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), true);
});
