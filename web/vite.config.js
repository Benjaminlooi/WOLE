import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import tailwindcss from "@tailwindcss/vite"

// Output directly into the Android assets folder so the app can serve it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: './',
  build: {
    outDir: path.resolve(__dirname, '../android/app/src/main/assets/web'),
    emptyOutDir: true,
  },
})

