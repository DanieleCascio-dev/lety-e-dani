import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Serializza le operazioni auth interne (refresh, getSession, persistenza) su una
 * sola catena, senza usare navigator.locks (timeout 5s, HMR, più tab).
 * Riduce race tra TOKEN_REFRESHED e fetch concorrenti rispetto a un no-op.
 */
let authLockTail: Promise<void> = Promise.resolve();

/** Se `fn()` non termina mai (rete/token appesi), senza timeout la catena blocca tutte le operazioni auth → niente JWT sulle richieste PostgREST. */
const AUTH_LOCK_INNER_TIMEOUT_MS = 90_000;

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
    return await Promise.race([
      fn(),
      new Promise<R>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Auth lock: operazione interna oltre ${AUTH_LOCK_INNER_TIMEOUT_MS}ms (possibile rete/token appesi)`,
            ),
          );
        }, AUTH_LOCK_INNER_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    console.error("[supabase auth lock]", e);
    throw e;
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
