-- 004: optional 9th game "Totale +" (Whist + Zece de treflă in one deal), chosen when the room is created.
-- Run once in the Supabase SQL editor. Idempotent. Do not push the v1.3 code before it runs:
-- every room query selects the column.
alter table public.rentz_rooms add column if not exists totale_plus boolean not null default false;
