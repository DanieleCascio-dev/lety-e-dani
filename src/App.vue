<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from "vue";
  import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
  import { useAppStorage, signOutUser } from "@/composables/useAppStorage";
  import { resetTodoState } from "@/composables/useTodoLists";
  import { getSupabaseClient } from "@/lib/supabase";
  import FeatureAnnouncementModal from "@/components/FeatureAnnouncementModal.vue";
  import { HOME_FEATURE_ANNOUNCEMENT_ID } from "@/config/featureAnnouncements";
  import type { UserId } from "@/types/app";
  import danyAvatarUrl from "@/assets/propic/dany.jpeg";
  import letyAvatarUrl from "@/assets/propic/lety.jpeg";

  /** Per v-bind() nel CSS: url("...") con path risolto da Vite */
  const danyAvatarBg = `url("${danyAvatarUrl}")`;
  const letyAvatarBg = `url("${letyAvatarUrl}")`;

  const route = useRoute();
  const router = useRouter();
  const { activeUser, setActiveUser, appUserSessionValid } = useAppStorage();

  watch(appUserSessionValid, (ok) => {
    if (!ok) resetTodoState();
  });

  function useSupabaseAuth(): boolean {
    return getSupabaseClient() !== null;
  }

  const showAccountMenu = computed(
    () => useSupabaseAuth() && route.name !== "login",
  );

  const showAppSubNav = computed(() => route.name !== "login");

  const profileName = computed(() =>
    activeUser.value === "daniele" ? "Daniele" : "Letizia",
  );

  const profileMenuOpen = ref(false);
  const profileDropdownEl = ref<HTMLElement | null>(null);

  function toggleProfileMenu() {
    profileMenuOpen.value = !profileMenuOpen.value;
  }

  function closeProfileMenu() {
    profileMenuOpen.value = false;
  }

  function pickProfile(id: UserId) {
    setActiveUser(id);
    closeProfileMenu();
  }

  async function logout() {
    closeProfileMenu();
    await signOutUser();
    await router.push({ name: "login" });
  }

  function onDocumentPointerDown(ev: PointerEvent) {
    if (!profileMenuOpen.value) return;
    const root = profileDropdownEl.value;
    const t = ev.target;
    if (root && t instanceof Node && !root.contains(t)) {
      closeProfileMenu();
    }
  }

  function onDocumentKeydown(ev: KeyboardEvent) {
    if (ev.key === "Escape") closeProfileMenu();
  }

  onMounted(() => {
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeydown, true);
  });

  onUnmounted(() => {
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onDocumentKeydown, true);
  });
</script>

