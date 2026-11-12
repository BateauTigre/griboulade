import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type {
  ClientToServerEvents,
  GameSettings,
  NoticeEvent,
  ReactionEvent,
  RoomState,
  ServerToClientEvents,
  SubmitPayload,
} from '@shared';
import { SERVER_URL, apiUrl } from './config';
import { getProfile, rememberGame, setLastRoom } from './storage';

export type Reply<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export interface Toast {
  id: number;
  kind: NoticeEvent['kind'] | 'error' | 'success';
  text: string;
}

export interface FloatingReaction extends ReactionEvent {
  /** Position horizontale (en %) tirée au hasard. */
  x: number;
}

interface GameStore {
  status: ConnectionStatus;
  /** La première connexion dure anormalement longtemps (serveur gratuit en train de se réveiller). */
  waking: boolean;
  room: RoomState | null;
  /** Décalage entre l'horloge du serveur et celle de ce navigateur (ms). */
  clockOffset: number;
  /** Salon auquel on est rattaché : sert à le rejoindre automatiquement après une coupure. */
  sessionCode: string | null;
  closed: null | 'kicked' | 'replaced' | 'closed' | 'lost';
  toasts: Toast[];
  reactions: FloatingReaction[];
}

export const useGame = create<GameStore>(() => ({
  status: 'idle',
  waking: false,
  room: null,
  clockOffset: 0,
  sessionCode: null,
  closed: null,
  toasts: [],
  reactions: [],
}));

const set = useGame.setState;
const get = useGame.getState;

// ───────────────────────────── Connexion ─────────────────────────────

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL || window.location.origin, {
  autoConnect: false,
  // WebSocket d'abord ; repli automatique sur le « long polling » si un pare-feu le bloque.
  transports: ['websocket', 'polling'],
  tryAllTransports: true,
  reconnection: true,
  reconnectionDelay: 600,
  reconnectionDelayMax: 5000,
  timeout: 20_000,
});

let wakeTimer: number | undefined;

function ensureConnecting(): void {
  if (socket.connected || socket.active) return;
  set({ status: 'connecting' });
  window.clearTimeout(wakeTimer);
  wakeTimer = window.setTimeout(() => {
    if (!socket.connected) set({ waking: true });
  }, 4000);
  socket.connect();
}

/** Attend la connexion (jusqu'à 90 s : un hébergement gratuit peut mettre une minute à se réveiller). */
function whenConnected(timeoutMs = 90_000): Promise<boolean> {
  if (socket.connected) return Promise.resolve(true);
  ensureConnecting();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      socket.off('connect', onConnect);
      resolve(false);
    }, timeoutMs);
    const onConnect = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    socket.once('connect', onConnect);
  });
}

/** Événements qui attendent une réponse du serveur. */
type AckEvents = Exclude<keyof ClientToServerEvents, 'game:draft' | 'reveal:react'>;

/** Envoie une requête au serveur et attend sa réponse (avec délai de garde). */
async function request<T = unknown>(event: AckEvents, payload?: unknown): Promise<Reply<T>> {
  if (!(await whenConnected())) return { ok: false, error: 'Serveur injoignable. Vérifie ta connexion et réessaie.' };
  try {
    const emitter = socket.timeout(12_000) as unknown as { emitWithAck: (...args: unknown[]) => Promise<Reply<T>> };
    return payload === undefined ? await emitter.emitWithAck(event) : await emitter.emitWithAck(event, payload);
  } catch {
    return { ok: false, error: 'Le serveur ne répond pas. Réessaie dans un instant.' };
  }
}

// ───────────────────────────── Notifications ─────────────────────────────

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastId;
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
  window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3800);
}

/** Affiche l'erreur éventuelle d'une réponse et renvoie `true` si tout s'est bien passé. */
export function succeeded(res: Reply): boolean {
  if (!res.ok) toast(res.error, 'error');
  return res.ok;
}

