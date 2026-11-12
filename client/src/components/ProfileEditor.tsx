import { Dices } from 'lucide-react';
import { useState } from 'react';
import { AVATAR_COLORS, AVATAR_EMOJIS, MAX_NAME_LENGTH, type Avatar as AvatarData } from '@shared';
import { getProfile, saveProfile } from '@/lib/storage';
import { Avatar, cx } from './ui';

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/** Choix du pseudo et de l'avatar. Enregistré dans le navigateur à chaque modification. */
export function ProfileEditor({ onNameChange, autoFocus }: { onNameChange?: (name: string) => void; autoFocus?: boolean }) {
  const [name, setName] = useState(() => getProfile().name);
  const [avatar, setAvatar] = useState<AvatarData>(() => getProfile().avatar);

  const updateAvatar = (next: AvatarData) => {
    setAvatar(next);
    saveProfile({ avatar: next });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar avatar={avatar} size="xl" className="animate-wiggle shadow-pop" />
          <button
            type="button"
            title="Avatar au hasard"
            aria-label="Avatar au hasard"
            onClick={() => updateAvatar({ emoji: pick(AVATAR_EMOJIS), color: pick(AVATAR_COLORS) })}
            className="absolute -right-2 -bottom-2 flex size-10 items-center justify-center rounded-full border-[3px] border-ink bg-white shadow-pop-sm transition-transform hover:scale-110 hover:rotate-12 active:scale-95"
          >
            <Dices className="size-5" />
          </button>
        </div>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="label">Ton pseudo</span>
          <input
            className="field"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Ex. Capitaine Crayon"
            autoComplete="nickname"
            autoFocus={autoFocus}
            enterKeyHint="done"
            onChange={(e) => {
              setName(e.target.value);
              saveProfile({ name: e.target.value.trim() });
              onNameChange?.(e.target.value.trim());
            }}
          />
        </label>
      </div>

      <div>
        <span className="label">Ton avatar</span>
        <div className="scrollbar-none mt-1 -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1.5 sm:grid sm:grid-cols-[repeat(16,minmax(0,1fr))] sm:overflow-visible">
          {AVATAR_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Avatar ${emoji}`}
              aria-pressed={avatar.emoji === emoji}
              onClick={() => updateAvatar({ ...avatar, emoji })}
              className={cx(
                'flex aspect-square size-10 shrink-0 items-center justify-center rounded-xl border-2 text-xl transition-all duration-150 sm:size-auto',
                avatar.emoji === emoji
                  ? 'scale-110 border-ink bg-sun shadow-pop-sm'
                  : 'border-transparent bg-paper-dark/60 hover:scale-110 hover:border-ink hover:bg-white',
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {AVATAR_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Couleur ${color}`}
              aria-pressed={avatar.color === color}
              onClick={() => updateAvatar({ ...avatar, color })}
              className={cx(
                'size-8 rounded-full border-[3px] border-ink transition-transform duration-150 hover:scale-110',
                avatar.color === color && 'scale-110 shadow-pop-sm ring-4 ring-ink/15',
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
