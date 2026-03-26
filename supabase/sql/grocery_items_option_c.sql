-- Opzione C (solo test): anon può tutto. Esegui in Supabase → SQL Editor.

create table if not exists public.grocery_items (
  id uuid primary key,
  text text not null,
  done boolean not null default false,
  added_by text not null check (added_by in ('daniele', 'letizia')),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on table public.grocery_items to anon, authenticated;

alter table public.grocery_items enable row level security;

drop policy if exists "grocery_items_anon_all" on public.grocery_items;

-- Permissivo per ruolo anon (chiave pubblica nel frontend, senza login)
create policy "grocery_items_anon_all"
  on public.grocery_items
  for all
  to anon
  using (true)
  with check (true);

-- Realtime (se fallisce perché la tabella è già nella publication, ignora o abilita da Dashboard → Realtime)
alter publication supabase_realtime add table public.grocery_items;
