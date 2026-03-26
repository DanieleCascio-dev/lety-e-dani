<script setup lang="ts">
  import {
    computed,
    nextTick,
    onActivated,
    onMounted,
    onUnmounted,
    ref,
    watch,
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
    updateGroceryItemText,
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

  const itemRemoveModalOpen = ref(false);
  const itemRemoveTargetId = ref<string | null>(null);
  const itemRemoveSubmitting = ref(false);

  const itemEditModalOpen = ref(false);
  const itemEditId = ref<string | null>(null);
  const itemEditText = ref("");
  const itemEditSubmitting = ref(false);
  const itemEditInputRef = ref<HTMLInputElement | null>(null);

  watch(itemEditModalOpen, async (open) => {
    if (!open) return;
    await nextTick();
    const el = itemEditInputRef.value;
    if (!el) return;
    el.focus();
    el.select();
  });

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

  const itemRemoveTargetLabel = computed(() => {
    const id = itemRemoveTargetId.value;
    if (!id) return "";
    const row = currentList.value.find((i) => i.id === id);
    return row?.text ?? "";
  });

  function openItemRemoveModal(item: GroceryItem) {
    itemRemoveTargetId.value = item.id;
    itemRemoveModalOpen.value = true;
  }

  function closeItemRemoveModal() {
    itemRemoveModalOpen.value = false;
    itemRemoveTargetId.value = null;
  }

  function onItemRemoveBackdrop() {
    if (!itemRemoveSubmitting.value) closeItemRemoveModal();
  }

  function onItemEditBackdrop() {
    if (!itemEditSubmitting.value) closeItemEditModal();
  }

  async function confirmItemRemove() {
    const id = itemRemoveTargetId.value;
    if (!id) return;
    itemRemoveSubmitting.value = true;
    try {
      await removeGroceryItem(id);
      await nextTick();
      if (!groceriesError.value) closeItemRemoveModal();
    } finally {
      itemRemoveSubmitting.value = false;
    }
  }

  function openItemEditModal(item: GroceryItem) {
    itemEditId.value = item.id;
    itemEditText.value = item.text;
    itemEditModalOpen.value = true;
  }

  function closeItemEditModal() {
    itemEditModalOpen.value = false;
    itemEditId.value = null;
    itemEditText.value = "";
  }

  async function confirmItemEdit() {
    const id = itemEditId.value;
    if (!id) return;
    itemEditSubmitting.value = true;
    try {
      const ok = await updateGroceryItemText(id, itemEditText.value);
      await nextTick();
      if (ok && !groceriesError.value) closeItemEditModal();
    } finally {
      itemEditSubmitting.value = false;
    }
  }

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
    const ok = await createGroceryList(newListName.value);
    if (ok) closeCreateModal();
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
    if (itemRemoveModalOpen.value) {
      if (!itemRemoveSubmitting.value) closeItemRemoveModal();
      return;
    }
    if (itemEditModalOpen.value) {
      if (!itemEditSubmitting.value) closeItemEditModal();
      return;
    }
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
  <main class="shopping-main shopping-page">
    <div
      class="container-fluid px-3 px-sm-4 shopping-inner"
      style="max-width: 32rem"
    >
      <p class="text-secondary small mb-3 mb-md-4 shopping-intro">
        <span class="d-none d-sm-inline">Lista della spesa · </span>
        Aggiungi articoli come
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
          class="modal fade show d-block shopping-modal"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-list-title"
          @click.self="closeCreateModal"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
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
          class="modal fade show d-block shopping-modal"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-list-title"
          @click.self="closeRenameModal"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
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
          class="modal fade show d-block shopping-modal"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-list-title"
          @click.self="onDeleteModalBackdrop"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
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
          class="modal fade show d-block shopping-modal"
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

      <Teleport to="body">
        <div
          v-if="itemRemoveModalOpen"
          class="modal fade show d-block shopping-modal"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-item-title"
          @click.self="onItemRemoveBackdrop"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="remove-item-title" class="modal-title h5 text-danger">
                  Rimuovi articolo
                </h2>
                <button
                  type="button"
                  class="btn-close"
                  aria-label="Chiudi"
                  :disabled="itemRemoveSubmitting"
                  @click="closeItemRemoveModal"
                />
              </div>
              <div class="modal-body">
                <p class="mb-0">
                  Rimuovere
                  <strong v-if="itemRemoveTargetLabel">{{
                    itemRemoveTargetLabel
                  }}</strong>
                  <span v-else>questo articolo</span>
                  dalla lista?
                </p>
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="itemRemoveSubmitting"
                  @click="closeItemRemoveModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-danger"
                  :disabled="itemRemoveSubmitting"
                  @click="confirmItemRemove"
                >
                  <span
                    v-if="itemRemoveSubmitting"
                    class="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  />
                  Rimuovi
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="itemEditModalOpen"
          class="modal fade show d-block"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-item-title"
          @click.self="onItemEditBackdrop"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="edit-item-title" class="modal-title h5">
                  Modifica articolo
                </h2>
                <button
                  type="button"
                  class="btn-close"
                  aria-label="Chiudi"
                  :disabled="itemEditSubmitting"
                  @click="closeItemEditModal"
                />
              </div>
              <div class="modal-body">
                <label for="edit-item-text" class="form-label">Nome</label>
                <input
                  id="edit-item-text"
                  ref="itemEditInputRef"
                  v-model="itemEditText"
                  type="text"
                  class="form-control form-control-lg"
                  placeholder="Nome articolo…"
                  maxlength="200"
                  autocomplete="off"
                  enterkeyhint="done"
                  inputmode="text"
                  autocapitalize="sentences"
                  :disabled="itemEditSubmitting"
                  @keydown.enter.prevent="confirmItemEdit"
                />
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  :disabled="itemEditSubmitting"
                  @click="closeItemEditModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="!itemEditText.trim() || itemEditSubmitting"
                  @click="confirmItemEdit"
                >
                  <span
                    v-if="itemEditSubmitting"
                    class="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  />
                  Salva
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

      <div class="shopping-add-form mb-3 mb-md-4">
        <form class="mb-0" @submit.prevent="onSubmit">
          <label
            for="grocery-input"
            class="form-label fw-medium mb-2 d-block small text-secondary"
          >
            Nuovo articolo
          </label>
          <div class="input-group input-group-lg">
            <input
              id="grocery-input"
              v-model="newItem"
              type="text"
              class="form-control"
              placeholder="Inserisci nome articolo"
              autocomplete="off"
              autocapitalize="sentences"
              enterkeyhint="done"
              maxlength="200"
              :disabled="!selectedGroceryListId"
            />
            <button
              class="btn btn-primary px-3 px-sm-4 touch-manipulation"
              type="submit"
              :disabled="!newItem.trim() || !selectedGroceryListId"
            >
              Aggiungi
            </button>
          </div>
        </form>
      </div>

      <div
        v-if="currentList.length"
        class="d-flex flex-wrap align-items-center gap-2 gap-sm-3 small mb-3 text-secondary shopping-quick-actions"
      >
        <span class="me-1 align-self-center">Selezione rapida</span>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm py-2 touch-manipulation"
          :disabled="!hasOpenItems"
          @click="markAllGroceryItemsDone(true)"
        >
          Segna tutti
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm py-2 touch-manipulation"
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
          class="list-group-item d-flex align-items-center gap-2 gap-sm-3 py-3 min-touch shopping-list-row touch-manipulation"
          :class="{ 'bg-body-tertiary': item.done }"
        >
          <div
            class="form-check m-0 flex-grow-1 d-flex align-items-start shopping-item-check"
          >
            <input
              :id="`g-${item.id}`"
              class="form-check-input shopping-check flex-shrink-0"
              type="checkbox"
              :checked="item.done"
              @change="onGroceryDoneChange(item, $event)"
            />
            <label
              class="form-check-label user-select-none d-flex align-items-center gap-2 flex-wrap min-w-0 flex-grow-1"
              :for="`g-${item.id}`"
            >
              <span
                class="item-text min-w-0"
                :class="{
                  'text-decoration-line-through text-secondary': item.done,
                }"
              >
                {{ item.text }}
              </span>
              <span
                class="shrink-0 ms-1"
                :class="textIconClassFor(item.addedBy)"
                :title="`Aggiunto da ${userLabel(item.addedBy)}`"
                aria-hidden="true"
              />
            </label>
          </div>
          <div
            class="d-flex align-items-center gap-1 shrink-0 align-self-center"
          >
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm d-inline-flex align-items-center justify-content-center btn-icon-touch touch-manipulation"
              title="Modifica nome"
              aria-label="Modifica nome articolo"
              @click.stop="openItemEditModal(item)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                fill="currentColor"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.5 14.5 3.5 12.5 1.5 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="btn btn-outline-danger btn-sm d-inline-flex align-items-center justify-content-center btn-icon-touch touch-manipulation"
              title="Rimuovi"
              aria-label="Rimuovi articolo"
              @click.stop="openItemRemoveModal(item)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                fill="currentColor"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"
                />
                <path
                  fill-rule="evenodd"
                  d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
                />
              </svg>
            </button>
          </div>
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
        Nessun articolo. Aggiungi il primo nel campo sopra.
      </p>

      <div v-if="currentList.some((i) => i.done)" class="mt-2 mb-1 text-center">
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm py-2 px-3 touch-manipulation"
          @click="clearDoneGroceryItems"
        >
          Rimuovi articoli segnati
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
  .shopping-page {
    min-height: 100dvh;
    padding-top: max(0.35rem, var(--app-safe-top));
    padding-bottom: max(0.75rem, var(--app-safe-bottom));
  }

  .shopping-inner {
    padding-bottom: 0.25rem;
  }

  .min-touch {
    min-height: 3.25rem;
  }

  .shopping-main {
    padding-top: 0.25rem;
  }

  .touch-manipulation {
    touch-action: manipulation;
  }

  .btn-icon-touch {
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  .shopping-check {
    width: 1.35rem;
    height: 1.35rem;
    margin-top: 0.2rem;
    flex-shrink: 0;
  }

  /* Spazio tra checkbox e nome (Bootstrap usa padding-left sul .form-check) */
  .shopping-item-check {
    padding-left: 0;
    gap: 0.75rem;
  }

  .shopping-item-check .form-check-input {
    float: none;
    margin-left: 0;
  }

  .shopping-list-row {
    transition: background-color 0.12s ease;
  }

  .shopping-list-row:active {
    filter: brightness(0.97);
  }

  @media (prefers-reduced-motion: reduce) {
    .shopping-list-row {
      transition: none;
    }
  }

  .shrink-0 {
    flex-shrink: 0;
  }

  .min-w-0 {
    min-width: 0;
  }

  .list-picker .dropdown-menu {
    max-height: min(70dvh, 28rem);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .list-picker-row:hover {
    background-color: var(--bs-light, #f8f9fa);
  }

  .item-text {
    word-break: break-word;
    line-height: 1.45;
    font-size: 1.02rem;
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

  /* Teleported modals: safe area + sheet su telefono */
  :global(.shopping-modal) {
    padding-left: var(--app-safe-left);
    padding-right: var(--app-safe-right);
  }

  :global(.shopping-modal .shopping-modal-dialog) {
    margin: 0.75rem auto;
    max-width: calc(100% - 1.5rem);
  }

  @media (max-width: 575.98px) {
    :global(.shopping-modal.modal) {
      display: flex !important;
      flex-direction: column;
      justify-content: flex-end;
      align-items: stretch;
      padding: 0;
      padding-bottom: var(--app-safe-bottom);
    }

    :global(.shopping-modal .shopping-modal-dialog) {
      margin: 0 !important;
      width: 100%;
      max-width: 100%;
      min-height: unset !important;
      align-items: stretch;
    }

    :global(.shopping-modal .shopping-modal-dialog .modal-content) {
      border-radius: 1rem 1rem 0 0;
      max-height: 88dvh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    :global(.shopping-modal .modal-dialog-scrollable .modal-body) {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    :global(.shopping-modal .modal-footer) {
      flex-direction: column-reverse;
      align-items: stretch;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    :global(.shopping-modal .modal-footer .btn) {
      width: 100%;
      margin: 0;
      min-height: 2.75rem;
    }
  }
</style>
