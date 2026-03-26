import { ref } from 'vue'
import type { Session } from '@supabase/supabase-js'

/** Sessione Supabase corrente (null = non loggato). Aggiornata da useAppStorage / init auth. */
export const authSession = ref<Session | null>(null)
