import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    fileParallelism: false,
    // Integration cases create temporary databases and exercise several writes.
    testTimeout: 15_000,
    hookTimeout: 60_000,
    globalSetup: ['./vitest.teardown.ts'],
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
  },
})
