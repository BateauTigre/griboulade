/** Vérifie que les deux stockages (mémoire et PostgreSQL) se comportent de la même façon. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import type { GameRecord } from '../../shared/src/index';
import { DEFAULT_SETTINGS } from '../../shared/src/index';
import { MemoryStore } from '../src/store/memory';
import { PostgresStore } from '../src/store/postgres';
import type { Store } from '../src/store/types';

const game: GameRecord = {
  id: 'partie-de-test-1',
  code: 'ABCDE',
  startedAt: 1,
  endedAt: 2,
  settings: DEFAULT_SETTINGS,
  theme: null,
  players: [{ pid: 'p1', name: 'Zoé', avatar: { emoji: '🦊', color: '#ff6b6b' } }],
  books: [{ ownerPid: 'p1', pages: [{ kind: 'text', authorPid: 'p1', text: 'Un éléphant « rose » 🐘' }] }],
  stats: { durationSec: 1, drawings: 0, texts: 1, words: 4, reactions: 0, fidelity: 0, bookFidelity: [0] },
  awards: [],
};

async function exercise(store: Store): Promise<void> {
  await store.init();
  await store.init(); // idempotent

  await store.saveRoom('ABCDE', { v: 1, code: 'ABCDE', n: 1 });
  await store.saveRoom('ABCDE', { v: 1, code: 'ABCDE', n: 2 });
  const rooms = await store.loadRooms();
  assert.equal(rooms.length, 1);
  assert.deepEqual(rooms[0].data, { v: 1, code: 'ABCDE', n: 2 });
  assert.ok(Math.abs(rooms[0].updatedAt - Date.now()) < 60_000);

  const data = Buffer.from([0, 1, 2, 255, 254, 0, 42]);
  await store.saveDrawing('dessin-1', 'ABCDE', { mime: 'image/webp', data });
  const drawing = await store.getDrawing('dessin-1');
  assert.equal(drawing?.mime, 'image/webp');
  assert.ok(Buffer.from(drawing!.data).equals(data), 'les octets du dessin sont intacts');
  assert.equal(await store.getDrawing('inconnu'), null);

  await store.saveGame(game);
  await store.saveGame({ ...game, endedAt: 3 });
  assert.deepEqual(await store.getGame(game.id), { ...game, endedAt: 3 });
  assert.equal(await store.getGame('inconnue'), null);

  // Rien n'est assez vieux : la purge ne supprime rien.
  await store.purge(60_000, 60_000);
  assert.ok(await store.getGame(game.id));
  assert.equal((await store.loadRooms()).length, 1);

  await store.deleteDrawing('dessin-1');
  assert.equal(await store.getDrawing('dessin-1'), null);
  await store.deleteRoom('ABCDE');
  assert.equal((await store.loadRooms()).length, 0);
}

test('MemoryStore', () => exercise(new MemoryStore()));

// Lancé seulement si une vraie base est fournie : TEST_DATABASE_URL=postgres://… npm test
const testDb = process.env.TEST_DATABASE_URL;
test('PostgresStore', { skip: testDb ? false : 'TEST_DATABASE_URL non défini' }, async () => {
  const pool = new pg.Pool({ connectionString: testDb });
  await pool.query('drop table if exists rooms, drawings, games');
  try {
    await exercise(new PostgresStore({ pool }));
  } finally {
    await pool.end();
  }
});
