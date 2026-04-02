<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSupabaseClient } from '@/lib/supabase'
import {
  appUserSessionValid,
  lastAppUserFetchError,
  syncSessionToAppUser,
} from '@/composables/useAppStorage'

const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref<string | null>(null)

const canSubmit = computed(() => email.value.trim() && password.value && !loading.value)

async function onSubmit() {
  errorMsg.value = null
  const sb = getSupabaseClient()
  if (!sb) {
    errorMsg.value =
      'Supabase non configurato: in .env.local servono VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (prefisso VITE_ obbligatorio). Poi riavvia il server di sviluppo.'
    return
  }
  loading.value = true
  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    })
    if (error) {
      errorMsg.value = error.message === 'Invalid login credentials' ? 'Email o password non valide.' : error.message
      return
    }
    if (!data.session) {
      errorMsg.value = 'Sessione non disponibile. Riprova.'
      return
    }
    await syncSessionToAppUser(data.session)
    if (!appUserSessionValid.value) {
      errorMsg.value = lastAppUserFetchError.value
        ? `Database: ${lastAppUserFetchError.value}`
        : 'Nessuna riga in tabella public.app_user per il tuo account. In Supabase → SQL Editor esegui il file supabase/sql/003_backfill_app_user.sql (gli utenti creati prima del trigger non vengono aggiunti da soli).'
      return
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect || '/')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-main d-flex align-items-center justify-content-center py-4 py-md-5 px-3">
    <div class="login-wrap w-100" style="max-width: 22rem">
      <div class="login-hero text-center mb-4">
        <p class="text-secondary small mb-2 mb-sm-3 lh-sm px-1 login-welcome">
          Bentornat* nel nostro spazio
        </p>
        <h1 class="h5 fw-semibold mb-1 text-body">Sunflower Garden</h1>
        <p class="text-secondary small mb-0">Accedi con l’account che vi abbiamo abilitato.</p>
      </div>

      <div
        v-if="errorMsg"
        class="alert login-alert small py-2 px-3 mb-3 rounded-3"
        role="alert"
      >
        {{ errorMsg }}
      </div>

      <form class="login-panel card border rounded-3" @submit.prevent="onSubmit">
        <div class="card-body p-4">
          <h2 class="h6 fw-semibold mb-3 text-body">Accedi</h2>
          <div class="mb-3">
            <label for="login-email" class="form-label small fw-semibold">Email</label>
            <input
              id="login-email"
              v-model="email"
              type="email"
              class="form-control rounded-3"
              autocomplete="username"
              required
            />
          </div>
          <div class="mb-4">
            <label for="login-password" class="form-label small fw-semibold">Password</label>
            <input
              id="login-password"
              v-model="password"
              type="password"
              class="form-control rounded-3"
              autocomplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            class="btn btn-primary w-100 rounded-3 py-2 fw-semibold"
            :disabled="!canSubmit"
          >
            {{ loading ? 'Accesso…' : 'Entra' }}
          </button>
        </div>
      </form>
      <p class="text-center text-secondary small mt-3 mb-0 login-footnote">
        Resti collegat* fino a quando non esci: la sessione resta sul dispositivo.
      </p>
    </div>
  </main>
</template>

<style scoped>
.login-main {
  min-height: calc(100dvh - 3.5rem);
}

.login-panel {
  background: var(--bs-secondary-bg);
  color: var(--bs-body-color);
  border-color: var(--bs-border-color-translucent, var(--bs-border-color)) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
}

.login-panel .card-body {
  background: transparent;
}

.login-alert {
  background: rgba(var(--bs-danger-rgb), 0.12);
  border: 1px solid rgba(var(--bs-danger-rgb), 0.28);
  color: var(--bs-danger);
  margin-bottom: 0;
}

.login-footnote {
  line-height: 1.35;
}
</style>
