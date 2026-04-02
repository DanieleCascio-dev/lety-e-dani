<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { getSupabaseClient } from "@/lib/supabase";

type GardenRow = { id: string; name: string; created_at: string };
type MemberRow = { garden_id: string; user_id: string; joined_at: string };
type AuthUserRow = { id: string; email: string | null; created_at: string };
type AppUserRow = {
  user_id: string;
  app_role: string;
  power_admin: boolean;
  created_at: string;
};

const loading = ref(true);
const busy = ref(false);
const pageError = ref<string | null>(null);
const actionMsg = ref<string | null>(null);
const actionMsgIsError = ref(false);

const gardens = ref<GardenRow[]>([]);
const selectedGardenId = ref("");
const members = ref<MemberRow[]>([]);
const authUsers = ref<AuthUserRow[]>([]);
const appUsers = ref<AppUserRow[]>([]);

const newGardenName = ref("");
const addUserId = ref("");

async function invokeGardenAdmin(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sb = getSupabaseClient();
  if (!sb) throw new Error("Supabase non configurato.");
  const {
    data: { session },
  } = await sb.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sessione non valida.");

  const useDevProxy =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    import.meta.env.VITE_SUPABASE_URL;

  if (useDevProxy) {
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!anon) throw new Error("VITE_SUPABASE_ANON_KEY mancante.");
    const res = await fetch(
      `${window.location.origin}/__supabase_functions/garden-admin`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anon,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    const err =
      typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
    if (!res.ok || json.error) throw new Error(err);
    return json;
  }

  const { data, error } = await sb.functions.invoke("garden-admin", { body });
  if (error) throw new Error(error.message);
  const json = (data ?? {}) as Record<string, unknown>;
  if (typeof json.error === "string") throw new Error(json.error);
  return json;
}

const memberIds = computed(() => new Set(members.value.map((m) => m.user_id)));

const candidateUsers = computed(() =>
  authUsers.value.filter((u) => !memberIds.value.has(u.id)),
);

function emailForUserId(userId: string): string {
  const u = authUsers.value.find((x) => x.id === userId);
  return u?.email ?? userId.slice(0, 8) + "…";
}

function appRoleForUserId(userId: string): string | null {
  const r = appUsers.value.find((x) => x.user_id === userId);
  return r?.app_role ?? null;
}

async function refreshGardensAndCatalog() {
  const g = (await invokeGardenAdmin({ action: "listGardens" })) as {
    gardens?: GardenRow[];
  };
  gardens.value = g.gardens ?? [];
  if (
    selectedGardenId.value &&
    !gardens.value.some((x) => x.id === selectedGardenId.value)
  ) {
    selectedGardenId.value = "";
  }
  if (!selectedGardenId.value && gardens.value.length) {
    selectedGardenId.value = gardens.value[0]!.id;
  }

  const au = (await invokeGardenAdmin({ action: "listAuthUsers" })) as {
    users?: AuthUserRow[];
  };
  authUsers.value = au.users ?? [];

  const ap = (await invokeGardenAdmin({ action: "listAppUsers" })) as {
    appUsers?: AppUserRow[];
  };
  appUsers.value = ap.appUsers ?? [];
}

async function loadMembers() {
  const gid = selectedGardenId.value;
  if (!gid) {
    members.value = [];
    return;
  }
  const res = (await invokeGardenAdmin({
    action: "listMembers",
    gardenId: gid,
  })) as { members?: MemberRow[] };
  members.value = res.members ?? [];
}

async function loadPage() {
  pageError.value = null;
  loading.value = true;
  try {
    await refreshGardensAndCatalog();
    await loadMembers();
  } catch (e) {
    pageError.value = e instanceof Error ? e.message : "Errore di caricamento";
  } finally {
    loading.value = false;
  }
}

watch(selectedGardenId, () => {
  void loadMembers();
});

onMounted(() => {
  void loadPage();
});

async function createGarden() {
  actionMsg.value = null;
  actionMsgIsError.value = false;
  busy.value = true;
  try {
    await invokeGardenAdmin({
      action: "createGarden",
      name: newGardenName.value.trim() || undefined,
    });
    newGardenName.value = "";
    await refreshGardensAndCatalog();
    await loadMembers();
    actionMsg.value = "Spazio creato.";
  } catch (e) {
    actionMsgIsError.value = true;
    actionMsg.value = e instanceof Error ? e.message : "Errore";
  } finally {
    busy.value = false;
  }
}

async function addSelectedMember() {
  const gid = selectedGardenId.value;
  const uid = addUserId.value.trim();
  if (!gid || !uid) return;
  actionMsg.value = null;
  actionMsgIsError.value = false;
  busy.value = true;
  try {
    await invokeGardenAdmin({
      action: "ensureAppUser",
      userId: uid,
    });
    await invokeGardenAdmin({
      action: "addMember",
      gardenId: gid,
      userId: uid,
    });
    addUserId.value = "";
    await loadMembers();
    await refreshGardensAndCatalog();
    actionMsg.value = "Membro aggiunto.";
  } catch (e) {
    actionMsgIsError.value = true;
    actionMsg.value = e instanceof Error ? e.message : "Errore";
  } finally {
    busy.value = false;
  }
}

