import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Serializza le operazioni auth interne (refresh, getSession, persistenza) su una
 * sola catena, senza usare navigator.locks (timeout 5s, HMR, più tab).
 * Riduce race tra TOKEN_REFRESHED e fetch concorrenti rispetto a un no-op.
 */
let authLockTail: Promise<void> = Promise.resolve();

async function authLockSerial<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const previous = authLockTail;
  let release!: () => void;
  authLockTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
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
      // JWT expiry: Supabase Dashboard → Authentication → Settings (default tipico 3600s).
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof localStorage !== "undefined" ? localStorage : undefined,
      lock: authLockSerial,
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