<template>
  <div class="app-shell d-flex flex-column min-vh-100">
    <nav class="navbar navbar-dark bg-primary sticky-top shadow-sm py-2">
      <div
        class="container-fluid px-3 px-sm-4 d-flex flex-column align-items-stretch gap-0"
        style="max-width: 42rem"
      >
        <div class="d-flex align-items-center gap-2 w-100">
          <div
            v-if="showAccountMenu"
            ref="profileDropdownEl"
            class="dropdown profile-dropdown position-relative"
          >
            <button
              id="profile-menu"
              type="button"
              class="btn rounded-circle d-inline-flex align-items-center justify-content-center fw-semibold text-white border-0 shadow-sm profile-avatar-btn"
              :class="
                activeUser === 'daniele'
                  ? 'profile-avatar-btn--daniele'
                  : 'profile-avatar-btn--letizia'
              "
              aria-haspopup="true"
              :aria-expanded="profileMenuOpen"
              :aria-label="`Profilo: ${profileName}. Apri menu utente`"
              @click.stop="toggleProfileMenu"
            ></button>
            <ul
              class="dropdown-menu dropdown-menu-start shadow-sm mt-2"
              :class="{ show: profileMenuOpen }"
              role="menu"
              aria-labelledby="profile-menu"
              :aria-hidden="!profileMenuOpen"
            >
              <li role="none">
                <div class="dropdown-item-text small text-secondary py-1">
                  {{ profileName }}
                </div>
              </li>
              <li role="none">
                <RouterLink
                  class="dropdown-item"
                  role="menuitem"
                  :to="{ name: 'profile' }"
                  @click="closeProfileMenu"
                >
                  Profilo
                </RouterLink>
              </li>
              <li><hr class="dropdown-divider" /></li>
              <li role="none">
                <button
                  type="button"
                  class="dropdown-item"
                  role="menuitem"
                  @click="logout"
                >
                  Esci
                </button>
              </li>
            </ul>
          </div>

          <div
            v-else-if="!useSupabaseAuth()"
            ref="profileDropdownEl"
            class="dropdown profile-dropdown position-relative"
          >
            <button
              id="profile-menu"
              type="button"
              class="btn rounded-circle d-inline-flex align-items-center justify-content-center fw-semibold text-white border-0 shadow-sm profile-avatar-btn"
              :class="
                activeUser === 'daniele'
                  ? 'profile-avatar-btn--daniele'
                  : 'profile-avatar-btn--letizia'
              "
              aria-haspopup="true"
              :aria-expanded="profileMenuOpen"
              :aria-label="`Profilo: ${profileName}. Apri menu utente`"
              @click.stop="toggleProfileMenu"
            ></button>
            <ul
              class="dropdown-menu dropdown-menu-start shadow-sm mt-2"
              :class="{ show: profileMenuOpen }"
              role="menu"
              aria-labelledby="profile-menu"
              :aria-hidden="!profileMenuOpen"
            >
              <li role="none">
                <button
                  type="button"
                  class="dropdown-item d-flex align-items-center gap-2"
                  :class="{ active: activeUser === 'daniele' }"
                  :aria-current="activeUser === 'daniele' ? 'true' : undefined"
                  role="menuitemradio"
                  :aria-checked="activeUser === 'daniele'"
                  @click="pickProfile('daniele')"
                >
                  <span
                    class="profile-dot profile-dot--daniele"
                    aria-hidden="true"
                  />
                  Daniele
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  class="dropdown-item d-flex align-items-center gap-2"
                  :class="{ active: activeUser === 'letizia' }"
                  :aria-current="activeUser === 'letizia' ? 'true' : undefined"
                  role="menuitemradio"
                  :aria-checked="activeUser === 'letizia'"
                  @click="pickProfile('letizia')"
                >
                  <span
                    class="profile-dot profile-dot--letizia"
                    aria-hidden="true"
                  />
                  Letizia
                </button>
              </li>
            </ul>
          </div>

          <RouterLink
            class="navbar-brand fw-semibold mb-0 text-white text-decoration-none"
            to="/"
            >Lety e Dani</RouterLink
          >
        </div>

        <div
          v-if="showAppSubNav"
          class="app-subnav w-100 border-top border-light border-opacity-25 mt-2 pt-2"
        >
          <ul
            class="list-unstyled d-flex flex-row flex-wrap gap-1 mb-0 small align-items-start"
            role="navigation"
            aria-label="Sezioni principali"
          >
            <li class="flex-shrink-0">
              <RouterLink
                class="app-subnav-link app-subnav-link--long"
                active-class="app-subnav-link--active"
                :to="{ name: 'home' }"
              >
                Benvenut* nel nostro magico spazio!
              </RouterLink>
            </li>
            <li>
              <RouterLink
                class="app-subnav-link"
                active-class="app-subnav-link--active"
                :to="{ name: 'shopping' }"
              >
                Lista della spesa
              </RouterLink>
            </li>
            <li>
              <RouterLink
                class="app-subnav-link"
                active-class="app-subnav-link--active"
                :to="{ name: 'wishlist' }"
              >
                Lista dei desideri
              </RouterLink>
            </li>
            <li>
              <RouterLink
                class="app-subnav-link"
                active-class="app-subnav-link--active"
                :to="{ name: 'todos' }"
              >
                Cose da fare
              </RouterLink>
            </li>
            <li>
              <RouterLink
                class="app-subnav-link"
                active-class="app-subnav-link--active"
                :to="{ name: 'restaurants' }"
              >
                Ristoranti
              </RouterLink>
            </li>
          </ul>
        </div>
      </div>
    </nav>

    <RouterView />

    <FeatureAnnouncementModal
      v-if="route.name !== 'login'"
      :announcement-id="HOME_FEATURE_ANNOUNCEMENT_ID"
    >
      <template #title>Bentornat*!</template>
      <p class="mb-2 fw-semibold">Ecco cosa c’è di nuovo:</p>
      <ul class="mb-0 ps-3">
        <li class="mb-2">
          <strong>Cose da fare</strong>: nuova sezione per le attività quotidiane, con
          <strong>liste multiple</strong>, voci da spuntare, modifica e rimozione — in sync con Supabase
          come la lista della spesa, così restate allineat* su telefono e desktop.
        </li>
        <li>
          Stesso <strong>segnaposto colore</strong> del profilo accanto alle voci; puoi creare o rinominare
          le liste e passare da una all’altra dal menu in alto.
        </li>
      </ul>
    </FeatureAnnouncementModal>
  </div>
</template>

<style scoped>
  .app-shell {
    background: var(--bs-gray-100, #f8f9fa);
  }

  .profile-avatar-btn {
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    font-size: 0.95rem;
    line-height: 1;
  }

  .profile-avatar-btn--daniele {
    background-color: #3d2a4e;
    background-image: v-bind(danyAvatarBg);
    background-size: cover;
    background-position: 50% 28%;
    background-repeat: no-repeat;
  }

  .profile-avatar-btn--letizia {
    background-color: #c9a227;
    background-image: v-bind(letyAvatarBg);
    background-size: cover;
    background-position: 28% 22%;
    background-repeat: no-repeat;
  }

  .profile-dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
  }

  .profile-dot--daniele {
    background: linear-gradient(135deg, #6b1f3d 0%, #4b2a6e 100%);
  }

  .profile-dot--letizia {
    background: #c9a227;
  }

  .profile-dropdown .dropdown-menu {
    z-index: 1050;
  }

  /* Evitiamo nav-pills di Bootstrap: con .active impone testo bianco anche su sfondo chiaro. */
  .app-subnav-link {
    display: inline-block;
    padding: 0.35rem 0.7rem;
    border-radius: 0.4rem;
    color: rgba(255, 255, 255, 0.92);
    text-decoration: none;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }

  .app-subnav-link--long {
    max-width: min(100%, 16rem);
    line-height: 1.3;
  }

  .app-subnav-link:hover {
    color: #fff;
    background-color: rgba(255, 255, 255, 0.14);
  }

  .app-subnav-link.app-subnav-link--active,
  .app-subnav-link.router-link-active {
    color: #1a1d20;
    background-color: #fff;
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }

  .app-subnav-link.app-subnav-link--active:hover,
  .app-subnav-link.router-link-active:hover {
    color: #1a1d20;
    background-color: #fff;
  }
</style>
