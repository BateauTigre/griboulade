import { AVATAR_COLORS, AVATAR_EMOJIS, type Avatar, type GameRecord } from '@shared';

/** Petites aides autour de localStorage (qui peut être indisponible en navigation privée). */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ───────────── Profil ─────────────

export interface Profile {
  /** Jeton secret de ce navigateur : il permet de retrouver sa place après une déconnexion. */
  token: string;
  name: string;
  avatar: Avatar;
}

const PROFILE_KEY = 'griboulade.profil';
let memoryProfile: Profile | null = null;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export function getProfile(): Profile {
  if (memoryProfile) return memoryProfile;
  const stored = read<Partial<Profile> | null>(PROFILE_KEY, null);
  const profile: Profile = {
    token: stored?.token && stored.token.length >= 16 ? stored.token : randomToken(),
    name: stored?.name ?? '',
    avatar: stored?.avatar ?? { emoji: pick(AVATAR_EMOJIS), color: pick(AVATAR_COLORS) },
  };
  memoryProfile = profile;
  write(PROFILE_KEY, profile);
  return profile;
}

export function saveProfile(patch: Partial<Pick<Profile, 'name' | 'avatar'>>): Profile {
  memoryProfile = { ...getProfile(), ...patch };
  write(PROFILE_KEY, memoryProfile);
  return memoryProfile;
}

// ───────────── Historique des parties ─────────────

export interface HistoryEntry {
  id: string;
  code: string;
  date: number;
  players: string[];
  firstPhrase: string;
  drawings: number;
}

const HISTORY_KEY = 'griboulade.historique';

export function getHistory(): HistoryEntry[] {
  return read<HistoryEntry[]>(HISTORY_KEY, []);
}

export function rememberGame(game: GameRecord): void {
  const entry: HistoryEntry = {
    id: game.id,
    code: game.code,
    date: game.endedAt,
    players: game.players.map((p) => p.name),
    firstPhrase: game.books[0]?.pages[0]?.text ?? '',
    drawings: game.stats.drawings,
  };
  const others = getHistory().filter((h) => h.id !== game.id);
  write(HISTORY_KEY, [entry, ...others].slice(0, 50));
}

export function forgetGame(id: string): void {
  write(HISTORY_KEY, getHistory().filter((h) => h.id !== id));
}

// ───────────── Dernier salon (pour proposer d'y revenir) ─────────────

const LAST_ROOM_KEY = 'griboulade.dernier-salon';
export const getLastRoom = (): string => read<string>(LAST_ROOM_KEY, '');
export const setLastRoom = (code: string): void => void write(LAST_ROOM_KEY, code);

// ───────────── Palette personnalisée ─────────────

const PALETTE_KEY = 'griboulade.palette';
export const getCustomColors = (): string[] => read<string[]>(PALETTE_KEY, []);
export const saveCustomColors = (colors: string[]): void => void write(PALETTE_KEY, colors.slice(0, 10));

// ───────────── Sauvegarde automatique des dessins ─────────────

const DRAWING_PREFIX = 'griboulade.dessin.';

export function loadDrawing<T>(key: string): T | null {
  return read<T | null>(DRAWING_PREFIX + key, null);
}

export function saveDrawing(key: string, value: unknown): void {
  // On ne garde que le dessin en cours : les anciens brouillons sont supprimés.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAWING_PREFIX) && k !== DRAWING_PREFIX + key) localStorage.removeItem(k);
    }
  } catch {
    /* stockage indisponible */
  }
  write(DRAWING_PREFIX + key, value);
}
