-- Dopo il login: lista spesa solo per utenti autenticati (JWT). Esegui in SQL Editor.
-- Il frontend legge `public.app_user` (colonna app_role) per sapere se sei daniele o letizia.
-- 1) In Authentication → Settings: disabilita "Sign ups" se vuoi solo utenti creati da te.
-- 2) Authentication → Users → Add user: crea i due account con le password (non vanno mai nel codice).
-- 3) Poi esegui questo script.

-- Tabella profilo app (nessuna password qui: le password restano in auth.users)
create table if not exists public.app_user (
  user_id uuid primary key references auth.users (id) on delete cascade,
  app_role text not null check (app_role in ('daniele', 'letizia')),
  created_at timestamptz not null default now()
);

alter table public.app_user enable row level security;

drop policy if exists "app_user_select_own" on public.app_user;
create policy "app_user_select_own"
  on public.app_user for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.app_user to authenticated;

-- Alla creazione di un utente in auth, se l’email è una delle due autorizzate, crea la riga app_user
create or replace function public.handle_new_app_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role text;
begin
  role := case lower(new.email)
    when 'danielecascio2018@gmail.com' then 'daniele'
    when 'letizia.ragione@gmail.com' then 'letizia'
    else null
  end;
  if role is not null then
    insert into public.app_user (user_id, app_role)
    values (new.id, role)
    on conflict (user_id) do update set app_role = excluded.app_role;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_app_user on auth.users;
create trigger on_auth_user_created_app_user
  after insert on auth.users
  for each row
  execute function public.handle_new_app_user();

-- Se gli utenti esistevano già prima del trigger, esegui anche: supabase/sql/003_backfill_app_user.sql

-- Lista spesa: togli accesso anon, solo autenticati
drop policy if exists "grocery_items_anon_all" on public.grocery_items;
revoke all on table public.grocery_items from anon;

drop policy if exists "grocery_items_auth_all" on public.grocery_items;
create policy "grocery_items_auth_all"
  on public.grocery_items
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on table public.grocery_items to authenticated;
