import { useMemo, useState } from 'react';
import type { GameRecord, PlayerInfo } from '@shared';
import { PageCard } from './BookView';
import { Avatar, Card, cx } from './ui';

const AWARD_COLORS = ['bg-sun', 'bg-sky', 'bg-bubble', 'bg-mint', 'bg-lilac', 'bg-tangerine'];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} min ${String(s).padStart(2, '0')}` : `${s} s`;
}

/** Classement humoristique, statistiques et galerie des carnets d'une partie terminée. */
export function GameSummary({ game }: { game: GameRecord }) {
  const [selected, setSelected] = useState(0);
  const players = useMemo(() => new Map<string, PlayerInfo>(game.players.map((p) => [p.pid, p])), [game.players]);
  const book = game.books[Math.min(selected, game.books.length - 1)];

  const stats = [
    { emoji: '⏱️', label: 'Durée', value: formatTime(game.stats.durationSec) },
    { emoji: '🎨', label: 'Dessins', value: game.stats.drawings },
    { emoji: '💬', label: 'Phrases', value: game.stats.texts },
    { emoji: '🔤', label: 'Mots écrits', value: game.stats.words },
    { emoji: '😂', label: 'Réactions', value: game.stats.reactions },
    { emoji: '🎯', label: 'Fidélité moyenne', value: `${game.stats.fidelity} %` },
  ];

  return (
    <div className="flex flex-col gap-10">
      {game.awards.length > 0 && (
        <section aria-labelledby="titre-trophees">
          <h2 id="titre-trophees" className="mb-4 text-center text-3xl">
            🏅 Le classement (pas très sérieux)
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {game.awards.map((award, i) => {
              const winner = award.pid ? players.get(award.pid) : undefined;
              return (
                <li key={award.id} className="animate-pop-in" style={{ animationDelay: `${i * 110}ms` }}>
                  <div
                    className={cx(
                      'flex h-full items-center gap-3 rounded-3xl border-[3px] border-ink p-4 shadow-pop transition-transform duration-200 hover:-translate-y-1 hover:rotate-0',
                      AWARD_COLORS[i % AWARD_COLORS.length],
                      i % 2 ? 'rotate-1' : '-rotate-1',
                    )}
                  >
                    <span className="relative shrink-0">
                      {winner ? (
                        <Avatar avatar={winner.avatar} size="lg" />
                      ) : (
                        <span className="flex size-16 items-center justify-center rounded-full border-[3px] border-ink bg-white text-3xl">📓</span>
                      )}
                      <span className="absolute -right-2 -bottom-2 flex size-9 items-center justify-center rounded-full border-2 border-ink bg-white text-xl">
                        {award.emoji}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xl leading-tight">{award.title}</h3>
                      <p className="text-sm font-bold text-ink/75">{award.description}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="titre-stats">
        <h2 id="titre-stats" className="mb-4 text-center text-3xl">
          📊 La partie en chiffres
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <li key={s.label} className="rounded-2xl border-[3px] border-ink bg-white p-3 text-center shadow-pop-sm">
              <div className="text-2xl">{s.emoji}</div>
              <div className="font-display text-2xl font-bold">{s.value}</div>
              <div className="text-xs font-bold text-ink-soft">{s.label}</div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="titre-galerie">
        <h2 id="titre-galerie" className="mb-4 text-center text-3xl">
          📚 La galerie des carnets
        </h2>
        <div className="scrollbar-none -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 py-2 sm:flex-wrap sm:justify-center" role="tablist">
          {game.books.map((b, i) => {
            const owner = players.get(b.ownerPid);
            const active = i === selected;
            return (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(i)}
                className={cx(
                  'flex shrink-0 items-center gap-2 rounded-full border-[3px] border-ink py-1 pr-4 pl-1 font-display font-semibold transition-all duration-150',
                  active ? '-translate-y-1 bg-sun shadow-pop' : 'bg-white hover:-translate-y-0.5 hover:shadow-pop-sm',
                )}
              >
                {owner && <Avatar avatar={owner.avatar} size="sm" />}
                {owner?.name ?? `Carnet ${i + 1}`}
                <span className="rounded-full bg-ink/10 px-1.5 text-xs">{game.stats.bookFidelity[i] ?? 0} %</span>
              </button>
            );
          })}
        </div>
        {book && (
          <Card className="!p-4 sm:!p-8">
            <ol key={selected} className="mx-auto flex max-w-3xl animate-fade-up flex-col gap-7">
              {book.pages.map((page, i) => (
                <PageCard key={i} page={page} index={i} total={book.pages.length} author={players.get(page.authorPid)} showDownload />
              ))}
            </ol>
          </Card>
        )}
      </section>
    </div>
  );
}
