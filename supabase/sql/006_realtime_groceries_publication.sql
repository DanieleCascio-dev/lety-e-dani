-- Assicura che lista spesa e articoli emettano eventi Realtime (sync tra utenti).
-- Esegui in Supabase → SQL Editor. Se una tabella è già nella publication, il blocco la salta.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'grocery_items'
  ) then
    alter publication supabase_realtime add table public.grocery_items;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'grocery_lists'
  ) then
    alter publication supabase_realtime add table public.grocery_lists;
  end if;
end $$;
