import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from './supabase'

type Member = { user_id: string; email: string; role: 'owner' | 'member' }
export default function Members({ boardId, userId }: { boardId: string; userId: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    if (!supabase) return
    const { data, error: failure } = await supabase.rpc('list_board_members', { p_board_id: boardId })
    if (failure) { setError('멤버 목록을 불러오지 못했습니다.'); return }
    setMembers(data as Member[])
  }, [boardId])
  useEffect(() => { void load() }, [load])
  const owner = members.some(member => member.user_id === userId && member.role === 'owner')
  async function invite(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy || !email.trim()) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: failure } = await supabase.rpc('invite_board_member', { p_board_id: boardId, p_email: email.trim() })
      if (failure) {
        setError(failure.message === 'Only the board owner can invite members'
          ? '보드 owner만 초대할 수 있습니다.' : '초대하지 못했습니다. 가입한 이메일인지 확인해 주세요.')
        return
      }
      setMessage(data ? '보드 멤버로 초대했어요.' : '이미 보드 멤버입니다.')
      setEmail(''); await load()
    } catch { setError('초대 연결에 실패했습니다. 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }
  async function remove(memberId: string) {
    if (!supabase || busy || !owner) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: failure } = await supabase.rpc('remove_board_member', {
        p_board_id: boardId, p_user_id: memberId,
      })
      if (failure) { setError('멤버를 내보내지 못했습니다. owner 권한과 연결을 확인해 주세요.'); return }
      setMessage(data ? '보드에서 멤버를 내보냈어요.' : '이미 보드 멤버가 아닙니다.')
      await load()
    } catch { setError('멤버 내보내기에 실패했습니다. 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }
  return <section className="members-panel" aria-label="보드 멤버">
    <div className="members-heading"><h2>보드 멤버</h2><button className="text-button" onClick={() => void load()} disabled={busy}>멤버 목록 갱신</button></div>
    <ul className="member-list">{members.map(member => <li key={member.user_id}><span>{member.email}</span><span className="member-role">{member.role}</span>
      {owner && member.role === 'member' && <button className="text-button" disabled={busy}
        aria-label={member.email + ' 내보내기'} onClick={() => void remove(member.user_id)}>내보내기</button>}
    </li>)}</ul>
    {owner && <form onSubmit={invite} className="invite-form"><label htmlFor="invite-email">가입한 이메일로 초대</label><div><input id="invite-email" type="email" placeholder="팀원의 이메일" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /><button className="primary-button" disabled={busy || !email.trim()}>{busy ? '초대 중…' : '멤버 초대'}</button></div></form>}
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
  </section>
}
