-- Calendario: eventi condivisi per garden con assegnatario esplicito.
-- Esegui in Supabase → SQL Editor dopo le migrazioni precedenti.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.garden (id) on delete cascade,
  title text not null,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by text not null,
  assigned_to text not null,
  created_at timestamptz not null default now(),
  constraint calendar_events_ends_after_starts check (ends_at >= starts_at)
);

create index if not exists calendar_events_garden_range_idx
  on public.calendar_events (garden_id, starts_at, ends_at);

alter table public.calendar_events enable row level security;

drop policy if exists "calendar_events_garden" on public.calendar_events;
create policy "calendar_events_garden"
  on public.calendar_events
  for all
  to authenticated
  using (garden_id in (select public.user_garden_ids()))
  with check (garden_id in (select public.user_garden_ids()));

grant select, insert, update, delete on table public.calendar_events to authenticated;

-- Realtime (se la riga dà errore «already member», ignora)
alter publication supabase_realtime add table public.calendar_events;
