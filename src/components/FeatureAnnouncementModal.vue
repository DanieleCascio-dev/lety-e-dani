<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  /** Chiave univoca per localStorage: bump quando aggiorni il messaggio */
  announcementId: string
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const open = ref(false)

function storageKey() {
  return `lety-dani:feature-announcement-seen:${props.announcementId}`
}

function isSeen(): boolean {
  try {
    return localStorage.getItem(storageKey()) === '1'
  } catch {
    return true
  }
}

function markSeen() {
  try {
    localStorage.setItem(storageKey(), '1')
  } catch {
    /* ignore (es. modalità privata) */
  }
}

function dismiss() {
  markSeen()
  open.value = false
  emit('dismiss')
}

function onBackdropClick() {
  dismiss()
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape' || !open.value) return
  dismiss()
}

onMounted(() => {
  if (!isSeen()) open.value = true
  document.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal fade show d-block feature-announcement-modal"
      tabindex="-1"
      style="background-color: rgba(0, 0, 0, 0.4)"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-announcement-title"
      @click.self="onBackdropClick"
    >
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable px-2">
        <div class="modal-content shadow" @click.stop>
          <div class="modal-header border-0 pb-0">
            <h2 id="feature-announcement-title" class="modal-title h5 fw-semibold">
              <slot name="title">Novità</slot>
            </h2>
            <button
              type="button"
              class="btn-close"
              aria-label="Chiudi"
              @click="dismiss"
            />
          </div>
          <div class="modal-body pt-2 small text-start">
            <slot />
          </div>
          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-primary w-100" @click="dismiss">
              OK, ho capito
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.feature-announcement-modal {
  z-index: 1060;
}
</style>
