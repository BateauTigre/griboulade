import { config } from '../config';
import { MemoryStore } from './memory';
import { PostgresStore } from './postgres';
import type { Store } from './types';

export type { Store, StoredDrawing, StoredRoom } from './types';
export { MemoryStore } from './memory';
export { PostgresStore } from './postgres';

/**
 * Choisit le stockage selon l'environnement.
 * Si la base est injoignable au démarrage, on bascule en mémoire : le jeu reste jouable
 * (seuls l'historique et la reprise après redémarrage sont perdus).
 */
export async function createStore(): Promise<Store> {
  if (!config.databaseUrl) {
    console.log('[db] DATABASE_URL absent → stockage en mémoire (non persistant).');
    return new MemoryStore();
  }
  try {
    const store = new PostgresStore({ connectionString: config.databaseUrl, ssl: config.databaseSsl });
    await store.init();
    console.log('[db] PostgreSQL connecté, schéma prêt.');
    return store;
  } catch (err) {
    console.error('[db] PostgreSQL injoignable → repli sur la mémoire :', (err as Error).message);
    return new MemoryStore();
  }
}
