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
  import { useAppStorage } from "@/composables/useAppStorage";
  import {
    ensureWishRealtimeConnected,
    refreshWishData,
    useWishlist,
  } from "@/composables/useWishlist";
  import type {
    LinkPreviewPayload,
    WishlistItem,
    WishlistItemStatus,
  } from "@/types/wishlist";
  import {
    cleanProductTitle,
    domainLabel,
    hasDisplayablePrice,
    isLikelyUnavailable,
    priceBadgeKind,
  } from "@/lib/wishlistNormalize";
  import { friendlyErrorMessage, notesPreview } from "@/lib/wishlistUi";
  import { useShoppingSwipeReveal } from "@/composables/useShoppingSwipeReveal";

  const {
    wishLists,
    wishListsLoading,
    selectedWishListId,
    currentWishListMeta,
    items,
    loading,
    error,
    isWishCloud,
    wishListDisplayName,
    selectWishList,
    createWishList,
    renameWishList,
    deleteWishList,
    fetchPreview,
    saveItemFromPreview,
    removeItem,
    updateItemNotes,
    updateItemTitle,
    setItemStatus,
    startWishSync,
  } = useWishlist();

  const {
    textIconClassFor,
    textIconStyleFor,
    profileFor,
    activeUser,
    appUserSessionValid,
  } = useAppStorage();

  const urlInput = ref("");
  const previewLoading = ref(false);
  const previewError = ref<string | null>(null);
  const draftPreview = ref<LinkPreviewPayload | null>(null);
  const pendingHref = ref<string | null>(null);
  const savingDraft = ref(false);
  const saveFlash = ref(false);
  const addMessage = ref<string | null>(null);

  let previewDebounce: ReturnType<typeof setTimeout> | null = null;

  const editingTitleId = ref<string | null>(null);
  const titleDraft = ref("");
  const notesDraft = ref<Record<string, string>>({});
  const savingNotesId = ref<string | null>(null);

  const swipeReveal = useShoppingSwipeReveal({ revealPx: 64 });

  function hasOpenSwipeReveal(): boolean {
    return Object.values(swipeReveal.tx).some((v) => v !== 0);
  }

  function onSwipeRevealEdit(it: WishlistItem) {
    swipeReveal.snapClosed(it.id);
    startEditTitle(it);
  }

  function onSwipeRevealRemove(it: WishlistItem) {
    swipeReveal.snapClosed(it.id);
    removeItemTarget.value = it;
    removeItemModalOpen.value = true;
  }

  const listMenuOpen = ref(false);
  const listMenuRoot = ref<HTMLElement | null>(null);

  const createModalOpen = ref(false);
  const newListName = ref("");
  const renameModalOpen = ref(false);
  const renameListName = ref("");
  const deleteModalOpen = ref(false);
  const deleteTargetId = ref<string | null>(null);
  const deleteListSubmitting = ref(false);

  const removeItemModalOpen = ref(false);
  const removeItemTarget = ref<WishlistItem | null>(null);
  const removeItemSubmitting = ref(false);

  /** Dettagli espansi (note, meta) per card */
  const detailExpanded = ref<Record<string, boolean>>({});
  /** Menu ⋮ su card */
  const openCardMenuId = ref<string | null>(null);
  /** Bottom sheet “Aggiungi da link” */
  const addSheetOpen = ref(false);

  type WishFilter = "all" | "active" | "purchased" | "dismissed";
  const filterMode = ref<WishFilter>("active");

  const displayError = computed(() => friendlyErrorMessage(error.value));
  const displayPreviewError = computed(() =>
    friendlyErrorMessage(previewError.value),
  );

  const copyFlash = ref(false);

  const removeItemDisplayLabel = computed(() => {
    const it = removeItemTarget.value;
    if (!it) return "";
    return displayTitle(it).slice(0, 80);
  });

  watch(
    items,
    (list) => {
      const d = { ...notesDraft.value };
      for (const it of list) {
        if (d[it.id] === undefined) d[it.id] = it.notes ?? "";
      }
      notesDraft.value = d;
    },
    { immediate: true, deep: true },
  );

  watch(urlInput, () => {
    if (previewDebounce) clearTimeout(previewDebounce);
    previewDebounce = setTimeout(() => {
      previewDebounce = null;
      void tryAutoPreview();
    }, 450);
  });

  watch(editingTitleId, async (id) => {
    if (id) swipeReveal.closeAll();
    if (!id) return;
    await nextTick();
    const el = document.getElementById(`wish-edit-${id}`);
    if (!(el instanceof HTMLInputElement)) return;
    el.focus();
    el.select();
  });

  const displayedItems = computed(() => {
    const list = items.value;
    switch (filterMode.value) {
      case "active":
        return list.filter((i) => i.status === "active");
      case "purchased":
        return list.filter((i) => i.status === "purchased");
      case "dismissed":
        return list.filter((i) => i.status === "dismissed");
      default:
        return list;
    }
  });

  const listToolbarListActionsDisabled = computed(
    () =>
      !selectedWishListId.value ||
      wishListsLoading.value ||
      !wishLists.value.length,
  );

  const deleteTargetLabel = computed(() => {
    const id = deleteTargetId.value;
    if (!id) return "";
    const list = wishLists.value.find((l) => l.id === id);
    return list ? wishListDisplayName(list) : "";
  });

  function userLabel(id: string) {
    return id === "daniele" ? "Daniele" : "Letizia";
  }

  function parseHref(raw: string): string | null {
    const t = raw.trim();
    if (!t) return null;
    try {
      return new URL(t.startsWith("http") ? t : `https://${t}`).href;
    } catch {
      return null;
    }
  }

  function clearPreviewDraft() {
    draftPreview.value = null;
    pendingHref.value = null;
    previewError.value = null;
  }

  async function tryAutoPreview() {
    if (!selectedWishListId.value) return;
    const href = parseHref(urlInput.value);
    if (!href) {
      clearPreviewDraft();
      return;
    }
    if (pendingHref.value === href && draftPreview.value) return;
    await runPreview(href);
  }

  async function runPreview(href?: string) {
    const h = href ?? parseHref(urlInput.value);
    if (!h || !selectedWishListId.value) {
      addMessage.value = !selectedWishListId.value
        ? "Seleziona una lista."
        : "URL non valido.";
      return;
    }
    previewLoading.value = true;
    previewError.value = null;
    addMessage.value = null;
    try {
      const p = await fetchPreview(h);
      draftPreview.value = p;
      pendingHref.value = h;
    } catch (e) {
      clearPreviewDraft();
      previewError.value =
        e instanceof Error ? e.message : "Anteprima non disponibile";
    } finally {
      previewLoading.value = false;
    }
  }

  async function onPasteUrl() {
    await nextTick();
    void tryAutoPreview();
  }

  async function saveFromPreview() {
    const href = pendingHref.value;
    const p = draftPreview.value;
    if (!href || !p || !selectedWishListId.value) return;
    savingDraft.value = true;
    addMessage.value = null;
    try {
      const r = await saveItemFromPreview(href, p, activeUser.value);
      if (r.ok) {
        urlInput.value = "";
        clearPreviewDraft();
        saveFlash.value = true;
        window.setTimeout(() => {
          saveFlash.value = false;
        }, 2600);
      } else {
        addMessage.value = r.message ?? "Non salvato.";
      }
    } finally {
      savingDraft.value = false;
    }
  }

  function displayTitle(it: WishlistItem): string {
    return cleanProductTitle(it.title);
  }

  function priceLabel(it: WishlistItem): string | null {
    if (it.priceText?.trim()) return it.priceText.trim();
    if (it.priceAmount != null && Number.isFinite(it.priceAmount)) {
      const cur =
        it.currency === "USD" ? "$" : it.currency === "GBP" ? "£" : "€";
      return `${it.priceAmount.toFixed(2).replace(".", ",")} ${cur}`;
    }
    return null;
  }

  function badgeText(kind: ReturnType<typeof priceBadgeKind>): string {
    if (kind === "updated") return "Prezzo aggiornato";
    if (kind === "unverified") return "Prezzo non verificato";
    return "Prezzo non disponibile";
  }

  /** Badge breve sulla card (meno rumore visivo) */
  function badgeTextShort(kind: ReturnType<typeof priceBadgeKind>): string {
    if (kind === "updated") return "Prezzo recente";
    if (kind === "unverified") return "Da verificare";
    return "Senza prezzo";
  }

  function draftBadgeText(p: LinkPreviewPayload): string {
    const has = !!(
      p.priceText?.trim() ||
      (p.priceAmount != null && Number.isFinite(p.priceAmount))
    );
    return has ? "Prezzo aggiornato" : "Prezzo non disponibile";
  }

  function draftTitle(p: LinkPreviewPayload): string {
    return cleanProductTitle(p.title ?? "Anteprima");
  }

  async function markStatus(it: WishlistItem, status: WishlistItemStatus) {
    await setItemStatus(it.id, status);
  }

  function toggleDetail(id: string) {
    detailExpanded.value = {
      ...detailExpanded.value,
      [id]: !detailExpanded.value[id],
    };
  }

  function isDetailOpen(id: string) {
    return Boolean(detailExpanded.value[id]);
  }

  function openAddSheet() {
    if (!selectedWishListId.value) return;
    addSheetOpen.value = true;
    addMessage.value = null;
  }

  function closeAddSheet() {
    addSheetOpen.value = false;
  }

  function toggleCardMenu(id: string) {
    if (openCardMenuId.value !== id) swipeReveal.closeAll();
    openCardMenuId.value = openCardMenuId.value === id ? null : id;
  }

  function closeCardMenu() {
    openCardMenuId.value = null;
  }

  function onCardMenuEdit(it: WishlistItem) {
    closeCardMenu();
    startEditTitle(it);
  }

  function onCardMenuRemove(it: WishlistItem) {
    closeCardMenu();
    removeItemTarget.value = it;
    removeItemModalOpen.value = true;
  }

  function onCardMenuMarkPurchased(it: WishlistItem) {
    closeCardMenu();
    void markStatus(it, "purchased");
  }

  function onCardMenuDismiss(it: WishlistItem) {
    closeCardMenu();
    void markStatus(it, "dismissed");
  }

  function onCardMenuRestore(it: WishlistItem) {
    closeCardMenu();
    void markStatus(it, "active");
  }

  function closeRemoveItemModal() {
    if (removeItemSubmitting.value) return;
    removeItemModalOpen.value = false;
    removeItemTarget.value = null;
  }

  function onRemoveItemModalBackdrop() {
    closeRemoveItemModal();
  }

  async function confirmRemoveItem() {
    const it = removeItemTarget.value;
    if (!it) return;
    removeItemSubmitting.value = true;
    try {
      const ok = await removeItem(it.id);
      if (ok) {
        removeItemModalOpen.value = false;
        removeItemTarget.value = null;
      }
    } finally {
      removeItemSubmitting.value = false;
    }
  }

  async function copyProductLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      copyFlash.value = true;
      window.setTimeout(() => {
        copyFlash.value = false;
      }, 2000);
    } catch {
      /* ignore */
    }
  }

  function onCardMenuCopy(it: WishlistItem) {
    closeCardMenu();
    void copyProductLink(it.url);
  }

  function notePreviewFor(it: WishlistItem): string {
    const raw = notesDraft.value[it.id] ?? it.notes ?? "";
    return notesPreview(raw, 52);
  }

  function toggleListMenu() {
    listMenuOpen.value = !listMenuOpen.value;
  }

  function closeListMenu() {
    listMenuOpen.value = false;
  }

  function pickList(id: string) {
    void selectWishList(id);
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

  async function confirmCreateList() {
    const ok = await createWishList(newListName.value);
    if (ok) closeCreateModal();
  }

  function openRenameModal() {
    renameListName.value = currentWishListMeta.value?.title ?? "";
    renameModalOpen.value = true;
    closeListMenu();
  }

  function closeRenameModal() {
    renameModalOpen.value = false;
  }

  async function confirmRenameList() {
    const id = selectedWishListId.value;
    if (!id) return;
    const ok = await renameWishList(id, renameListName.value);
    if (ok) closeRenameModal();
  }

  function openDeleteListForSelected() {
    const id = selectedWishListId.value;
    if (!id) return;
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

  async function confirmDeleteList() {
    const id = deleteTargetId.value;
    if (!id) return;
    deleteListSubmitting.value = true;
    try {
      await deleteWishList(id);
      await nextTick();
      if (!error.value) closeDeleteModal();
    } finally {
      deleteListSubmitting.value = false;
    }
  }

  async function refreshWishPageData() {
    if (!isWishCloud.value || !appUserSessionValid.value) return;
    await refreshWishData({ silent: true });
    ensureWishRealtimeConnected();
  }

  onMounted(() => {
    if (appUserSessionValid.value) void startWishSync();
    ensureWishRealtimeConnected();
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeydown, true);
  });

  onActivated(() => {
    void refreshWishPageData();
  });

  onUnmounted(() => {
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onDocumentKeydown, true);
    if (previewDebounce) clearTimeout(previewDebounce);
  });

  function onDocumentPointerDown(ev: PointerEvent) {
    const t = ev.target;
    if (listMenuOpen.value) {
      const root = listMenuRoot.value;
      if (root && t instanceof Node && !root.contains(t)) closeListMenu();
    }
    if (openCardMenuId.value && t instanceof Element) {
      if (!t.closest(".wish-item-menu")) closeCardMenu();
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
    if (removeItemModalOpen.value) {
      if (!removeItemSubmitting.value) closeRemoveItemModal();
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
    if (addSheetOpen.value) {
      closeAddSheet();
      return;
    }
    closeListMenu();
  }

  function startEditTitle(it: WishlistItem) {
    editingTitleId.value = it.id;
    titleDraft.value = it.title ?? "";
  }

  async function commitTitle(id: string) {
    editingTitleId.value = null;
    const t = titleDraft.value.trim();
    if (!t) return;
    await updateItemTitle(id, cleanProductTitle(t));
  }

  function cancelEditTitle() {
    editingTitleId.value = null;
  }

  async function saveNotes(id: string) {
    savingNotesId.value = id;
    try {
      const it = items.value.find((x) => x.id === id);
      await updateItemNotes(id, notesDraft.value[id] ?? it?.notes ?? "");
    } finally {
      savingNotesId.value = null;
    }
  }

</script>

<template>
  <main class="shopping-main shopping-page wish-page">
    <div
      class="container-fluid px-3 px-sm-4 wish-inner wish-scroll-pad"
      style="max-width: 32rem"
    >
      <header class="wish-screen-head mb-2">
        <h1 class="wish-page-title text-body mb-0">Desideri</h1>
        <p class="small text-secondary mt-1 mb-0 wish-screen-sub">
          Link da più siti, un solo posto. Lista condivisa.
        </p>
      </header>

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
              id="wish-list-picker-btn"
              type="button"
              class="btn btn-sm btn-light border text-start w-100 d-flex align-items-center justify-content-between gap-2 py-2 shopping-list-picker-btn"
              :disabled="!wishLists.length || wishListsLoading"
              aria-haspopup="true"
              :aria-expanded="listMenuOpen"
              @click.stop="toggleListMenu"
            >
              <span
                v-if="currentWishListMeta"
                class="d-flex align-items-center gap-2 min-w-0"
              >
                <span
                  class="shrink-0"
                  :class="textIconClassFor(currentWishListMeta.createdBy)"
                  :style="textIconStyleFor(currentWishListMeta.createdBy)"
                  :title="`Creata da ${userLabel(currentWishListMeta.createdBy)}`"
                  aria-hidden="true"
                />
                <span class="text-truncate">{{
                  wishListDisplayName(currentWishListMeta)
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
              aria-labelledby="wish-list-picker-btn"
            >
              <li v-for="list in wishLists" :key="list.id" class="px-1">
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
                    wishListDisplayName(list)
                  }}</span>
                </button>
              </li>
            </ul>
          </div>
          <div class="d-flex gap-1 align-items-stretch shopping-list-toolbar">
            <button
              type="button"
              class="btn btn-sm btn-outline-primary d-inline-flex align-items-center justify-content-center shopping-toolbar-btn shopping-toolbar-icon-btn"
              :disabled="wishListsLoading"
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
      </div>

      <div
        v-if="!wishLists.length && !wishListsLoading"
        class="alert alert-light border mb-3 small py-2"
      >
        Nessuna lista ancora. Tocca <strong>+</strong> per iniziare.
      </div>

      <div
        v-if="items.length"
        class="wish-filter-pills-wrap mb-3"
        role="tablist"
        aria-label="Filtra articoli"
      >
        <div class="wish-filter-pills">
          <button
            type="button"
            class="wish-filter-pills__btn touch-manipulation text-truncate"
            role="tab"
            :aria-selected="filterMode === 'active'"
            :class="{ 'is-active': filterMode === 'active' }"
            @click="filterMode = 'active'"
          >
            In lista
          </button>
          <button
            type="button"
            class="wish-filter-pills__btn touch-manipulation text-truncate"
            role="tab"
            :aria-selected="filterMode === 'purchased'"
            :class="{ 'is-active': filterMode === 'purchased' }"
            @click="filterMode = 'purchased'"
          >
            Comprati
          </button>
          <button
            type="button"
            class="wish-filter-pills__btn touch-manipulation text-truncate"
            role="tab"
            :aria-selected="filterMode === 'dismissed'"
            :class="{ 'is-active': filterMode === 'dismissed' }"
            @click="filterMode = 'dismissed'"
          >
            Archivio
          </button>
          <button
            type="button"
            class="wish-filter-pills__btn touch-manipulation text-truncate"
            role="tab"
            :aria-selected="filterMode === 'all'"
            :class="{ 'is-active': filterMode === 'all' }"
            @click="filterMode = 'all'"
          >
            Tutti
          </button>
        </div>
      </div>

      <div
        v-if="saveFlash"
        class="alert alert-success small py-2 px-3 mb-3 wish-toast"
        role="status"
      >
        Salvato nella lista.
      </div>

      <div
        v-if="copyFlash"
        class="alert alert-secondary border-0 small py-2 px-3 mb-3 wish-toast"
        role="status"
      >
        Link copiato.
      </div>

      <div
        v-if="displayError"
        class="alert wish-alert-err small py-2 px-3 mb-3"
        role="alert"
      >
        {{ displayError }}
      </div>

      <div v-if="loading && !items.length" class="text-secondary small py-3">
        Caricamento…
      </div>

      <ul v-else class="list-unstyled mb-0 wish-card-list">
        <li
          v-for="it in displayedItems"
          :key="it.id"
          class="shopping-swipe-row wish-swipe-row list-group-item border-0 p-0 mb-2 touch-manipulation"
          :class="{
            'wish-item--purchased': it.status === 'purchased',
            'wish-item--dismissed': it.status === 'dismissed',
          }"
        >
          <div
            v-if="editingTitleId === it.id"
            class="wish-title-edit-shell rounded-3 border bg-body shadow-sm p-2"
          >
            <input
              :id="'wish-edit-' + it.id"
              v-model="titleDraft"
              type="text"
              class="form-control form-control-sm"
              maxlength="500"
              aria-label="Nome prodotto"
              @blur="commitTitle(it.id)"
              @keydown.enter.prevent="commitTitle(it.id)"
              @keydown.escape.prevent="cancelEditTitle"
            />
          </div>
          <div
            v-else
            class="shopping-swipe-track rounded-3 overflow-hidden wish-swipe-track"
          >
            <div class="shopping-swipe-actions shopping-swipe-actions--start">
              <button
                type="button"
                class="btn btn-sm shopping-swipe-action shopping-swipe-action--edit wish-swipe-action wish-swipe-action--edit d-flex align-items-center justify-content-center border-0 h-100 w-100"
                aria-label="Modifica nome prodotto"
                title="Modifica"
                @click.stop="onSwipeRevealEdit(it)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
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
                class="btn btn-sm shopping-swipe-action shopping-swipe-action--remove wish-swipe-action wish-swipe-action--remove d-flex align-items-center justify-content-center border-0 h-100 w-100"
                aria-label="Rimuovi dalla lista"
                title="Elimina"
                @click.stop="onSwipeRevealRemove(it)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
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
              class="shopping-swipe-front wish-swipe-card-front d-flex flex-column w-100 min-w-0 touch-manipulation"
              :class="[
                it.status === 'purchased' || it.status === 'dismissed'
                  ? 'shopping-swipe-front--done bg-body-tertiary'
                  : 'bg-body',
                swipeReveal.isDraggingRow(it.id)
                  ? 'shopping-swipe-front--dragging'
                  : '',
                swipeReveal.isRevealed(it.id)
                  ? 'shopping-swipe-front--open'
                  : '',
                swipeReveal.revealSide(it.id) === 'delete'
                  ? 'shopping-swipe-front--peek-delete'
                  : '',
                swipeReveal.revealSide(it.id) === 'edit'
                  ? 'shopping-swipe-front--peek-edit'
                  : '',
              ]"
              :style="{
                transform: `translate3d(${swipeReveal.getTx(it.id)}px,0,0)`,
              }"
              @pointerdown="(e) => swipeReveal.onPointerDown(e, it.id)"
              @pointermove="swipeReveal.onPointerMove"
              @pointerup="swipeReveal.onPointerUp"
              @pointercancel="swipeReveal.onPointerCancel"
            >
          <div
            class="wish-item__head d-flex align-items-center gap-2 px-2 pt-2 pb-0 min-w-0"
          >
            <a
              :href="it.url"
              target="_blank"
              rel="noopener noreferrer"
              class="wish-item__domain d-flex align-items-center gap-1 min-w-0 flex-grow-1 small fw-semibold text-primary text-decoration-none"
              :title="domainLabel(it.url, it.siteName)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                fill="currentColor"
                class="wish-item__domain-icon flex-shrink-0 opacity-80"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 1 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"
                />
                <path
                  fill-rule="evenodd"
                  d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"
                />
              </svg>
              <span class="wish-item__domain-text text-truncate">{{
                domainLabel(it.url, it.siteName)
              }}</span>
            </a>
            <div
              class="wish-item-menu flex-shrink-0 position-relative align-self-start"
            >
              <button
                type="button"
                class="btn btn-light border-0 rounded-circle wish-item__more d-inline-flex align-items-center justify-content-center"
                aria-haspopup="true"
                :aria-expanded="openCardMenuId === it.id"
                aria-label="Altre azioni"
                @click.stop="toggleCardMenu(it.id)"
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
              <ul
                v-show="openCardMenuId === it.id"
                class="dropdown-menu dropdown-menu-end show shadow border-0 py-1 wish-item__dropdown"
                role="menu"
              >
                <li>
                  <button
                    type="button"
                    class="dropdown-item small"
                    role="menuitem"
                    @click="onCardMenuCopy(it)"
                  >
                    Copia link
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    class="dropdown-item small"
                    role="menuitem"
                    @click="onCardMenuEdit(it)"
                  >
                    Modifica nome
                  </button>
                </li>
                <li v-if="it.status === 'active'">
                  <button
                    type="button"
                    class="dropdown-item small"
                    role="menuitem"
                    @click="onCardMenuMarkPurchased(it)"
                  >
                    Segna come comprato
                  </button>
                </li>
                <li v-if="it.status === 'active'">
                  <button
                    type="button"
                    class="dropdown-item small"
                    role="menuitem"
                    @click="onCardMenuDismiss(it)"
                  >
                    Archivia
                  </button>
                </li>
                <li v-if="it.status !== 'active'">
                  <button
                    type="button"
                    class="dropdown-item small"
                    role="menuitem"
                    @click="onCardMenuRestore(it)"
                  >
                    Rimetti in lista
                  </button>
                </li>
                <li><hr class="dropdown-divider my-1" /></li>
                <li>
                  <button
                    type="button"
                    class="dropdown-item small text-danger"
                    role="menuitem"
                    @click="onCardMenuRemove(it)"
                  >
                    Rimuovi dalla lista
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div
            class="wish-item__body d-flex gap-2 align-items-start px-2 pt-1 pb-2"
          >
            <div
              class="wish-item__media wish-item__media--card flex-shrink-0 rounded-3 overflow-hidden position-relative"
            >
              <div class="ratio ratio-1x1 wish-item__thumb">
                <img
                  v-if="it.imageUrl"
                  :src="it.imageUrl"
                  :alt="displayTitle(it)"
                  class="object-fit-cover"
                  loading="lazy"
                  decoding="async"
                  fetchpriority="low"
                />
                <div
                  v-else
                  class="wish-item__placeholder"
                  role="img"
                  aria-label="Nessuna immagine disponibile"
                >
                  <svg
                    class="wish-item__placeholder-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.25"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle
                      cx="8.5"
                      cy="11"
                      r="1.25"
                      fill="currentColor"
                      stroke="none"
                    />
                    <path d="M21 15l-4.5-4.5-3 3L8 10l-5 5" />
                  </svg>
                  <span class="wish-item__placeholder-label"
                    >Nessuna immagine</span
                  >
                </div>
              </div>
              <span
                v-if="it.status === 'purchased'"
                class="badge bg-success position-absolute bottom-0 start-0 m-1 wish-badge-tiny"
                >Comprato</span
              >
              <span
                v-else-if="it.status === 'dismissed'"
                class="badge bg-secondary position-absolute bottom-0 start-0 m-1 wish-badge-tiny"
                >Archiviato</span
              >
            </div>

            <div class="wish-item__main flex-grow-1 min-w-0 d-flex flex-column">
              <div
                v-if="isLikelyUnavailable(it)"
                class="alert alert-warning py-1 px-2 small mb-2"
                role="status"
              >
                Link potrebbe non essere aggiornato.
              </div>

              <h3 class="wish-item__title fw-semibold text-body mb-2">
                {{ displayTitle(it) }}
              </h3>

              <div class="wish-price-block mb-2 min-w-0">
                <p
                  v-if="priceLabel(it)"
                  class="wish-item__price text-body mb-0 lh-sm"
                >
                  {{ priceLabel(it) }}
                </p>
                <div
                  class="wish-price-chip wish-price-chip--integrated d-inline-flex align-items-center gap-1 mt-1"
                  :class="{
                    'wish-price-chip--ok': priceBadgeKind(it) === 'updated',
                    'wish-price-chip--warn': priceBadgeKind(it) === 'unverified',
                    'wish-price-chip--muted':
                      priceBadgeKind(it) === 'unavailable',
                  }"
                >
                  <span class="wish-price-chip__icon" aria-hidden="true">
                    <svg
                      v-if="priceBadgeKind(it) === 'updated'"
                      xmlns="http://www.w3.org/2000/svg"
                      width="11"
                      height="11"
                      fill="currentColor"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"
                      />
                    </svg>
                    <svg
                      v-else-if="priceBadgeKind(it) === 'unverified'"
                      xmlns="http://www.w3.org/2000/svg"
                      width="11"
                      height="11"
                      fill="currentColor"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"
                      />
                      <path
                        d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"
                      />
                    </svg>
                    <svg
                      v-else
                      xmlns="http://www.w3.org/2000/svg"
                      width="11"
                      height="11"
                      fill="currentColor"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"
                      />
                      <path
                        d="M4.285 12.433a.5.5 0 0 0 .683-.183l3.5-3.5a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.707.707L7.293 8 4.285 11.126a.5.5 0 0 0 .183.683z"
                      />
                    </svg>
                  </span>
                  <span class="wish-price-chip__text wish-price-chip__text--compact">{{
                    badgeTextShort(priceBadgeKind(it))
                  }}</span>
                </div>
              </div>
              <p
                v-if="!priceLabel(it) && it.previewNote && !hasDisplayablePrice(it)"
                class="small text-secondary mb-2"
              >
                {{ friendlyErrorMessage(it.previewNote) }}
              </p>

              <a
                :href="it.url"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-primary btn-sm w-100 rounded-3 py-2 fw-semibold d-inline-flex align-items-center justify-content-center gap-2 wish-cta-primary touch-manipulation"
              >
                Apri sul sito
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 1 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"
                  />
                  <path
                    fill-rule="evenodd"
                    d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"
                  />
                </svg>
              </a>

              <button
                type="button"
                class="wish-note-toggle btn border-0 w-100 rounded-3 py-2 px-2 mt-1 d-flex align-items-center gap-2 text-start touch-manipulation"
                :class="{ 'wish-note-toggle--open': isDetailOpen(it.id) }"
                :aria-expanded="isDetailOpen(it.id)"
                @click="toggleDetail(it.id)"
              >
                <span class="wish-note-label flex-shrink-0">Note</span>
                <span
                  v-if="notePreviewFor(it) && !isDetailOpen(it.id)"
                  class="wish-note-preview small text-body text-truncate min-w-0"
                  >{{ notePreviewFor(it) }}</span
                >
                <span
                  v-else-if="!notePreviewFor(it) && !isDetailOpen(it.id)"
                  class="wish-note-empty small text-truncate min-w-0"
                  >Aggiungi una nota…</span
                >
                <span class="wish-note-chev flex-shrink-0 ms-auto" aria-hidden="true">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                    class="wish-note-chev__svg"
                    :class="{ 'wish-note-chev__svg--open': isDetailOpen(it.id) }"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"
                    />
                  </svg>
                </span>
              </button>

              <div
                v-show="isDetailOpen(it.id)"
                class="wish-notes-panel px-2 pb-2 pt-1 mt-1 border-top border-light-subtle"
              >
                <textarea
                  :id="'notes-' + it.id"
                  v-model="notesDraft[it.id]"
                  class="form-control form-control-sm rounded-2 mb-1"
                  rows="2"
                  placeholder="Promemoria…"
                  aria-label="Note prodotto"
                />
                <div
                  class="d-flex justify-content-between align-items-center gap-2 flex-wrap"
                >
                  <button
                    type="button"
                    class="btn btn-sm btn-primary rounded-3 px-3 touch-manipulation"
                    :disabled="savingNotesId === it.id"
                    @click="saveNotes(it.id)"
                  >
                    <span
                      v-if="savingNotesId === it.id"
                      class="spinner-border spinner-border-sm me-1"
                      aria-hidden="true"
                    />
                    Salva
                  </button>
                  <span
                    class="small text-secondary d-inline-flex align-items-center gap-1"
                    :title="`Aggiunto da ${profileFor(it.createdBy).displayName}`"
                  >
                    <span
                      class="shrink-0"
                      :class="textIconClassFor(it.createdBy)"
                      :style="textIconStyleFor(it.createdBy)"
                      aria-hidden="true"
                    />
                    {{ new Date(it.createdAt).toLocaleDateString("it-IT") }}
                  </span>
                </div>
              </div>
            </div>
          </div>
            </div>
          </div>
        </li>
      </ul>

      <div
        v-if="
          !loading &&
          !displayedItems.length &&
          !displayError &&
          selectedWishListId &&
          items.length
        "
        class="alert alert-light border small py-3 mb-0"
      >
        Nessun elemento in questa categoria. Cambia filtro sopra.
      </div>

      <div
        v-if="!loading && !items.length && !displayError && selectedWishListId"
        class="wish-empty card border-0 shadow-sm mb-3"
      >
        <div class="card-body text-center py-4 px-3">
          <p class="fw-semibold mb-2">Incolla un link da qualsiasi sito</p>
          <p class="small text-secondary mb-0">
            Esempi: Amazon, Zalando, IKEA, e-commerce di marca. Vedrai subito
            un’anteprima prima di salvare.
          </p>
        </div>
      </div>

      <Teleport to="body">
        <div
          v-if="createModalOpen"
          class="modal fade show d-block shopping-modal"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wish-new-list-title"
          @click.self="closeCreateModal"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="wish-new-list-title" class="modal-title h5">
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
                <label for="wish-new-list-name" class="form-label"
                  >Nome lista</label
                >
                <input
                  id="wish-new-list-name"
                  v-model="newListName"
                  type="text"
                  class="form-control"
                  placeholder="Es. Compleanno, Casa…"
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
          aria-labelledby="wish-rename-list-title"
          @click.self="closeRenameModal"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2 id="wish-rename-list-title" class="modal-title h5">
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
                <label for="wish-rename-list-name" class="form-label"
                  >Nome lista</label
                >
                <input
                  id="wish-rename-list-name"
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
          aria-labelledby="wish-delete-list-title"
          @click.self="onDeleteModalBackdrop"
        >
          <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
            <div class="modal-content" @click.stop>
              <div class="modal-header">
                <h2
                  id="wish-delete-list-title"
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
                  ? Tutti i desideri in questa lista saranno rimossi.
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
                  Elimina
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="removeItemModalOpen"
          class="modal fade show d-block shopping-modal shopping-modal--compact"
          tabindex="-1"
          style="background-color: rgba(0, 0, 0, 0.4)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wish-remove-item-title"
          @click.self="onRemoveItemModalBackdrop"
        >
          <div
            class="modal-dialog modal-sm modal-dialog-centered shopping-modal-dialog px-2"
          >
            <div class="modal-content shadow-sm" @click.stop>
              <div class="modal-header py-2">
                <h2
                  id="wish-remove-item-title"
                  class="modal-title fs-6 fw-semibold text-danger mb-0"
                >
                  Rimuovi dalla lista
                </h2>
                <button
                  type="button"
                  class="btn-close"
                  aria-label="Chiudi"
                  :disabled="removeItemSubmitting"
                  @click="closeRemoveItemModal"
                />
              </div>
              <div class="modal-body py-2 pt-0">
                <p class="mb-0 small text-secondary">
                  Rimuovere questo articolo dalla lista?
                </p>
                <p
                  v-if="removeItemDisplayLabel"
                  class="mb-0 mt-2 fw-semibold text-break text-body small"
                >
                  «{{ removeItemDisplayLabel }}»
                </p>
              </div>
              <div class="modal-footer py-2 border-top-0 pt-0">
                <button
                  type="button"
                  class="btn btn-sm btn-secondary"
                  :disabled="removeItemSubmitting"
                  @click="closeRemoveItemModal"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-danger"
                  :disabled="removeItemSubmitting"
                  @click="confirmRemoveItem"
                >
                  <span
                    v-if="removeItemSubmitting"
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

      <button
        v-if="selectedWishListId"
        type="button"
        class="btn btn-primary rounded-circle wish-fab touch-manipulation"
        aria-label="Aggiungi articolo da link"
        @click="openAddSheet"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="currentColor"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"
          />
        </svg>
      </button>

      <Teleport to="body">
        <div
          v-if="addSheetOpen"
          class="wish-sheet-backdrop"
          @click.self="closeAddSheet"
        >
          <div
            class="wish-sheet bg-body rounded-top-4 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wish-sheet-title"
            @click.stop
          >
            <div class="wish-sheet__handle-wrap pt-2 pb-1" aria-hidden="true">
              <div class="wish-sheet__handle mx-auto" />
            </div>
            <div class="wish-sheet__body px-3 pb-3 pb-safe">
              <h2 id="wish-sheet-title" class="wish-sheet__title mb-1">
                Aggiungi da link
              </h2>
              <p class="wish-sheet__lead small text-secondary mb-3">
                Incolla il link, controlla l’anteprima e salva.
              </p>

              <div
                v-if="draftPreview && pendingHref"
                class="wish-sheet-preview card border border-light-subtle bg-body-tertiary bg-opacity-25 rounded-3 mb-3 overflow-hidden"
              >
                <div class="d-flex gap-3 p-3 align-items-start">
                  <div
                    class="wish-item__media wish-item__media--sheet flex-shrink-0 rounded-3 overflow-hidden bg-body-tertiary position-relative"
                  >
                    <div class="ratio ratio-1x1 wish-item__thumb">
                      <img
                        v-if="draftPreview.imageUrl"
                        :src="draftPreview.imageUrl"
                        alt=""
                        class="object-fit-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <div
                        v-else
                        class="wish-item__placeholder wish-item__placeholder--compact"
                        role="img"
                        aria-label="Nessuna immagine"
                      >
                        <svg
                          class="wish-item__placeholder-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.25"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <circle
                            cx="8.5"
                            cy="11"
                            r="1.25"
                            fill="currentColor"
                            stroke="none"
                          />
                          <path d="M21 15l-4.5-4.5-3 3L8 10l-5 5" />
                        </svg>
                        <span class="wish-item__placeholder-label"
                          >Nessuna immagine</span
                        >
                      </div>
                    </div>
                  </div>
                  <div class="min-w-0 flex-grow-1 small">
                    <p class="text-primary fw-semibold mb-0 text-truncate">
                      {{ domainLabel(pendingHref, draftPreview.siteName) }}
                    </p>
                    <p class="fw-semibold mb-1 wish-title-line">
                      {{ draftTitle(draftPreview) }}
                    </p>
                    <span
                      class="badge rounded-pill bg-success-subtle text-success"
                      >{{ draftBadgeText(draftPreview) }}</span
                    >
                    <p
                      v-if="draftPreview.priceText"
                      class="mb-0 fw-semibold mt-1"
                    >
                      {{ draftPreview.priceText }}
                    </p>
                  </div>
                </div>
              </div>

              <label
                class="wish-sheet__field-label form-label mb-1"
                for="wish-url-sheet"
                >Link</label
              >
              <div
                class="input-group input-group-lg wish-sheet-url-row mb-2 shadow-sm"
              >
                <input
                  id="wish-url-sheet"
                  v-model="urlInput"
                  type="url"
                  inputmode="url"
                  class="form-control border-end-0 rounded-start-3"
                  placeholder="https://…"
                  autocomplete="off"
                  @paste="onPasteUrl"
                  @keydown.enter.prevent="runPreview()"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary wish-sheet-preview-btn rounded-end-3 px-3"
                  :disabled="previewLoading"
                  title="Anteprima"
                  aria-label="Carica anteprima"
                  @click="runPreview()"
                >
                  <span
                    v-if="previewLoading"
                    class="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                  />
                  <template v-else> Anteprima </template>
                </button>
              </div>

              <p v-if="displayPreviewError" class="small text-danger mb-2">
                {{ displayPreviewError }}
              </p>
              <p v-if="addMessage" class="small text-danger mb-2">
                {{ friendlyErrorMessage(addMessage) }}
              </p>

              <div class="d-grid gap-2 wish-sheet-actions">
                <button
                  type="button"
                  class="btn btn-primary btn-lg rounded-3 py-2 fw-semibold wish-sheet-save-btn touch-manipulation"
                  :disabled="!draftPreview || !pendingHref || savingDraft"
                  @click="saveFromPreview"
                >
                  <span
                    v-if="savingDraft"
                    class="spinner-border spinner-border-sm me-2"
                    aria-hidden="true"
                  />
                  Aggiungi alla lista
                </button>
                <button
                  type="button"
                  class="btn btn-link text-secondary btn-sm py-1 text-decoration-none"
                  @click="clearPreviewDraft"
                >
                  Azzera anteprima
                </button>
              </div>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </main>
