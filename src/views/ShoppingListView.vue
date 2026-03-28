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
  import NavSparklesIcon from "@/components/icons/NavSparklesIcon.vue";

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
    textIconStyleFor,
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

  const itemEditId = ref<string | null>(null);
  const itemEditText = ref("");
  const itemEditSubmitting = ref(false);
  const itemEditInputRef = ref<HTMLInputElement | null>(null);

  const GROCERY_ITEM_DISPLAY_MAX = 100;

  function groceryItemDisplayText(text: string): string {
    if (text.length <= GROCERY_ITEM_DISPLAY_MAX) return text;
    return `${text.slice(0, GROCERY_ITEM_DISPLAY_MAX).trimEnd()}…`;
  }

  function groceryItemTitleIfTruncated(text: string): string | undefined {
    return text.length > GROCERY_ITEM_DISPLAY_MAX ? text : undefined;
  }

  function groceryItemLabelAriaLabel(text: string): string | undefined {
    return text.length > GROCERY_ITEM_DISPLAY_MAX ? text : undefined;
  }

  watch(itemEditId, async (id) => {
    if (!id) return;
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

  function pickList(id: string) {
    void selectGroceryList(id);
    closeListMenu();
  }

  function openCreateModal() {
    newListName.value = "";
    createModalOpen.value = true;
    closeListMenu();
  }

  function closeCreateModal() {
    createModalOpen.value = false;
  }

  function openRenameModal() {
    renameListName.value = currentGroceryListMeta.value?.title ?? "";
    renameModalOpen.value = true;
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

  function openDeleteListForSelected() {
    const id = selectedGroceryListId.value;
    if (!id) return;
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

  function cancelItemEdit() {
    itemEditId.value = null;
    itemEditText.value = "";
  }

  async function commitOrCancelInlineEdit() {
    const id = itemEditId.value;
    if (!id || itemEditSubmitting.value) return;
    const row = currentList.value.find((i) => i.id === id);
    if (!row) {
      cancelItemEdit();
      return;
    }
    const trimmed = itemEditText.value.trim();
    if (!trimmed) {
      cancelItemEdit();
      return;
    }
    if (trimmed === row.text) {
      cancelItemEdit();
      return;
    }
    await confirmItemEdit();
  }

  function onItemEditBlur() {
    window.setTimeout(() => {
      if (!itemEditId.value) return;
      void commitOrCancelInlineEdit();
    }, 0);
  }

  async function startItemEdit(item: GroceryItem) {
    if (itemEditId.value === item.id) {
      await commitOrCancelInlineEdit();
      return;
    }
    if (itemEditId.value) {
      await commitOrCancelInlineEdit();
      if (itemEditId.value) return;
    }
    itemEditId.value = item.id;
    itemEditText.value = item.text;
  }

  async function confirmItemEdit() {
    const id = itemEditId.value;
    if (!id) return;
    const trimmed = itemEditText.value.trim();
    if (!trimmed) {
      cancelItemEdit();
      return;
    }
    itemEditSubmitting.value = true;
    try {
      const ok = await updateGroceryItemText(id, itemEditText.value);
      await nextTick();
      if (ok && !groceriesError.value) cancelItemEdit();
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
  }

  function onDocumentKeydown(ev: KeyboardEvent) {
    if (ev.key !== "Escape") return;
    if (itemRemoveModalOpen.value) {
      if (!itemRemoveSubmitting.value) closeItemRemoveModal();
      return;
    }
    if (itemEditId.value) {
      if (!itemEditSubmitting.value) cancelItemEdit();
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

  const isAllItemsDone = computed(
    () =>
      currentList.value.length > 0 &&
      currentList.value.every((i) => i.done),
  );

  const bulkMasterCheckboxRef = ref<HTMLInputElement | null>(null);

  watch(
    [currentList, hasOpenItems, hasDoneItems],
    () => {
      nextTick(() => {
        const el = bulkMasterCheckboxRef.value;
        if (!el) return;
        el.indeterminate = hasOpenItems.value && hasDoneItems.value;
      });
    },
    { deep: true, immediate: true },
  );

  function onBulkMasterChange(e: Event) {
    const el = e.target as HTMLInputElement;
    void markAllGroceryItemsDone(el.checked);
  }

  const chatListButtonDisabled = computed(
    () =>
      !isGroceryCloud.value ||
      !appUserSessionValid.value ||
      groceryListsLoading.value,
  );

  const listToolbarListActionsDisabled = computed(
    () =>
      !selectedGroceryListId.value ||
      groceryListsLoading.value ||
      !groceryLists.value.length,
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

      <div
        v-if="groceriesError"
        class="alert alert-warning small py-2 mb-2"
        role="alert"
      >
        {{ groceriesError }}
      </div>

      <div class="mb-3 shopping-list-controls">
        <span class="form-label small text-secondary d-block mb-1 fw-semibold"
          >Lista attiva</span
        >
        <div
          class="d-flex flex-column flex-sm-row gap-2 align-items-stretch align-items-sm-center shopping-list-controls-row"
        >
          <div
            ref="listMenuRoot"
            class="dropdown flex-grow-1 min-w-0 list-picker shopping-list-picker-wrap"
          >
            <button
              id="list-picker-btn"
              type="button"
              class="btn btn-sm btn-light border text-start w-100 d-flex align-items-center justify-content-between gap-2 py-2 shopping-list-picker-btn"
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
                  :style="textIconStyleFor(currentGroceryListMeta.createdBy)"
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
                    :style="textIconStyleFor(list.createdBy)"
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
          <div
            class="d-flex gap-1 align-items-stretch shopping-list-toolbar"
          >
            <button
              type="button"
              class="btn btn-sm btn-outline-primary d-inline-flex align-items-center justify-content-center shopping-toolbar-btn shopping-toolbar-icon-btn"
              :disabled="groceryListsLoading"
              aria-label="Nuova lista"
              title="Nuova lista"
              @click="openCreateModal"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center justify-content-center shopping-toolbar-btn shopping-toolbar-icon-btn shopping-ai-btn"
              :disabled="chatListButtonDisabled || chatGroceryLoading"
              aria-label="Crea una nuova lista della spesa con l’assistenza AI"
              title="Crea lista con AI"
              @click="openChatModal"
            >
              <span class="shopping-ai-btn-inner">
                <span
                  v-if="chatGroceryLoading"
                  class="spinner-border spinner-border-sm shopping-ai-btn-spinner"
                  role="status"
                  aria-hidden="true"
                />
                <NavSparklesIcon v-else class="shopping-ai-btn-icon" />
              </span>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center justify-content-center shopping-toolbar-btn shopping-toolbar-icon-btn"
              :disabled="listToolbarListActionsDisabled"
              title="Modifica nome lista"
              aria-label="Modifica nome lista"
              @click="openRenameModal"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
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
              class="btn btn-sm btn-outline-danger d-inline-flex align-items-center justify-content-center shopping-toolbar-btn shopping-toolbar-icon-btn"
              :disabled="listToolbarListActionsDisabled"
              title="Elimina lista"
              aria-label="Elimina lista"
              @click="openDeleteListForSelected"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
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
        </div>
        <p
          v-if="!isGroceryCloud"
          class="form-text text-secondary mb-0 mt-1 small"
        >
          Accedi con Supabase per usare la creazione lista con AI.
        </p>
        <p
          v-else-if="!appUserSessionValid"
          class="form-text text-secondary mb-0 mt-1 small"
        >
          Effettua il login per usare la creazione lista con AI.
        </p>
      </div>

      <div
        v-if="!groceryLists.length && !groceryListsLoading"
        class="alert alert-light border mb-3 small py-2"
      >
        Nessuna lista ancora. Tocca <strong>+</strong> per iniziare.
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
                  class="btn btn-sm btn-secondary"
                  @click="closeCreateModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
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
                  class="btn btn-sm btn-secondary"
                  @click="closeRenameModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
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
                  class="btn btn-sm btn-secondary"
                  :disabled="deleteListSubmitting"
                  @click="closeDeleteModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-danger"
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
                  class="btn btn-sm btn-secondary"
                  :disabled="chatGroceryLoading"
                  @click="closeChatModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
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
          class="modal fade show d-block shopping-remove-modal"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.28)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-item-title"
          @click.self="onItemRemoveBackdrop"
        >
          <div
            class="modal-dialog modal-dialog-centered modal-sm shopping-remove-modal-dialog"
          >
            <div class="modal-content border-0 shadow-sm" @click.stop>
              <div class="modal-header border-0 py-2 px-3 pb-0">
                <h2 id="remove-item-title" class="modal-title fs-6 fw-semibold mb-0">
                  Rimuovere dalla lista?
                </h2>
                <button
                  type="button"
                  class="btn-close shopping-remove-modal-close"
                  aria-label="Chiudi"
                  :disabled="itemRemoveSubmitting"
                  @click="closeItemRemoveModal"
                />
              </div>
              <div class="modal-body py-2 px-3 pt-1 small text-secondary">
                <p class="mb-0 text-break">
                  <template v-if="itemRemoveTargetLabel">
                    <span class="text-body">{{ itemRemoveTargetLabel }}</span>
                  </template>
                  <template v-else>Questo articolo</template>
                </p>
              </div>
              <div
                class="modal-footer border-0 py-2 px-3 pt-0 gap-2 justify-content-end flex-nowrap"
              >
                <button
                  type="button"
                  class="btn btn-sm btn-light border"
                  :disabled="itemRemoveSubmitting"
                  @click="closeItemRemoveModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-danger"
                  :disabled="itemRemoveSubmitting"
                  @click="confirmItemRemove"
                >
                  <span
                    v-if="itemRemoveSubmitting"
                    class="spinner-border spinner-border-sm me-1"
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

      <div class="shopping-add-form mb-3">
        <form class="mb-0" @submit.prevent="onSubmit">
          <label
            for="grocery-input"
            class="form-label fw-semibold mb-1 d-block small text-secondary"
          >
            Nuovo articolo
          </label>
          <div class="input-group input-group-sm">
            <input
              id="grocery-input"
              v-model="newItem"
              type="text"
              class="form-control"
              placeholder="Nome articolo…"
              autocomplete="off"
              autocapitalize="sentences"
              enterkeyhint="done"
              maxlength="200"
              :disabled="!selectedGroceryListId"
            />
            <button
              class="btn btn-primary touch-manipulation"
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
        class="mb-1 d-flex justify-content-end align-items-center shopping-bulk-action"
      >
        <div class="form-check mb-0 shopping-bulk-master d-flex align-items-center gap-1">
          <input
            id="shopping-bulk-master"
            ref="bulkMasterCheckboxRef"
            type="checkbox"
            class="form-check-input shopping-check shopping-bulk-master-check flex-shrink-0"
            :checked="isAllItemsDone"
            aria-label="Segna o deseleziona tutti gli articoli della lista"
            title="Segna tutti / deseleziona tutti"
            @change="onBulkMasterChange"
          />
          <label
            class="form-check-label small text-secondary mb-0 user-select-none"
            for="shopping-bulk-master"
          >
            Tutti
          </label>
        </div>
      </div>

      <ul
        v-if="currentList.length"
        class="list-group list-group-flush shadow-sm rounded overflow-hidden shopping-items-list"
      >
        <li
          v-for="item in currentList"
          :key="item.id"
          class="list-group-item d-flex align-items-center gap-2 gap-sm-3 py-1 shopping-list-row touch-manipulation shopping-list-row--compact"
          :class="{ 'bg-body-tertiary': item.done }"
        >
          <div
            class="form-check m-0 flex-grow-1 d-flex align-items-center shopping-item-check"
          >
            <input
              :id="`g-${item.id}`"
              class="form-check-input shopping-check flex-shrink-0"
              type="checkbox"
              :checked="item.done"
              @change="onGroceryDoneChange(item, $event)"
            />
            <div
              class="min-w-0 flex-grow-1 d-flex flex-column align-items-stretch gap-0"
            >
              <label
                v-if="itemEditId !== item.id"
                class="form-check-label user-select-none d-flex align-items-center gap-2 flex-wrap min-w-0 mb-0"
                :for="`g-${item.id}`"
                :aria-label="groceryItemLabelAriaLabel(item.text)"
              >
                <span
                  class="item-text min-w-0 shopping-item-text-line"
                  :class="{
                    'text-decoration-line-through text-secondary': item.done,
                  }"
                  :title="groceryItemTitleIfTruncated(item.text)"
                >
                  {{ groceryItemDisplayText(item.text) }}
                </span>
                <span
                  class="shrink-0 ms-1"
                  :class="textIconClassFor(item.addedBy)"
                  :style="textIconStyleFor(item.addedBy)"
                  :title="`Aggiunto da ${userLabel(item.addedBy)}`"
                  aria-hidden="true"
                />
              </label>
              <div
                v-else
                class="d-flex align-items-center gap-2 min-w-0 w-100"
              >
                <input
                  ref="itemEditInputRef"
                  v-model="itemEditText"
                  type="text"
                  class="form-control form-control-sm shopping-item-edit-input"
                  placeholder="Nome articolo…"
                  maxlength="200"
                  autocomplete="off"
                  enterkeyhint="done"
                  inputmode="text"
                  autocapitalize="sentences"
                  :disabled="itemEditSubmitting"
                  :aria-label="`Modifica ${item.text}`"
                  @keydown.enter.prevent="confirmItemEdit"
                  @keydown.escape.prevent="cancelItemEdit"
                  @blur="onItemEditBlur"
                />
                <span
                  class="shrink-0"
                  :class="textIconClassFor(item.addedBy)"
                  :style="textIconStyleFor(item.addedBy)"
                  :title="`Aggiunto da ${userLabel(item.addedBy)}`"
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
          <div
            class="d-flex align-items-center gap-1 shrink-0 align-self-center shopping-item-actions"
          >
            <button
              v-if="itemEditId !== item.id"
              type="button"
              class="btn btn-outline-secondary btn-sm d-inline-flex align-items-center justify-content-center btn-icon-touch touch-manipulation"
              title="Modifica nome"
              aria-label="Modifica nome articolo"
              @click.stop="startItemEdit(item)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
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
                width="16"
                height="16"
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
          class="btn btn-outline-secondary btn-sm touch-manipulation"
          @click="clearDoneGroceryItems"
        >
          Rimuovi segnati
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

  .shopping-main {
    padding-top: 0.25rem;
  }

  .shopping-list-controls {
    padding-bottom: 0.125rem;
  }

  /* La riga lista + toolbar: priorità di spazio al selettore lista */
  .shopping-list-controls-row {
    min-width: 0;
  }

  .shopping-list-picker-wrap {
    flex: 1 1 0%;
    min-width: 0;
  }

  .shopping-list-picker-btn {
    min-height: 2.5rem;
  }

  /* Toolbar larghezza contenuto; Nuova compatta; icone fisse */
  .shopping-list-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: stretch;
    width: auto;
    max-width: 100%;
    flex: 0 0 auto;
  }

  .shopping-list-toolbar > .shopping-toolbar-btn:first-of-type {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .shopping-list-toolbar > .shopping-toolbar-icon-btn {
    flex: 0 0 var(--shopping-toolbar-icon-size, 2.375rem);
    width: var(--shopping-toolbar-icon-size, 2.375rem);
    min-width: var(--shopping-toolbar-icon-size, 2.375rem);
    max-width: var(--shopping-toolbar-icon-size, 2.375rem);
    box-sizing: border-box;
  }

  .shopping-toolbar-btn {
    min-height: 2.3125rem;
    padding-left: 0.35rem;
    padding-right: 0.35rem;
  }

  .shopping-toolbar-icon-btn {
    padding-left: 0.25rem;
    padding-right: 0.25rem;
  }

  .shopping-toolbar-icon-btn svg {
    display: block;
  }

  .shopping-ai-btn {
    line-height: 0;
  }

  .shopping-ai-btn-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    width: 100%;
    height: 100%;
    min-height: 1rem;
  }

  .shopping-ai-btn-icon,
  .shopping-ai-btn :deep(svg) {
    display: block;
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    margin: 0;
  }

  .shopping-ai-btn-spinner {
    flex-shrink: 0;
  }

  .shopping-list-row--compact {
    min-height: 2.75rem;
  }

  .shopping-bulk-action {
    min-height: 0;
  }

  .shopping-bulk-master .form-check-label {
    cursor: pointer;
    padding-top: 0.05rem;
  }

  .shopping-item-edit-input {
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
  }

  .touch-manipulation {
    touch-action: manipulation;
  }

  .btn-icon-touch {
    min-width: 2.25rem;
    min-height: 2.25rem;
    padding-left: 0.35rem;
    padding-right: 0.35rem;
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
    gap: 0.5rem;
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

  /* Modale rimozione articolo: compatto, centrato (no bottom sheet a tutta larghezza) */
  :global(.shopping-remove-modal) {
    padding-left: max(1rem, var(--app-safe-left));
    padding-right: max(1rem, var(--app-safe-right));
    padding-bottom: max(1rem, var(--app-safe-bottom));
    padding-top: max(0.75rem, var(--app-safe-top));
  }

  :global(.shopping-remove-modal .shopping-remove-modal-dialog) {
    margin: 0.5rem auto;
    max-width: min(18rem, calc(100% - 1.5rem));
  }

  :global(.shopping-remove-modal .shopping-remove-modal-close) {
    padding: 0.35rem;
    margin: -0.15rem -0.15rem -0.15rem auto;
    opacity: 0.65;
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
      min-height: 2.5rem;
    }
  }
</style>
