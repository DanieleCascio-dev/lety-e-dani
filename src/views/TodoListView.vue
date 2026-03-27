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
  import type { TodoItem } from "@/types/app";
  import {
    ensureTodoRealtimeConnected,
    refreshTodoData,
    useTodoLists,
  } from "@/composables/useTodoLists";
  import { useAppStorage } from "@/composables/useAppStorage";

  const newItem = ref("");
  const {
    appUserSessionValid,
    todoLists,
    todoListsLoading,
    selectedTodoListId,
    currentTodoListMeta,
    todosLoading,
    todosError,
    currentTodoList,
    isTodoCloud,
    todoListDisplayName,
    selectTodoList,
    createTodoList,
    renameTodoList,
    deleteTodoList,
    addTodoItem,
    setTodoItemDone,
    updateTodoItemText,
    removeTodoItem,
    clearDoneTodoItems,
    markAllTodoItemsDone,
    startTodoSync,
  } = useTodoLists();

  const { textIconClassFor, textIconStyleFor } = useAppStorage();

  const listMenuOpen = ref(false);
  const listMenuRoot = ref<HTMLElement | null>(null);
  const actionsMenuOpen = ref(false);
  const actionsMenuRoot = ref<HTMLElement | null>(null);

  const createModalOpen = ref(false);
  const newListName = ref("");
  const renameModalOpen = ref(false);
  const renameListName = ref("");
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

  function userLabel(id: string) {
    return id === "daniele" ? "Daniele" : "Letizia";
  }

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
    void selectTodoList(id);
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
    renameListName.value = currentTodoListMeta.value?.title ?? "";
    renameModalOpen.value = true;
    closeActionsMenu();
    closeListMenu();
  }

  function closeRenameModal() {
    renameModalOpen.value = false;
  }

  async function confirmRenameList() {
    const id = selectedTodoListId.value;
    if (!id) return;
    const ok = await renameTodoList(id, renameListName.value);
    if (ok) closeRenameModal();
  }

  function onDeleteFromActionsMenu() {
    const id = selectedTodoListId.value;
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
    const list = todoLists.value.find((l) => l.id === id);
    return list ? todoListDisplayName(list) : "";
  });

  const itemRemoveTargetLabel = computed(() => {
    const id = itemRemoveTargetId.value;
    if (!id) return "";
    return currentTodoList.value.find((i) => i.id === id)?.text ?? "";
  });

  function openItemRemoveModal(item: TodoItem) {
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
      await removeTodoItem(id);
      await nextTick();
      if (!todosError.value) closeItemRemoveModal();
    } finally {
      itemRemoveSubmitting.value = false;
    }
  }

  function openItemEditModal(item: TodoItem) {
    itemEditId.value = item.id;
    itemEditText.value = item.text;
    itemEditModalOpen.value = true;
  }

  function closeItemEditModal() {
    itemEditModalOpen.value = false;
    itemEditId.value = null;
    itemEditText.value = "";
  }

  function onItemEditBackdrop() {
    if (!itemEditSubmitting.value) closeItemEditModal();
  }

  async function confirmItemEdit() {
    const id = itemEditId.value;
    if (!id) return;
    itemEditSubmitting.value = true;
    try {
      const ok = await updateTodoItemText(id, itemEditText.value);
      await nextTick();
      if (ok && !todosError.value) closeItemEditModal();
    } finally {
      itemEditSubmitting.value = false;
    }
  }

  async function confirmCreateList() {
    const ok = await createTodoList(newListName.value);
    if (ok) closeCreateModal();
  }

  async function confirmDeleteList() {
    const id = deleteTargetId.value;
    if (!id) return;
    deleteListSubmitting.value = true;
    try {
      await deleteTodoList(id);
      await nextTick();
      if (!todosError.value) closeDeleteModal();
    } finally {
      deleteListSubmitting.value = false;
    }
  }

  async function onSubmit() {
    const ok = await addTodoItem(newItem.value);
    if (ok) newItem.value = "";
  }

  function onTodoDoneChange(item: TodoItem, e: Event) {
    const el = e.target as HTMLInputElement;
    void setTodoItemDone(item.id, el.checked);
  }

  const hasOpenItems = computed(() =>
    currentTodoList.value.some((i) => !i.done),
  );
  const hasDoneItems = computed(() =>
    currentTodoList.value.some((i) => i.done),
  );

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
    closeListMenu();
    closeActionsMenu();
  }

  async function refreshTodoPageData() {
    if (!isTodoCloud.value || !appUserSessionValid.value) return;
    await refreshTodoData({ silent: true });
    ensureTodoRealtimeConnected();
  }

  onMounted(() => {
    if (appUserSessionValid.value) void startTodoSync();
    ensureTodoRealtimeConnected();
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeydown, true);
  });

  onActivated(() => {
    void refreshTodoPageData();
  });

  onUnmounted(() => {
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onDocumentKeydown, true);
  });
