<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="home-main">
    <div class="container-fluid px-3 px-sm-4 text-center" style="max-width: 28rem">
      <h1 class="h3 fw-semibold mb-3">Lety e Dani</h1>
      <p class="text-secondary mb-4">Piccolo spazio condiviso: scegli chi sta usando il sito in alto, poi apri la lista.</p>
      <RouterLink to="/lista-spesa" class="btn btn-primary btn-lg w-100 py-3"> Lista della spesa </RouterLink>
    </div>
  </main>
</template>

<style scoped>
.home-main {
  padding-top: 2rem;
  padding-bottom: 3rem;
}
</style>
