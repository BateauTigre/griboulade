import type { GameRecord } from '../../../shared/src/index';
import type { Store, StoredDrawing, StoredRoom } from './types';

const MAX_DRAWINGS = 1500;
const MAX_GAMES = 300;

/** Stockage en mémoire vive, borné pour tenir sur une petite instance gratuite. */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private rooms = new Map<string, StoredRoom>();
  private drawings = new Map<string, StoredDrawing & { at: number }>();
  private games = new Map<string, { game: GameRecord; at: number }>();

  async init(): Promise<void> {}

  async saveRoom(code: string, data: unknown): Promise<void> {
    // Copie profonde : un instantané ne doit pas suivre les mutations du salon vivant.
    this.rooms.set(code, { code, data: structuredClone(data), updatedAt: Date.now() });
  }

  async deleteRoom(code: string): Promise<void> {
    this.rooms.delete(code);
  }

  async loadRooms(): Promise<StoredRoom[]> {
    return [...this.rooms.values()].map((r) => ({ ...r, data: structuredClone(r.data) }));
  }

  async saveDrawing(id: string, _roomCode: string, drawing: StoredDrawing): Promise<void> {
    this.drawings.set(id, { ...drawing, at: Date.now() });
    while (this.drawings.size > MAX_DRAWINGS) {
      this.drawings.delete(this.drawings.keys().next().value as string);
    }
  }

  async getDrawing(id: string): Promise<StoredDrawing | null> {
    return this.drawings.get(id) ?? null;
  }

  async deleteDrawing(id: string): Promise<void> {
    this.drawings.delete(id);
  }

  async saveGame(game: GameRecord): Promise<void> {
    this.games.delete(game.id);
    this.games.set(game.id, { game: structuredClone(game), at: Date.now() });
    while (this.games.size > MAX_GAMES) {
      this.games.delete(this.games.keys().next().value as string);
    }
  }

  async getGame(id: string): Promise<GameRecord | null> {
    return this.games.get(id)?.game ?? null;
  }

  async purge(retentionMs: number, staleRoomMs: number): Promise<void> {
    const now = Date.now();
    for (const [id, g] of this.games) if (now - g.at > retentionMs) this.games.delete(id);
    for (const [id, d] of this.drawings) if (now - d.at > retentionMs) this.drawings.delete(id);
    for (const [code, r] of this.rooms) if (now - r.updatedAt > staleRoomMs) this.rooms.delete(code);
  }

  async close(): Promise<void> {}
}
