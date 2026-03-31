-- Lista desideri: link condivisi (anteprima titolo/immagine/prezzo lato client + edge function).
-- Esegui in Supabase → SQL Editor dopo le migrazioni precedenti.

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null check (created_by in ('daniele', 'letizia')),
  url text not null,
  title text,
  description text,
  image_url text,
  site_name text,
  price_text text,
  price_amount numeric(12, 2),
  currency text default 'EUR',
  notes text,
  preview_fetched_at timestamptz,
  preview_note text
);

alter table public.wishlist_items enable row level security;

drop policy if exists "wishlist_items_auth_all" on public.wishlist_items;
create policy "wishlist_items_auth_all"
  on public.wishlist_items
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.wishlist_items to authenticated;

create index if not exists wishlist_items_created_at_idx on public.wishlist_items (created_at desc);

-- Realtime (se la riga dà errore «already member», ignora)
alter publication supabase_realtime add table public.wishlist_items;
