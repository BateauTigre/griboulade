import confetti from 'canvas-confetti';
import { LogOut, RotateCcw, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RoomState } from '@shared';
import { GameSummary } from '@/components/GameSummary';
import { Button } from '@/components/ui';
import { galleryUrl } from '@/lib/config';
import { replayGame, succeeded, toast } from '@/lib/game';

const COLORS = ['#ff5d73', '#ffcf33', '#2fd9a3', '#45c4ff', '#a98bff', '#ff8fd0'];

/** Écran de fin : confettis, trophées, statistiques, galerie et bouton « Rejouer ». */
export function EndScreen({ room, onLeave }: { room: RoomState; onLeave: () => void }) {
  const game = room.result!;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fire = (originX: number, angle: number) =>
      confetti({ particleCount: 70, spread: 70, angle, origin: { x: originX, y: 0.75 }, colors: COLORS, scalar: 1.1 });
    fire(0.1, 60);
    fire(0.9, 120);
    const id = window.setTimeout(() => confetti({ particleCount: 120, spread: 110, origin: { y: 0.35 }, colors: COLORS }), 450);
    return () => window.clearTimeout(id);
  }, [game.id]);

  const share = async () => {
    const url = galleryUrl(game.id);
    try {
      if (navigator.share) await navigator.share({ title: 'Griboulade', text: 'Regarde nos chefs-d’œuvre 😂', url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Lien de la galerie copié !', 'success');
      }
    } catch {
      /* partage annulé */
    }
  };

  return (
    <div className="pb-28">
      <div className="mb-8 text-center">
        <h1 className="animate-pop-in text-5xl sm:text-6xl">C’est fini ! 🎉</h1>
        <p className="mt-2 animate-fade-up text-xl font-bold text-ink-soft">
          {game.stats.fidelity >= 60
            ? 'Vous vous comprenez étonnamment bien.'
            : game.stats.fidelity >= 25
              ? 'Il reste quelques morceaux des phrases de départ…'
              : 'Aucune phrase n’est ressortie indemne. Bravo.'}
        </p>
      </div>

      <GameSummary game={game} />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t-[3px] border-ink bg-paper/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3">
          {room.you.isHost ? (
            <Button
              size="lg"
              color="mint"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                succeeded(await replayGame());
                setBusy(false);
              }}
            >
              <RotateCcw className="size-6" /> Rejouer
            </Button>
          ) : (
            <span className="font-display font-semibold text-ink-soft">
              <span className="mr-1 inline-block animate-bounce-soft">👑</span> L’hôte peut relancer une partie
            </span>
          )}
          <Button color="sun" onClick={() => void share()}>
            <Share2 className="size-5" /> Partager la galerie
          </Button>
          <Button color="white" onClick={onLeave}>
            <LogOut className="size-5" /> Quitter
          </Button>
        </div>
      </div>
    </div>
  );
}
