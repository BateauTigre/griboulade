import { Download, ImageOff } from 'lucide-react';
import type { Page, PlayerInfo } from '@shared';
import { drawingUrl } from '@/lib/config';
import { Avatar, Pill, cx } from './ui';

const UNKNOWN: PlayerInfo = { pid: '?', name: 'Joueur parti', avatar: { emoji: '👻', color: '#f6e7c8' } };

/** Cadre d'un dessin (ou d'un dessin vide). */
export function DrawingFrame({ id, className, alt = 'Dessin' }: { id: string | null | undefined; className?: string; alt?: string }) {
  return (
    <div className={cx('aspect-[4/3] w-full overflow-hidden rounded-2xl border-[3px] border-ink bg-white', className)}>
      {id ? (
        <img src={drawingUrl(id)} alt={alt} className="size-full object-contain" draggable={false} />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 bg-paper text-ink-soft">
          <ImageOff className="size-10" />
          <span className="font-display font-semibold">Feuille blanche…</span>
        </div>
      )}
    </div>
  );
}

function Reactions({ reactions }: { reactions?: Record<string, number> }) {
  const entries = Object.entries(reactions ?? {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {entries.map(([emoji, count]) => (
        <span key={emoji} className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-sm font-bold">
          {emoji} {count}
        </span>
      ))}
    </div>
  );
}

/**
 * Une page de carnet : phrase (bulle) ou dessin (cadre), avec le pseudo de son auteur.
 * Les pages alternent à gauche et à droite, comme une conversation qui déraille.
 */
export function PageCard({
  page,
  index,
  total,
  author,
  animate,
  showDownload,
}: {
  page: Page;
  index: number;
  total: number;
  author: PlayerInfo | undefined;
  animate?: boolean;
  showDownload?: boolean;
}) {
  const who = author ?? UNKNOWN;
  const right = index % 2 === 1;
  const isFirst = index === 0;
  const isLast = index === total - 1 && total > 1;
  const tilt = ['-rotate-1', 'rotate-1', '-rotate-[0.6deg]', 'rotate-[0.8deg]'][index % 4];

  return (
    <li
      className={cx(
        'flex w-full gap-3',
        right ? 'flex-row-reverse' : 'flex-row',
        animate && (right ? 'animate-slide-right' : 'animate-slide-left'),
      )}
    >
      <Avatar avatar={who.avatar} size="md" className="mt-6 shadow-pop-sm" />
      <div className={cx('flex min-w-0 max-w-[min(100%,34rem)] flex-1 flex-col', right ? 'items-end' : 'items-start')}>
        <div className={cx('mb-1 flex flex-wrap items-center gap-2', right && 'flex-row-reverse')}>
          <span className="font-display text-lg font-semibold">{who.name}</span>
          <span className="text-sm font-bold text-ink-soft">
            {isFirst ? 'a écrit' : page.kind === 'drawing' ? 'a dessiné' : 'a cru voir'}
          </span>
          {isFirst && <Pill color="sun">Phrase de départ</Pill>}
          {isLast && page.kind === 'text' && <Pill color="mint">Phrase finale</Pill>}
          {page.auto && <Pill color="paper">😴 Chrono écoulé</Pill>}
        </div>

        {page.kind === 'text' ? (
          <p
            className={cx(
              'w-fit max-w-full rounded-3xl border-[3px] border-ink px-5 py-3 font-display text-xl leading-snug font-medium break-words shadow-pop sm:text-2xl',
              tilt,
              right ? 'rounded-tr-md' : 'rounded-tl-md',
              isFirst ? 'bg-sun' : isLast ? 'bg-mint' : 'bg-white',
            )}
          >
            {page.text}
          </p>
        ) : (
          <div className={cx('group relative w-full max-w-md bg-white p-2 pb-3 shadow-pop', 'rounded-3xl border-[3px] border-ink', tilt)}>
            <DrawingFrame id={page.drawingId} alt={`Dessin de ${who.name}`} className="border-2" />
            {showDownload && page.drawingId && (
              <a
                href={drawingUrl(page.drawingId)}
                download={`griboulade-${who.name}.png`}
                target="_blank"
                rel="noreferrer"
                title="Télécharger ce dessin"
                aria-label="Télécharger ce dessin"
                className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full border-[3px] border-ink bg-white opacity-0 shadow-pop-sm transition-all group-hover:opacity-100 hover:scale-110 focus-visible:opacity-100 max-sm:opacity-100"
              >
                <Download className="size-5" />
              </a>
            )}
          </div>
        )}
        <Reactions reactions={page.reactions} />
      </div>
    </li>
  );
}
