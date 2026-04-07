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
  import type { TodoItem, UserId } from "@/types/app";
  import {
    ensureTodoRealtimeConnected,
    refreshTodoData,
    useTodoLists,
  } from "@/composables/useTodoLists";
  import { useAppStorage } from "@/composables/useAppStorage";
  import { useShoppingSwipeReveal } from "@/composables/useShoppingSwipeReveal";

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

  const { textIconClassFor, textIconStyleFor, profileFor } = useAppStorage();

  const swipeReveal = useShoppingSwipeReveal({ revealPx: 100 });

  function hasOpenSwipeReveal(): boolean {
    return Object.values(swipeReveal.tx).some((v) => v !== 0);
  }

  function onSwipeRevealEdit(item: TodoItem) {
    swipeReveal.snapClosed(item.id);
    void startItemEdit(item);
  }

  function onSwipeRevealRemove(item: TodoItem) {
    swipeReveal.snapClosed(item.id);
    openItemRemoveModal(item);
  }

  const listMenuOpen = ref(false);
  const listMenuRoot = ref<HTMLElement | null>(null);
  const listActionsMenuOpen = ref(false);
  const listActionsMenuRoot = ref<HTMLElement | null>(null);
  const listActionsMoreBtnRef = ref<HTMLButtonElement | null>(null);
  const listActionsMenuPanelRef = ref<HTMLElement | null>(null);
  const listActionsMenuStyle = ref<Record<string, string>>({});

  function updateListActionsMenuPosition() {
    const btn = listActionsMoreBtnRef.value;
    if (!btn || !listActionsMenuOpen.value) return;
    const r = btn.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const gap = 8;
    const panel = listActionsMenuPanelRef.value;
    const ph = panel?.offsetHeight ?? 160;
    let top = r.bottom + gap;
    const spaceBelow = vh - r.bottom - gap;
    const spaceAbove = r.top - gap;
    if (ph > spaceBelow && spaceAbove >= ph) {
      top = r.top - ph - gap;
    } else if (top + ph > vh - 8) {
      top = Math.max(8, vh - ph - 8);
    }
    listActionsMenuStyle.value = {
      position: "fixed",
      top: `${Math.round(top)}px`,
      right: `${Math.round(Math.max(8, vw - r.right))}px`,
      left: "auto",
      minWidth: `${Math.max(200, Math.round(r.width))}px`,
      zIndex: "1060",
    };
  }

  function bindListActionsMenuPositionListeners() {
    window.addEventListener("scroll", updateListActionsMenuPosition, true);
    window.addEventListener("resize", updateListActionsMenuPosition);
  }

  function unbindListActionsMenuPositionListeners() {
    window.removeEventListener("scroll", updateListActionsMenuPosition, true);
    window.removeEventListener("resize", updateListActionsMenuPosition);
  }

  watch(listActionsMenuOpen, async (open) => {
    if (!open) {
      unbindListActionsMenuPositionListeners();
      listActionsMenuStyle.value = {};
      return;
    }
    await nextTick();
    requestAnimationFrame(() => {
      updateListActionsMenuPosition();
      requestAnimationFrame(() => {
        updateListActionsMenuPosition();
        bindListActionsMenuPositionListeners();
      });
    });
  });

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
  const itemEditId = ref<string | null>(null);
  const itemEditText = ref("");
  const itemEditSubmitting = ref(false);
  const itemEditInputRef = ref<HTMLInputElement | null>(null);

  const TODO_ITEM_DISPLAY_MAX = 100;

  function todoItemDisplayText(text: string): string {
    if (text.length <= TODO_ITEM_DISPLAY_MAX) return text;
    return `${text.slice(0, TODO_ITEM_DISPLAY_MAX).trimEnd()}…`;
  }

  function todoItemTitleIfTruncated(text: string): string | undefined {
    return text.length > TODO_ITEM_DISPLAY_MAX ? text : undefined;
  }

  function todoItemLabelAriaLabel(text: string): string | undefined {
    return text.length > TODO_ITEM_DISPLAY_MAX ? text : undefined;
  }

  watch(itemEditId, async (id) => {
    if (id) swipeReveal.closeAll();
    if (!id) return;
    await nextTick();
    const el = itemEditInputRef.value;
    if (!el) return;
    el.focus();
    el.select();
  });

  function userLabel(id: string) {
    return profileFor(id as UserId).displayName;
  }

  function userMarkerLetter(id: UserId): string {
    const dn = profileFor(id).displayName.trim();
    if (dn.length) return dn.charAt(0).toUpperCase();
    const slug = String(id).trim();
    return slug.length ? slug.charAt(0).toUpperCase() : "?";
  }

  function toggleListMenu() {
    listMenuOpen.value = !listMenuOpen.value;
    if (listMenuOpen.value) {
      listActionsMenuOpen.value = false;
    }
  }

  function closeListMenu() {
    listMenuOpen.value = false;
  }

  function toggleListActionsMenu() {
    listActionsMenuOpen.value = !listActionsMenuOpen.value;
    if (listActionsMenuOpen.value) {
      listMenuOpen.value = false;
    }
  }

  function closeListActionsMenu() {
    listActionsMenuOpen.value = false;
  }

  function pickList(id: string) {
    void selectTodoList(id);
    closeListMenu();
    closeListActionsMenu();
  }

  function openCreateModal() {
    newListName.value = "";
    createModalOpen.value = true;
    closeListMenu();
    closeListActionsMenu();
  }

  function closeCreateModal() {
    createModalOpen.value = false;
  }

  function openRenameModal() {
    renameListName.value = currentTodoListMeta.value?.title ?? "";
    renameModalOpen.value = true;
    closeListMenu();
    closeListActionsMenu();
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

  function openDeleteListForSelected() {
    const id = selectedTodoListId.value;
    if (!id) return;
    openDeleteListModal(id);
  }

  function openDeleteListModal(id: string) {
    deleteTargetId.value = id;
    deleteModalOpen.value = true;
    closeListMenu();
    closeListActionsMenu();
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

  function cancelItemEdit() {
    itemEditId.value = null;
    itemEditText.value = "";
  }

  async function commitOrCancelInlineEdit() {
    const id = itemEditId.value;
    if (!id || itemEditSubmitting.value) return;
    const row = currentTodoList.value.find((i) => i.id === id);
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

  async function startItemEdit(item: TodoItem) {
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
      const ok = await updateTodoItemText(id, itemEditText.value);
      await nextTick();
      if (ok && !todosError.value) cancelItemEdit();
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

  const isAllItemsDone = computed(
    () =>
      currentTodoList.value.length > 0 &&
      currentTodoList.value.every((i) => i.done),
  );

  const STORAGE_HIDE_DONE = "lety-dani:todo-hide-done";

  function readHideDonePreference(): boolean {
    try {
      return localStorage.getItem(STORAGE_HIDE_DONE) === "1";
    } catch {
      return false;
    }
  }

  const hideDoneItems = ref(readHideDonePreference());

  watch(hideDoneItems, (v) => {
    try {
      localStorage.setItem(STORAGE_HIDE_DONE, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  });

  const visibleTodoList = computed(() =>
    hideDoneItems.value
      ? currentTodoList.value.filter((i) => !i.done)
      : currentTodoList.value,
  );

  const hideDoneAllHiddenNote = computed(
    () =>
      hideDoneItems.value &&
      currentTodoList.value.length > 0 &&
      visibleTodoList.value.length === 0,
  );

  const bulkMasterCheckboxRef = ref<HTMLInputElement | null>(null);

  watch(
    [currentTodoList, hasOpenItems, hasDoneItems],
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
    void markAllTodoItemsDone(el.checked);
  }

  const listToolbarListActionsDisabled = computed(
    () =>
      !selectedTodoListId.value ||
      todoListsLoading.value ||
      !todoLists.value.length,
  );

  function onDocumentPointerDown(ev: PointerEvent) {
    const t = ev.target;
    if (listMenuOpen.value) {
      const root = listMenuRoot.value;
      if (root && t instanceof Node && !root.contains(t)) closeListMenu();
    }
    if (listActionsMenuOpen.value) {
      const root = listActionsMenuRoot.value;
      const panel = listActionsMenuPanelRef.value;
      if (t instanceof Node) {
        const inside = Boolean(
          (root && root.contains(t)) || (panel && panel.contains(t)),
        );
        if (!inside) closeListActionsMenu();
      }
    }
    if (t instanceof Element && !t.closest(".shopping-swipe-row")) {
      swipeReveal.closeAll();
    }
  }

  function onDocumentKeydown(ev: KeyboardEvent) {
    if (ev.key !== "Escape") return;
    if (hasOpenSwipeReveal()) {
      swipeReveal.closeAll();
      return;
    }
    if (listActionsMenuOpen.value) {
      closeListActionsMenu();
      return;
    }
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
    closeListMenu();
  }

  async function refreshTodoPageData() {
    if (!isTodoCloud.value) return;
    await refreshTodoData({ silent: true });
    ensureTodoRealtimeConnected();
  }

  watch(
    appUserSessionValid,
    (ok, wasOk) => {
      if (ok && wasOk === false && isTodoCloud.value) void startTodoSync();
    },
  );

  onMounted(() => {
    if (isTodoCloud.value) void startTodoSync();
    ensureTodoRealtimeConnected();
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeydown, true);
  });

  onActivated(() => {
    void refreshTodoPageData();
  });

  onUnmounted(() => {
    unbindListActionsMenuPositionListeners();
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onDocumentKeydown, true);
  });
</script>

<template>
  <main class="shopping-main shopping-page">
    <div
      class="container-fluid px-3 px-sm-4 shopping-inner"
      style="max-width: 32rem"
    >
      <h1 class="h5 fw-semibold mb-3">Cose da fare</h1>
      <div
        v-if="todosError"
        class="alert alert-warning small py-2 mb-2"
        role="status"
      >
        {{ todosError }}
      </div>

      <div class="mb-2 shopping-list-controls">
        <div class="d-flex align-items-stretch gap-2 shopping-top-strip">
          <div
            ref="listMenuRoot"
            class="dropdown flex-grow-1 min-w-0 list-picker shopping-list-picker-wrap"
          >
            <button
              id="todo-list-picker-btn"
              type="button"
              class="btn btn-light border-0 rounded-3 text-start w-100 d-flex align-items-center justify-content-between gap-2 py-2 px-3 shopping-list-picker-btn shopping-picker-trigger shadow-sm"
              :disabled="todoListsLoading"
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
                <span class="text-truncate fw-medium">{{
                  todoListDisplayName(currentTodoListMeta)
                }}</span>
              </span>
              <span v-else class="text-secondary">—</span>
              <span class="text-secondary small shrink-0" aria-hidden="true"
                >▾</span
              >
            </button>
            <ul
              class="dropdown-menu shadow-sm border-0 w-100 py-1"
              :class="{ show: listMenuOpen }"
              aria-labelledby="todo-list-picker-btn"
            >
              <li v-for="list in todoLists" :key="list.id" class="px-1">
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
                    todoListDisplayName(list)
                  }}</span>
                </button>
              </li>
            </ul>
          </div>
          <div
            ref="listActionsMenuRoot"
            class="dropdown flex-shrink-0 shopping-list-actions-dd"
          >
            <button
              ref="listActionsMoreBtnRef"
              type="button"
              class="btn btn-light border-0 rounded-3 d-flex align-items-center justify-content-center shopping-more-btn shadow-sm"
              :disabled="todoListsLoading"
              aria-haspopup="true"
              :aria-expanded="listActionsMenuOpen"
              aria-label="Altre azioni sulla lista"
              @click.stop="toggleListActionsMenu"
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
                  d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"
                />
              </svg>
            </button>
          </div>
          <Teleport to="body">
            <ul
              v-if="listActionsMenuOpen"
              ref="listActionsMenuPanelRef"
              class="dropdown-menu dropdown-menu-end show shadow border-0 py-1 list-actions-menu-floating"
              :style="listActionsMenuStyle"
              role="menu"
            >
              <li role="none">
                <button
                  type="button"
                  class="dropdown-item small d-flex align-items-center gap-2"
                  role="menuitem"
                  :disabled="todoListsLoading"
                  @click="openCreateModal"
                >
                  Nuova lista
                </button>
              </li>
              <li><hr class="dropdown-divider my-1" /></li>
              <li role="none">
                <button
                  type="button"
                  class="dropdown-item small"
                  role="menuitem"
                  :disabled="listToolbarListActionsDisabled"
                  @click="openRenameModal"
                >
                  Rinomina lista
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  class="dropdown-item small text-danger"
                  role="menuitem"
                  :disabled="listToolbarListActionsDisabled"
                  @click="openDeleteListForSelected"
                >
                  Elimina lista
                </button>
              </li>
            </ul>
          </Teleport>
        </div>
      </div>

      <div
        v-if="!todoLists.length && !todoListsLoading"
        class="alert alert-light border mb-3 small py-2"
      >
        Nessuna lista ancora. Apri il menu <strong>⋮</strong> accanto al
        selettore e scegli <strong>Nuova lista</strong>.
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
                  <strong>tutte le attività</strong> collegate a questa lista.
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
          v-if="itemRemoveModalOpen"
          class="modal fade show d-block shopping-remove-modal"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.28)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="todo-remove-item-title"
          @click.self="onItemRemoveBackdrop"
        >
          <div
            class="modal-dialog modal-dialog-centered modal-sm shopping-remove-modal-dialog"
          >
            <div class="modal-content border-0 shadow-sm" @click.stop>
              <div class="modal-header border-0 py-2 px-3 pb-0">
                <h2
                  id="todo-remove-item-title"
                  class="modal-title fs-6 fw-semibold mb-0"
                >
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
                  <template v-else>Questa attività</template>
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

      <form class="shopping-add-form mb-2" @submit.prevent="onSubmit">
        <div
          class="input-group input-group-sm shopping-add-inputgroup shadow-sm rounded-3 overflow-hidden border shopping-add-inputgroup-border"
        >
          <input
            id="todo-input"
            v-model="newItem"
            type="text"
            class="form-control border-0 shopping-add-field"
            placeholder="Aggiungi attività"
            autocomplete="off"
            autocapitalize="sentences"
            enterkeyhint="done"
            maxlength="200"
            :disabled="!selectedTodoListId"
            aria-label="Aggiungi attività"
          />
          <button
            type="submit"
            class="btn btn-primary px-3 touch-manipulation shopping-add-btn"
            :disabled="!newItem.trim() || !selectedTodoListId"
            aria-label="Aggiungi alla lista"
            title="Aggiungi"
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
                d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"
              />
            </svg>
          </button>
        </div>
        <p class="shopping-marker-hint small text-secondary mb-0 mt-1 px-1">
          Il segno colorato è <strong>chi ha aggiunto</strong> l’attività.
        </p>
      </form>

      <div
        v-if="currentTodoList.length"
        class="mb-1 d-flex justify-content-between align-items-center shopping-list-heading px-1 flex-wrap gap-2"
      >
        <span class="small fw-semibold text-secondary">Attività</span>
        <div class="d-flex align-items-center gap-2 ms-auto flex-wrap justify-content-end">
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary touch-manipulation shopping-hide-done-toggle"
            :class="{ active: hideDoneItems }"
            :disabled="!hideDoneItems && !hasDoneItems"
            :aria-pressed="hideDoneItems"
            :aria-label="
              hideDoneItems
                ? 'Mostra attività completate'
                : 'Nascondi attività completate'
            "
            :title="hideDoneItems ? 'Mostra completate' : 'Nascondi completate'"
            @click="hideDoneItems = !hideDoneItems"
          >
            {{ hideDoneItems ? "Mostra completate" : "Nascondi completate" }}
          </button>
          <div
            class="form-check mb-0 shopping-bulk-master d-flex align-items-center gap-2"
          >
            <input
              id="todo-bulk-master"
              ref="bulkMasterCheckboxRef"
              type="checkbox"
              class="form-check-input shopping-check shopping-bulk-master-check flex-shrink-0"
              :checked="isAllItemsDone"
              aria-label="Segna o deseleziona tutte le attività della lista"
              title="Segna tutte / deseleziona tutte"
              @change="onBulkMasterChange"
            />
            <label
              class="form-check-label small text-secondary mb-0 user-select-none"
              for="todo-bulk-master"
            >
              Tutti
            </label>
          </div>
        </div>
      </div>

      <ul
        v-if="visibleTodoList.length"
        class="list-group list-group-flush shopping-items-list rounded-3"
      >
        <li
          v-for="item in visibleTodoList"
          :key="item.id"
          class="list-group-item border-0 border-bottom shopping-list-row touch-manipulation shopping-list-row--compact shopping-swipe-row p-0"
          :class="{
            'shopping-list-row--done': item.done,
            'bg-body-tertiary': item.done,
          }"
        >
          <template v-if="itemEditId === item.id">
            <div
              class="d-flex align-items-center gap-2 w-100 min-w-0 px-2 py-1 shopping-row-inner"
            >
              <input
                :id="`todo-${item.id}`"
                class="form-check-input shopping-check shopping-check-row flex-shrink-0"
                type="checkbox"
                :checked="item.done"
                :aria-label="
                  item.done
                    ? 'Segna come da fare'
                    : 'Segna come completata'
                "
                @change="onTodoDoneChange(item, $event)"
              />
              <div
                class="d-flex align-items-center gap-2 min-w-0 w-100 flex-grow-1"
              >
                <input
                  ref="itemEditInputRef"
                  v-model="itemEditText"
                  type="text"
                  class="form-control form-control-sm shopping-item-edit-input border-0 bg-body rounded-3"
                  placeholder="Testo attività…"
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
                  class="shopping-user-chip shrink-0 d-inline-flex align-items-center rounded-pill"
                  :title="`Aggiunto da ${userLabel(item.addedBy)}`"
                >
                  <span
                    class="shopping-user-chip__dot"
                    :class="textIconClassFor(item.addedBy)"
                    :style="textIconStyleFor(item.addedBy)"
                    aria-hidden="true"
                  />
                  <span class="shopping-user-chip__letter">{{
                    userMarkerLetter(item.addedBy)
                  }}</span>
                </span>
              </div>
            </div>
          </template>
          <div v-else class="shopping-swipe-track">
            <div class="shopping-swipe-actions shopping-swipe-actions--start">
              <button
                type="button"
                class="btn btn-sm shopping-swipe-action shopping-swipe-action--edit d-flex align-items-center justify-content-center rounded-0 border-0 h-100 w-100"
                aria-label="Modifica testo attività"
                title="Modifica"
                @click.stop="onSwipeRevealEdit(item)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.5 14.5 3.5 12.5 1.5 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"
                  />
                </svg>
              </button>
            </div>
            <div class="shopping-swipe-actions shopping-swipe-actions--end">
              <button
                type="button"
                class="btn btn-sm shopping-swipe-action shopping-swipe-action--remove d-flex align-items-center justify-content-center rounded-0 border-0 h-100 w-100"
                aria-label="Rimuovi attività dalla lista"
                title="Elimina"
                @click.stop="onSwipeRevealRemove(item)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
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
            <div
              class="shopping-swipe-front d-flex align-items-center gap-2 w-100 min-w-0 px-2 py-1 shopping-row-inner"
              :class="[
                item.done
                  ? 'shopping-swipe-front--done bg-body-tertiary'
                  : 'bg-body',
                swipeReveal.isDraggingRow(item.id)
                  ? 'shopping-swipe-front--dragging'
                  : '',
                swipeReveal.isRevealed(item.id)
                  ? 'shopping-swipe-front--open'
                  : '',
                swipeReveal.revealSide(item.id) === 'delete'
                  ? 'shopping-swipe-front--peek-delete'
                  : '',
                swipeReveal.revealSide(item.id) === 'edit'
                  ? 'shopping-swipe-front--peek-edit'
                  : '',
              ]"
              :style="{
                transform: `translate3d(${swipeReveal.getTx(item.id)}px,0,0)`,
              }"
              @pointerdown="(e) => swipeReveal.onPointerDown(e, item.id)"
              @pointermove="swipeReveal.onPointerMove"
              @pointerup="swipeReveal.onPointerUp"
              @pointercancel="swipeReveal.onPointerCancel"
            >
              <input
                :id="`todo-${item.id}`"
                class="form-check-input shopping-check shopping-check-row flex-shrink-0"
                type="checkbox"
                :checked="item.done"
                :aria-label="
                  item.done
                    ? 'Segna come da fare'
                    : 'Segna come completata'
                "
                @change="onTodoDoneChange(item, $event)"
              />
              <div
                class="min-w-0 flex-grow-1 d-flex flex-column align-items-stretch"
              >
                <label
                  class="form-check-label user-select-none d-flex align-items-center gap-2 min-w-0 mb-0 w-100 shopping-item-label"
                  :for="`todo-${item.id}`"
                  :aria-label="todoItemLabelAriaLabel(item.text)"
                >
                  <span
                    class="item-text min-w-0 shopping-item-text-line flex-grow-1 text-truncate"
                    :class="{
                      'text-decoration-line-through text-secondary': item.done,
                    }"
                    :title="todoItemTitleIfTruncated(item.text)"
                  >
                    {{ todoItemDisplayText(item.text) }}
                  </span>
                  <span
                    v-if="item.done"
                    class="shopping-done-tick text-success flex-shrink-0"
                    aria-hidden="true"
                    title="Completata"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      fill="currentColor"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"
                      />
                    </svg>
                  </span>
                  <span
                    class="shopping-user-chip shrink-0 d-inline-flex align-items-center rounded-pill"
                    :title="`Aggiunto da ${userLabel(item.addedBy)}`"
                  >
                    <span
                      class="shopping-user-chip__dot"
                      :class="textIconClassFor(item.addedBy)"
                      :style="textIconStyleFor(item.addedBy)"
                      aria-hidden="true"
                    />
                    <span class="shopping-user-chip__letter">{{
                      userMarkerLetter(item.addedBy)
                    }}</span>
                  </span>
                </label>
              </div>
            </div>
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
        v-else-if="hideDoneAllHiddenNote"
        class="text-center text-secondary small py-4 mb-0 px-2"
      >
        Solo attività completate. Usa
        <strong class="text-body">Mostra completate</strong> per vederle di
        nuovo.
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
          class="btn btn-outline-secondary btn-sm touch-manipulation"
          @click="clearDoneTodoItems"
        >
          Rimuovi completate
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

  .shopping-top-strip {
    min-width: 0;
  }

  .shopping-list-picker-wrap {
    flex: 1 1 0%;
    min-width: 0;
  }

  .shopping-list-picker-btn {
    min-height: 2.75rem;
  }

  .shopping-more-btn {
    width: 2.75rem;
    min-width: 2.75rem;
    height: 2.75rem;
    padding: 0;
  }

  .shopping-add-inputgroup-border {
    border-color: var(--bs-border-color-translucent) !important;
  }

  .shopping-add-field {
    min-height: 2.5rem;
    padding-top: 0.45rem;
    padding-bottom: 0.45rem;
  }

  .shopping-add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.5rem;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .shopping-marker-hint {
    line-height: 1.3;
    font-size: 0.7rem;
    opacity: 0.88;
  }

  .shopping-list-heading {
    min-height: 1.75rem;
  }

  .shopping-list-row--compact {
    min-height: 2.35rem;
    overflow: visible;
  }

  .shopping-swipe-row {
    position: relative;
    overflow: visible;
  }

  .shopping-item-text-line {
    line-height: 1.25;
    font-size: 0.98rem;
  }

  .shopping-user-chip {
    gap: 0.2rem;
    padding: 0.08rem 0.35rem 0.08rem 0.28rem;
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1;
    color: var(--bs-secondary-color);
    background: var(--bs-secondary-bg);
    border: 1px solid var(--bs-border-color-translucent);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
  }

  .shopping-user-chip__letter {
    line-height: 1;
    min-width: 0.55rem;
    text-align: center;
  }

  .shopping-done-tick {
    line-height: 0;
    opacity: 0.92;
  }

  .shopping-items-list {
    border: 1px solid var(--bs-border-color-translucent);
    background: var(--bs-body-bg);
    overflow: visible;
  }

  .shopping-items-list > li:first-child {
    border-top-left-radius: var(--bs-border-radius-lg);
    border-top-right-radius: var(--bs-border-radius-lg);
  }

  .shopping-items-list > li:last-child {
    border-bottom-left-radius: var(--bs-border-radius-lg);
    border-bottom-right-radius: var(--bs-border-radius-lg);
  }

  .shopping-list-row--done .item-text {
    opacity: 0.92;
  }

  .shopping-swipe-track {
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(2.75rem, auto);
    align-items: stretch;
    --shopping-reveal-w: 100px;
    min-height: 2.75rem;
    background: var(--bs-secondary-bg);
  }

  .shopping-swipe-track > .shopping-swipe-actions,
  .shopping-swipe-track > .shopping-swipe-front {
    grid-column: 1;
    grid-row: 1;
  }

  .shopping-swipe-actions {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 0;
    display: flex;
    align-items: stretch;
    width: var(--shopping-reveal-w);
    padding: 2px 0;
    box-sizing: border-box;
    pointer-events: none;
  }

  .shopping-swipe-actions--start {
    left: 0;
    padding-left: 2px;
  }

  .shopping-swipe-actions--end {
    right: 0;
    padding-right: 2px;
  }

  .shopping-swipe-action {
    flex: 1 1 auto;
    align-self: stretch;
    min-height: 44px;
    min-width: 100%;
    padding: 0.35rem 0.2rem;
    font-weight: 600;
    border-radius: 0.35rem !important;
    touch-action: manipulation;
    pointer-events: auto;
    transition:
      filter 0.15s ease,
      transform 0.12s ease;
  }

  .shopping-swipe-action:active {
    filter: brightness(0.96);
    transform: scale(0.98);
  }

  .shopping-swipe-action--edit {
    background: var(--bs-primary-bg-subtle) !important;
    color: var(--bs-primary) !important;
  }

  .shopping-swipe-action--remove {
    background: var(--bs-danger-bg-subtle) !important;
    color: var(--bs-danger-text-emphasis, var(--bs-danger)) !important;
  }

  .shopping-swipe-front {
    position: relative;
    z-index: 1;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    touch-action: pan-y;
    transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    border-radius: 0;
  }

  .shopping-swipe-front.bg-body {
    background-color: var(--bs-body-bg) !important;
  }

  .shopping-swipe-front.bg-body-tertiary {
    background-color: var(--bs-tertiary-bg) !important;
  }

  .shopping-swipe-front--dragging {
    transition: none;
  }

  .shopping-swipe-front--open:not(.shopping-swipe-front--dragging) {
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05);
  }

  .shopping-swipe-front--peek-delete:not(.shopping-swipe-front--dragging) {
    box-shadow:
      5px 0 14px -5px rgba(15, 23, 42, 0.12),
      0 0 0 1px rgba(0, 0, 0, 0.05);
  }

  .shopping-swipe-front--peek-edit:not(.shopping-swipe-front--dragging) {
    box-shadow:
      -5px 0 14px -5px rgba(15, 23, 42, 0.12),
      0 0 0 1px rgba(0, 0, 0, 0.05);
  }

  @media (prefers-reduced-motion: reduce) {
    .shopping-swipe-front {
      transition-duration: 0.12s;
    }

    .shopping-swipe-action {
      transition: none;
    }

    .shopping-swipe-action:active {
      transform: none;
    }
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

  .shopping-check-row {
    width: 1.3rem;
    height: 1.3rem;
    margin-top: 0;
    align-self: center;
  }

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

  :global(.list-actions-menu-floating.dropdown-menu) {
    position: fixed !important;
    margin-top: 0 !important;
    transform: none !important;
    max-height: min(70dvh, 22rem);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: calc(0.35rem + env(safe-area-inset-bottom, 0px));
  }

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
