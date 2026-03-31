-- Liste desideri condivise (come todo_lists); ogni articolo ha list_id.
-- Esegui in Supabase → SQL Editor dopo le migrazioni precedenti.

create table if not exists public.wishlist_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null check (created_by in ('daniele', 'letizia')),
  title text not null default ''
);

alter table public.wishlist_lists enable row level security;

drop policy if exists "wishlist_lists_auth_all" on public.wishlist_lists;
create policy "wishlist_lists_auth_all"
  on public.wishlist_lists
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.wishlist_lists to authenticated;

alter table public.wishlist_items
  add column if not exists list_id uuid references public.wishlist_lists (id) on delete cascade;

do $$
declare
  wid uuid;
begin
  if exists (select 1 from public.wishlist_items where list_id is null) then
    insert into public.wishlist_lists (created_by, title)
    values ('daniele', 'Generale')
    returning id into wid;
    update public.wishlist_items set list_id = wid where list_id is null;
  end if;
end $$;

alter table public.wishlist_items alter column list_id set not null;

create index if not exists wishlist_items_list_id_idx on public.wishlist_items (list_id);
create index if not exists wishlist_items_list_created_idx on public.wishlist_items (list_id, created_at desc);

-- Realtime (se la riga dà errore «already member», ignora)
alter publication supabase_realtime add table public.wishlist_lists;
