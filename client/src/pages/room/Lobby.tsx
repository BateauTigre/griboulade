import { Check, Copy, Crown, Eye, Link2, Play, Share2, UserMinus, UserPlus, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { MIN_PLAYERS, type PlayerView, type RoomState } from '@shared';
import { Avatar, Button, Card, Pill, cx } from '@/components/ui';
import { inviteUrl } from '@/lib/config';
import { kickPlayer, setSpectator, startGame, succeeded, toast } from '@/lib/game';
import { SettingsPanel } from './SettingsPanel';

async function copy(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(message, 'success');
  } catch {
    toast('Copie impossible : sélectionne le texte à la main.', 'error');
  }
}

function PlayerSlot({ player, room, index }: { player: PlayerView; room: RoomState; index: number }) {
  const isYou = player.pid === room.you.pid;
  return (
    <li
      className={cx(
        'group relative flex animate-pop-in items-center gap-3 rounded-2xl border-[3px] border-ink bg-white p-2.5 pr-3 transition-transform duration-150 hover:-translate-y-0.5',
        isYou && 'bg-sun/40',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <Avatar avatar={player.avatar} dimmed={!player.connected} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-lg leading-tight font-semibold">{player.name}</div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs font-bold text-ink-soft">
          {player.isHost && (
            <span className="flex items-center gap-0.5 text-tangerine">
              <Crown className="size-3.5" /> Hôte
            </span>
          )}
          {isYou && <span>C’est toi</span>}
          {!player.connected && (
            <span className="flex items-center gap-0.5 text-coral">
              <WifiOff className="size-3.5" /> Déconnecté
            </span>
          )}
        </div>
      </div>
      {room.you.isHost && !isYou && (
        <button
          type="button"
          title={`Exclure ${player.name}`}
          aria-label={`Exclure ${player.name}`}
          onClick={() => void kickPlayer(player.pid).then(succeeded)}
          className="flex size-9 items-center justify-center rounded-full border-2 border-ink bg-white opacity-60 transition-all hover:scale-110 hover:bg-coral hover:text-white hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <UserMinus className="size-4" />
        </button>
      )}
    </li>
  );
}

/** Salle d'attente : code d'invitation, joueurs connectés en direct, paramètres, lancement. */
export function Lobby({ room }: { room: RoomState }) {
  const [starting, setStarting] = useState(false);
  const players = room.players.filter((p) => !p.spectator);
  const spectators = room.players.filter((p) => p.spectator);
  const ready = players.filter((p) => p.connected).length;
  const missing = Math.max(0, MIN_PLAYERS - ready);
  const emptySlots = Math.max(0, Math.min(room.settings.maxPlayers, 12) - players.length);
  const link = inviteUrl(room.code);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Griboulade', text: `Rejoins ma partie de Griboulade ! Code : ${room.code}`, url: link });
        return;
      } catch {
        /* partage annulé : on copie à la place */
      }
    }
    await copy(link, 'Lien d’invitation copié !');
  };

  const start = async () => {
    setStarting(true);
    succeeded(await startGame());
    setStarting(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        {/* Invitation */}
        <Card className="animate-fade-up bg-sky">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="text-center sm:text-left">
              <div className="font-display font-semibold">Code du salon</div>
              <button
                type="button"
                onClick={() => void copy(room.code, 'Code copié !')}
                title="Copier le code"
                className="group flex items-center gap-3 font-display text-5xl font-bold tracking-[0.25em] transition-transform hover:scale-105 sm:text-6xl"
                style={{ textShadow: '3px 3px 0 #fff' }}
              >
                {room.code}
                <Copy className="size-6 opacity-50 transition-opacity group-hover:opacity-100" />
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button color="white" onClick={() => void copy(link, 'Lien d’invitation copié !')}>
                <Link2 className="size-5" /> Copier le lien
              </Button>
              <Button color="sun" onClick={() => void share()}>
                <Share2 className="size-5" /> Inviter
              </Button>
            </div>
          </div>
        </Card>

        {/* Joueurs */}
        <Card className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl">
              Joueurs{' '}
              <span className="text-ink-soft">
                {players.length}/{room.settings.maxPlayers}
              </span>
            </h2>
            {room.settings.allowSpectators || room.you.spectator ? (
              <Button
                size="sm"
                color="white"
                onClick={() => void setSpectator(!room.you.spectator).then(succeeded)}
              >
                {room.you.spectator ? (
                  <>
                    <UserPlus className="size-4" /> Devenir joueur
                  </>
                ) : (
                  <>
                    <Eye className="size-4" /> Passer spectateur
                  </>
                )}
              </Button>
            ) : null}
          </div>

          <ul className="grid gap-2.5 sm:grid-cols-2">
            {players.map((p, i) => (
              <PlayerSlot key={p.pid} player={p} room={room} index={i} />
            ))}
            {Array.from({ length: emptySlots }, (_, i) => (
              <li
                key={`vide-${i}`}
                className={cx(
                  'flex items-center gap-3 rounded-2xl border-[3px] border-dashed border-ink/25 p-2.5 font-display font-semibold text-ink/35',
                  i >= 2 && 'max-sm:hidden',
                )}
              >
                <span className="flex size-12 items-center justify-center rounded-full border-[3px] border-dashed border-ink/25 text-xl">?</span>
                Place libre
              </li>
            ))}
          </ul>

          {spectators.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 flex items-center gap-2 text-lg text-ink-soft">
                <Eye className="size-5" /> Spectateurs ({spectators.length})
              </h3>
              <ul className="flex flex-wrap gap-2">
                {spectators.map((p) => (
                  <li key={p.pid} className="group flex items-center gap-2 rounded-full border-2 border-ink bg-white py-1 pr-3 pl-1 font-display font-semibold">
                    <Avatar avatar={p.avatar} size="xs" dimmed={!p.connected} />
                    {p.name}
                    {p.isHost && <Crown className="size-4 text-tangerine" />}
                    {room.you.isHost && p.pid !== room.you.pid && (
                      <button type="button" aria-label={`Exclure ${p.name}`} title={`Exclure ${p.name}`} onClick={() => void kickPlayer(p.pid).then(succeeded)} className="hover:text-coral">
                        <UserMinus className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Lancement */}
        <div className="animate-fade-up" style={{ animationDelay: '160ms' }}>
          {room.you.isHost ? (
            <div className="flex flex-col items-center gap-2">
              <Button size="lg" color="mint" full disabled={missing > 0} loading={starting} onClick={() => void start()}>
                <Play className="size-6 fill-current" /> Lancer la partie
              </Button>
              <p className="text-center font-bold text-ink-soft">
                {missing > 0
                  ? `Il manque encore ${missing} joueur${missing > 1 ? 's' : ''} (minimum ${MIN_PLAYERS}).`
                  : 'Tout le monde est là ? C’est parti !'}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 rounded-3xl border-[3px] border-dashed border-ink/30 bg-white/60 px-5 py-4 text-center font-display text-lg font-semibold">
              <span className="animate-bounce-soft text-2xl">⏳</span>
              {missing > 0
                ? `On attend encore ${missing} joueur${missing > 1 ? 's' : ''}…`
                : 'En attente de l’hôte pour lancer la partie…'}
              {ready >= MIN_PLAYERS && (
                <Pill color="mint">
                  <Check className="size-4" /> Prêts
                </Pill>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
        <SettingsPanel room={room} />
      </div>
    </div>
  );
}
