import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  pointerWithin, closestCorners, useDroppable, type DragEndEvent, type CollisionDetection,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from './supabase'
import { destinationIndex } from './order'
import type { Board, Card, Column } from './types'
import Members from './Members'

const collisionDetection: CollisionDetection = args => {
  const hits = pointerWithin(args)
  const cards = hits.filter(hit => String(hit.id).startsWith('card:'))
  return cards.length ? cards : hits.length ? hits : closestCorners(args)
}

function CardItem({ card, disabled }: { card: Card; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: 'card:' + card.id, disabled,
  })
  return <article ref={setNodeRef} className={'card' + (isDragging ? ' dragging' : '')}
    style={{ transform: CSS.Transform.toString(transform), transition }}
    data-card-id={card.id} aria-label={card.title}>
    <button className="drag-handle" {...attributes} {...listeners} aria-label={card.title + ' 이동'} disabled={disabled}>
      <svg width="16" height="22" viewBox="0 0 16 22" aria-hidden="true">
        {[5, 11, 17].flatMap(y => [4, 11].map(x => <circle key={x + ':' + y} cx={x} cy={y} r="2" />))}
      </svg>
    </button>
    <span className="card-title">{card.title}</span>
  </article>
}

function ColumnLane({ column, cards, disabled, onAdd }: {
  column: Column; cards: Card[]; disabled: boolean; onAdd: (columnId: string, title: string) => Promise<boolean>
}) {
  const [title, setTitle] = useState('')
  const { setNodeRef, isOver } = useDroppable({ id: 'column:' + column.id, disabled })
  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = title.trim()
    if (!value || disabled) return
    if (await onAdd(column.id, value)) setTitle('')
  }
  return <section className={'column tone-' + column.position} aria-label={column.name} data-column-id={column.id}>
    <header className="column-heading">
      <h2><span className="dot" />{column.name}</h2><span className="count" aria-label={cards.length + '개 카드'}>{cards.length}</span>
    </header>
    <div ref={setNodeRef} className={'card-list' + (isOver ? ' over' : '')}>
      <SortableContext items={cards.map(card => 'card:' + card.id)} strategy={verticalListSortingStrategy}>
        {cards.map(card => <CardItem key={card.id} card={card} disabled={disabled} />)}
      </SortableContext>
      {!cards.length && <p className="empty">아직 카드가 없어요</p>}
    </div>
    <form onSubmit={submit} className="add-form">
      <input aria-label={column.name + ' 카드 제목'} placeholder="카드 제목" value={title}
        onChange={event => setTitle(event.target.value)} maxLength={200} disabled={disabled} required />
      <button type="submit" disabled={disabled || !title.trim()}>추가</button>
    </form>
  </section>
}

