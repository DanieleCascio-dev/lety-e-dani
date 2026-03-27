-- Ristoranti salvati (lista condivisa tra gli account autenticati).
-- Esegui in Supabase → SQL Editor dopo le migrazioni precedenti.

create table if not exists public.saved_restaurants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null check (created_by in ('daniele', 'letizia')),
  name text not null default '',
  maps_url text not null,
  rating integer not null check (rating >= 1 and rating <= 5)
);

alter table public.saved_restaurants enable row level security;

drop policy if exists "saved_restaurants_auth_all" on public.saved_restaurants;
create policy "saved_restaurants_auth_all"
  on public.saved_restaurants
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.saved_restaurants to authenticated;

create index if not exists saved_restaurants_created_at_idx on public.saved_restaurants (created_at desc);
