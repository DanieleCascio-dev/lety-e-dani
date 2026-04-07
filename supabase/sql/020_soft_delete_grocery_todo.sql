-- Soft delete per liste e articoli (spesa + todo): i record restano per storico / Chat lista.
-- Esegui in Supabase → SQL Editor dopo le migrazioni precedenti.

alter table public.grocery_lists add column if not exists deleted_at timestamptz;
alter table public.grocery_items add column if not exists deleted_at timestamptz;
alter table public.todo_lists add column if not exists deleted_at timestamptz;
alter table public.todo_items add column if not exists deleted_at timestamptz;

comment on column public.grocery_lists.deleted_at is 'NULL = lista visibile; valorizzato = nascosta in UI, record conservato.';
comment on column public.grocery_items.deleted_at is 'NULL = articolo visibile; valorizzato = nascosto in UI, record conservato.';
comment on column public.todo_lists.deleted_at is 'NULL = lista visibile; valorizzato = nascosta in UI, record conservato.';
comment on column public.todo_items.deleted_at is 'NULL = voce visibile; valorizzato = nascosta in UI, record conservato.';

create index if not exists grocery_lists_active_idx on public.grocery_lists (garden_id, created_at desc)
  where deleted_at is null;
create index if not exists grocery_items_list_active_idx on public.grocery_items (list_id)
  where deleted_at is null;
create index if not exists todo_lists_active_idx on public.todo_lists (garden_id, created_at desc)
  where deleted_at is null;
create index if not exists todo_items_list_active_idx on public.todo_items (list_id)
  where deleted_at is null;
