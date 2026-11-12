import type { Award, Book, GameStats, PlayerInfo } from '../../../shared/src/index';

/** Page enrichie de mesures internes (jamais envoyées telles quelles aux clients). */
export interface InternalPage {
  kind: 'text' | 'drawing';
  authorPid: string;
  text?: string;
  drawingId?: string | null;
  auto?: boolean;
  reactions?: Record<string, number>;
  /** Temps mis pour répondre (ms). */
  ms?: number;
  /** Nombre de traits du dessin. */
  strokes?: number;
}

export interface InternalBook {
  ownerPid: string;
  pages: InternalPage[];
}

const STOP_WORDS = new Set(
  'le la les un une des de du d l qui que qu et a au aux en dans sur sous avec son sa ses se s est sont pour par ce cette ces il elle ils elles on y ne pas plus tres tout'.split(
    ' ',
  ),
);

function keywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 3 ? w.replace(/(s|x|es)$/, '') : w));
  return new Set(words);
}

/** Ressemblance entre deux phrases (indice de Jaccard sur les mots-clés), de 0 à 1. */
export function similarity(a: string, b: string): number {
  const ka = keywords(a);
  const kb = keywords(b);
  if (ka.size === 0 || kb.size === 0) return 0;
  let common = 0;
  for (const w of ka) if (kb.has(w)) common++;
  return common / (ka.size + kb.size - common);
}

function countReactions(page: InternalPage): number {
  return Object.values(page.reactions ?? {}).reduce((sum, n) => sum + n, 0);
}

function wordCount(text: string | undefined): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/** Retire les mesures internes avant envoi au client / enregistrement. */
export function publicBooks(books: InternalBook[]): Book[] {
  return books.map((b) => ({
    ownerPid: b.ownerPid,
    pages: b.pages.map((p) => ({
      kind: p.kind,
      authorPid: p.authorPid,
      ...(p.kind === 'text' ? { text: p.text ?? '' } : { drawingId: p.drawingId ?? null }),
      ...(p.auto ? { auto: true } : {}),
      ...(p.reactions && Object.keys(p.reactions).length ? { reactions: { ...p.reactions } } : {}),
    })),
  }));
}

export function computeStats(books: InternalBook[], startedAt: number, endedAt: number): GameStats {
  let drawings = 0;
  let texts = 0;
  let words = 0;
  let reactions = 0;
  const bookFidelity: number[] = [];
  for (const book of books) {
    for (const page of book.pages) {
      if (page.kind === 'drawing') drawings++;
      else {
        texts++;
        words += wordCount(page.text);
      }
      reactions += countReactions(page);
    }
    const textPages = book.pages.filter((p) => p.kind === 'text');
    const first = textPages[0]?.text ?? '';
    const last = textPages.length > 1 ? (textPages[textPages.length - 1].text ?? '') : '';
    bookFidelity.push(Math.round(similarity(first, last) * 100));
  }
  const fidelity = bookFidelity.length
    ? Math.round(bookFidelity.reduce((a, b) => a + b, 0) / bookFidelity.length)
    : 0;
  return {
    durationSec: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
    drawings,
    texts,
    words,
    reactions,
    fidelity,
    bookFidelity,
  };
}

interface PlayerTally {
  reactions: number;
  totalMs: number;
  timed: number;
  words: number;
  strokes: number;
  missed: number;
}

