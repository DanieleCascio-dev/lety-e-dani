/**
 * Ambiente Deno (Supabase Edge Functions): tipi minimi per IDE / `tsc` senza estensione Deno.
 * Il deploy usa comunque Deno con `deno.json`.
 */
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}
