import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Lock “immediato” per GoTrue: evita navigator.locks (timeout 5s, HMR, più tab)
 * che genera warning e può interferire con Realtime.
 */
async function authLockImmediate<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  return fn();
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    client = null;
    return null;
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof localStorage !== "undefined" ? localStorage : undefined,
      lock: authLockImmediate,
    },
    realtime: {
      // Evita burst di riconnessione se auth e WS competono sul primo caricamento
      params: {
        eventsPerSecond: 10,
      },
    },
  });
  return client;
}
