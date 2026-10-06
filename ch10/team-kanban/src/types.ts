export type Board = { id: string; name: string; description: string; created_at: string }
export type Column = { id: string; board_id: string; name: string; position: number; created_at: string }
export type Card = { id: string; column_id: string; title: string; description: string; position: number; created_at: string }
