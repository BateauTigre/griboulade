/**
 * Types et constantes partagés entre le client et le serveur.
 * Ce fichier ne dépend d'aucune bibliothèque : il peut être importé des deux côtés.
 */

export * from './phrases';

// ───────────────────────────── Constantes ─────────────────────────────

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const MAX_SPECTATORS = 20;
export const MAX_TEXT_LENGTH = 140;
export const MAX_NAME_LENGTH = 16;
export const ROOM_CODE_LENGTH = 5;
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
/** Taille maximale d'un dessin encodé (en octets, une fois décodé). */
export const MAX_DRAWING_BYTES = 1_500_000;

export const REACTION_EMOJIS = ['😂', '🤣', '😍', '🤯', '👏', '💀', '🔥', '🤔'] as const;

export const AVATAR_EMOJIS = [
  '🦊', '🐸', '🐙', '🦄', '🐼', '🐧', '🦖', '🐝',
  '🦥', '🐷', '🐵', '🦉', '🐳', '🦩', '🐢', '🦔',
  '👽', '🤖', '👻', '🧙', '🧛', '🥷', '🤠', '🧑‍🚀',
  '🍕', '🥑', '🌵', '🍄', '🧀', '🥐', '🍩', '🌈',
] as const;

export const AVATAR_COLORS = [
  '#ff6b6b', '#ff9f1c', '#ffd23f', '#3ddc97', '#4cc9f0',
  '#5e7bff', '#b28dff', '#ff8fcf', '#9ae66e', '#ffb4a2',
] as const;

// ───────────────────────────── Paramètres ─────────────────────────────

export type GameMode = 'normal' | 'fast';

export interface GameSettings {
  mode: GameMode;
  /** Nombre d'étapes après la phrase de départ. 0 = automatique (selon le nombre de joueurs). */
  rounds: number;
  /** Durées en secondes. 0 = sans limite. */
  writeTime: number;
  drawTime: number;
  guessTime: number;
  maxPlayers: number;
  themesEnabled: boolean;
  /** Identifiant de thème, ou 'surprise' pour un tirage au sort à chaque partie. */
  theme: string;
  allowSpectators: boolean;
  funnyAwards: boolean;
}

export const MODE_PRESETS: Record<GameMode, Pick<GameSettings, 'writeTime' | 'drawTime' | 'guessTime'>> = {
  normal: { writeTime: 60, drawTime: 90, guessTime: 45 },
  fast: { writeTime: 30, drawTime: 45, guessTime: 25 },
};

export const DEFAULT_SETTINGS: GameSettings = {
  mode: 'normal',
  rounds: 0,
  ...MODE_PRESETS.normal,
  maxPlayers: 8,
  themesEnabled: false,
  theme: 'surprise',
  allowSpectators: true,
  funnyAwards: true,
};

export const TIME_OPTIONS = {
  write: [20, 30, 45, 60, 90, 120, 0],
  draw: [30, 45, 60, 90, 120, 180, 240, 0],
  guess: [15, 25, 30, 45, 60, 90, 0],
} as const;

/**
 * Nombre d'étapes (dessins + devinettes) jouées après la phrase de départ.
 * On ne dépasse jamais `joueurs - 1` : ainsi personne ne retombe sur son propre carnet.
 * En automatique, on choisit un nombre pair pour que chaque carnet finisse par une phrase.
 */
export function computeTotalRounds(playerCount: number, settings: Pick<GameSettings, 'rounds' | 'mode'>): number {
  const max = Math.max(2, playerCount - 1);
  if (settings.rounds > 0) return Math.max(2, Math.min(settings.rounds, max));
  let auto = max % 2 === 0 ? max : max - 1;
  if (auto < 2) auto = 2;
  if (settings.mode === 'fast') auto = Math.min(auto, 4);
  return Math.min(auto, max);
}

export type StepKind = 'write' | 'draw' | 'guess';

/** Nature de l'étape n° `round` (0 = phrase de départ). */
export function kindOfRound(round: number): StepKind {
  if (round === 0) return 'write';
  return round % 2 === 1 ? 'draw' : 'guess';
}

// ───────────────────────────── Modèle de jeu ─────────────────────────────

export interface Avatar {
  emoji: string;
  color: string;
}

export interface PlayerInfo {
  pid: string;
  name: string;
  avatar: Avatar;
}

export interface PlayerView extends PlayerInfo {
  connected: boolean;
  isHost: boolean;
  spectator: boolean;
  /** A validé sa contribution pour l'étape en cours. */
  done: boolean;
}