async function removeMember(userId: string) {
  const gid = selectedGardenId.value;
  if (!gid) return;
  actionMsg.value = null;
  actionMsgIsError.value = false;
  busy.value = true;
  try {
    await invokeGardenAdmin({
      action: "removeMember",
      gardenId: gid,
      userId,
    });
    await loadMembers();
    actionMsg.value = "Membro rimosso.";
  } catch (e) {
    actionMsgIsError.value = true;
    actionMsg.value = e instanceof Error ? e.message : "Errore";
  } finally {
    busy.value = false;
  }
}

const selectedGardenName = computed(() => {
  const g = gardens.value.find((x) => x.id === selectedGardenId.value);
  return g?.name ?? "";
});
</script>

<template>
  <main class="garden-admin-main pb-5">
    <div class="container-fluid px-3 px-sm-4" style="max-width: 36rem">
      <h1 class="h4 mb-3 fw-semibold">Gestione Garden</h1>
      <p class="text-secondary small mb-4">
        Crea spazi condivisi e assegna gli utenti. Il
        <strong>nome dello spazio</strong> lo scelgono i membri dal profilo.
      </p>

      <p v-if="pageError" class="text-danger small mb-3">{{ pageError }}</p>
      <p
        v-else-if="actionMsg"
        class="small mb-3"
        :class="actionMsgIsError ? 'text-danger' : 'text-success'"
      >
        {{ actionMsg }}
      </p>

      <div v-if="loading" class="text-secondary small">Caricamento…</div>

      <template v-else>
        <section class="card shadow-sm border-0 mb-3">
          <div class="card-body">
            <h2 class="h6 mb-3">Nuovo spazio</h2>
            <label for="ga-new-name" class="form-label small"
              >Nome iniziale (opzionale)</label
            >
            <input
              id="ga-new-name"
              v-model="newGardenName"
              type="text"
              class="form-control form-control-sm mb-2"
              maxlength="120"
              placeholder="es. Spazio di Marco"
              :disabled="busy"
            />
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="busy"
              @click="createGarden"
            >
              Crea garden
            </button>
          </div>
        </section>

        <section class="card shadow-sm border-0 mb-3">
          <div class="card-body">
            <h2 class="h6 mb-3">Spazio selezionato</h2>
            <label for="ga-pick" class="form-label small">Garden</label>
            <select
              id="ga-pick"
              v-model="selectedGardenId"
              class="form-select form-select-sm mb-2"
              :disabled="busy || !gardens.length"
            >
              <option v-if="!gardens.length" value="">Nessun garden</option>
              <option v-for="g in gardens" :key="g.id" :value="g.id">
                {{ g.name }}
              </option>
            </select>
            <p v-if="selectedGardenId" class="small text-secondary mb-0">
              ID: <code class="user-select-all">{{ selectedGardenId }}</code>
            </p>
          </div>
        </section>

        <section v-if="selectedGardenId" class="card shadow-sm border-0 mb-3">
          <div class="card-body">
            <h2 class="h6 mb-2">Membri — {{ selectedGardenName }}</h2>
            <ul v-if="members.length" class="list-group list-group-flush mb-3">
              <li
                v-for="m in members"
                :key="m.user_id"
                class="list-group-item px-0 d-flex justify-content-between align-items-center gap-2"
              >
                <div class="min-w-0">
                  <div class="text-truncate small fw-medium">
                    {{ emailForUserId(m.user_id) }}
                  </div>
                  <div class="text-secondary small">
                    <span v-if="appRoleForUserId(m.user_id)"
                      >ruolo app:
                      <code>{{ appRoleForUserId(m.user_id) }}</code></span
                    >
                    <span v-else>nessun profilo app (usa «Aggiungi» sotto)</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm flex-shrink-0"
                  :disabled="busy"
                  @click="removeMember(m.user_id)"
                >
                  Rimuovi
                </button>
              </li>
            </ul>
            <p v-else class="small text-secondary mb-3">Nessun membro.</p>

            <h3 class="h6 mb-2">Aggiungi utente</h3>
            <label for="ga-add-user" class="form-label small"
              >Account (auth)</label
            >
            <select
              id="ga-add-user"
              v-model="addUserId"
              class="form-select form-select-sm mb-2"
              :disabled="busy || !candidateUsers.length"
            >
              <option value="">— Scegli —</option>
              <option v-for="u in candidateUsers" :key="u.id" :value="u.id">
                {{ u.email ?? u.id.slice(0, 8) + "…" }}
              </option>
            </select>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="busy || !addUserId || !selectedGardenId"
              @click="addSelectedMember"
            >
              Aggiungi al garden
            </button>
            <p v-if="!candidateUsers.length" class="small text-secondary mt-2 mb-0">
              Tutti gli utenti noti sono già membri, oppure non ci sono altri
              account.
            </p>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>
