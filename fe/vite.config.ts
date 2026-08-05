/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: 'src/config',
  build: {
    outDir: 'dist_next',
  },
  test: {
    // 점프 로직은 순수 함수라 DOM 불필요 → node 환경으로 가볍게.
    environment: 'node',
    include: ['test/**/*.{test,spec}.ts'],
  },
})
