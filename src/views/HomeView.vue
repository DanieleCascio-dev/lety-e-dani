<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="home-main">
    <div
      class="container-fluid px-3 px-sm-4 text-center"
      style="max-width: 28rem"
    >
      <h1 class="h3 fw-semibold mb-3" style="color: black">Lety e Dani</h1>
      <div class="d-grid gap-2">
        <RouterLink
          to="/lista-spesa"
          class="home-nav-btn btn btn-outline-primary btn-lg w-100 py-3"
        >
          Lista della spesa
        </RouterLink>
        <RouterLink
          to="/ristoranti"
          class="home-nav-btn btn btn-outline-primary btn-lg w-100 py-3"
        >
          Ristoranti
        </RouterLink>
        <RouterLink
          to="/todo"
          class="home-nav-btn btn btn-outline-primary btn-lg w-100 py-3"
        >
          Cose da fare
        </RouterLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.home-main {
  padding-top: 2rem;
  padding-bottom: 3rem;
}

.home-nav-btn {
  transition:
    transform 0.1s ease,
    background-color 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease,
    box-shadow 0.12s ease;
  user-select: none;
}

.home-nav-btn:active {
  transform: scale(0.98);
  background-color: var(--bs-primary);
  border-color: var(--bs-primary);
  color: #fff;
}

.home-nav-btn:focus-visible {
  box-shadow: 0 0 0 0.25rem rgba(var(--bs-primary-rgb), 0.45);
}
</style>
