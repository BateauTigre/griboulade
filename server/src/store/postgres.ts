import type { Pool, PoolConfig } from 'pg';
import pg from 'pg';
import type { GameRecord } from '../../../shared/src/index';
import type { Store, StoredDrawing, StoredRoom } from './types';

const SCHEMA = `
create table if not exists rooms (
  code text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists drawings (
  id text primary key,
  room_code text not null,
  mime text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create table if not exists games (
  id text primary key,
  code text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists drawings_created_idx on drawings (created_at);
create index if not exists games_created_idx on games (created_at);
`;

export interface PostgresOptions {
  connectionString: string;
  ssl: 'require' | 'verify' | 'disable';
}

/** Persistance PostgreSQL : salons en cours, dessins (bytea) et parties terminées. */
export class PostgresStore implements Store {
  readonly kind = 'postgres' as const;
  private pool: Pool;

  constructor(options: PostgresOptions | { pool: Pool }) {
    if ('pool' in options) {
      this.pool = options.pool;
      return;
    }
    // Le mode SSL est piloté par DATABASE_SSL : on retire `sslmode` de l'URL pour éviter les conflits.
    const url = new URL(options.connectionString);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('channel_binding');
    const cfg: PoolConfig = {
      connectionString: url.toString(),
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    };
    if (options.ssl !== 'disable' && !isLocal) {
      cfg.ssl = { rejectUnauthorized: options.ssl === 'verify' };
    }
    this.pool = new pg.Pool(cfg);
    // Les bases « serverless » ferment les connexions inactives : ce n'est pas une erreur fatale.
    this.pool.on('error', (err) => console.warn('[db] connexion inactive fermée :', err.message));
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  async saveRoom(code: string, data: unknown): Promise<void> {
    await this.pool.query(
      `insert into rooms (code, data, updated_at) values ($1, $2::jsonb, now())
       on conflict (code) do update set data = excluded.data, updated_at = now()`,
      [code, JSON.stringify(data)],
    );
  }

  async deleteRoom(code: string): Promise<void> {
    await this.pool.query('delete from rooms where code = $1', [code]);
  }

  async loadRooms(): Promise<StoredRoom[]> {
    const res = await this.pool.query('select code, data, updated_at from rooms');
    return res.rows.map((r) => ({
      code: r.code as string,
      data: r.data as unknown,
      updatedAt: new Date(r.updated_at).getTime(),
    }));
  }

  async saveDrawing(id: string, roomCode: string, drawing: StoredDrawing): Promise<void> {
    await this.pool.query(
      `insert into drawings (id, room_code, mime, data) values ($1, $2, $3, $4)
       on conflict (id) do nothing`,
      [id, roomCode, drawing.mime, drawing.data],
    );
  }

  async getDrawing(id: string): Promise<StoredDrawing | null> {
    const res = await this.pool.query('select mime, data from drawings where id = $1', [id]);
    const row = res.rows[0];
    return row ? { mime: row.mime as string, data: row.data as Buffer } : null;
  }

  async deleteDrawing(id: string): Promise<void> {
    await this.pool.query('delete from drawings where id = $1', [id]);
  }

  async saveGame(game: GameRecord): Promise<void> {
    await this.pool.query(
      `insert into games (id, code, data) values ($1, $2, $3::jsonb)
       on conflict (id) do update set data = excluded.data`,
      [game.id, game.code, JSON.stringify(game)],
    );
  }

  async getGame(id: string): Promise<GameRecord | null> {
    const res = await this.pool.query('select data from games where id = $1', [id]);
    return (res.rows[0]?.data as GameRecord | undefined) ?? null;
  }

  async purge(retentionMs: number, staleRoomMs: number): Promise<void> {
    const gameLimit = new Date(Date.now() - retentionMs);
    const roomLimit = new Date(Date.now() - staleRoomMs);
    await this.pool.query('delete from games where created_at < $1', [gameLimit]);
    await this.pool.query('delete from drawings where created_at < $1', [gameLimit]);
    await this.pool.query('delete from rooms where updated_at < $1', [roomLimit]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
