import type { Server, Socket } from 'socket.io';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '../../shared/src/index';
import type { RoomManager } from './game/RoomManager';
import type { Room } from './game/Room';
import { isValidToken, normalizeRoomCode } from './game/util';

interface SocketData {
  code?: string;
  pid?: string;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const reply = (ack: unknown, res: { ok: true; [k: string]: unknown } | { ok: false; error: string }) => {
  if (typeof ack === 'function') (ack as Ack<Record<string, unknown>>)(res as never);
};

/** Branche les événements temps réel sur la logique des salons. */
export function registerSocketHandlers(io: GameServer, rooms: RoomManager): void {
  io.on('connection', (socket: GameSocket) => {
    /** Salon courant de ce socket, si le joueur y est toujours rattaché. */
    const current = (): { room: Room; pid: string } | null => {
      const { code, pid } = socket.data;
      if (!code || !pid) return null;
      const room = rooms.get(code);
      if (!room || room.pidOfSocket(socket.id) !== pid) return null;
      return { room, pid };
    };

    const detach = (voluntary: boolean) => {
      const ctx = current();
      if (ctx) {
        if (voluntary) ctx.room.leave(ctx.pid);
        else ctx.room.disconnect(socket.id);
      }
      socket.data.code = undefined;
      socket.data.pid = undefined;
    };

    const attach = (room: Room, p: { token: string; name: unknown; avatar: unknown; spectator?: boolean }, ack: unknown) => {
      const res = room.join({ ...p, socketId: socket.id });
      if (!res.ok) return reply(ack, res);
      socket.data.code = room.code;
      socket.data.pid = res.pid;
      reply(ack, { ok: true, code: room.code });
      const state = room.viewFor(res.pid);
      if (state) socket.emit('room:state', state);
    };

    socket.on('room:create', (p, ack) => {
      if (!p || !isValidToken(p.token)) return reply(ack, { ok: false, error: 'Requête invalide.' });
      if (rooms.size >= 500) return reply(ack, { ok: false, error: 'Le serveur est plein, réessaie plus tard.' });
      detach(true);
      const room = rooms.create(p.settings);
      attach(room, p, ack);
    });

    socket.on('room:join', (p, ack) => {
      if (!p || !isValidToken(p.token)) return reply(ack, { ok: false, error: 'Requête invalide.' });
      const code = normalizeRoomCode(p.code);
      const room = rooms.get(code);
      if (!room) return reply(ack, { ok: false, error: 'Ce salon n’existe pas (ou plus). Vérifie le code.' });
      if (socket.data.code && socket.data.code !== code) detach(true);
      attach(room, p, ack);
    });

    socket.on('room:leave', (ack) => {
      detach(true);
      reply(ack, { ok: true });
    });

    socket.on('room:settings', (p, ack) => {
      const ctx = current();
      reply(ack, ctx ? ctx.room.updateSettings(ctx.pid, p) : { ok: false, error: 'Salon introuvable.' });
    });

    socket.on('room:role', (p, ack) => {
      const ctx = current();
      reply(ack, ctx ? ctx.room.setRole(ctx.pid, Boolean(p?.spectator)) : { ok: false, error: 'Salon introuvable.' });
    });

    socket.on('room:kick', (p, ack) => {
      const ctx = current();
      reply(ack, ctx ? ctx.room.kick(ctx.pid, String(p?.pid ?? '')) : { ok: false, error: 'Salon introuvable.' });
    });

    socket.on('game:start', (ack) => {
      const ctx = current();
      reply(ack, ctx ? ctx.room.start(ctx.pid) : { ok: false, error: 'Salon introuvable.' });
    });

    socket.on('game:submit', async (p, ack) => {
      const ctx = current();
      if (!ctx) return reply(ack, { ok: false, error: 'Salon introuvable.' });
      try {
        reply(ack, await ctx.room.submit(ctx.pid, p));
      } catch (err) {
        console.error('[game] submit :', err);
        reply(ack, { ok: false, error: 'Erreur du serveur, réessaie.' });
      }
    });

    socket.on('game:edit', (ack) => {
      const ctx = current();
      reply(ack, ctx ? ctx.room.edit(ctx.pid) : { ok: false, error: 'Salon introuvable.' });
    });

    socket.on('game:draft', (p) => {
      const ctx = current();
      if (ctx) ctx.room.draft(ctx.pid, p);
    });

    socket.on('reveal:next', (ack) => {
      const ctx = current();
      reply(ack, ctx ? ctx.room.revealNext(ctx.pid) : { ok: false, error: 'Salon introuvable.' });
    });

    socket.on('reveal:react', (p) => {
      const ctx = current();
      if (ctx) ctx.room.react(ctx.pid, p?.emoji);
    });

    socket.on('game:replay', (ack) => {
      const ctx = current();
      reply(ack, ctx ? ctx.room.replay(ctx.pid) : { ok: false, error: 'Salon introuvable.' });
    });

    socket.on('disconnect', () => detach(false));
  });
}
