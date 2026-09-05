import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code !== 'EMPTY_BUNDLE') warn(warning)
        }
      }
    }
  },
  renderer: { plugins: [react()] }
})
