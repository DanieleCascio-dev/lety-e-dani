-- Colori interfaccia (navbar + sfondo pagine) in app_user.
-- Esegui in Supabase SQL Editor dopo le migrazioni precedenti.

alter table public.app_user
  add column if not exists navbar_bg text;

alter table public.app_user
  add column if not exists page_bg text;

comment on column public.app_user.navbar_bg is 'Sfondo navbar (#RRGGBB); null = tema predefinito (bg-body).';
comment on column public.app_user.page_bg is 'Sfondo area contenuti (#RRGGBB); null = grigio app.';
