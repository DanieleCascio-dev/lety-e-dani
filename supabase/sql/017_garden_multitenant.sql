-- Multi-tenant: garden (spazi), garden_member, garden_id su dati condivisi, RLS per membership.
-- Migrazione: un garden "Sunflower Garden", membri app_user daniele+letizia, backfill garden_id, power_admin su daniele.
-- Esegui in Supabase → SQL Editor dopo le migrazioni precedenti.

-- ---------------------------------------------------------------------------
-- 1. Tabelle garden / garden_member
-- ---------------------------------------------------------------------------
create table if not exists public.garden (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.garden_member (
  garden_id uuid not null references public.garden (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (garden_id, user_id)
);

create index if not exists garden_member_user_id_idx on public.garden_member (user_id);
create index if not exists garden_member_garden_id_idx on public.garden_member (garden_id);

-- ---------------------------------------------------------------------------
-- 2. app_user: power_admin + ruolo testuale (non solo daniele/letizia)
-- ---------------------------------------------------------------------------
alter table public.app_user add column if not exists power_admin boolean not null default false;

alter table public.app_user drop constraint if exists app_user_app_role_check;

alter table public.app_user
  add constraint app_user_app_role_nonempty check (char_length(trim(app_role)) > 0);

-- ---------------------------------------------------------------------------
-- 3. Colonne garden_id (nullable fino al backfill)
-- ---------------------------------------------------------------------------
alter table public.grocery_lists add column if not exists garden_id uuid references public.garden (id);
alter table public.todo_lists add column if not exists garden_id uuid references public.garden (id);
alter table public.wishlist_lists add column if not exists garden_id uuid references public.garden (id);
alter table public.saved_restaurants add column if not exists garden_id uuid references public.garden (id);

create index if not exists grocery_lists_garden_id_idx on public.grocery_lists (garden_id);
create index if not exists todo_lists_garden_id_idx on public.todo_lists (garden_id);
create index if not exists wishlist_lists_garden_id_idx on public.wishlist_lists (garden_id);
create index if not exists saved_restaurants_garden_id_idx on public.saved_restaurants (garden_id);

-- ---------------------------------------------------------------------------
-- 4. Rimuovi CHECK su created_by / added_by (nuovi utenti)
-- ---------------------------------------------------------------------------
alter table public.grocery_lists drop constraint if exists grocery_lists_created_by_check;
alter table public.grocery_items drop constraint if exists grocery_items_added_by_check;
alter table public.todo_lists drop constraint if exists todo_lists_created_by_check;
alter table public.todo_items drop constraint if exists todo_items_added_by_check;
alter table public.wishlist_lists drop constraint if exists wishlist_lists_created_by_check;
alter table public.wishlist_items drop constraint if exists wishlist_items_created_by_check;
alter table public.saved_restaurants drop constraint if exists saved_restaurants_created_by_check;

-- ---------------------------------------------------------------------------
-- 5. Helper SQL (SECURITY DEFINER: lettura membership senza ricorsione RLS)
-- ---------------------------------------------------------------------------
create or replace function public.user_garden_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select gm.garden_id
  from public.garden_member gm
  where gm.user_id = auth.uid();
$$;

create or replace function public.is_power_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select au.power_admin from public.app_user au where au.user_id = uid limit 1),
    false
  );
$$;

grant execute on function public.user_garden_ids() to authenticated;
grant execute on function public.is_power_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Backfill: garden legacy + membri L+D + garden_id su tutte le righe
-- ---------------------------------------------------------------------------
do $$
declare
  gid uuid;
begin
  insert into public.garden (name) values ('Sunflower Garden') returning id into gid;

  insert into public.garden_member (garden_id, user_id)
  select gid, au.user_id
  from public.app_user au
  where au.app_role in ('daniele', 'letizia')
  on conflict do nothing;

  update public.grocery_lists set garden_id = gid where garden_id is null;
  update public.todo_lists set garden_id = gid where garden_id is null;
  update public.wishlist_lists set garden_id = gid where garden_id is null;
  update public.saved_restaurants set garden_id = gid where garden_id is null;
end $$;

update public.app_user
set power_admin = true
where app_role = 'daniele';

-- ---------------------------------------------------------------------------
-- 7. NOT NULL su garden_id
-- ---------------------------------------------------------------------------
alter table public.grocery_lists alter column garden_id set not null;
alter table public.todo_lists alter column garden_id set not null;
alter table public.wishlist_lists alter column garden_id set not null;
alter table public.saved_restaurants alter column garden_id set not null;

-- ---------------------------------------------------------------------------
-- 8. RLS: garden
-- ---------------------------------------------------------------------------
alter table public.garden enable row level security;

drop policy if exists "garden_select_member" on public.garden;
create policy "garden_select_member"
  on public.garden for select
  to authenticated
  using (id in (select public.user_garden_ids()));

drop policy if exists "garden_update_name_member" on public.garden;
create policy "garden_update_name_member"
  on public.garden for update
  to authenticated
  using (id in (select public.user_garden_ids()))
  with check (id in (select public.user_garden_ids()));

