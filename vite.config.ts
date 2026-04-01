import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseBase = env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const edgeProxy = supabaseBase
    ? {
        '/__supabase_functions': {
          target: supabaseBase,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/__supabase_functions/, '/functions/v1'),
        },
      }
    : undefined

  return {
    plugins: [
      vue(),
      vueDevTools(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        includeAssets: [
          'favicon.ico',
          'favicon_flowerCat.ico',
          'sunflower.jpg',
          'android_192.png',
          'android_512.png',
        ],
        manifest: {
          name: 'Lety e Dani',
          short_name: 'Lety e Dani',
          description:
            'Lista spesa, todo, wishlist e altro per Lety e Dani.',
          lang: 'it',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#0d6efd',
          orientation: 'portrait-primary',
          icons: [
            {
              src: '/android_192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/android_512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/android_192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/android_512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/__supabase_functions/],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // In dev, le Edge Functions passano da qui → stesso origin di localhost, niente CORS sul preflight.
    server: edgeProxy ? { proxy: edgeProxy } : {},
    preview: edgeProxy ? { proxy: edgeProxy } : {},
  }
})
