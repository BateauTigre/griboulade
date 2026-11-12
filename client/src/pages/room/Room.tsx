import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '@/components/Shell';
import { Button, Card, Pill, Spinner } from '@/components/ui';
import { joinRoom, leaveRoom, useGame } from '@/lib/game';
import { getProfile } from '@/lib/storage';
import { EndScreen } from './EndScreen';
import { Lobby } from './Lobby';
import { Play } from './Play';
import { Reveal } from './Reveal';

const CLOSED_MESSAGES = {
  kicked: { emoji: '🚪', title: 'Tu as été exclu du salon', text: 'L’hôte t’a retiré de la partie.' },
  replaced: { emoji: '🪟', title: 'Salon ouvert ailleurs', text: 'Tu as ouvert ce salon dans un autre onglet ou sur un autre appareil.' },
  closed: { emoji: '🔒', title: 'Salon fermé', text: 'Ce salon a été fermé.' },
  lost: { emoji: '🫥', title: 'Ce salon n’existe plus', text: 'Il a été fermé après une trop longue absence de ses joueurs.' },
} as const;

/** Page d'un salon : salle d'attente, jeu, révélation ou fin de partie selon la phase. */
export function Room() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const room = useGame((s) => s.room);
  const closed = useGame((s) => s.closed);
  const waking = useGame((s) => s.waking);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const roomCode = code.toUpperCase();

  // Arrivée directe sur l'URL du salon (lien, rechargement de page) : on (re)prend sa place.
  useEffect(() => {
    const state = useGame.getState();
    if (state.room?.code === roomCode || state.closed) return;
    if (!getProfile().name) {
      navigate(`/rejoindre/${roomCode}`, { replace: true });
      return;
    }
    let cancelled = false;
    void joinRoom(roomCode).then((res) => {
      if (!cancelled && !res.ok) navigate(`/rejoindre/${roomCode}`, { replace: true, state: { error: res.error } });
    });
    return () => {
      cancelled = true;
    };
  }, [roomCode, navigate]);

  // Avertit avant de fermer l'onglet en pleine partie.
  const inGame = room !== null && room.phase !== 'lobby' && room.phase !== 'end';
  useEffect(() => {
    if (!inGame) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [inGame]);

  const leave = async () => {
    await leaveRoom();
    navigate('/');
  };

  if (closed) {
    const msg = CLOSED_MESSAGES[closed];
    return (
      <Shell>
        <Card className="mx-auto mt-10 max-w-md animate-pop-in text-center">
          <div className="text-6xl">{msg.emoji}</div>
          <h1 className="mt-3 text-3xl">{msg.title}</h1>
          <p className="mt-2 mb-6 font-bold text-ink-soft">{msg.text}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {closed === 'replaced' && (
              <Button color="mint" onClick={() => void joinRoom(roomCode)}>
                Reprendre ici
              </Button>
            )}
            <Button color="sun" onClick={() => void leave()}>
              Retour à l’accueil
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (!room || room.code !== roomCode) {
    return (
      <Shell>
        <Card className="mx-auto mt-10 flex max-w-md animate-fade-up flex-col items-center gap-3 text-center">
          <Spinner className="!size-10 !border-[5px] text-coral" />
          <h1 className="text-2xl">Connexion au salon {roomCode}…</h1>
          {waking && <p className="font-bold text-ink-soft">Le serveur gratuit se réveille, ça peut prendre jusqu’à une minute.</p>}
        </Card>
      </Shell>
    );
  }

  return (
    <Shell
      wide={room.phase === 'lobby'}
      right={
        <>
          <Pill color="white" className="!text-base tracking-widest">
            {room.code}
          </Pill>
          {confirmLeave ? (
            <>
              <Button size="sm" color="coral" onClick={() => void leave()}>
                Oui, quitter
              </Button>
              <Button size="sm" color="white" onClick={() => setConfirmLeave(false)}>
                Rester
              </Button>
            </>
          ) : (
            <Button size="sm" color="white" onClick={() => (inGame ? setConfirmLeave(true) : void leave())} aria-label="Quitter le salon">
              <LogOut className="size-4" /> <span className="max-sm:hidden">Quitter</span>
            </Button>
          )}
        </>
      }
    >
      {room.phase === 'lobby' && <Lobby room={room} />}
      {(room.phase === 'write' || room.phase === 'draw' || room.phase === 'guess') && <Play room={room} />}
      {room.phase === 'reveal' && room.reveal && <Reveal room={room} />}
      {room.phase === 'end' && room.result && <EndScreen room={room} onLeave={() => void leave()} />}
    </Shell>
  );
}
