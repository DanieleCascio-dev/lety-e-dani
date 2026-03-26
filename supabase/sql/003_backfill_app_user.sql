-- Se il login Supabase funziona ma l’app dice "Profilo non trovato in app_user":
-- il trigger su auth.users non ha creato la riga (es. utente creato PRIMA dello script 002).
-- Esegui questo nel SQL Editor (una volta sola, idempotente).

insert into public.app_user (user_id, app_role)
select
  id,
  case lower(email)
    when 'danielecascio2018@gmail.com' then 'daniele'
    when 'letizia.ragione@gmail.com' then 'letizia'
  end
from auth.users
where lower(email) in (
  'danielecascio2018@gmail.com',
  'letizia.ragione@gmail.com'
)
on conflict (user_id) do update
set app_role = excluded.app_role;

-- Verifica in Table Editor → app_user: devono comparire 2 righe (user_id = UUID da Authentication → Users).
