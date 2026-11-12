import type { GameRecord, GameSettings, RoomSummary } from '../../../shared/src/index';
import type { Store, StoredDrawing } from '../store/types';
import { Room, type RoomDeps, type RoomSnapshot } from './Room';
import { generateRoomCode } from './util';

const PERSIST_DEBOUNCE_MS = 400;
const DRAWING_CACHE_SIZE = 400;
/** Durée de vie d'un salon sans aucun membre connecté. */
const EMPTY_TTL_MS = { lobby: 10 * 60_000, playing: 60 * 60_000, end: 30 * 60_000 };
/** Au redémarrage, on ne restaure pas les salons plus anciens que ça. */
const RESTORE_MAX_AGE_MS = 3 * 60 * 60_000;

export type Sender = RoomDeps['send'];

/** Registre des salons actifs : création, restauration, horloge, persistance et nettoyage. */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private persistTimers = new Map<string, NodeJS.Timeout>();
  /** Petit cache LRU : les dessins de la partie en cours sont servis sans toucher la base. */
  private drawingCache = new Map<string, StoredDrawing>();
  private ticker: NodeJS.Timeout | null = null;
  private deps: RoomDeps;

  constructor(
    private store: Store,
    send: Sender,
  ) {
    this.deps = {
      send,
      now: () => Date.now(),
      saveDrawing: async (id, roomCode, mime, data) => {
        // Le dessin est d'abord gardé en mémoire : si la base tombe en pleine partie, le jeu continue
        // (le dessin reste servi depuis le cache, seule sa conservation à long terme est perdue).
        this.cacheDrawing(id, { mime, data });
        try {
          await this.store.saveDrawing(id, roomCode, { mime, data });
        } catch (err) {
          console.error('[db] sauvegarde dessin :', (err as Error).message);
        }
      },
      deleteDrawing: (id) => {
        this.drawingCache.delete(id);
        this.store.deleteDrawing(id).catch((err) => console.warn('[db] suppression dessin :', err.message));
      },
      saveGame: (record: GameRecord) => {
        this.store.saveGame(record).catch((err) => console.error('[db] sauvegarde partie :', err.message));
      },
      changed: (room) => this.schedulePersist(room),
    };
  }

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  summary(code: string): RoomSummary {
    const room = this.rooms.get(code);
    if (!room) return { exists: false };
    return {
      exists: true,
      phase: room.phase,
      players: room.playerCount,
      maxPlayers: room.settings.maxPlayers,
      allowSpectators: room.settings.allowSpectators,
    };
  }

  create(settings?: Partial<GameSettings>): Room {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    const room = new Room(code, this.deps, settings);
    this.rooms.set(code, room);
    return room;
  }

  /** Recharge les salons enregistrés (après un redémarrage ou une mise en veille de l'hébergeur). */
  async restore(): Promise<void> {
    const stored = await this.store.loadRooms();
    const now = Date.now();
    for (const entry of stored) {
      const snapshot = entry.data as RoomSnapshot;
      if (now - entry.updatedAt > RESTORE_MAX_AGE_MS || snapshot?.v !== 1 || !snapshot.code) {
        await this.store.deleteRoom(entry.code).catch(() => {});
        continue;
      }
      try {
        this.rooms.set(snapshot.code, Room.restore(snapshot, this.deps));
      } catch (err) {
        console.warn(`[rooms] salon ${entry.code} illisible, ignoré :`, (err as Error).message);
      }
    }
    if (this.rooms.size) console.log(`[rooms] ${this.rooms.size} salon(s) restauré(s).`);
  }

  startClock(): void {
    this.ticker ??= setInterval(() => this.tick(), 1000);
  }

  private tick(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      room.tick(now);
      const ttl =
        room.phase === 'lobby' ? EMPTY_TTL_MS.lobby : room.phase === 'end' ? EMPTY_TTL_MS.end : EMPTY_TTL_MS.playing;
      if (room.isEmpty || (room.connectedCount === 0 && now - room.lastConnectedAt > ttl)) this.remove(room.code);
    }
  }

  private remove(code: string): void {
    this.rooms.delete(code);
    const timer = this.persistTimers.get(code);
    if (timer) clearTimeout(timer);
    this.persistTimers.delete(code);
    this.store.deleteRoom(code).catch((err) => console.warn('[db] suppression salon :', err.message));
  }

  private schedulePersist(room: Room): void {
    if (this.persistTimers.has(room.code)) return;
    this.persistTimers.set(
      room.code,
      setTimeout(() => {
        this.persistTimers.delete(room.code);
        if (!this.rooms.has(room.code) || room.isEmpty) return;
        this.store.saveRoom(room.code, room.snapshot()).catch((err) => console.error('[db] sauvegarde salon :', err.message));
      }, PERSIST_DEBOUNCE_MS),
    );
  }

  private cacheDrawing(id: string, drawing: StoredDrawing): void {
    this.drawingCache.delete(id);
    this.drawingCache.set(id, drawing);
    while (this.drawingCache.size > DRAWING_CACHE_SIZE) {
      this.drawingCache.delete(this.drawingCache.keys().next().value as string);
    }
  }

  async getDrawing(id: string): Promise<StoredDrawing | null> {
    const cached = this.drawingCache.get(id);
    if (cached) return cached;
    const stored = await this.store.getDrawing(id);
    if (stored) this.cacheDrawing(id, stored);
    return stored;
  }

  /** Arrêt propre : on écrit tout de suite les salons en attente de sauvegarde. */
  async shutdown(): Promise<void> {
    if (this.ticker) clearInterval(this.ticker);
    for (const timer of this.persistTimers.values()) clearTimeout(timer);
    this.persistTimers.clear();
    await Promise.allSettled(
      [...this.rooms.values()].filter((r) => !r.isEmpty).map((r) => this.store.saveRoom(r.code, r.snapshot())),
    );
  }
}
