-- Step 2: Arène IA, persistance des coups, spectateurs en direct
-- Date: 2026-03-05

create extension if not exists "uuid-ossp";

-- 1) Etendre les modes de match
alter table public.matches
  drop constraint if exists matches_mode_check;

alter table public.matches
  add constraint matches_mode_check
  check (mode in ('ai', 'online', 'challenge', 'ai_arena'));

-- 2) Table de persistance des coups (analyse/replay)
create table if not exists public.match_moves (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  move_number integer not null check (move_number > 0),
  from_row integer not null,
  from_col integer not null,
  to_row integer not null,
  to_col integer not null,
  captured_pieces jsonb not null default '[]'::jsonb,
  player_type text not null check (player_type in ('human', 'ai')),
  created_at timestamptz default now()
);

create index if not exists idx_match_moves_match on public.match_moves(match_id);
create index if not exists idx_match_moves_order on public.match_moves(match_id, move_number);
create index if not exists idx_match_moves_created on public.match_moves(created_at desc);

-- 3) Validation serveur: insertion seulement si match actif
create or replace function public.is_match_move_writable(p_match_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.matches
  where id = p_match_id;

  return v_status = 'active';
end;
$$;

grant execute on function public.is_match_move_writable(uuid) to anon, authenticated;

-- 4) RLS: spectateurs en lecture seule sur les coups
alter table public.match_moves enable row level security;

drop policy if exists match_moves_select_all on public.match_moves;
drop policy if exists match_moves_insert_if_active on public.match_moves;

create policy match_moves_select_all
on public.match_moves
for select
using (true);

create policy match_moves_insert_if_active
on public.match_moves
for insert
with check (public.is_match_move_writable(match_id));

-- 5) Realtime: publication des coups
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_moves'
  ) then
    alter publication supabase_realtime add table public.match_moves;
  end if;
exception
  when others then
    null;
end;
$$;