</script>

<template>
  <main class="todo-main shopping-main pb-5">
    <div class="container-fluid px-3 px-sm-4 todo-page">
      <h1 class="h5 fw-semibold mb-3">Cose da fare</h1>
      <div
        v-if="todosError"
        class="alert alert-warning py-2 small mb-3"
        role="status"
      >
        {{ todosError }}
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
              id="todo-list-picker-btn"
              type="button"
              class="btn btn-light border text-start w-100 d-flex align-items-center justify-content-between gap-2 py-2 min-touch"
              :disabled="!todoLists.length || todoListsLoading"
              aria-haspopup="true"
              :aria-expanded="listMenuOpen"
              @click.stop="toggleListMenu"
            >
              <span
                v-if="currentTodoListMeta"
                class="d-flex align-items-center gap-2 min-w-0"
              >
                <span
                  class="shrink-0"
                  :class="textIconClassFor(currentTodoListMeta.createdBy)"
                  :style="textIconStyleFor(currentTodoListMeta.createdBy)"
                  :title="`Creata da ${userLabel(currentTodoListMeta.createdBy)}`"
                  aria-hidden="true"
                />
                <span class="text-truncate">{{
                  todoListDisplayName(currentTodoListMeta)
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
              aria-labelledby="todo-list-picker-btn"
            >
              <li v-for="list in todoLists" :key="list.id" class="px-1">
                <button
                  type="button"
                  class="btn btn-link text-body text-decoration-none w-100 text-start py-2 px-2 d-flex align-items-center gap-2 min-w-0 list-picker-row rounded border-0 min-touch"
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
                    todoListDisplayName(list)
                  }}</span>
                </button>
              </li>
            </ul>
          </div>
          <div class="d-flex gap-2 shrink-0 align-items-stretch">
            <button
              type="button"
              class="btn btn-outline-primary min-touch"
              :disabled="todoListsLoading"
              @click="openCreateModal"
            >
              Nuova lista
            </button>
            <div ref="actionsMenuRoot" class="dropdown list-actions-dropdown">
              <button
                id="todo-list-actions-menu"
                type="button"
                class="btn btn-outline-secondary d-inline-flex align-items-center justify-content-center px-2 h-100 min-touch"
                :disabled="
                  !selectedTodoListId || todoListsLoading || !todoLists.length
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
                aria-labelledby="todo-list-actions-menu"
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
        v-if="!todoLists.length && !todoListsLoading"
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
          aria-labelledby="todo-new-list-title"
          @click.self="closeCreateModal"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="todo-new-list-title" class="modal-title h5">
                  Nuova lista
                </h2>
                <button
                  type="button"
                  class="btn-close"
                  aria-label="Chiudi"
                  @click="closeCreateModal"
                />
              </div>
              <div class="modal-body">
                <label for="todo-new-list-name" class="form-label"
                  >Nome lista</label
                >
                <input
                  id="todo-new-list-name"
                  v-model="newListName"
                  type="text"
                  class="form-control"
                  placeholder="Es. Lavoro, Casa…"
                  maxlength="80"
                  autocomplete="off"
                  @keydown.enter.prevent="confirmCreateList"
                />
                <p class="form-text small mb-0">
                  Opzionale: viene mostrato come <strong>Nome · data</strong>.
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
          aria-labelledby="todo-rename-list-title"
          @click.self="closeRenameModal"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="todo-rename-list-title" class="modal-title h5">
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
                <label for="todo-rename-list-name" class="form-label"
                  >Nome lista</label
                >
                <input
                  id="todo-rename-list-name"
                  v-model="renameListName"
                  type="text"
                  class="form-control"
                  maxlength="80"
                  autocomplete="off"
                  @keydown.enter.prevent="confirmRenameList"
                />
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
          aria-labelledby="todo-delete-list-title"
          @click.self="onDeleteModalBackdrop"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2
                  id="todo-delete-list-title"
                  class="modal-title h5 text-danger"
                >
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
                <p class="mb-0">
                  Eliminare
                  <strong v-if="deleteTargetLabel">{{
                    deleteTargetLabel
                  }}</strong>
                  <span v-else>questa lista</span>
                  ? Tutte le attività saranno rimosse.
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
                  Elimina
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
          aria-labelledby="todo-remove-item-title"
          @click.self="onItemRemoveBackdrop"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2
                  id="todo-remove-item-title"
                  class="modal-title h5 text-danger"
                >
                  Rimuovi attività
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
                  <span v-else>questa attività</span>?
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
          class="modal fade show d-block shopping-modal"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="todo-edit-item-title"
          @click.self="onItemEditBackdrop"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="todo-edit-item-title" class="modal-title h5">
                  Modifica attività
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
                <label for="todo-edit-item-text" class="form-label"
                  >Testo</label
                >
                <input
                  id="todo-edit-item-text"
                  ref="itemEditInputRef"
                  v-model="itemEditText"
                  type="text"
                  class="form-control form-control-lg"
                  maxlength="200"
                  autocomplete="off"
                  enterkeyhint="done"
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

      <div class="todo-add-form mb-3 mb-md-4">
        <form class="mb-0" @submit.prevent="onSubmit">
          <label
            for="todo-input"
            class="form-label fw-medium mb-2 d-block small text-secondary"
          >
            Nuova attività
          </label>
          <div class="input-group input-group-lg">
            <input
              id="todo-input"
              v-model="newItem"
              type="text"
              class="form-control"
              placeholder="Cosa c’è da fare?"
              autocomplete="off"
              autocapitalize="sentences"
              enterkeyhint="done"
              maxlength="200"
              :disabled="!selectedTodoListId"
            />
            <button
              class="btn btn-primary px-3 px-sm-4 touch-manipulation min-touch"
              type="submit"
              :disabled="!newItem.trim() || !selectedTodoListId"
            >
              Aggiungi
            </button>
          </div>
        </form>
      </div>

      <div
        v-if="currentTodoList.length"
        class="d-flex flex-wrap align-items-center gap-2 gap-sm-3 small mb-3 text-secondary"
      >
        <span class="me-1 align-self-center">Selezione rapida</span>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm py-2 touch-manipulation min-touch"
          :disabled="!hasOpenItems"
          @click="markAllTodoItemsDone(true)"
        >
          Segna tutti
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm py-2 touch-manipulation min-touch"
          :disabled="!hasDoneItems"
          @click="markAllTodoItemsDone(false)"
        >
          Deseleziona tutti
        </button>
      </div>

      <ul
        v-if="currentTodoList.length"
        class="list-group list-group-flush shadow-sm rounded overflow-hidden"
      >
        <li
          v-for="item in currentTodoList"
          :key="item.id"
          class="list-group-item d-flex align-items-center gap-2 gap-sm-3 py-3 min-touch todo-list-row touch-manipulation"
          :class="{ 'bg-body-tertiary': item.done }"
        >
          <div
            class="form-check m-0 flex-grow-1 d-flex align-items-start todo-item-check"
          >
            <input
              :id="`todo-${item.id}`"
              class="form-check-input todo-check flex-shrink-0"
              type="checkbox"
              :checked="item.done"
              @change="onTodoDoneChange(item, $event)"
            />
            <label
              class="form-check-label user-select-none d-flex align-items-center gap-2 flex-wrap min-w-0 flex-grow-1"
              :for="`todo-${item.id}`"
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
                :style="textIconStyleFor(item.addedBy)"
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
              title="Modifica"
              aria-label="Modifica attività"
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
              aria-label="Rimuovi attività"
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
        v-else-if="todosLoading || todoListsLoading"
        class="text-center text-secondary py-5 mb-0"
      >
        Caricamento…
      </p>
      <p
        v-else-if="selectedTodoListId"
        class="text-center text-secondary py-5 mb-0"
      >
        Nessuna attività in questa lista. Aggiungi la prima sopra.
      </p>

      <div
        v-if="currentTodoList.some((i) => i.done)"
        class="mt-2 mb-1 text-center"
      >
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm py-2 px-3 touch-manipulation min-touch"
          @click="clearDoneTodoItems"
        >
          Rimuovi completate
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
  .todo-main {
    padding-top: 0.5rem;
  }

  .todo-page {
    max-width: 42rem;
  }

  .min-touch {
    min-height: 3.25rem;
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

  .todo-check {
    width: 1.35rem;
    height: 1.35rem;
    margin-top: 0.2rem;
    flex-shrink: 0;
  }

  .todo-item-check {
    padding-left: 0;
    gap: 0.75rem;
  }

  .todo-item-check .form-check-input {
    float: none;
    margin-left: 0;
  }

  .todo-list-row {
    transition: background-color 0.12s ease;
  }

  /* Stessi aggiustamenti modale lista spesa (safe area, sheet su mobile) */
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
