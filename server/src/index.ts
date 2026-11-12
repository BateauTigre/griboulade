import { createApp } from './app';
import { config } from './config';
import { createStore } from './store/index';

async function main(): Promise<void> {
  const store = await createStore();
  const app = await createApp(store);

  app.http.listen(config.port, '0.0.0.0', () => {
    console.log(`[http] Griboulade écoute sur le port ${config.port} (${config.isProd ? 'production' : 'développement'})`);
    if (config.clientOrigins.length) console.log(`[http] origines autorisées : ${config.clientOrigins.join(', ')}`);
    else console.warn('[http] CLIENT_ORIGIN est vide : seul un client servi par ce serveur pourra se connecter.');
  });

  // Les hébergeurs envoient SIGTERM avant d'arrêter l'instance : on sauvegarde les salons.
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`[http] ${signal} reçu, sauvegarde des salons…`);
    const force = setTimeout(() => process.exit(0), 8000);
    force.unref();
    await app.close().catch((err) => console.error(err));
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => console.error('[erreur] promesse non gérée :', err));

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
