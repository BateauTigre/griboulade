import { BookOpen, ChevronRight, PartyPopper } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { REACTION_EMOJIS, type PlayerInfo, type RoomState } from '@shared';
import { PageCard } from '@/components/BookView';
import { Avatar, Button, Pill, cx } from '@/components/ui';
import { revealNext, sendReaction, succeeded, useGame } from '@/lib/game';

/** Émojis qui s'envolent quand quelqu'un réagit (visibles par tout le salon). */
function FloatingReactions({ players }: { players: Map<string, PlayerInfo> }) {
  const reactions = useGame((s) => s.reactions);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {reactions.map((r) => (
        <div key={r.id} className="absolute bottom-24 flex animate-reaction flex-col items-center" style={{ left: `${r.x}%` }}>
          <span className="text-5xl drop-shadow-[2px_2px_0_var(--color-ink)]">{r.emoji}</span>
          <span className="mt-1 rounded-full border-2 border-ink bg-white px-2 text-xs font-bold whitespace-nowrap">
            {players.get(r.pid)?.name ?? ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Révélation finale : l'hôte fait défiler, tout le monde découvre en même temps. */
export function Reveal({ room }: { room: RoomState }) {
  const reveal = room.reveal!;
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const players = useMemo(() => new Map<string, PlayerInfo>(room.players.map((p) => [p.pid, p])), [room.players]);
  const owner = players.get(reveal.ownerPid);
  const bookDone = reveal.step >= reveal.totalSteps;
  const lastBook = reveal.bookIndex >= reveal.totalBooks - 1;

  const next = async () => {
    if (busy) return;
    setBusy(true);
    succeeded(await revealNext());
    setBusy(false);
  };

  // Chaque nouvelle page est amenée à l'écran.
  useEffect(() => {
    const id = window.setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 80);
    return () => window.clearTimeout(id);
  }, [reveal.bookIndex, reveal.step]);

  // L'hôte peut avancer au clavier (Espace, Entrée ou flèche droite).
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    if (!room.you.isHost) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLButtonElement) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        void nextRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [room.you.isHost]);

  return (
    <div className="mx-auto max-w-3xl pb-44">
      <FloatingReactions players={players} />

      {/* Couverture du carnet */}
      <div key={reveal.bookIndex} className="mb-8 animate-pop-in rounded-3xl border-[3px] border-ink bg-lilac p-5 text-center shadow-pop-lg">
        <div className="mb-2 flex items-center justify-center gap-2">
          <Pill color="white">
            <BookOpen className="size-4" /> Carnet {reveal.bookIndex + 1} / {reveal.totalBooks}
          </Pill>
        </div>
        <div className="flex items-center justify-center gap-3">
          {owner && <Avatar avatar={owner.avatar} size="lg" className="animate-wiggle shadow-pop-sm" />}
          <h2 className="text-3xl sm:text-4xl">Le carnet de {owner?.name ?? '???'}</h2>
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-label={`Page ${reveal.step} sur ${reveal.totalSteps}`}>
          {Array.from({ length: reveal.totalSteps }, (_, i) => (
            <span
              key={i}
              className={cx('size-3 rounded-full border-2 border-ink transition-colors duration-300', i < reveal.step ? 'bg-ink' : 'bg-white')}
            />
          ))}
        </div>
      </div>

      <ol className="flex flex-col gap-7">
        {reveal.pages.map((page, i) => (
          <PageCard
            key={`${reveal.bookIndex}-${i}`}
            page={page}
            index={i}
            total={reveal.totalSteps}
            author={players.get(page.authorPid)}
            animate
          />
        ))}
      </ol>

      {bookDone && (
        <div className="mt-8 animate-pop-in text-center font-display text-xl font-semibold text-ink-soft">
          — Fin du carnet de {owner?.name ?? '???'} 📕 —
        </div>
      )}
      <div ref={bottom} className="h-4" />

      {/* Barre du bas : réactions pour tous, défilement pour l'hôte */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-[3px] border-ink bg-paper/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="flex w-full max-w-sm justify-between gap-1 sm:w-auto sm:max-w-none sm:gap-1.5" role="group" aria-label="Réagir">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Réagir ${emoji}`}
                onClick={() => sendReaction(emoji)}
                className="flex aspect-square w-full max-w-11 min-w-0 items-center justify-center rounded-full border-[3px] border-ink bg-white text-xl shadow-pop-sm sm:w-11 sm:text-2xl transition-transform duration-100 hover:-translate-y-1 hover:scale-110 active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
          {room.you.isHost ? (
            <Button size="lg" color={bookDone ? (lastBook ? 'coral' : 'sun') : 'mint'} loading={busy} onClick={() => void next()} className="w-full sm:w-auto">
              {!bookDone ? (
                <>
                  Révéler la suite <ChevronRight className="size-6" />
                </>
              ) : lastBook ? (
                <>
                  <PartyPopper className="size-6" /> Voir les résultats
                </>
              ) : (
                <>
                  Carnet suivant <ChevronRight className="size-6" />
                </>
              )}
            </Button>
          ) : (
            <span className="font-display font-semibold text-ink-soft">
              <span className="mr-1 inline-block animate-bounce-soft">👑</span>
              {room.players.find((p) => p.isHost)?.name ?? 'L’hôte'} fait défiler les carnets…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