drop policy if exists "garden_insert_power_admin" on public.garden;
create policy "garden_insert_power_admin"
  on public.garden for insert
  to authenticated
  with check (public.is_power_admin(auth.uid()));

drop policy if exists "garden_delete_power_admin" on public.garden;
create policy "garden_delete_power_admin"
  on public.garden for delete
  to authenticated
  using (public.is_power_admin(auth.uid()));

grant select, insert, update, delete on table public.garden to authenticated;

-- ---------------------------------------------------------------------------
-- 9. RLS: garden_member
-- ---------------------------------------------------------------------------
alter table public.garden_member enable row level security;

drop policy if exists "garden_member_select_own" on public.garden_member;
create policy "garden_member_select_own"
  on public.garden_member for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_power_admin(auth.uid())
  );

drop policy if exists "garden_member_insert_admin" on public.garden_member;
create policy "garden_member_insert_admin"
  on public.garden_member for insert
  to authenticated
  with check (public.is_power_admin(auth.uid()));

drop policy if exists "garden_member_update_admin" on public.garden_member;
create policy "garden_member_update_admin"
  on public.garden_member for update
  to authenticated
  using (public.is_power_admin(auth.uid()))
  with check (public.is_power_admin(auth.uid()));

drop policy if exists "garden_member_delete_admin" on public.garden_member;
create policy "garden_member_delete_admin"
  on public.garden_member for delete
  to authenticated
  using (public.is_power_admin(auth.uid()));

grant select, insert, update, delete on table public.garden_member to authenticated;

-- ---------------------------------------------------------------------------
-- 10. app_user: lettura per power admin (lista utenti app)
-- ---------------------------------------------------------------------------
drop policy if exists "app_user_select_power_admin" on public.app_user;
create policy "app_user_select_power_admin"
  on public.app_user for select
  to authenticated
  using (public.is_power_admin(auth.uid()));

-- (policy "app_user_select_own" già esistente — coesiste in OR)

-- ---------------------------------------------------------------------------
-- 11. Sostituisci RLS liste / items / ristoranti
-- ---------------------------------------------------------------------------
-- grocery_lists
drop policy if exists "grocery_lists_auth_all" on public.grocery_lists;
create policy "grocery_lists_garden"
  on public.grocery_lists for all
  to authenticated
  using (garden_id in (select public.user_garden_ids()))
  with check (garden_id in (select public.user_garden_ids()));

-- grocery_items (tramite lista)
drop policy if exists "grocery_items_auth_all" on public.grocery_items;
create policy "grocery_items_garden"
  on public.grocery_items for all
  to authenticated
  using (
    exists (
      select 1 from public.grocery_lists gl
      where gl.id = grocery_items.list_id
        and gl.garden_id in (select public.user_garden_ids())
    )
  )
  with check (
    exists (
      select 1 from public.grocery_lists gl
      where gl.id = grocery_items.list_id
        and gl.garden_id in (select public.user_garden_ids())
    )
  );

-- todo_lists
drop policy if exists "todo_lists_auth_all" on public.todo_lists;
create policy "todo_lists_garden"
  on public.todo_lists for all
  to authenticated
  using (garden_id in (select public.user_garden_ids()))
  with check (garden_id in (select public.user_garden_ids()));

-- todo_items
drop policy if exists "todo_items_auth_all" on public.todo_items;
create policy "todo_items_garden"
  on public.todo_items for all
  to authenticated
  using (
    exists (
      select 1 from public.todo_lists tl
      where tl.id = todo_items.list_id
        and tl.garden_id in (select public.user_garden_ids())
    )
  )
  with check (
    exists (
      select 1 from public.todo_lists tl
      where tl.id = todo_items.list_id
        and tl.garden_id in (select public.user_garden_ids())
    )
  );

-- wishlist_lists
drop policy if exists "wishlist_lists_auth_all" on public.wishlist_lists;
create policy "wishlist_lists_garden"
  on public.wishlist_lists for all
  to authenticated
  using (garden_id in (select public.user_garden_ids()))
  with check (garden_id in (select public.user_garden_ids()));

-- wishlist_items
drop policy if exists "wishlist_items_auth_all" on public.wishlist_items;
create policy "wishlist_items_garden"
  on public.wishlist_items for all
  to authenticated
  using (
    exists (
      select 1 from public.wishlist_lists wl
      where wl.id = wishlist_items.list_id
        and wl.garden_id in (select public.user_garden_ids())
    )
  )
  with check (
    exists (
      select 1 from public.wishlist_lists wl
      where wl.id = wishlist_items.list_id
        and wl.garden_id in (select public.user_garden_ids())
    )
  );

-- saved_restaurants
drop policy if exists "saved_restaurants_auth_all" on public.saved_restaurants;
create policy "saved_restaurants_garden"
  on public.saved_restaurants for all
  to authenticated
  using (garden_id in (select public.user_garden_ids()))
  with check (garden_id in (select public.user_garden_ids()));

-- ---------------------------------------------------------------------------
-- 12. Realtime (opzionale: se fallisce "already member", ignorare)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.garden;
