import type { GameRecord } from '../../../shared/src/index';

export interface StoredDrawing {
  mime: string;
  data: Buffer;
}

export interface StoredRoom {
  code: string;
  data: unknown;
  updatedAt: number;
}

/**
 * Couche de persistance. Deux implémentations :
 *  - MemoryStore   : aucune dépendance, idéal en développement (données perdues au redémarrage) ;
 *  - PostgresStore : n'importe quel PostgreSQL (Neon, Supabase, Aiven, local…).
 * Les dessins sont stockés en base (bytea) : rien n'est écrit sur le disque du serveur.
 */
export interface Store {
  readonly kind: 'memory' | 'postgres';
  init(): Promise<void>;

  saveRoom(code: string, data: unknown): Promise<void>;
  deleteRoom(code: string): Promise<void>;
  loadRooms(): Promise<StoredRoom[]>;

  saveDrawing(id: string, roomCode: string, drawing: StoredDrawing): Promise<void>;
  getDrawing(id: string): Promise<StoredDrawing | null>;
  deleteDrawing(id: string): Promise<void>;

  saveGame(game: GameRecord): Promise<void>;
  getGame(id: string): Promise<GameRecord | null>;

  /** Supprime les parties/dessins plus vieux que `retentionMs` et les salons abandonnés. */
  purge(retentionMs: number, staleRoomMs: number): Promise<void>;
  close(): Promise<void>;
}
