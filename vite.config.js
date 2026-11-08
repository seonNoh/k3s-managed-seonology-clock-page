import protectedAssets from './build/protected-assets.mjs';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read version from VERSION file
const version = readFileSync(resolve(__dirname, 'VERSION'), 'utf-8').trim()

// https://vite.dev/config/
export default defineConfig({
  plugins: [protectedAssets('src/api/forwardAuth.js'), react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version)
  }
})
