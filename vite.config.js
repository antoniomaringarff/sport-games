import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        backoffice: resolve(import.meta.dirname, 'backoffice/index.html'),
      },
    },
  },
  server: { port: 5173 },
});
