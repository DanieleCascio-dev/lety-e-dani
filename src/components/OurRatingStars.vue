<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: number
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

function setRating(n: number) {
  if (props.disabled) return
  emit('update:modelValue', Math.min(5, Math.max(1, Math.round(n))))
}
</script>

<template>
  <div
    class="our-rating-stars d-inline-flex flex-wrap align-items-center"
    role="group"
    :aria-label="`Valutazione ${modelValue} su 5 stelle`"
  >
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      class="btn btn-link p-0 border-0 our-rating-star lh-1"
      :class="[
        n <= modelValue ? 'text-warning' : 'text-secondary our-rating-star--empty',
      ]"
      :disabled="disabled"
      :aria-label="`Imposta ${n} stelle su 5`"
      @click="setRating(n)"
    >
      <span aria-hidden="true">★</span>
    </button>
  </div>
</template>

<style scoped>
.our-rating-star {
  font-size: 1.15rem;
  min-width: 1.35rem;
  text-decoration: none;
}
.our-rating-star--empty {
  opacity: 0.42;
}
.our-rating-star:hover:not(:disabled) {
  transform: scale(1.08);
}
.our-rating-star:disabled {
  opacity: 0.6;
  pointer-events: none;
}
</style>
