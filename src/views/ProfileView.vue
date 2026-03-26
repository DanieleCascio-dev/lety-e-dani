<script setup lang="ts">
  import { computed, onMounted, ref, watch } from "vue";
  import { getSupabaseClient } from "@/lib/supabase";
  import { authSession } from "@/auth/authSession";
  import {
    refreshAppUserProfileFromDb,
    saveAppUserIconPreferences,
    useAppStorage,
  } from "@/composables/useAppStorage";
  import type { IconShape } from "@/types/app";

  const { activeUser, userProfiles } = useAppStorage();

  const currentEmail = computed(() => authSession.value?.user?.email ?? "");

  const emailNew = ref("");
  const emailMsg = ref<string | null>(null);
  const emailLoading = ref(false);

  const passwordNew = ref("");
  const passwordConfirm = ref("");
  const passwordMsg = ref<string | null>(null);
  const passwordLoading = ref(false);

  const useDefaultIconColor = ref(true);
  const iconColorHex = ref("#c9a227");
  const iconShape = ref<IconShape>("circle");
  const iconMsg = ref<string | null>(null);
  const iconLoading = ref(false);

  const shapeOptions: { value: IconShape; label: string }[] = [
    { value: "circle", label: "Cerchio" },
    { value: "square", label: "Quadrato" },
    { value: "rounded", label: "Arrotondato" },
    { value: "diamond", label: "Rombo" },
    { value: "triangle", label: "Triangolo" },
    { value: "star", label: "Stella" },
  ];

  function applyProfileToForm() {
    const p = userProfiles.value[activeUser.value];
    const hasCustom = Boolean(p.iconColor);
    useDefaultIconColor.value = !hasCustom;
    iconColorHex.value =
      p.iconColor ?? (activeUser.value === "daniele" ? "#6b1f3d" : "#c9a227");
    iconShape.value = p.iconShape ?? "circle";
  }

  onMounted(async () => {
    await refreshAppUserProfileFromDb();
    applyProfileToForm();
    emailNew.value = currentEmail.value;
  });

  watch(currentEmail, (v) => {
    if (!emailNew.value || emailNew.value === currentEmail.value)
      emailNew.value = v;
  });

  const previewClasses = computed(() => {
    const p = userProfiles.value[activeUser.value];
    const shape = iconShape.value;
    const parts = ["grocery-text-icon", `grocery-text-icon--shape-${shape}`];
    if (useDefaultIconColor.value) {
      parts.push(
        activeUser.value === "daniele"
          ? "grocery-text-icon--palette-daniele"
          : "grocery-text-icon--palette-letizia",
      );
    }
    return parts.join(" ");
  });

  const previewStyle = computed(() => {
    if (useDefaultIconColor.value) return undefined;
    return {
      background: iconColorHex.value,
      boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)",
    };
  });

  async function saveEmail() {
    emailMsg.value = null;
    const next = emailNew.value.trim();
    if (!next) {
      emailMsg.value = "Inserisci un indirizzo email.";
      return;
    }
    if (next === currentEmail.value) {
      emailMsg.value = "L’email è già quella attuale.";
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      emailMsg.value = "Supabase non configurato.";
      return;
    }
    emailLoading.value = true;
    try {
      const { error } = await sb.auth.updateUser({ email: next });
      if (error) {
        emailMsg.value = error.message;
        return;
      }
      emailMsg.value =
        "Richiesta inviata: controlla la posta per confermare il nuovo indirizzo (se richiesto dalle impostazioni Supabase).";
    } finally {
      emailLoading.value = false;
    }
  }

  async function savePassword() {
    passwordMsg.value = null;
    const p1 = passwordNew.value;
    const p2 = passwordConfirm.value;
    if (p1.length < 8) {
      passwordMsg.value = "La password deve avere almeno 8 caratteri.";
      return;
    }
    if (p1 !== p2) {
      passwordMsg.value = "Le password non coincidono.";
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      passwordMsg.value = "Supabase non configurato.";
      return;
    }
    passwordLoading.value = true;
    try {
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) {
        passwordMsg.value = error.message;
        return;
      }
      passwordNew.value = "";
      passwordConfirm.value = "";
      passwordMsg.value = "Password aggiornata.";
    } finally {
      passwordLoading.value = false;
    }
  }

  async function saveIconPreferences() {
    iconMsg.value = null;
    iconLoading.value = true;
    try {
      const color = useDefaultIconColor.value ? null : iconColorHex.value;
      const res = await saveAppUserIconPreferences(color, iconShape.value);
      if (!res.ok) {
        iconMsg.value = res.error ?? "Errore nel salvataggio.";
        return;
      }
      iconMsg.value = "Preferenze icona salvate.";
    } finally {
      iconLoading.value = false;
    }
  }
</script>

