<script setup lang="ts">
  import {
    computed,
    nextTick,
    onActivated,
    onMounted,
    onUnmounted,
    ref,
  } from "vue";
  import {
    ensureGroceryRealtimeConnected,
    groceryListDisplayName,
    refreshGroceryData,
    useAppStorage,
  } from "@/composables/useAppStorage";
  import type { GroceryItem } from "@/types/app";

  const newItem = ref("");
  const {
    activeUser,
    currentList,
    groceryLists,
    groceryListsLoading,
    selectedGroceryListId,
    currentGroceryListMeta,
    groceriesLoading,
    groceriesError,
    chatGroceryLoading,
    appUserSessionValid,
    isGroceryCloud,
    textIconClassFor,
    createGroceryList,
    createChatGroceryList,
    renameGroceryList,
    deleteGroceryList,
    selectGroceryList,
    markAllGroceryItemsDone,
    addGroceryItem,
    setGroceryItemDone,
    removeGroceryItem,
    clearDoneGroceryItems,
  } = useAppStorage();

  const listMenuOpen = ref(false);
  const listMenuRoot = ref<HTMLElement | null>(null);

  const actionsMenuOpen = ref(false);
  const actionsMenuRoot = ref<HTMLElement | null>(null);

  const createModalOpen = ref(false);
  const newListName = ref("");

  const renameModalOpen = ref(false);
  const renameListName = ref("");

  const chatModalOpen = ref(false);
  const chatListName = ref("");

  const deleteModalOpen = ref(false);
  const deleteTargetId = ref<string | null>(null);
  const deleteListSubmitting = ref(false);

  function toggleListMenu() {
    listMenuOpen.value = !listMenuOpen.value;
  }

  function closeListMenu() {
    listMenuOpen.value = false;
  }

  function toggleActionsMenu() {
    actionsMenuOpen.value = !actionsMenuOpen.value;
  }

  function closeActionsMenu() {
    actionsMenuOpen.value = false;
  }

  function pickList(id: string) {
    void selectGroceryList(id);
    closeListMenu();
  }

  function openCreateModal() {
    newListName.value = "";
    createModalOpen.value = true;
    closeListMenu();
    closeActionsMenu();
  }

  function closeCreateModal() {
    createModalOpen.value = false;
  }

  function openRenameModal() {
    renameListName.value = currentGroceryListMeta.value?.title ?? "";
    renameModalOpen.value = true;
    closeActionsMenu();
    closeListMenu();
  }

  function closeRenameModal() {
    renameModalOpen.value = false;
  }

  async function confirmRenameList() {
    const id = selectedGroceryListId.value;
    if (!id) return;
    const ok = await renameGroceryList(id, renameListName.value);
    if (ok) closeRenameModal();
  }

  function onDeleteFromActionsMenu() {
    const id = selectedGroceryListId.value;
    if (!id) return;
    closeActionsMenu();
    openDeleteListModal(id);
  }

  function openDeleteListModal(id: string) {
    deleteTargetId.value = id;
    deleteModalOpen.value = true;
    closeListMenu();
  }

  function closeDeleteModal() {
    deleteModalOpen.value = false;
    deleteTargetId.value = null;
  }

  function onDeleteModalBackdrop() {
    if (!deleteListSubmitting.value) closeDeleteModal();
  }

  const deleteTargetLabel = computed(() => {
    const id = deleteTargetId.value;
    if (!id) return "";
    const list = groceryLists.value.find((l) => l.id === id);
    return list ? groceryListDisplayName(list) : "";
  });

  async function confirmDeleteList() {
    const id = deleteTargetId.value;
    if (!id) return;
    deleteListSubmitting.value = true;
    try {
      await deleteGroceryList(id);
      await nextTick();
      if (!groceriesError.value) closeDeleteModal();
    } finally {
      deleteListSubmitting.value = false;
    }
  }

  async function confirmCreateList() {
    await createGroceryList(newListName.value);
    closeCreateModal();
  }

  function openChatModal() {
    chatListName.value = "";
    chatModalOpen.value = true;
    closeListMenu();
    closeActionsMenu();
  }

  function closeChatModal() {
    chatModalOpen.value = false;
  }

  async function confirmChatList() {
    const name = chatListName.value.trim();
    if (!name) return;
    try {
      await createChatGroceryList(name);
      await nextTick();
      if (!groceriesError.value) closeChatModal();
    } catch {
      /* error già in groceriesError o console da useAppStorage */
    }
  }

  async function onSubmit() {
    const ok = await addGroceryItem(newItem.value);
    if (ok) newItem.value = "";
  }

  function onDocumentPointerDown(ev: PointerEvent) {
    const t = ev.target;
    if (listMenuOpen.value) {
      const root = listMenuRoot.value;
      if (root && t instanceof Node && !root.contains(t)) closeListMenu();
    }
    if (actionsMenuOpen.value) {
      const root = actionsMenuRoot.value;
      if (root && t instanceof Node && !root.contains(t)) closeActionsMenu();
    }
  }

  function onDocumentKeydown(ev: KeyboardEvent) {
    if (ev.key !== "Escape") return;
    if (deleteModalOpen.value) {
      if (!deleteListSubmitting.value) closeDeleteModal();
      return;
    }
    if (createModalOpen.value) {
      closeCreateModal();
      return;
    }
    if (renameModalOpen.value) {
      closeRenameModal();
      return;
    }
    if (chatModalOpen.value) {
      closeChatModal();
      return;
    }
    closeListMenu();
    closeActionsMenu();
  }

  async function refreshShoppingPageData() {
    if (!isGroceryCloud.value || !appUserSessionValid.value) return;
    await refreshGroceryData({ silent: true });
    ensureGroceryRealtimeConnected();
  }

  onMounted(() => {
    void refreshShoppingPageData();
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeydown, true);
  });

  onActivated(() => {
    void refreshShoppingPageData();
  });

  onUnmounted(() => {
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onDocumentKeydown, true);
  });

  const userLabel = (id: string) => (id === "daniele" ? "Daniele" : "Letizia");

  const hasOpenItems = computed(() => currentList.value.some((i) => !i.done));
  const hasDoneItems = computed(() => currentList.value.some((i) => i.done));

  const chatListButtonDisabled = computed(
    () =>
      !isGroceryCloud.value ||
      !appUserSessionValid.value ||
      groceryListsLoading.value,
  );

  function onGroceryDoneChange(item: GroceryItem, e: Event) {
    const el = e.target as HTMLInputElement;
    void setGroceryItemDone(item.id, el.checked);
  }

