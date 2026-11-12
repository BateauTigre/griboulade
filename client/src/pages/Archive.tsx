import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GameRecord } from '@shared';
import { GameSummary } from '@/components/GameSummary';
import { Shell } from '@/components/Shell';
import { Button, Card, Spinner } from '@/components/ui';
import { apiUrl } from '@/lib/config';
import { forgetGame, getHistory, type HistoryEntry } from '@/lib/storage';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

/** Historique des parties jouées depuis ce navigateur. */
export function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>(getHistory);

  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 font-display font-semibold text-ink-soft hover:text-ink">
          <ArrowLeft className="size-4" /> Accueil
        </Link>
        <h1 className="mb-1 text-4xl">Mes parties</h1>
        <p className="mb-6 font-bold text-ink-soft">Les parties jouées depuis cet appareil. Clique pour rouvrir la galerie des carnets.</p>

        {entries.length === 0 ? (
          <Card className="animate-fade-up text-center">
            <div className="text-6xl">🗂️</div>
            <h2 className="mt-3 text-2xl">Aucune partie pour l’instant</h2>
            <p className="mt-1 mb-5 font-bold text-ink-soft">Termine une partie et elle apparaîtra ici.</p>
            <Link to="/creer">
              <Button>
                Créer un salon <ArrowRight className="size-5" />
              </Button>
            </Link>
          </Card>
        ) : (
          <ul className="flex flex-col gap-4">
            {entries.map((entry, i) => (
              <li key={entry.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                <div className="card flex items-center gap-3 p-4 transition-transform duration-150 hover:-translate-y-1 sm:p-5">
                  <Link to={`/galerie/${entry.id}`} className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-ink-soft">{dateFormat.format(entry.date)}</div>
                    <div className="truncate font-display text-xl font-semibold">« {entry.firstPhrase || '…'} »</div>
                    <div className="mt-1 truncate text-sm font-bold text-ink-soft">
                      {entry.players.join(', ')} · {entry.drawings} dessin{entry.drawings > 1 ? 's' : ''}
                    </div>
                  </Link>
                  <button
                    type="button"
                    title="Retirer de mon historique"
                    aria-label="Retirer de mon historique"
                    onClick={() => {
                      forgetGame(entry.id);
                      setEntries(getHistory());
                    }}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-white transition-all hover:scale-110 hover:bg-coral hover:text-white"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

/** Galerie d'une partie terminée, accessible par lien (et depuis l'historique). */
export function Gallery() {
  const { id = '' } = useParams();
  const [game, setGame] = useState<GameRecord | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setGame(null);
    setError('');
    fetch(apiUrl(`/api/games/${encodeURIComponent(id)}`))
      .then(async (res) => {
        const body = (await res.json()) as GameRecord & { error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Partie introuvable.');
        if (!cancelled) setGame(body);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message === 'Failed to fetch' ? 'Serveur injoignable. Réessaie dans un instant.' : err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Shell>
      {error ? (
        <Card className="mx-auto mt-10 max-w-md animate-pop-in text-center">
          <div className="text-6xl">🕳️</div>
          <h1 className="mt-3 text-2xl">{error}</h1>
          <p className="mt-2 mb-5 font-bold text-ink-soft">Les parties sont conservées un temps limité.</p>
          <Link to="/">
            <Button color="sun">Retour à l’accueil</Button>
          </Link>
        </Card>
      ) : !game ? (
        <div className="mt-16 flex flex-col items-center gap-3 font-display text-xl font-semibold">
          <Spinner className="!size-10 !border-[5px] text-coral" /> Ouverture des carnets…
        </div>
      ) : (
        <>
          <div className="mb-8 text-center">
            <h1 className="animate-pop-in text-4xl sm:text-5xl">Galerie des carnets</h1>
            <p className="mt-2 font-bold text-ink-soft">
              Partie du {dateFormat.format(game.endedAt)} · {game.players.map((p) => p.name).join(', ')}
            </p>
          </div>
          <GameSummary game={game} />
          <div className="mt-10 flex justify-center">
            <Link to="/creer">
              <Button size="lg">
                Lancer ma propre partie <ArrowRight className="size-6" />
              </Button>
            </Link>
          </div>
        </>
      )}
    </Shell>
  );
}
