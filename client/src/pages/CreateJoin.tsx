import { ArrowLeft, Eye, PartyPopper, Rocket, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ROOM_CODE_LENGTH, type GameMode } from '@shared';
import { ProfileEditor } from '@/components/ProfileEditor';
import { Shell } from '@/components/Shell';
import { Button, Card, Toggle, cx } from '@/components/ui';
import { createRoom, joinRoom, succeeded, toast } from '@/lib/game';
import { getProfile } from '@/lib/storage';

function BackLink() {
  return (
    <Link to="/" className="mb-4 inline-flex items-center gap-1.5 font-display font-semibold text-ink-soft hover:text-ink">
      <ArrowLeft className="size-4" /> Accueil
    </Link>
  );
}

const MODES: Array<{ id: GameMode; icon: React.ReactNode; title: string; text: string; color: string }> = [
  { id: 'normal', icon: <PartyPopper className="size-6" />, title: 'Normal', text: 'On prend le temps de soigner ses œuvres.', color: 'bg-sky' },
  { id: 'fast', icon: <Zap className="size-6" />, title: 'Rapide', text: 'Chronos serrés, dessins paniqués, fous rires garantis.', color: 'bg-sun' },
];

/** Page « Créer un salon ». */
export function Create() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => getProfile().name);
  const [mode, setMode] = useState<GameMode>('normal');
  const [spectators, setSpectators] = useState(true);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name) return toast('Choisis d’abord un pseudo !', 'error');
    setLoading(true);
    const res = await createRoom({ mode, allowSpectators: spectators });
    setLoading(false);
    if (succeeded(res) && res.ok) navigate(`/salon/${res.code}`);
  };

  return (
    <Shell>
      <div className="mx-auto max-w-2xl">
        <BackLink />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Card className="animate-fade-up">
            <h1 className="mb-1 text-3xl sm:text-4xl">Créer un salon</h1>
            <p className="mb-6 font-semibold text-ink-soft">Tu seras l’hôte : tu règles la partie et tu la lances quand tout le monde est là.</p>

            <ProfileEditor onNameChange={setName} autoFocus={!name} />

            <h2 className="mt-7 mb-2 text-xl">Mode de jeu</h2>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Mode de jeu">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={cx(
                    'flex items-start gap-3 rounded-2xl border-[3px] border-ink p-4 text-left transition-all duration-150',
                    mode === m.id ? `${m.color} -translate-x-0.5 -translate-y-0.5 shadow-pop` : 'bg-white hover:-translate-y-0.5 hover:shadow-pop-sm',
                  )}
                >
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-white">{m.icon}</span>
                  <span>
                    <span className="block font-display text-lg font-semibold">{m.title}</span>
                    <span className="block text-sm font-semibold text-ink/70">{m.text}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-ink/30 px-4 py-3">
              <span>
                <span className="flex items-center gap-2 font-display font-semibold">
                  <Eye className="size-5" /> Autoriser les spectateurs
                </span>
                <span className="text-sm font-semibold text-ink-soft">Les retardataires peuvent regarder la partie.</span>
              </span>
              <Toggle checked={spectators} onChange={setSpectators} label="Autoriser les spectateurs" />
            </div>

            <p className="mt-4 text-sm font-semibold text-ink-soft">Durées, nombre de manches, thèmes… tout se règle ensuite dans la salle d’attente.</p>

            <Button type="submit" size="lg" full loading={loading} className="mt-6">
              <Rocket className="size-6" /> Créer mon salon
            </Button>
          </Card>
        </form>
      </div>
    </Shell>
  );
}

/** Page « Rejoindre un salon » (le code peut venir du lien d'invitation). */
export function Join() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const [name, setName] = useState(() => getProfile().name);
  const [code, setCode] = useState(() => (params.code ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH));
  const [spectator, setSpectator] = useState(false);
  const [loading, setLoading] = useState(false);
  const invited = Boolean(params.code);

  // Message transmis par la page du salon (salon introuvable, complet…).
  useEffect(() => {
    const error = (location.state as { error?: string } | null)?.error;
    if (error) toast(error, 'error');
  }, [location.state]);

  const submit = async () => {
    if (!name) return toast('Choisis d’abord un pseudo !', 'error');
    if (code.length !== ROOM_CODE_LENGTH) return toast(`Le code du salon fait ${ROOM_CODE_LENGTH} lettres.`, 'error');
    setLoading(true);
    const res = await joinRoom(code, spectator);
    setLoading(false);
    if (succeeded(res) && res.ok) navigate(`/salon/${res.code}`, { replace: true });
  };

  return (
    <Shell>
      <div className="mx-auto max-w-2xl">
        <BackLink />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Card className="animate-fade-up">
            <h1 className="mb-1 text-3xl sm:text-4xl">{invited ? 'Tu es invité ! 🎈' : 'Rejoindre un salon'}</h1>
            <p className="mb-6 font-semibold text-ink-soft">
              {invited ? 'Choisis ton pseudo et ton avatar, puis entre dans le salon.' : 'Demande le code à l’hôte du salon : il est affiché dans sa salle d’attente.'}
            </p>

            <label className="mb-6 flex flex-col gap-1">
              <span className="label">Code du salon</span>
              <input
                className="field text-center font-display !text-4xl !font-bold tracking-[0.4em] uppercase placeholder:tracking-[0.4em]"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH))}
                placeholder={'•'.repeat(ROOM_CODE_LENGTH)}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Code du salon"
                autoFocus={!invited && Boolean(name)}
              />
            </label>

            <ProfileEditor onNameChange={setName} autoFocus={invited && !name} />

            <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-ink/30 px-4 py-3">
              <span>
                <span className="flex items-center gap-2 font-display font-semibold">
                  <Eye className="size-5" /> Juste regarder
                </span>
                <span className="text-sm font-semibold text-ink-soft">Rejoindre en spectateur, sans écrire ni dessiner.</span>
              </span>
              <Toggle checked={spectator} onChange={setSpectator} label="Rejoindre en spectateur" />
            </div>

            <Button type="submit" size="lg" color="sun" full loading={loading} className="mt-6">
              Entrer dans le salon
            </Button>
          </Card>
        </form>
      </div>
    </Shell>
  );
}
