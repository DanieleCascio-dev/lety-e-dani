-- Nome mostrato in app (scelto dall’utente). `app_role` resta slug stabile per cronologia elenchi.
-- Esegui dopo 017_garden_multitenant.sql.

alter table public.app_user add column if not exists display_name text;

update public.app_user
set display_name = trim(
  case lower(trim(app_role))
    when 'daniele' then 'Daniele'
    when 'letizia' then 'Letizia'
    else initcap(replace(trim(app_role), '_', ' '))
  end
)
where display_name is null or trim(display_name) = '';

update public.app_user
set display_name = left(trim(coalesce(app_role, 'Utente')), 80)
where display_name is null or trim(display_name) = '';

alter table public.app_user alter column display_name set not null;

alter table public.app_user drop constraint if exists app_user_display_name_len;
alter table public.app_user
  add constraint app_user_display_name_len
  check (char_length(trim(display_name)) >= 1 and char_length(trim(display_name)) <= 80);

comment on column public.app_user.display_name is 'Nome mostrato in app; modificabile dall''utente (Profilo).';
comment on column public.app_user.app_role is 'Slug stabile per created_by/added_by nelle liste; non è il nome in UI.';

-- Trigger: account Letizia/Daniele da email note
create or replace function public.handle_new_app_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role text;
  dname text;
begin
  role := case lower(new.email)
    when 'danielecascio2018@gmail.com' then 'daniele'
    when 'letizia.ragione@gmail.com' then 'letizia'
    else null
  end;
  if role is not null then
    dname := case role
      when 'daniele' then 'Daniele'
      when 'letizia' then 'Letizia'
      else initcap(replace(role, '_', ' '))
    end;
    insert into public.app_user (user_id, app_role, display_name)
    values (new.id, role, dname)
    on conflict (user_id) do update set app_role = excluded.app_role;
  end if;
  return new;
end;
$$;

-- Membri dello stesso garden possono leggere app_role + display_name (e altre colonne) degli altri per mostrare “chi ha aggiunto”.
drop policy if exists "app_user_select_garden_peers" on public.app_user;
create policy "app_user_select_garden_peers"
  on public.app_user for select
  to authenticated
  using (
    exists (
      select 1
      from public.garden_member gm_self
      join public.garden_member gm_peer
        on gm_peer.garden_id = gm_self.garden_id
      where gm_self.user_id = auth.uid()
        and gm_peer.user_id = app_user.user_id
    )
  );
