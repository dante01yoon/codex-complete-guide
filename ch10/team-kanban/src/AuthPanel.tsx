import { useState, type FormEvent } from 'react'
import { supabase } from './supabase'

export default function AuthPanel() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (mode === 'signup') {
        const { data, error: failure } = await supabase.auth.signUp({ email: email.trim(), password })
        if (failure) {
          setError('회원가입하지 못했습니다. 이메일·비밀번호를 확인하거나 잠시 후 다시 시도해 주세요.')
        } else {
          setPassword('')
          if (!data.session) setMessage('이메일로 보낸 확인 링크를 눌러 회원가입을 완료한 뒤 로그인해 주세요.')
        }
      } else {
        const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (failure) setError('로그인하지 못했습니다. 이메일·비밀번호와 이메일 확인 여부를 확인해 주세요.')
        else setPassword('')
      }
    } catch { setError('연결에 실패했습니다. 잠시 후 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }
  return <>
    <nav className="topbar" aria-label="앱"><div className="brand"><span className="brand-mark" />팀 칸반</div></nav>
    <main className="auth-page"><section className="auth-panel" aria-label={mode === 'login' ? '로그인' : '회원가입'}>
      <h1>{mode === 'login' ? '다시 만나서 반가워요' : '함께 시작해요'}</h1>
      <p className="auth-description">{mode === 'login' ? '로그인하고 우리 팀의 할 일을 이어가세요.' : '이메일과 비밀번호로 팀 칸반에 가입하세요.'}</p>
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="auth-email">이메일</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} />
        <label htmlFor="auth-password">비밀번호</label><input id="auth-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={8} required disabled={busy} />
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="notice" role="status">{message}</p>}
        {!supabase && <p className="error" role="alert">.env.local의 Supabase 연결 설정을 확인해 주세요.</p>}
        <button className="primary-button" disabled={busy || !supabase}>{busy ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}</button>
      </form>
      <button className="text-button auth-switch" disabled={busy} onClick={() => {
        setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage(''); setPassword('')
      }}>{mode === 'login' ? '처음이신가요? 회원가입' : '이미 계정이 있나요? 로그인'}</button>
    </section></main>
  </>
}
