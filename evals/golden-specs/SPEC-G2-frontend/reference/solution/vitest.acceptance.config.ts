import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // ONLY the acceptance holdout. NOTE: config `exclude` blocks even an explicitly
    // named dir, so the acceptance dir must not be excluded here (that is exactly why
    // this is a separate config from vitest.config.ts).
    include: ['tests/acceptance/**/*.{test,spec}.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    env: { NEXT_PUBLIC_API_URL: 'http://localhost:8000' },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
