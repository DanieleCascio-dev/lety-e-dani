-- Liste della spesa: più liste, articoli legati a una lista.
-- Esegui in Supabase → SQL Editor (dopo grocery_items e policy authenticated).

create table if not exists public.grocery_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null check (created_by in ('daniele', 'letizia'))
);

alter table public.grocery_lists enable row level security;

drop policy if exists "grocery_lists_auth_all" on public.grocery_lists;
create policy "grocery_lists_auth_all"
  on public.grocery_lists
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.grocery_lists to authenticated;

-- Collega articoli a una lista
alter table public.grocery_items add column if not exists list_id uuid references public.grocery_lists (id) on delete cascade;

-- Migra articoli già esistenti senza lista: una lista “storica”
do $$
declare
  default_list_id uuid;
begin
  if exists (
    select 1
    from public.grocery_items
    where list_id is null
    limit 1
  ) then
    insert into public.grocery_lists (created_by) values ('daniele') returning id into default_list_id;
    update public.grocery_items set list_id = default_list_id where list_id is null;
  end if;
end $$;

alter table public.grocery_items alter column list_id set not null;

create index if not exists grocery_items_list_id_idx on public.grocery_items (list_id);

-- Realtime (se la riga dà errore “already member”, ignora)
alter publication supabase_realtime add table public.grocery_lists;
