-- Metadati Google opzionali per allineare la lista salvata ai risultati di ricerca.
alter table public.saved_restaurants add column if not exists place_id text;
alter table public.saved_restaurants add column if not exists address text;
alter table public.saved_restaurants add column if not exists category_label text;
alter table public.saved_restaurants add column if not exists google_rating double precision;
alter table public.saved_restaurants add column if not exists google_review_count integer;
alter table public.saved_restaurants add column if not exists extra_notes text;
alter table public.saved_restaurants add column if not exists latitude double precision;
alter table public.saved_restaurants add column if not exists longitude double precision;
