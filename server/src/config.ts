/** Configuration lue depuis les variables d'environnement (voir server/.env.example). */

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function list(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== '' ? n : fallback;
}

export const config = {
  isProd,
  port: int(env.PORT, 3001),
  /**
   * Origines autorisées (CORS + WebSocket). Séparées par des virgules.
   * Jokers acceptés : https://*.pages.dev — « * » seul autorise tout le monde.
   */
  clientOrigins: list(env.CLIENT_ORIGIN, isProd ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
  databaseUrl: env.DATABASE_URL?.trim() || '',
  /** require (chiffré, par défaut) | verify (chiffré + certificat vérifié) | disable */
  databaseSsl: (env.DATABASE_SSL?.trim() || 'require') as 'require' | 'verify' | 'disable',
  /** Durée de conservation des parties terminées et de leurs dessins. */
  retentionDays: int(env.GAME_RETENTION_DAYS, 30),
  /** Dossier du client compilé, servi par le serveur s'il existe (mode « tout-en-un »). */
  clientDist: env.CLIENT_DIST?.trim() || '',
};

function originToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+');
  return new RegExp(`^${escaped}$`, 'i');
}

const allowAll = config.clientOrigins.includes('*');
const originPatterns = config.clientOrigins.filter((o) => o !== '*').map(originToRegex);

/** Une requête sans en-tête Origin (même origine, curl, health check) est toujours acceptée. */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin || allowAll) return true;
  const clean = origin.replace(/\/+$/, '');
  return originPatterns.some((re) => re.test(clean));
}
