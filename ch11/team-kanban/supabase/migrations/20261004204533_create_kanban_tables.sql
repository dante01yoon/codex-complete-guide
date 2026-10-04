-- Schema only. Team membership and access policies are deferred.
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references public.columns(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  position integer not null check (position >= 0),
  created_at timestamptz not null default now()
);

-- Order siblings by position, id for a deterministic tie breaker.
create index columns_board_position_idx on public.columns(board_id, position, id);
create index cards_column_position_idx on public.cards(column_id, position, id);

-- No public access until a team access model is defined.
alter table public.boards enable row level security;
alter table public.columns enable row level security;
alter table public.cards enable row level security;
