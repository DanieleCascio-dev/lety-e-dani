/** Messaggi errore leggibili su mobile (503, rete, ecc.) */
export function friendlyErrorMessage(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  const s = raw.toLowerCase()
  if (
    s.includes('503') ||
    s.includes('service unavailable') ||
    s.includes('temporarily unavailable')
  ) {
    return 'Servizio in pausa. Riprova tra poco.'
  }
  if (s.includes('502') || s.includes('504') || s.includes('gateway')) {
    return 'Connessione instabile. Riprova.'
  }
  if (s.includes('500') || s.includes('internal server')) {
    return 'Errore sul server. Riprova più tardi.'
  }
  if (s.includes('404') || s.includes('not found')) {
    return 'Risorsa non trovata.'
  }
  if (
    s.includes('network') ||
    s.includes('fetch') ||
    s.includes('failed to fetch') ||
    s.includes('networkerror')
  ) {
    return 'Controlla la connessione e riprova.'
  }
  if (s.includes('401') || s.includes('403') || s.includes('unauthorized')) {
    return 'Sessione scaduta. Accedi di nuovo.'
  }
  return raw.trim()
}

export function notesPreview(notes: string | null | undefined, max = 48): string {
  const t = (notes ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
