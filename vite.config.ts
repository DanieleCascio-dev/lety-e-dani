import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
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