</script>

<template>
  <main class="shopping-main pb-5">
    <div class="container-fluid px-3 px-sm-4" style="max-width: 32rem">
      <p class="text-secondary small mb-3 mb-md-4">
        Lista della spesa · stai aggiungendo come
        <strong>{{ userLabel(activeUser) }}</strong>
      </p>

      <div
        v-if="groceriesError"
        class="alert alert-warning small py-2 mb-3"
        role="alert"
      >
        {{ groceriesError }}
      </div>

      <div class="mb-3">
        <button
          type="button"
          class="btn btn-outline-secondary w-100"
          :disabled="chatListButtonDisabled || chatGroceryLoading"
          @click="openChatModal"
        >
          <span
            v-if="chatGroceryLoading"
            class="spinner-border spinner-border-sm me-2"
            role="status"
            aria-hidden="true"
          />
          Crea lista spesa con Chat
        </button>
        <p
          v-if="!isGroceryCloud"
          class="form-text small text-secondary mb-0 mt-1"
        >
          Connettiti con Supabase e accedi per usare la lista generata dall’AI.
        </p>
        <p
          v-else-if="!appUserSessionValid"
          class="form-text small text-secondary mb-0 mt-1"
        >
          Effettua il login per creare una lista con Chat.
        </p>
      </div>

      <div class="mb-4">
        <span class="form-label small text-secondary d-block mb-1"
          >Lista attiva</span
        >
        <div
          class="d-flex flex-column flex-sm-row gap-2 align-items-stretch align-items-sm-start"
        >
          <div ref="listMenuRoot" class="dropdown flex-grow-1 list-picker">
            <button
              id="list-picker-btn"
              type="button"
              class="btn btn-light border text-start w-100 d-flex align-items-center justify-content-between gap-2 py-2"
              :disabled="!groceryLists.length || groceryListsLoading"
              aria-haspopup="true"
              :aria-expanded="listMenuOpen"
              @click.stop="toggleListMenu"
            >
              <span
                v-if="currentGroceryListMeta"
                class="d-flex align-items-center gap-2 min-w-0"
              >
                <span
                  class="shrink-0"
                  :class="textIconClassFor(currentGroceryListMeta.createdBy)"
                  :title="`Creata da ${userLabel(currentGroceryListMeta.createdBy)}`"
                  aria-hidden="true"
                />
                <span class="text-truncate">{{
                  groceryListDisplayName(currentGroceryListMeta)
                }}</span>
              </span>
              <span v-else class="text-secondary">—</span>
              <span class="text-secondary small shrink-0" aria-hidden="true"
                >▾</span
              >
            </button>
            <ul
              class="dropdown-menu shadow-sm w-100 py-1"
              :class="{ show: listMenuOpen }"
              aria-labelledby="list-picker-btn"
            >
              <li v-for="list in groceryLists" :key="list.id" class="px-1">
                <button
                  type="button"
                  class="btn btn-link text-body text-decoration-none w-100 text-start py-2 px-2 d-flex align-items-center gap-2 min-w-0 list-picker-row rounded border-0"
                  @click="pickList(list.id)"
                >
                  <span
                    class="shrink-0"
                    :class="textIconClassFor(list.createdBy)"
                    :title="`Creata da ${userLabel(list.createdBy)}`"
                    aria-hidden="true"
                  />
                  <span class="text-truncate small">{{
                    groceryListDisplayName(list)
                  }}</span>
                </button>
              </li>
            </ul>
          </div>
          <div class="d-flex gap-2 shrink-0 align-items-stretch">
            <button
              type="button"
              class="btn btn-outline-primary"
              :disabled="groceryListsLoading"
              @click="openCreateModal"
            >
              Nuova lista
            </button>
            <div ref="actionsMenuRoot" class="dropdown list-actions-dropdown">
              <button
                id="list-actions-menu"
                type="button"
                class="btn btn-outline-secondary d-inline-flex align-items-center justify-content-center px-2 h-100"
                :disabled="
                  !selectedGroceryListId ||
                  groceryListsLoading ||
                  !groceryLists.length
                "
                aria-haspopup="true"
                :aria-expanded="actionsMenuOpen"
                aria-label="Altre azioni sulla lista"
                @click.stop="toggleActionsMenu"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="6" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="18" r="2" />
                </svg>
              </button>
              <ul
                class="dropdown-menu dropdown-menu-end shadow-sm py-1"
                :class="{ show: actionsMenuOpen }"
                role="menu"
                aria-labelledby="list-actions-menu"
              >
                <li role="none">
                  <button
                    type="button"
                    class="dropdown-item"
                    role="menuitem"
                    @click="openRenameModal"
                  >
                    Modifica nome
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    class="dropdown-item text-danger"
                    role="menuitem"
                    @click="onDeleteFromActionsMenu"
                  >
                    Elimina lista
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="!groceryLists.length && !groceryListsLoading"
        class="alert alert-light border mb-4 small"
      >
        Nessuna lista ancora. Tocca <strong>Nuova lista</strong> per iniziare.
      </div>

      <Teleport to="body">
        <div
          v-if="createModalOpen"
          class="modal fade show d-block"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-list-title"
          @click.self="closeCreateModal"
        >
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="new-list-title" class="modal-title h5">Nuova lista</h2>
                <button
                  type="button"
                  class="btn-close"
                  aria-label="Chiudi"
                  @click="closeCreateModal"
                />
              </div>
              <div class="modal-body">
                <label for="new-list-name" class="form-label">Nome lista</label>
                <input
                  id="new-list-name"
                  v-model="newListName"
                  type="text"
                  class="form-control"
                  placeholder="Es. Weekend, Casa al mare…"
                  maxlength="80"
                  autocomplete="off"
                  @keydown.enter.prevent="confirmCreateList"
                />
                <p class="form-text small mb-0">
                  Il nome apparirà come <strong>Nome · data</strong>. Puoi
                  lasciarlo vuoto: vedrai solo «Lista del …».
                </p>
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  @click="closeCreateModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  @click="confirmCreateList"
                >
                  Crea
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="renameModalOpen"
          class="modal fade show d-block"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-list-title"
          @click.self="closeRenameModal"
        >
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="rename-list-title" class="modal-title h5">
                  Modifica nome lista
                </h2>
                <button
                  type="button"
                  class="btn-close"
                  aria-label="Chiudi"
                  @click="closeRenameModal"
                />
              </div>
              <div class="modal-body">
                <label for="rename-list-name" class="form-label"
                  >Nome lista</label
                >
                <input
                  id="rename-list-name"
                  v-model="renameListName"
                  type="text"
                  class="form-control"
                  placeholder="Es. Weekend, Casa al mare…"
                  maxlength="80"
                  autocomplete="off"
                  @keydown.enter.prevent="confirmRenameList"
                />
                <p class="form-text small mb-0">
                  Il nome viene mostrato come <strong>Nome · data</strong>.
                  Lascia vuoto per usare solo «Lista del …».
                </p>
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  @click="closeRenameModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  @click="confirmRenameList"
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="deleteModalOpen"
          class="modal fade show d-block"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-list-title"
          @click.self="onDeleteModalBackdrop"
        >
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="delete-list-title" class="modal-title h5 text-danger">
                  Elimina lista
                </h2>
                <button
                  type="button"
                  class="btn-close"
                  aria-label="Chiudi"
                  :disabled="deleteListSubmitting"
                  @click="closeDeleteModal"
                />
              </div>
              <div class="modal-body">
                <p class="mb-2">
                  Vuoi eliminare la lista
                  <strong v-if="deleteTargetLabel">{{
                    deleteTargetLabel
                  }}</strong>
                  <span v-else>selezionata</span>
                  ?
                </p>
                <p class="small text-secondary mb-0">
                  Verranno rimossi dal database anche
                  <strong>tutti gli articoli</strong> collegati a questa lista.
                  L’azione non si può annullare.
                </p>
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="deleteListSubmitting"
                  @click="closeDeleteModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-danger"
                  :disabled="deleteListSubmitting"
                  @click="confirmDeleteList"
                >
                  <span
                    v-if="deleteListSubmitting"
                    class="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  />
                  Elimina definitivamente
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="chatModalOpen"
          class="modal fade show d-block"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-list-title"
          @click.self="closeChatModal"
        >
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="chat-list-title" class="modal-title h5">
                  Lista con Chat
                </h2>
                <button
                  type="button"
                  class="btn-close"
                  aria-label="Chiudi"
                  @click="closeChatModal"
                />
              </div>
              <div class="modal-body">
                <label for="chat-list-name" class="form-label"
                  >Nome da aggiungere alla lista</label
                >
                <input
                  id="chat-list-name"
                  v-model="chatListName"
                  type="text"
                  class="form-control"
                  placeholder="Es. settimanale, casa mare…"
                  maxlength="73"
                  autocomplete="off"
                  :disabled="chatGroceryLoading"
                  @keydown.enter.prevent="confirmChatList"
                />
                <p class="form-text small mb-0">
                  Verrà creata una lista intitolata
                  <strong>chat — nome che scegli — data</strong>
                  (nel titolo salviamo <code>chat - nome</code>; la data è
                  quella di creazione, come per le altre liste).
                </p>
                <p class="form-text small text-secondary mb-0 mt-2">
                  L’AI analizza gli articoli già presenti nel database
                  (frequenze) e propone una nuova lista. L’operazione può
                  richiedere <strong>fino a un minuto o due</strong>: non
                  chiudere il modale finché non compare un messaggio di errore o
                  la lista non si aggiorna.
                </p>
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="chatGroceryLoading"
                  @click="closeChatModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="!chatListName.trim() || chatGroceryLoading"
                  @click="confirmChatList"
                >
                  Crea lista
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

      <form class="mb-3" @submit.prevent="onSubmit">
        <label for="grocery-input" class="form-label visually-hidden"
          >Nuovo articolo</label
        >
        <div class="input-group input-group-lg">
          <input
            id="grocery-input"
            v-model="newItem"
            type="text"
            class="form-control"
            placeholder="Aggiungi articolo…"
            autocomplete="off"
            maxlength="200"
            :disabled="!selectedGroceryListId"
          />
          <button
            class="btn btn-primary px-4"
            type="submit"
            :disabled="!newItem.trim() || !selectedGroceryListId"
          >
            Aggiungi
          </button>
        </div>
      </form>

      <div
        v-if="currentList.length"
        class="d-flex flex-wrap align-items-center gap-2 small mb-2 text-secondary"
      >
        <span class="me-1">Selezione rapida:</span>
        <button
          type="button"
          class="btn btn-link btn-sm p-0 text-decoration-none"
          :disabled="!hasOpenItems"
          @click="markAllGroceryItemsDone(true)"
        >
          Segna tutti
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          class="btn btn-link btn-sm p-0 text-decoration-none"
          :disabled="!hasDoneItems"
          @click="markAllGroceryItemsDone(false)"
        >
          Deseleziona tutti
        </button>
      </div>

      <ul
        v-if="currentList.length"
        class="list-group list-group-flush shadow-sm rounded overflow-hidden"
      >
        <li
          v-for="item in currentList"
          :key="item.id"
          class="list-group-item d-flex align-items-center gap-3 py-3 min-touch"
          :class="{ 'bg-light': item.done }"
        >
          <div class="form-check m-0 flex-grow-1">
            <input
              :id="`g-${item.id}`"
              class="form-check-input fs-5"
              type="checkbox"
              :checked="item.done"
              @change="onGroceryDoneChange(item, $event)"
            />
            <label
              class="form-check-label w-100 user-select-none d-flex align-items-center gap-2"
              :for="`g-${item.id}`"
            >
              <span
                class="shrink-0"
                :class="textIconClassFor(item.addedBy)"
                :title="`Aggiunto da ${userLabel(item.addedBy)}`"
                aria-hidden="true"
              />
              <span
                class="item-text"
                :class="{
                  'text-decoration-line-through text-secondary': item.done,
                }"
              >
                {{ item.text }}
              </span>
            </label>
          </div>
          <button
            type="button"
            class="btn btn-outline-danger btn-sm shrink-0 align-self-center"
            title="Rimuovi"
            @click.stop="removeGroceryItem(item.id)"
          >
            Rimuovi
          </button>
        </li>
      </ul>
      <p
        v-else-if="groceriesLoading || groceryListsLoading"
        class="text-center text-secondary py-5 mb-0"
      >
        Caricamento…
      </p>
      <p
        v-else-if="selectedGroceryListId"
        class="text-center text-secondary py-5 mb-0"
      >
        Nessun articolo. Aggiungi il primo sopra.
      </p>

      <div v-if="currentList.some((i) => i.done)" class="mt-3 text-center">
        <button
          type="button"
          class="btn btn-link btn-sm text-secondary"
          @click="clearDoneGroceryItems"
        >
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

  .min-w-0 {
    min-width: 0;
  }

  .list-picker .dropdown-menu {
    max-height: 70vh;
    overflow-y: auto;
  }

  .list-picker-row:hover {
    background-color: var(--bs-light, #f8f9fa);
  }

  .item-text {
    word-break: break-word;
  }

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