// ───────────────────────────── Événements du serveur ─────────────────────────────

socket.on('connect', () => {
  window.clearTimeout(wakeTimer);
  set({ status: 'connected', waking: false });
  // Reconnexion : on reprend automatiquement sa place dans le salon.
  const code = get().sessionCode;
  if (code) void rejoin(code);
});

socket.on('disconnect', (reason) => {
  if (reason === 'io client disconnect') set({ status: 'idle' });
  else set({ status: 'reconnecting' });
});

socket.on('connect_error', () => {
  if (get().status !== 'connecting') set({ status: 'reconnecting' });
});

socket.on('room:state', (room) => {
  set({ room, clockOffset: room.serverNow - Date.now() });
  if (room.result) rememberGame(room.result);
});

socket.on('room:closed', (reason) => {
  set({ room: null, sessionCode: null, closed: reason });
  socket.disconnect();
});

socket.on('room:notice', (notice) => toast(notice.text, notice.kind));

socket.on('reveal:reaction', (reaction) => {
  const item: FloatingReaction = { ...reaction, x: 8 + Math.random() * 84 };
  set((s) => ({ reactions: [...s.reactions.slice(-40), item] }));
  window.setTimeout(() => set((s) => ({ reactions: s.reactions.filter((r) => r.id !== item.id) })), 2700);
});

// Revenir sur l'onglet (téléphone déverrouillé, etc.) relance la connexion sans attendre.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && get().sessionCode && !socket.connected) socket.connect();
});

// Tant qu'on est dans un salon, un petit signal régulier évite la mise en veille du serveur gratuit.
window.setInterval(() => {
  if (get().sessionCode && document.visibilityState === 'visible') {
    fetch(apiUrl('/health'), { cache: 'no-store' }).catch(() => {});
  }
}, 4 * 60_000);

async function rejoin(code: string): Promise<void> {
  const res = await joinRoom(code);
  if (!res.ok && get().sessionCode === code) {
    set({ room: null, sessionCode: null, closed: 'lost' });
    socket.disconnect();
  }
}

// ───────────────────────────── Actions ─────────────────────────────

export async function createRoom(settings?: Partial<GameSettings>): Promise<Reply<{ code: string }>> {
  const { token, name, avatar } = getProfile();
  set({ closed: null });
  const res = await request<{ code: string }>('room:create', { token, name, avatar, settings });
  if (res.ok) {
    set({ sessionCode: res.code });
    setLastRoom(res.code);
  }
  return res;
}

export async function joinRoom(code: string, spectator = false): Promise<Reply<{ code: string }>> {
  const { token, name, avatar } = getProfile();
  set({ closed: null });
  const res = await request<{ code: string }>('room:join', { code, token, name, avatar, spectator });
  if (res.ok) {
    set({ sessionCode: res.code });
    setLastRoom(res.code);
  }
  return res;
}

export async function leaveRoom(): Promise<void> {
  if (socket.connected) {
    await Promise.race([request('room:leave'), new Promise((r) => window.setTimeout(r, 1500))]);
  }
  set({ room: null, sessionCode: null, closed: null, reactions: [] });
  setLastRoom('');
  socket.disconnect();
}

export const updateSettings = (patch: Partial<GameSettings>) => request('room:settings', patch);
export const setSpectator = (spectator: boolean) => request('room:role', { spectator });
export const kickPlayer = (pid: string) => request('room:kick', { pid });
export const startGame = () => request('game:start');
export const submitStep = (payload: SubmitPayload) => request('game:submit', payload);
export const editStep = () => request('game:edit');
export const revealNext = () => request('reveal:next');
export const replayGame = () => request('game:replay');

export function sendDraft(payload: SubmitPayload): void {
  if (socket.connected) socket.emit('game:draft', payload);
}

export function sendReaction(emoji: string): void {
  if (socket.connected) socket.emit('reveal:react', { emoji });
}
