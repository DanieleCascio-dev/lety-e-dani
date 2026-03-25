<script setup lang="ts">
import { ref } from 'vue'
import { useAppStorage } from '@/composables/useAppStorage'

const newItem = ref('')
const {
  activeUser,
  currentList,
  textIconClassFor,
  addGroceryItem,
  toggleGroceryItem,
  removeGroceryItem,
  clearDoneGroceryItems,
} = useAppStorage()

function onSubmit() {
  addGroceryItem(newItem.value)
  newItem.value = ''
}

const userLabel = (id: string) => (id === 'daniele' ? 'Daniele' : 'Letizia')
</script>

<template>
  <main class="shopping-main pb-5">
    <div class="container-fluid px-3 px-sm-4" style="max-width: 32rem">
      <p class="text-secondary small mb-3 mb-md-4">
        Lista condivisa · stai aggiungendo come <strong>{{ userLabel(activeUser) }}</strong>
      </p>

      <form class="mb-4" @submit.prevent="onSubmit">
        <label for="grocery-input" class="form-label visually-hidden">Nuovo articolo</label>
        <div class="input-group input-group-lg">
          <input
            id="grocery-input"
            v-model="newItem"
            type="text"
            class="form-control"
            placeholder="Aggiungi articolo…"
            autocomplete="off"
            maxlength="200"
          />
          <button class="btn btn-primary px-4" type="submit" :disabled="!newItem.trim()">
            Aggiungi
          </button>
        </div>
      </form>

      <ul v-if="currentList.length" class="list-group list-group-flush shadow-sm rounded overflow-hidden">
        <li
          v-for="item in currentList"
          :key="item.id"
          class="list-group-item d-flex align-items-center gap-3 py-3 min-touch"
          :class="{ 'text-decoration-line-through text-secondary bg-light': item.done }"
        >
          <div class="form-check m-0 flex-grow-1">
            <input
              :id="`g-${item.id}`"
              class="form-check-input fs-5"
              type="checkbox"
              :checked="item.done"
              @change="toggleGroceryItem(item.id)"
            />
            <label class="form-check-label w-100 user-select-none d-flex align-items-center gap-2" :for="`g-${item.id}`">
              <span
                class="shrink-0"
                :class="textIconClassFor(item.addedBy)"
                :title="`Aggiunto da ${userLabel(item.addedBy)}`"
                aria-hidden="true"
              />
              <span>{{ item.text }}</span>
            </label>
          </div>
          <button
            type="button"
            class="btn btn-outline-danger btn-sm shrink-0"
            title="Rimuovi"
            @click.stop="removeGroceryItem(item.id)"
          >
            Rimuovi
          </button>
        </li>
      </ul>
      <p v-else class="text-center text-secondary py-5 mb-0">Nessun articolo. Aggiungi il primo sopra.</p>

      <div v-if="currentList.some((i) => i.done)" class="mt-3 text-center">
        <button type="button" class="btn btn-link btn-sm text-secondary" @click="clearDoneGroceryItems">
          Rimuovi articoli segnati
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.min-touch {
  min-height: 3.25rem;
}

.shopping-main {
  padding-top: 0.5rem;
}

.shrink-0 {
  flex-shrink: 0;
}

/* Cerchi profilo: bordeaux-viola (Daniele), senape (Letizia) — classi allineate a UserProfile.textIcon */
.grocery-text-icon {
  display: inline-block;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.grocery-text-icon--daniele {
  background: linear-gradient(135deg, #6b1f3d 0%, #4b2a6e 100%);
}

.grocery-text-icon--letizia {
  background: #c9a227;
}
</style>
