import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isSitesSingleFileBuild = process.env.SITES_SINGLE_FILE === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: isSitesSingleFileBuild
    ? {
        cssCodeSplit: false,
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      }
    : undefined,
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
