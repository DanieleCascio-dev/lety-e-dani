/**
 * Integrazione OpenAI (preparazione).
 *
 * Dove mettere la chiave:
 * - Locale: file `.env.local` nella root del repo → `OPENAI_API_KEY=sk-...`
 * - Produzione: `supabase secrets set OPENAI_API_KEY=...` per le funzioni che usano OpenAI.
 * - Ricerca ristoranti su Google Maps: `supabase secrets set GOOGLE_PLACES_API_KEY=...`
 *   (Places API New abilitata sul progetto Google Cloud; accetta anche `GOOGLE_MAPS_API_KEY`).
 * - Mappa nel browser (RestaurantMiniMap): `.env.local` → `VITE_GOOGLE_MAPS_API_KEY=...`
 *   con «Maps JavaScript API» abilitata e restrizione HTTP referrer al dominio del sito.
 *
 * Non usare `VITE_OPENAI_*`: Vite esporrebbe la variabile al browser.
 */

export const OPENAI_ENV_VAR_NAME = 'OPENAI_API_KEY' as const

export type OpenAiRequest = {
  /** Testo utente o istruzioni (da usare quando collegherai l’API). */
  prompt: string
}

export type OpenAiResponse = {
  text: string
}

/** Chiamate da browser: usa `createChatGroceryList` in `useAppStorage` (Edge Function `chat-grocery-list`). */
export async function requestOpenAi(_input: OpenAiRequest): Promise<OpenAiResponse> {
  throw new Error('Usa createChatGroceryList dal composable: OpenAI è solo lato Edge Function.')
}
