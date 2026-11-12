import { WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '@/lib/game';
import { Spinner, cx } from './ui';

const LOGO_COLORS = ['text-coral', 'text-tangerine', 'text-sun', 'text-mint', 'text-sky', 'text-lilac', 'text-bubble'];

/** Logo : chaque lettre a sa couleur de feutre et penche un peu, comme écrite à la main. */
export function Logo({ size = 'md', className }: { size?: 'sm' | 'md' | 'xl'; className?: string }) {
  const sizes = { sm: 'text-2xl', md: 'text-3xl', xl: 'text-6xl sm:text-8xl' };
  return (
    <span className={cx('relative inline-block font-display font-bold tracking-tight select-none', sizes[size], className)} aria-label="Griboulade">
      {'Griboulade'.split('').map((letter, i) => (
        <span
          key={i}
          aria-hidden
          className={cx('inline-block', LOGO_COLORS[i % LOGO_COLORS.length])}
          style={{
            transform: `rotate(${[-6, 4, -3, 5, -4, 3, -5, 4, -3, 6][i]}deg) translateY(${[0, 3, -2, 2, -3, 1, 2, -2, 3, -1][i]}%)`,
            WebkitTextStroke: size === 'xl' ? '3px var(--color-ink)' : '1.5px var(--color-ink)',
            paintOrder: 'stroke fill',
            textShadow: size === 'xl' ? '5px 5px 0 var(--color-ink)' : '2px 2px 0 var(--color-ink)',
          }}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

/** Formes décoratives qui flottent doucement derrière le contenu. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <svg className="absolute top-[8%] left-[4%] w-16 animate-float text-coral sm:w-24" viewBox="0 0 100 100">
        <path d="M10 60 Q 25 20 40 55 T 70 50 T 92 40" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      </svg>
      <svg className="absolute top-[14%] right-[6%] w-12 animate-float-slow text-sun sm:w-20" viewBox="0 0 100 100">
        <path
          d="M50 6 61 38 95 38 67 58 78 92 50 71 22 92 33 58 5 38 39 38Z"
          fill="currentColor"
          stroke="var(--color-ink)"
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </svg>
      <svg className="absolute bottom-[12%] left-[7%] w-14 animate-float-slow text-sky sm:w-20" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="38" fill="currentColor" stroke="var(--color-ink)" strokeWidth="5" />
        <circle cx="38" cy="42" r="5" fill="var(--color-ink)" />
        <circle cx="62" cy="42" r="5" fill="var(--color-ink)" />
        <path d="M34 60 Q50 76 66 60" fill="none" stroke="var(--color-ink)" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <svg className="absolute right-[5%] bottom-[18%] w-14 animate-float text-mint sm:w-24" viewBox="0 0 100 100">
        <path d="M15 85 50 15 85 85Z" fill="currentColor" stroke="var(--color-ink)" strokeWidth="5" strokeLinejoin="round" />
      </svg>
      <svg className="absolute top-[46%] left-[-2%] hidden w-20 animate-float text-lilac lg:block" viewBox="0 0 100 100">
        <rect x="18" y="18" width="64" height="64" rx="14" fill="currentColor" stroke="var(--color-ink)" strokeWidth="5" transform="rotate(14 50 50)" />
      </svg>
      <svg className="absolute top-[52%] right-[-1%] hidden w-24 animate-float-slow text-bubble lg:block" viewBox="0 0 100 100">
        <path d="M12 50 Q 30 10 50 50 T 88 50" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function ConnectionBanner() {
  const status = useGame((s) => s.status);
  const waking = useGame((s) => s.waking);
  const inRoom = useGame((s) => s.sessionCode !== null);
  if (status === 'reconnecting' && inRoom) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex animate-toast items-center justify-center gap-2 border-b-[3px] border-ink bg-sun px-4 py-2 font-display font-semibold">
        <WifiOff className="size-5" /> Connexion perdue… reconnexion en cours <Spinner />
      </div>
    );
  }
  if (status === 'connecting' && waking) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex animate-toast items-center justify-center gap-2 border-b-[3px] border-ink bg-sky px-4 py-2 text-center font-display font-semibold">
        <Spinner /> Le serveur se réveille… ça peut prendre jusqu’à une minute ☕
      </div>
    );
  }
  return null;
}

const TOAST_STYLE: Record<string, string> = {
  join: 'bg-mint',
  leave: 'bg-paper-dark',
  host: 'bg-sun',
  info: 'bg-white',
  success: 'bg-mint',
  error: 'bg-coral text-white',
};

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'max-w-md animate-toast rounded-2xl border-[3px] border-ink px-4 py-2 text-center font-display font-semibold shadow-pop',
            TOAST_STYLE[t.kind] ?? 'bg-white',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Cadre commun à toutes les pages : décor, en-tête, notifications. */
export function Shell({
  children,
  right,
  wide,
  hideLogo,
}: {
  children: ReactNode;
  right?: ReactNode;
  wide?: boolean;
  hideLogo?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Backdrop />
      <ConnectionBanner />
      <Toasts />
      <header className={cx('mx-auto flex w-full items-center justify-between gap-3 px-4 pt-4 sm:px-6', wide ? 'max-w-7xl' : 'max-w-5xl')}>
        {hideLogo ? (
          <span />
        ) : (
          <Link to="/" className="transition-transform hover:-rotate-2 hover:scale-105" aria-label="Accueil">
            <Logo size="sm" />
          </Link>
        )}
        <div className="flex items-center gap-2">{right}</div>
      </header>
      <main className={cx('mx-auto w-full flex-1 px-4 pt-4 pb-10 sm:px-6', wide ? 'max-w-7xl' : 'max-w-5xl')}>{children}</main>
    </div>
  );
}
