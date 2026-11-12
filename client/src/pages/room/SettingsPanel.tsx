import { Lock, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  THEMES,
  TIME_OPTIONS,
  computeTotalRounds,
  kindOfRound,
  type GameSettings,
  type RoomState,
} from '@shared';
import { Card, Segmented, Toggle, cx } from '@/components/ui';
import { succeeded, updateSettings } from '@/lib/game';

export function formatDuration(seconds: number): string {
  if (seconds === 0) return 'Sans limite';
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s}` : `${m} min`;
}

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="font-display font-semibold">{title}</div>
        {hint && <div className="text-sm font-semibold text-ink-soft">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: number;
  options: Array<{ value: number; label: string }>;
  onChange: (value: number) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx(
        'rounded-xl border-[3px] border-ink bg-white py-1.5 pr-8 pl-3 font-display font-semibold transition-shadow',
        'hover:shadow-pop-sm focus:shadow-pop-sm focus:outline-none disabled:opacity-100 disabled:hover:shadow-none',
        disabled && 'appearance-none !pr-3',
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Page « Paramètres du jeu » : modifiable par l'hôte, visible en lecture seule par les autres. */
export function SettingsPanel({ room }: { room: RoomState }) {
  const s = room.settings;
  const editable = room.you.isHost;
  const players = room.players.filter((p) => !p.spectator).length;
  const change = (patch: Partial<GameSettings>) => {
    if (editable) void updateSettings(patch).then(succeeded);
  };

  const effectivePlayers = Math.max(players, MIN_PLAYERS);
  const totalRounds = computeTotalRounds(effectivePlayers, s);
  const endsWithDrawing = kindOfRound(totalRounds) === 'draw';
  const roundOptions = [
    { value: 0, label: 'Automatique' },
    ...Array.from({ length: MAX_PLAYERS - 2 }, (_, i) => ({ value: i + 2, label: `${i + 2} étapes` })),
  ];
  const timeOptions = (list: readonly number[], current: number) =>
    [...new Set([...list, current])].map((v) => ({ value: v, label: formatDuration(v) }));

  return (
    <Card className="flex flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-2xl">
          <Settings2 className="size-6 shrink-0" /> Paramètres du jeu
        </h2>
        {!editable && (
          <span className="flex items-center gap-1 text-sm font-bold text-ink-soft">
            <Lock className="size-4" /> Réglés par l’hôte
          </span>
        )}
      </div>

      <div className="divide-y-2 divide-dashed divide-ink/15">
        <Row title="Mode de jeu" hint={s.mode === 'fast' ? 'Chronos courts, parties éclair.' : 'Le rythme classique.'}>
          <Segmented
            value={s.mode}
            disabled={!editable}
            onChange={(mode) => change({ mode })}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: '⚡ Rapide' },
            ]}
          />
        </Row>

        <Row
          title="Nombre de manches"
          hint={
            <>
              {totalRounds} étapes après la phrase de départ avec {effectivePlayers} joueurs
              {endsWithDrawing ? ' (fin sur un dessin)' : ''}.
            </>
          }
        >
          <Select label="Nombre de manches" value={s.rounds} options={roundOptions} disabled={!editable} onChange={(rounds) => change({ rounds })} />
        </Row>

        <Row title="Durée d’écriture">
          <Select label="Durée d’écriture" value={s.writeTime} options={timeOptions(TIME_OPTIONS.write, s.writeTime)} disabled={!editable} onChange={(writeTime) => change({ writeTime })} />
        </Row>
        <Row title="Durée de dessin">
          <Select label="Durée de dessin" value={s.drawTime} options={timeOptions(TIME_OPTIONS.draw, s.drawTime)} disabled={!editable} onChange={(drawTime) => change({ drawTime })} />
        </Row>
        <Row title="Durée de devinette">
          <Select label="Durée de devinette" value={s.guessTime} options={timeOptions(TIME_OPTIONS.guess, s.guessTime)} disabled={!editable} onChange={(guessTime) => change({ guessTime })} />
        </Row>

        <Row title="Joueurs maximum">
          <Select
            label="Joueurs maximum"
            value={s.maxPlayers}
            disabled={!editable}
            onChange={(maxPlayers) => change({ maxPlayers })}
            options={Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS)
              .filter((n) => n >= players)
              .map((n) => ({ value: n, label: `${n} joueurs` }))}
          />
        </Row>

        <div>
          <Row title="Thèmes de phrases" hint="Un thème imposé pour inspirer tout le monde.">
            <Toggle checked={s.themesEnabled} onChange={(themesEnabled) => change({ themesEnabled })} disabled={!editable} label="Thèmes de phrases" />
          </Row>
          {s.themesEnabled && (
            <div className="flex animate-fade-up flex-wrap gap-1.5 pb-3">
              {[{ id: 'surprise', label: 'Surprise', emoji: '🎲' }, ...THEMES].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={!editable}
                  aria-pressed={s.theme === t.id}
                  onClick={() => change({ theme: t.id })}
                  className={cx(
                    'rounded-full border-2 border-ink px-3 py-1 font-display text-sm font-semibold transition-all duration-150',
                    s.theme === t.id ? 'bg-lilac shadow-pop-sm' : 'bg-white',
                    editable ? 'hover:-translate-y-0.5' : s.theme !== t.id && 'opacity-45',
                  )}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Row title="Spectateurs" hint="Les retardataires peuvent regarder.">
          <Toggle checked={s.allowSpectators} onChange={(allowSpectators) => change({ allowSpectators })} disabled={!editable} label="Autoriser les spectateurs" />
        </Row>
        <Row title="Classement humoristique" hint="Des trophées pour rire en fin de partie.">
          <Toggle checked={s.funnyAwards} onChange={(funnyAwards) => change({ funnyAwards })} disabled={!editable} label="Classement humoristique" />
        </Row>
      </div>
    </Card>
  );
}
