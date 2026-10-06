-- Supports the creator foreign key and owner read path.
create index boards_created_by_idx on public.boards(created_by);
