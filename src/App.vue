<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from "vue";
  import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
  import { useAppStorage, signOutUser } from "@/composables/useAppStorage";
  import { resetTodoState } from "@/composables/useTodoLists";
  import { resetWishlistState } from "@/composables/useWishlist";
  import { getSupabaseClient } from "@/lib/supabase";
  import FeatureAnnouncementModal from "@/components/FeatureAnnouncementModal.vue";
  import { HOME_FEATURE_ANNOUNCEMENT_ID } from "@/config/featureAnnouncements";
  import type { UserId } from "@/types/app";
  import danyAvatarUrl from "@/assets/propic/dany.jpeg";
  import letyAvatarUrl from "@/assets/propic/lety.jpeg";
  import NavCartIcon from "@/components/icons/NavCartIcon.vue";
  import NavHeartIcon from "@/components/icons/NavHeartIcon.vue";
  import NavHomeIcon from "@/components/icons/NavHomeIcon.vue";
  import NavRestaurantIcon from "@/components/icons/NavRestaurantIcon.vue";
  import NavTodoIcon from "@/components/icons/NavTodoIcon.vue";

  /** Per v-bind() nel CSS: url("...") con path risolto da Vite */
  const danyAvatarBg = `url("${danyAvatarUrl}")`;
  const letyAvatarBg = `url("${letyAvatarUrl}")`;

  const route = useRoute();
  const router = useRouter();
  const { activeUser, setActiveUser, appUserSessionValid, profileFor } =
    useAppStorage();

  const appShellStyle = computed(() => {
    const bg = profileFor(activeUser.value).pageBg;
    return bg ? { background: bg } : undefined;
  });

  const appNavStyle = computed(() => {
    const bg = profileFor(activeUser.value).navbarBg;
    return bg ? { backgroundColor: bg } : undefined;
  });

  const appNavUsesDefaultBg = computed(
    () => !profileFor(activeUser.value).navbarBg,
  );

  watch(appUserSessionValid, (ok) => {
    if (!ok) {
      resetTodoState();
      resetWishlistState();
    }
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
  <div
    class="app-shell d-flex flex-column min-vh-100"
    :style="appShellStyle"
  >
    <nav
      class="navbar navbar-light border-bottom sticky-top app-top-nav"
      :class="{ 'bg-body': appNavUsesDefaultBg }"
      :style="appNavStyle"
    >
      <div
        class="container-fluid px-3 px-sm-4 d-flex flex-column align-items-stretch gap-0"
        style="max-width: 42rem"
      >
        <div
          class="app-header-row d-flex align-items-center gap-2 w-100 min-h-0"
        >
          <div
            v-if="showAppSubNav"
            class="app-subnav app-nav-scroll flex-grow-1 min-w-0"
            :class="route.name === 'wishlist' ? 'py-0 app-subnav--compact' : 'py-1'"
          >
            <ul
              class="list-unstyled d-flex flex-row flex-nowrap gap-1 mb-0 align-items-center"
              role="navigation"
              aria-label="Sezioni principali"
            >
            <li class="flex-shrink-0">
              <RouterLink
                class="app-subnav-item"
                active-class="app-subnav-item--active"
                :to="{ name: 'home' }"
                aria-label="Inizio"
              >
                <span class="app-subnav-icon"><NavHomeIcon /></span>
                <span class="app-subnav-label d-none d-sm-block">Home</span>
              </RouterLink>
            </li>
            <li class="flex-shrink-0">
              <RouterLink
                class="app-subnav-item"
                active-class="app-subnav-item--active"
                :to="{ name: 'shopping' }"
                aria-label="Lista della spesa"
              >
                <span class="app-subnav-icon"><NavCartIcon /></span>
                <span class="app-subnav-label d-none d-sm-block">Spesa</span>
              </RouterLink>
            </li>
            <li class="flex-shrink-0">
              <RouterLink
                class="app-subnav-item"
                active-class="app-subnav-item--active"
                :to="{ name: 'wishlist' }"
                aria-label="Lista dei desideri"
              >
                <span class="app-subnav-icon"><NavHeartIcon /></span>
                <span class="app-subnav-label d-none d-sm-block">Desideri</span>
              </RouterLink>
            </li>
            <li class="flex-shrink-0">
              <RouterLink
                class="app-subnav-item"
                active-class="app-subnav-item--active"
                :to="{ name: 'todos' }"
                aria-label="Cose da fare"
              >
                <span class="app-subnav-icon"><NavTodoIcon /></span>
                <span class="app-subnav-label d-none d-sm-block">Todo</span>
              </RouterLink>
            </li>
            <li class="flex-shrink-0">
              <RouterLink
                class="app-subnav-item"
                active-class="app-subnav-item--active"
                :to="{ name: 'restaurants' }"
                aria-label="Ristoranti"
              >
                <span class="app-subnav-icon"><NavRestaurantIcon /></span>
                <span class="app-subnav-label d-none d-sm-block">Locali</span>
              </RouterLink>
            </li>
          </ul>
          </div>
          <div v-else class="flex-grow-1 min-w-0" aria-hidden="true" />

          <div
            v-if="showAccountMenu"
            ref="profileDropdownEl"
            class="dropdown profile-dropdown position-relative flex-shrink-0"
          >
            <button
              id="profile-menu-auth"
              type="button"
              class="btn rounded-circle d-inline-flex align-items-center justify-content-center fw-semibold text-white border profile-avatar-btn profile-avatar-btn--ring"
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
              class="dropdown-menu dropdown-menu-end shadow-sm mt-2"
              :class="{ show: profileMenuOpen }"
              role="menu"
              aria-labelledby="profile-menu-auth"
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
            class="dropdown profile-dropdown position-relative flex-shrink-0"
          >
            <button
              id="profile-menu-local"
              type="button"
              class="btn rounded-circle d-inline-flex align-items-center justify-content-center fw-semibold text-white border profile-avatar-btn profile-avatar-btn--ring"
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
              class="dropdown-menu dropdown-menu-end shadow-sm mt-2"
              :class="{ show: profileMenuOpen }"
              role="menu"
              aria-labelledby="profile-menu-local"
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
        </div>
      </div>
    </nav>

    <RouterView />

    <FeatureAnnouncementModal
      v-if="route.name !== 'login'"
      :announcement-id="HOME_FEATURE_ANNOUNCEMENT_ID"
    >
      <template #title>Novità: Desideri</template>
      <p class="mb-2 text-body-secondary">
        Una <strong>wishlist condivisa</strong>: raccogli i link dei prodotti che ti interessano,
        da qualsiasi sito, in un unico posto.
      </p>
      <p class="fw-semibold mb-3">Cosa puoi fare</p>
      <ul class="mb-0 ps-3">
        <li class="mb-2">
          <strong>Aggiungi da link</strong>: incolla l’URL e ottieni titolo, immagine e prezzo quando
          l’anteprima è disponibile.
        </li>
        <li class="mb-2">
          <strong>Più liste</strong>: crea o rinomina le liste dal menu e passa da una all’altra; tutto
          resta sincronizzato tra i vostri account (come Spesa e Todo).
        </li>
        <li class="mb-2">
          <strong>Stato prodotto</strong>: segna come <em>comprato</em> o <em>archiviato</em> dal menu
          della card — su mobile puoi anche <strong>scorrere la card</strong> a destra o a sinistra.
        </li>
        <li>
          <strong>Note</strong>: annotazioni private sulla card per ricordare taglie, colori o promozioni.
        </li>
      </ul>
      <p class="mt-3 mb-0 small text-secondary">
        Trovi la sezione <strong>Desideri</strong> nella barra in alto, accanto a Home e Spesa.
      </p>
    </FeatureAnnouncementModal>
  </div>
</template>

<style scoped>
  .app-shell {
    background: var(--bs-gray-200, #e9ecef);
  }

  .profile-avatar-btn {
    width: 3rem;
    height: 3rem;
    padding: 0;
    font-size: 0.95rem;
    line-height: 1;
  }

  .profile-avatar-btn--ring {
    border-color: rgba(0, 0, 0, 0.12) !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
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

  .app-subnav-item {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    min-width: 3rem;
    min-height: 3rem;
    padding: 0.35rem 0.45rem;
    border-radius: 0.5rem;
    color: var(--bs-secondary-color);
    text-decoration: none;
    font-size: 0.65rem;
    font-weight: 500;
    line-height: 1.1;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }

  .app-subnav-item:hover {
    color: var(--bs-body-color);
    background-color: var(--bs-secondary-bg);
  }

  .app-subnav-item:focus-visible {
    outline: 0;
    box-shadow: 0 0 0 0.2rem rgba(var(--bs-primary-rgb), 0.35);
    border-radius: 0.5rem;
  }

  .app-subnav-icon {
    display: flex;
    line-height: 0;
    color: currentColor;
  }

  .app-subnav-label {
    max-width: 4.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  .app-subnav-item.app-subnav-item--active,
  .app-subnav-item.router-link-active {
    color: var(--bs-primary);
    font-weight: 600;
    background-color: rgba(var(--bs-primary-rgb), 0.1);
  }

  .app-subnav-item.app-subnav-item--active:hover,
  .app-subnav-item.router-link-active:hover {
    color: var(--bs-primary);
    background-color: rgba(var(--bs-primary-rgb), 0.14);
  }

  .app-subnav--compact .app-subnav-item {
    min-height: 2.65rem;
    padding: 0.22rem 0.4rem;
  }

  .app-subnav--compact .app-subnav-icon {
    transform: scale(0.92);
  }
</style>
