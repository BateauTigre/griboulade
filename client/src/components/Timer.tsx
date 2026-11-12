import { Infinity as InfinityIcon, Timer as TimerIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/game';
import { cx } from './ui';

/** Secondes restantes avant l'échéance (horloge du serveur), ou null s'il n'y a pas de limite. */
export function useCountdown(deadline: number | null): number | null {
  const offset = useGame((s) => s.clockOffset);
  const compute = () => (deadline === null ? null : Math.max(0, (deadline - (Date.now() + offset)) / 1000));
  const [left, setLeft] = useState<number | null>(compute);
  useEffect(() => {
    setLeft(compute());
    if (deadline === null) return;
    const id = window.setInterval(() => setLeft(compute()), 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, offset]);
  return left;
}

/** Appelle `onExpire` une seule fois quand le chrono de cette échéance tombe à zéro. */
export function useOnExpire(deadline: number | null, onExpire: () => void): void {
  const left = useCountdown(deadline);
  const firedFor = useRef<number | null>(null);
  const callback = useRef(onExpire);
  callback.current = onExpire;
  useEffect(() => {
    if (deadline !== null && left !== null && left <= 0 && firedFor.current !== deadline) {
      firedFor.current = deadline;
      callback.current();
    }
  }, [left, deadline]);
}

export function Timer({ deadline, duration }: { deadline: number | null; duration: number }) {
  const left = useCountdown(deadline);
  if (left === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border-[3px] border-ink bg-white px-3 py-1 font-display font-semibold">
        <InfinityIcon className="size-5" /> Sans limite
      </span>
    );
  }
  const seconds = Math.ceil(left);
  const urgent = seconds <= 10;
  const ratio = duration > 0 ? Math.min(1, left / duration) : 0;
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <span
      role="timer"
      aria-label={`${seconds} secondes restantes`}
      className={cx(
        'relative inline-flex min-w-[6.2rem] items-center justify-center gap-1.5 overflow-hidden rounded-full border-[3px] border-ink px-3 py-1 font-display text-lg font-bold tabular-nums',
        urgent ? 'animate-tick bg-white text-coral' : 'bg-white',
      )}
    >
      <span
        aria-hidden
        className={cx('absolute inset-y-0 left-0 transition-[width] duration-200 ease-linear', urgent ? 'bg-coral/25' : 'bg-mint/50')}
        style={{ width: `${ratio * 100}%` }}
      />
      <TimerIcon className="relative size-5" />
      <span className="relative">
        {mm}:{ss}
      </span>
    </span>
  );
}
