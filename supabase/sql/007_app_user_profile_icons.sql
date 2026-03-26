-- Preferenze icona lista spesa (colore + forma) per utente in app_user.
-- Esegui in Supabase SQL Editor dopo le migrazioni precedenti.

alter table public.app_user
  add column if not exists icon_color text;

alter table public.app_user
  add column if not exists icon_shape text;

update public.app_user set icon_shape = 'circle' where icon_shape is null;

alter table public.app_user
  alter column icon_shape set default 'circle';

alter table public.app_user
  alter column icon_shape set not null;

alter table public.app_user
  drop constraint if exists app_user_icon_shape_check;

alter table public.app_user
  add constraint app_user_icon_shape_check
  check (icon_shape in ('circle', 'square', 'rounded', 'diamond'));

comment on column public.app_user.icon_color is 'Colore icona (es. #6b1f3d); null = predefinito per ruolo.';
comment on column public.app_user.icon_shape is 'Forma: circle | square | rounded | diamond';

grant update on table public.app_user to authenticated;

drop policy if exists "app_user_update_own" on public.app_user;
create policy "app_user_update_own"
  on public.app_user for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