</template>

<style scoped>
  .shopping-page {
    min-height: 100dvh;
    padding-top: max(0.35rem, var(--app-safe-top));
    padding-bottom: max(0.75rem, var(--app-safe-bottom));
  }

  .wish-page {
    padding-bottom: 0;
  }

  .shopping-main {
    padding-top: 0.25rem;
  }

  .wish-inner {
    padding-bottom: 0.25rem;
  }

  .wish-page-title {
    font-size: 1.35rem;
    font-weight: 650;
    letter-spacing: -0.03em;
    line-height: 1.15;
  }

  .wish-filter-pills-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-left: -2px;
    margin-right: -2px;
    padding-bottom: 2px;
  }

  .wish-filter-pills {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--bs-secondary-bg);
    border-radius: 999px;
    border: 1px solid var(--bs-border-color-translucent);
    min-width: min-content;
  }

  .wish-filter-pills__btn {
    flex: 1 1 0;
    min-width: 0;
    border: none;
    border-radius: 999px;
    padding: 0.45rem 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--bs-secondary-color);
    background: transparent;
    transition:
      background-color 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .wish-filter-pills__btn.is-active {
    background: var(--bs-body-bg);
    color: var(--bs-body-color);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.06),
      0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .wish-filter-pills__btn:focus-visible {
    outline: 2px solid var(--bs-primary);
    outline-offset: 2px;
  }

  .wish-swipe-row.shopping-swipe-row {
    position: relative;
    overflow: visible;
  }

  /*
   * Swipe layout solo dentro .wish-swipe-track: niente regole generiche .shopping-swipe-*
   * che potrebbero mescolarsi in bundle con Spesa/Todo (stessi nomi classe).
   */
  .wish-swipe-track.shopping-swipe-track {
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(2.5rem, auto);
    align-items: stretch;
    min-height: 2.5rem;
    --shopping-reveal-w: 64px;
    background: var(--bs-tertiary-bg);
  }

  .wish-swipe-track > .shopping-swipe-actions,
  .wish-swipe-track > .shopping-swipe-front {
    grid-column: 1;
    grid-row: 1;
  }

  .wish-swipe-track .shopping-swipe-actions {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 0;
    display: flex;
    width: var(--shopping-reveal-w);
    padding: 3px 0;
    box-sizing: border-box;
    pointer-events: none;
  }

  .wish-swipe-track .shopping-swipe-actions--start {
    left: 0;
    padding-left: 3px;
  }

  .wish-swipe-track .shopping-swipe-actions--end {
    right: 0;
    padding-right: 3px;
  }

  .wish-swipe-track .shopping-swipe-action {
    min-height: 2.75rem;
    min-width: 0;
    padding: 0.25rem 0.15rem;
    font-weight: 600;
    border-radius: 0.2rem !important;
    pointer-events: auto;
    transition:
      filter 0.15s ease,
      transform 0.12s ease;
  }

  .wish-swipe-track .shopping-swipe-action:active {
    filter: brightness(0.96);
    transform: scale(0.98);
  }

  .wish-swipe-track .shopping-swipe-front {
    position: relative;
    z-index: 1;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    touch-action: pan-y;
    transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    border-radius: 0;
  }

  .wish-swipe-track .shopping-swipe-front--dragging {
    transition: none;
  }

  .wish-swipe-track .shopping-swipe-front.bg-body {
    background-color: var(--bs-body-bg) !important;
  }

  .wish-swipe-track .shopping-swipe-front.bg-body-tertiary {
    background-color: var(--bs-tertiary-bg) !important;
  }

  .wish-swipe-card-front.shopping-swipe-front {
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    border-radius: 0.75rem;
  }

  .wish-swipe-action.shopping-swipe-action {
    min-height: 2.5rem;
    border-radius: 0.5rem !important;
    margin: 5px 3px;
    box-shadow: none !important;
  }

  .wish-swipe-action--edit.shopping-swipe-action {
    background: rgba(var(--bs-primary-rgb), 0.1) !important;
    color: var(--bs-primary) !important;
    box-shadow: inset 0 0 0 1px rgba(var(--bs-primary-rgb), 0.14) !important;
  }

  .wish-swipe-action--remove.shopping-swipe-action {
    background: rgba(var(--bs-danger-rgb), 0.07) !important;
    color: var(--bs-danger) !important;
    box-shadow: inset 0 0 0 1px rgba(var(--bs-danger-rgb), 0.14) !important;
  }

  .wish-swipe-action--remove.shopping-swipe-action:active {
    filter: brightness(0.97);
  }

  .wish-swipe-card-front.shopping-swipe-front--peek-delete:not(
      .shopping-swipe-front--dragging
    ) {
    box-shadow:
      3px 0 12px -5px rgba(15, 23, 42, 0.08),
      0 0 0 1px rgba(0, 0, 0, 0.04);
  }

  .wish-swipe-card-front.shopping-swipe-front--peek-edit:not(
      .shopping-swipe-front--dragging
    ) {
    box-shadow:
      -3px 0 12px -5px rgba(15, 23, 42, 0.08),
      0 0 0 1px rgba(0, 0, 0, 0.04);
  }

  .wish-swipe-card-front.shopping-swipe-front--open:not(
      .shopping-swipe-front--dragging
    ) {
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.04);
  }

  .wish-price-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }

  .wish-item__price {
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .wish-price-chip {
    padding: 0.14rem 0.45rem 0.14rem 0.38rem;
    border-radius: 999px;
    font-size: 0.6875rem;
  }

  .wish-price-chip--integrated {
    border: 1px solid rgba(0, 0, 0, 0.05);
  }

  .wish-price-chip--integrated.wish-price-chip--ok {
    border-color: rgba(25, 135, 84, 0.2);
  }

  .wish-price-chip--integrated.wish-price-chip--warn {
    border-color: rgba(255, 193, 7, 0.35);
  }

  .wish-price-chip--integrated.wish-price-chip--muted {
    border-color: var(--bs-border-color-translucent);
  }

  .wish-price-chip__text--compact {
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .wish-price-chip--ok {
    background: rgba(25, 135, 84, 0.12);
    color: var(--bs-success);
  }

  .wish-price-chip--warn {
    background: rgba(255, 193, 7, 0.2);
    color: #b45309;
  }

  .wish-price-chip--muted {
    background: var(--bs-secondary-bg);
    color: var(--bs-secondary-color);
  }

  .wish-price-chip__icon {
    display: inline-flex;
    line-height: 0;
    opacity: 0.9;
  }

  .wish-cta-primary {
    min-height: 2.5rem;
    font-weight: 650;
  }

  .wish-cta-primary:active {
    transform: scale(0.99);
  }

  .wish-alert-err {
    background: rgba(220, 53, 69, 0.1);
    border: 1px solid rgba(220, 53, 69, 0.25);
    color: var(--bs-danger);
  }

  .wish-note-label {
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--bs-secondary-color);
  }

  .wish-note-preview {
    line-height: 1.35;
    color: var(--bs-body-color);
  }

  .wish-note-empty {
    color: var(--bs-secondary-color);
    font-style: italic;
    opacity: 0.92;
  }

  .wish-note-chev__svg {
    display: block;
    color: var(--bs-secondary-color);
    opacity: 0.75;
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .wish-note-chev__svg--open {
    transform: rotate(180deg);
  }

  .wish-note-toggle {
    background: var(--bs-tertiary-bg) !important;
    color: var(--bs-body-color);
    transition:
      background-color 0.18s ease,
      transform 0.12s ease;
  }

  .wish-note-toggle--open {
    background: var(--bs-secondary-bg) !important;
  }

  .wish-note-toggle:active {
    transform: scale(0.997);
  }

  .wish-notes-panel {
    animation: wish-notes-open 0.2s ease;
  }

  @keyframes wish-notes-open {
    from {
      opacity: 0.65;
    }
    to {
      opacity: 1;
    }
  }

  .wish-title-edit-shell {
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  }

  .wish-scroll-pad {
    padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
  }

  @media (min-width: 768px) {
    .wish-scroll-pad {
      padding-bottom: 1.25rem;
    }
  }

  .pb-safe {
    padding-bottom: max(0.75rem, var(--app-safe-bottom));
  }

  .wish-fab {
    position: fixed;
    right: max(1.125rem, var(--app-safe-right));
    bottom: max(1.125rem, var(--app-safe-bottom));
    z-index: 1030;
    width: 3.25rem;
    height: 3.25rem;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.06),
      0 4px 16px rgba(var(--bs-primary-rgb), 0.28);
  }

  .wish-fab:active {
    transform: scale(0.96);
  }

  .wish-sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1040;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0;
  }

  .wish-sheet {
    width: 100%;
    max-width: 32rem;
    max-height: min(88dvh, 640px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    box-shadow: 0 -8px 32px rgba(15, 23, 42, 0.12);
  }

  .wish-sheet__body {
    padding-top: 0.125rem;
  }

  .wish-sheet__title {
    font-size: 1.0625rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.25;
    color: var(--bs-body-color);
  }

  .wish-sheet__lead {
    line-height: 1.4;
    opacity: 0.92;
  }

  .wish-sheet__field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--bs-secondary-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .wish-sheet-url-row .form-control {
    min-height: 2.75rem;
    font-size: 0.9375rem;
  }

  .wish-sheet-preview-btn {
    min-width: 5.5rem;
    font-weight: 600;
    border-color: var(--bs-border-color) !important;
  }

  .wish-sheet-save-btn {
    min-height: 2.75rem;
    font-weight: 650;
  }

  .wish-sheet-preview .wish-title-line {
    font-size: 0.875rem;
  }

  .wish-sheet__handle {
    width: 2.5rem;
    height: 4px;
    border-radius: 999px;
    background: var(--bs-secondary-color);
    opacity: 0.35;
  }

  .rounded-top-4 {
    border-top-left-radius: 1rem;
    border-top-right-radius: 1rem;
  }

  .wish-item__dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 0.25rem;
    min-width: 11rem;
    z-index: 1060;
  }

  .wish-item__more {
    width: 2.5rem;
    height: 2.5rem;
    min-width: 2.5rem;
    min-height: 2.5rem;
    transition:
      background-color 0.15s ease,
      transform 0.12s ease;
  }

  .wish-item__more:active {
    transform: scale(0.96);
  }

  /*
 * Thumbnail prodotto: box 1:1, larghezza ~80–110px (mobile), cover senza distorsioni.
 * Bootstrap .ratio + .object-fit-cover sul <img>.
 */
  .wish-item__media {
    width: clamp(4.25rem, 22vw, 5.5rem);
  }

  .wish-item__media--card {
    background: var(--bs-tertiary-bg);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.045);
  }

  .wish-item__media--sheet {
    width: 4.5rem;
  }

  .wish-item__thumb {
    width: 100%;
  }

  .wish-item__placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0.4rem;
    background: linear-gradient(
      160deg,
      rgba(0, 0, 0, 0.02),
      rgba(0, 0, 0, 0.04)
    );
    color: var(--bs-secondary-color);
  }

  .wish-item__placeholder--compact .wish-item__placeholder-label {
    display: none;
  }

  .wish-item__placeholder-icon {
    width: 1.75rem;
    height: 1.75rem;
    flex-shrink: 0;
    opacity: 0.42;
  }

  .wish-item__placeholder--compact .wish-item__placeholder-icon {
    width: 1.35rem;
    height: 1.35rem;
  }

  .wish-item__placeholder-label {
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    line-height: 1.15;
    margin-top: 0.2rem;
    max-width: 100%;
    opacity: 0.9;
  }

  .wish-item__title {
    font-size: 0.9375rem;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .wish-item--purchased .wish-item__title,
  .wish-item--purchased .wish-item__price {
    opacity: 0.88;
  }

  .wish-item--dismissed .wish-item__title,
  .wish-item--dismissed .wish-item__price {
    opacity: 0.75;
  }

  .wish-badge-tiny {
    font-size: 0.65rem;
    font-weight: 600;
  }

  .wish-screen-sub {
    line-height: 1.35;
  }

  .object-fit-cover {
    object-fit: cover;
  }

  .wish-toast {
    animation: wish-fade-in 0.25s ease;
  }

  @keyframes wish-fade-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .wish-filter-group .btn {
    margin-bottom: 0.25rem;
  }

  .shopping-list-controls {
    padding-bottom: 0.125rem;
  }

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

  .shopping-list-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: stretch;
    width: auto;
    max-width: 100%;
    flex: 0 0 auto;
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
    }
  }

  /* Modali compatti (es. conferma rimozione): centrati, non a tutta larghezza su mobile */
  :global(.shopping-modal.shopping-modal--compact.modal) {
    justify-content: center;
    align-items: center;
    padding: 1rem;
    padding-left: max(1rem, var(--app-safe-left));
    padding-right: max(1rem, var(--app-safe-right));
    padding-bottom: max(1rem, var(--app-safe-bottom));
  }

  :global(.shopping-modal.shopping-modal--compact .shopping-modal-dialog) {
    width: 100%;
    max-width: min(20rem, calc(100% - 2rem));
    margin-left: auto !important;
    margin-right: auto !important;
  }

  @media (max-width: 575.98px) {
    :global(.shopping-modal.shopping-modal--compact.modal) {
      display: flex !important;
      flex-direction: column;
      justify-content: center;
    }

    :global(.shopping-modal.shopping-modal--compact .shopping-modal-dialog) {
      width: 100%;
      max-width: min(20rem, calc(100% - 2rem));
    }

    :global(
      .shopping-modal.shopping-modal--compact .shopping-modal-dialog .modal-content
    ) {
      border-radius: var(--bs-border-radius-lg);
    }
  }

  .wish-title {
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .wish-title-line {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.25;
  }

  .wish-domain {
    letter-spacing: 0.02em;
    font-size: 0.8rem;
  }

  .wish-card-row {
    flex-direction: column;
  }

  @media (min-width: 576px) {
    .wish-card-row {
      flex-direction: row;
    }
  }

  .wish-card-thumb-wrap {
    min-height: 140px;
    max-height: 200px;
  }

  .wish-card-thumb-link {
    min-height: 140px;
    max-height: 200px;
  }

  .wish-card-thumb {
    width: 100%;
    height: 100%;
    min-height: 140px;
    max-height: 200px;
    object-fit: cover;
  }

  .wish-card-thumb-placeholder {
    min-height: 140px;
    max-height: 200px;
    padding: 0.75rem;
    text-align: center;
    line-height: 1.2;
    background: linear-gradient(145deg, var(--bs-light, #f8f9fa), #e9ecef);
  }

  .wish-card--purchased {
    opacity: 0.92;
  }

  .wish-card--dismissed {
    opacity: 0.75;
  }

  @media (prefers-reduced-motion: reduce) {
    .wish-swipe-track .shopping-swipe-front {
      transition-duration: 0.12s;
    }

    .wish-swipe-track .shopping-swipe-action {
      transition: none;
    }

    .wish-swipe-track .shopping-swipe-action:active {
      transform: none;
    }

    .wish-notes-panel {
      animation: none;
    }

    .wish-filter-pills__btn {
      transition: none;
    }

    .wish-cta-primary:active,
    .wish-item__more:active,
    .wish-note-toggle:active,
    .wish-fab:active {
      transform: none;
    }

    .wish-note-chev__svg {
      transition: none;
    }
  }
</style>
