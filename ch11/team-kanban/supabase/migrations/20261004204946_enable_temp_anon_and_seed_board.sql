-- TEMPORARY: anonymous CRUD for this exercise; remove before team auth.
grant usage on schema public to anon;
grant select, insert, update, delete on public.boards, public.columns, public.cards to anon;
create policy temp_anon_boards_all on public.boards for all to anon using (true) with check (true);
create policy temp_anon_columns_all on public.columns for all to anon using (true) with check (true);
create policy temp_anon_cards_all on public.cards for all to anon using (true) with check (true);

-- Generated IDs are captured rather than hardcoded.
do $$
declare board uuid;
begin
  insert into public.boards(name) values ('우리 팀 보드') returning id into board;
  insert into public.columns(board_id, name, position) values
    (board, '할 일', 0), (board, '진행 중', 1), (board, '완료', 2);
end $$;

-- One transaction handles both moving and resequencing.
-- SECURITY INVOKER: normal grants and RLS remain in effect.
create function public.move_kanban_card(p_card_id uuid, p_column_id uuid, p_position integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  board uuid; target_board uuid; source_column uuid; target_ids uuid[]; source_ids uuid[];
  insert_at integer;
begin
  if p_position is null or p_position < 0 then
    raise exception 'Position must be nonnegative';
  end if;
  select col.board_id into board
    from public.cards card join public.columns col on col.id = card.column_id
    where card.id = p_card_id;
  if board is null then raise exception 'Card not found'; end if;

  -- Serialize moves within a board and re-read the source after locking.
  perform 1 from public.boards where id = board for update;
  select card.column_id into source_column from public.cards card where card.id = p_card_id;
  if source_column is null then raise exception 'Card not found'; end if;
  select col.board_id into target_board from public.columns col where col.id = p_column_id;
  if target_board is null or target_board <> board then raise exception 'Target must belong to the same board'; end if;

  select coalesce(array_agg(id order by position, id), '{}'::uuid[])
    into target_ids from public.cards where column_id = p_column_id and id <> p_card_id;
  insert_at := least(p_position, cardinality(target_ids));
  target_ids := coalesce(target_ids[1:insert_at], '{}'::uuid[])
    || array[p_card_id]
    || coalesce(target_ids[insert_at+1:cardinality(target_ids)], '{}'::uuid[]);

  update public.cards card set column_id = p_column_id, position = sequence.ordinality::integer - 1
    from unnest(target_ids) with ordinality as sequence(id, ordinality)
    where card.id = sequence.id;

  if source_column <> p_column_id then
    select coalesce(array_agg(id order by position, id), '{}'::uuid[])
      into source_ids from public.cards where column_id = source_column;
    update public.cards card set position = sequence.ordinality::integer - 1
      from unnest(source_ids) with ordinality as sequence(id, ordinality)
      where card.id = sequence.id;
  end if;
end $$;
revoke all on function public.move_kanban_card(uuid, uuid, integer) from public, authenticated;
grant execute on function public.move_kanban_card(uuid, uuid, integer) to anon;
