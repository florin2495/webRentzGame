-- Spectators, host-controlled seat order, "join next round" queue (feedback plan contracts A + B).
-- Additive and idempotent. Existing rows become players, seated in join order.
alter table public.rentz_players add column if not exists role text not null default 'player';
alter table public.rentz_players add column if not exists seat integer;
alter table public.rentz_players add column if not exists queued_at timestamptz;

do $$ begin
  alter table public.rentz_players
    add constraint rentz_players_role_check check (role in ('player', 'spectator'));
exception when duplicate_object then null; end $$;

update public.rentz_players p
   set seat = s.n
  from (select id, row_number() over (partition by room_id order by joined_at) - 1 as n
          from public.rentz_players where role = 'player') s
 where p.id = s.id and p.seat is null;
