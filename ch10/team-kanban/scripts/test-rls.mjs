import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const stage = process.argv[2]
if (!['before', 'after'].includes(stage)) throw new Error('Use before or after')
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(line => line.includes('=') && !line.startsWith('#')).map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]
  }))
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const runId = randomUUID()
const results = []
const cleanupIds = new Set()
let admin
const actors = {}
const prefix = 'RLS verification ' + runId

function requireSuccess(result, context) {
  if (result.error) throw new Error(context + ' failed (' + result.error.code + ')')
  return result.data
}
function denied(result) {
  return result.error ? result.error.code === '42501' || [401, 403].includes(result.status)
    || (result.error.code === 'P0001' && result.error.message === 'A board must be created by the signed-in user')
    : Array.isArray(result.data) && result.data.length === 0
}
function record(actor, name, expected, pass, actual) {
  results.push({ actor, name, expected, status: pass ? 'PASS' : 'FAIL', actual })
  console.log((pass ? 'PASS' : 'FAIL') + ' ' + actor + ' ' + name + ' expected=' + expected + ' actual=' + actual)
}
async function stored(table, id) {
  return requireSuccess(await admin.from(table).select('*').eq('id', id).maybeSingle(), 'Fixture verification')
}
async function fixture() {
  const boardId = requireSuccess(await actors.alice.client.rpc('create_team_board', { p_name: prefix }), 'Fixture board')
  cleanupIds.add(boardId)
  requireSuccess(await admin.from('board_members').insert({ board_id: boardId, user_id: actors.bob.id, role: 'member' }), 'Fixture member')
  const columns = requireSuccess(await admin.from('columns').select('*').eq('board_id', boardId).order('position'), 'Fixture columns')
  const card = { id: randomUUID(), column_id: columns[0].id, title: prefix, position: 0 }
  requireSuccess(await admin.from('cards').insert(card), 'Fixture card')
  return { boardId, columns, card }
}
async function restoreCard(f) {
  requireSuccess(await admin.from('cards').upsert(f.card), 'Restore fixture card')
}
async function mutation(actor, table, operation, id, body, expected) {
  const client = actors[actor].client
  const before = await stored(table, id)
  let query = operation === 'insert' ? client.from(table).insert(body)
    : operation === 'update' ? client.from(table).update(body).eq('id', id)
      : client.from(table).delete().eq('id', id)
  const response = await query.select('id')
  const after = await stored(table, id)
  const affected = !response.error && response.data?.length === 1
  let changedAsExpected = operation === 'delete' ? after === null
    : after !== null && Object.entries(body).every(([key, value]) => after[key] === value)
  const unchanged = JSON.stringify(before) === JSON.stringify(after)
  const pass = expected ? affected && changedAsExpected : denied(response) && unchanged
  record(actor, table + '.' + operation, expected ? 'allow' : 'deny', pass,
    response.error ? response.error.code : 'rows=' + (response.data?.length ?? 0) + ',unchanged=' + unchanged)
}
async function main() {
  const keys = JSON.parse(execFileSync('npx', ['--yes', 'supabase', 'projects', 'api-keys',
    '--project-ref', env.SUPABASE_PROJECT_REF, '--reveal', '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const adminKey = keys.find(key => key.name === 'service_role')?.api_key
  if (!adminKey) throw new Error('Fixture admin unavailable')
  admin = createClient(env.VITE_SUPABASE_URL, adminKey, options)
  for (const actor of ['alice', 'bob', 'carol', 'anon']) {
    const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options)
    let id = null
    if (actor !== 'anon') {
      const key = 'TEST_' + actor.toUpperCase()
      const data = requireSuccess(await client.auth.signInWithPassword({ email: env[key + '_EMAIL'], password: env[key + '_PASSWORD'] }), actor + ' login')
      id = data.user.id
    }
    actors[actor] = { client, id }
  }
  // Foreign board belongs solely to Carol.
  const foreignBoard = requireSuccess(await actors.carol.client.rpc('create_team_board', { p_name: prefix + ' foreign' }), 'Foreign board')
  cleanupIds.add(foreignBoard)
  const foreignColumns = requireSuccess(await admin.from('columns').select('*').eq('board_id', foreignBoard).order('position'), 'Foreign columns')

  for (const actor of Object.keys(actors)) {
    const f = await fixture()
    const member = ['alice', 'bob'].includes(actor)
    for (const table of ['cards', 'columns', 'boards']) {
      const id = table === 'cards' ? f.card.id : table === 'columns' ? f.columns[0].id : f.boardId
      const read = await actors[actor].client.from(table).select('id').eq('id', id)
      record(actor, table + '.select', member ? 'allow' : 'deny',
        member ? !read.error && read.data?.length === 1 : denied(read),
        read.error ? read.error.code : 'rows=' + read.data?.length)
      if (table === 'boards') {
        const name = prefix + ' new ' + actor
        const response = await actors[actor].client.from('boards').insert({ name }).select('id')
        const created = requireSuccess(await admin.from('boards').select('id,created_by').eq('name', name), 'New board verification')
        for (const row of created) cleanupIds.add(row.id)
        const owner = created.length === 1 ? requireSuccess(await admin.from('board_members').select('role').eq('board_id', created[0].id).eq('user_id', actors[actor].id), 'Owner verification') : []
        const expected = actor !== 'anon'
        record(actor, 'boards.insert', expected ? 'allow+auto-owner' : 'deny',
          expected ? !response.error && response.data?.length === 1 && created[0]?.created_by === actors[actor].id && owner[0]?.role === 'owner'
            : denied(response) && created.length === 0, response.error ? response.error.code : 'rows=' + response.data?.length)
      } else {
        const newId = randomUUID()
        const body = table === 'cards' ? { id: newId, column_id: f.columns[0].id, title: prefix + ' added', position: 20 }
          : { id: newId, board_id: f.boardId, name: prefix + ' added', position: 20 }
        await mutation(actor, table, 'insert', newId, body, member)
      }
      await mutation(actor, table, 'update', id,
        table === 'cards' ? { title: prefix + ' updated' } : { name: prefix + ' updated' }, member)
      if (table === 'columns') {
        await mutation(actor, table, 'delete', f.columns[2].id, {}, member)
      } else if (table === 'cards') {
        await mutation(actor, table, 'delete', id, {}, member)
        await restoreCard(f)
      }
    }
    const membershipRead = await actors[actor].client.from('board_members').select('user_id').eq('board_id', f.boardId)
    record(actor, 'board_members.select', member ? 'allow' : 'deny',
      member ? !membershipRead.error && membershipRead.data?.length === 2 : denied(membershipRead),
      membershipRead.error ? membershipRead.error.code : 'rows=' + membershipRead.data?.length)

    const move = await actors[actor].client.rpc('move_kanban_card', { p_card_id: f.card.id, p_column_id: f.columns[1].id, p_position: 0 })
    const moved = await stored('cards', f.card.id)
    const moveDenied = move.error && (denied(move) || move.error.message === 'Card not found')
    record(actor, 'cards.move_rpc', member ? 'allow' : 'deny',
      member ? !move.error && moved?.column_id === f.columns[1].id : !!moveDenied && moved?.column_id === f.columns[0].id,
      move.error ? move.error.code : 'moved=' + (moved?.column_id === f.columns[1].id))
    await restoreCard(f)

    if (member) {
      const crossMove = await actors[actor].client.from('cards').update({ column_id: foreignColumns[0].id }).eq('id', f.card.id).select('id')
      const crossState = await stored('cards', f.card.id)
      record(actor, 'cards.cross_board_reassignment', 'deny', denied(crossMove) && crossState?.column_id === f.columns[0].id,
        crossMove.error ? crossMove.error.code : 'rows=' + crossMove.data?.length)
      await restoreCard(f)
      const crossCol = await actors[actor].client.from('columns').update({ board_id: foreignBoard }).eq('id', f.columns[0].id).select('id')
      const colState = await stored('columns', f.columns[0].id)
      record(actor, 'columns.cross_board_reassignment', 'deny', denied(crossCol) && colState?.board_id === f.boardId,
        crossCol.error ? crossCol.error.code : 'rows=' + crossCol.data?.length)
      requireSuccess(await admin.from('columns').update({ board_id: f.boardId }).eq('id', f.columns[0].id), 'Restore column')
      const ownerChange = await actors[actor].client.from('boards').update({ created_by: actors.carol.id }).eq('id', f.boardId).select('id')
      const boardState = await stored('boards', f.boardId)
      record(actor, 'boards.change_creator', 'deny', denied(ownerChange) && boardState?.created_by === actors.alice.id,
        ownerChange.error ? ownerChange.error.code : 'rows=' + ownerChange.data?.length)
      requireSuccess(await admin.from('boards').update({ created_by: actors.alice.id }).eq('id', f.boardId), 'Restore creator')
    }

    const invite = await actors[actor].client.rpc('invite_board_member', { p_board_id: f.boardId, p_email: env.TEST_CAROL_EMAIL })
    const invited = requireSuccess(await admin.from('board_members').select('user_id').eq('board_id', f.boardId).eq('user_id', actors.carol.id), 'Invite verification')
    record(actor, 'members.invite', actor === 'alice' ? 'allow' : 'deny',
      actor === 'alice' ? !invite.error && invite.data === true && invited.length === 1
        : !!invite.error && (denied(invite) || invite.error.message === 'Only the board owner can invite members') && invited.length === 0,
      invite.error ? invite.error.code : 'inserted=' + invited.length)
    requireSuccess(await admin.from('board_members').delete().eq('board_id', f.boardId).eq('user_id', actors.carol.id), 'Restore invited member')
    const removal = await actors[actor].client.rpc('remove_board_member', { p_board_id: f.boardId, p_user_id: actors.bob.id })
    const removed = requireSuccess(await admin.from('board_members').select('user_id').eq('board_id', f.boardId).eq('user_id', actors.bob.id), 'Removal verification')
    record(actor, 'members.remove', actor === 'alice' ? 'allow' : 'deny',
      actor === 'alice' ? !removal.error && removal.data === true && removed.length === 0
        : !!removal.error && (denied(removal) || removal.error.message === 'Only the board owner can remove members') && removed.length === 1,
      removal.error ? removal.error.code : 'remaining=' + removed.length)
    requireSuccess(await admin.from('board_members').upsert({ board_id: f.boardId, user_id: actors.bob.id, role: 'member' }), 'Restore Bob')

    const newMember = { board_id: f.boardId, user_id: actors.carol.id, role: 'member' }
    const directInsert = await actors[actor].client.from('board_members').insert(newMember).select('user_id')
    const directState = requireSuccess(await admin.from('board_members').select('user_id').eq('board_id', f.boardId).eq('user_id', actors.carol.id), 'Direct member verification')
    record(actor, 'board_members.insert_direct', 'deny', denied(directInsert) && directState.length === 0, directInsert.error ? directInsert.error.code : 'rows=' + directInsert.data?.length)
    requireSuccess(await admin.from('board_members').delete().eq('board_id', f.boardId).eq('user_id', actors.carol.id), 'Restore direct insert')
    const directUpdate = await actors[actor].client.from('board_members').update({ role: 'owner' }).eq('board_id', f.boardId).eq('user_id', actors.bob.id).select('user_id')
    const bobRole = requireSuccess(await admin.from('board_members').select('role').eq('board_id', f.boardId).eq('user_id', actors.bob.id), 'Direct role verification')
    record(actor, 'board_members.update_direct', 'deny', denied(directUpdate) && bobRole[0]?.role === 'member', directUpdate.error ? directUpdate.error.code : 'rows=' + directUpdate.data?.length)
    const directDelete = await actors[actor].client.from('board_members').delete().eq('board_id', f.boardId).eq('user_id', actors.bob.id).select('user_id')
    const bobExists = requireSuccess(await admin.from('board_members').select('user_id').eq('board_id', f.boardId).eq('user_id', actors.bob.id), 'Direct removal verification')
    record(actor, 'board_members.delete_direct', 'deny', denied(directDelete) && bobExists.length === 1, directDelete.error ? directDelete.error.code : 'rows=' + directDelete.data?.length)
    requireSuccess(await admin.from('board_members').upsert({ board_id: f.boardId, user_id: actors.bob.id, role: 'member' }), 'Restore direct delete')
    await mutation(actor, 'boards', 'delete', f.boardId, {}, member)
  }

  // Removed users must lose access immediately even with their existing JWT.
  const f = await fixture()
  const selfRemove = await actors.alice.client.rpc('remove_board_member', { p_board_id: f.boardId, p_user_id: actors.alice.id })
  const owner = requireSuccess(await admin.from('board_members').select('role').eq('board_id', f.boardId).eq('user_id', actors.alice.id), 'Owner retention')
  record('alice', 'members.remove_owner', 'deny', !!selfRemove.error && selfRemove.error.message === 'The owner cannot be removed' && owner[0]?.role === 'owner',
    selfRemove.error ? selfRemove.error.code : 'removed')
  const removeBob = await actors.alice.client.rpc('remove_board_member', { p_board_id: f.boardId, p_user_id: actors.bob.id })
  const bobMembership = requireSuccess(await admin.from('board_members').select('user_id').eq('board_id', f.boardId).eq('user_id', actors.bob.id), 'Membership revocation')
  for (const [table, id] of [['boards', f.boardId], ['columns', f.columns[0].id], ['cards', f.card.id]]) {
    const response = await actors.bob.client.from(table).select('id').eq('id', id)
    record('bob', table + '.select_after_removal', 'deny', !removeBob.error && bobMembership.length === 0 && denied(response),
      removeBob.error ? 'removal-' + removeBob.error.code : response.error ? response.error.code : 'rows=' + response.data?.length)
  }
  const attempt = await actors.bob.client.from('cards').update({ title: 'Revoked member attempt' }).eq('id', f.card.id).select('id')
  const finalCard = await stored('cards', f.card.id)
  record('bob', 'cards.update_after_removal', 'deny', !removeBob.error && bobMembership.length === 0 && denied(attempt) && finalCard?.title === f.card.title,
    removeBob.error ? 'removal-' + removeBob.error.code : attempt.error ? attempt.error.code : 'rows=' + attempt.data?.length)
}

let infrastructureError = null
try { await main() } catch (error) {
  infrastructureError = error instanceof Error ? error.message : 'Infrastructure failure'
  console.error('BLOCKED: ' + infrastructureError)
} finally {
  if (admin) for (const id of cleanupIds) {
    const deletion = await admin.from('boards').delete().eq('id', id)
    if (deletion.error) infrastructureError = 'Fixture cleanup failed'
  }
  for (const actor of Object.values(actors)) if (actor.id) await actor.client.auth.signOut({ scope: 'local' })
}
const summary = { total: results.length, pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status === 'FAIL').length, blocked: infrastructureError ? 1 : 0 }
writeFileSync(new URL('../docs/rls-results-' + stage + '.json', import.meta.url), JSON.stringify({ stage, timestamp: new Date().toISOString(), summary, infrastructureError, results }, null, 2) + '\n')
console.log('SUMMARY ' + JSON.stringify(summary))
process.exitCode = summary.fail || summary.blocked ? 1 : 0