export default function App({ selectedBoardId, userId, email, onBack, onLogout }: {
  selectedBoardId: string; userId: string; email: string; onBack: () => void; onLogout: () => void
}) {
  const [board, setBoard] = useState<Board | null>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('저장 완료')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [realtimeError, setRealtimeError] = useState('')
  const mutationLock = useRef(false)
  const requestId = useRef(0)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const load = useCallback(async () => {
    if (!supabase) throw new Error('환경 설정이 없습니다. .env.local을 확인해 주세요.')
    const currentRequest = ++requestId.current
    const boardResult = await supabase.from('boards').select('*').eq('id', selectedBoardId)
      .order('created_at').order('id').limit(1).single()
    if (boardResult.error) throw new Error('보드를 불러오지 못했습니다. 연결과 접근 정책을 확인해 주세요.')
    const foundBoard = boardResult.data as Board
    const columnResult = await supabase.from('columns').select('*').eq('board_id', foundBoard.id)
      .order('position').order('id')
    if (columnResult.error) throw new Error('컬럼을 불러오지 못했습니다.')
    const foundColumns = columnResult.data as Column[]
    let foundCards: Card[] = []
    if (foundColumns.length) {
      const cardResult = await supabase.from('cards').select('*').in('column_id', foundColumns.map(col => col.id))
        .order('position').order('id')
      if (cardResult.error) throw new Error('카드를 불러오지 못했습니다.')
      foundCards = cardResult.data as Card[]
    }
    if (currentRequest === requestId.current) {
      setBoard(foundBoard); setColumns(foundColumns); setCards(foundCards)
    }
  }, [selectedBoardId])

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { await load() } catch (cause) {
      setError(cause instanceof Error ? cause.message : '보드를 불러오지 못했습니다.')
    } finally { setLoading(false) }
  }, [load])
  useEffect(() => { void refresh() }, [refresh])

  const boardId = board?.id
  useEffect(() => {
    const client = supabase
    if (!client || !boardId) return
    let disposed = false
    let running = false
    let pending = false
    let timer: ReturnType<typeof setTimeout> | undefined
    setRealtimeStatus('connecting')

    // A move updates several rows. Coalesce the events and fetch the committed
    // order, rather than applying partial row payloads to the visible board.
    async function sync() {
      timer = undefined
      if (disposed || running) return
      running = true
      try {
        do {
          pending = false
          await load()
          if (!disposed) setRealtimeError('')
        } while (pending && !disposed)
      } catch {
        if (!disposed) setRealtimeError('실시간 변경을 불러오지 못했습니다. 새로고침해 주세요.')
      } finally {
        running = false
      }
    }
    function scheduleSync() {
      if (disposed) return
      pending = true
      if (running || timer !== undefined) return
      timer = setTimeout(() => { void sync() }, 100)
    }

    // Unfiltered table subscriptions also receive deletes; the reload itself
    // is scoped to this board. RLS controls which changes a client can receive.
    const channel = client.channel('kanban:' + boardId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, scheduleSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'columns' }, scheduleSync)
      .subscribe(status => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected')
          // Catch any changes during initial subscription or a reconnect.
          scheduleSync()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('disconnected')
        }
      })

    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      void client.removeChannel(channel)
    }
  }, [boardId, load])

  async function addCard(columnId: string, title: string) {
    if (!supabase || mutationLock.current) return false
    mutationLock.current = true; setBusy(true); setError(''); setMessage('저장 중…')
    let saved = false
    try {
      const siblings = cards.filter(card => card.column_id === columnId)
      const position = siblings.reduce((max, card) => Math.max(max, card.position), -1) + 1
      const result = await supabase.from('cards').insert({ column_id: columnId, title, position }).select().single()
      if (result.error) throw new Error('카드를 추가하지 못했습니다. 연결 상태를 확인해 주세요.')
      saved = true
      const insertedCard = result.data as Card
      setCards(previous => [...previous.filter(card => card.id !== insertedCard.id), insertedCard])
      await load()
      setMessage('카드를 추가했어요')
    } catch (cause) {
      setError(saved ? '카드는 저장됐지만 목록 갱신에 실패했습니다. 새로고침해 주세요.'
        : cause instanceof Error ? cause.message : '카드를 추가하지 못했습니다.')
      setMessage(saved ? '목록 확인 필요' : '저장 실패')
    } finally { mutationLock.current = false; setBusy(false) }
    return saved
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    if (!supabase || mutationLock.current || !event.over || event.active.id === event.over.id) return
    const cardId = String(event.active.id).slice(5)
    const movingCard = cards.find(card => card.id === cardId)
    if (!movingCard) return
    const overId = String(event.over.id)
    const hoveredCard = overId.startsWith('card:') ? cards.find(card => card.id === overId.slice(5)) : null
    const targetColumnId = hoveredCard?.column_id ?? (overId.startsWith('column:') ? overId.slice(7) : null)
    if (!targetColumnId || !columns.some(col => col.id === targetColumnId)) return
    const index = destinationIndex(cards, cardId, movingCard.column_id, targetColumnId, hoveredCard?.id ?? null)
    mutationLock.current = true; setBusy(true); setError(''); setMessage('저장 중…')
    let saved = false
    try {
      const result = await supabase.rpc('move_kanban_card', {
        p_card_id: cardId, p_column_id: targetColumnId, p_position: index,
      })
      if (result.error) throw new Error('카드 이동을 저장하지 못했습니다. 다시 시도해 주세요.')
      saved = true
      await load(); setMessage('이동한 순서를 저장했어요')
    } catch (cause) {
      setError(saved ? '이동은 저장됐지만 목록 갱신에 실패했습니다. 새로고침해 주세요.'
        : cause instanceof Error ? cause.message : '카드 이동을 저장하지 못했습니다.')
      setMessage(saved ? '목록 확인 필요' : '저장 실패')
    } finally { mutationLock.current = false; setBusy(false) }
  }

  const activeCard = cards.find(card => card.id === activeId)
  return <>
    <nav className="topbar" aria-label="앱"><div className="brand"><span className="brand-mark" />팀 칸반</div>
      <div className="header-status">
        <span className={'save-status' + (error ? ' failed' : '')} role="status" aria-live="polite">{busy ? '저장 중…' : message}</span>
        <span className={'realtime-status ' + realtimeStatus} role="status" aria-live="polite">
          <span className="connection-dot" aria-hidden="true" />
          {realtimeStatus === 'connected' ? '실시간 연결됨' : realtimeStatus === 'connecting' ? '실시간 연결 중…' : '실시간 연결 끊김'}
        </span>
      </div>
    </nav>
    <main>
      <div className="account-row"><span>{email}</span><div><button className="text-button" onClick={onBack}>보드 목록</button><button className="text-button" onClick={onLogout} disabled={busy}>로그아웃</button></div></div>
      <div className="intro"><h1>{board?.name ?? '우리 팀 보드'}</h1><p className="subtitle">함께 정리하고, 하나씩 완성해요.</p></div>
      {board && <Members boardId={board.id} userId={userId} />}
      <div className="toolbar"><p>카드를 끌어 컬럼과 순서를 바꿔 보세요.</p>
        <button className="refresh" onClick={() => void refresh()} disabled={loading || busy || activeId !== null}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.5 7M20 4v7h-7" /></svg>
          새로고침
        </button>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {realtimeError && <div className="error" role="alert">{realtimeError}</div>}
      {loading && !board ? <p className="loading" role="status">보드를 불러오는 중…</p> :
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={event => {
          setActiveId(String(event.active.id).slice(5))
        }} onDragCancel={() => setActiveId(null)} onDragEnd={event => void onDragEnd(event)}>
          <div className="board" aria-label="칸반 보드">
            {columns.map(column => <ColumnLane key={column.id} column={column}
              cards={cards.filter(card => card.column_id === column.id)} disabled={busy || loading}
              onAdd={addCard} />)}
          </div>
          <DragOverlay>{activeCard ? <div className="card overlay"><span className="card-title">{activeCard.title}</span></div> : null}</DragOverlay>
        </DndContext>}
    </main>
  </>
}
