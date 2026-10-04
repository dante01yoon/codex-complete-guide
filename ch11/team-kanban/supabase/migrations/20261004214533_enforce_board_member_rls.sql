-- Drop every temporary policy on the application tables, atomically.
do $$
declare item record;
begin
  for item in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('boards','columns','cards','board_members')
      and left(policyname,5)='temp_'
  loop
    execute format('drop policy %I on %I.%I',item.policyname,item.schemaname,item.tablename);
  end loop;
end $$;

-- Revoking grants closes anonymous API and RPC access too.
revoke all on public.boards,public.columns,public.cards,public.board_members from anon,authenticated;
grant select,delete on public.boards to authenticated;
grant insert(name,description,created_by) on public.boards to authenticated;
grant update(name,description) on public.boards to authenticated;
grant select,insert,update,delete on public.columns,public.cards to authenticated;
grant select on public.board_members to authenticated;
revoke execute on function public.move_kanban_card(uuid,uuid,integer) from anon,public;
grant execute on function public.move_kanban_card(uuid,uuid,integer) to authenticated;

-- Non-exposed helper reads membership without recursive RLS.
-- The user identity is obtained from the verified JWT, never a caller parameter.
create function private.member_board_ids()
returns uuid[] language sql stable security definer set search_path=''
as $$
  select coalesce(array_agg(m.board_id),'{}'::uuid[])
  from public.board_members m
  where m.user_id=(select auth.uid()) and (select auth.uid()) is not null;
$$;
revoke all on function private.member_board_ids() from public,anon;
grant execute on function private.member_board_ids() to authenticated;

-- created_by identifies the automatic owner during INSERT RETURNING,
-- before the AFTER INSERT membership trigger has run.
create policy boards_member_select on public.boards for select to authenticated
  using (created_by=(select auth.uid()) or id=any((select private.member_board_ids())::uuid[]));
create policy boards_creator_insert on public.boards for insert to authenticated
  with check ((select auth.uid()) is not null and created_by=(select auth.uid()));
create policy boards_member_update on public.boards for update to authenticated
  using (id=any((select private.member_board_ids())::uuid[]))
  with check (id=any((select private.member_board_ids())::uuid[]));
create policy boards_member_delete on public.boards for delete to authenticated
  using (id=any((select private.member_board_ids())::uuid[]));

create policy columns_member_select on public.columns for select to authenticated
  using (board_id=any((select private.member_board_ids())::uuid[]));
create policy columns_member_insert on public.columns for insert to authenticated
  with check (board_id=any((select private.member_board_ids())::uuid[]));
create policy columns_member_update on public.columns for update to authenticated
  using (board_id=any((select private.member_board_ids())::uuid[]))
  with check (board_id=any((select private.member_board_ids())::uuid[]));
create policy columns_member_delete on public.columns for delete to authenticated
  using (board_id=any((select private.member_board_ids())::uuid[]));

create policy cards_member_select on public.cards for select to authenticated
  using (column_id in (select id from public.columns where board_id=any((select private.member_board_ids())::uuid[])));
create policy cards_member_insert on public.cards for insert to authenticated
  with check (column_id in (select id from public.columns where board_id=any((select private.member_board_ids())::uuid[])));
create policy cards_member_update on public.cards for update to authenticated
  using (column_id in (select id from public.columns where board_id=any((select private.member_board_ids())::uuid[])))
  with check (column_id in (select id from public.columns where board_id=any((select private.member_board_ids())::uuid[])));
create policy cards_member_delete on public.cards for delete to authenticated
  using (column_id in (select id from public.columns where board_id=any((select private.member_board_ids())::uuid[])));

create policy board_members_member_select on public.board_members for select to authenticated
  using (board_id=any((select private.member_board_ids())::uuid[]));
-- No direct member INSERT/UPDATE/DELETE policies or grants: use owner RPCs.

create function private.remove_board_member(p_board_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare removed_count integer;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.board_members m where m.board_id=p_board_id
      and m.user_id=(select auth.uid()) and m.role='owner'
  ) then raise exception 'Only the board owner can remove members'; end if;
  perform 1 from public.boards where id=p_board_id for update;
  if exists(select 1 from public.board_members where board_id=p_board_id and user_id=p_user_id and role='owner')
    then raise exception 'The owner cannot be removed'; end if;
  delete from public.board_members where board_id=p_board_id and user_id=p_user_id and role='member';
  get diagnostics removed_count=row_count;
  return removed_count > 0;
end $$;
revoke all on function private.remove_board_member(uuid,uuid) from public,anon;
grant execute on function private.remove_board_member(uuid,uuid) to authenticated;
create function public.remove_board_member(p_board_id uuid,p_user_id uuid)
returns boolean language sql security invoker set search_path=''
as $$ select private.remove_board_member(p_board_id,p_user_id); $$;
revoke all on function public.remove_board_member(uuid,uuid) from public,anon;
grant execute on function public.remove_board_member(uuid,uuid) to authenticated;