export type Phase = 'lobby' | 'write' | 'draw' | 'guess' | 'reveal' | 'end';

export interface Page {
  kind: 'text' | 'drawing';
  authorPid: string;
  text?: string;
  /** Identifiant du dessin (servi par GET /api/drawings/:id). null = dessin vide. */
  drawingId?: string | null;
  /** Contribution remplie automatiquement (temps écoulé sans réponse). */
  auto?: boolean;
  reactions?: Record<string, number>;
}

export interface Book {
  ownerPid: string;
  pages: Page[];
}

export interface Award {
  id: string;
  emoji: string;
  title: string;
  description: string;
  pid?: string;
  bookIndex?: number;
}

export interface GameStats {
  durationSec: number;
  drawings: number;
  texts: number;
  words: number;
  reactions: number;
  /** Fidélité moyenne entre phrase de départ et phrase finale (0–100). */
  fidelity: number;
  /** Fidélité par carnet (0–100). */
  bookFidelity: number[];
}

/** Partie terminée, telle qu'enregistrée en base et affichée dans la galerie. */
export interface GameRecord {
  id: string;
  code: string;
  startedAt: number;
  endedAt: number;
  settings: GameSettings;
  theme: string | null;
  players: PlayerInfo[];
  books: Book[];
  stats: GameStats;
  awards: Award[];
}

export interface TaskView {
  kind: StepKind;
  round: number;
  /** Phrase à dessiner (étape dessin). */
  promptText?: string;
  /** Dessin à deviner (étape devinette). */
  promptDrawingId?: string | null;
  submitted: boolean;
  submittedText?: string;
  draftText?: string;
}

export interface RevealView {
  bookIndex: number;
  totalBooks: number;
  /** Nombre de pages déjà révélées dans le carnet courant. */
  step: number;
  totalSteps: number;
  ownerPid: string;
  /** Uniquement les pages déjà révélées. */
  pages: Page[];
}

/** État du salon envoyé à chaque client (personnalisé : jamais de contenu non révélé). */
export interface RoomState {
  code: string;
  you: { pid: string; isHost: boolean; spectator: boolean };
  players: PlayerView[];
  settings: GameSettings;
  phase: Phase;
  gameId: string | null;
  round: number;
  totalRounds: number;
  theme: string | null;
  /** Échéance de l'étape (horloge serveur, ms). null = sans limite. */
  deadline: number | null;
  phaseDuration: number;
  serverNow: number;
  task: TaskView | null;
  reveal: RevealView | null;
  result: GameRecord | null;
}

export interface RoomSummary {
  exists: boolean;
  phase?: Phase;
  players?: number;
  maxPlayers?: number;
  allowSpectators?: boolean;
}

// ───────────────────────────── Protocole Socket.IO ─────────────────────────────

export type Ack<T = unknown> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface JoinPayload {
  code: string;
  token: string;
  name: string;
  avatar: Avatar;
  spectator?: boolean;
}

export interface SubmitPayload {
  round: number;
  text?: string;
  /** Data URL (image/webp ou image/png). */
  drawing?: string;
  strokes?: number;
}

export interface ReactionEvent {
  id: string;
  pid: string;
  emoji: string;
}

export interface NoticeEvent {
  kind: 'join' | 'leave' | 'host' | 'info';
  text: string;
}

export interface ClientToServerEvents {
  'room:create': (p: { token: string; name: string; avatar: Avatar; settings?: Partial<GameSettings> }, ack: Ack<{ code: string }>) => void;
  'room:join': (p: JoinPayload, ack: Ack<{ code: string }>) => void;
  'room:leave': (ack?: Ack) => void;
  'room:settings': (p: Partial<GameSettings>, ack?: Ack) => void;
  'room:role': (p: { spectator: boolean }, ack?: Ack) => void;
  'room:kick': (p: { pid: string }, ack?: Ack) => void;
  'game:start': (ack?: Ack) => void;
  'game:submit': (p: SubmitPayload, ack?: Ack) => void;
  'game:edit': (ack?: Ack) => void;
  'game:draft': (p: SubmitPayload) => void;
  'reveal:next': (ack?: Ack) => void;
  'reveal:react': (p: { emoji: string }) => void;
  'game:replay': (ack?: Ack) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'room:closed': (reason: 'kicked' | 'replaced' | 'closed') => void;
  'room:notice': (n: NoticeEvent) => void;
  'reveal:reaction': (r: ReactionEvent) => void;
}
