import { ArrowRight, History, LogIn, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RoomSummary } from '@shared';
import { MAX_PLAYERS, MIN_PLAYERS } from '@shared';
import { Shell, Logo } from '@/components/Shell';
import { Button, Card } from '@/components/ui';
import { apiUrl } from '@/lib/config';
import { getHistory, getLastRoom, setLastRoom } from '@/lib/storage';

const STEPS = [
  { emoji: '✍️', title: 'Écris', text: 'Chacun invente une phrase drôle, bizarre ou absurde.', color: 'bg-sun', tilt: '-rotate-2' },
  { emoji: '🎨', title: 'Dessine', text: 'Tu reçois la phrase d’un autre… à toi de la dessiner !', color: 'bg-sky', tilt: 'rotate-1' },
  { emoji: '🤔', title: 'Devine', text: 'Un autre joueur décrit ce qu’il croit voir sur ton dessin.', color: 'bg-bubble', tilt: '-rotate-1' },
  { emoji: '🎉', title: 'Rigole', text: 'On révèle chaque carnet : la phrase a-t-elle survécu ?', color: 'bg-mint', tilt: 'rotate-2' },
];

export function Home() {
  const navigate = useNavigate();
  const [resumeCode, setResumeCode] = useState('');
  const hasHistory = getHistory().length > 0;

  // Si on était dans un salon encore ouvert, on propose d'y retourner.
  useEffect(() => {
    const code = getLastRoom();
    if (!code) return;
    let cancelled = false;
    fetch(apiUrl(`/api/rooms/${code}`))
      .then((r) => r.json() as Promise<RoomSummary>)
      .then((summary) => {
        if (cancelled) return;
        if (summary.exists) setResumeCode(code);
        else setLastRoom('');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Shell
      hideLogo
      right={
        <Link to="/historique">
          <Button color="white" size="sm">
            <History className="size-4" /> Mes parties
          </Button>
        </Link>
      }
    >
      <section className="flex flex-col items-center pt-4 text-center sm:pt-10">
        <span className="mb-5 inline-flex animate-fade-up items-center gap-2 rounded-full border-[3px] border-ink bg-white px-4 py-1.5 font-display font-semibold shadow-pop-sm">
          <Sparkles className="size-4 text-tangerine" /> Gratuit · sans inscription · de {MIN_PLAYERS} à {MAX_PLAYERS} joueurs
        </span>
        <h1 className="animate-pop-in">
          <Logo size="xl" />
        </h1>
        <p className="mt-6 max-w-xl animate-fade-up text-xl font-bold text-ink-soft sm:text-2xl" style={{ animationDelay: '120ms' }}>
          Le téléphone arabe, mais avec des dessins.
          <br className="hidden sm:block" /> Tu écris, ils dessinent, ça dérape. 🖍️
        </p>

        <div className="mt-8 flex w-full max-w-md animate-fade-up flex-col gap-4 sm:max-w-none sm:flex-row sm:justify-center" style={{ animationDelay: '220ms' }}>
          <Button size="lg" color="coral" onClick={() => navigate('/creer')} className="sm:min-w-64">
            Créer un salon <ArrowRight className="size-6" />
          </Button>
          <Button size="lg" color="sun" onClick={() => navigate('/rejoindre')} className="sm:min-w-64">
            <LogIn className="size-6" /> Rejoindre un salon
          </Button>
        </div>

        {resumeCode && (
          <button
            type="button"
            onClick={() => navigate(`/salon/${resumeCode}`)}
            className="mt-5 animate-bounce-soft rounded-full border-[3px] border-ink bg-mint px-5 py-2 font-display font-semibold shadow-pop transition-transform hover:scale-105"
          >
            ↩ Retourner dans le salon <span className="tracking-widest">{resumeCode}</span>
          </button>
        )}
      </section>

      <section className="mt-14 sm:mt-20" aria-labelledby="comment-jouer">
        <h2 id="comment-jouer" className="mb-6 text-center text-3xl sm:text-4xl">
          Comment on joue ?
        </h2>
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="animate-fade-up" style={{ animationDelay: `${300 + i * 90}ms` }}>
              <Card className={`h-full ${step.tilt} transition-transform duration-200 hover:rotate-0 hover:-translate-y-1`}>
                <div className="flex items-center gap-3">
                  <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl border-[3px] border-ink text-3xl ${step.color}`}>
                    {step.emoji}
                  </span>
                  <h3 className="text-2xl whitespace-nowrap lg:text-[1.35rem] xl:text-2xl">
                    <span className="text-ink-soft">{i + 1}.</span> {step.title}
                  </h3>
                </div>
                <p className="mt-3 text-lg font-semibold text-ink-soft">{step.text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {hasHistory && (
        <p className="mt-10 text-center font-bold text-ink-soft">
          Envie de revoir vos chefs-d’œuvre ?{' '}
          <Link to="/historique" className="text-ink underline decoration-coral decoration-4 underline-offset-4 hover:decoration-sun">
            Ouvrir l’historique des parties
          </Link>
        </p>
      )}
    </Shell>
  );
}
