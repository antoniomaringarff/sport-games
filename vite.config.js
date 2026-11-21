import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Con `npm run dev` (Vite solo) no corren las funciones de /api: sin esto Vite serviría su código
 * fuente o un 404. Récords y jugador responden "sin contenido" y el backoffice avisa qué falta.
 * Con `vercel dev` las funciones atienden /api antes de llegar acá.
 */
const apiOffline = {
  name: 'api-offline',
  configureServer(server) {
    server.middlewares.use('/api', (req, res) => {
      if (req.url.startsWith('/backoffice')) {
        res.statusCode = 503;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'Sin servidor: corré `vercel dev` para usar el backoffice.' }));
        return;
      }
      res.statusCode = 204;
      res.end();
    });
  },
};

export default defineConfig({
  plugins: [apiOffline],
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
