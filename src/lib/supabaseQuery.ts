/** Timeout predefinito per query PostgREST (evita fetch appesi che bloccano UI e mutex auth). */
export const SUPABASE_QUERY_TIMEOUT_MS = 45_000

/**
 * Segnale di abort per `.abortSignal(...)` sulle catene Supabase PostgREST.
 * Se `AbortSignal.timeout` non è disponibile, usa AbortController + setTimeout.
 */
export function queryAbortSignal(ms: number = SUPABASE_QUERY_TIMEOUT_MS): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const c = new AbortController()
  setTimeout(() => c.abort(), ms)
  return c.signal
}
