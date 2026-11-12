import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import type { Avatar as AvatarData } from '@shared';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ───────────── Bouton ─────────────

const BUTTON_COLORS = {
  coral: 'bg-coral text-white',
  sun: 'bg-sun text-ink',
  mint: 'bg-mint text-ink',
  sky: 'bg-sky text-ink',
  lilac: 'bg-lilac text-ink',
  white: 'bg-white text-ink',
  ink: 'bg-ink text-white',
} as const;

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-sm rounded-xl border-2 shadow-pop-sm hover:shadow-pop',
  md: 'px-5 py-2.5 text-base rounded-2xl border-[3px] shadow-pop hover:shadow-pop-lg',
  lg: 'px-7 py-3.5 text-xl rounded-[22px] border-[3px] shadow-pop-lg hover:shadow-pop-xl',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  color?: keyof typeof BUTTON_COLORS;
  size?: keyof typeof BUTTON_SIZES;
  loading?: boolean;
  full?: boolean;
}

export function Button({ color = 'coral', size = 'md', loading, full, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 border-ink font-display font-semibold select-none',
        'transition-all duration-150 ease-out hover:-translate-x-0.5 hover:-translate-y-0.5',
        'active:translate-x-1 active:translate-y-1 active:shadow-none',
        'disabled:opacity-50 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0',
        BUTTON_COLORS[color],
        BUTTON_SIZES[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block size-4 animate-spin rounded-full border-[3px] border-current border-t-transparent', className)}
    />
  );
}

// ───────────── Carte ─────────────

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card p-5 sm:p-7', className)} {...rest}>
      {children}
    </div>
  );
}

// ───────────── Avatar ─────────────

const AVATAR_SIZES = {
  xs: 'size-7 text-sm border-2',
  sm: 'size-9 text-lg border-2',
  md: 'size-12 text-2xl border-[3px]',
  lg: 'size-16 text-4xl border-[3px]',
  xl: 'size-24 text-6xl border-4',
} as const;

export function Avatar({
  avatar,
  size = 'md',
  className,
  dimmed,
}: {
  avatar: AvatarData;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
  dimmed?: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full border-ink leading-none select-none',
        AVATAR_SIZES[size],
        dimmed && 'opacity-40 grayscale',
        className,
      )}
      style={{ backgroundColor: avatar.color }}
    >
      <span className="translate-y-[1px]">{avatar.emoji}</span>
    </span>
  );
}

// ───────────── Pastille ─────────────

const PILL_COLORS = {
  sun: 'bg-sun',
  mint: 'bg-mint',
  sky: 'bg-sky',
  lilac: 'bg-lilac',
  bubble: 'bg-bubble',
  coral: 'bg-coral text-white',
  white: 'bg-white',
  paper: 'bg-paper-dark',
} as const;

export function Pill({
  color = 'sun',
  className,
  children,
}: {
  color?: keyof typeof PILL_COLORS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 font-display text-sm font-semibold whitespace-nowrap',
        PILL_COLORS[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ───────────── Interrupteur ─────────────

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-8 w-14 shrink-0 rounded-full border-[3px] border-ink transition-colors duration-200',
        checked ? 'bg-mint' : 'bg-paper-dark',
        disabled && 'opacity-60',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 left-0.5 size-5 rounded-full border-2 border-ink bg-white transition-transform duration-200 ease-out',
          checked && 'translate-x-6',
        )}
      />
    </button>
  );
}

// ───────────── Choix segmenté ─────────────

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('inline-flex flex-wrap gap-1.5', className)} role="radiogroup">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cx(
              'rounded-xl border-2 border-ink px-3 py-1.5 font-display text-sm font-semibold transition-all duration-150',
              active ? 'bg-ink text-white shadow-none' : 'bg-white hover:-translate-y-0.5 hover:shadow-pop-sm',
              disabled && !active && 'opacity-50 hover:translate-y-0 hover:shadow-none',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
