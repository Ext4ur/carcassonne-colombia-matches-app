import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  root: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@repositories': path.resolve(__dirname, './src/renderer/repositories'),
      '@services': path.resolve(__dirname, './src/renderer/services'),
      '@components': path.resolve(__dirname, './src/renderer/components'),
      '@types': path.resolve(__dirname, './src/renderer/types'),
      '@constants': path.resolve(__dirname, './src/renderer/constants'),
      '@api': path.resolve(__dirname, './src/renderer/api'),
      '@utils': path.resolve(__dirname, './src/renderer/utils'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist/renderer',
  },
  test: {
    include: ['src/renderer/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: true,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/renderer'),
        '@repositories': path.resolve(__dirname, './src/renderer/repositories'),
        '@services': path.resolve(__dirname, './src/renderer/services'),
        '@components': path.resolve(__dirname, './src/renderer/components'),
        '@types': path.resolve(__dirname, './src/renderer/types'),
        '@constants': path.resolve(__dirname, './src/renderer/constants'),
        '@api': path.resolve(__dirname, './src/renderer/api'),
        '@utils': path.resolve(__dirname, './src/renderer/utils'),
      },
    },
  },
});

