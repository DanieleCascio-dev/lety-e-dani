# Contesto progetto per chat/assistente

Questo documento serve a dare contesto rapido a una chat tecnica o a un assistente AI che deve lavorare sul progetto `lety-e-dani`.

## Identita del progetto

`lety-e-dani` e un gestionale personale/familiare mobile first, pensato come PWA installabile. Il nome pubblico nel manifest e `Sunflower Garden`.

L'app gestisce uno spazio condiviso chiamato `garden`, con utenti membri e dati condivisi:

- lista della spesa
- lista desideri
- todo list
- ristoranti/locali vegani salvati e cercati su Google Maps
- calendario condiviso
- profilo utente, tema, avatar e preferenze colore
- gestione admin degli spazi Garden

Il dominio funzionale e personale/familiare, non enterprise. Le scelte UI devono quindi restare semplici, veloci su mobile e coerenti con l'uso quotidiano.

## Stack

- Frontend: Vue 3, Vite, TypeScript, Vue Router.
- UI: Bootstrap 5, CSS custom in `src/assets/main.css`, tema extra in `src/theme/sunflower-blackcat.css`.
- PWA: `vite-plugin-pwa`, manifest `Sunflower Garden`, service worker auto-update.
- Database: Supabase Postgres.
- Auth: Supabase Auth.
- Backend serverless: Supabase Edge Functions in `supabase/functions`.
- Realtime: Supabase Realtime su liste, item, calendar e alcune tabelle garden.
- Mappe/locali: Google Places API New e Google Maps JavaScript API.
- AI: OpenAI chiamato solo da Edge Functions, mai dal browser.

## Comandi principali

```sh
npm install
npm run dev
npm run build
npm run build-only
npm run type-check
```

`npm run build` esegue type-check e build. Su Netlify il comando configurato e `npm run build-only`, publish su `dist`.

## Variabili e segreti

