-- Nome opzionale per ogni lista (mostrato come "Nome · data").
alter table public.grocery_lists add column if not exists title text not null default '';
