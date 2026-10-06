import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import AuthPanel from './AuthPanel'
import Kanban from './App'
import type { Board } from './types'

function Boards({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [boards, setBoards] = useState<Board[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    async function load() {
      if (!supabase) return
      const memberships = await supabase.from('board_members').select('board_id').eq('user_id', session.user.id)
      if (memberships.error) { if (!disposed) { setError('보드 목록을 불러오지 못했습니다.'); setLoading(false) } return }
      const ids = memberships.data.map(member => member.board_id)
      const result = ids.length ? await supabase.from('boards').select('*').in('id', ids).order('created_at') : { data: [], error: null }
      if (!disposed) {
        if (result.error) setError('보드 목록을 불러오지 못했습니다.')
        else { setBoards(result.data as Board[]); setSelected(result.data?.[0]?.id ?? null) }
        setLoading(false)
      }
    }
    void load()
    return () => { disposed = true }
  }, [session.user.id])
  async function create(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy || !name.trim()) return
    setBusy(true); setError('')
    try {
      const result = await supabase.rpc('create_team_board', { p_name: name.trim() })
      if (result.error) { setError('보드를 만들지 못했습니다.'); return }
      const found = await supabase.from('boards').select('*').eq('id', result.data).single()
      if (found.error) { setError('보드는 생성됐지만 목록을 읽지 못했습니다. 다시 로그인해 주세요.'); return }
      setBoards(previous => [...previous, found.data as Board]); setName(''); setSelected(found.data.id)
    } catch { setError('연결에 실패했습니다. 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }
  if (selected) return <Kanban key={selected} selectedBoardId={selected} userId={session.user.id}
    email={session.user.email ?? ''} onBack={() => setSelected(null)} onLogout={onLogout} />
  return <>
    <nav className="topbar"><div className="brand"><span className="brand-mark" />팀 칸반</div><button className="text-button" onClick={onLogout}>로그아웃</button></nav>
    <main className="directory"><p className="auth-description">{session.user.email}</p><h1>내 보드</h1>
      {loading ? <p role="status">보드 목록을 불러오는 중…</p> : <div className="board-links">
        {boards.length ? boards.map(board => <button key={board.id} onClick={() => setSelected(board.id)}>{board.name}<span>열기 →</span></button>) : <p>아직 참여한 보드가 없어요. 새 보드를 만들어 보세요.</p>}
      </div>}
      <form onSubmit={create} className="create-board-form"><label htmlFor="board-name">새 보드 이름</label><input id="board-name" value={name} onChange={e => setName(e.target.value)} required maxLength={100} disabled={busy} /><button className="primary-button" disabled={busy || loading || !name.trim()}>{busy ? '만드는 중…' : '보드 만들기'}</button></form>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  </>
}

export default function SessionApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession); setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])
  async function logout() {
    if (!supabase) return
    const { error: failure } = await supabase.auth.signOut()
    if (failure) setError('로그아웃하지 못했습니다. 다시 시도해 주세요.')
    else setError('')
  }
  if (!ready) return <p className="loading" role="status">로그인 상태를 확인하는 중…</p>
  if (!session) return <AuthPanel />
  return <>{error && <p className="error" role="alert">{error}</p>}<Boards key={session.user.id} session={session} onLogout={() => void logout()} /></>
}
