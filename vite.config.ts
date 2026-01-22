import { defineConfig } from 'vite';
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
      '@hooks': path.resolve(__dirname, './src/renderer/hooks'),
      '@components': path.resolve(__dirname, './src/renderer/components'),
      '@types': path.resolve(__dirname, './src/renderer/types'),
      '@constants': path.resolve(__dirname, './src/renderer/constants'),
      '@config': path.resolve(__dirname, './src/renderer/config'),
      '@api': path.resolve(__dirname, './src/renderer/api'),
      '@auth': path.resolve(__dirname, './src/renderer/auth'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist/renderer',
  },
});

