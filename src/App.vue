<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useAppStorage } from '@/composables/useAppStorage'
import type { UserId } from '@/types/app'

const { activeUser, setActiveUser } = useAppStorage()

const profileLetter = computed(() => (activeUser.value === 'daniele' ? 'D' : 'L'))

const profileName = computed(() => (activeUser.value === 'daniele' ? 'Daniele' : 'Letizia'))

const profileMenuOpen = ref(false)
const profileDropdownEl = ref<HTMLElement | null>(null)

function toggleProfileMenu() {
  profileMenuOpen.value = !profileMenuOpen.value
}

function closeProfileMenu() {
  profileMenuOpen.value = false
}

function pickProfile(id: UserId) {
  setActiveUser(id)
  closeProfileMenu()
}

function onDocumentPointerDown(ev: PointerEvent) {
  if (!profileMenuOpen.value) return
  const root = profileDropdownEl.value
  const t = ev.target
  if (root && t instanceof Node && !root.contains(t)) {
    closeProfileMenu()
  }
}

function onDocumentKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') closeProfileMenu()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onDocumentKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeydown, true)
})
</script>

<template>
  <div class="app-shell d-flex flex-column min-vh-100">
    <nav class="navbar navbar-dark bg-primary sticky-top shadow-sm py-2">
      <div class="container-fluid px-3 px-sm-4 flex-wrap gap-2" style="max-width: 42rem">
        <div class="d-flex align-items-center gap-2 me-auto">
          <div ref="profileDropdownEl" class="dropdown profile-dropdown position-relative">
            <button
              id="profile-menu"
              type="button"
              class="btn rounded-circle d-inline-flex align-items-center justify-content-center fw-semibold text-white border-0 shadow-sm profile-avatar-btn"
              :class="
                activeUser === 'daniele' ? 'profile-avatar-btn--daniele' : 'profile-avatar-btn--letizia'
              "
              aria-haspopup="true"
              :aria-expanded="profileMenuOpen"
              :aria-label="`Profilo: ${profileName}. Apri menu utente`"
              @click.stop="toggleProfileMenu"
            >
              {{ profileLetter }}
            </button>
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
                  <span class="profile-dot profile-dot--daniele" aria-hidden="true" />
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
                  <span class="profile-dot profile-dot--letizia" aria-hidden="true" />
                  Letizia
                </button>
              </li>
            </ul>
          </div>

          <RouterLink class="navbar-brand fw-semibold mb-0" to="/">Lety e Dani</RouterLink>
        </div>
      </div>
    </nav>

    <RouterView />
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
  background: linear-gradient(135deg, #6b1f3d 0%, #4b2a6e 100%);
}

.profile-avatar-btn--letizia {
  background: #c9a227;
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
</style>
