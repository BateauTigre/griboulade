import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  MIN_PLAYERS,
  MODE_PRESETS,
  REACTION_EMOJIS,
  THEMES,
  computeTotalRounds,
  getTheme,
  kindOfRound,
  randomPhrase,
  type Avatar,
  type GameRecord,
  type GameSettings,
  type NoticeEvent,
  type Phase,
  type PlayerInfo,
  type PlayerView,
  type RevealView,
  type RoomState,
  type ServerToClientEvents,
  type StepKind,
  type SubmitPayload,
  type TaskView,
} from '../../../shared/src/index';
import { computeAwards, computeStats, publicBooks, type InternalBook, type InternalPage } from './awards';
import { bookIndexFor } from './chain';
import { decodeImageDataUrl, newId, sanitizeAvatar, sanitizeName, sanitizeText, shuffle } from './util';

/** Délai pendant lequel un joueur déconnecté est encore attendu avant de passer à la suite. */
export const DISCONNECT_GRACE_MS = 20_000;
/** Marge après l'échéance pour recevoir les envois automatiques des clients. */
export const SUBMIT_GRACE_MS = 2_000;
/** En salle d'attente, un joueur déconnecté est retiré après ce délai. */
export const LOBBY_DISCONNECT_MS = 45_000;

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const OK = { ok: true } as const;

export interface RoomDeps {
  send<E extends keyof ServerToClientEvents>(socketId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void;
  saveDrawing(id: string, roomCode: string, mime: string, data: Buffer): Promise<void>;
  deleteDrawing(id: string): void;
  saveGame(record: GameRecord): void;
  /** Le salon a changé : à persister (appel groupé par le gestionnaire). */
  changed(room: Room): void;
  now(): number;
}

interface Member {
  pid: string;
  /** Jeton secret du navigateur : permet la reconnexion. Jamais envoyé aux autres. */
  token: string;
  name: string;
  avatar: Avatar;
  socketId: string | null;
  connected: boolean;
  disconnectedAt: number | null;
  spectator: boolean;
  /** Spectateur « par défaut » (arrivé en cours de partie) : redevient joueur à la partie suivante. */
  autoSpectator: boolean;
  /** A quitté volontairement en cours de partie. */
  left: boolean;
}

interface Submission {
  text?: string;
  drawingId?: string;
  strokes?: number;
  at: number;
}

interface Draft {
  text?: string;
  drawing?: string;
  strokes?: number;
}

interface GameState {
  id: string;
  order: string[];
  books: InternalBook[];
  round: number;
  totalRounds: number;
  theme: string | null;
  startedAt: number;
  endedAt: number | null;
  phaseStartedAt: number;
  deadline: number | null;
  submissions: Record<string, Submission>;
  /** Dernière contribution validée puis rouverte en modification. */
  previous: Record<string, Submission>;
  drafts: Record<string, Draft>;
}

export interface RoomSnapshot {
  v: 1;
  code: string;
  createdAt: number;
  hostPid: string;
  settings: GameSettings;
  phase: Phase;
  members: Member[];
  game: GameState | null;
  reveal: { bookIndex: number; step: number } | null;
  result: GameRecord | null;
  kicked: string[];
}

const isPlayPhase = (phase: Phase): phase is StepKind => phase === 'write' || phase === 'draw' || phase === 'guess';

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, n));
}

function validTime(value: unknown, fallback: number): number {
  if (value === 0) return 0;
  return clampInt(value, 10, 600, fallback);
}

export function sanitizeSettings(current: GameSettings, patch: Partial<GameSettings> | undefined): GameSettings {
  const next: GameSettings = { ...current };
  if (!patch || typeof patch !== 'object') return next;
  if (patch.mode === 'normal' || patch.mode === 'fast') {
    if (patch.mode !== current.mode) Object.assign(next, MODE_PRESETS[patch.mode]);
    next.mode = patch.mode;
  }
  if (patch.rounds !== undefined) next.rounds = patch.rounds === 0 ? 0 : clampInt(patch.rounds, 2, MAX_PLAYERS - 1, 0);
  if (patch.writeTime !== undefined) next.writeTime = validTime(patch.writeTime, next.writeTime);
  if (patch.drawTime !== undefined) next.drawTime = validTime(patch.drawTime, next.drawTime);
  if (patch.guessTime !== undefined) next.guessTime = validTime(patch.guessTime, next.guessTime);
  if (patch.maxPlayers !== undefined) next.maxPlayers = clampInt(patch.maxPlayers, MIN_PLAYERS, MAX_PLAYERS, next.maxPlayers);
  if (typeof patch.themesEnabled === 'boolean') next.themesEnabled = patch.themesEnabled;
  if (typeof patch.theme === 'string' && (patch.theme === 'surprise' || getTheme(patch.theme))) next.theme = patch.theme;
  if (typeof patch.allowSpectators === 'boolean') next.allowSpectators = patch.allowSpectators;
  if (typeof patch.funnyAwards === 'boolean') next.funnyAwards = patch.funnyAwards;
  return next;
}