<template>
  <main class="profile-main pb-5">
    <div class="container-fluid px-3 px-sm-4" style="max-width: 28rem">
      <h1 class="h4 mb-3 fw-semibold">Profilo</h1>
      <p class="text-secondary small mb-4">
        Account
        <strong>{{ activeUser === "daniele" ? "Daniele" : "Letizia" }}</strong>
        — email, password e aspetto dell’icona negli elenchi (lista spesa,
        ecc.).
      </p>

      <section class="card shadow-sm border-0 mb-3">
        <div class="card-body">
          <h2 class="h6 mb-3">Email</h2>
          <p class="small text-secondary mb-2">
            Attuale: <strong>{{ currentEmail || "—" }}</strong>
          </p>
          <label for="profile-email" class="form-label small"
            >Nuova email</label
          >
          <input
            id="profile-email"
            v-model="emailNew"
            type="email"
            class="form-control mb-2"
            autocomplete="email"
          />
          <p
            v-if="emailMsg"
            class="small mb-2"
            :class="
              emailMsg.startsWith('Richiesta') ? 'text-success' : 'text-danger'
            "
          >
            {{ emailMsg }}
          </p>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="emailLoading"
            @click="saveEmail"
          >
            {{ emailLoading ? "Invio…" : "Aggiorna email" }}
          </button>
        </div>
      </section>

      <section class="card shadow-sm border-0 mb-3">
        <div class="card-body">
          <h2 class="h6 mb-3">Password</h2>
          <div class="mb-2">
            <label for="profile-pw" class="form-label small"
              >Nuova password</label
            >
            <input
              id="profile-pw"
              v-model="passwordNew"
              type="password"
              class="form-control"
              autocomplete="new-password"
            />
          </div>
          <div class="mb-2">
            <label for="profile-pw2" class="form-label small"
              >Ripeti password</label
            >
            <input
              id="profile-pw2"
              v-model="passwordConfirm"
              type="password"
              class="form-control"
              autocomplete="new-password"
            />
          </div>
          <p
            v-if="passwordMsg"
            class="small mb-2"
            :class="
              passwordMsg === 'Password aggiornata.'
                ? 'text-success'
                : 'text-danger'
            "
          >
            {{ passwordMsg }}
          </p>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="passwordLoading"
            @click="savePassword"
          >
            {{ passwordLoading ? "Salvataggio…" : "Aggiorna password" }}
          </button>
        </div>
      </section>

      <section class="card shadow-sm border-0 mb-3">
        <div class="card-body">
          <h2 class="h6 mb-2">Icona negli elenchi</h2>
          <p class="small text-secondary mb-3">
            Colore e forma del segnaposto accanto agli articoli e alle liste.
          </p>

          <div class="d-flex align-items-center gap-3 mb-3">
            <span
              class="profile-icon-preview"
              :class="previewClasses"
              :style="previewStyle"
              aria-hidden="true"
            />
            <span class="small text-secondary">Anteprima</span>
          </div>

          <div class="form-check mb-3">
            <input
              id="profile-default-color"
              v-model="useDefaultIconColor"
              class="form-check-input"
              type="checkbox"
            />
            <label class="form-check-label small" for="profile-default-color">
              Usa colori predefiniti dell’app (viola Daniele / oro Letizia)
            </label>
          </div>

          <div v-if="!useDefaultIconColor" class="mb-3">
            <label for="profile-color" class="form-label small">Colore</label>
            <input
              id="profile-color"
              v-model="iconColorHex"
              type="color"
              class="form-control form-control-color w-25"
              title="Scegli colore"
            />
          </div>

          <div class="mb-3">
            <label for="profile-shape" class="form-label small">Forma</label>
            <select id="profile-shape" v-model="iconShape" class="form-select">
              <option
                v-for="opt in shapeOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>

          <p
            v-if="iconMsg"
            class="small mb-2"
            :class="
              iconMsg.includes('salvate') ? 'text-success' : 'text-danger'
            "
          >
            {{ iconMsg }}
          </p>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="iconLoading"
            @click="saveIconPreferences"
          >
            {{ iconLoading ? "Salvataggio…" : "Salva icona" }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
  .profile-main {
    padding-top: 0.75rem;
  }

  .profile-icon-preview {
    display: inline-block;
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .profile-icon-preview.grocery-text-icon--shape-circle {
    border-radius: 50%;
  }

  .profile-icon-preview.grocery-text-icon--shape-square {
    border-radius: 0;
  }

  .profile-icon-preview.grocery-text-icon--shape-rounded {
    border-radius: 35%;
  }

  .profile-icon-preview.grocery-text-icon--shape-diamond {
    border-radius: 12%;
    transform: rotate(45deg) scale(0.92);
  }

  .profile-icon-preview.grocery-text-icon--shape-triangle {
    border-radius: 0;
    clip-path: polygon(50% 4%, 4% 96%, 96% 96%);
  }

  .profile-icon-preview.grocery-text-icon--shape-star {
    border-radius: 0;
    clip-path: polygon(
      50% 0%,
      61% 35%,
      98% 35%,
      68% 57%,
      79% 91%,
      50% 70%,
      21% 91%,
      32% 57%,
      2% 35%,
      39% 35%
    );
  }

  .profile-icon-preview.grocery-text-icon--palette-daniele {
    background: linear-gradient(135deg, #6b1f3d 0%, #4b2a6e 100%);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
  }

  .profile-icon-preview.grocery-text-icon--palette-letizia {
    background: #c9a227;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
  }
</style>
