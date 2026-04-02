<script setup lang="ts">
import { RouterLink } from "vue-router";
import NavCartIcon from "@/components/icons/NavCartIcon.vue";
import NavHeartIcon from "@/components/icons/NavHeartIcon.vue";
import NavRestaurantIcon from "@/components/icons/NavRestaurantIcon.vue";
import NavTodoIcon from "@/components/icons/NavTodoIcon.vue";
</script>

<template>
  <main class="home-main">
    <div
      class="container-fluid px-3 px-sm-4 text-center"
      style="max-width: 28rem"
    >
      <div class="home-hero mb-3 mb-sm-4">
        <p class="text-secondary small mb-2 mb-sm-3 lh-sm px-1 home-welcome">
          Benvenut* nel nostro magico spazio!
        </p>
        <h1 class="h5 fw-semibold mb-0 text-body home-title">Lety e Dani</h1>
      </div>
      <ul class="list-unstyled d-grid gap-2 mb-0">
        <li>
          <RouterLink
            to="/lista-spesa"
            class="home-tile d-flex align-items-center gap-3 text-decoration-none text-body rounded-3 border bg-white px-3 py-3"
            aria-label="Lista della spesa"
          >
            <span class="home-tile-icon text-primary" aria-hidden="true">
              <NavCartIcon />
            </span>
            <span class="d-flex flex-column min-w-0 text-start flex-grow-1">
              <span class="fw-semibold">Spesa</span>
              <span class="small text-secondary d-none d-sm-inline"
                >Articoli da comprare</span
              >
            </span>
          </RouterLink>
        </li>
        <li>
          <RouterLink
            to="/lista-desideri"
            class="home-tile d-flex align-items-center gap-3 text-decoration-none text-body rounded-3 border bg-white px-3 py-3"
            aria-label="Lista dei desideri"
          >
            <span class="home-tile-icon text-primary" aria-hidden="true">
              <NavHeartIcon />
            </span>
            <span class="d-flex flex-column min-w-0 text-start flex-grow-1">
              <span class="fw-semibold">Desideri</span>
              <span class="small text-secondary d-none d-sm-inline"
                >Link e anteprime prodotti</span
              >
            </span>
          </RouterLink>
        </li>
        <li>
          <RouterLink
            to="/ristoranti"
            class="home-tile d-flex align-items-center gap-3 text-decoration-none text-body rounded-3 border bg-white px-3 py-3"
            aria-label="Ristoranti"
          >
            <span class="home-tile-icon text-primary" aria-hidden="true">
              <NavRestaurantIcon />
            </span>
            <span class="d-flex flex-column min-w-0 text-start flex-grow-1">
              <span class="fw-semibold">Locali</span>
              <span class="small text-secondary d-none d-sm-inline"
                >Mappa e preferiti</span
              >
            </span>
          </RouterLink>
        </li>
        <li>
          <RouterLink
            to="/todo"
            class="home-tile d-flex align-items-center gap-3 text-decoration-none text-body rounded-3 border bg-white px-3 py-3"
            aria-label="Cose da fare"
          >
            <span class="home-tile-icon text-primary" aria-hidden="true">
              <NavTodoIcon />
            </span>
            <span class="d-flex flex-column min-w-0 text-start flex-grow-1">
              <span class="fw-semibold">Todo</span>
              <span class="small text-secondary d-none d-sm-inline"
                >Attività e liste</span
              >
            </span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </main>
</template>

<style scoped>
.home-main {
  padding-top: 1.25rem;
  padding-bottom: 3rem;
}

.home-tile {
  min-height: 3.25rem;
  transition:
    transform 0.1s ease,
    box-shadow 0.12s ease,
    border-color 0.12s ease;
  user-select: none;
  border-color: rgba(0, 0, 0, 0.08) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.home-tile:hover {
  border-color: rgba(var(--bs-primary-rgb), 0.35) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.home-tile:active {
  transform: scale(0.99);
}

.home-tile:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(var(--bs-primary-rgb), 0.35);
}

.home-tile-icon {
  display: flex;
  flex-shrink: 0;
  line-height: 0;
}
</style>
