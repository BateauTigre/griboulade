import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
/** En développement, le serveur de jeu tourne sur ce port (voir server/.env.example). */
const DEV_SERVER = process.env.DEV_SERVER_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(root, '../shared/src/index.ts'),
      '@': path.resolve(root, 'src'),
    },
  },
  server: {
    port: 5173,
    // Accessible depuis le réseau local : pratique pour tester sur téléphone et tablette.
    host: true,
    // Sans VITE_SERVER_URL, le client parle à sa propre origine et Vite relaie vers le serveur de jeu.
    proxy: {
      '/socket.io': { target: DEV_SERVER, ws: true },
      '/api': DEV_SERVER,
      '/health': DEV_SERVER,
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