/**
 * Un salon : ses membres, ses paramètres et la partie en cours.
 * Toute la logique de jeu vit ici ; le transport (Socket.IO) et le stockage sont injectés.
 */
export class Room {
  readonly code: string;
  createdAt: number;
  hostPid = '';
  settings: GameSettings;
  phase: Phase = 'lobby';
  /** Dernier instant où au moins un membre était connecté (sert au nettoyage). */
  lastConnectedAt: number;

  private members = new Map<string, Member>();
  private game: GameState | null = null;
  private reveal: { bookIndex: number; step: number } | null = null;
  private result: GameRecord | null = null;
  private kicked = new Set<string>();
  private advancing = false;
  private lastTick: number;
  private lastReactionAt = new Map<string, number>();

  constructor(
    code: string,
    private deps: RoomDeps,
    settings?: Partial<GameSettings>,
  ) {
    this.code = code;
    this.createdAt = deps.now();
    this.lastConnectedAt = this.createdAt;
    this.lastTick = this.createdAt;
    this.settings = sanitizeSettings(DEFAULT_SETTINGS, settings);
  }

  // ───────────────────────────── Lecture ─────────────────────────────

  get connectedCount(): number {
    let n = 0;
    for (const m of this.members.values()) if (m.connected) n++;
    return n;
  }

  get playerCount(): number {
    let n = 0;
    for (const m of this.members.values()) if (!m.spectator && !m.left) n++;
    return n;
  }

  get isEmpty(): boolean {
    return this.members.size === 0;
  }

