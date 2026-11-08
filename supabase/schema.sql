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
  kick_requested_at timestamptz,                           -- pending kick during a match (10 s to refuse); null = none
  last_seen_at timestamptz not null default now(),         -- presence: disconnected after 45 s, see migrations/002
  device_hash  text,                                       -- sha256 of the browser's device id, see migrations/002
  role         text not null default 'player' check (role in ('player', 'spectator')),  -- see migrations/003
  seat         integer,                                    -- table order of players (host-controlled), see migrations/003
  queued_at    timestamptz,                                -- spectator waiting for the next match, see migrations/003
  constraint rentz_players_room_id_fkey foreign key (room_id) references public.rentz_rooms (id) on delete cascade
);
create unique index if not exists rentz_players_room_nickname_uq on public.rentz_players (room_id, lower(nickname));
create index if not exists rentz_players_room_idx on public.rentz_players (room_id);
-- For databases created before migrations 001 / 002 (idempotent):
alter table public.rentz_players add column if not exists kick_requested_at timestamptz;
alter table public.rentz_players add column if not exists last_seen_at timestamptz not null default now();
alter table public.rentz_players add column if not exists device_hash text;
alter table public.rentz_players add column if not exists role text not null default 'player';
alter table public.rentz_players add column if not exists seat integer;
alter table public.rentz_players add column if not exists queued_at timestamptz;
do $$ begin
  alter table public.rentz_players add constraint rentz_players_role_check check (role in ('player', 'spectator'));
exception when duplicate_object then null; end $$;
create index if not exists rentz_players_room_seen_idx on public.rentz_players (room_id, last_seen_at);

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
