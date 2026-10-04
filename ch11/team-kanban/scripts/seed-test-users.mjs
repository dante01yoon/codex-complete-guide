// Run on the local machine only. Admin credentials stay in process memory.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const path = new URL('../.env.local', import.meta.url)
  let text = readFileSync(path, 'utf8')
  const env = Object.fromEntries(text.split('\n').filter(line => line.includes('=') && !line.startsWith('#')).map(line => {
    const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]
  }))
  const keys = JSON.parse(execFileSync('npx', ['--yes', 'supabase', 'projects', 'api-keys',
    '--project-ref', env.SUPABASE_PROJECT_REF, '--reveal', '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const key = keys.find(item => item.name === 'service_role')?.api_key
  if (!key) throw new Error('Admin credential unavailable')
  const admin = createClient(env.VITE_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const name of ['alice', 'bob', 'carol']) {
    const prefix = 'TEST_' + name.toUpperCase()
    const email = env[prefix + '_EMAIL'] || name + '@team-kanban.example'
    const password = env[prefix + '_PASSWORD'] || randomBytes(24).toString('base64url')
    for (const [field, value] of [['EMAIL', email], ['PASSWORD', password]]) {
      if (!env[prefix + '_' + field]) text += '\n' + prefix + '_' + field + '=' + value
    }
    writeFileSync(path, text.trimEnd() + '\n', { mode: 0o600 })
    const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (existing.error) throw new Error('User lookup failed')
    if (!existing.data.users.some(user => user.email?.toLowerCase() === email)) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (created.error) throw new Error('Test user creation failed')
    }
    const testClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } })
    const signedIn = await testClient.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw new Error('Test user sign-in failed')
    await testClient.auth.signOut({ scope: 'local' })
    console.log(name + ': confirmed account and password sign-in PASS (credentials saved only in .env.local)')
  }
}
main().catch(() => { console.error('Test account setup failed; no credentials logged.'); process.exitCode = 1 })
