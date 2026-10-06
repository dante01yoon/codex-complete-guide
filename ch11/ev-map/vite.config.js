import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./web', import.meta.url));
const compact = fileURLToPath(new URL('./data/dashboard.json', import.meta.url));

export default defineConfig({
  root,
  envDir: root,
  publicDir: false,
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    fs: { strict: true, allow: [root, fileURLToPath(new URL('./node_modules', import.meta.url))] },
  },
  plugins: [{
    name: 'local-dashboard-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/data/dashboard.json') return next();
        try {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(readFileSync(compact));
        } catch {
          res.statusCode = 503;
          res.end('{"error":"data unavailable"}');
        }
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'data/dashboard.json', source: readFileSync(compact) });
    },
  }],
});
