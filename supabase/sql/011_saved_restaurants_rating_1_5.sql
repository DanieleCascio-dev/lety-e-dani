-- Valutazione nostra: da scala 1–10 a 1–5.
-- Esegui in Supabase → SQL Editor se la tabella esisteva già con check rating <= 10.
--
-- Se almeno un voto era > 5, assumiamo la vecchia scala 1–10 e convertiamo tutte le righe
-- in modo proporzionale (1→1, 10→5). Se tutti i voti erano già 1–5, non modifichiamo i numeri.

do $$
begin
  if (select coalesce(max(rating), 0) from public.saved_restaurants) > 5 then
    update public.saved_restaurants
    set rating = greatest(1, least(5, round((rating - 1) / 9.0 * 4) + 1)::int);
  end if;
end $$;

alter table public.saved_restaurants
  drop constraint if exists saved_restaurants_rating_check;

alter table public.saved_restaurants
  add constraint saved_restaurants_rating_check check (rating >= 1 and rating <= 5);
