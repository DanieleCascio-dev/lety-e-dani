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
  <main class="login-main d-flex align-items-center py-5">
    <div class="container px-3" style="max-width: 22rem">
      <h1 class="h4 text-center mb-4 fw-semibold">Accedi</h1>
      <p class="text-secondary small text-center mb-4">Lety e Dani — solo account autorizzati</p>

      <div v-if="errorMsg" class="alert alert-danger small py-2 mb-3" role="alert">
        {{ errorMsg }}
      </div>

      <form class="card shadow-sm border-0" @submit.prevent="onSubmit">
        <div class="card-body p-4">
          <div class="mb-3">
            <label for="login-email" class="form-label">Email</label>
            <input
              id="login-email"
              v-model="email"
              type="email"
              class="form-control"
              autocomplete="username"
              required
            />
          </div>
          <div class="mb-4">
            <label for="login-password" class="form-label">Password</label>
            <input
              id="login-password"
              v-model="password"
              type="password"
              class="form-control"
              autocomplete="current-password"
              required
            />
          </div>
          <button type="submit" class="btn btn-primary w-100" :disabled="!canSubmit">
            {{ loading ? 'Accesso…' : 'Entra' }}
          </button>
        </div>
      </form>
      <p class="text-center text-secondary small mt-3 mb-0">Resti collegato fino al logout (sessione salvata sul dispositivo).</p>
    </div>
  </main>
</template>

<style scoped>
.login-main {
  min-height: 70vh;
}
</style>
