-- Pending kick: a host's kick during a running match starts a 10 s countdown instead of removing
-- the player at once (null = no pending kick). Run by hand in the Supabase SQL editor.
alter table public.rentz_players add column if not exists kick_requested_at timestamptz;
