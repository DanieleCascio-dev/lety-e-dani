<script setup lang="ts">
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
  import type { CalendarEvent, UserId } from "@/types/app";
  import { useCalendarEvents } from "@/composables/useCalendarEvents";
  import { useAppStorage } from "@/composables/useAppStorage";
  import { useShoppingSwipeReveal } from "@/composables/useShoppingSwipeReveal";

  const {
    events,
    eventsLoading,
    eventsError,
    fetchEventsForRange,
    addCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    setupCalendarRealtimeChannel,
  } = useCalendarEvents();

  const { activeUser, profileFor, userProfiles, textIconClassFor, textIconStyleFor } =
    useAppStorage();

  const swipeReveal = useShoppingSwipeReveal({ revealPx: 88 });

  const today = new Date();
  const viewYear = ref(today.getFullYear());
  const viewMonth = ref(today.getMonth());
  const filterAssignedTo = ref<string>("");

  const monthLabel = computed(() => {
    const d = new Date(viewYear.value, viewMonth.value, 1);
    const raw = d.toLocaleDateString("it-IT", {
      month: "long",
      year: "numeric",
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  });

  const DOW_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  interface DayCell {
    date: Date;
    day: number;
    inMonth: boolean;
    isToday: boolean;
    key: string;
  }

  const grid = computed<DayCell[]>(() => {
    const y = viewYear.value;
    const m = viewMonth.value;
    const first = new Date(y, m, 1);
    const startDow = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const cells: DayCell[] = [];
    const todayStr = toDateKey(today);

    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(y, m, -i);
      cells.push({
        date: d,
        day: d.getDate(),
        inMonth: false,
        isToday: toDateKey(d) === todayStr,
        key: toDateKey(d),
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m, d);
      cells.push({
        date: dt,
        day: d,
        inMonth: true,
        isToday: toDateKey(dt) === todayStr,
        key: toDateKey(dt),
      });
    }

    const remainder = cells.length % 7;
    if (remainder > 0) {
      const extra = 7 - remainder;
      const lastDay = new Date(y, m + 1, 0).getDate();
      for (let i = 1; i <= extra; i++) {
        const d = new Date(y, m, lastDay + i);
        cells.push({
          date: d,
          day: d.getDate(),
          inMonth: false,
          isToday: toDateKey(d) === todayStr,
          key: toDateKey(d),
        });
      }
    }

    return cells;
  });

  function toDateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const filteredEvents = computed(() => {
    const f = filterAssignedTo.value;
    if (!f) return events.value;
    return events.value.filter((e) => e.assignedTo === f);
  });

  function eventsForDay(dayKey: string): CalendarEvent[] {
    return filteredEvents.value.filter((ev) => {
      const s = toDateKey(new Date(ev.startsAt));
      const e = toDateKey(new Date(ev.endsAt));
      return dayKey >= s && dayKey <= e;
    });
  }

  function eventCountForDay(dayKey: string): number {
    return eventsForDay(dayKey).length;
  }

  function assigneesForDay(dayKey: string): string[] {
    const dayEvents = eventsForDay(dayKey);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const ev of dayEvents) {
      if (!seen.has(ev.assignedTo)) {
        seen.add(ev.assignedTo);
        result.push(ev.assignedTo);
      }
    }
    return result;
  }

  /* --- slide animation --- */
  const slideClass = ref("");
  let slideTimer: ReturnType<typeof setTimeout> | null = null;

  function applySlide(direction: "left" | "right") {
    if (slideTimer) clearTimeout(slideTimer);
    slideClass.value =
      direction === "left" ? "cal-grid--slide-left" : "cal-grid--slide-right";
    slideTimer = setTimeout(() => {
      slideClass.value = "";
      slideTimer = null;
    }, 220);
  }

  function prevMonth() {
    if (viewMonth.value === 0) {
      viewMonth.value = 11;
      viewYear.value--;
    } else {
      viewMonth.value--;
    }
    applySlide("right");
  }

  function nextMonth() {
    if (viewMonth.value === 11) {
      viewMonth.value = 0;
      viewYear.value++;
    } else {
      viewMonth.value++;
    }
    applySlide("left");
  }

  function goToday() {
    const t = new Date();
    viewYear.value = t.getFullYear();
    viewMonth.value = t.getMonth();
  }

  /* --- swipe to change month --- */
  const calGridRef = ref<HTMLElement | null>(null);
  const SWIPE_THRESHOLD = 50;
  let touchStartX = 0;
  let touchStartY = 0;

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0] as Touch | undefined;
    if (!t) return;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }

  function onTouchEnd(e: TouchEvent) {
    const t = e.changedTouches[0] as Touch | undefined;
    if (!t) return;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) nextMonth();
      else prevMonth();
    }
  }

  const rangeStart = computed(() => {
    const first = new Date(viewYear.value, viewMonth.value, 1);
    const startDow = (first.getDay() + 6) % 7;
    const d = new Date(viewYear.value, viewMonth.value, 1 - startDow);
    return d.toISOString();
  });

  const rangeEnd = computed(() => {
    const daysInMonth = new Date(
      viewYear.value,
      viewMonth.value + 1,
      0,
    ).getDate();
    const first = new Date(viewYear.value, viewMonth.value, 1);
    const startDow = (first.getDay() + 6) % 7;
    const totalCells = startDow + daysInMonth;
    const remainder = totalCells % 7;
    const extra = remainder > 0 ? 7 - remainder : 0;
    const d = new Date(
      viewYear.value,
      viewMonth.value,
      daysInMonth + extra,
      23,
      59,
      59,
      999,
    );
    return d.toISOString();
  });

  watch(
    [rangeStart, rangeEnd],
    ([s, e]) => {
      void fetchEventsForRange(s, e, false);
    },
    { immediate: true },
  );

  onMounted(() => {
    setupCalendarRealtimeChannel();
    calGridRef.value?.addEventListener("touchstart", onTouchStart, { passive: true });
    calGridRef.value?.addEventListener("touchend", onTouchEnd, { passive: true });
  });

  onUnmounted(() => {
    calGridRef.value?.removeEventListener("touchstart", onTouchStart);
    calGridRef.value?.removeEventListener("touchend", onTouchEnd);
    if (slideTimer) clearTimeout(slideTimer);
  });

  /* --- day detail panel (bottom sheet) --- */
  const selectedDayKey = ref<string | null>(null);
  const sheetVisible = ref(false);
  const selectedDayLabel = computed(() => {
    if (!selectedDayKey.value) return "";
    const [yStr, mStr, dStr] = selectedDayKey.value.split("-");
    const d = new Date(+(yStr ?? 0), +(mStr ?? 1) - 1, +(dStr ?? 1));
    return d.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  });
  const selectedDayEvents = computed(() =>
    selectedDayKey.value ? eventsForDay(selectedDayKey.value) : [],
  );

  function openDay(cell: DayCell) {
    swipeReveal.closeAll();
    selectedDayKey.value = cell.key;
    void nextTick(() => {
      sheetVisible.value = true;
    });
  }
  function closeDay() {
    sheetVisible.value = false;
    setTimeout(() => {
      selectedDayKey.value = null;
    }, 260);
  }

  /* --- swipe event row helpers --- */
  function onSwipeEdit(ev: CalendarEvent) {
    swipeReveal.snapClosed(ev.id);
    openEditEventModal(ev);
  }
  function onSwipeDelete(ev: CalendarEvent) {
    swipeReveal.snapClosed(ev.id);
    confirmDelete(ev);
  }

  /* --- add/edit modal --- */
  const showEventModal = ref(false);
  const editingEventId = ref<string | null>(null);
  const formTitle = ref("");
  const formNotes = ref("");
  const formStartDate = ref("");
  const formStartTime = ref("");
  const formEndDate = ref("");
  const formEndTime = ref("");
  const formAssignedTo = ref<UserId>("");
  const formSaving = ref(false);

  const memberOptions = computed(() =>
    Object.values(userProfiles.value).map((p) => ({
      id: p.id,
      label: p.displayName || p.id,
    })),
  );

  function splitDatetime(iso: string): { date: string; time: string } {
    const d = new Date(iso);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { date, time };
  }

  function openNewEventModal(dayKey?: string) {
    editingEventId.value = null;
    formTitle.value = "";
    formNotes.value = "";
    formAssignedTo.value = activeUser.value;
    const dk = dayKey ?? toDateKey(new Date());
    formStartDate.value = dk;
    formStartTime.value = "09:00";
    formEndDate.value = dk;
    formEndTime.value = "10:00";
    formSaving.value = false;
    showEventModal.value = true;
  }

  function openEditEventModal(ev: CalendarEvent) {
    editingEventId.value = ev.id;
    formTitle.value = ev.title;
    formNotes.value = ev.notes ?? "";
    const start = splitDatetime(ev.startsAt);
    const end = splitDatetime(ev.endsAt);
    formStartDate.value = start.date;
    formStartTime.value = start.time;
    formEndDate.value = end.date;
    formEndTime.value = end.time;
    formAssignedTo.value = ev.assignedTo;
    formSaving.value = false;
    showEventModal.value = true;
  }

  function closeEventModal() {
    showEventModal.value = false;
    editingEventId.value = null;
  }

  const formStartIso = computed(() =>
    formStartDate.value && formStartTime.value
      ? `${formStartDate.value}T${formStartTime.value}`
      : "",
  );
  const formEndIso = computed(() =>
    formEndDate.value && formEndTime.value
      ? `${formEndDate.value}T${formEndTime.value}`
      : "",
  );

  const formValid = computed(
    () =>
      formTitle.value.trim().length > 0 &&
      formStartIso.value &&
      formEndIso.value &&
      formAssignedTo.value &&
      formStartIso.value <= formEndIso.value,
  );

  async function saveEvent() {
    if (!formValid.value || formSaving.value) return;
    formSaving.value = true;
    const startsAt = new Date(formStartIso.value).toISOString();
    const endsAt = new Date(formEndIso.value).toISOString();
    let ok: boolean;
    if (editingEventId.value) {
      ok = await updateCalendarEvent(editingEventId.value, {
        title: formTitle.value,
        notes: formNotes.value || null,
        startsAt,
        endsAt,
        assignedTo: formAssignedTo.value,
      });
    } else {
      ok = await addCalendarEvent({
        title: formTitle.value,
        notes: formNotes.value || null,
        startsAt,
        endsAt,
        assignedTo: formAssignedTo.value,
      });
    }
    formSaving.value = false;
    if (ok) closeEventModal();
  }

  /* --- delete confirm --- */
  const deleteTarget = ref<CalendarEvent | null>(null);
  const showDeleteModal = ref(false);

  function confirmDelete(ev: CalendarEvent) {
    deleteTarget.value = ev;
    showDeleteModal.value = true;
  }
  async function doDelete() {
    if (!deleteTarget.value) return;
    await deleteCalendarEvent(deleteTarget.value.id);
    showDeleteModal.value = false;
    deleteTarget.value = null;
  }
  function cancelDelete() {
    showDeleteModal.value = false;
    deleteTarget.value = null;
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
</script>

<template>
  <main class="calendar-main">
    <div
      class="container-fluid px-3 px-sm-4 calendar-inner"
      style="max-width: 32rem"
    >
      <h1 class="h5 fw-semibold mb-3">Calendario</h1>

      <div
        v-if="eventsError"
        class="alert alert-warning small py-2 mb-2"
        role="status"
      >
        {{ eventsError }}
      </div>

      <!-- month nav + filter -->
      <div class="d-flex align-items-center justify-content-between mb-2 gap-2">
        <div class="d-flex align-items-center gap-1">
          <button
            type="button"
            class="btn btn-sm btn-light rounded-circle cal-nav-btn"
            aria-label="Mese precedente"
            @click="prevMonth"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
              />
            </svg>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-link text-body fw-semibold px-2 cal-month-label"
            @click="goToday"
          >
            {{ monthLabel }}
          </button>
          <button
            type="button"
            class="btn btn-sm btn-light rounded-circle cal-nav-btn"
            aria-label="Mese successivo"
            @click="nextMonth"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
              />
            </svg>
          </button>
        </div>

        <select
          v-model="filterAssignedTo"
          class="form-select form-select-sm cal-filter-select"
          aria-label="Filtra per persona"
        >
          <option value="">Tutti</option>
          <option
            v-for="m in memberOptions"
            :key="m.id"
            :value="m.id"
          >
            {{ m.label }}
          </option>
        </select>
      </div>

      <!-- grid wrapper (overflow hidden for slide animation) -->
      <div class="cal-grid-wrap mb-3 position-relative">
        <div
          v-if="eventsLoading"
          class="cal-grid-loader"
        >
          <div
            class="spinner-border spinner-border-sm text-secondary"
            role="status"
          >
            <span class="visually-hidden">Caricamento…</span>
          </div>
        </div>
        <div
          ref="calGridRef"
          class="cal-grid"
          :class="slideClass"
        >
          <div
            v-for="dow in DOW_LABELS"
            :key="dow"
            class="cal-dow text-center text-secondary small fw-semibold"
          >
            {{ dow }}
          </div>
          <button
            v-for="cell in grid"
            :key="cell.key"
            type="button"
            class="cal-cell"
            :class="{
              'cal-cell--out': !cell.inMonth,
              'cal-cell--today': cell.isToday,
              'cal-cell--selected': selectedDayKey === cell.key,
            }"
            @click="openDay(cell)"
          >
            <span class="cal-cell-day">{{ cell.day }}</span>
            <span
              v-if="assigneesForDay(cell.key).length"
              class="cal-dots"
            >
              <span
                v-for="uid in assigneesForDay(cell.key).slice(0, 3)"
                :key="uid"
                class="cal-dot-icon"
                :class="textIconClassFor(uid)"
                :style="textIconStyleFor(uid)"
              />
            </span>
            <span
              v-if="eventCountForDay(cell.key) > 2"
              class="cal-cell-badge"
            >{{ eventCountForDay(cell.key) }}</span>
          </button>
        </div>
      </div>

      <!-- FAB -->
      <button
        v-if="!selectedDayKey"
        type="button"
        class="btn btn-primary rounded-circle shadow cal-fab"
        aria-label="Nuovo impegno"
        @click="openNewEventModal()"
      >
        <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z" />
        </svg>
      </button>
    </div>

    <!-- bottom sheet: day detail -->
    <Teleport to="body">
      <Transition name="cal-sheet-backdrop">
        <div
          v-if="selectedDayKey"
          class="cal-sheet-backdrop"
          @click="closeDay"
        />
      </Transition>
      <Transition name="cal-sheet">
        <div
          v-if="selectedDayKey && sheetVisible"
          class="cal-sheet"
        >
          <div class="cal-sheet-handle" />
          <div class="cal-sheet-header d-flex align-items-center justify-content-between mb-2 px-3 pt-2">
            <h2 class="h6 fw-semibold mb-0 text-capitalize">
              {{ selectedDayLabel }}
            </h2>
            <div class="d-flex gap-1">
              <button
                type="button"
                class="btn btn-sm btn-primary rounded-pill px-3"
                @click="openNewEventModal(selectedDayKey ?? undefined)"
              >
                + Nuovo
              </button>
              <button
                type="button"
                class="btn-close"
                aria-label="Chiudi"
                @click="closeDay"
              />
            </div>
          </div>
          <div class="cal-sheet-body px-3 pb-3">
            <ul
              v-if="selectedDayEvents.length"
              class="list-unstyled mb-0"
            >
              <li
                v-for="ev in selectedDayEvents"
                :key="ev.id"
                class="cal-event-row position-relative overflow-hidden"
              >
                <div class="cal-swipe-track">
                  <div class="cal-swipe-actions cal-swipe-actions--start">
                    <button
                      type="button"
                      class="btn btn-sm cal-swipe-action cal-swipe-action--edit d-flex align-items-center justify-content-center border-0 h-100 w-100"
                      aria-label="Modifica"
                      @click="onSwipeEdit(ev)"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" /></svg>
                    </button>
                  </div>
                  <div class="cal-swipe-actions cal-swipe-actions--end">
                    <button
                      type="button"
                      class="btn btn-sm cal-swipe-action cal-swipe-action--remove d-flex align-items-center justify-content-center border-0 h-100 w-100"
                      aria-label="Elimina"
                      @click="onSwipeDelete(ev)"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" /><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H5.5l1-1h3l1 1H14a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" /></svg>
                    </button>
                  </div>
                  <div
                    class="cal-swipe-front d-flex align-items-start gap-2 py-2 border-bottom"
                    :class="{
                      'cal-swipe-front--dragging': swipeReveal.isDraggingRow(ev.id),
                      'cal-swipe-front--open': swipeReveal.isRevealed(ev.id),
                    }"
                    :style="{ transform: `translateX(${swipeReveal.getTx(ev.id)}px)` }"
                    @pointerdown="swipeReveal.onPointerDown($event, ev.id)"
                    @pointermove="swipeReveal.onPointerMove($event)"
                    @pointerup="swipeReveal.onPointerUp($event)"
                    @pointercancel="swipeReveal.onPointerCancel($event)"
                  >
                    <span
                      class="cal-event-icon"
                      :class="textIconClassFor(ev.assignedTo)"
                      :style="textIconStyleFor(ev.assignedTo)"
                      :title="profileFor(ev.assignedTo).displayName || ev.assignedTo"
                      aria-hidden="true"
                    />
                    <div class="flex-grow-1 min-w-0">
                      <div class="fw-semibold small text-truncate">
                        {{ ev.title }}
                      </div>
                      <div class="text-secondary" style="font-size: 0.75rem">
                        {{ formatTime(ev.startsAt) }}–{{ formatTime(ev.endsAt) }}
                        · {{ profileFor(ev.assignedTo).displayName || ev.assignedTo }}
                      </div>
                      <div
                        v-if="ev.notes"
                        class="text-secondary small mt-1"
                      >
                        {{ ev.notes }}
                      </div>
                    </div>
                    <div class="d-none d-sm-flex gap-1 flex-shrink-0">
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary border-0 p-1"
                        aria-label="Modifica"
                        @click="openEditEventModal(ev)"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" /></svg>
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-danger border-0 p-1"
                        aria-label="Elimina"
                        @click="confirmDelete(ev)"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" /><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H5.5l1-1h3l1 1H14a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
            <p
              v-else
              class="text-secondary small mb-0"
            >
              Nessun impegno per questo giorno.
            </p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- event form modal (bottom-sheet pattern) -->
    <Teleport to="body">
      <div
        v-if="showEventModal"
        class="modal fade show d-block shopping-modal cal-form-modal"
        tabindex="-1"
        style="background-color: rgba(0, 0, 0, 0.4)"
        role="dialog"
        aria-modal="true"
        @click.self="closeEventModal"
      >
        <div class="modal-dialog modal-dialog-centered shopping-modal-dialog">
          <div class="modal-content" @click.stop>
            <div class="modal-header">
              <h5 class="modal-title">
                {{ editingEventId ? "Modifica impegno" : "Nuovo impegno" }}
              </h5>
              <button
                type="button"
                class="btn-close"
                aria-label="Chiudi"
                @click="closeEventModal"
              />
            </div>
            <form @submit.prevent="saveEvent">
              <div class="modal-body">
                <div class="mb-3">
                  <label for="cal-ev-title" class="form-label small"
                    >Titolo</label
                  >
                  <input
                    id="cal-ev-title"
                    v-model="formTitle"
                    type="text"
                    class="form-control"
                    inputmode="text"
                    autocomplete="off"
                    placeholder="Es. Visita medica, Riunione…"
                    maxlength="120"
                    required
                  />
                </div>
                <div class="row g-2 mb-3">
                  <div class="col-6">
                    <label for="cal-ev-start-date" class="form-label small"
                      >Data inizio</label
                    >
                    <input
                      id="cal-ev-start-date"
                      v-model="formStartDate"
                      type="date"
                      class="form-control"
                      required
                    />
                  </div>
                  <div class="col-6">
                    <label for="cal-ev-start-time" class="form-label small"
                      >Ora inizio</label
                    >
                    <input
                      id="cal-ev-start-time"
                      v-model="formStartTime"
                      type="time"
                      class="form-control"
                      required
                    />
                  </div>
                  <div class="col-6">
                    <label for="cal-ev-end-date" class="form-label small"
                      >Data fine</label
                    >
                    <input
                      id="cal-ev-end-date"
                      v-model="formEndDate"
                      type="date"
                      class="form-control"
                      required
                    />
                  </div>
                  <div class="col-6">
                    <label for="cal-ev-end-time" class="form-label small"
                      >Ora fine</label
                    >
                    <input
                      id="cal-ev-end-time"
                      v-model="formEndTime"
                      type="time"
                      class="form-control"
                      required
                    />
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label small">Assegnato a</label>
                  <div class="d-flex flex-wrap gap-2 cal-assignee-chips">
                    <button
                      v-for="m in memberOptions"
                      :key="m.id"
                      type="button"
                      class="cal-chip d-flex align-items-center gap-2 px-3 py-2 rounded-pill border"
                      :class="formAssignedTo === m.id ? 'cal-chip--active' : ''"
                      @click="formAssignedTo = m.id"
                    >
                      <span
                        class="cal-chip-icon"
                        :class="textIconClassFor(m.id)"
                        :style="textIconStyleFor(m.id)"
                        aria-hidden="true"
                      />
                      <span class="small fw-medium">{{ m.label }}</span>
                    </button>
                  </div>
                </div>
                <div class="mb-0">
                  <label for="cal-ev-notes" class="form-label small"
                    >Note</label
                  >
                  <textarea
                    id="cal-ev-notes"
                    v-model="formNotes"
                    class="form-control"
                    rows="3"
                    maxlength="500"
                  />
                </div>
              </div>
              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  @click="closeEventModal"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="!formValid || formSaving"
                >
                  {{ formSaving ? "Salvataggio…" : "Salva" }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- delete confirm modal -->
    <Teleport to="body">
      <div
        v-if="showDeleteModal"
        class="modal-backdrop fade show"
        @click.self="cancelDelete"
      />
      <div
        v-if="showDeleteModal"
        class="modal fade show d-block"
        tabindex="-1"
        role="dialog"
        @click.self="cancelDelete"
      >
        <div class="modal-dialog modal-dialog-centered modal-sm">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Conferma eliminazione</h5>
              <button
                type="button"
                class="btn-close"
                aria-label="Chiudi"
                @click="cancelDelete"
              />
            </div>
            <div class="modal-body">
              <p class="mb-0">
                Eliminare
                <strong>{{ deleteTarget?.title }}</strong>?
              </p>
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                @click="cancelDelete"
              >
                Annulla
              </button>
              <button
                type="button"
                class="btn btn-danger"
                @click="doDelete"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
  /* ── page layout + safe areas (8) ── */
  .calendar-main {
    padding-top: max(0.75rem, var(--app-safe-top, 0px));
    padding-bottom: max(5rem, var(--app-safe-bottom, 0px));
  }

  .calendar-inner {
    padding-left: max(0.75rem, var(--app-safe-left, 0px));
    padding-right: max(0.75rem, var(--app-safe-right, 0px));
  }

  /* ── nav buttons bigger (5) ── */
  .cal-nav-btn {
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--bs-box-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.08));
    position: relative;
  }

  .cal-nav-btn::after {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 50%;
  }

  .cal-month-label {
    text-decoration: none !important;
    font-size: 0.95rem;
  }

  .cal-filter-select {
    max-width: 8rem;
  }

  /* ── grid overlay loader ── */
  .cal-grid-loader {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--bs-body-bg-rgb, 255, 255, 255), 0.45);
    border-radius: inherit;
    pointer-events: none;
  }

  /* ── grid wrapper for slide animation (2) ── */
  .cal-grid-wrap {
    overflow: hidden;
    border-radius: 0.75rem;
    border: 1px solid var(--bs-border-color-translucent);
    background-color: var(--cal-panel-bg, var(--bs-body-bg, #fff));
  }

  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
    padding: 0.35rem 0.25rem 0.25rem;
  }

  /* ── slide animations (2) ── */
  .cal-grid--slide-left {
    animation: calSlideLeft 0.22s ease-out;
  }
  .cal-grid--slide-right {
    animation: calSlideRight 0.22s ease-out;
  }

  @keyframes calSlideLeft {
    from { opacity: 0.4; transform: translateX(30%); }
    to   { opacity: 1;   transform: translateX(0); }
  }
  @keyframes calSlideRight {
    from { opacity: 0.4; transform: translateX(-30%); }
    to   { opacity: 1;   transform: translateX(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .cal-grid--slide-left,
    .cal-grid--slide-right {
      animation: none;
    }
  }

  .cal-dow {
    padding: 0.25rem 0;
    font-size: 0.7rem;
  }

  /* ── cells: bigger, touch-action, active feedback (1 + 9) ── */
  .cal-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 2px;
    padding: 0.4rem 0.2rem 0.3rem;
    min-height: 3rem;
    border: none;
    background: transparent;
    color: var(--bs-body-color);
    border-radius: 0.375rem;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background-color 0.1s,
      box-shadow 0.1s,
      transform 0.08s;
  }

  .cal-cell:hover {
    background-color: rgba(var(--bs-primary-rgb), 0.08);
  }

  .cal-cell:active {
    transform: scale(0.94);
  }

  @media (prefers-reduced-motion: reduce) {
    .cal-cell:active {
      transform: none;
    }
  }

  .cal-cell--out {
    opacity: 0.35;
  }

  .cal-cell--today .cal-cell-day {
    background-color: var(--bs-primary);
    color: var(--cal-today-text, #fff);
    border-radius: 50%;
    width: 1.5rem;
    height: 1.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .cal-cell--selected {
    background-color: rgba(var(--bs-primary-rgb), 0.12);
    box-shadow: inset 0 0 0 2px var(--bs-primary);
  }

  .cal-cell-day {
    font-size: 0.8rem;
    font-weight: 500;
    line-height: 1;
  }

  .cal-dots {
    display: flex;
    gap: 3px;
    justify-content: center;
    align-items: center;
  }

  .cal-dot-icon.grocery-text-icon {
    width: 0.6rem;
    height: 0.6rem;
    min-width: 0.6rem;
    min-height: 0.6rem;
    flex-shrink: 0;
  }

  /* ── event count badge (10) ── */
  .cal-cell-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    font-size: 0.55rem;
    font-weight: 700;
    line-height: 1;
    width: 0.85rem;
    height: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background-color: var(--bs-primary);
    color: var(--cal-today-text, #fff);
  }

  /* ── bottom sheet (3) ── */
  .cal-sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1040;
    background: rgba(0, 0, 0, 0.35);
  }

  .cal-sheet-backdrop-enter-active,
  .cal-sheet-backdrop-leave-active {
    transition: opacity 0.25s ease;
  }
  .cal-sheet-backdrop-enter-from,
  .cal-sheet-backdrop-leave-to {
    opacity: 0;
  }

  .cal-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1041;
    max-height: 60vh;
    background-color: var(--cal-panel-bg, var(--bs-body-bg, #fff));
    border-top-left-radius: 1rem;
    border-top-right-radius: 1rem;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .cal-sheet-enter-active {
    transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .cal-sheet-leave-active {
    transition: transform 0.2s ease-in;
  }
  .cal-sheet-enter-from,
  .cal-sheet-leave-to {
    transform: translateY(100%);
  }

  .cal-sheet-handle {
    width: 2rem;
    height: 4px;
    border-radius: 2px;
    background: var(--bs-secondary-color, #aaa);
    opacity: 0.4;
    margin: 0.5rem auto 0;
    flex-shrink: 0;
  }

  .cal-sheet-body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    flex: 1 1 auto;
    min-height: 0;
  }

  /* ── swipe-to-action event rows (4) ── */
  .cal-swipe-track {
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
  }

  .cal-swipe-track > .cal-swipe-actions,
  .cal-swipe-track > .cal-swipe-front {
    grid-column: 1;
    grid-row: 1;
  }

  .cal-swipe-actions {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 88px;
    display: flex;
    align-items: stretch;
    pointer-events: none;
  }

  .cal-swipe-actions--start {
    left: 0;
    padding-left: 2px;
  }
  .cal-swipe-actions--end {
    right: 0;
    padding-right: 2px;
  }

  .cal-swipe-action {
    flex: 1 1 auto;
    align-self: stretch;
    font-weight: 600;
    border-radius: 0.35rem !important;
    touch-action: manipulation;
    pointer-events: auto;
    transition: filter 0.1s, transform 0.1s;
  }
  .cal-swipe-action:active {
    filter: brightness(0.96);
    transform: scale(0.98);
  }
  .cal-swipe-action--edit {
    background: var(--bs-primary-bg-subtle) !important;
    color: var(--bs-primary) !important;
  }
  .cal-swipe-action--remove {
    background: var(--bs-danger-bg-subtle) !important;
    color: var(--bs-danger-text-emphasis, var(--bs-danger)) !important;
  }

  .cal-swipe-front {
    position: relative;
    z-index: 1;
    min-width: 0;
    max-width: 100%;
    touch-action: pan-y;
    transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    background-color: var(--cal-panel-bg, var(--bs-body-bg, #fff));
  }

  .cal-swipe-front--dragging {
    transition: none;
  }

  .cal-swipe-front--open:not(.cal-swipe-front--dragging) {
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05);
  }

  @media (prefers-reduced-motion: reduce) {
    .cal-swipe-front {
      transition-duration: 0.12s;
    }
    .cal-swipe-action {
      transition: none;
    }
  }

  .cal-event-icon.grocery-text-icon {
    width: 0.9rem;
    height: 0.9rem;
    min-width: 0.9rem;
    min-height: 0.9rem;
    margin-top: 0.2rem;
  }

  .cal-event-row:last-child .cal-swipe-front {
    border-bottom: none !important;
  }

  /* ── assignee chips ── */
  .cal-assignee-chips {
    min-height: 2.75rem;
  }

  .cal-chip {
    background: transparent;
    cursor: pointer;
    touch-action: manipulation;
    transition: background-color 0.12s, border-color 0.12s, box-shadow 0.12s;
  }

  .cal-chip:hover {
    background-color: rgba(var(--bs-primary-rgb), 0.06);
  }

  .cal-chip--active {
    background-color: rgba(var(--bs-primary-rgb), 0.14) !important;
    border-color: var(--bs-primary) !important;
    box-shadow: 0 0 0 1px var(--bs-primary);
  }

  .cal-chip-icon.grocery-text-icon {
    width: 1rem;
    height: 1rem;
    min-width: 1rem;
    min-height: 1rem;
  }

  /* ── bottom-sheet modal pattern (matching Shopping/Todo) ── */
  :global(.cal-form-modal .shopping-modal-dialog) {
    margin: 0.75rem auto;
    max-width: calc(100% - 1.5rem);
  }

  @media (max-width: 575.98px) {
    :global(.cal-form-modal.modal) {
      display: flex !important;
      flex-direction: column;
      justify-content: flex-end;
      align-items: stretch;
      padding: 0;
      padding-bottom: var(--app-safe-bottom);
    }

    :global(.cal-form-modal .shopping-modal-dialog) {
      margin: 0 !important;
      width: 100%;
      max-width: 100%;
      min-height: unset !important;
      align-items: stretch;
    }

    :global(.cal-form-modal .shopping-modal-dialog .modal-content) {
      border-radius: 1rem 1rem 0 0;
      max-height: 88dvh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    :global(.cal-form-modal .modal-content > form) {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    :global(.cal-form-modal .modal-body) {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      flex: 1 1 auto;
      min-height: 0;
    }

    :global(.cal-form-modal .modal-footer) {
      flex-direction: column-reverse;
      align-items: stretch;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    :global(.cal-form-modal .modal-footer .btn) {
      width: 100%;
      margin: 0;
      min-height: 2.75rem;
    }
  }

  /* ── FAB: safe area + active feedback (6) ── */
  .cal-fab {
    position: fixed;
    bottom: calc(5rem + env(safe-area-inset-bottom, 0px));
    right: 1.25rem;
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition: transform 0.08s;
  }

  .cal-fab:active {
    transform: scale(0.92);
  }

  @media (min-width: 576px) {
    .cal-fab {
      right: calc(50% - 16rem + 1rem);
    }
  }
</style>
