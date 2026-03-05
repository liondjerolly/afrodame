-- Stabilisation du coeur en ligne (defis, parties, chat)
-- Date: 2026-03-05

create extension if not exists "uuid-ossp";

-- 1) Schema challenges + matches
alter table public.challenges
  alter column to_player_id drop not null;

alter table public.challenges
  add column if not exists game_id uuid references public.matches(id) on delete set null,
  add column if not exists accepted_by_player_id uuid references public.players(id) on delete set null,
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists expired_at timestamptz;

update public.challenges
set status = case
  when status = 'pending' then 'open'
  when status = 'declined' then 'cancelled'
  else status
end;

update public.challenges
set expires_at = coalesce(expires_at, created_at + interval '24 hours');

alter table public.challenges
  alter column status set default 'open',
  alter column expires_at set not null;

alter table public.challenges
  drop constraint if exists challenges_status_check;

alter table public.challenges
  add constraint challenges_status_check
  check (status in ('open', 'accepted', 'cancelled', 'expired'));

alter table public.matches
  add column if not exists challenge_id uuid references public.challenges(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_challenge_id_key'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
      add constraint matches_challenge_id_key unique (challenge_id);
  end if;
end;
$$;

create index if not exists idx_challenges_status_expires on public.challenges(status, expires_at);
create index if not exists idx_challenges_game_id on public.challenges(game_id);
create index if not exists idx_matches_challenge_id on public.matches(challenge_id);

-- 2) Expiration automatique
create or replace function public.expire_challenges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.challenges
  set status = 'expired',
      expired_at = coalesce(expired_at, now())
  where status = 'open'
    and expires_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.expire_challenges() to anon, authenticated;

-- 3) Acceptation atomique: verifie + accepte + cree la partie (meme game_id pour les deux joueurs)
create or replace function public.accept_challenge_atomic(
  p_challenge_id uuid,
  p_acceptor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.challenges%rowtype;
  v_game public.matches%rowtype;
begin
  perform public.expire_challenges();

  select *
  into v_challenge
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Défi introuvable.';
  end if;

  if v_challenge.status <> 'open' then
    raise exception 'Ce défi n''est plus disponible.';
  end if;

  if v_challenge.expires_at <= now() then
    update public.challenges
    set status = 'expired',
        expired_at = coalesce(expired_at, now())
    where id = v_challenge.id;
    raise exception 'Ce défi a expiré.';
  end if;

  if v_challenge.from_player_id = p_acceptor_id then
    raise exception 'Le créateur du défi ne peut pas accepter son propre défi.';
  end if;

  if v_challenge.to_player_id is not null and v_challenge.to_player_id <> p_acceptor_id then
    raise exception 'Ce défi est réservé à un autre joueur.';
  end if;

  update public.challenges
  set status = 'accepted',
      accepted_by_player_id = p_acceptor_id,
      accepted_at = now()
  where id = v_challenge.id;

  insert into public.matches (
    player1_id,
    player2_id,
    challenge_id,
    mode,
    status,
    winner_id,
    bet_amount,
    currency,
    board_size,
    piece_count,
    time_per_turn,
    consecutive_draws,
    board_state
  )
  values (
    v_challenge.from_player_id,
    p_acceptor_id,
    v_challenge.id,
    'challenge',
    'active',
    null,
    v_challenge.bet_amount,
    v_challenge.currency,
    v_challenge.board_size,
    v_challenge.piece_count,
    v_challenge.time_per_turn,
    0,
    ''
  )
  on conflict (challenge_id)
  do update set
    player2_id = excluded.player2_id,
    status = 'active'
  returning * into v_game;

  update public.challenges
  set game_id = v_game.id
  where id = v_challenge.id;

  select *
  into v_challenge
  from public.challenges
  where id = v_challenge.id;

  return jsonb_build_object(
    'challenge', to_jsonb(v_challenge),
    'game', to_jsonb(v_game)
  );
end;
$$;

grant execute on function public.accept_challenge_atomic(uuid, uuid) to anon, authenticated;

-- 4) Annulation d'un défi ouvert
create or replace function public.cancel_challenge(
  p_challenge_id uuid,
  p_requester_id uuid
)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.challenges%rowtype;
begin
  perform public.expire_challenges();

  select *
  into v_challenge
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Défi introuvable.';
  end if;

  if v_challenge.status <> 'open' then
    return v_challenge;
  end if;

  if p_requester_id <> v_challenge.from_player_id
     and (v_challenge.to_player_id is null or p_requester_id <> v_challenge.to_player_id) then
    raise exception 'Vous ne pouvez pas annuler ce défi.';
  end if;

  update public.challenges
  set status = 'cancelled',
      cancelled_at = now()
  where id = v_challenge.id
  returning * into v_challenge;

  return v_challenge;
end;
$$;

grant execute on function public.cancel_challenge(uuid, uuid) to anon, authenticated;

-- 5) Chat: lecture seule si défi annulé/expiré ou partie inactive
create or replace function public.is_chat_writable(p_match_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_challenge public.challenges%rowtype;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then
    return false;
  end if;

  if v_match.status <> 'active' then
    return false;
  end if;

  if v_match.challenge_id is null then
    return true;
  end if;

  select * into v_challenge from public.challenges where id = v_match.challenge_id;
  if not found then
    return false;
  end if;

  if v_challenge.status <> 'accepted' then
    return false;
  end if;

  if v_challenge.expires_at <= now() then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.enforce_chat_writable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_chat_writable(new.match_id) then
    raise exception 'Chat en lecture seule: défi annulé/expiré ou partie inactive.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chat_writable on public.chat_messages;
create trigger trg_chat_writable
before insert on public.chat_messages
for each row
execute function public.enforce_chat_writable();

-- 6) RLS orienté validation serveur
alter table public.challenges enable row level security;
alter table public.matches enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "allow_all_challenges" on public.challenges;
drop policy if exists "allow_all_matches" on public.matches;
drop policy if exists "allow_all_chat" on public.chat_messages;

create policy challenges_select_all
on public.challenges
for select
using (true);

create policy challenges_insert_open_only
on public.challenges
for insert
with check (
  status = 'open'
  and expires_at > now()
);

create policy challenges_update_cancel_only
on public.challenges
for update
using (status = 'open')
with check (status in ('open', 'cancelled'));

create policy matches_select_all
on public.matches
for select
using (true);

create policy matches_insert_valid
on public.matches
for insert
with check (
  mode <> 'challenge'
  or exists (
    select 1
    from public.challenges c
    where c.id = challenge_id
      and c.status = 'accepted'
      and c.expires_at > now()
  )
);

create policy matches_update_valid
on public.matches
for update
using (true)
with check (
  mode <> 'challenge'
  or exists (
    select 1
    from public.challenges c
    where c.id = challenge_id
      and c.status = 'accepted'
      and c.expires_at > now()
  )
);

create policy chat_select_all
on public.chat_messages
for select
using (true);

create policy chat_insert_if_writable
on public.chat_messages
for insert
with check (public.is_chat_writable(match_id));

-- 7) Job planifié (si pg_cron est disponible)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'expire_challenges_every_10min') then
      perform cron.schedule(
        'expire_challenges_every_10min',
        '*/10 * * * *',
        $$select public.expire_challenges();$$
      );
    end if;
  end if;
exception
  when others then
    null;
end;
$$;
