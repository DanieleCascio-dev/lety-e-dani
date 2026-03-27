import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { authSession } from '@/auth/authSession'
import { getSupabaseClient } from '@/lib/supabase'
import { appUserSessionValid, authInitPromise } from '@/composables/useAppStorage'
import {
  isMainNavRouteName,
  readSavedMainNavRoute,
  writeSavedMainNavRoute,
  type SavedMainNavRoute,
} from '@/navigation/lastNavRoute'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/lista-spesa',
      name: 'shopping',
      component: () => import('../views/ShoppingListView.vue'),
    },
    {
      path: '/lista-desideri',
      name: 'wishlist',
      component: () => import('../views/WishListView.vue'),
    },
    {
      path: '/todo',
      name: 'todos',
      component: () => import('../views/TodoListView.vue'),
    },
    {
      path: '/ristoranti',
      name: 'restaurants',
      component: () => import('../views/RestaurantsView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/profilo',
      name: 'profile',
      component: () => import('../views/ProfileView.vue'),
    },
  ],
})

/** Ripristino ultima scheda: una sola volta per caricamento, solo se si atterra sulla home `/`. */
let hasAppliedStoredMainNav = false

function tryRestoreMainNav(toName: unknown): { name: SavedMainNavRoute; replace: true } | true {
  if (!hasAppliedStoredMainNav && toName === 'home') {
    hasAppliedStoredMainNav = true
    const saved = readSavedMainNavRoute()
    if (saved && saved !== 'home') return { name: saved, replace: true }
    return true
  }
  if (!hasAppliedStoredMainNav && isMainNavRouteName(toName)) {
    hasAppliedStoredMainNav = true
  }
  return true
}

router.beforeEach(async (to) => {
  await authInitPromise
  const sb = getSupabaseClient()
  if (!sb) {
    const r = tryRestoreMainNav(to.name)
    return r === true ? true : r
  }

  /** Non chiamare getSession() qui: ogni navigazione competeva col lock GoTrue e con Realtime. */
  const authed = !!(authSession.value?.user && appUserSessionValid.value)

  if (to.meta.public) {
    if (to.name === 'login' && authed) return { name: 'home' }
    return true
  }
  if (!authed) return { name: 'login', query: { redirect: to.fullPath } }

  const r = tryRestoreMainNav(to.name)
  return r === true ? true : r
})

router.afterEach((to) => {
  if (isMainNavRouteName(to.name)) {
    writeSavedMainNavRoute(to.name)
  }
})

export default router