  pidOfSocket(socketId: string): string | null {
    for (const m of this.members.values()) if (m.socketId === socketId) return m.pid;
    return null;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  join(input: { token: string; name: unknown; avatar: unknown; spectator?: boolean; socketId: string }): Result<{ pid: string }> {
    const now = this.deps.now();
    if (this.kicked.has(input.token)) return fail('L’hôte t’a exclu de ce salon.');

    const existing = [...this.members.values()].find((m) => m.token === input.token);
    if (existing) {
      if (existing.socketId && existing.socketId !== input.socketId) {
        this.deps.send(existing.socketId, 'room:closed', 'replaced');
      }
      existing.socketId = input.socketId;
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.left = false;
      // En salle d'attente, on peut revenir avec un nouveau pseudo / avatar.
      if (this.phase === 'lobby') {
        const name = sanitizeName(input.name);
        if (name) existing.name = this.uniqueName(name, existing.pid);
        if (input.avatar) existing.avatar = sanitizeAvatar(input.avatar);
      }
      this.ensureHost(now);
      this.touch();
      return { ok: true, pid: existing.pid };
    }

    const name = sanitizeName(input.name);
    if (!name) return fail('Choisis un pseudo pour rejoindre le salon.');

    const inLobby = this.phase === 'lobby';
    const spectators = [...this.members.values()].filter((m) => m.spectator).length;
    const hasSeat = inLobby && this.playerCount < this.settings.maxPlayers;
    let spectator = Boolean(input.spectator);
    let autoSpectator = false;

    if (!spectator && !hasSeat) {
      if (!this.settings.allowSpectators) {
        return fail(inLobby ? 'Ce salon est complet.' : 'La partie a déjà commencé et les spectateurs ne sont pas autorisés.');
      }
      spectator = true;
      autoSpectator = true;
    } else if (spectator && !this.settings.allowSpectators) {
      return fail('Les spectateurs ne sont pas autorisés dans ce salon.');
    }
    if (spectator && spectators >= MAX_SPECTATORS) return fail('Il y a déjà trop de spectateurs dans ce salon.');

    const member: Member = {
      pid: newId(6),
      token: input.token,
      name: this.uniqueName(name),
      avatar: sanitizeAvatar(input.avatar),
      socketId: input.socketId,
      connected: true,
      disconnectedAt: null,
      spectator,
      autoSpectator,
      left: false,
    };
    this.members.set(member.pid, member);
    if (!this.hostPid || !this.members.has(this.hostPid)) this.hostPid = member.pid;
    this.notice({ kind: 'join', text: `${member.name} ${spectator ? 'regarde la partie' : 'a rejoint le salon'}` }, member.pid);
    this.touch();
    return { ok: true, pid: member.pid };
  }

  /** Coupure réseau (fermeture d'onglet, perte de connexion…). */
  disconnect(socketId: string): void {
    const pid = this.pidOfSocket(socketId);
    const m = pid ? this.members.get(pid) : undefined;
    if (!m) return;
    m.socketId = null;
    m.connected = false;
    m.disconnectedAt = this.deps.now();
    this.touch();
  }

  /** Départ volontaire. */
  leave(pid: string): void {
    const m = this.members.get(pid);
    if (!m) return;
    const inGame = this.game?.order.includes(pid) && this.phase !== 'lobby';
    if (inGame) {
      m.left = true;
      m.connected = false;
      m.socketId = null;
      m.disconnectedAt = this.deps.now();
    } else {
      this.members.delete(pid);
    }
    this.notice({ kind: 'leave', text: `${m.name} a quitté le salon` });
    this.ensureHost(this.deps.now(), true);
    this.touch();
  }

  kick(hostPid: string, targetPid: string): Result {
    if (hostPid !== this.hostPid) return fail('Seul l’hôte peut exclure un joueur.');
    const target = this.members.get(targetPid);
    if (!target || targetPid === hostPid) return fail('Joueur introuvable.');
    this.kicked.add(target.token);
    if (target.socketId) this.deps.send(target.socketId, 'room:closed', 'kicked');
    target.socketId = null;
    this.leave(targetPid);
    return OK;
  }

  setRole(pid: string, spectator: boolean): Result {
    const m = this.members.get(pid);
    if (!m) return fail('Tu n’es plus dans ce salon.');
    if (this.phase !== 'lobby') return fail('Impossible de changer de rôle pendant la partie.');
    if (spectator) {
      if (!this.settings.allowSpectators) return fail('Les spectateurs ne sont pas autorisés.');
    } else if (m.spectator && this.playerCount >= this.settings.maxPlayers) {
      return fail('Il n’y a plus de place parmi les joueurs.');
    }
    m.spectator = spectator;
    m.autoSpectator = false;
    this.touch();
    return OK;
  }

  updateSettings(pid: string, patch: Partial<GameSettings>): Result {
    if (pid !== this.hostPid) return fail('Seul l’hôte peut modifier les paramètres.');
    if (this.phase !== 'lobby') return fail('Les paramètres se règlent dans la salle d’attente.');
    const next = sanitizeSettings(this.settings, patch);
    next.maxPlayers = Math.max(next.maxPlayers, this.playerCount, MIN_PLAYERS);
    this.settings = next;
    this.touch();
    return OK;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(pid: string): Result {
    if (pid !== this.hostPid) return fail('Seul l’hôte peut lancer la partie.');
    if (this.phase !== 'lobby') return fail('La partie a déjà commencé.');
    const players = [...this.members.values()].filter((m) => !m.spectator && m.connected);
    if (players.length < MIN_PLAYERS) return fail(`Il faut au moins ${MIN_PLAYERS} joueurs connectés pour jouer.`);

    for (const m of [...this.members.values()]) if (!m.connected) this.members.delete(m.pid);

    const now = this.deps.now();
    const order = shuffle(players.map((m) => m.pid));
    let theme: string | null = null;
    if (this.settings.themesEnabled) {
      theme = getTheme(this.settings.theme)?.id ?? THEMES[Math.floor(Math.random() * THEMES.length)].id;
    }
    this.game = {
      id: newId(12),
      order,
      books: order.map((ownerPid) => ({ ownerPid, pages: [] })),
      round: 0,
      totalRounds: computeTotalRounds(order.length, this.settings),
      theme,
      startedAt: now,
      endedAt: null,
      phaseStartedAt: now,
      deadline: null,
      submissions: {},
      previous: {},
      drafts: {},
    };
    this.reveal = null;
    this.result = null;
    this.beginStep(now);
    this.touch();
    return OK;
  }

  private phaseSeconds(kind: StepKind): number {
    return kind === 'write' ? this.settings.writeTime : kind === 'draw' ? this.settings.drawTime : this.settings.guessTime;
  }

  private beginStep(now: number): void {
    const g = this.game!;
    const kind = kindOfRound(g.round);
    const seconds = this.phaseSeconds(kind);
    this.phase = kind;
    g.phaseStartedAt = now;
    g.deadline = seconds > 0 ? now + seconds * 1000 : null;
    g.submissions = {};
    g.previous = {};
    g.drafts = {};
  }

  async submit(pid: string, payload: SubmitPayload): Promise<Result> {
    const g = this.game;
    if (!g || !isPlayPhase(this.phase) || this.advancing) return fail('Trop tard, cette étape est terminée.');
    if (!g.order.includes(pid)) return fail('Les spectateurs ne participent pas.');
    if (!payload || payload.round !== g.round) return fail('Trop tard, cette étape est terminée.');
    const now = this.deps.now();

    if (kindOfRound(g.round) === 'draw') {
      const image = decodeImageDataUrl(payload.drawing);
      if (!image) return fail('Dessin invalide ou trop lourd.');
      const id = newId(16);
      try {
        await this.deps.saveDrawing(id, this.code, image.mime, image.data);
      } catch {
        return fail('Impossible d’enregistrer le dessin, réessaie.');
      }
      // L'enregistrement est asynchrone : l'étape a pu se terminer entre-temps.
      if (this.game !== g || g.round !== payload.round || this.advancing) {
        this.deps.deleteDrawing(id);
        return fail('Trop tard, cette étape est terminée.');
      }
      const before = g.submissions[pid] ?? g.previous[pid];
      if (before?.drawingId) this.deps.deleteDrawing(before.drawingId);
      g.submissions[pid] = { drawingId: id, strokes: clampInt(payload.strokes, 0, 100_000, 0), at: now };
    } else {
      const text = sanitizeText(payload.text);
      if (!text) return fail('Écris quelque chose avant de valider !');
      g.submissions[pid] = { text, at: now };
    }
    delete g.previous[pid];
    delete g.drafts[pid];
    this.touch();
    void this.maybeAdvance(now);
    return OK;
  }

  /** Rouvre sa contribution pour la modifier tant que l'étape n'est pas terminée. */
  edit(pid: string): Result {
    const g = this.game;
    if (!g || !isPlayPhase(this.phase) || this.advancing) return fail('Trop tard, cette étape est terminée.');
    const sub = g.submissions[pid];
    if (!sub) return OK;
    g.previous[pid] = sub;
    if (sub.text) g.drafts[pid] = { text: sub.text };
    delete g.submissions[pid];
    this.touch();
    return OK;
  }

  /** Brouillon enregistré automatiquement : utilisé si le chrono expire avant la validation. */
  draft(pid: string, payload: SubmitPayload): void {
    const g = this.game;
    if (!g || !isPlayPhase(this.phase) || this.advancing) return;
    if (!payload || payload.round !== g.round || !g.order.includes(pid) || g.submissions[pid]) return;
    if (kindOfRound(g.round) === 'draw') {
      if (typeof payload.drawing === 'string' && decodeImageDataUrl(payload.drawing)) {
        g.drafts[pid] = { drawing: payload.drawing, strokes: clampInt(payload.strokes, 0, 100_000, 0) };
      }
    } else {
      g.drafts[pid] = { text: sanitizeText(payload.text) };
      this.deps.changed(this);
    }
  }

  private async maybeAdvance(now: number): Promise<void> {
    const g = this.game;
    if (!g || !isPlayPhase(this.phase) || this.advancing) return;
    const waiting = g.order.filter((pid) => {
      const m = this.members.get(pid);
      if (!m || m.left) return false;
      return m.connected || (m.disconnectedAt !== null && now - m.disconnectedAt < DISCONNECT_GRACE_MS);
    });
    const everyoneDone = waiting.every((pid) => g.submissions[pid]);
    const timeUp = g.deadline !== null && now >= g.deadline + SUBMIT_GRACE_MS;
    if (everyoneDone || timeUp) await this.advance();
  }

  /** Clôt l'étape : range chaque contribution dans son carnet puis passe à la suivante. */
  private async advance(): Promise<void> {
    const g = this.game;
    if (!g || this.advancing) return;
    this.advancing = true;
    try {
      const now = this.deps.now();
      const kind = kindOfRound(g.round);
      const n = g.order.length;
      const fullMs = this.phaseSeconds(kind) * 1000 || now - g.phaseStartedAt;

      for (let i = 0; i < n; i++) {
        const pid = g.order[i];
        const book = g.books[bookIndexFor(i, g.round, n)];
        const sub = g.submissions[pid];
        const draft = g.drafts[pid];
        const previous = g.previous[pid];
        const ms = sub ? Math.max(0, sub.at - g.phaseStartedAt) : fullMs;
        let page: InternalPage;

        if (kind === 'draw') {
          let drawingId: string | null = sub?.drawingId ?? null;
          let strokes = sub?.strokes ?? 0;
          if (!drawingId && draft?.drawing) {
            const image = decodeImageDataUrl(draft.drawing);
            if (image) {
              const id = newId(16);
              try {
                await this.deps.saveDrawing(id, this.code, image.mime, image.data);
                drawingId = id;
                strokes = draft.strokes ?? 0;
              } catch {
                /* dessin perdu : la page restera vide */
              }
            }
          }
          if (!drawingId && previous?.drawingId) {
            drawingId = previous.drawingId;
            strokes = previous.strokes ?? 0;
          }
          page = { kind: 'drawing', authorPid: pid, drawingId, strokes, ms, ...(drawingId ? {} : { auto: true }) };
        } else {
          let text = sub?.text || sanitizeText(draft?.text) || previous?.text || '';
          let auto = false;
          if (!text) {
            auto = true;
            text = kind === 'write' ? randomPhrase(g.theme) : '🤷 Aucune idée…';
          }
          page = { kind: 'text', authorPid: pid, text, ms, ...(auto ? { auto: true } : {}) };
        }
        book.pages.push(page);
      }

      g.round++;
      if (g.round > g.totalRounds) {
        g.endedAt = now;
        g.submissions = {};
        g.previous = {};
        g.drafts = {};
        g.deadline = null;
        this.phase = 'reveal';
        this.reveal = { bookIndex: 0, step: 1 };
        this.deps.saveGame(this.buildRecord());
      } else {
        this.beginStep(now);
      }
    } finally {
      this.advancing = false;
    }
    this.touch();
  }

  // ───────────────────────────── Révélation ─────────────────────────────

  revealNext(pid: string): Result {
    if (pid !== this.hostPid) return fail('Seul l’hôte fait défiler les carnets.');
    const g = this.game;
    const r = this.reveal;
    if (!g || !r || this.phase !== 'reveal') return fail('Aucune révélation en cours.');
    const book = g.books[r.bookIndex];
    if (r.step < book.pages.length) {
      r.step++;
    } else if (r.bookIndex < g.books.length - 1) {
      r.bookIndex++;
      r.step = 1;
    } else {
      this.phase = 'end';
      this.result = this.buildRecord();
      this.deps.saveGame(this.result);
    }
    this.touch();
    return OK;
  }

  react(pid: string, emoji: unknown): void {
    const g = this.game;
    const r = this.reveal;
    const m = this.members.get(pid);
    if (!g || !r || !m || this.phase !== 'reveal') return;
    if (!(REACTION_EMOJIS as readonly string[]).includes(emoji as string)) return;
    const now = this.deps.now();
    if (now - (this.lastReactionAt.get(pid) ?? 0) < 120) return;
    this.lastReactionAt.set(pid, now);

    const page = g.books[r.bookIndex].pages[r.step - 1];
    if (!page) return;
    page.reactions ??= {};
    page.reactions[emoji as string] = (page.reactions[emoji as string] ?? 0) + 1;
    const event = { id: newId(6), pid, emoji: emoji as string };
    for (const other of this.members.values()) {
      if (other.socketId) this.deps.send(other.socketId, 'reveal:reaction', event);
    }
    this.deps.changed(this);
  }

  replay(pid: string): Result {
    if (pid !== this.hostPid) return fail('Seul l’hôte peut relancer une partie.');
    if (this.phase !== 'end') return fail('La partie n’est pas terminée.');
    this.game = null;
    this.reveal = null;
    this.result = null;
    this.phase = 'lobby';
    for (const m of [...this.members.values()]) {
      if (m.left || !m.connected) this.members.delete(m.pid);
    }
    for (const m of this.members.values()) {
      if (m.autoSpectator && this.playerCount < this.settings.maxPlayers) {
        m.spectator = false;
        m.autoSpectator = false;
      }
    }
    this.touch();
    return OK;
  }

  private buildRecord(): GameRecord {
    const g = this.game!;
    const endedAt = g.endedAt ?? this.deps.now();
    const players: PlayerInfo[] = g.order.map((pid) => {
      const m = this.members.get(pid);
      return { pid, name: m?.name ?? 'Joueur parti', avatar: m?.avatar ?? sanitizeAvatar(null) };
    });
    const stats = computeStats(g.books, g.startedAt, endedAt);
    return {
      id: g.id,
      code: this.code,
      startedAt: g.startedAt,
      endedAt,
      settings: { ...this.settings },
      theme: g.theme,
      players,
      books: publicBooks(g.books),
      stats,
      awards: this.settings.funnyAwards ? computeAwards(g.books, players, stats) : [],
    };
  }

  // ───────────────────────────── Horloge ─────────────────────────────

  /** Appelé chaque seconde par le gestionnaire de salons. */
  tick(now: number): void {
    const dt = Math.max(0, now - this.lastTick);
    this.lastTick = now;

    if (this.connectedCount === 0) {
      // Personne en ligne (ex. redémarrage du serveur) : la partie est mise en pause.
      if (this.game?.deadline) this.game.deadline += dt;
      for (const m of this.members.values()) if (m.disconnectedAt !== null) m.disconnectedAt = now;
      return;
    }
    this.lastConnectedAt = now;

    if (this.phase === 'lobby') {
      let removed = false;
      for (const m of [...this.members.values()]) {
        if (!m.connected && m.disconnectedAt !== null && now - m.disconnectedAt > LOBBY_DISCONNECT_MS) {
          this.members.delete(m.pid);
          removed = true;
        }
      }
      if (removed) this.touch();
    }
    this.ensureHost(now);
    if (isPlayPhase(this.phase)) void this.maybeAdvance(now);
  }

  /** Transmet le rôle d'hôte si l'hôte est parti ou déconnecté depuis trop longtemps. */
  private ensureHost(now: number, immediate = false): void {
    const host = this.members.get(this.hostPid);
    const hostGone =
      !host ||
      host.left ||
      (!host.connected && (immediate || (host.disconnectedAt !== null && now - host.disconnectedAt > DISCONNECT_GRACE_MS)));
    if (!hostGone) return;
    const candidates = [...this.members.values()].filter((m) => m.connected && !m.left);
    const next = candidates.find((m) => !m.spectator) ?? candidates[0];
    if (!next || next.pid === this.hostPid) return;
    this.hostPid = next.pid;
    this.notice({ kind: 'host', text: `${next.name} est maintenant l’hôte du salon` });
    this.touch();
  }

  // ───────────────────────────── Diffusion ─────────────────────────────

  private uniqueName(name: string, selfPid?: string): string {
    const taken = new Set(
      [...this.members.values()].filter((m) => m.pid !== selfPid).map((m) => m.name.toLowerCase()),
    );
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private notice(event: NoticeEvent, exceptPid?: string): void {
    for (const m of this.members.values()) {
      if (m.socketId && m.pid !== exceptPid) this.deps.send(m.socketId, 'room:notice', event);
    }
  }

  private touch(): void {
    this.broadcast();
    this.deps.changed(this);
  }

  broadcast(): void {
    for (const m of this.members.values()) {
      if (m.socketId) this.deps.send(m.socketId, 'room:state', this.viewFor(m.pid)!);
    }
  }

  /** Vue personnalisée : un joueur ne reçoit que ce qu'il a le droit de voir. */
  viewFor(pid: string): RoomState | null {
    const me = this.members.get(pid);
    if (!me) return null;
    const g = this.game;
    const playing = isPlayPhase(this.phase);

    const players: PlayerView[] = [...this.members.values()].map((m) => ({
      pid: m.pid,
      name: m.name,
      avatar: m.avatar,
      connected: m.connected,
      isHost: m.pid === this.hostPid,
      spectator: g ? !g.order.includes(m.pid) : m.spectator,
      done: Boolean(playing && g?.submissions[m.pid]),
    }));

    let task: TaskView | null = null;
    if (g && playing) {
      const index = g.order.indexOf(pid);
      if (index >= 0) {
        const kind = kindOfRound(g.round);
        const book = g.books[bookIndexFor(index, g.round, g.order.length)];
        const prev = g.round > 0 ? book.pages[g.round - 1] : undefined;
        const sub = g.submissions[pid];
        task = {
          kind,
          round: g.round,
          ...(kind === 'draw' ? { promptText: prev?.text ?? '' } : {}),
          ...(kind === 'guess' ? { promptDrawingId: prev?.drawingId ?? null } : {}),
          submitted: Boolean(sub),
          ...(sub?.text ? { submittedText: sub.text } : {}),
          ...(g.drafts[pid]?.text ? { draftText: g.drafts[pid].text } : {}),
        };
      }
    }

    let reveal: RevealView | null = null;
    if (g && this.reveal && this.phase === 'reveal') {
      const book = g.books[this.reveal.bookIndex];
      reveal = {
        bookIndex: this.reveal.bookIndex,
        totalBooks: g.books.length,
        step: this.reveal.step,
        totalSteps: book.pages.length,
        ownerPid: book.ownerPid,
        pages: publicBooks([{ ownerPid: book.ownerPid, pages: book.pages.slice(0, this.reveal.step) }])[0].pages,
      };
    }

    return {
      code: this.code,
      you: { pid, isHost: pid === this.hostPid, spectator: g ? !g.order.includes(pid) : me.spectator },
      players,
      settings: this.settings,
      phase: this.phase,
      gameId: g?.id ?? null,
      round: g?.round ?? 0,
      totalRounds: g?.totalRounds ?? computeTotalRounds(Math.max(this.playerCount, MIN_PLAYERS), this.settings),
      theme: g?.theme ?? null,
      deadline: playing ? (g?.deadline ?? null) : null,
      phaseDuration: playing ? this.phaseSeconds(this.phase as StepKind) : 0,
      serverNow: this.deps.now(),
      task,
      reveal,
      result: this.phase === 'end' ? this.result : null,
    };
  }

  // ───────────────────────────── Persistance ─────────────────────────────

  snapshot(): RoomSnapshot {
    const g = this.game;
    return {
      v: 1,
      code: this.code,
      createdAt: this.createdAt,
      hostPid: this.hostPid,
      settings: this.settings,
      phase: this.phase,
      members: [...this.members.values()].map((m) => ({ ...m, socketId: null })),
      game: g
        ? {
            ...g,
            // Les brouillons de dessin (volumineux) restent en mémoire ; le client les renvoie après reconnexion.
            drafts: Object.fromEntries(
              Object.entries(g.drafts).filter(([, d]) => d.text).map(([pid, d]) => [pid, { text: d.text }]),
            ),
          }
        : null,
      reveal: this.reveal,
      result: this.result,
      kicked: [...this.kicked],
    };
  }

  /** Reconstruit un salon après un redémarrage du serveur : tout le monde est « déconnecté » et attendu. */
  static restore(snapshot: RoomSnapshot, deps: RoomDeps): Room {
    const now = deps.now();
    const room = new Room(snapshot.code, deps, snapshot.settings);
    room.createdAt = snapshot.createdAt;
    room.hostPid = snapshot.hostPid;
    room.phase = snapshot.phase;
    for (const m of snapshot.members) {
      room.members.set(m.pid, { ...m, socketId: null, connected: false, disconnectedAt: now });
    }
    room.game = snapshot.game ? { ...snapshot.game, previous: snapshot.game.previous ?? {}, drafts: snapshot.game.drafts ?? {} } : null;
    if (room.game?.deadline) room.game.deadline = Math.max(room.game.deadline, now + DISCONNECT_GRACE_MS);
    room.reveal = snapshot.reveal;
    room.result = snapshot.result;
    room.kicked = new Set(snapshot.kicked ?? []);
    room.lastConnectedAt = now;
    room.lastTick = now;
    return room;
  }
}
