-- Todo: più liste condivise; ogni voce ha added_by (daniele | letizia).
-- Esegui in Supabase → SQL Editor dopo le migrazioni precedenti.

create table if not exists public.todo_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null check (created_by in ('daniele', 'letizia')),
  title text not null default ''
);

create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.todo_lists (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  added_by text not null check (added_by in ('daniele', 'letizia')),
  created_at timestamptz not null default now()
);

create index if not exists todo_items_list_id_idx on public.todo_items (list_id);
create index if not exists todo_items_list_created_idx on public.todo_items (list_id, created_at asc);

alter table public.todo_lists enable row level security;
alter table public.todo_items enable row level security;

drop policy if exists "todo_lists_auth_all" on public.todo_lists;
create policy "todo_lists_auth_all"
  on public.todo_lists
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "todo_items_auth_all" on public.todo_items;
create policy "todo_items_auth_all"
  on public.todo_items
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.todo_lists to authenticated;
grant select, insert, update, delete on table public.todo_items to authenticated;

-- Realtime (se la riga dà errore «already member», ignora)
alter publication supabase_realtime add table public.todo_lists;
alter publication supabase_realtime add table public.todo_items;
