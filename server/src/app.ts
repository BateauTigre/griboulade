import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { config, isOriginAllowed } from './config';
import { RoomManager } from './game/RoomManager';
import { normalizeRoomCode } from './game/util';
import { registerSocketHandlers, type GameServer } from './socket';
import type { Store } from './store/types';

export interface App {
  http: HttpServer;
  io: GameServer;
  rooms: RoomManager;
  close(): Promise<void>;
}

/** Dossier du client compilé, s'il est présent (déploiement « tout-en-un »). */
function findClientDist(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [config.clientDist, path.resolve(here, '../../client/dist'), path.resolve(process.cwd(), 'client/dist')];
  return candidates.find((dir) => dir && existsSync(path.join(dir, 'index.html'))) ?? null;
}

/** Le site est servi par ce serveur (mode « tout-en-un ») ou relayé par Vite en développement. */
function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function createApp(store: Store): Promise<App> {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const corsOptions: cors.CorsOptions = {
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
    methods: ['GET', 'POST'],
  };
  app.use(cors(corsOptions));

  const http = createServer(app);
  const io: GameServer = new Server(http, {
    cors: corsOptions,
    // Les WebSocket ne sont pas soumis au CORS du navigateur : on vérifie l'origine dès la poignée de main.
    allowRequest: (req, done) => done(null, isSameOrigin(req.headers.origin, req.headers.host) || isOriginAllowed(req.headers.origin)),
    // Un dessin transite en data URL : on laisse de la marge au-delà de la taille par défaut (1 Mo).
    maxHttpBufferSize: 3_000_000,
    pingInterval: 20_000,
    pingTimeout: 25_000,
  });

  const rooms = new RoomManager(store, (socketId, event, ...args) => {
    io.to(socketId).emit(event, ...args);
  });
  await rooms.restore();
  rooms.startClock();
  registerSocketHandlers(io, rooms);

  // ───────────── API HTTP ─────────────

  app.get('/health', (_req, res) => {
    res.json({ ok: true, store: store.kind, rooms: rooms.size, uptime: Math.round(process.uptime()) });
  });

  app.get('/api/rooms/:code', (req, res) => {
    res.set('Cache-Control', 'no-store').json(rooms.summary(normalizeRoomCode(req.params.code)));
  });

  app.get('/api/drawings/:id', async (req, res) => {
    const id = req.params.id;
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return res.status(400).end();
    try {
      const drawing = await rooms.getDrawing(id);
      if (!drawing) return res.status(404).end();
      res
        .set({
          'Content-Type': drawing.mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        })
        .send(drawing.data);
    } catch (err) {
      console.error('[api] dessin :', (err as Error).message);
      res.status(503).end();
    }
  });

  app.get('/api/games/:id', async (req, res) => {
    const id = req.params.id;
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
    try {
      const game = await store.getGame(id);
      if (!game) return res.status(404).json({ error: 'Partie introuvable (elle a peut-être expiré).' });
      res.set('Cache-Control', 'no-store').json(game);
    } catch (err) {
      console.error('[api] partie :', (err as Error).message);
      res.status(503).json({ error: 'Base de données momentanément indisponible.' });
    }
  });

  // ───────────── Client statique (optionnel) ─────────────

  const clientDist = findClientDist();
  if (clientDist) {
    console.log(`[http] client servi depuis ${clientDist}`);
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.type('text/plain').send('Serveur Griboulade en ligne. Le site du jeu est hébergé séparément.');
    });
  }

  // Ménage périodique : parties expirées et salons abandonnés.
  const purge = () =>
    store
      .purge(config.retentionDays * 24 * 60 * 60_000, 6 * 60 * 60_000)
      .catch((err) => console.warn('[db] purge :', err.message));
  const purgeTimer = setInterval(purge, 6 * 60 * 60_000);
  purgeTimer.unref();
  void purge();

  return {
    http,
    io,
    rooms,
    async close() {
      clearInterval(purgeTimer);
      await rooms.shutdown();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await store.close();
    },
  };
}