Frontend, in `.env.local`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_MAPS_API_KEY=
```

Edge Functions / Supabase secrets:

```sh
supabase secrets set OPENAI_API_KEY=...
supabase secrets set GOOGLE_PLACES_API_KEY=...
```

Note importanti:

- Non usare mai variabili `VITE_OPENAI_*`: Vite le esporrebbe nel bundle pubblico.
- `OPENAI_API_KEY` serve solo nelle Edge Functions.
- `SUPABASE_SERVICE_ROLE_KEY` viene usata solo lato Edge Function, dove serve per operazioni admin controllate.
- In dev Vite fa proxy di `/__supabase_functions/*` verso `/functions/v1/*` per evitare problemi CORS.

## Entry point e routing

Entry point:

- `src/main.ts`: importa Bootstrap, CSS, tema, registra PWA, inizializza auth/storage, monta Vue.
- `src/App.vue`: shell mobile first, navbar sticky, menu profilo, refresh dati quando la pagina torna visibile.
- `src/router/index.ts`: route e guard auth.

Route principali:

- `/` -> `HomeView`
- `/lista-spesa` -> `ShoppingListView`
- `/lista-desideri` -> `WishListView`
- `/todo` -> `TodoListView`
- `/ristoranti` -> `RestaurantsView`
- `/calendario` -> `CalendarView`
- `/profilo` -> `ProfileView`
- `/login` -> `LoginView`
- `/gestione-garden` -> `GardenAdminView`, solo `powerAdmin`

La guard router aspetta `authInitPromise`. Se Supabase e configurato e l'utente non e valido, manda a `/login`. Se si atterra su home, prova a ripristinare l'ultima scheda principale salvata.

## Architettura frontend

Il progetto usa composable Vue come store applicativi leggeri:

- `src/composables/useAppStorage.ts`: auth app, profili, garden corrente, lista spesa, funzioni AI spesa/offerte.
- `src/composables/useTodoLists.ts`: todo list, items, realtime, CRUD.
- `src/composables/useWishlist.ts`: liste desideri, link preview, status item, realtime.
- `src/composables/useCalendarEvents.ts`: eventi calendario, range fetch, realtime.
- `src/composables/useVeganRestaurantSearch.ts`: ricerca locali tramite Edge Function.
- `src/composables/useRestaurantPlaceSuggest.ts`: autocomplete/dettagli Places tramite Edge Function.
- `src/composables/useTheme.ts`: tema attivo.

`getSupabaseClient()` in `src/lib/supabase.ts` crea un client singleton. Se mancano `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`, ritorna `null`.

La lista spesa ha anche fallback locale quando Supabase non e configurato. Todo, wishlist, calendario e ristoranti richiedono Supabase e login.

## Autenticazione e profili

Supabase Auth gestisce login e sessione. La sessione corrente vive in `src/auth/authSession.ts`.

La tabella `app_user` associa l'utente auth a:

- `app_role`: slug stabile usato in DB come `created_by` / `added_by`.
- `display_name`: nome mostrato in UI.
- `power_admin`: abilita Gestione Garden.
- preferenze profilo: colore icona, forma, navbar, sfondo pagina, avatar.

Non usare `user_metadata` per autorizzazioni. Le decisioni applicative si basano su `app_user`, `garden_member`, RLS e controlli lato Edge Function.

## Modello multi-tenant Garden

Il progetto usa un modello multi-tenant leggero:

- `garden`: spazio condiviso.
- `garden_member`: membership tra `auth.users` e `garden`.
- le tabelle condivise hanno `garden_id`.

Le policy RLS filtrano per `garden_id in (select public.user_garden_ids())`.

Tabelle operative principali:

- `grocery_lists`, `grocery_items`
- `todo_lists`, `todo_items`
- `wishlist_lists`, `wishlist_items`
- `saved_restaurants`
- `calendar_events`
- `app_user`
- `garden`, `garden_member`

Le migrazioni SQL sono in `supabase/sql`. Sono file SQL manuali numerati, non la cartella standard `supabase/migrations`.

## Realtime

I composable aprono canali Supabase Realtime e fanno refetch dopo debounce:

- `groceries_scope`: `grocery_lists`, `grocery_items`
- `todo_scope`: `todo_lists`, `todo_items`
- `wishlist_scope`: `wishlist_lists`, `wishlist_items`
- `calendar_scope`: `calendar_events`

Il pattern e: fetch iniziale, selezione lista valida, poi subscribe. Gli eventi realtime non mutano direttamente lo stato: schedulano un refetch.

## Edge Functions

Le funzioni sono in `supabase/functions`.

- `chat-grocery-list`: usa OpenAI per creare una lista spesa vegana da storico articoli gia presenti nel DB. Verifica JWT utente, `app_user`, membership garden; poi usa service role per inserire lista e items.
- `vegan-offers`: usa OpenAI per generare una bozza di offerte vegane per Lidl, Aldi, Iperlando. L'output e dichiaratamente stimato, non lettura live di volantini.
- `link-preview`: scarica HTML del link e prova a estrarre Open Graph, Twitter tags, JSON-LD Product e prezzo.
- `search-vegan-restaurants`: usa Google Places API New per cercare locali vegani/vegetariani attorno a coordinate.
- `restaurant-place-suggest`: autocomplete e dettagli luogo via Google Places.
- `garden-admin`: operazioni admin su garden, membri e creazione utenti auth; richiede `power_admin`.

Nel `supabase/config.toml`, alcune funzioni hanno `verify_jwt = false` per permettere il preflight CORS. L'autenticazione resta obbligatoria nel codice tramite header `Authorization`, `getUser()` e controlli DB.

## Pattern dati e UX

Pattern ricorrenti:

- Soft delete per alcune liste/item tramite `deleted_at`.
- Stato selezione lista salvato in `localStorage`.
- Input testuali normalizzati e troncati prima di salvare.
- Aggiornamenti ottimistici con rollback su errore.
- Refresh silenzioso quando l'app torna visibile dopo background.
- Mobile first: contenitore centrale stretto, navbar sticky, controlli grandi, swipe reveal in liste.

Per nuove feature, preferire:

- composable dedicato se lo stato e condiviso fra view/componenti
- tipi in `src/types`
- Edge Function se servono segreti, service role, OpenAI o Google API
- RLS per tutte le tabelle in `public`
- `garden_id` per ogni dato condiviso

## Convenzioni di sicurezza

- Non esporre mai `service_role` nel frontend.
- Non mettere chiavi private in `.env.local` con prefisso `VITE_`.
- Ogni tabella esposta in `public` deve avere RLS.
- Le funzioni Edge devono validare sempre utente, profilo app e membership/admin prima di usare service role.
- Le view Postgres, se aggiunte, vanno create con `security_invoker = true` quando possibile.
- Per upload avatar, usare Supabase Storage bucket `avatars` e aggiornare `app_user.avatar_url`.

## Note su deploy

Netlify serve solo il frontend statico:

- build command: `npm run build-only`
- publish: `dist`
- redirect SPA: `/* -> /index.html`

Le Edge Functions vanno deployate su Supabase, non su Netlify:

```sh
supabase functions deploy chat-grocery-list
supabase functions deploy vegan-offers
supabase functions deploy link-preview
supabase functions deploy garden-admin
supabase functions deploy search-vegan-restaurants
supabase functions deploy restaurant-place-suggest
```

Il progetto Supabase collegato in `supabase/config.toml` e:

```txt
vczaexlhpdzzeomkfvqo
```

## Quando una chat lavora sul progetto

Prima di modificare codice:

1. Leggere il file coinvolto e il composable associato.
2. Controllare se la feature usa Supabase, Realtime o Edge Functions.
3. Verificare lo schema SQL in `supabase/sql`.
4. Preservare pattern mobile first e stile Bootstrap/custom esistente.
5. Eseguire almeno `npm run build` o `npm run type-check` quando il cambiamento tocca TypeScript/Vue.

Per domande Supabase, verificare sempre RLS, membership garden, JWT e differenza tra client anon frontend e service role serverless.
