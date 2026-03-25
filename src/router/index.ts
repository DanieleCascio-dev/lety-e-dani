import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

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
  ],
})

export default router
