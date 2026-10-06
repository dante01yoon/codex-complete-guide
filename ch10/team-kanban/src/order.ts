import type { Card } from './types'

/** Derive the final destination index after removing the dragged card. */
export function destinationIndex(
  cards: Pick<Card, 'id' | 'column_id'>[],
  activeId: string,
  sourceColumn: string,
  targetColumn: string,
  overId: string | null,
) {
  const target = cards.filter(card => card.column_id === targetColumn)
  if (overId === null) return target.filter(card => card.id !== activeId).length
  const index = target.findIndex(card => card.id === overId)
  if (index < 0) return target.filter(card => card.id !== activeId).length
  // Moving downward places the card after the hovered card.
  if (sourceColumn === targetColumn) return index
  return target.filter(card => card.id !== activeId).findIndex(card => card.id === overId)
}
