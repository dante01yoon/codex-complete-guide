create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter table public.boards add column created_by uuid references auth.users(id) on delete set null default auth.uid();
create table public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index board_members_user_idx on public.board_members(user_id, board_id);
create unique index board_members_one_owner_idx on public.board_members(board_id) where role = 'owner';
alter table public.board_members enable row level security;
grant select on public.board_members to authenticated;
create policy temp_authenticated_board_members_read on public.board_members for select to authenticated using (true);

-- Preserve all existing temp_anon_* policies unchanged.
-- Authenticated exercise access is temporary too; member RLS comes next.
grant select, insert, update, delete on public.boards, public.columns, public.cards to authenticated;
create policy temp_authenticated_boards_all on public.boards for all to authenticated using (true) with check (true);
create policy temp_authenticated_columns_all on public.columns for all to authenticated using (true) with check (true);
create policy temp_authenticated_cards_all on public.cards for all to authenticated using (true) with check (true);
grant execute on function public.move_kanban_card(uuid, uuid, integer) to authenticated;

-- The pre-Auth exercise board has no creator. Assign that board to Alice only.
do $$
declare alice_id uuid;
begin
  select id into alice_id from auth.users where lower(email) = 'alice@team-kanban.example';
  if alice_id is null then raise exception 'Alice test account must be provisioned first'; end if;
  update public.boards set created_by = alice_id where created_by is null and name = '우리 팀 보드';
  insert into public.board_members(board_id, user_id, role)
    select id, created_by, 'owner' from public.boards where created_by is not null;
end $$;

create function private.add_board_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or new.created_by is distinct from (select auth.uid()) then
    raise exception 'A board must be created by the signed-in user';
  end if;
  insert into public.board_members(board_id,user_id,role) values (new.id,new.created_by,'owner');
  return new;
end $$;
revoke all on function private.add_board_owner() from public, anon, authenticated;
create trigger add_board_owner after insert on public.boards
for each row execute function private.add_board_owner();

create function public.create_team_board(p_name text)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare new_board uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
  insert into public.boards(name) values (btrim(p_name)) returning id into new_board;
  insert into public.columns(board_id,name,position) values
    (new_board,'할 일',0),(new_board,'진행 중',1),(new_board,'완료',2);
  return new_board;
end $$;
revoke all on function public.create_team_board(text) from public, anon;
grant execute on function public.create_team_board(text) to authenticated;

-- Auth users are read only inside this private, owner-checked function.
create function private.invite_board_member(p_board_id uuid, p_email text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare target_user uuid; inserted_count integer;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.board_members where board_id=p_board_id
    and user_id=(select auth.uid()) and role='owner'
  ) then raise exception 'Only the board owner can invite members'; end if;
  select id into target_user from auth.users where lower(email)=lower(btrim(p_email));
  if target_user is null then raise exception 'Registered user not found'; end if;
  insert into public.board_members(board_id,user_id,role) values (p_board_id,target_user,'member')
    on conflict (board_id,user_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count > 0;
end $$;
revoke all on function private.invite_board_member(uuid,text) from public, anon;
grant execute on function private.invite_board_member(uuid,text) to authenticated;

create function public.invite_board_member(p_board_id uuid, p_email text)
returns boolean language sql security invoker set search_path = ''
as $$ select private.invite_board_member(p_board_id,p_email); $$;
revoke all on function public.invite_board_member(uuid,text) from public, anon;
grant execute on function public.invite_board_member(uuid,text) to authenticated;

create function private.list_board_members(p_board_id uuid)
returns table(user_id uuid,email text,role text)
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.board_members m where m.board_id=p_board_id and m.user_id=(select auth.uid())
  ) then raise exception 'Board membership required'; end if;
  return query select m.user_id,u.email::text,m.role from public.board_members m
    join auth.users u on u.id=m.user_id where m.board_id=p_board_id
    order by (m.role='owner') desc,m.created_at,m.user_id;
end $$;
revoke all on function private.list_board_members(uuid) from public, anon;
grant execute on function private.list_board_members(uuid) to authenticated;
create function public.list_board_members(p_board_id uuid)
returns table(user_id uuid,email text,role text)
language sql security invoker set search_path = ''
as $$ select * from private.list_board_members(p_board_id); $$;
revoke all on function public.list_board_members(uuid) from public, anon;
grant execute on function public.list_board_members(uuid) to authenticated;
