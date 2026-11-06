-- Rentz multiplayer - Supabase schema
-- The Supabase project is shared by every hailatat.icu mini-game: every object of this game is
-- prefixed with rentz_ (tables, constraints, indexes). Keep the prefix on anything new.
-- Run this whole file once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Idempotent: re-running it drops nothing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- rentz_rooms: one row per room. The running match (hands included) lives in `match` (jsonb);
-- every write to it is conditional on `version`, so two simultaneous moves cannot both apply.
-- ---------------------------------------------------------------------------
create table if not exists public.rentz_rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  name             text not null check (char_length(name) between 1 and 40),
  password_hash    text,                                   -- scrypt hash, null = no password
  status           text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  round            integer not null default 1 check (round >= 1),   -- match number in this room
  host_player_id   uuid,
  winner_player_id uuid,
  match            jsonb,                                  -- null in the lobby
  version          integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()      -- idle rooms are deleted lazily
);
create index if not exists rentz_rooms_status_activity_idx on public.rentz_rooms (status, last_activity_at);

-- ---------------------------------------------------------------------------
-- rentz_players: members of a room (3-4 play). Identity = random token kept by the browser,
-- only its SHA-256 hash is stored.
-- ---------------------------------------------------------------------------
create table if not exists public.rentz_players (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null,
  nickname   text not null check (char_length(nickname) between 1 and 20),
  token_hash text not null unique,
  is_host    boolean not null default false,
  joined_at  timestamptz not null default now(),
  constraint rentz_players_room_id_fkey foreign key (room_id) references public.rentz_rooms (id) on delete cascade
);
create unique index if not exists rentz_players_room_nickname_uq on public.rentz_players (room_id, lower(nickname));
create index if not exists rentz_players_room_idx on public.rentz_players (room_id);

do $$ begin
  alter table public.rentz_rooms
    add constraint rentz_rooms_host_fk foreign key (host_player_id) references public.rentz_players (id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rentz_rooms
    add constraint rentz_rooms_winner_fk foreign key (winner_player_id) references public.rentz_players (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Security: RLS on, NO policies -> anon / authenticated can read or write nothing.
-- Only the service role (Next.js Route Handlers) touches these tables. Hands stay secret.
-- ---------------------------------------------------------------------------
alter table public.rentz_rooms   enable row level security;
alter table public.rentz_players enable row level security;

revoke all on public.rentz_rooms, public.rentz_players from anon, authenticated;