/** Classement humoristique : des trophées pour rire, pas pour départager. */
export function computeAwards(books: InternalBook[], players: PlayerInfo[], stats: GameStats): Award[] {
  const tally = new Map<string, PlayerTally>();
  for (const p of players) tally.set(p.pid, { reactions: 0, totalMs: 0, timed: 0, words: 0, strokes: 0, missed: 0 });

  for (const book of books) {
    for (const page of book.pages) {
      const t = tally.get(page.authorPid);
      if (!t) continue;
      t.reactions += countReactions(page);
      if (page.auto) {
        t.missed++;
        continue;
      }
      if (typeof page.ms === 'number') {
        t.totalMs += page.ms;
        t.timed++;
      }
      if (page.kind === 'text') t.words += wordCount(page.text);
      else t.strokes += page.strokes ?? 0;
    }
  }

  const name = (pid: string) => players.find((p) => p.pid === pid)?.name ?? '???';
  const best = (score: (t: PlayerTally) => number | null, taken: Set<string>): [string, number] | null => {
    let winner: [string, number] | null = null;
    for (const [pid, t] of tally) {
      if (taken.has(pid)) continue;
      const s = score(t);
      if (s === null) continue;
      if (!winner || s > winner[1]) winner = [pid, s];
    }
    return winner;
  };

  const awards: Award[] = [];
  const taken = new Set<string>();
  const give = (award: Award) => {
    awards.push(award);
    if (award.pid) taken.add(award.pid);
  };

  const star = best((t) => (t.reactions > 0 ? t.reactions : null), taken);
  if (star) {
    give({
      id: 'star',
      emoji: '🏆',
      title: 'Chouchou du public',
      description: `${name(star[0])} a récolté ${star[1]} réaction${star[1] > 1 ? 's' : ''}.`,
      pid: star[0],
    });
  }

  const flash = best((t) => (t.timed > 0 ? -t.totalMs / t.timed : null), taken);
  if (flash) {
    give({
      id: 'flash',
      emoji: '⚡',
      title: 'Éclair',
      description: `${name(flash[0])} répond en ${Math.max(1, Math.round(-flash[1] / 1000))} s en moyenne.`,
      pid: flash[0],
    });
  }

  const artist = best((t) => (t.strokes > 0 ? t.strokes : null), taken);
  if (artist) {
    give({
      id: 'artist',
      emoji: '🎨',
      title: 'Pinceau fou',
      description: `${name(artist[0])} a donné ${artist[1]} coups de crayon.`,
      pid: artist[0],
    });
  }

  const slow = best((t) => (t.timed > 0 ? t.totalMs / t.timed : null), taken);
  if (slow) {
    give({
      id: 'slow',
      emoji: '🐌',
      title: 'Perfectionniste',
      description: `${name(slow[0])} prend son temps : ${Math.round(slow[1] / 1000)} s par étape.`,
      pid: slow[0],
    });
  }

  const talker = best((t) => (t.words > 0 ? t.words : null), taken);
  if (talker) {
    give({
      id: 'talker',
      emoji: '📜',
      title: 'Moulin à paroles',
      description: `${name(talker[0])} a écrit ${talker[1]} mots.`,
      pid: talker[0],
    });
  }

  const sleeper = best((t) => (t.missed > 0 ? t.missed : null), new Set());
  if (sleeper) {
    awards.push({
      id: 'sleeper',
      emoji: '😴',
      title: 'Marmotte',
      description: `${name(sleeper[0])} a laissé filer le chrono ${sleeper[1]} fois.`,
      pid: sleeper[0],
    });
  }

  if (stats.bookFidelity.length > 1) {
    const max = Math.max(...stats.bookFidelity);
    const min = Math.min(...stats.bookFidelity);
    const maxIndex = stats.bookFidelity.indexOf(max);
    const minIndex = stats.bookFidelity.indexOf(min);
    if (max >= 30) {
      awards.push({
        id: 'telepath',
        emoji: '🧠',
        title: 'Télépathes',
        description: `Le carnet de ${name(books[maxIndex].ownerPid)} est resté fidèle à ${max} %.`,
        bookIndex: maxIndex,
      });
    }
    if (minIndex !== maxIndex || max < 30) {
      awards.push({
        id: 'broken',
        emoji: '🌀',
        title: 'Téléphone cassé',
        description: `Le carnet de ${name(books[minIndex].ownerPid)} a complètement déraillé (${min} % de fidélité).`,
        bookIndex: minIndex,
      });
    }
  }

  return awards;
}
