import test from 'node:test'
import assert from 'node:assert/strict'
import { destinationIndex } from '../src/order.ts'

const cards = [
  { id: 'a', column_id: 'todo', position: 0 },
  { id: 'b', column_id: 'todo', position: 1 },
  { id: 'c', column_id: 'todo', position: 2 },
  { id: 'd', column_id: 'doing', position: 0 },
]
test('same column upward and downward drops use final sortable index', () => {
  assert.equal(destinationIndex(cards, 'c', 'todo', 'todo', 'a'), 0)
  assert.equal(destinationIndex(cards, 'a', 'todo', 'todo', 'c'), 2)
})
test('cross-column drop inserts before hovered card', () => {
  assert.equal(destinationIndex(cards, 'a', 'todo', 'doing', 'd'), 0)
})
test('empty lane and lane whitespace append correctly', () => {
  assert.equal(destinationIndex(cards, 'a', 'todo', 'done', null), 0)
  assert.equal(destinationIndex(cards, 'a', 'todo', 'todo', null), 2)
  assert.equal(destinationIndex(cards, 'a', 'todo', 'doing', null), 1)
})
