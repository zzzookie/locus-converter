import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Сборка фронтенда (React + Material UI + styled-components).
 * Корень — папка web/, результат — в static/, откуда его раздаёт сервер.
 * Пути считаются от текущей рабочей директории (запуск из корня проекта),
 * чтобы конфиг не зависел от import.meta/__dirname и корректно проверялся типами.
 */
export default defineConfig({
  root: 'web',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve('web/src'),
      '@core': path.resolve('src/types'),
    },
  },
  build: {
    outDir: '../static',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
  },
});

