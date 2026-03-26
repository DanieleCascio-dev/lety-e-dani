-- Aggiunge forme triangolo e stella a icon_shape (dopo 007).
-- Esegui in Supabase SQL Editor.

alter table public.app_user drop constraint if exists app_user_icon_shape_check;

alter table public.app_user
  add constraint app_user_icon_shape_check
  check (
    icon_shape in (
      'circle',
      'square',
      'rounded',
      'diamond',
      'triangle',
      'star'
    )
  );

comment on column public.app_user.icon_shape is
  'Forma: circle | square | rounded | diamond | triangle | star';
